-- 0105_una_plantilla_de_whatsapp_se_puede_mandar.sql — cerrar el único canal que no cerraba.
--
-- QUÉ FALTABA. Desde ayer se pueden crear plantillas de WhatsApp contra la WABA y
-- verlas con su estado. No se podían MANDAR. El despachador lo dice de su puño:
-- «la plantilla NO se elige automáticamente a propósito», y ahí se quedó. El
-- efecto para el operador es que fuera de las 24 horas WhatsApp no tiene salida:
-- ni texto —lo prohíbe Meta— ni plantilla —no está construido—.
--
-- LAS TRES PIEZAS QUE HACÍAN FALTA, y solo la tercera es nueva de verdad:
--
--   1. Decir QUÉ variable de Kavea rellena cada `{{n}}`. La columna existe desde
--      la 0042 —`plantillas.variables`, un array donde la posición manda— y
--      `renderizar_plantilla` ya la sabe usar. Faltaba una forma de rellenarla
--      que no fuera escribir JSON a mano.
--   2. Resolver esos huecos contra la tarjeta. También existía, dentro de
--      `renderizar_plantilla`, pero devolvía el texto entero y no los valores uno
--      a uno — y Meta pide los valores, no el texto.
--   3. Encolar el envío con la forma que WhatsApp exige.
--
-- POR QUÉ SE EXTRAE `private.valores_de_tarjeta`. Para (2) hacía falta el mismo
-- mapa de valores que ya construye `renderizar_plantilla`. Copiarlo habría dejado
-- dos listas de variables que se separan el día que alguien añada una: es
-- exactamente el fallo que ya costó una lista de campos de webhook duplicada e
-- incompleta. Se saca a una función y las dos la llaman.
--
-- Y LA VENTANA NO SE COMPRUEBA AQUÍ, al revés que en `encolar_envio`. Una
-- plantilla es precisamente la forma de escribir cuando la ventana está cerrada;
-- exigirla abierta convertiría esta función en una manera cara de hacer lo que ya
-- hace la otra.

-- ---------------------------------------------------------------------------
-- 1. El mapa de valores de una tarjeta, en un solo sitio.
-- ---------------------------------------------------------------------------
create or replace function private.valores_de_tarjeta(p_tarjeta uuid, p_actor uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_strip_nulls(jsonb_build_object(
    'contacto.nombre',  ct.nombre,
    'contacto.usuario', ct.username,
    'tarjeta.titulo',   t.titulo,
    'tarjeta.valor',    to_char(t.valor, 'FM999G999G990D00'),
    'tarjeta.moneda',   t.moneda,
    'tarjeta.etapa',    e.nombre,
    'agente.nombre',    (select coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email,'@',1))
                           from auth.users u where u.id = p_actor),
    'org.nombre',       o.nombre
  ) || coalesce((
    select jsonb_object_agg('campo.' || c.clave, cv.valor #>> '{}')
      from public.campo_valores cv
      join public.campos c on c.id = cv.campo_id
     where (cv.tarjeta_id = t.id or cv.contacto_id = t.contact_id)
       and cv.valor is not null
  ), '{}'::jsonb))
  from public.tarjetas t
  join public.organizations o on o.id = t.organization_id
  left join public.contacts ct on ct.id = t.contact_id
  left join public.etapas e on e.id = t.etapa_id
  where t.id = p_tarjeta;
$fn$;

