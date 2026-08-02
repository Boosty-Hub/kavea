-- Canarios de esquema.
--
-- No comprueban una tabla concreta: se generan desde pg_catalog, así que cubren
-- también las tablas que creen las fases futuras. Un canario que hay que
-- actualizar a mano cada vez que se añade una tabla deja de correrse.
--
-- Cada consulta devuelve CERO filas cuando todo está bien. Cualquier fila es un
-- fallo con nombre y apellido.
--
-- Uso: psql -f canarios.sql, o vía la API de gestión. En CI, cualquier fila
-- devuelta rompe el build.

\echo '== C1: toda tabla de negocio con RLS activo y forzado =='
select n.nspname || '.' || c.relname as tabla,
       c.relrowsecurity   as rls_activo,
       c.relforcerowsecurity as rls_forzado
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'private')
   and c.relkind = 'r'
   and c.relname <> 'schema_migrations'
   and not (c.relrowsecurity and c.relforcerowsecurity)
 order by 1;

\echo '== C2: tabla con organization_id sin indice que empiece por esa columna =='
-- La politica de RLS se convierte en un filtro. Sin indice, cada lectura de
-- bandeja es un escaneo secuencial.
select c.relname as tabla
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
                     and a.attname = 'organization_id'
                     and a.attnum > 0
                     and not a.attisdropped
 where n.nspname = 'public'
   and c.relkind = 'r'
   and not exists (
     select 1 from pg_index i
      where i.indrelid = c.oid
        and i.indkey[0] = a.attnum
   )
 order by 1;

\echo '== C3: auth.uid() sin envolver en subconsulta =='
-- Sin envolver, Postgres lo evalua una vez POR FILA en lugar de una vez por
-- consulta. En una bandeja con cientos de miles de mensajes la diferencia no es
-- cosmetica.
--
-- OJO con el patron: Postgres renderiza la forma envuelta como
--   ( SELECT auth.uid() AS uid)
-- en mayusculas y con alias. Un patron que busque 'select auth.uid()' en
-- minusculas y sin alias da FALSO POSITIVO sobre politicas correctas, y un
-- canario que grita en falso se acaba ignorando.
select c.relname as tabla,
       p.polname as politica,
       pg_get_expr(p.polqual, p.polrelid) as expresion
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
 where pg_get_expr(p.polqual, p.polrelid) ~* 'auth\.uid\s*\(\s*\)'
   and pg_get_expr(p.polqual, p.polrelid) !~* '\(\s*SELECT\s+auth\.uid\s*\(\s*\)'
 order by 1, 2;

\echo '== C4: tabla con RLS activo y cero politicas, fuera de las esperadas =='
-- webhook_events es deliberadamente asi: deniega todo. Cualquier otra tabla en
-- ese estado es un olvido que deja los datos inaccesibles.
select c.relname as tabla
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relrowsecurity
   and c.relname not in ('webhook_events', 'schema_migrations')
   and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
 order by 1;

\echo '== C5: clave foranea a una tabla con organization_id que no es compuesta =='
-- La integridad referencial de Postgres SALTA RLS, igual que el rol de servicio.
-- Sin clave compuesta, una fila de la organizacion A puede apuntar a una fila de
-- la B, y RLS no lo detecta porque cada fila cumple su propia politica.
select con.conname     as restriccion,
       hijo.relname    as tabla_hija,
       padre.relname   as tabla_padre
  from pg_constraint con
  join pg_class hijo  on hijo.oid  = con.conrelid
  join pg_class padre on padre.oid = con.confrelid
  join pg_namespace n on n.oid = hijo.relnamespace
 where con.contype = 'f'
   and n.nspname = 'public'
   and array_length(con.conkey, 1) = 1
   -- el padre tiene organization_id, asi que la relacion es intra-tenant
   and exists (
     select 1 from pg_attribute a
      where a.attrelid = padre.oid and a.attname = 'organization_id' and not a.attisdropped
   )
   -- y el hijo tambien
   and exists (
     select 1 from pg_attribute a
      where a.attrelid = hijo.oid and a.attname = 'organization_id' and not a.attisdropped
   )
   -- salvo la propia referencia a organizations, que es simple por definicion
   and padre.relname <> 'organizations'
 order by 2, 1;
