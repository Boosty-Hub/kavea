-- 0004_credenciales.sql — tokens de Meta cifrados, fuera de public.
-- Fuente: docs/02 §7.8 y T8.
--
-- El Page Access Token de un cliente en texto plano es un incidente de seguridad,
-- no una deuda técnica: con ese token se leen y se envían todos los mensajes de
-- esa Página y de esa cuenta de Instagram.

create table private.meta_credentials (
  meta_connection_id  uuid primary key
                        references public.meta_connections(id) on delete cascade,

  page_access_token_cipher  bytea not null,   -- AES-256-GCM
  page_access_token_nonce   bytea not null,
  page_access_token_kid     text  not null,   -- identifica la clave, para rotar sin big bang

  bisu_token_cipher  bytea,
  bisu_token_nonce   bytea,
  bisu_token_kid     text,

  cifrado_en   timestamptz not null default now(),
  rotado_en    timestamptz
);

-- Defensa en profundidad: el esquema no está publicado por la API, pero una tabla
-- con RLS activo y cero políticas no la ve nadie salvo roles con BYPASSRLS.
alter table private.meta_credentials enable row level security;
alter table private.meta_credentials force  row level security;

-- Fuera del SQL, y son parte del entregable:
--   1. Retirar `private` de la lista de esquemas expuestos por la API, y verificarlo.
--      Si `private` aparece ahí, todo lo demás sobra.
--   2. La clave de cifrado vive en el almacén de secretos del proyecto, no en la
--      base. Un volcado de la base no contiene la clave.
--   3. kid desde el primer día: sin identificador de clave, rotar significa
--      descifrar y volver a cifrar todo a la vez, con ventana de indisponibilidad.
