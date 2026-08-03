-- 0060_solicitudes_de_demo.sql — quien pide una demo desde la web pública.
--
-- POR QUÉ UNA DEMO Y NO UNA CUENTA GRATUITA
--
-- Un registro público no puede conectar un canal todavía: App Review está sin
-- enviar, y sin Tech Provider solo conectan las Páginas asignadas al Business
-- Manager de Boosty. Una cuenta free hoy sería una bandeja vacía con un botón de
-- «conectar Instagram» que no funciona, y eso no se lee como «todavía no»: se
-- lee como «esto está roto». Decidido el 2 de agosto de 2026: se pide demo, y la
-- cuenta gratuita llega cuando llegue Tech Provider.
--
-- LA TABLA ES ESCRIBIBLE POR ANÓNIMOS Y NO SE PUEDE LEER
--
-- Es la primera superficie de Kavea que acepta escritura sin sesión. Las
-- consecuencias se asumen a propósito:
--
--   - Escribir: sí, por RPC, con validación y con tope. Es lo que hace un
--     formulario público.
--   - Leer: NUNCA para anon. Sin política de select, ni una fila sale de aquí.
--     Una lista de solicitudes es una lista de negocios y sus correos.
--   - Actualizar y borrar: nadie, ni anon ni authenticated. El estado lo mueve
--     el staff por RPC.

create table public.solicitudes (
  id          uuid primary key default gen_random_uuid(),

  nombre      text not null check (length(btrim(nombre)) between 2 and 80),
  correo      text not null check (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  negocio     text check (length(btrim(negocio)) <= 120),
  telefono    text check (length(btrim(telefono)) <= 40),
  -- Los canales que ya usa. Es el dato que dice si se le puede atender hoy: si
  -- solo pide WhatsApp, la respuesta honesta es distinta.
  canales     text[] not null default '{}',
  mensaje     text check (length(btrim(mensaje)) <= 1000),

  -- De dónde viene. Sin cookies ni rastreo: solo lo que el propio enlace trae.
  origen      text check (length(origen) <= 120),

  estado      text not null default 'nueva'
    check (estado in ('nueva', 'contactada', 'demo_hecha', 'cliente', 'descartada')),
  nota        text,
  atendida_por uuid references auth.users(id) on delete set null,
  atendida_en  timestamptz,

  created_at  timestamptz not null default now()
);

create index solicitudes_pendientes_idx on public.solicitudes (created_at desc)
  where estado = 'nueva';
create index solicitudes_correo_idx on public.solicitudes (lower(correo), created_at desc);

alter table public.solicitudes enable row level security;
alter table public.solicitudes force  row level security;

-- CERO POLÍTICAS. Ni select, ni insert, ni nada: se entra solo por los RPC de
-- abajo. Una política de insert para `anon` sería una puerta abierta a la tabla
-- entera sin la validación ni el tope.

comment on table public.solicitudes is
  'Peticiones de demo de la web publica. Escribible solo por pedir_demo(), '
  'legible solo por el panel interno. Anon no puede leer ni una fila: una lista '
  'de solicitudes es una lista de negocios con sus correos.';

-- ---------------------------------------------------------------------------
-- Pedir una demo
-- ---------------------------------------------------------------------------
-- El único RPC de todo el proyecto con permiso para `anon`. Por eso lleva encima
-- todo lo que un formulario público necesita y ninguna otra función tiene.
create or replace function public.pedir_demo(
  p_nombre   text,
  p_correo   text,
  p_negocio  text default null,
  p_telefono text default null,
  p_canales  text[] default '{}',
  p_mensaje  text default null,
  p_origen   text default null,
  p_trampa   text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_correo text := lower(btrim(coalesce(p_correo, '')));
begin
  -- 1. La trampa. Un campo invisible que una persona no rellena nunca y un bot
  --    rellena siempre. Se devuelve ÉXITO, no error: decirle a un bot que ha
  --    fallado es enseñarle a arreglarlo.
  if coalesce(btrim(p_trampa), '') <> '' then
    return;
  end if;

  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Falta el nombre.' using errcode = '22023';
  end if;
  if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Ese correo no parece un correo.' using errcode = '22023';
  end if;

  -- 2. El mismo correo, una vez cada diez minutos. Pulsar dos veces el botón no
  --    puede crear dos solicitudes: quien las atiende vería dos negocios donde
  --    hay uno.
  if exists (
    select 1 from public.solicitudes
     where lower(correo) = v_correo and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- 3. Tope global. Sin IP a mano dentro de una función de base, esto es lo que
  --    impide que una tarde de bots deje la tabla inservible. Cien por hora es
  --    muy por encima de cualquier día bueno de verdad, y muy por debajo de lo
  --    que hace falta para ahogarla.
  if (select count(*) from public.solicitudes where created_at > now() - interval '1 hour') > 100 then
    raise exception 'Demasiadas solicitudes ahora mismo. Escríbenos por correo.'
      using errcode = '53400';
  end if;

  insert into public.solicitudes (nombre, correo, negocio, telefono, canales, mensaje, origen)
  values (
    btrim(p_nombre), v_correo,
    nullif(btrim(coalesce(p_negocio, '')), ''),
    nullif(btrim(coalesce(p_telefono, '')), ''),
    coalesce(p_canales, '{}'),
    nullif(btrim(coalesce(p_mensaje, '')), ''),
    nullif(btrim(coalesce(p_origen, '')), '')
  );
end $$;

revoke execute on function public.pedir_demo(text,text,text,text,text[],text,text,text) from public;
grant  execute on function public.pedir_demo(text,text,text,text,text[],text,text,text) to anon, authenticated;

comment on function public.pedir_demo(text,text,text,text,text[],text,text,text) is
  'El unico RPC con permiso para anon. Trampa para bots que devuelve exito en '
  'vez de error -decirle a un bot que ha fallado es enseñarle a arreglarlo-, '
  'un envio por correo cada diez minutos y tope global por hora.';

-- ---------------------------------------------------------------------------
-- El panel las ve y las mueve
-- ---------------------------------------------------------------------------
create or replace function public.panel_solicitudes()
returns setof public.solicitudes
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  return query
    select * from public.solicitudes
     -- Las nuevas primero, y dentro de cada estado las más viejas arriba: una
     -- solicitud de hace tres días es más urgente que la de hace diez minutos.
     order by (estado = 'nueva') desc, created_at asc
     limit 300;
end $$;

create or replace function public.mover_solicitud(
  p_solicitud uuid,
  p_estado    text,
  p_nota      text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  update public.solicitudes
     set estado = p_estado,
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota),
         atendida_por = (select auth.uid()),
         atendida_en = now()
   where id = p_solicitud;

  if not found then
    raise exception 'Esa solicitud no existe.' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.panel_solicitudes() from public, anon;
revoke execute on function public.mover_solicitud(uuid, text, text) from public, anon;