revoke execute on function private.valores_de_tarjeta(uuid, uuid) from public, anon;
grant  execute on function private.valores_de_tarjeta(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Los valores POSICIONALES de una plantilla, que es lo que Meta pide.
--
-- Meta no quiere el texto montado: quiere `parameters: [{type:'text', text:…}]`
-- en orden. Devolver el texto y que el despachador lo trocee sería adivinar por
-- dónde cortarlo.
-- ---------------------------------------------------------------------------
create or replace function public.parametros_de_plantilla(p_plantilla uuid, p_tarjeta uuid)
returns table (valores text[], faltan text[])
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_tipo text; v_vars jsonb;
  v_valores jsonb; v_out text[] := '{}'; v_faltan text[] := '{}';
  v_i int; v_clave text; v_valor text;
begin
  select p.organization_id, p.tipo, p.variables
    into v_org, v_tipo, v_vars
    from public.plantillas p where p.id = p_plantilla;
  if v_org is null or not public.es_miembro(v_org) then
    raise exception 'No existe esa plantilla.' using errcode = 'P0002';
  end if;
  if v_tipo <> 'whatsapp' then
    raise exception 'Esa plantilla no es de WhatsApp.' using errcode = '22023';
  end if;

  v_valores := private.valores_de_tarjeta(p_tarjeta, (select auth.uid()));
  if v_valores is null then
    raise exception 'No existe esa tarjeta.' using errcode = 'P0002';
  end if;

  for v_i in 1 .. coalesce(jsonb_array_length(v_vars), 0) loop
    v_clave := v_vars ->> (v_i - 1);
    v_valor := v_valores ->> v_clave;
    if v_valor is null or btrim(v_valor) = '' then
      v_faltan := v_faltan || coalesce(v_clave, '{{' || v_i || '}}');
      v_valor := '';
    end if;
    v_out := v_out || v_valor;
  end loop;

  return query select v_out, v_faltan;
end $fn$;

revoke execute on function public.parametros_de_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.parametros_de_plantilla(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Vincular una plantilla aprobada de Meta con su mapeo.
--
-- Se guarda una fila local por plantilla de Meta que se quiera usar. No es una
-- copia del catálogo: es el MAPEO, que Meta no conoce ni puede conocer — Meta
-- sabe que hay un `{{1}}`, no que ese hueco es el nombre del contacto.
-- ---------------------------------------------------------------------------
create or replace function public.vincular_plantilla_whatsapp(
  p_org uuid, p_meta_nombre text, p_idioma text, p_categoria text,
  p_cuerpo text, p_variables jsonb
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_id uuid;
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'configurar') then
    raise exception 'No puedes configurar las plantillas de este espacio.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_meta_nombre), '') = '' then
    raise exception 'Falta el nombre en Meta.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_variables, '[]'::jsonb)) <> 'array' then
    raise exception 'El mapeo de variables tiene que ser una lista.' using errcode = '22023';
  end if;

  -- Una plantilla de Meta se identifica por nombre + idioma. Si ya estaba
  -- vinculada se actualiza el mapeo en vez de crear una segunda: dos filas para
  -- la misma plantilla de Meta harían que el compositor ofreciera lo mismo dos
  -- veces con mapeos distintos.
  select p.id into v_id
    from public.plantillas p
   where p.organization_id = p_org and p.tipo = 'whatsapp'
     and p.meta_nombre = p_meta_nombre and p.idioma = p_idioma
     and p.archivado_en is null;

  if v_id is null then
    insert into public.plantillas
      (organization_id, tipo, nombre, cuerpo, variables, categoria, idioma,
       estado, meta_nombre, creada_por)
    values
      (p_org, 'whatsapp', p_meta_nombre, p_cuerpo, coalesce(p_variables, '[]'::jsonb),
       coalesce(p_categoria, 'UTILITY'), p_idioma, 'aprobada', p_meta_nombre, v_user)
    returning id into v_id;
  else
    update public.plantillas
       set cuerpo = p_cuerpo,
           variables = coalesce(p_variables, '[]'::jsonb),
           categoria = coalesce(p_categoria, categoria),
           estado = 'aprobada',
           updated_at = now()
     where id = v_id;
  end if;

  perform private.registrar_actividad(
    p_org, 'plantilla.vinculada', 'usuario', null, v_user,
    jsonb_build_object('nombre', p_meta_nombre, 'idioma', p_idioma,
                       'huecos', jsonb_array_length(coalesce(p_variables, '[]'::jsonb))));

  return v_id;
end $fn$;

revoke execute on function public.vincular_plantilla_whatsapp(uuid, text, text, text, text, jsonb)
  from public, anon;
grant  execute on function public.vincular_plantilla_whatsapp(uuid, text, text, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Encolar el envío de una plantilla.
-- ---------------------------------------------------------------------------
create or replace function public.encolar_plantilla(p_conversacion uuid, p_plantilla uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_canal text; v_contacto uuid; v_tarjeta uuid; v_conexion uuid;
  v_user uuid := (select auth.uid());
  v_particion text; v_destino text; v_id uuid;
  v_meta text; v_idioma text; v_ptipo text; v_estado text; v_porg uuid;
  v_p record;
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

  -- SOLO WHATSAPP. Messenger tiene sus propias plantillas de utilidad y otra
  -- forma de enviarlas; mezclarlas aquí mandaría a Cloud API algo que no es suyo.
  if v_canal <> 'whatsapp' then
    raise exception 'Las plantillas solo se mandan por WhatsApp.' using errcode = '22023';
  end if;

  select p.meta_nombre, p.idioma, p.tipo, p.estado, p.organization_id
    into v_meta, v_idioma, v_ptipo, v_estado, v_porg
    from public.plantillas p where p.id = p_plantilla and p.archivado_en is null;

  if v_meta is null or v_porg <> v_org then
    raise exception 'Esa plantilla no existe en este espacio.' using errcode = 'P0002';
  end if;
  if v_ptipo <> 'whatsapp' then
    raise exception 'Esa plantilla no es de WhatsApp.' using errcode = '22023';
  end if;
  -- Mandar una sin aprobar es un error garantizado de Meta y una conversación
  -- facturada que no llega. Se para aquí.
  if v_estado <> 'aprobada' then
    raise exception 'Esa plantilla no está aprobada en Meta.' using errcode = '22023';
  end if;

  if v_tarjeta is null then
    raise exception 'Esa conversación no tiene ficha, y los huecos salen de la ficha.'
      using errcode = '22023';
  end if;

  select * into v_p from public.parametros_de_plantilla(p_plantilla, v_tarjeta);
  -- UN HUECO VACÍO NO SE MANDA. Meta rechaza el envío si faltan parámetros, y
  -- aunque lo aceptara, mandar «Hola , su pedido  ya va en camino» es peor que
  -- no mandar nada: se cobra igual y lo lee el cliente.
  if array_length(v_p.faltan, 1) > 0 then
    raise exception 'Faltan datos en la ficha para rellenar: %', array_to_string(v_p.faltan, ', ')
      using errcode = '22023';
  end if;

  -- La partición de WhatsApp es el `phone_number_id`, no la Página: es lo que
  -- lleva el `outbound_messages` de un envío de WhatsApp que ya funciona.
  select phone_number_id into v_particion
    from public.meta_connections where id = v_conexion;

  select scoped_id into v_destino
    from public.contact_identities
   where contact_id = v_contacto and canal = 'whatsapp'::public.canal_meta
   limit 1;
  if v_destino is null then
    raise exception 'No hay número de WhatsApp para este contacto.' using errcode = 'P0002';
  end if;

  insert into public.outbound_messages
    (organization_id, conversation_id, canal, particion, emisor, cuerpo, metadata)
  values
    (v_org, p_conversacion, 'whatsapp'::public.canal_meta, v_particion, 'humano',
     jsonb_build_object(
       'tipo', 'plantilla',
       'destinatario', v_destino,
       'plantilla', v_meta,
       'idioma', v_idioma,
       'parametros', to_jsonb(coalesce(v_p.valores, '{}'::text[]))),
     'kavea:' || gen_random_uuid()::text)
  returning id into v_id;

  perform private.registrar_actividad_tarjeta(
    v_org, v_tarjeta, 'plantilla.enviada', 'usuario', v_user,
    jsonb_build_object('nombre', v_meta, 'idioma', v_idioma, 'canal', 'whatsapp'));

  return v_id;
end $fn$;

revoke execute on function public.encolar_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.encolar_plantilla(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Las que el compositor puede ofrecer.
-- ---------------------------------------------------------------------------
create or replace function public.plantillas_whatsapp_usables(p_org uuid)
returns table (id uuid, nombre text, cuerpo text, idioma text, categoria text, huecos int)
language sql stable security definer set search_path = ''
as $fn$
  select p.id, p.nombre, p.cuerpo, p.idioma, p.categoria,
         coalesce(jsonb_array_length(p.variables), 0)
    from public.plantillas p
   where p.organization_id = p_org
     and p.tipo = 'whatsapp'
     and p.estado = 'aprobada'
     and p.archivado_en is null
     and public.es_miembro(p_org)
   order by p.nombre;
$fn$;

revoke execute on function public.plantillas_whatsapp_usables(uuid) from public, anon;
grant  execute on function public.plantillas_whatsapp_usables(uuid) to authenticated;
