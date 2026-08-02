-- 0022_actividades.sql — registro de actividad en la conversación.
--
-- REQUISITO: todo lo que alguien hace en el sistema tiene que verse en la
-- conversación, junto a los mensajes. No en una pantalla de auditoría aparte
-- que nadie abre: en el hilo, donde ocurre el trabajo.
--
-- Eso convierte la conversación en una línea de tiempo única que mezcla tres
-- cosas: lo que dijo el contacto, lo que pasó en Meta, y lo que hizo el equipo.

create table public.actividades (
  id               bigserial primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- Nullable: hay actividad que no pertenece a un hilo, como conectar un canal
  -- o abrir un acceso temporal. Esa sale en el registro de la organización, no
  -- en una conversación.
  conversation_id  uuid,

  -- Sin CHECK cerrado, por la misma razón que en el resto del esquema: una
  -- actividad nueva no puede convertirse en un insert fallido. Vocabulario
  -- esperado, y la interfaz cae a un texto genérico ante uno desconocido:
  --
  --   conversacion.asignada | conversacion.desasignada
  --   conversacion.estado   | conversacion.cerrada | conversacion.reabierta
  --   nota.añadida
  --   mensaje.enviado       | mensaje.fallido
  --   etiqueta.puesta       | etiqueta.quitada
  --   contacto.editado
  --   canal.pausado         | canal.activado
  --   agente.sugirio        | agente.aprobado | agente.descartado | agente.escalo
  --   breakglass.abierto
  --   ventana.expirada
  tipo  text not null,

  -- Quién. `sistema` es Kavea actuando sola: cierre por inactividad, ventana
  -- vencida, canal pausado por una restricción de Meta.
  actor_tipo    text not null check (actor_tipo in ('usuario','agente','sistema','contacto')),
  actor_user_id uuid references auth.users(id) on delete set null,

  -- Instantánea del nombre EN EL MOMENTO del hecho.
  --
  -- No es desnormalización perezosa: si la persona se va de la empresa y su
  -- usuario se borra, `actor_user_id` queda nulo y el registro diría que "nadie"
  -- cerró la conversación. Un registro de auditoría que pierde a su actor deja
  -- de ser auditoría.
  actor_nombre  text,

  -- Metadatos del hecho: valores antes y después, motivo, identificadores.
  -- NUNCA contenido de mensajes, salvo el texto de una nota, que ES la nota.
  detalle jsonb not null default '{}'::jsonb,

  -- `equipo` no se muestra al contacto si algún día hay superficie para él.
  -- Hoy todo es interno; la distinción existe para no tener que retro-etiquetar
  -- miles de filas cuando haga falta.
  visibilidad text not null default 'equipo' check (visibilidad in ('equipo','todos')),

  created_at timestamptz not null default now(),

  constraint actividades_conversacion_mismo_tenant
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade
);

-- La consulta que sirve el hilo: por conversación y en orden cronológico.
create index actividades_hilo_idx
  on public.actividades (organization_id, conversation_id, created_at desc)
  where conversation_id is not null;

-- Actividad de organización, la que no cuelga de un hilo.
create index actividades_org_idx
  on public.actividades (organization_id, created_at desc);

