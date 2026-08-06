-- 0069_perfil_de_instagram.sql — el contacto de Instagram deja de ser «Contacto sin nombre».
--
-- EL HUECO
--
-- La bandeja ya sabe qué pintar: `titulo ?? contacts.nombre ?? contacts.username`.
-- El problema es que `username` no lo escribe nadie, así que la cadena cae hasta
-- el final y todas las tarjetas de Instagram salen como «Contacto sin nombre».
--
-- POR QUÉ NO SE ARREGLA EN LA INGESTA
--
-- Porque el dato NO VIENE. Comprobado el 6 de agosto de 2026 sobre los cuerpos
-- crudos guardados: un `messaging[]` de Instagram trae `sender.id` y nada más.
-- WhatsApp sí manda `contacts[].profile.name`, y por eso esos contactos sí
-- tienen nombre desde el primer mensaje. La diferencia no es del código de
-- Kavea, es de lo que cada canal decide mandar.
--
-- El perfil hay que ir a buscarlo: `GET /{igsid}?fields=username,profile_pic` con
-- el Page Access Token, que es un permiso que Kavea YA TIENE
-- (`instagram_manage_messages`). Medido contra la cuenta real: devuelve las dos
-- cosas.
--
-- POR QUÉ UN TRABAJADOR APARTE Y NO DENTRO DEL NORMALIZADOR
--
-- El normalizador vive con 1,2 s de presupuesto de CPU y un cursor que se mueve
-- en la misma transacción que confirma el tramo. Meter ahí una llamada de red y
-- una descarga de imagen por contacto nuevo es añadir una espera ajena a un bucle
-- afinado para ceder la fila a tiempo, y un fallo de Meta pasaría a poder atascar
-- la ingesta. La ingesta no puede depender de que la Graph API conteste.

-- ---------------------------------------------------------------------------
-- 1. Dónde vive la foto
-- ---------------------------------------------------------------------------
-- LA URL DE META NO SE GUARDA, SE GUARDA LA FOTO.
--
-- `profile_pic` llega como una URL de `lookaside.fbsbx.com` firmada y con
-- caducidad, y el TTL real es uno de los inciertos abiertos de la bitácora §3.5:
-- nadie lo ha medido. Guardar ese enlace es sembrar avatares rotos con retardo,
-- y el día que se rompan lo harán todos a la vez y sin ningún error en los
-- registros. Se descarga el objeto una vez y se guarda en un bucket propio.
--
-- Privado, como los otros dos. La foto de perfil de la persona que le escribe a
-- un cliente no puede estar en una URL adivinable.
insert into storage.buckets (id, name, public, file_size_limit)
values ('perfiles', 'perfiles', false, 2097152)   -- 2 MB: un avatar no llega a 100 KB
on conflict (id) do nothing;

-- La organización es el PRIMER SEGMENTO de la ruta, igual que en `salientes`, y
-- eso es lo que separa a un cliente de otro dentro del bucket.
create policy perfiles_leer on storage.objects
  for select to authenticated
  using (
    bucket_id = 'perfiles'
    and (storage.foldername(name))[1] in (
      select m.organization_id::text from public.organization_members m
       where m.user_id = (select auth.uid())
    )
  );

-- Sin política de escritura, y es deliberado: la única vía que sube aquí es el
-- trabajador de borde con el rol de servicio. Una foto de perfil no la edita un
-- operador desde el navegador, y no habiendo política, no hay forma de intentarlo.

-- ---------------------------------------------------------------------------
-- 2. La ruta del objeto, en el contacto
-- ---------------------------------------------------------------------------
-- Columna nueva y no reutilizar `profile_pic_url`, aunque tenga el nombre que
-- parece pedirlo: esa columna es de EDICIÓN HUMANA —tiene UPDATE concedido a
-- `authenticated` desde 0026 para la ficha— y contiene una URL. Aquí va una ruta
-- dentro de un bucket. Meter dos cosas distintas en la misma columna obliga a
-- todos los lectores a adivinar cuál de las dos les ha tocado.
alter table public.contacts
  add column if not exists foto_ruta text;

comment on column public.contacts.foto_ruta is
  'Ruta del avatar dentro del bucket privado `perfiles`, con la organización como '
  'primer segmento. NO es una URL: se sirve firmada y de vida corta. La foto se '
  'copia de Meta a propósito, porque la URL de lookaside caduca en un plazo que '
  'nadie ha medido.';

