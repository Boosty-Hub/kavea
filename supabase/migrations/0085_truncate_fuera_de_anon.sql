-- 0085_truncate_fuera_de_anon.sql — quitar el unico privilegio que RLS no gobierna.
--
-- HALLAZGO DE LA AUDITORIA DEL 23-AGO-2026.
--
-- `anon` y `authenticated` tienen `arwdDxtm` —o sea TODO— sobre las 33 tablas
-- de `public`. No es un descuido de este repositorio: sale de un
-- `ALTER DEFAULT PRIVILEGES` del rol `postgres` que trae la plataforma, y es el
-- modelo normal de Supabase: se concede en la tabla y se filtra por fila con
-- RLS. Comprobado que funciona, como anon y por HTTP con la clave publicable:
-- SELECT sobre messages, meta_connections, organizations, contacts, staff,
-- conversations y access_grants devuelve `[]`, y un DELETE sin filtro no borra
-- ni una fila. RLS esta activo Y FORZADO en las 33.
--
-- SALVO UNO. **RLS no se aplica a TRUNCATE.** Es una excepcion explicita de
-- Postgres: las politicas filtran filas y TRUNCATE no mira filas, vacia la
-- tabla entera. Asi que de los ocho privilegios concedidos, siete estan
-- contenidos por RLS y el octavo no lo esta por nada.
--
-- NO ES ALCANZABLE HOY, Y SE DICE PARA NO EXAGERAR: PostgREST no tiene verbo
-- TRUNCATE, asi que con la clave publicable no hay forma de dispararlo. Lo que
-- se quita es la posibilidad futura, que es concreta: basta una funcion SQL
-- SECURITY INVOKER —la ausencia de `security definer`, o sea el descuido mas
-- facil de cometer— que trunque algo, para que se ejecute con los privilegios
-- de quien llama y RLS no tenga nada que decir. Es un privilegio que nadie usa
-- y que ninguna capa de arriba puede contener.
--
-- MAINTAIN se deja. Permite VACUUM, ANALYZE, REINDEX y REFRESH MATERIALIZED
-- VIEW; no destruye datos, no hay vistas materializadas, y quitarlo sin
-- necesidad es tocar por tocar.

-- ---------------------------------------------------------------------------
-- 1. Las tablas que ya existen.
-- ---------------------------------------------------------------------------
revoke truncate on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Las que cree la proxima migracion.
-- ---------------------------------------------------------------------------
-- Sin esto, el arreglo dura hasta el siguiente `create table`: el default de la
-- plataforma volveria a conceder los ocho. Se fija para el rol `postgres`, que
-- es con el que se aplican las migraciones de este repositorio (via la API de
-- gestion, ver scripts/aplicar-migraciones.ps1). El default de `supabase_admin`
-- no se toca: no es nuestro y no crea tablas de la aplicacion.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

-- El canario C9 de supabase/tests/canarios.sql comprueba las dos cosas, porque
-- un `alter default privileges` es silencioso: no falla, simplemente deja de
-- aplicarse si alguien lo reescribe.
