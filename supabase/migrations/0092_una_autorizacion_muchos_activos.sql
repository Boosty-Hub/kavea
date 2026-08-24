-- 0092_una_autorizacion_muchos_activos.sql
--
-- CAMBIO DE MODELO, pedido por Gabriel el 24-ago tras probarlo:
--
--   «La conexión debería ser una sola, que es la cuenta de Facebook, y habilitar
--    los negocios y páginas; y después dentro de Kavea habilitar las páginas de
--    Messenger y los Instagram que tenga vinculados esa cuenta. Para que el
--    usuario solo haga una autenticación con Facebook.»
--
-- Tiene razón, y lo que había hacía lo contrario. `meta-canje` abortaba el alta
-- si el cliente autorizaba más de una Página, con el mensaje «Kavea todavía
-- conecta una por vez: repite el diálogo». Pedirle a alguien que repita un
-- diálogo de OAuth una vez por Página es cobrarle el precio de nuestra
-- implementación: son cinco pantallas de Meta por cada activo.
--
-- QUÉ CAMBIA DE SITIO. El BISU deja de ser una propiedad de la conexión y pasa a
-- serlo de la ORGANIZACIÓN. Es lo que era desde el principio: el diálogo no
-- autoriza una Página, autoriza un portafolio, y con ese token se descubren y se
-- activan tantos activos como haga falta. Guardarlo colgando de una conexión
-- obligaba a que existiera una conexión antes de poder mirar qué hay.
--
-- El Page Access Token NO se mueve: ese sí es por Página y sigue en
-- `private.meta_credentials`, colgado de su conexión.
--
-- Consecuencia de orden: primero se autoriza (una vez), después se elige (dentro
-- de Kavea, con la lista delante), y solo entonces se crean conexiones. Antes
-- los tres pasos eran uno y el cliente no veía nunca la lista.

create table if not exists private.meta_autorizaciones (
  organization_id  uuid primary key
                     references public.organizations(id) on delete cascade,

  -- El BISU del portafolio del cliente, cifrado igual que todo lo demás:
  -- AES-256-GCM con la clave en el almacén del borde, nunca en la base.
  bisu_cipher  bytea not null,
  bisu_nonce   bytea not null,
  bisu_kid     text  not null,

  -- Con qué configuración se obtuvo. Si mañana hay una para WhatsApp, saber cuál
  -- concedió qué evita adivinar por qué falta un permiso.
  config_id    text,
  -- Los scopes que Meta dijo que concedía, tal cual. Sirve para explicar «esto
  -- no se puede» sin volver a preguntar.
  scopes       text[],

  -- Quién autorizó, para poder decirlo en pantalla. Es un dato de auditoría: si
  -- esa persona pierde su rol en el portafolio del cliente, el token muere y hay
  -- que saber a quién pedirle que repita.
  autorizado_por uuid references auth.users(id) on delete set null,
  autorizado_en  timestamptz not null default now(),
  renovado_en    timestamptz
);

alter table private.meta_autorizaciones enable row level security;
alter table private.meta_autorizaciones force  row level security;

comment on table private.meta_autorizaciones is
  'Una autorizacion de Facebook por organizacion. El dialogo no autoriza una '
  'Pagina, autoriza un portafolio: con este token se descubren y se activan '
  'tantos activos como haga falta. El Page Access Token sigue siendo por Pagina, '
  'en meta_credentials.';

-- ---------------------------------------------------------------------------
-- Guardar y leer. Solo el borde, con la clave de servicio.
-- ---------------------------------------------------------------------------
create or replace function private.guardar_autorizacion(
  p_org uuid, p_cipher bytea, p_nonce bytea, p_kid text,
  p_config_id text default null, p_scopes text[] default null,
  p_usuario uuid default null
)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  insert into private.meta_autorizaciones
    (organization_id, bisu_cipher, bisu_nonce, bisu_kid, config_id, scopes,
     autorizado_por, autorizado_en)
  values (p_org, p_cipher, p_nonce, p_kid, p_config_id, p_scopes, p_usuario, now())
  on conflict (organization_id) do update
    set bisu_cipher = excluded.bisu_cipher,
        bisu_nonce  = excluded.bisu_nonce,
        bisu_kid    = excluded.bisu_kid,
        config_id   = coalesce(excluded.config_id, private.meta_autorizaciones.config_id),
        scopes      = coalesce(excluded.scopes, private.meta_autorizaciones.scopes),
        autorizado_por = coalesce(excluded.autorizado_por, private.meta_autorizaciones.autorizado_por),
        renovado_en = now();
$fn$;

create or replace function public.guardar_autorizacion(
  p_org uuid, p_cipher bytea, p_nonce bytea, p_kid text,
  p_config_id text default null, p_scopes text[] default null,
  p_usuario uuid default null
)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  select private.guardar_autorizacion(p_org, p_cipher, p_nonce, p_kid,
                                      p_config_id, p_scopes, p_usuario)
$fn$;

-- Devuelve el ciphertext. Quien la llama es el borde, que es el único que tiene
-- la clave para descifrarlo; para cualquier otro son bytes sin valor.
create or replace function public.autorizacion_de_organizacion(p_org uuid)
returns table (bisu_cipher bytea, bisu_nonce bytea, bisu_kid text, config_id text)
language sql stable security definer set search_path = ''
as $fn$
  select bisu_cipher, bisu_nonce, bisu_kid, config_id
    from private.meta_autorizaciones
   where organization_id = p_org;
$fn$;

-- Para la pantalla: si hay autorización y de cuándo, SIN tocar el token. Esta sí
-- la puede llamar un miembro, porque no devuelve material criptográfico.
create or replace function public.hay_autorizacion_meta(p_org uuid)
returns table (autorizado_en timestamptz, renovado_en timestamptz)
language sql stable security definer set search_path = ''
as $fn$
  select a.autorizado_en, a.renovado_en
    from private.meta_autorizaciones a
   where a.organization_id = p_org
     and public.es_miembro(p_org);
$fn$;

-- ---------------------------------------------------------------------------
-- Permisos. De `public`, no solo de `anon`: la lección de la 0084.
-- ---------------------------------------------------------------------------
revoke execute on function private.guardar_autorizacion(uuid,bytea,bytea,text,text,text[],uuid)
  from public, anon, authenticated;
revoke execute on function public.guardar_autorizacion(uuid,bytea,bytea,text,text,text[],uuid)
  from public, anon, authenticated;
revoke execute on function public.autorizacion_de_organizacion(uuid)
  from public, anon, authenticated;
revoke execute on function public.hay_autorizacion_meta(uuid)
  from public, anon;

grant execute on function public.guardar_autorizacion(uuid,bytea,bytea,text,text,text[],uuid)
  to service_role;
grant execute on function public.autorizacion_de_organizacion(uuid) to service_role;
grant execute on function public.hay_autorizacion_meta(uuid) to authenticated;
