-- 0020_rpc_normalizador.sql — puertas al normalizador desde PostgREST.
--
-- El esquema `private` NO está expuesto por la API, y así debe seguir: es donde
-- viven los tokens cifrados. Pero PostgREST solo puede invocar funciones de los
-- esquemas expuestos.
--
-- La salida son envoltorios finos en `public`, `security definer`, con EXECUTE
-- revocado a todo lo que no sea el rol de servicio. Exponer la puerta no es
-- exponer la habitación.

create or replace function public.webhook_events_reclamar(p_limite int, p_quien text default null)
returns setof public.webhook_events
language sql volatile security definer set search_path = ''
as $$ select * from private.webhook_events_reclamar(p_limite, p_quien) $$;

revoke execute on function public.webhook_events_reclamar(int, text)
  from public, anon, authenticated;

create or replace function public.ingerir_tramo(
  p_evento bigint, p_efectos jsonb, p_cursor int, p_total int, p_final boolean
)
returns jsonb
language sql volatile security definer set search_path = ''
as $$ select private.ingerir_tramo(p_evento, p_efectos, p_cursor, p_total, p_final) $$;

revoke execute on function public.ingerir_tramo(bigint, jsonb, int, int, boolean)
  from public, anon, authenticated;

-- Disparo del normalizador desde el propio insert del receptor.
--
-- Sin esto, la bandeja tendría hasta un minuto de retraso —lo que tarde el
-- cron— y una bandeja en vivo con un minuto de latencia no es una bandeja en
-- vivo. Con el disparo, el mensaje aparece en segundos.
--
-- `after insert ... for each statement`: una sola invocación por lote, no una
-- por fila. Y no bloquea el commit, porque pg_net encola la petición y devuelve.
create or replace function private.disparar_normalizador()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_key text;
begin
  -- Amortiguador contra la invocación en tromba: si ya se disparó hace menos de
  -- dos segundos, no se vuelve a disparar. El update condicional es una carrera
  -- atómica, así que cincuenta mensajes en un segundo producen un disparo, no
  -- cincuenta.
  update private.config_cron
     set valor = to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'), actualizado_en = now()
   where clave = 'ultimo_disparo_normalizador'
     and coalesce(valor::timestamptz, 'epoch'::timestamptz) < now() - interval '2 seconds';

  if not found then return null; end if;

  v_url := private.cfg('functions_url');
  v_key := private.cfg('service_key');
  if v_url is null or v_key is null then return null; end if;

  perform net.http_post(
    url     := v_url || '/normalizar',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  return null;
end $$;

insert into private.config_cron (clave, valor)
values ('ultimo_disparo_normalizador', 'epoch')
on conflict (clave) do nothing;

create trigger webhook_events_disparar
  after insert on public.webhook_events
  for each statement
  execute function private.disparar_normalizador();

-- Red de seguridad: el cron recoge lo que el disparo no alcance —una fila
-- cedida por presupuesto de CPU, un disparo perdido, una reanudación tras
-- retroceso—. El disparo es el camino rápido; el cron es el que garantiza que
-- nada se queda parado para siempre.
create or replace function private.disparar_normalizador_cron()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_key text; v_pendientes int;
begin
  select count(*) into v_pendientes
    from public.webhook_events
   where estado = 'pendiente' and disponible_en <= now();

  if v_pendientes = 0 then return; end if;

  v_url := private.cfg('functions_url');
  v_key := private.cfg('service_key');
  if v_url is null or v_key is null then return; end if;

  perform net.http_post(
    url     := v_url || '/normalizar',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end $$;

revoke execute on function private.disparar_normalizador_cron() from public, anon, authenticated;

select cron.schedule('kavea-normalizar', '* * * * *', $$ select private.disparar_normalizador_cron(); $$);
