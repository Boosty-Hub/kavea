-- 0007_conversaciones.sql — hilos, ventana de servicio y Conversation Routing.
-- Fuente: docs/02 §7.4 y T11.

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  channel_id       uuid not null,
  canal            canal_meta not null,
  contact_id       uuid not null,

  -- Cuatro estados (decisión de Gabriel, 2-ago-2026). El docs/02 §7.4 definía
  -- tres; 'nueva' distingue lo que nadie ha tocado de lo que está en curso, que
  -- es información que la bandeja necesita.
  estado  text not null default 'nueva'
            check (estado in ('nueva', 'en_curso', 'esperando', 'cerrada')),

  -- ÚNICA base del cálculo de la ventana de 24 h / 7 días.
  -- Un echo saliente NO la toca. Jamás un flag global.
  last_incoming_at  timestamptz,
  last_message_at   timestamptz,

  -- Conversation Routing. Sin esto, Kavea intenta enviar cuando no es dueña
  -- del hilo y falla en silencio.
  thread_owner_app_id       text,
  en_standby                boolean not null default false,
  thread_control_updated_at timestamptz,

  asignado_a  uuid references auth.users(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint conversations_org_id_uniq unique (organization_id, id),
  constraint conversations_contacto_mismo_tenant
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint conversations_canal_mismo_tenant
    foreign key (organization_id, channel_id)
    references public.channels (organization_id, id) on delete cascade
);

-- Segunda capa de idempotencia: impide que tres fotos seguidas creen tres
-- conversaciones. El predicado es "distinto de cerrada" y no "igual a abierta":
-- con cuatro estados, una conversación en 'esperando' quedaría desprotegida.
-- Corrige el defecto del docs/02 §7.4, que usa where status='open'.
create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where estado <> 'cerrada';

create index conversations_bandeja_idx
  on public.conversations (organization_id, channel_id, estado, last_message_at desc);

create index conversations_contacto_idx
  on public.conversations (organization_id, contact_id);

create index conversations_asignado_idx
  on public.conversations (asignado_a) where asignado_a is not null;

create trigger conversations_touch before update on public.conversations
  for each row execute function public.tocar_updated_at();

alter table public.conversations enable row level security;
alter table public.conversations force  row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.es_miembro(organization_id));

-- La bandeja cambia estado y asignación. No crea ni borra hilos: eso lo hace
-- el normalizador con rol de servicio.
create policy conversations_update on public.conversations
  for update to authenticated
  using      (public.es_miembro(organization_id))
  with check (public.es_miembro(organization_id));

-- Hueco conocido y aceptado: asignado_a no comprueba que el usuario sea miembro
-- de la organización. Una clave foránea no puede expresarlo. No filtra datos
-- —RLS sigue filtrando— pero produce asignaciones rotas. Se cierra con un
-- trigger cuando exista la bandeja.
