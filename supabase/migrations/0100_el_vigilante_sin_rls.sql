-- 0100_el_vigilante_sin_rls.sql — `private.revision_permisos` se creó sin RLS.
--
-- LO CAZÓ EL CANARIO C1, no una persona: «C1: tablas sin RLS activo y forzado:
-- private.revision_permisos». La 0099 creó la tabla y se olvidó de las dos líneas
-- que llevan todas las demás. Estar en el esquema `private` —que PostgREST no
-- expone— hace que no sea alcanzable desde fuera, y por eso el olvido no rompió
-- nada visible; pero eso es exactamente la razón por la que el canario existe:
-- una tabla que hoy nadie puede leer desde fuera es una tabla que mañana alguien
-- expone sin darse cuenta de que no tenía red.
--
-- Y FORCE IMPORTA MÁS QUE ENABLE en este caso. Sin `force`, el dueño de la tabla
-- se salta sus propias políticas, y todo lo que la toca son funciones
-- `security definer` que corren precisamente como ese dueño.
--
-- NINGUNA POLÍTICA, a propósito. Nadie tiene que leer esta tabla más que las dos
-- funciones de la 0099, y esas pasan por encima de RLS por ser definer. Un
-- `select` desde una sesión de cliente no debe devolver nada, y sin políticas no
-- devuelve nada.

alter table private.revision_permisos enable row level security;
alter table private.revision_permisos force  row level security;

revoke all on private.revision_permisos from anon, authenticated;
