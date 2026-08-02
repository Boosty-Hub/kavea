-- 0001_base.sql — esquema privado, dominio de canal, organizaciones y membresías.
-- Fuente: docs/02 §7.1 y docs/fases/00-fase-cimientos.md T5.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Dominio, no enum. Meta añade valores sin avisar y un enum convierte un tipo
-- desconocido en un INSERT fallido que tumba el lote entero.
create domain canal_meta as text
  check (value in ('messenger', 'instagram'));

create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- El slug es el subdominio: su formato es una restricción de enrutado,
  -- no de presentación.
  constraint organizations_slug_formato
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),

  constraint organizations_slug_reservado
    check (slug not in (
      'www','admin','app','api','hooks','webhooks','mail','smtp','send','status',
      'docs','static','assets','cdn','blog','soporte','support','ayuda','help',
      'dev','staging','preview','test','demo','kavea'
    ))
);

create trigger organizations_touch before update on public.organizations
  for each row execute function public.tocar_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  rol             text not null check (rol in ('owner', 'admin', 'agente')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- No es opcional: es_miembro() filtra por user_id y se ejecuta en cada consulta
-- de cada tabla. Sin este índice, todo el modelo de RLS hace escaneo secuencial.
create index organization_members_user_idx
  on public.organization_members (user_id);
