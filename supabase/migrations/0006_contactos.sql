-- 0006_contactos.sql — contactos unificados e identidades por canal.
-- Fuente: docs/02 §7.3 y T10.

create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nombre           text,
  username         text,
  profile_pic_url  text,

  -- El error 230 (consentimiento de perfil no otorgado) es normal y se ignora.
  perfil_consentido  boolean not null default false,
  perfil_leido_en    timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint contacts_org_id_uniq unique (organization_id, id)
);

create index contacts_org_idx on public.contacts (organization_id);

create trigger contacts_touch before update on public.contacts
  for each row execute function public.tocar_updated_at();

create table public.contact_identities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contact_id       uuid not null,
  canal            canal_meta not null,

  -- PSID en messenger, IGSID en instagram. Espacios distintos, no
  -- intercambiables, no portables entre apps.
  scoped_id  text not null,

  -- Columna SEPARADA desde el día uno. Las solicitudes de borrado de datos de
  -- Meta llegan con un App-Scoped ID que no es ninguno de los dos.
  app_scoped_id  text,

  created_at  timestamptz not null default now(),

  constraint contact_identities_unica unique (organization_id, canal, scoped_id),
  constraint contact_identities_contacto_mismo_tenant
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade
);

create index contact_identities_contact_idx
  on public.contact_identities (organization_id, contact_id);

-- Este NO lleva organization_id, y es deliberado: las solicitudes de borrado de
-- Meta llegan con un App-Scoped ID sin contexto de organización.
create index contact_identities_app_scoped_idx
  on public.contact_identities (app_scoped_id)
  where app_scoped_id is not null;

alter table public.contacts           enable row level security;
alter table public.contacts           force  row level security;
alter table public.contact_identities enable row level security;
alter table public.contact_identities force  row level security;

create policy contacts_select on public.contacts
  for select to authenticated
  using (public.es_miembro(organization_id));

-- Un agente edita el nombre de un contacto desde la ficha.
create policy contacts_update on public.contacts
  for update to authenticated
  using      (public.es_miembro(organization_id))
  with check (public.es_miembro(organization_id));

create policy contact_identities_select on public.contact_identities
  for select to authenticated
  using (public.es_miembro(organization_id));
