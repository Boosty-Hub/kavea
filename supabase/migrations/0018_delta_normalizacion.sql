-- 0018_delta_normalizacion.sql — lo que la fase 2 necesita sobre el esquema.
-- Fuente: docs/fases/02-fase-normalizacion.md tarea 1.
--
-- NOTA DE RECONCILIACIÓN. El plan de la fase 2 propone su propio vocabulario de
-- cola —estado en ('pendiente','procesando','hecho','fallido'), `origen`,
-- `blob_key`— porque se escribió sin saber qué nombres acabaría usando la fase 1.
-- La fase 1 ya construyó la cola con ('pendiente','en_proceso','procesado',
-- 'cuarentena') y `ruta`. Se conserva lo existente y se añade solo lo que falta:
-- renombrar columnas en producción para que coincidan con un documento sería
-- churn sin beneficio.
--
-- `conversations` ya tiene los cuatro estados y el índice con el predicado
-- correcto desde la migración 0007, así que esa parte del delta no aplica.

-- messages -------------------------------------------------------------------
alter table public.messages
  -- Distingue en la bandeja una respuesta del agente de IA de una que escribió
  -- una persona del cliente desde el móvil. Se deriva del app_id del echo y de
  -- la correlación con los envíos propios.
  add column emisor text not null default 'contacto'
    check (emisor in ('contacto', 'humano', 'agente')),
  add column edited_at timestamptz;

-- message_events -------------------------------------------------------------
alter table public.message_events
  add column llego_por_standby boolean not null default false,
  -- Lápida diferida. Un borrado o una edición pueden llegar ANTES que el
  -- mensaje al que se refieren: con el drenaje del amortiguador por delante,
  -- ese caso deja de ser raro. El efecto se registra siempre; si el update
  -- afecta a cero filas queda pendiente y se aplica en la misma transacción
  -- del insert posterior.
  add column aplicado_en timestamptz;

create index message_events_pendientes_idx
  on public.message_events (organization_id, canal, target_mid)
  where tipo in ('delete', 'edit') and aplicado_en is null;

-- webhook_events: troceado y retroceso ---------------------------------------
alter table public.webhook_events
  -- Mueve el retroceso exponencial. El reclamo ordena por esta columna, no por
  -- recibido_en: una fila que fallo hace diez segundos no debe volver a salir
  -- inmediatamente por delante de una que nunca se ha intentado.
  add column disponible_en timestamptz not null default now(),
  add column reclamado_por text,
  add column rescates      smallint not null default 0,

  -- TROCEADO POR PRESUPUESTO DE CPU.
  --
  -- Las Edge Functions de Supabase dan 400 s de reloj pero solo 2 s de CPU por
  -- petición, y parsear mil updates es CPU pura. Esperar no ayuda: hay que
  -- partir el trabajo. El cursor marca por dónde iba y avanza EN LA MISMA
  -- TRANSACCIÓN que confirma el tramo, nunca antes.
  add column cursor_update int not null default 0,
  add column updates_total int;

drop index if exists public.webhook_events_cola_idx;

create index webhook_events_reclamo_idx
  on public.webhook_events (disponible_en, id)
  where estado = 'pendiente';

create index webhook_events_procesando_idx
  on public.webhook_events (reclamado_en)
  where estado = 'en_proceso';

comment on column public.webhook_events.cursor_update is
  'Indice del ultimo update aplicado dentro del lote. Avanza en la misma '
  'transaccion que confirma el tramo: si la funcion muere a mitad, ni se pierde '
  'ni se repite trabajo.';

-- El reclamo se reescribe para respetar disponible_en y anotar quién reclamó.
create or replace function private.webhook_events_reclamar(p_limite int, p_quien text default null)
returns setof public.webhook_events
language sql volatile security definer set search_path = ''
as $$
  update public.webhook_events e
     set estado = 'en_proceso',
         intentos = e.intentos + 1,
         reclamado_en = now(),
         reclamado_por = coalesce(p_quien, 'anonimo')
   where e.id in (
     select id from public.webhook_events
      where estado = 'pendiente'
        and disponible_en <= now()
      order by disponible_en, id
      limit p_limite
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function private.webhook_events_reclamar(int, text)
  from public, anon, authenticated;

-- El segador respeta el nuevo contador de rescates.
create or replace function private.webhook_events_segar()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare v_rescatadas int; v_cuarentena int;
begin
  -- Tope de tres rescates. Sin él, una fila envenenada —un cuerpo que hace
  -- fallar al normalizador siempre— se reclama, mata la invocación, se rescata
  -- y vuelve a empezar, bloqueando la cola entera.
  update public.webhook_events
     set estado = 'cuarentena'
   where estado = 'en_proceso'
     and reclamado_en < now() - interval '10 minutes'
     and rescates >= 3;
  get diagnostics v_cuarentena = row_count;

  update public.webhook_events
     set estado = 'pendiente',
         reclamado_en = null,
         reclamado_por = null,
         rescates = rescates + 1,
         disponible_en = now()
   where estado = 'en_proceso'
     and reclamado_en < now() - interval '10 minutes';
  get diagnostics v_rescatadas = row_count;

  if v_cuarentena > 0 then
    insert into public.alertas (tipo, severidad, detalle)
    values ('cuarentena', 'p1', jsonb_build_object('filas', v_cuarentena));
  end if;

  return v_rescatadas;
end $$;

revoke execute on function private.webhook_events_segar() from public, anon, authenticated;
