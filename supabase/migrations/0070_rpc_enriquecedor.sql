-- 0070_rpc_enriquecedor.sql — la puerta del enriquecedor, que la 0069 se dejó.
--
-- QUÉ ARREGLA
--
-- La 0069 dejó `contactos_sin_perfil` y `guardar_perfil_instagram` solo en
-- `private`, y `private` NO está expuesto por la API. La función de borde llama
-- por PostgREST, así que la primera invocación real devolvió:
--
--   PGRST202: Could not find the function public.contactos_sin_perfil
--
-- El convenio ya estaba escrito en la 0020 y esto no hace más que seguirlo:
-- envoltorios finos en `public`, `security definer`, con EXECUTE revocado a todo
-- lo que no sea el rol de servicio. Exponer la puerta no es exponer la
-- habitación.
--
-- POR QUÉ NO SE VIO ANTES DE DESPLEGAR
--
-- Porque nada lo comprueba. Las Edge Functions no se typechequean en CI —está
-- anotado como pendiente en la bitácora §3.8— y aunque se typechequearan, esto
-- no es un error de tipos: es un nombre de esquema que solo existe en tiempo de
-- ejecución, del otro lado de una llamada HTTP.

create or replace function public.contactos_sin_perfil(p_limite integer default 20)
returns table (
  contact_id uuid, organization_id uuid, scoped_id text, meta_connection_id uuid
)
language sql stable security definer set search_path = ''
as $$ select * from private.contactos_sin_perfil(p_limite) $$;

revoke execute on function public.contactos_sin_perfil(integer)
  from public, anon, authenticated;

create or replace function public.guardar_perfil_instagram(
  p_contact uuid, p_username text default null, p_foto_ruta text default null
)
returns void
language sql volatile security definer set search_path = ''
as $$ select private.guardar_perfil_instagram(p_contact, p_username, p_foto_ruta) $$;

revoke execute on function public.guardar_perfil_instagram(uuid, text, text)
  from public, anon, authenticated;
