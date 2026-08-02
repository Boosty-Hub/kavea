-- 0049_adjuntos_salientes.sql — enviar un archivo por la conversación.
-- Fuente: docs/fases/04-fase-envio.md T11, subordinado a docs/03-invariantes-meta.md.
--
-- LA DECISIÓN QUE ORDENA ESTE ARCHIVO
--
-- La URL que consume Meta se firma EN EL DESPACHO, no al encolar. Es la misma
-- razón por la que la ventana de 24 h se reevalúa allí: entre que el operador
-- pulsa y que la llamada sale pueden pasar quince minutos de bloqueo por
-- límites, y una URL firmada al encolar llegaría muerta. La cola guarda la RUTA
-- dentro del bucket; el despachador la convierte en URL justo antes de llamar.
--
-- Por eso el cuerpo no lleva ninguna URL. Si la llevara, quedaría escrita en una
-- tabla que los miembros leen, y una URL firmada en una fila legible es una URL
-- que sobrevive a la fila.
--
-- El carril `media` existe en `outbound_messages` desde 0034 y hasta ahora no lo
-- escribía nadie. Aquí empieza a usarse: en Messenger el carril de media va a
-- 10/s, treinta veces menos que el de texto, y mezclarlos en la misma cuenta es
-- cómo un envío de imágenes se lleva por delante las respuestas escritas.

