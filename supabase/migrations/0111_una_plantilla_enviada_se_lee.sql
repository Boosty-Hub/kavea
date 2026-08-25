-- 0111_una_plantilla_enviada_se_lee.sql — la burbuja decía «Sin contenido».
--
-- Se manda una plantilla fuera de las 24 horas, llega al cliente, y en el hilo
-- de Kavea la burbuja sale con «Sin contenido». La actividad de al lado sí dice
-- «envió la plantilla hello_world», así que la información existía: lo que no
-- había era el texto.
--
-- La causa está en la vista: `'texto', o.cuerpo->>'texto'`. Un mensaje normal
-- guarda su texto ahí; una plantilla guarda el NOMBRE y los VALORES, porque el
-- texto lo monta Meta a partir de la plantilla aprobada. Nadie lo recomponía.
--
-- Se recompone aquí, con lo que la cola ya guarda: el nombre, los valores y —si
-- la plantilla usa `parameter_format: NAMED`— los nombres de los huecos. El
-- cuerpo aprobado vive en `public.plantillas`, emparejado por nombre.
--
-- POR QUÉ NO SE GUARDA EL TEXTO YA MONTADO AL ENCOLAR. Porque entonces habría
-- dos versiones de la misma frase y la de Kavea envejecería: la plantilla se
-- puede editar en Meta y lo que el cliente recibe cambia. Recomponer al leer
-- siempre enseña la plantilla que Meta tiene hoy.

-- ---------------------------------------------------------------------------
-- 1. El texto de una plantilla, con sus huecos rellenos.
-- ---------------------------------------------------------------------------
create or replace function private.texto_de_plantilla(
  p_org         uuid,
  p_nombre      text,
  p_parametros  jsonb,
  p_nombres     jsonb
) returns text
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_cuerpo text;
  v_i      int;
  v_valor  text;
  v_hueco  text;
begin
  if p_nombre is null then
    return null;
  end if;

  select p.cuerpo into v_cuerpo
    from public.plantillas p
   where p.organization_id = p_org
     and p.nombre = p_nombre
     and p.tipo = 'whatsapp'
     and p.archivado_en is null
   limit 1;

  -- Sin cuerpo local no se inventa nada: quien llama decide qué poner.
  if v_cuerpo is null then
    return null;
  end if;

  for v_i in 0 .. coalesce(jsonb_array_length(p_parametros), 0) - 1 loop
    v_valor := p_parametros ->> v_i;

    -- Con nombre el hueco es `{{presupuesto}}`; sin nombre, `{{1}}`. Los valores
    -- viajan en el mismo orden que los nombres, que es como se encolaron.
    if p_nombres is not null and jsonb_array_length(p_nombres) > v_i then
      v_hueco := '{{' || (p_nombres ->> v_i) || '}}';
    else
      v_hueco := '{{' || (v_i + 1)::text || '}}';
    end if;

    v_cuerpo := replace(v_cuerpo, v_hueco, coalesce(v_valor, ''));
  end loop;

  return v_cuerpo;
end $fn$;

revoke execute on function private.texto_de_plantilla(uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function private.texto_de_plantilla(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. El hilo, con el texto de la plantilla en su burbuja.
--
-- La vista se reescribe entera porque `create or replace view` no admite
-- cambiar una rama sola. Solo cambia la última: la de la cola.
-- ---------------------------------------------------------------------------
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
      -- UNA PLANTILLA TAMBIÉN TIENE TEXTO, solo que hay que recomponerlo.
      'texto', coalesce(
        o.cuerpo->>'texto',
        private.texto_de_plantilla(
          o.organization_id, o.cuerpo->>'plantilla',
          o.cuerpo->'parametros', o.cuerpo->'nombres')),
      'direccion', 'outbound', 'is_echo', false,
      'borrado', false, 'editado', false,
      'adjuntos', case when o.carril = 'media' then 1 else 0 end,
      -- El nombre, no la ruta: la ruta es de dentro del bucket y no pinta nada
      -- en una pantalla.
      'adjunto_nombre', o.cuerpo->>'nombre',
      'adjunto_tipo', o.cuerpo->>'tipo',
      -- Para que la burbuja pueda decir de qué plantilla salió, que es dato y no
      -- adorno: el operador necesita saber cuál de las aprobadas se gastó.
      'plantilla', o.cuerpo->>'plantilla',
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
