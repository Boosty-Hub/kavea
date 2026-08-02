-- 0011_cola_webhooks.sql — cola y bitácora a la vez.
-- El receptor inserta aquí, el normalizador reclama con for update skip locked,
-- y la fila se conserva después como registro crudo de qué llegó y a qué tenant
-- se enrutó. La forma definitiva la fija la fase 2, que es su consumidor.
-- Fuente: docs/02 §7.6 con la anulación de §5.2, docs/06 §1.1 y T15.

create table public.webhook_events (
  id             bigserial primary key,
  recibido_en    timestamptz not null default now(),
  firma_ok       boolean not null,

  -- 'page' o 'instagram'. Sin CHECK: dos páginas oficiales de Meta se
  -- contradicen sobre cuál llega en la vía Facebook Login, y el docs/03 prohíbe
  -- afirmar cuál es. El handler acepta ambos y enruta por entry[].id.
  object         text,

  -- El cuerpo va como TEXT, no como jsonb: jsonb desescapa \uXXXX y destruye la
  -- posibilidad de recalcular el HMAC. Meta firma sobre una versión con unicode
  -- escapado, así que reparsear rompe la firma de forma no determinista, y solo
  -- falla con tildes y emoji, es decir siempre en VE, RD y MX.
  cuerpo_crudo   text not null,
  cuerpo_bytes   integer not null,

  -- Generado por el receptor ANTES de intentar escribir. Viaja por los dos
  -- caminos —insert directo y amortiguador de Netlify Blobs— y cierra el caso
  -- del insert que confirmó pero cuya respuesta se perdió.
  ingesta_id     uuid not null unique,
  via            text not null default 'directa' check (via in ('directa', 'amortiguador')),

  entry_ids      text[],    -- todos los entry[].id del lote, para trazar el enrutado
  procesado_en   timestamptz,
  intentos       smallint not null default 0,
  error          text,

  -- Red de contención. En la práctica siempre valdrá true, porque los cuerpos
  -- con firma inválida nunca llegan a encolarse: el receptor devuelve 401 y no
  -- guarda nada. NO es una señal y nadie debe montar alertas ni vistas encima;
  -- la señal real es el contador de 401 del receptor.
  constraint webhook_events_firma_ok_chk check (firma_ok)
);

create index webhook_events_pendientes_idx
  on public.webhook_events (recibido_en)
  where procesado_en is null;

-- Herramienta forense de la frontera de escritura: responde "¿qué lotes tocaron
-- esta Página?" durante una investigación de cruce de datos.
create index webhook_events_entry_idx
  on public.webhook_events using gin (entry_ids);

-- RLS activo y CERO políticas: deniega todo. Solo la tocan roles con BYPASSRLS.
-- "Fuera del modelo de tenant" no puede significar "sin RLS" en Supabase: una
-- tabla sin RLS es pública a través de PostgREST.
alter table public.webhook_events enable row level security;
alter table public.webhook_events force  row level security;

revoke all on public.webhook_events from anon, authenticated;
revoke all on sequence public.webhook_events_id_seq from anon, authenticated;

-- No lleva organization_id, y es una decisión, no un olvido. Un lote puede traer
-- hasta 1000 updates de assets distintos y Meta no garantiza que sean del mismo
-- tenant. La fila cruda es ANTERIOR al enrutado: es potencialmente multi-tenant,
-- así que no puede quedar bajo RLS de organización.
