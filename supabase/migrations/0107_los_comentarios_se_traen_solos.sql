-- 0107_los_comentarios_se_traen_solos.sql — que no haya que pulsar un botón.
--
-- POR QUÉ. El webhook de comentarios de Instagram NO LLEGA, y no por falta de
-- suscripción —está puesta, comprobado el 24-ago— sino porque la app está en
-- modo desarrollo y `instagram_manage_comments` sigue rechazado. De 61 eventos
-- de `instagram` recibidos, ninguno es un comentario.
--
-- La lectura por API sí los trae: `sincronizar-comentarios` existe desde la 0075
-- y funciona. El problema es que solo corre cuando alguien pulsa «Traer de
-- Meta». Hoy pasó otra vez: se comentó una publicación de Boosty y no apareció
-- en la bandeja hasta que se pulsó el botón a mano.
--
-- Un canal que solo entra cuando alguien se acuerda de pedirlo no es un canal.
-- Cada quince minutos, que es la misma cadencia del reconciliador y del detector
-- de silencio: los comentarios no son urgentes como un mensaje directo, pero
-- tampoco pueden esperar a que alguien abra la pantalla.
--
-- SIN ORGANIZACIÓN EN EL CUERPO. La función, sin ese parámetro, recorre todas
-- las cuentas de Instagram conectadas —que es lo que un cron debe hacer— y cada
-- comentario cae en la organización de su cuenta. El parámetro existe para el
-- botón, donde sí hay un espacio concreto que lo pulsa.
--
-- CUANDO EL PERMISO SE APRUEBE, esto no sobra: un webhook es una entrega y una
-- entrega se pierde. Esta pasada seguirá siendo la que descubra el hueco, igual
-- que el reconciliador de suscripciones.

do $cron$
begin
  perform cron.unschedule('kavea-traer-comentarios');
exception when others then null;
end $cron$;

select cron.schedule(
  'kavea-traer-comentarios',
  '*/15 * * * *',
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
