-- 0010_media.sql — separación entre media entrante y saliente, impuesta por CHECK.
-- Fuente: docs/02 §7.5 con la enmienda del 2-ago-2026, y T14.
--
-- ENMIENDA: el almacén saliente pasa de Cloudflare R2 a Supabase Storage, porque
-- el stack se cerró en dos proveedores. Cambian los nombres, no la regla.

create table public.media (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  message_id       uuid not null,

  origen  text not null check (origen in ('meta_cdn', 'kavea_storage')),

  -- origen = 'meta_cdn': SOLO la URL. Nunca el binario. Nunca en Storage.
  cdn_url             text,
  cdn_host            text,   -- para auditar la allowlist
  cdn_url_recibida_en timestamptz,

  -- origen = 'kavea_storage': media SALIENTE que Kavea genera o que el agente envía.
  storage_bucket  text,
  storage_path    text,
  content_type    text,
  bytes           bigint,

  -- Valor de attachment.type TAL COMO LLEGA. Tipo desconocido → 'fallback'
  -- con el payload crudo, nunca una excepción que tumbe el lote.
  tipo     text not null,
  payload  jsonb not null,

  created_at  timestamptz not null default now(),

  -- Este CHECK es lo que impide que un INSERT distraído cachee media entrante.
  -- Meta rechaza App Reviews por eso: es la causa documentada del rechazo a
  -- usuarios de Chatwoot. La separación no se deja a la disciplina del equipo.
  constraint media_origen_coherente check (
    (origen = 'meta_cdn'      and cdn_url is not null and storage_path is null)
    or
    (origen = 'kavea_storage' and storage_path is not null and cdn_url is null)
  ),
  constraint media_mensaje_mismo_tenant
    foreign key (organization_id, message_id)
    references public.messages (organization_id, id) on delete cascade
);

create index media_message_idx on public.media (organization_id, message_id);

alter table public.media enable row level security;
alter table public.media force  row level security;

create policy media_select on public.media
  for select to authenticated
  using (public.es_miembro(organization_id));
