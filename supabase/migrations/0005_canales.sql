-- 0005_canales.sql — canal por conexión, con kill-switch por tenant.
-- Fuente: docs/02 §7.2 y T9.

create table public.channels (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id  uuid not null,
  canal               canal_meta not null,
  nombre              text not null,

  -- Kill-switch por canal y por tenant. Meta puede restringir la app sin aviso
  -- y dejar a todos los tenants sin servicio a la vez.
  activo          boolean not null default true,
  pausado_motivo  text,
  pausado_desde   timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint channels_unico unique (meta_connection_id, canal),
  constraint channels_org_id_uniq unique (organization_id, id),
  constraint channels_conexion_mismo_tenant
    foreign key (organization_id, meta_connection_id)
    references public.meta_connections (organization_id, id) on delete cascade
);

create index channels_org_idx on public.channels (organization_id, canal);

create trigger channels_touch before update on public.channels
  for each row execute function public.tocar_updated_at();

alter table public.channels enable row level security;
alter table public.channels force  row level security;

create policy channels_select on public.channels
  for select to authenticated
  using (public.es_miembro(organization_id));

-- Sin política de update para authenticated: el kill-switch lo opera el panel
-- interno con rol de servicio. Un cliente no se despausa a sí mismo un canal que
-- Boosty pausó por una restricción de Meta.
