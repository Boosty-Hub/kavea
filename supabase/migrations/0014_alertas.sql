-- 0015_alertas.sql — espejo de alertas para el panel interno.
-- Fuente: docs/fases/01-fase-ingesta.md tarea 2 y 11.
--
-- Es un ESPEJO, no el camino primario. El camino primario sale por Resend y no
-- puede depender de Postgres, porque la alerta que más importa es justamente la
-- que se produce cuando Postgres no está.

create table public.alertas (
  id              bigserial primary key,

  -- Sin check cerrado: un tipo de alerta nuevo no puede fallar al insertarse
  -- justo cuando algo va mal. Vocabulario esperado:
  --   firma_invalida | postgres_caido | ingesta_caida_total | blobs_atascado
  --   canario_fallido | drenaje_fallido | cuarentena | desuscripcion
  --   reconciliacion_fallida | token_invalido | backlog | silencio | vigilante
  tipo            text not null,

  severidad       text not null check (severidad in ('p1', 'p2')),
  organization_id uuid references public.organizations(id) on delete set null,

  -- NUNCA contiene el cuerpo del webhook ni texto de mensajes. Solo metadatos:
  -- tamaños, cabeceras, identificadores, claves de Blobs. Es coherente con el
  -- modelo de acceso del docs/06 §6, donde el panel ve metadatos y no contenido.
  detalle         jsonb not null default '{}'::jsonb,

  notificada_en   timestamptz,
  created_at      timestamptz not null default now()
);

create index alertas_pendientes_idx
  on public.alertas (created_at) where notificada_en is null;

create index alertas_org_idx
  on public.alertas (organization_id, created_at desc)
  where organization_id is not null;

-- Fuera del alcance de la API, igual que webhook_events: una alerta puede
-- referirse a un evento anterior al enrutado y por tanto sin tenant resuelto.
alter table public.alertas enable row level security;
alter table public.alertas force  row level security;

revoke all on public.alertas from anon, authenticated;
revoke all on sequence public.alertas_id_seq from anon, authenticated;
