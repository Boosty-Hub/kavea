-- 0081_whatsapp_directo_no_coexistence.sql — corregir la conexión c003.
--
-- LA 0080 SE ESCRIBIÓ SOBRE UNA WABA QUE META BORRÓ DESPUÉS.
--
-- El 21-ago-2026 se dio de alta `247528738447647` / `266973946495042` como el
-- segundo número de WhatsApp, vinculado por Coexistence para que Gabriel
-- pudiera seguir usándolo en el celular. La credencial se guardó ese mismo día
-- y `credencial_whatsapp` comprueba contra Meta antes de guardar, así que
-- entonces los dos objetos existían de verdad.
--
-- Hoy, 23-ago-2026, ninguno de los dos existe: Graph devuelve
-- `code 100, subcode 33` para la WABA y para el número. Lo que sí queda en el
-- portafolio es una WABA llamada «Gabriel Montiel Toro» (`1621952576167448`)
-- con CERO números: el alta de Coexistence creó la cuenta y nunca le colgó el
-- teléfono. Eso es lo que se veía «huérfano».
--
-- El diagnóstico diario lo cazó a las 06:17 del 23-ago —V1 fallo, V5
-- no_verificable, V7 sin_probar— y lo cazó porque el 21 se partió la función
-- en dos baterías. La versión anterior habría reventado con un TypeError.
--
-- LO QUE SE HACE AHORA, Y POR QUÉ NO ES LO MISMO
--
-- Se abandona Coexistence. El número nuevo, +1 321-393-1397, se conecta
-- DIRECTO a la Cloud API bajo la WABA `2459716937850832` («Boosty Admin»,
-- propia del portafolio, verificada, con método de pago). Eso significa que
-- este número YA NO se puede usar desde la app de WhatsApp en el celular: es
-- la contrapartida que Coexistence evitaba, y es la razón de que sea un
-- número nuevo y no el +58 de siempre.
--
-- Se corrige la fila en vez de crear otra: el concepto —«el segundo número de
-- WhatsApp de Boosty»— es el mismo, y así el historial de la conexión no se
-- parte en dos.
--
-- ORDEN. Esta migración se aplica DESPUÉS de que Meta confirme dos cosas, no
-- antes, que es justo el error de la 0080:
--
--   1. `POST /1273819772484741/register` → el número queda CONNECTED. Hoy está
--      PENDING: verificado por código, pero sin dar de alta en la Cloud API.
--   2. `POST /2459716937850832/subscribed_apps` → la app recibe webhooks.
--      HECHO el 23-ago-2026: `{"success":true}`, y comprobado con una lectura
--      de vuelta que devuelve `kavea` (`1623464799201071`). Sin este paso el
--      número puede quedar registrado y no llegar ni un webhook.
--
-- Y después de aplicarla hay que volver a llamar a `credencial_whatsapp` en la
-- función de borde `portafolio`: la credencial cifrada que hay guardada se
-- verificó contra un número que ya no existe.

update public.meta_connections
   set waba_id              = '2459716937850832',
       phone_number_id      = '1273819772484741',
       display_phone_number = '+1 321-393-1397',
       verified_name        = 'Boosty Admin',
       -- En revisión el 23-ago. Es el nombre que se muestra, no el registro.
       name_status          = 'PENDING_REVIEW',
       -- True porque la suscripción se hizo y se LEYÓ DE VUELTA el 23-ago,
       -- no porque un POST contestara que sí. La 0080 afirmó `true` sobre un
       -- POST a un objeto que Meta borró después: la diferencia entre las dos
       -- líneas es la lectura de comprobación.
       subscription_ok      = true,
       estado               = 'connected',
       updated_at           = now()
 where id = '00000000-0000-4000-8000-00000000c003';

update public.channels
   set nombre     = '+1 321-393-1397',
       updated_at = now()
 where id = '00000000-0000-4000-8000-0000000000a2';

-- El enrutado va por `phone_number_id`, que es lo que trae el webhook en
-- `changes[].value.metadata.phone_number_id`. El viejo apunta a un asset que
-- ya no existe: si se dejara, un id reciclado por Meta entraría a esta
-- organización.
delete from public.meta_asset_routes
 where asset_id = '266973946495042';

insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
values ('1273819772484741',
        'whatsapp_phone_number',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-00000000c003')
on conflict (asset_id) do nothing;
