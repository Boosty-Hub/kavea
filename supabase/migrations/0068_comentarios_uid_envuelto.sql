-- 0068_comentarios_uid_envuelto.sql — envolver auth.uid() en la política de comentarios.
--
-- QUÉ ARREGLA
--
-- El canario C3 exige que `auth.uid()` dentro de una política vaya envuelto en
-- subconsulta. Sin envolver, Postgres no puede tratarlo como InitPlan y lo evalúa
-- una vez POR FILA en lugar de una vez por consulta:
--
--   C3: auth.uid() sin envolver en: comentarios.comentarios_lee_miembro
--
-- La 0066 lo escribió sin envolver y desde entonces CI está en rojo: el job
-- «Esquema desde cero y aislamiento» aborta aquí, y como `canarios.sql` corre con
-- ON_ERROR_STOP=1, todo lo que vaya detrás de C3 lleva desde el 4 de agosto sin
-- comprobarse. No es solo esta política la que estaba sin verificar.
--
-- POR QUÉ UNA MIGRACIÓN NUEVA Y NO EDITAR LA 0066
--
-- La 0066 ya está aplicada en producción. Reescribirla dejaría el fichero
-- diciendo una cosa y la base otra, que es la deriva que el registro de
-- migraciones existe para impedir. Hacia delante siempre.
--
-- LO QUE NO CAMBIA: la semántica. Es la misma condición de pertenencia, con la
-- misma tabla y la misma columna. Solo cambia cuántas veces se evalúa.
--
-- Los `auth.uid()` de la 0067 se quedan como están, a propósito: viven en cuerpos
-- de `plpgsql`, no en políticas. Ahí se evalúan una vez por llamada y envolverlos
-- no compra nada. El canario mira `pg_policy` y tampoco los ve.

drop policy if exists comentarios_lee_miembro on public.comentarios;
create policy comentarios_lee_miembro on public.comentarios
  for select to authenticated
  using (exists (
    select 1 from public.organization_members m
     where m.organization_id = comentarios.organization_id
       and m.user_id = (select auth.uid())
  ));
