-- 0087_registro_self_service.sql — que un cliente pueda darse de alta sin Boosty.
--
-- HASTA HOY NO SE PODIA, Y ES LO QUE FALTA PARA VENDER POR SUSCRIPCION.
--
-- `crear_espacio` exige `es_staff()`: la ejecuta el equipo de Boosty desde el
-- panel interno y deja una invitacion para el primer propietario. Es correcta
-- para el alta conducida y NO SIRVE para el autoservicio, porque el que se
-- registra no es staff de nadie.
--
-- `registrarse` es la otra puerta. Mismo destino —una organizacion con su
-- subdominio, su embudo sembrado por el trigger `organizations_embudo` y un
-- propietario que puede entrar— y distinto guardian:
--
--   crear_espacio  → lo llama STAFF, deja una INVITACION por correo.
--   registrarse    → lo llama EL PROPIO USUARIO, y queda propietario en el acto.
--
-- No se toca `crear_espacio`. Debilitar su comprobacion de staff para que
-- sirviera a los dos casos es exactamente como se cuelan los agujeros: una
-- funcion con dos amos acaba autorizando al que no debe.

-- ---------------------------------------------------------------------------
-- 1. Los subdominios de la plataforma no se pueden registrar.
-- ---------------------------------------------------------------------------
-- El CHECK de la 0001 es el guardian de verdad, y es el que hay que ampliar
-- ANTES de abrir el registro al publico: hasta ahora la lista solo la probaba
-- gente de Boosty escribiendo a mano. `cuenta` es el host sin inquilino que
-- sirve el registro y el retorno de OAuth de Meta; si alguien registrara un
-- espacio con ese slug, se lo comeria.
--
-- Se añaden tambien los que describen a la propia plataforma y que nadie
-- deberia poder apropiarse el primer dia que esto sea publico.
alter table public.organizations drop constraint organizations_slug_reservado;

alter table public.organizations add constraint organizations_slug_reservado
  check (slug not in (
    'www','admin','app','api','hooks','webhooks','mail','smtp','send','status',
    'docs','static','assets','cdn','blog','soporte','support','ayuda','help',
    'dev','staging','preview','test','demo','kavea',
    -- Añadidos el 23-ago-2026, al abrir el registro:
    'cuenta','conectar','registro','entrar','panel','facturacion','billing',
    'seguridad','security','legal','privacidad','terminos','info','contacto',
    'ftp','ns','ns1','ns2','mx','autodiscover','_domainkey'
  ));

-- ---------------------------------------------------------------------------
-- 2. El alta.
-- ---------------------------------------------------------------------------
create or replace function public.registrarse(
  p_nombre text,
  p_slug   text,
  p_huso   text default 'America/Caracas'
)
returns table (organizacion_id uuid, slug text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_confirmado timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;

  -- EL CORREO CONFIRMADO NO ES BUROCRACIA. Sin esto, cualquiera reserva
  -- subdominios con correos que no existen, y el primero que se lleve
  -- «coca-cola» lo hara el dia que esto sea publico. Supabase ya guarda la
  -- marca; aqui solo se exige.
  select u.email_confirmed_at into v_confirmado from auth.users u where u.id = v_uid;
  if v_confirmado is null then
    raise exception 'Confirma tu correo antes de crear el espacio.' using errcode = '42501';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'El nombre es demasiado corto.' using errcode = '22023';
  end if;

  -- El mismo patron que el CHECK de la 0001, dicho aqui para poder devolver una
  -- frase util en vez de un error de restriccion.
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$' then
    raise exception 'El subdominio va en minúsculas y números, sin acentos ni puntos, con guiones solo en medio, y entre 3 y 32 caracteres.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    raise exception 'Ya hay un espacio con ese subdominio.' using errcode = '23505';
  end if;

  -- UNA ORGANIZACION POR PERSONA, de momento. No es una regla de producto sino
  -- un freno de abuso: sin el, una cuenta confirmada puede sentarse encima de
  -- cien subdominios en un minuto. El dia que un cliente legitimo necesite dos
  -- espacios, se sube el tope aqui y se deja escrito por que.
  if exists (
    select 1 from public.organization_members m
     where m.user_id = v_uid and m.rol = 'owner'
  ) then
    raise exception 'Esta cuenta ya tiene un espacio. Escríbenos si necesitas otro.'
      using errcode = '42501';
  end if;

  -- El trigger `organizations_embudo` siembra el embudo por defecto, y
  -- `organizations_zona` valida el huso contra pg_timezone_names. No se
  -- duplica ninguno de los dos aqui.
  insert into public.organizations (nombre, slug, zona_horaria)
  values (v_nombre, v_slug, coalesce(nullif(btrim(p_huso), ''), 'America/Caracas'))
  returning id into v_id;

  -- Y el propietario EN LA MISMA TRANSACCION. La leccion de la 0059: un espacio
  -- sin duenio no es un espacio a medias, es un espacio inutil, y el alta dice
  -- «hecho» igual. Aqui no hay invitacion que valga porque el duenio ya esta
  -- delante y con sesion abierta.
  insert into public.organization_members (organization_id, user_id, rol)
  values (v_id, v_uid, 'owner');

  perform private.registrar_actividad(
    v_id, 'espacio.creado', 'usuario', null, v_uid,
    jsonb_build_object('nombre', v_nombre, 'slug', v_slug, 'via', 'autoservicio'));

  return query select v_id, v_slug;
end $$;

revoke all on function public.registrarse(text, text, text) from public, anon;
grant execute on function public.registrarse(text, text, text) to authenticated;

comment on function public.registrarse(text, text, text) is
  'Alta self-service: el usuario con sesion y correo confirmado crea su espacio '
  'y queda propietario en el acto. La via conducida por Boosty es crear_espacio, '
  'que exige staff y deja invitacion; no se mezclan.';

-- ---------------------------------------------------------------------------
-- 3. Comprobar si un subdominio esta libre, sin filtrar el listado.
-- ---------------------------------------------------------------------------
-- El formulario necesita decir «ese ya esta cogido» mientras se escribe. Se
-- devuelve un booleano y nada mas: con un `select` sobre `organizations` se
-- podria enumerar la lista de clientes de Kavea, que es justo lo que RLS
-- impide. Aqui la respuesta es si o no, sobre un slug que el que pregunta ya
-- conoce porque lo acaba de teclear.
create or replace function public.subdominio_libre(p_slug text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select lower(btrim(coalesce(p_slug, ''))) ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$'
     and not exists (
       select 1 from public.organizations o
        where o.slug = lower(btrim(p_slug))
     )
     and lower(btrim(p_slug)) not in (
       'www','admin','app','api','hooks','webhooks','mail','smtp','send','status',
       'docs','static','assets','cdn','blog','soporte','support','ayuda','help',
       'dev','staging','preview','test','demo','kavea',
       'cuenta','conectar','registro','entrar','panel','facturacion','billing',
       'seguridad','security','legal','privacidad','terminos','info','contacto',
       'ftp','ns','ns1','ns2','mx','autodiscover','_domainkey'
     );
$$;

revoke all on function public.subdominio_libre(text) from public, anon;
grant execute on function public.subdominio_libre(text) to authenticated;