create index actividades_actor_idx
  on public.actividades (organization_id, actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.actividades enable row level security;
alter table public.actividades force  row level security;

create policy actividades_select on public.actividades
  for select to authenticated
  using (public.es_miembro(organization_id));

-- NO hay política de insert, update ni delete para `authenticated`.
--
-- Se escribe desde el servidor, con rol de servicio, junto a la acción que
-- registra. Si un miembro pudiera insertar, podría fabricar actividad; si
-- pudiera actualizar o borrar, podría reescribir la suya. Un registro que el
-- auditado puede editar no es un registro.

-- ---------------------------------------------------------------------------
-- Cómo se escribe
-- ---------------------------------------------------------------------------
create or replace function private.registrar_actividad(
  p_org        uuid,
  p_tipo       text,
  p_actor_tipo text,
  p_conv       uuid    default null,
  p_user       uuid    default null,
  p_detalle    jsonb   default '{}'::jsonb,
  p_visibilidad text   default 'equipo'
)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id bigint; v_nombre text;
begin
  -- La instantánea del nombre se toma aquí, no en el llamante: así ninguna
  -- ruta puede olvidarla.
  if p_user is not null then
    select coalesce(u.raw_user_meta_data->>'nombre', u.email)
      into v_nombre from auth.users u where u.id = p_user;
  elsif p_actor_tipo = 'agente' then
    v_nombre := 'Agente';
  elsif p_actor_tipo = 'sistema' then
    v_nombre := 'Kavea';
  end if;

  insert into public.actividades
    (organization_id, conversation_id, tipo, actor_tipo, actor_user_id, actor_nombre,
     detalle, visibilidad)
  values
    (p_org, p_conv, p_tipo, p_actor_tipo, p_user, v_nombre, coalesce(p_detalle,'{}'::jsonb),
     coalesce(p_visibilidad,'equipo'))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function private.registrar_actividad(uuid,text,text,uuid,uuid,jsonb,text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Actividad automática: lo que cambia en `conversations` se registra solo
-- ---------------------------------------------------------------------------
-- Depender de que cada ruta de la aplicación se acuerde de registrar es
-- garantizar que alguna no lo haga. El cambio de estado y la asignación son
-- columnas, así que el trigger los ve pase lo que pase.
create or replace function private.actividad_de_conversacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if new.estado is distinct from old.estado then
    perform private.registrar_actividad(
      new.organization_id,
      case new.estado when 'cerrada' then 'conversacion.cerrada' else 'conversacion.estado' end,
      case when v_user is null then 'sistema' else 'usuario' end,
      new.id, v_user,
      jsonb_build_object('de', old.estado, 'a', new.estado)
    );
  end if;

  if new.asignado_a is distinct from old.asignado_a then
    perform private.registrar_actividad(
      new.organization_id,
      case when new.asignado_a is null then 'conversacion.desasignada' else 'conversacion.asignada' end,
      case when v_user is null then 'sistema' else 'usuario' end,
      new.id, v_user,
      jsonb_build_object(
        'de', old.asignado_a, 'a', new.asignado_a,
        'a_nombre', (select coalesce(u.raw_user_meta_data->>'nombre', u.email)
                       from auth.users u where u.id = new.asignado_a))
    );
  end if;

  return new;
end $$;

create trigger conversations_actividad
  after update on public.conversations
  for each row execute function private.actividad_de_conversacion();

-- ---------------------------------------------------------------------------
-- La línea de tiempo: una sola consulta para pintar el hilo
-- ---------------------------------------------------------------------------
-- Mezcla mensajes, eventos de Meta y actividad del equipo en orden. La
-- alternativa —tres consultas y ordenar en el cliente— rompe la paginación:
-- no se puede paginar una mezcla que se ordena después de traerla.
create or replace view public.linea_tiempo as
  select
    m.organization_id,
    m.conversation_id,
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

  union all

  select
    e.organization_id, e.conversation_id, 'evento', e.id::text, e.meta_timestamp,
    'evento.' || e.tipo, 'contacto', null::uuid, null::text,
    jsonb_build_object('emoji', e.emoji, 'accion', e.accion, 'target_mid', e.target_mid)
  from public.message_events e
  -- Los borrados y ediciones ya se ven en el mensaje: repetirlos como evento
  -- llenaría el hilo de ruido.
  where e.tipo not in ('delete','edit')

  union all

  select
    a.organization_id, a.conversation_id, 'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  where a.conversation_id is not null;

-- La vista hereda la RLS de las tablas base: no lleva security_invoker porque
-- en Postgres 15+ las vistas son security_invoker por defecto en Supabase, y
-- las tres tablas ya filtran por es_miembro.
comment on view public.linea_tiempo is
  'Hilo unificado: mensajes, eventos de Meta y actividad del equipo en una sola '
  'consulta ordenable y paginable. Hereda RLS de las tablas base.';
