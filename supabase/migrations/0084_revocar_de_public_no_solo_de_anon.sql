-- 0084_revocar_de_public_no_solo_de_anon.sql
--
-- `revoke ... from anon` NO QUITA NADA. HAY QUE REVOCAR DE `public`.
--
-- Postgres concede EXECUTE a `public` en toda función nueva, y `anon` hereda
-- de `public`. Revocarle a `anon` lo que tiene por herencia no le quita el
-- permiso: sigue pudiendo ejecutarla. Solo `revoke ... from public` lo corta.
--
-- LO QUE ESTO DEJÓ ABIERTO, COMPROBADO EL 23-AGO-2026 CONTRA PRODUCCIÓN.
--
-- La 0065 escribió `revoke all on function ... from anon` para las dos
-- funciones de credencial de WhatsApp. Con la clave publicable —la que va
-- dentro del bundle de JavaScript que sirve el navegador, o sea pública por
-- definición— esto contestaba:
--
--   POST /rest/v1/rpc/credencial_whatsapp_de_conexion
--   {"p_conexion":"00000000-0000-4000-8000-00000000c003"}
--   → [{"whatsapp_token_cipher":"\xe2908b6aad0def677d2f2627b88ce15a…
--
-- El par equivalente de Página, `credencial_de_conexion`, contestaba 42501.
-- Esa asimetría es la prueba: no es una decisión de diseño, es un `revoke` que
-- no revocó.
--
-- QUÉ TAN GRAVE. El blob va cifrado con AES-256-GCM y la clave vive en el
-- entorno de las funciones de borde, no en la base, así que esto no entrega el
-- token. Pero saca material de credencial fuera del servidor, que es
-- exactamente la frontera que el cifrado en reposo existe para sostener, y
-- `guardar_credencial_whatsapp` era además una ESCRITURA sin autenticar: se
-- podía sobrescribir la credencial de una conexión y dejar el canal sin poder
-- enviar. Y los identificadores de conexión de este proyecto son sembrados y
-- adivinables (`…-00000000c003`), así que ni siquiera hacía falta descubrirlos.
--
-- Las tres de la 0079 (`pausar_canal`, `reanudar_canal`,
-- `desconectar_conexion`) tenían el mismo `revoke` inútil. Esas sí comprueban
-- `puede(org,'conectar')` por dentro y con `auth.uid()` nulo no hacen nada, así
-- que no eran explotables — pero filtraban por el mensaje de error si una
-- conexión existe o no, y sobre todo la intención escrita en la 0079 no se
-- estaba cumpliendo.
--
-- NO SE TOCAN `es_miembro`, `es_owner`, `es_staff` NI `org_ids_con_grant`.
-- Se ejecutan DENTRO de las políticas de RLS, con el rol de quien consulta.
-- Quitarles `public` haría que una consulta de `anon` contra una tabla
-- protegida fallara con «permission denied» en vez de devolver cero filas.
-- Además solo devuelven booleanos sobre el `auth.uid()` de quien llama: no
-- hay nada que filtrar.

-- Credenciales: solo el rol de servicio, igual que el par de Página, que es la
-- prueba viva de cómo tenía que haber quedado esto.
revoke all on function public.credencial_whatsapp_de_conexion(uuid) from public, anon, authenticated;
revoke all on function public.guardar_credencial_whatsapp(uuid, bytea, bytea, text) from public, anon, authenticated;
grant execute on function public.credencial_whatsapp_de_conexion(uuid) to service_role;
grant execute on function public.guardar_credencial_whatsapp(uuid, bytea, bytea, text) to service_role;

-- Canales: las escribe quien tiene sesión, nunca `anon`.
revoke all on function public.pausar_canal(uuid, text) from public, anon;
revoke all on function public.reanudar_canal(uuid) from public, anon;
revoke all on function public.desconectar_conexion(uuid, text) from public, anon;
grant execute on function public.pausar_canal(uuid, text) to authenticated;
grant execute on function public.reanudar_canal(uuid) to authenticated;
grant execute on function public.desconectar_conexion(uuid, text) to authenticated;

-- Marcar leído es una acción de alguien con sesión; a `anon` no le dice nada.
revoke all on function public.marcar_leido(uuid) from public, anon;
grant execute on function public.marcar_leido(uuid) to authenticated;
