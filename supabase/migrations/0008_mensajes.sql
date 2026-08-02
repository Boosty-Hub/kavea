-- 0008_mensajes.sql — el mensaje canónico y su idempotencia.
-- Fuente: docs/02 §7.5 y T12.

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid not null,
  canal            canal_meta not null,

  mid        text not null,
  direccion  text not null check (direccion in ('inbound', 'outbound')),

  is_echo  boolean not null default false,
  app_id   text,     -- distingue lo enviado por Kavea de lo enviado por fuera
  metadata text,     -- el metadata pasado en el Send API, que vuelve en el echo

  send_api_message_id  text,   -- correlaciona el envío con su echo

  sender_scoped_id     text,
  recipient_scoped_id  text,

  texto               text,
  reply_to_mid        text,
  reply_to_story      jsonb,   -- solo Instagram
  quick_reply_payload text,
  referral            jsonb,   -- atribución a pauta: ad_id, source, ref, type

  llego_por_standby  boolean not null default false,
  is_unsupported     boolean not null default false,
  deleted_at         timestamptz,   -- unsend / is_deleted. UPDATE, nunca INSERT.

  -- Los timestamps de Meta vienen en MILISEGUNDOS. Se guarda el entero verbatim
  -- y la marca temporal se deriva, para que el error de segundos contra
  -- milisegundos no se pueda cometer en silencio.
  meta_timestamp_ms  bigint not null,
  meta_timestamp     timestamptz
                       generated always as (to_timestamp(meta_timestamp_ms / 1000.0)) stored,

  raw         jsonb not null,
  created_at  timestamptz not null default now(),

  -- LA restricción de idempotencia. Acotada por tenant porque Meta NO documenta
  -- el ámbito de unicidad de mid: la referencia oficial lo define solo como
  -- "Message ID". Nunca unique(mid) global.
  constraint messages_idempotencia unique (organization_id, canal, mid),
  constraint messages_org_id_uniq unique (organization_id, id),
  constraint messages_conversacion_mismo_tenant
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade
);

-- Un índice sirve al filtro de la política, a la cascada de la clave compuesta
-- y a la consulta del hilo. Ordena por meta_timestamp, no por created_at: si no,
-- el hilo se pinta en orden de procesamiento y no de ocurrencia.
create index messages_hilo_idx
  on public.messages (organization_id, conversation_id, meta_timestamp desc);

create index messages_send_api_idx
  on public.messages (organization_id, send_api_message_id)
  where send_api_message_id is not null;

create index messages_metadata_idx
  on public.messages (organization_id, metadata)
  where metadata is not null;

alter table public.messages enable row level security;
alter table public.messages force  row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (public.es_miembro(organization_id));

-- Sin política de escritura para authenticated. Enviar un mensaje pasa por una
-- ruta de servidor que calcula la ventana sobre last_incoming_at, elige
-- messaging_type y tag según la regla del docs/03, llama al Send API y DESPUÉS
-- escribe la fila con rol de servicio. Si el cliente pudiera insertar
-- directamente, se saltaría toda esa lógica y la fila quedaría sin correlato
-- en Meta.
