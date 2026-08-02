-- 0002_rls_identidad.sql — es_miembro, es_owner y RLS sobre identidad.
-- Fuente: docs/02 §7.7 y T6.

create or replace function public.es_miembro(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.es_miembro(uuid) from anon;

-- La escritura sobre organization_members no puede regirse por es_miembro:
-- sería auto-ascenso. Un agente haría
--   update organization_members set rol='owner' where user_id = auth.uid()
-- y escalaría dentro de su propio tenant.
create or replace function public.es_owner(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.rol = 'owner'
  );
$$;

revoke execute on function public.es_owner(uuid) from anon;

alter table public.organizations        enable row level security;
alter table public.organizations        force  row level security;
alter table public.organization_members enable row level security;
alter table public.organization_members force  row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.es_miembro(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using      (public.es_owner(id))
  with check (public.es_owner(id));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.es_miembro(organization_id));

create policy organization_members_write on public.organization_members
  for all to authenticated
  using      (public.es_owner(organization_id))
  with check (public.es_owner(organization_id));

-- Nota sobre recursión: la política de organization_members llama a una función
-- que lee organization_members. No recursa porque security definer salta RLS
-- sobre las tablas que toca. Una política escrita como
--   exists (select 1 from organization_members ...)
-- directamente sobre la propia tabla sí recursa y Postgres la rechaza en
-- ejecución. La indirección por función no es estética.
