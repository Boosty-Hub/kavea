-- 0029_vistas_tarjeta.sql — el hilo se lee por tarjeta y sabe de qué canal viene cada cosa.
--
-- NOTA SOBRE 0027: su comentario anuncia que esta migración quita
-- `conversations.estado` y `conversations.asignado_a`. No las quita, y es
-- deliberado. Las migraciones se aplican antes que el despliegue de la
-- aplicación, así que entre una cosa y otra hay unos minutos en los que la
-- versión viva todavía lee esas columnas. Quitarlas aquí sería tumbar la
-- bandeja durante ese hueco. Las quita una migración posterior, cuando la
-- aplicación desplegada ya no las mire. Las migraciones aplicadas no se editan,
-- así que la corrección va aquí y no allí.

-- ---------------------------------------------------------------------------
-- La línea de tiempo, ahora por tarjeta
-- ---------------------------------------------------------------------------
-- Añade `tarjeta_id` y `canal` a cada entrada. El canal es lo que permite
-- pintar un hilo de dos canales sin que el operador tenga que adivinar por
-- dónde llegó cada mensaje.
--
-- Se mantiene `conversation_id`: el compositor de la fase 4 responde a una
-- conversación concreta, no a la tarjeta, porque el token y la ventana son de
-- esa conversación.
--
-- Se DESTRUYE y se recrea en vez de `create or replace`: reemplazar una vista
-- solo permite añadir columnas al final, y estas dos van en medio para que el
-- orden se lea. Postgres responde "cannot change name of view column" si se
-- intenta. Al ir dentro de la misma transacción que la creación, no hay ningún
-- instante en el que la vista no exista para quien esté consultando.
drop view public.linea_tiempo;

create view public.linea_tiempo
with (security_invoker = on) as
  select
    m.organization_id,
    m.conversation_id,
    c.tarjeta_id,
    c.canal,
    'mensaje'::text            as clase,
    m.id::text                 as ref,
    m.meta_timestamp           as momento,
    case when m.deleted_at is not null then 'mensaje.borrado'
         when m.direccion = 'outbound' then 'mensaje.saliente'
         else 'mensaje.entrante' end as tipo,
    m.emisor                   as actor_tipo,
    null::uuid                 as actor_user_id,
    null::text                 as actor_nombre,
    jsonb_build_object(
      'texto', m.texto,
      'direccion', m.direccion,
      'is_echo', m.is_echo,
      'borrado', m.deleted_at is not null,
      'editado', m.edited_at is not null,
      'adjuntos', (select count(*) from public.media md where md.message_id = m.id)
    )                          as detalle
  from public.messages m
  join public.conversations c on c.id = m.conversation_id

  union all

  select
    e.organization_id, e.conversation_id, c.tarjeta_id, c.canal,
    'evento', e.id::text, e.meta_timestamp,
    'evento.' || e.tipo, 'contacto', null::uuid, null::text,
    jsonb_build_object('emoji', e.emoji, 'accion', e.accion, 'target_mid', e.target_mid)
  from public.message_events e
  join public.conversations c on c.id = e.conversation_id
  where e.tipo not in ('delete','edit')

  union all

  select
    a.organization_id, a.conversation_id, c.tarjeta_id, c.canal,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  join public.conversations c on c.id = a.conversation_id
  where a.conversation_id is not null;

comment on view public.linea_tiempo is
  'Hilo unificado por tarjeta: mensajes, eventos de Meta y actividad del equipo, '
  'cada entrada con su canal. security_invoker = on: se evalúa con los permisos '
  'y la RLS de quien consulta. No quitar esa opción.';

-- ---------------------------------------------------------------------------
-- Los canales de una persona, apuntando a la tarjeta
-- ---------------------------------------------------------------------------
drop view public.persona_canales;

create view public.persona_canales
with (security_invoker = on) as
  select
    ci.organization_id,
    ci.contact_id,
    ci.id            as identidad_id,
    ci.canal,
    ci.scoped_id,
    ci.origen,
    coalesce(ci.etiqueta, c.username, ci.scoped_id) as etiqueta,
    (select v.tarjeta_id
       from public.conversations v
      where v.contact_id = ci.contact_id
        and v.canal = ci.canal
        and v.cerrada_en is null
      order by v.last_message_at desc nulls last
      limit 1)       as tarjeta_abierta
  from public.contact_identities ci
  join public.contacts c on c.id = ci.contact_id;

comment on view public.persona_canales is
  'Los canales por los que se puede hablar con una persona, con la tarjeta '
  'abierta de cada uno si la hay. Una fila por identidad.';

-- ---------------------------------------------------------------------------
-- La ficha: campos con su definición al lado
-- ---------------------------------------------------------------------------
-- La interfaz necesita pintar TODOS los campos definidos, tengan valor o no:
-- un formulario que solo muestra lo que ya está relleno no se puede rellenar.
-- Por eso es un left join desde las definiciones, no desde los valores.
create view public.ficha_tarjeta
with (security_invoker = on) as
  select
    t.organization_id,
    t.id            as tarjeta_id,
    ca.id           as campo_id,
    ca.clave, ca.etiqueta, ca.tipo, ca.opciones, ca.ayuda,
    ca.obligatorio, ca.orden,
    cv.valor,
    cv.actualizado_en
  from public.tarjetas t
  join public.campos ca
    on ca.organization_id = t.organization_id
   and ca.ambito = 'tarjeta'
   and ca.archivado_en is null
  left join public.campo_valores cv
    on cv.campo_id = ca.id and cv.tarjeta_id = t.id;

create view public.ficha_contacto
with (security_invoker = on) as
  select
    ct.organization_id,
    ct.id           as contacto_id,
    ca.id           as campo_id,
    ca.clave, ca.etiqueta, ca.tipo, ca.opciones, ca.ayuda,
    ca.obligatorio, ca.orden,
    cv.valor,
    cv.actualizado_en
  from public.contacts ct
  join public.campos ca
    on ca.organization_id = ct.organization_id
   and ca.ambito = 'contacto'
   and ca.archivado_en is null
  left join public.campo_valores cv
    on cv.campo_id = ca.id and cv.contacto_id = ct.id;
