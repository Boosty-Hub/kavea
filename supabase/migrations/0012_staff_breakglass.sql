-- 0012_staff_breakglass.sql — el panel interno de Boosty y el acceso motivado.
-- Fuente: docs/06 §6 y T16. Es la parte del modelo que no está en el docs/02.

create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol     text not null default 'soporte'
          check (rol in ('soporte','ingenieria','direccion'))
);

create table public.access_grants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  motivo          text not null,
  expira_en       timestamptz not null,
  created_at      timestamptz not null default now(),

  constraint access_grants_motivo_sustantivo check (length(btrim(motivo)) >= 20),
  constraint access_grants_vigencia          check (expira_en > created_at),
  constraint access_grants_techo             check (expira_en <= created_at + interval '72 hours')
);

create index access_grants_activos_idx
  on public.access_grants (user_id, organization_id, expira_en);

-- La cascada de organizations necesita un índice que empiece por organization_id.
create index access_grants_org_idx
  on public.access_grants (organization_id, created_at desc);

create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;

revoke execute on function public.es_staff() from anon;

-- Sin argumentos a propósito: se evalúa una vez por consulta como subplan
-- hasheado, no una vez por fila. Sobre messages esa diferencia no es cosmética.
--
-- La comprobación de staff va DENTRO de la función: una fila de grant para un
-- usuario que no es staff no abre nada. Sin ese exists, bastaría con crear un
-- grant para cualquier usuario.
create or replace function public.org_ids_con_grant()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.organization_id
    from public.access_grants g
   where g.user_id = (select auth.uid())
     and g.expira_en > now()
     and exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;

revoke execute on function public.org_ids_con_grant() from anon;

alter table public.staff         enable row level security;
alter table public.staff         force  row level security;
alter table public.access_grants enable row level security;
alter table public.access_grants force  row level security;

create policy staff_ve_su_fila on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy access_grants_propios on public.access_grants
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Transparencia: los miembros de una organización ven quién abrió un grant sobre
-- sus datos y con qué motivo. Es lo que sostiene la promesa de privacidad.
create policy access_grants_transparencia on public.access_grants
  for select to authenticated
  using (public.es_miembro(organization_id));

-- El staff ve metadatos de todas las organizaciones. Metadatos, no contenido.
create policy organizations_staff_select on public.organizations
  for select to authenticated
  using ((select public.es_staff()));

-- Break-glass sobre el contenido. Convive con messages_select: las políticas
-- permisivas se combinan con OR.
create policy messages_staff_breakglass on public.messages
  for select to authenticated
  using (organization_id in (select public.org_ids_con_grant()));

-- No hay política de insert sobre access_grants. El staff no se concede su
-- propio grant: lo crea el panel desde el servidor, con rol de servicio, tras
-- comprobar staff y registrar el motivo. Y queda en la tabla para siempre.