-- ---------------------------------------------------------------------------
-- 1. Qué tipo de adjunto es, en un solo sitio
-- ---------------------------------------------------------------------------
-- La derivación vive en la base y viaja dentro del cuerpo. El despachador NO la
-- vuelve a calcular: dos derivaciones del mismo content_type son dos reglas, y
-- la que se olvide de actualizar manda un vídeo como 'file'.
create or replace function private.tipo_de_adjunto(p_content_type text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_content_type like 'image/%' then 'image'
    when p_content_type like 'audio/%' then 'audio'
    when p_content_type like 'video/%' then 'video'
    else 'file'
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. Encolar un archivo
-- ---------------------------------------------------------------------------
create or replace function public.encolar_archivo(p_conversacion uuid, p_archivo uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_canal text; v_contacto uuid; v_tarjeta uuid; v_conexion uuid;
  v_user uuid := (select auth.uid());
  v_v record; v_particion text; v_destino text; v_id uuid;
  v_org_a uuid; v_ruta text; v_nombre text; v_ct text;
  v_enviable boolean; v_motivo text; v_bytes bigint; v_tipo text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select c.organization_id, c.canal::text, c.contact_id, c.tarjeta_id, ch.meta_connection_id
    into v_org, v_canal, v_contacto, v_tarjeta, v_conexion
    from public.conversations c
    join public.channels ch on ch.id = c.channel_id
   where c.id = p_conversacion;

  if v_org is null then raise exception 'Esa conversación no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  select a.organization_id, a.storage_path, a.nombre, a.content_type,
         a.enviable, a.motivo_no_enviable, a.bytes
    into v_org_a, v_ruta, v_nombre, v_ct, v_enviable, v_motivo, v_bytes
    from public.archivos a where a.id = p_archivo;

  if v_org_a is null then raise exception 'Ese archivo no existe.' using errcode = 'P0002'; end if;
  -- Un archivo de otra organización no se envía por esta conversación aunque
  -- quien lo pida sea miembro de las dos.
  if v_org_a <> v_org then
    raise exception 'Ese archivo no es de esta organización.' using errcode = '42501';
  end if;

  -- `enviable` se calculó AL SUBIR. Se vuelve a mirar aquí porque la interfaz no
  -- es una barrera: esconder el botón evita el error honesto, no el deliberado.
  if not v_enviable then
    raise exception '%', coalesce(v_motivo, 'Meta no acepta este archivo.') using errcode = '22023';
  end if;

  v_tipo := private.tipo_de_adjunto(coalesce(v_ct, ''));

  -- Instagram no acepta documentos: admite imagen, audio y vídeo, y nada más.
  -- Se rechaza aquí y no se deja fallar en Meta porque el error que devuelve no
  -- le dice nada a nadie y gasta cuota del carril de media.
  --
  -- ASUNCIÓN A VERIFICAR: la lista de tipos aceptados en Instagram no está
  -- confirmada verbatim en fuente oficial para esta vía. Bloquear de más aquí
  -- cuesta un canal alternativo; dejar pasar de más cuesta un fallo delante del
  -- cliente. Se elige el error barato.
  if v_canal = 'instagram' and v_tipo = 'file' then
    raise exception 'Instagram solo acepta imágenes, audio y vídeo. Un documento hay que mandarlo por otro canal.'
      using errcode = '22023';
  end if;

  -- La ventana, por la misma función que usará el despachador. Igual que en
  -- `encolar_envio`: aquí se rechaza lo imposible, allí se decide.
  select * into v_v from public.ventana_de(p_conversacion, 'humano');
  if v_v.clase = 'cerrada' then
    raise exception '%', v_v.motivo using errcode = '42501';
  end if;

  select page_id, coalesce(ig_business_account_id, page_id)
    into v_particion, v_destino
    from public.meta_connections where id = v_conexion;
  if v_canal = 'instagram' then v_particion := v_destino; end if;

  select scoped_id into v_destino
    from public.contact_identities
   where contact_id = v_contacto and canal = v_canal::public.canal_meta
   limit 1;
  if v_destino is null then
    raise exception 'No hay identidad de % para este contacto.', v_canal using errcode = 'P0002';
  end if;

  insert into public.outbound_messages
    (organization_id, conversation_id, canal, particion, carril, emisor,
     messaging_type, tag, cuerpo, metadata)
  values
    (v_org, p_conversacion, v_canal::public.canal_meta, v_particion, 'media', 'humano',
     v_v.messaging_type, v_v.tag,
     jsonb_build_object(
       'tipo', v_tipo, 'ruta', v_ruta, 'nombre', v_nombre,
       'content_type', v_ct, 'archivo_id', p_archivo, 'destinatario', v_destino),
     'kavea:' || gen_random_uuid()::text)
  returning id into v_id;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'mensaje.encolado', 'usuario', v_user,
      jsonb_build_object('canal', v_canal, 'archivo', v_nombre, 'bytes', v_bytes,
                         'fuera_de_ventana', v_v.clase = 'humana'));
  end if;

  return v_id;
end $$;

revoke execute on function public.encolar_archivo(uuid, uuid) from public, anon;
revoke execute on function private.tipo_de_adjunto(text) from public, anon, authenticated;

comment on function public.encolar_archivo(uuid, uuid) is
  'Encola un archivo ya subido para enviarlo por una conversación. Guarda la '
  'RUTA, nunca una URL: la firma la hace el despachador justo antes de llamar '
  'a Meta, porque una URL firmada al encolar llega muerta tras un bloqueo.';

-- ---------------------------------------------------------------------------
-- 3. El hilo enseña el adjunto mientras el echo no llega
-- ---------------------------------------------------------------------------
-- Sin esto, un envío de imagen aparece como una burbuja vacía hasta que vuelve
-- el echo: el operador pulsa Enviar, ve un hueco y vuelve a pulsar.
--
-- Mismas columnas y mismos tipos que la versión de 0034, así que `create or
-- replace` vale. Lo único que cambia es lo que lleva dentro `detalle` en la
-- rama de la cola de salida.
create or replace view public.linea_tiempo
with (security_invoker = on) as
  select
    m.organization_id, m.conversation_id, c.tarjeta_id, c.canal::text as canal,
    'mensaje'::text as clase, m.id::text as ref, m.meta_timestamp as momento,
    case when m.deleted_at is not null then 'mensaje.borrado'
         when m.direccion = 'outbound' then 'mensaje.saliente'
         else 'mensaje.entrante' end as tipo,
    m.emisor as actor_tipo, null::uuid as actor_user_id, null::text as actor_nombre,
    jsonb_build_object(
      'texto', m.texto, 'direccion', m.direccion, 'is_echo', m.is_echo,
      'borrado', m.deleted_at is not null, 'editado', m.edited_at is not null,
      'adjuntos', (select count(*) from public.media md where md.message_id = m.id)
    ) as detalle
  from public.messages m
  join public.conversations c on c.id = m.conversation_id

  union all

  select
    e.organization_id, e.conversation_id, c.tarjeta_id, c.canal::text,
    'evento', e.id::text, e.meta_timestamp,
    'evento.' || e.tipo, 'contacto', null::uuid, null::text,
    jsonb_build_object('emoji', e.emoji, 'accion', e.accion, 'target_mid', e.target_mid)
  from public.message_events e
  join public.conversations c on c.id = e.conversation_id
  where e.tipo not in ('delete','edit')

  union all

  select
    a.organization_id, a.conversation_id, c.tarjeta_id, c.canal::text,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  join public.conversations c on c.id = a.conversation_id
  where a.conversation_id is not null

  union all

  select
    a.organization_id, null::uuid, a.tarjeta_id, null::text,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  where a.tarjeta_id is not null

  union all

  select
    o.organization_id, o.conversation_id, c.tarjeta_id, o.canal::text,
    'mensaje', 'out-' || o.id::text, o.created_at,
    'mensaje.saliente',
    o.emisor, null::uuid, null::text,
    jsonb_build_object(
      'texto', o.cuerpo->>'texto', 'direccion', 'outbound', 'is_echo', false,
      'borrado', false, 'editado', false,
      'adjuntos', case when o.carril = 'media' then 1 else 0 end,
      -- El nombre, no la ruta: la ruta es de dentro del bucket y no pinta nada
      -- en una pantalla.
      'adjunto_nombre', o.cuerpo->>'nombre',
      'adjunto_tipo', o.cuerpo->>'tipo',
      'envio_estado', o.estado, 'envio_error', o.error_mensaje,
      'fuera_de_ventana', o.tag is not null)
  from public.outbound_messages o
  join public.conversations c on c.id = o.conversation_id
  where o.estado <> 'enviado'
     or not exists (
       select 1 from public.messages m
        where m.organization_id = o.organization_id
          and m.canal = o.canal
          and m.mid = o.mid_devuelto
     );
