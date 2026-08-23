-- 0080_whatsapp_de_gabriel.sql — segundo número de WhatsApp de Boosty, en Coexistence.
--
-- Un número nuevo, +58 412-1722767, que Gabriel quiere seguir usando en el
-- celular (la app de WhatsApp Business) Y a la vez en Kavea. Se vinculó por
-- Coexistence —no por "Add a new number", que migra y desconecta el
-- celular— a una WABA propia y separada de la de Boosty.digital
-- (`247528738447647`, distinta de la `1415042803155441` que ya usa Kommo).
--
-- Misma forma que la 0065: una fila de `meta_connections` con `waba_id` y
-- `phone_number_id`, sin `page_id`. La app ya quedó suscrita a los webhooks
-- de esta WABA por API el 21-ago-2026 (`POST /{waba}/subscribed_apps` →
-- `{"success":true}`), así que en cuanto la credencial quede guardada esta
-- fila puede recibir de verdad.
--
-- LA CREDENCIAL NO VA EN ESTA MIGRACIÓN. Se guarda aparte llamando a
-- `credencial_whatsapp` en la función de borde `portafolio`, que cifra el
-- token de portafolio y comprueba contra Meta antes de guardar — la misma
-- regla de la 0065: una credencial que no se verificó es peor que ninguna.

insert into public.meta_connections
  (id, organization_id, page_id, waba_id, phone_number_id,
   display_phone_number, verified_name, business_id,
   graph_api_version, subscribed_fields_whatsapp, subscription_ok, estado)
values
  ('00000000-0000-4000-8000-00000000c003',
   '00000000-0000-4000-8000-000000000001',
   null,
   '247528738447647',
   '266973946495042',
   '+58 412-1722767',
   'Gabriel Montiel Toro',
   '2167414613399354',
   'v26.0',
   array['messages','smb_message_echoes','phone_number_quality_update',
         'phone_number_name_update','message_template_status_update',
         'message_template_quality_update','template_category_update',
         'account_update','account_review_update','account_alerts',
         'business_capability_update','security'],
   true,
   'connected')
on conflict (id) do nothing;

insert into public.channels (id, organization_id, meta_connection_id, canal, nombre, activo)
values ('00000000-0000-4000-8000-0000000000a2',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-00000000c003',
        'whatsapp',
        '+58 412-1722767',
        true)
on conflict (id) do nothing;

insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
values ('266973946495042',
        'whatsapp_phone_number',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-00000000c003')
on conflict (asset_id) do nothing;
