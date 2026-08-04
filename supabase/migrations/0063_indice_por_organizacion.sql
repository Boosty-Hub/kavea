-- 0063_indice_por_organizacion.sql — los dos índices que el canario C2 pedía.
--
-- QUÉ ESTABA ROJO
--
-- El canario C2 de `supabase/tests/canarios.sql` exige que toda tabla con
-- `organization_id` tenga un índice que EMPIECE por esa columna, y llevaba desde
-- el 3 de agosto de 2026 tumbando el job de esquema en CI:
--
--   C2: organization_id sin indice que empiece por ella: rate_limit_usage, notificaciones
--
-- No es una regla de estilo. RLS añade `organization_id = ...` a cada consulta, y
-- si ninguna columna inicial del índice es esa, Postgres no puede usar el índice
-- para el predicado de la política: recorre y filtra. Con una tabla pequeña no se
-- nota y con la tabla del cliente número cuarenta, sí. Es la clase de lentitud
-- que nadie sabe atribuir a su causa.
--
-- POR QUÉ ESTOS DOS ÍNDICES Y NO SOLO LA COLUMNA SUELTA
--
-- `notificaciones` ya tiene `(user_id, created_at desc)` para «mis
-- notificaciones». Un índice de una sola columna sobre `organization_id`
-- satisfaría al canario y no serviría para ninguna consulta real. Con
-- `(organization_id, user_id, created_at desc)` el mismo índice cubre el
-- predicado de RLS y el listado por persona en orden.
--
-- `rate_limit_usage` ya tiene `(particion, observed_at desc)`, que es como lo
-- consulta el despachador. El nuevo es para leer el consumo de un tenant en el
-- tiempo, que es la consulta del panel de uso.

create index notificaciones_org_idx
  on public.notificaciones (organization_id, user_id, created_at desc);

create index rate_limit_usage_org_idx
  on public.rate_limit_usage (organization_id, observed_at desc);

comment on index public.notificaciones_org_idx is
  'Cubre el predicado de RLS y el listado por persona con un solo indice. '
  'Anadido por el canario C2, que llevaba un dia en rojo.';

comment on index public.rate_limit_usage_org_idx is
  'Consumo de un tenant en el tiempo. El de particion sigue sirviendo al '
  'despachador, que es otra consulta.';
