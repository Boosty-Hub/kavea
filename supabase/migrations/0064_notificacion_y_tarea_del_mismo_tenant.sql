-- 0064_notificacion_y_tarea_del_mismo_tenant.sql — componer la clave que faltaba.
--
-- QUÉ ARREGLA
--
-- El canario C5 exige que toda clave foránea entre dos tablas con
-- `organization_id` sea COMPUESTA, e incluya la organización. El motivo está en su
-- comentario y no es teórico: **la integridad referencial de Postgres salta RLS**,
-- igual que el rol de servicio. Con una clave de una sola columna, una fila de la
-- organización A puede apuntar a una de la B y RLS no lo detecta, porque cada una
-- de las dos filas cumple su propia política por separado.
--
--   C5: claves foraneas intra-tenant sin componer: notificaciones_tarea_id_fkey
--
-- Y era un olvido, no una decisión: en la MISMA tabla, `tarjeta_id` sí está
-- compuesta, con el nombre `notificaciones_tarjeta_mismo_tenant`. Además `tareas`
-- ya tenía `tareas_org_id_uniq UNIQUE (organization_id, id)`, que existe
-- exactamente para poder apuntar a ella de forma compuesta. Alguien preparó el
-- terreno y se dejó la clave.
--
-- POR QUÉ LLEVABA DÍAS SIN VERSE
--
-- `canarios.sql` corre con `ON_ERROR_STOP=1`, así que los canarios se tapan unos a
-- otros. C2 fallaba desde el 3 de agosto y abortaba el fichero, con C4 y C5
-- escondidos detrás. Arreglar C2 destapó C4, y arreglar C4 destapó esto. Ninguno
-- de los tres es una regresión nueva.
--
-- COMPROBADO ANTES: cero filas violan la restricción, así que entra sin migrar
-- datos. Si algún día no fuera cero, el ALTER falla en voz alta y eso es lo
-- correcto: significaría que ya hay una notificación mirando la tarea de otro
-- cliente.

alter table public.notificaciones
  drop constraint notificaciones_tarea_id_fkey;

alter table public.notificaciones
  add constraint notificaciones_tarea_mismo_tenant
  foreign key (organization_id, tarea_id)
  references public.tareas (organization_id, id)
  on delete cascade;

comment on constraint notificaciones_tarea_mismo_tenant on public.notificaciones is
  'Compuesta a proposito: la integridad referencial de Postgres salta RLS, asi que '
  'una clave de una sola columna permitiria que una notificacion de un cliente '
  'apuntara a la tarea de otro. Mismo patron que notificaciones_tarjeta_mismo_tenant.';
