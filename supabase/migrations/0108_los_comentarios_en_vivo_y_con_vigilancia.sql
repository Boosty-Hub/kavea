-- 0108_los_comentarios_en_vivo_y_con_vigilancia.sql — que entren solos y que se note si dejan de entrar.
--
-- EL PROBLEMA, entero. El webhook de comentarios de Instagram no llega: la
-- suscripción está puesta —comprobado— pero la app sigue en modo desarrollo y
-- `instagram_manage_comments` rechazado. De 61 eventos de `instagram` recibidos,
-- cero comentarios. La lectura por API sí los trae, y desde la 0107 corre sola.
--
-- PERO «CORRE SOLA» NO ES «EN VIVO», y faltaban dos cosas para que lo fuera:
--
--   1. NADIE AVISA A LA PANTALLA. `messages`, `actividades`, `conversations` y
--      `tarjetas` tienen su disparador de difusión desde la 0023; `comentarios`
--      no lo tuvo nunca. Así que aunque el cron los meta en la base, la bandeja
--      abierta no se entera y hay que refrescar. Es el mismo síntoma que se
--      reportó de los mensajes el 24-ago, en la única tabla a la que no le
--      llegó el arreglo.
--   2. CADA QUINCE MINUTOS ES MUCHO para algo que el operador ve como un mensaje.
--      Se baja a tres. El coste es una llamada a Graph por cuenta y pasada; con
--      dos cuentas son novecientas sesenta al día, que no roza ningún límite.
--
-- Y LA TERCERA, que es la que pidió que no volviera a fallar: **si la lectura
-- deja de funcionar, hoy no se entera nadie**. Un token que muere, un permiso que
-- cambia o una función que revienta dejan la bandeja en silencio, y el silencio
-- se lee como «no hay comentarios». Se guarda un latido por pasada buena y algo
-- lo mira una vez al día.
--
-- POR QUÉ UN LATIDO Y NO UNA ALERTA POR FALLO. Una función que falla puede
-- avisar; una que deja de EJECUTARSE no puede avisar de nada, y ese es el modo de
-- fallo que de verdad pasa —un cron desprogramado, un secreto que caduca—. Lo
-- único que lo detecta es echar de menos algo que debería estar.

-- ---------------------------------------------------------------------------
-- 1. La difusión, para que la pantalla se entere sola.
-- ---------------------------------------------------------------------------
--
-- Reutiliza `private.avisar_bandeja`, que ya sabe deducir la organización de la
-- fila. Su rama `else` toma `new.organization_id` y `new.id`, que es exactamente
-- lo que hace falta aquí.
--
-- AFTER INSERT **Y** AFTER UPDATE: un comentario que llega es una novedad, y uno
-- que se responde, se oculta o se borra cambia lo que la pantalla enseña. Sin el
-- update, moderar desde otra pestaña dejaría la primera mintiendo.
drop trigger if exists comentarios_avisar on public.comentarios;
create trigger comentarios_avisar
  after insert or update on public.comentarios
  for each row execute function private.avisar_bandeja();

-- ---------------------------------------------------------------------------
-- 2. Los latidos: lo que permite echar de menos.
-- ---------------------------------------------------------------------------
create table if not exists private.latidos (
  clave      text primary key,
  ultimo_en  timestamptz not null default now(),
  detalle    jsonb not null default '{}'::jsonb
);

comment on table private.latidos is
  'Última vez que un trabajo periódico terminó bien. Se mira para echarlo de menos.';

alter table private.latidos enable row level security;
alter table private.latidos force  row level security;
revoke all on private.latidos from anon, authenticated;

create or replace function private.anotar_latido(p_clave text, p_detalle jsonb default '{}'::jsonb)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  insert into private.latidos (clave, ultimo_en, detalle)
  values (p_clave, now(), coalesce(p_detalle, '{}'::jsonb))
  on conflict (clave) do update
    set ultimo_en = now(), detalle = coalesce(excluded.detalle, '{}'::jsonb);
$fn$;

revoke execute on function private.anotar_latido(text, jsonb) from public, anon, authenticated;
grant  execute on function private.anotar_latido(text, jsonb) to service_role;

create or replace function public.anotar_latido(p_clave text, p_detalle jsonb default '{}'::jsonb)
returns void
language sql volatile security definer set search_path = ''
as $fn$ select private.anotar_latido(p_clave, p_detalle) $fn$;

revoke execute on function public.anotar_latido(text, jsonb) from public, anon, authenticated;
grant  execute on function public.anotar_latido(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Echar de menos.
--
-- Devuelve los trabajos que llevan más de lo tolerable sin dar señales. El
-- umbral va por trabajo y no global: la lectura de comentarios corre cada tres
-- minutos y una hora sin latido ya es raro; otro trabajo diario necesitaría días.
--
-- UN TRABAJO QUE NUNCA HA LATIDO NO SE ECHA DE MENOS. Si no hay fila es que
-- todavía no se ha desplegado o no ha corrido nunca, y avisar de eso el primer
-- día es cómo un vigilante pierde la credibilidad antes de servir para algo.
-- ---------------------------------------------------------------------------
create or replace function public.latidos_viejos()
returns table (clave text, ultimo_en timestamptz, horas numeric)
language sql stable security definer set search_path = ''
as $fn$
  select l.clave, l.ultimo_en,
         round(extract(epoch from (now() - l.ultimo_en)) / 3600.0, 1)
    from private.latidos l
   where l.ultimo_en < now() - (
           case l.clave
             when 'comentarios' then interval '1 hour'
             else interval '26 hours'
           end)
   order by l.ultimo_en;
$fn$;

revoke execute on function public.latidos_viejos() from public, anon, authenticated;
grant  execute on function public.latidos_viejos() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Y la lectura, más a menudo. Ver la cabecera.
-- ---------------------------------------------------------------------------
do $cron$
begin
  perform cron.unschedule('kavea-traer-comentarios');
exception when others then null;
end $cron$;

select cron.schedule(
  'kavea-traer-comentarios',
  '*/3 * * * *',
  $cmd$
  select net.http_post(
    url     := private.cfg('functions_url') || '/sincronizar-comentarios',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || private.cfg('service_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);
