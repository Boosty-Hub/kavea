-- 0035_rpc_despachador.sql — el despachador necesita alcanzar su cola.
--
-- `private.reclamar_envios` vive donde debe: el esquema `private` no está
-- expuesto por PostgREST y así se queda. Pero la Edge Function habla con la base
-- por la API REST, y una función que no está en `public` no existe para ella.
-- El síntoma fue un PGRST202 —"Could not find the function public.reclamar_envios
-- in the schema cache"— con la fila quieta en `encolado` y el despachador
-- devolviendo error sin haber tocado Meta.
--
-- Mismo patrón que `webhook_events_reclamar` en 0020: envoltorio delgado en
-- `public`, revocado de todo el mundo salvo el rol de servicio.

create or replace function public.reclamar_envios(p_lote integer default 10)
returns setof public.outbound_messages
language sql volatile security definer set search_path = ''
as $$ select * from private.reclamar_envios(p_lote) $$;

revoke execute on function public.reclamar_envios(integer) from public, anon, authenticated;
