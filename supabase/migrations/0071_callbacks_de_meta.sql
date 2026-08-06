-- 0071_callbacks_de_meta.sql — los dos callbacks que Meta exige para el App Review.
--
-- QUÉ CIERRA
--
-- `deauthorize` y borrado de datos son requisito del App Review y no existían.
-- La API lo confirmaba con un nulo: `deauth_callback_url: null`. Lo único que
-- había era la PÁGINA de instrucciones de borrado en el sitio público, que es
-- otra cosa: Meta pide un endpoint que conteste, no una página que explique.
--
-- LO QUE NINGUNO DE LOS DOS HACE: borrar datos por su cuenta.
--
-- Los dos llegan por un `signed_request` firmado con el App Secret y traen un
-- `user_id`. Con eso NO se puede decidir a solas que hay que vaciar el historial
-- de conversaciones de un cliente. Un webhook mal enrutado, un reintento o una
-- suplantación que algún día atraviese la firma se convertirían en pérdida de
-- datos irreversible de un tenant entero. Así que aquí se REGISTRA, se ALERTA en
-- p1 y se deja constancia consultable; la ejecución del borrado la confirma una
-- persona. La página de estado dice la verdad sobre en qué punto está.

-- ---------------------------------------------------------------------------
-- 1. Quién autorizó la conexión
-- ---------------------------------------------------------------------------
-- EL HUECO QUE HACE QUE `deauthorize` NO PUEDA HACER SU TRABAJO HOY.
--
-- Meta manda el `user_id` de quien revoca, con ámbito de aplicación. Kavea no
-- guarda en ninguna parte qué usuario de Facebook autorizó cada conexión, así
-- que hoy ese identificador no se puede cruzar con nada y la desautorización no
-- sabe QUÉ desconectar.
--
-- Se añade la columna ahora, vacía, para que el diálogo de Facebook Login de la
-- fase 5 la rellene al conectar. Mientras esté vacía el callback registra y
-- alerta sin tocar ninguna conexión, que es lo correcto: desconectar «la que
-- parezca» es cortarle la mensajería al cliente equivocado.
alter table public.meta_connections
  add column if not exists meta_user_id text;

comment on column public.meta_connections.meta_user_id is
  'Identificador con ámbito de aplicación del usuario de Facebook que autorizó '
  'esta conexión. Lo rellena el callback de OAuth. Es lo único que permite que '
  '`deauthorize` sepa qué conexión desconectar; vacío, el callback solo alerta.';

create index if not exists meta_connections_meta_user_idx
  on public.meta_connections (meta_user_id)
  where meta_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Las solicitudes de borrado
-- ---------------------------------------------------------------------------
create table if not exists public.solicitudes_de_borrado (
  id            uuid primary key default gen_random_uuid(),

  -- El código que se le devuelve a Meta y que la persona usa para consultar. Es
  -- aleatorio y no correlativo: un contador deja adivinar las solicitudes de los
  -- demás cambiando un número en la URL.
  codigo        text not null unique
                  default encode(gen_random_bytes(12), 'hex'),

  meta_user_id  text not null,
  -- Nula mientras no se pueda cruzar el `user_id` con una conexión. Ver arriba.
  organization_id uuid references public.organizations(id) on delete set null,

  estado        text not null default 'recibida'
                  check (estado in ('recibida', 'en_curso', 'completada', 'sin_datos')),

  recibida_en   timestamptz not null default now(),
  resuelta_en   timestamptz,
  nota          text
);

alter table public.solicitudes_de_borrado enable row level security;
alter table public.solicitudes_de_borrado force  row level security;

-- Solo staff, y solo lectura. Una solicitud de borrado no la edita nadie desde
-- el navegador: se resuelve por RPC para que quede rastro de quién la cerró.
revoke all on public.solicitudes_de_borrado from anon, authenticated;
grant select on public.solicitudes_de_borrado to authenticated;

create policy solicitudes_de_borrado_staff on public.solicitudes_de_borrado
  for select to authenticated
  using (public.es_staff());

