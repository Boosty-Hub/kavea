-- 0062_columnas_muertas_del_adelanto.sql — quitar el adelanto viejo de conversations.
--
-- POR QUÉ SE QUITAN Y NO SE DEJAN AHÍ QUIETAS
--
-- La 0023 puso `preview_texto` y `preview_emisor` en `conversations`. La 0027
-- movió el adelanto a `tarjetas`, porque una tarjeta puede tener varias
-- conversaciones y el último mensaje puede haber llegado por cualquiera de ellas.
-- Los disparadores se reescribieron para escribir en `tarjetas`, y estas dos
-- columnas se quedaron con el último valor que tuvieron antes de la mudanza.
--
-- El 3 de agosto de 2026 costaron una investigación: depurando la bandeja,
-- `conversations.preview_texto` decía «Mensaje eliminado» mientras el último
-- mensaje real era «Prueba v2». Se estuvo a punto de reportar un fallo de la
-- bandeja que no existía —`tarjetas.preview_texto` decía «Prueba v2», correcto—
-- porque la columna muerta parecía la fuente de verdad.
--
-- Una columna obsoleta no es neutral: miente con la autoridad de un dato.
--
-- COMPROBADO ANTES DE QUITARLAS
--
--   · Ninguna vista de `public` las menciona.
--   · Ninguna función las escribe. `refrescar_adelanto` y `adelanto_tras_borrado`
--     mencionan `conversations`, pero para resolver el `tarjeta_id`: lo que
--     escriben es `tarjetas`.
--   · La aplicación lee el adelanto de `tarjetas`. De `conversations` solo lee
--     `canal` y `last_incoming_at`, en `CAMPOS_LISTA` de `app/lib/bandeja.ts`.
--
-- QUEDA PENDIENTE Y NO SE TOCA AQUÍ
--
-- `conversations.no_leidos` y `conversations.leido_hasta` huelen igual: el
-- contador de la conversación marcaba 6 cuando el de su tarjeta marcaba 14. Pero
-- `leido_hasta` puede estar en el camino de marcar leído, y no se ha auditado con
-- el mismo cuidado. Quitar algo por parecido es cómo se rompe una lectura.

alter table public.conversations drop column preview_texto;
alter table public.conversations drop column preview_emisor;

comment on column public.conversations.no_leidos is
  'SOSPECHOSA de estar muerta desde 0027, que movio el conteo a tarjetas. '
  'Medido el 3-ago-2026: esta conversacion marcaba 6 y su tarjeta 14. Auditar '
  'antes de leerla para nada.';
