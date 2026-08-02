-- 0014_cola_ingesta.sql — la bitácora pasa a ser bitácora Y cola.
-- Fuente: docs/fases/01-fase-ingesta.md tarea 2.

-- `via` se renombra a `ruta` y cambia de vocabulario: el amortiguador es Blobs
-- y conviene que el nombre lo diga. Nada la usa todavía.
alter table public.webhook_events drop constraint if exists webhook_events_via_check;
alter table public.webhook_events rename column via to ruta;
alter table public.webhook_events alter column ruta drop default;
alter table public.webhook_events add constraint webhook_events_ruta_chk
  check (ruta in ('directa', 'blobs'));
alter table public.webhook_events alter column ruta set default 'directa';

-- Estado de cola. text con check, nunca enum: un valor nuevo no puede convertir
-- un insert en un fallo que tumbe el lote.
alter table public.webhook_events
  add column estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_proceso', 'procesado', 'cuarentena')),
  add column reclamado_en timestamptz,
  add column duracion_ms  integer,
  add column drenado_en   timestamptz;

drop index if exists public.webhook_events_pendientes_idx;
create index webhook_events_cola_idx
  on public.webhook_events (recibido_en) where estado = 'pendiente';

comment on column public.webhook_events.cuerpo_crudo is
  'Bytes del cuerpo decodificados como UTF-8, sin parsear. NO convertir a jsonb: '
  'jsonb reordena claves, normaliza espaciado y desescapa las secuencias \uXXXX, '
  'y con eso destruye la posibilidad de recalcular el HMAC.';

comment on column public.webhook_events.ruta is
  'directa = el receptor escribio esta fila. blobs = la escribio el drenaje tras '
  'una caida de Postgres; recibido_en es el original y drenado_en el del rescate.';

comment on column public.webhook_events.firma_ok is
  'Vale true en el 100% de las filas por construccion: los cuerpos con firma '
  'invalida nunca se guardan. NO es una senal y no puede haber alertas ni vistas '
  'encima. La senal real de firmas invalidas es el contador de respuestas 401.';

-- Reclamación de trabajo -----------------------------------------------------
-- `skip locked` permite que varias invocaciones concurrentes del procesador
-- convivan sin procesar dos veces la misma fila.
create or replace function private.webhook_events_reclamar(p_limite int)
returns setof public.webhook_events
language sql volatile security definer set search_path = ''
as $$
  update public.webhook_events e
     set estado = 'en_proceso', intentos = e.intentos + 1, reclamado_en = now()
   where e.id in (
     select id from public.webhook_events
      where estado = 'pendiente'
      order by recibido_en
      limit p_limite
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function private.webhook_events_reclamar(int)
  from public, anon, authenticated;

-- Segador --------------------------------------------------------------------
-- Una invocación puede morir con filas reclamadas. Sin esto quedan en
-- 'en_proceso' para siempre y la ingesta se detiene en silencio.
--
-- Tope de cinco rescates: sin él, una fila envenenada —un cuerpo que hace
-- fallar al procesador siempre— se reclama, mata la invocación, se rescata y
-- vuelve a empezar, bloqueando la cola entera.
create or replace function private.webhook_events_segar()
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare v_rescatadas int; v_cuarentena int;
begin
  update public.webhook_events
     set estado = 'cuarentena'
   where estado = 'en_proceso'
     and reclamado_en < now() - interval '10 minutes'
     and intentos >= 5;
  get diagnostics v_cuarentena = row_count;

  update public.webhook_events
     set estado = 'pendiente', reclamado_en = null
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
