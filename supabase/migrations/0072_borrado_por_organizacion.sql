-- 0072_borrado_por_organizacion.sql — el índice que la 0071 le debía al canario C2.
--
-- QUÉ ARREGLA
--
--   C2: organization_id sin indice que empiece por ella: solicitudes_de_borrado
--
-- El C2 exige que toda tabla con `organization_id` tenga un índice cuya PRIMERA
-- columna sea esa, porque la política de RLS se convierte en un filtro y sin
-- índice cada lectura es un escaneo secuencial. La 0071 creó la tabla con su
-- índice de solicitudes abiertas, que empieza por `recibida_en` y por tanto no
-- cuenta.
--
-- POR QUÉ NO SE VIO ANTES DE APLICARLA
--
-- Porque los canarios necesitan levantar el esquema desde cero con Docker, y en
-- la máquina donde se escribió la 0071 Docker no estaba arrancado. La única
-- pasada real fue la de CI, después de empujar. Es el mismo agujero que dejó
-- pasar el `private` de la 0069: entre escribir SQL y verlo fallar hay un
-- despliegue de por medio.
--
-- Nota de estado: producción se quedó un rato incumpliendo el C2, porque allí la
-- 0071 se aplicó sin que nadie ejecutara los canarios contra ella. El canario
-- corre sobre un esquema construido desde cero en CI, no sobre producción.

create index if not exists solicitudes_de_borrado_org_idx
  on public.solicitudes_de_borrado (organization_id, recibida_en desc);
