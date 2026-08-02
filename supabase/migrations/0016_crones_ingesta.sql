-- 0016_crones_ingesta.sql — los relojes de la ingesta.
-- Fuente: docs/fases/01-fase-ingesta.md tareas 6, 10 y 11.
--
-- El docs/02 §5.2 quería estos crones FUERA del dominio de fallo de la base,
-- porque existen precisamente para recuperarse de una caída. Al consolidar en
-- dos proveedores viven dentro. El contraargumento honesto: durante una caída
-- no podrían hacer su trabajo de todos modos, porque necesitan leer tokens de
-- esa misma base. Lo que importa es que curen al recuperarse.
--
-- Lo que NO cubren, y por eso existe el vigilante externo en Netlify: una caída
-- del proyecto de Supabase entero, que apaga receptor, base y crones a la vez.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Los secretos de los crones viven en una tabla del esquema privado, no en el
-- SQL: un cron con un token escrito en su definición lo expone a cualquiera con
-- lectura sobre cron.job.
create table if not exists private.config_cron (
  clave  text primary key,
  valor  text not null,
  actualizado_en timestamptz not null default now()
);

alter table private.config_cron enable row level security;
alter table private.config_cron force  row level security;

create or replace function private.cfg(p_clave text)
returns text language sql stable security definer set search_path = ''
as $$ select valor from private.config_cron where clave = p_clave $$;

revoke execute on function private.cfg(text) from public, anon, authenticated;

-- Drenaje del amortiguador -----------------------------------------------------
-- Cada minuto. Si no hay nada acumulado la invocación es barata; si hubo una
-- caída, cuanto antes se drene, antes vuelve el orden a la bandeja.
create or replace function private.disparar_drenaje()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_key text;
begin
  v_url := private.cfg('functions_url');
  v_key := private.cfg('service_key');
  if v_url is null or v_key is null then return; end if;

  perform net.http_post(
    url     := v_url || '/drenar-amortiguador',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

revoke execute on function private.disparar_drenaje() from public, anon, authenticated;

-- Segador de reclamaciones huérfanas -------------------------------------------
-- Cada 5 minutos. Una invocación del procesador puede morir con filas
-- reclamadas; sin esto quedan en 'en_proceso' para siempre y la cola se para en
-- silencio.
select cron.schedule('kavea-segar-cola',    '*/5 * * * *', $$ select private.webhook_events_segar(); $$);
select cron.schedule('kavea-drenar-blobs',  '* * * * *',   $$ select private.disparar_drenaje(); $$);

-- Detector de silencio ----------------------------------------------------------
-- La desuscripción de Meta es SILENCIOSA: no llega ningún error, simplemente
-- dejan de entrar eventos. Un contador de errores nunca la detecta; solo la
-- detecta la ausencia de tráfico.
create or replace function private.detectar_silencio()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_ultimo timestamptz; v_horas numeric;
begin
  select max(recibido_en) into v_ultimo from public.webhook_events;

  -- Sin ningún evento nunca, no hay línea base y no se alerta.
  if v_ultimo is null then return; end if;

  v_horas := extract(epoch from (now() - v_ultimo)) / 3600.0;

  -- Umbral provisional. Con un solo inquilino en dogfooding y tráfico nocturno
  -- cero, dos horas es una suposición: se calibra con una semana de línea base.
  if v_horas >= 2 and not exists (
    select 1 from public.alertas
     where tipo = 'silencio' and created_at > now() - interval '6 hours'
  ) then
    insert into public.alertas (tipo, severidad, detalle)
    values ('silencio', 'p1', jsonb_build_object('horas_sin_eventos', round(v_horas, 1)));
  end if;
end $$;

revoke execute on function private.detectar_silencio() from public, anon, authenticated;

select cron.schedule('kavea-detectar-silencio', '*/15 * * * *', $$ select private.detectar_silencio(); $$);