-- ---------------------------------------------------------------------------
-- 3. Qué contactos les falta el perfil
-- ---------------------------------------------------------------------------
-- `perfil_leido_en` es el freno. Se sella en CUALQUIER intento contestado, no
-- solo en los que encuentran algo: sin eso, un IGSID que Meta ya no resuelve
-- —cuenta borrada, bloqueo— se pediría cada dos minutos para siempre.
create or replace function private.contactos_sin_perfil(p_limite integer default 20)
returns table (
  contact_id uuid, organization_id uuid, scoped_id text, meta_connection_id uuid
)
language sql stable security definer set search_path = ''
as $$
  -- DOS ORDENACIONES, y por eso hay subconsulta.
  --
  -- `distinct on (c.id)` obliga a que el `order by` empiece por `c.id`, y lo que
  -- se quiere ordenar para el `limit` es por antigüedad: los contactos que
  -- llevan más tiempo sin nombre son los que más se han visto sin él. Sin la
  -- subconsulta hay que elegir una de las dos.
  --
  -- El distinct existe porque una organización con DOS conexiones de Instagram
  -- —hoy no existe, mañana sí— haría que el join devolviera el mismo contacto
  -- dos veces, y el trabajador gastaría dos llamadas a Meta para escribir lo
  -- mismo. El `ch.created_at` de dentro fija cuál de las dos gana, para que la
  -- elección sea estable entre invocaciones y no la decida el planificador.
  select s.contact_id, s.organization_id, s.scoped_id, s.meta_connection_id
    from (
      select distinct on (c.id)
             c.id             as contact_id,
             c.organization_id,
             i.scoped_id,
             ch.meta_connection_id,
             c.created_at
        from public.contacts c
        join public.contact_identities i
          on i.contact_id = c.id
         and i.canal = 'instagram'
        join public.channels ch
          on ch.organization_id = c.organization_id
         and ch.canal = 'instagram'
       where c.username is null
         and c.perfil_leido_en is null
         -- Un contacto ya fusionado en otro no se enriquece: el que manda es el
         -- superviviente, y escribir en el absorbido no lo ve nadie.
         and c.fusionado_en is null
         -- Y un canal apagado no se consulta: si el operador pausó Instagram,
         -- Kavea no tiene por qué seguir pidiéndole perfiles a Meta por ahí.
         and ch.activo
       order by c.id, ch.created_at
    ) s
   order by s.created_at
   limit p_limite
$$;

revoke execute on function private.contactos_sin_perfil(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Guardar lo que Meta contestó
-- ---------------------------------------------------------------------------
-- `nombre` NO SE TOCA, y esto es deliberado. La interfaz ya cae a `username`
-- sola, así que el efecto que se busca —ver «@fulanito» en vez de «Contacto sin
-- nombre»— se consigue igual. Y `nombre` sigue significando «alguien nombró a
-- esta persona», que es lo que distingue un dato humano de un identificador. Si
-- se rellenara con el handle, `posibles_duplicados` empezaría a proponer
-- fusiones por parecido de handles, y una fusión errónea enseña la conversación
-- de un cliente bajo el nombre de otro.
--
-- El `name` que manda Meta tampoco se usa. En la cuenta real devolvió «IA |
-- Automatización | Sistemas | Tráfico Web», que es el campo de nombre de
-- Instagram usado como reclamo. El handle identifica mejor.
create or replace function private.guardar_perfil_instagram(
  p_contact uuid, p_username text default null, p_foto_ruta text default null
)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.contacts
     set username        = coalesce(nullif(btrim(p_username), ''), username),
         foto_ruta       = coalesce(nullif(btrim(p_foto_ruta), ''), foto_ruta),
         perfil_leido_en = now(),
         updated_at      = now()
   where id = p_contact
$$;

revoke execute on function private.guardar_perfil_instagram(uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. El reloj
-- ---------------------------------------------------------------------------
create or replace function private.disparar_enriquecimiento()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_key text;
begin
  v_url := private.cfg('functions_url');
  v_key := private.cfg('service_key');
  if v_url is null or v_key is null then return; end if;

  perform net.http_post(
    url     := v_url || '/enriquecer-perfiles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

revoke execute on function private.disparar_enriquecimiento() from public, anon, authenticated;

-- Cada dos minutos. No es urgente —el mensaje ya está en la bandeja— y con la
-- mayoría de invocaciones sin nada que hacer, el coste es una consulta por
-- índice que devuelve cero filas.
select cron.schedule(
  'kavea-enriquecer-perfiles', '*/2 * * * *',
  $$ select private.disparar_enriquecimiento(); $$
);

-- El índice que sirve la búsqueda de arriba. Sin él son dos escaneos de tabla
-- cada dos minutos, para siempre, sobre la tabla que más va a crecer.
create index if not exists contacts_sin_perfil_idx
  on public.contacts (organization_id, created_at)
  where username is null and perfil_leido_en is null and fusionado_en is null;
