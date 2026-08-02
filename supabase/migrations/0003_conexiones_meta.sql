-- 0003_conexiones_meta.sql — la frontera del plano de escritura.
-- No es configuración: es el control que impide que un evento de un cliente
-- acabe escrito en el tenant de otro.
-- Fuente: docs/02 §7.2 y T7.

create table public.meta_connections (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  page_id                 text not null,
  page_name               text,
  ig_business_account_id  text,          -- null si el cliente todavía no vinculó IG
  ig_username             text,

  business_id       text,
  config_id         text,
  graph_api_version text not null default 'v26.0',

  subscribed_fields_messenger  text[] not null default '{}',
  subscribed_fields_instagram  text[] not null default '{}',
  last_subscription_check_at   timestamptz,
  subscription_ok              boolean not null default false,

  messaging_feature_status          jsonb,
  default_application_confirmed_at  timestamptz,

  -- Salud del token. Se marca al recibir error 190; el envío PARA, no reintenta
  -- en bucle. Vive en public a propósito: la UI necesita leer el estado para
  -- mostrar el banner de reconexión, y no necesita leer el token.
  token_last_verified_at  timestamptz,
  token_invalid_since     timestamptz,

  estado      text not null default 'connected'
                check (estado in ('connected', 'degraded', 'disconnected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint meta_connections_page_unica unique (page_id),
  -- Destino de las claves compuestas de channels y meta_asset_routes.
  constraint meta_connections_org_id_uniq unique (organization_id, id)
);

-- Una cuenta de IG pertenece a una sola organización. Igual que la Página.
create unique index meta_connections_ig_unica
  on public.meta_connections (ig_business_account_id)
  where ig_business_account_id is not null;

create index meta_connections_org_idx on public.meta_connections (organization_id);

create trigger meta_connections_touch before update on public.meta_connections
  for each row execute function public.tocar_updated_at();

-- Aplana page_id e ig_business_account_id en una sola columna, para que resolver
-- entry[].id sea un único acierto de índice antes de tocar nada más.
--
-- asset_id es la CLAVE PRIMARIA, no un índice cualquiera. Eso obliga a que la
-- resolución sea una función: un entry[].id mapea a exactamente una organización
-- o a ninguna. Si mapeara a dos, se escribirían mensajes de un cliente en el
-- tenant de otro, que es el peor fallo posible bajo RLS.
create table public.meta_asset_routes (
  asset_id            text primary key,   -- tal como llega en entry[].id
  tipo                text not null check (tipo in ('page', 'ig_business_account')),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id  uuid not null,
  created_at          timestamptz not null default now(),

  -- La ruta y la conexión a la que apunta pertenecen a la misma organización
  -- por construcción, no por convención del código de alta.
  constraint meta_asset_routes_conexion_mismo_tenant
    foreign key (organization_id, meta_connection_id)
    references public.meta_connections (organization_id, id) on delete cascade
);

create index meta_asset_routes_conexion_idx
  on public.meta_asset_routes (organization_id, meta_connection_id);

alter table public.meta_connections  enable row level security;
alter table public.meta_connections  force  row level security;
alter table public.meta_asset_routes enable row level security;
alter table public.meta_asset_routes force  row level security;

create policy meta_connections_select on public.meta_connections
  for select to authenticated
  using (public.es_miembro(organization_id));

create policy meta_asset_routes_select on public.meta_asset_routes
  for select to authenticated
  using (public.es_miembro(organization_id));

-- Sin políticas de escritura para authenticated. Conectar una Página es el flujo
-- de OAuth de la fase 5, que corre en un route handler con rol de servicio tras
-- validar la sesión.
