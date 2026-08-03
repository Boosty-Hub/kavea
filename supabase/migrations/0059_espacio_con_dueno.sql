-- 0059_espacio_con_dueno.sql — un espacio recién creado tiene que poder abrirlo alguien.
--
-- EL HUECO, Y POR QUÉ NO SE VIO ANTES
--
-- 0058 crea la organización y siembra su embudo. Y ahí se acaba: nadie es
-- miembro. `invitar_miembro` exige `puede(org, 'equipo')`, que exige ser
-- miembro, y quien crea el espacio desde el panel es STAFF DE BOOSTY, que no lo
-- es de ninguna organización de cliente.
--
-- Resultado: se podía crear un espacio perfectamente sembrado, con su Página
-- conectada y sus webhooks suscritos, **al que no podía entrar nadie**. Y no
-- fallaba nada: el alta decía «hecho». El fallo solo aparece al día siguiente,
-- cuando el cliente intenta entrar.
--
-- El alta y la invitación van juntas y en la misma transacción porque son la
-- misma cosa. Un espacio sin dueño no es un espacio a medias: es un espacio
-- inútil, y dejarlo creado es peor que no haber empezado.

-- El tipo de retorno cambia, así que hay que soltarla antes: `create or replace`
-- no puede cambiar la forma de lo que devuelve.
drop function if exists public.crear_espacio(text, text, text);

create or replace function public.crear_espacio(
  p_nombre text,
  p_slug   text,
  p_huso   text default 'America/Caracas',
  p_correo text default null
)
returns table (organizacion_id uuid, invitacion_id uuid, token text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_token text; v_inv uuid;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre es demasiado corto.' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$' then
    raise exception 'El subdominio va en minúsculas, sin acentos ni puntos, y con guiones en medio.'
      using errcode = '22023';
  end if;
  if v_slug in ('admin', 'www', 'app', 'api', 'kavea', 'staff', 'soporte', 'support') then
    raise exception 'Ese subdominio está reservado.' using errcode = '22023';
  end if;
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise exception 'Ya hay un espacio con ese subdominio.' using errcode = '23505';
  end if;
  if v_correo <> '' and v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Ese correo no tiene forma de correo.' using errcode = '22023';
  end if;

  insert into public.organizations (nombre, slug, zona_horaria)
  values (btrim(p_nombre), v_slug, coalesce(nullif(btrim(p_huso), ''), 'America/Caracas'))
  returning id into v_id;

  perform private.registrar_actividad(
    v_id, 'espacio.creado', 'usuario', null, (select auth.uid()),
    jsonb_build_object('nombre', btrim(p_nombre), 'slug', v_slug));

  -- La invitación del primer usuario, como PROPIETARIO. No se reutiliza
  -- `invitar_miembro`: esa función comprueba pertenencia, y aquí quien invita es
  -- staff. Duplicar el `insert` es el precio de no debilitar aquella
  -- comprobación, que protege el caso de todos los días.
  if v_correo <> '' then
    -- Se genera y se resume EXACTAMENTE igual que en `invitar_miembro`: dos
    -- uuid concatenados y `sha256` del built-in, no `digest` de pgcrypto. Con
    -- `search_path = ''` una función de otro esquema no se resuelve, y un hash
    -- distinto haría que `invitacion_por_token` no reconociera jamás el enlace.
    v_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');
    insert into public.invitaciones
      (organization_id, correo, rol, token_sha, invitado_por, expira_en)
    values (v_id, v_correo, 'owner', encode(sha256(v_token::bytea), 'hex'),
            (select auth.uid()), now() + interval '7 days')
    returning id into v_inv;

    perform private.registrar_actividad(
      v_id, 'equipo.invitado', 'usuario', null, (select auth.uid()),
      jsonb_build_object('correo', v_correo, 'rol', 'owner'));
  end if;

  return query select v_id, v_inv, v_token;
end $$;

revoke execute on function public.crear_espacio(text, text, text, text) from public, anon;

comment on function public.crear_espacio(text, text, text, text) is
  'Crea el espacio Y la invitacion del primer propietario, en la misma '
  'transaccion. Un espacio sin duenio no es un espacio a medias: es un espacio '
  'al que no puede entrar nadie, y el alta decia "hecho".';

-- ---------------------------------------------------------------------------
-- Las conexiones de cada espacio, para el panel
-- ---------------------------------------------------------------------------
-- Salud dice que algo está en rojo y hasta ahora no había forma de actuar: el
-- panel de canales vive en el subdominio del cliente, donde el staff no entra.
-- Enseñar un problema sin ofrecer el gesto que lo arregla es la mitad de una
-- herramienta.
create or replace function public.panel_conexiones()
returns table (
  meta_connection_id uuid,
  organization_id    uuid,
  page_name          text,
  page_id            text,
  ig_username        text,
  en_verde           bigint,
  en_rojo            bigint,
  sin_saber          bigint,
  bloqueada          boolean,
  ultima_pasada      timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  return query
  select c.id, c.organization_id, c.page_name, c.page_id, c.ig_username,
         (count(v.*) filter (where v.resultado = 'ok'))::bigint,
         (count(v.*) filter (where v.resultado = 'fallo'))::bigint,
         (count(v.*) filter (where v.resultado in ('no_verificable', 'sin_probar')))::bigint,
         coalesce(bool_or(v.resultado = 'fallo' and v.bloquea), false),
         max(v.verificado_en)
    from public.meta_connections c
    left join public.verificaciones v on v.meta_connection_id = c.id
   group by c.id, c.organization_id, c.page_name, c.page_id, c.ig_username
   order by c.page_name;
end $$;

revoke execute on function public.panel_conexiones() from public, anon;