create index if not exists solicitudes_de_borrado_abiertas_idx
  on public.solicitudes_de_borrado (recibida_en desc)
  where estado in ('recibida', 'en_curso');

-- ---------------------------------------------------------------------------
-- 3. Desautorización
-- ---------------------------------------------------------------------------
-- Devuelve cuántas conexiones se desconectaron, que hoy será cero y mañana no.
-- El número viaja hasta la alerta: es lo que distingue «revocó alguien a quien
-- no conocemos» de «acabamos de cortarle la mensajería a un cliente».
create or replace function private.registrar_desautorizacion(p_meta_user_id text)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer;
begin
  update public.meta_connections
     set estado = 'disconnected', updated_at = now()
   where meta_user_id = p_meta_user_id
     and estado <> 'disconnected';
  get diagnostics v_n = row_count;

  -- p1 SIEMPRE, incluso con cero conexiones tocadas. Que Meta avise de una
  -- revocación que Kavea no sabe atribuir es exactamente la clase de cosa que
  -- hay que mirar: o falta el `meta_user_id` de esa conexión, o alguien está
  -- llamando a este endpoint sin motivo.
  insert into public.alertas (tipo, severidad, detalle)
  values ('desautorizacion', 'p1',
          jsonb_build_object('conexiones_desconectadas', v_n,
                             'identificado', v_n > 0));

  return v_n;
end $$;

revoke execute on function private.registrar_desautorizacion(text)
  from public, anon, authenticated;

create or replace function public.registrar_desautorizacion(p_meta_user_id text)
returns integer
language sql volatile security definer set search_path = ''
as $$ select private.registrar_desautorizacion(p_meta_user_id) $$;

revoke execute on function public.registrar_desautorizacion(text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Solicitud de borrado
-- ---------------------------------------------------------------------------
-- IDEMPOTENTE POR USUARIO MIENTRAS ESTÉ ABIERTA. Meta reintenta, y una persona
-- que pulsa dos veces no debe acabar con dos códigos distintos de los que solo
-- uno le sirva para consultar.
create or replace function private.registrar_borrado(p_meta_user_id text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_codigo text;
begin
  select codigo into v_codigo
    from public.solicitudes_de_borrado
   where meta_user_id = p_meta_user_id
     and estado in ('recibida', 'en_curso')
   order by recibida_en desc
   limit 1;

  if v_codigo is not null then return v_codigo; end if;

  insert into public.solicitudes_de_borrado (meta_user_id)
  values (p_meta_user_id)
  returning codigo into v_codigo;

  insert into public.alertas (tipo, severidad, detalle)
  values ('borrado_solicitado', 'p1', jsonb_build_object('codigo', v_codigo));

  return v_codigo;
end $$;

revoke execute on function private.registrar_borrado(text) from public, anon, authenticated;

create or replace function public.registrar_borrado(p_meta_user_id text)
returns text
language sql volatile security definer set search_path = ''
as $$ select private.registrar_borrado(p_meta_user_id) $$;

revoke execute on function public.registrar_borrado(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Consulta de estado
-- ---------------------------------------------------------------------------
-- La sirve la página pública, así que devuelve LO MÍNIMO: en qué estado está y
-- desde cuándo. Ni el `meta_user_id`, ni la organización, ni la nota interna.
-- Quien tenga el código no tiene por qué poder averiguar de qué cliente se
-- trataba.
create or replace function private.estado_de_borrado(p_codigo text)
returns table (estado text, recibida_en timestamptz, resuelta_en timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.estado, s.recibida_en, s.resuelta_en
    from public.solicitudes_de_borrado s
   where s.codigo = p_codigo
$$;

revoke execute on function private.estado_de_borrado(text) from public, anon, authenticated;

create or replace function public.estado_de_borrado(p_codigo text)
returns table (estado text, recibida_en timestamptz, resuelta_en timestamptz)
language sql stable security definer set search_path = ''
as $$ select * from private.estado_de_borrado(p_codigo) $$;

revoke execute on function public.estado_de_borrado(text) from public, anon, authenticated;
