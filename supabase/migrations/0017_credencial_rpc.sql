-- 0017_credencial_rpc.sql — acceso controlado a la credencial cifrada.
-- Fuente: docs/fases/01-fase-ingesta.md tarea 10.
--
-- El esquema `private` NO está expuesto por la API, y así debe seguir. Pero el
-- reconciliador necesita el token cifrado para descifrarlo en memoria y hablar
-- con Meta.
--
-- La salida es una función `security definer` que devuelve SOLO el material
-- cifrado. Nunca el token en claro: descifrar es cosa de la Edge Function, que
-- es donde vive la clave. La base nunca ve un token legible, ni siquiera de
-- paso, así que un volcado sigue sin contener nada aprovechable.

create or replace function public.credencial_de_conexion(p_conexion uuid)
returns table (
  page_access_token_cipher bytea,
  page_access_token_nonce  bytea,
  page_access_token_kid    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select page_access_token_cipher, page_access_token_nonce, page_access_token_kid
    from private.meta_credentials
   where meta_connection_id = p_conexion;
$$;

-- Solo el rol de servicio. Ni anon ni authenticated pueden invocarla: un
-- cliente con sesión no tiene por qué tocar ni el ciphertext.
revoke execute on function public.credencial_de_conexion(uuid) from public, anon, authenticated;
