-- 0009_eventos_mensaje.sql — eventos sin mid propio.
-- Reacciones, lecturas, entregas y postbacks no tienen identificador propio:
-- la clave la deriva la base de datos, no el código de ingesta.
-- Fuente: docs/02 §7.5, docs/03 claveIdempotencia y T13.

create table public.message_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid,
  canal            canal_meta not null,

  -- Sin CHECK cerrado a propósito: Meta añade sub-eventos sin aviso y un
  -- vocabulario restringido convierte uno nuevo en un INSERT fallido que tumba
  -- el lote entero.
  tipo  text not null,

  target_mid        text,   -- referencia el mensaje REACCIONADO, no la reacción
  actor_scoped_id   text,
  accion            text,
  emoji             text,
  reaction          text,   -- valor crudo de Meta, sin validar

  -- Messenger y Instagram usan modelos de acuse DISTINTOS y no comparten columna:
  read_watermark_ms  bigint,   -- Messenger: "todo lo anterior leído"
  read_mid           text,     -- Instagram messaging_seen: un mid concreto
  delivery_mids      text[],

  -- NULL cuando el evento llega por standby: standby no entrega el payload, y
  -- cualquier lógica que dependa de postback_payload falla en silencio al
  -- perder la propiedad del hilo.
  postback_payload  text,
  postback_title    text,

  meta_timestamp_ms  bigint not null,
  meta_timestamp     timestamptz
                       generated always as (to_timestamp(meta_timestamp_ms / 1000.0)) stored,

  clave_dedupe text generated always as (
    tipo
    || '|' || coalesce(target_mid, read_mid, '')
    || '|' || coalesce(actor_scoped_id, '')
    || '|' || coalesce(accion, '')
    || '|' || coalesce(read_watermark_ms, meta_timestamp_ms)::text
  ) stored,

  raw         jsonb not null,
  created_at  timestamptz not null default now(),

  constraint message_events_dedupe unique (organization_id, canal, tipo, clave_dedupe),
  constraint message_events_conversacion_mismo_tenant
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade
);

create index message_events_conv_idx
  on public.message_events (organization_id, conversation_id, meta_timestamp desc);

alter table public.message_events enable row level security;
alter table public.message_events force  row level security;

create policy message_events_select on public.message_events
  for select to authenticated
  using (public.es_miembro(organization_id));

-- conversation_id es nullable: un evento puede llegar antes de que exista la
-- conversación. Una clave foránea compuesta con una columna nula no se
-- comprueba, que es el comportamiento correcto aquí.
