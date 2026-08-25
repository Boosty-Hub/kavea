-- 0112_una_plantilla_de_pagina_tambien_se_manda.sql
--
-- Kavea sabía CREAR las plantillas de utilidad de la Página y LISTARLAS, pero no
-- mandarlas: el carril de plantilla vivía entero dentro de la rama de WhatsApp
-- del despachador. La nota de rechazo de `pages_utility_messaging` pide tres
-- cosas y la tercera es «sending the message to a test recipient and showing the
-- delivered template message in the native client», así que sin esto el permiso
-- se volvía a pedir con dos de tres.
--
-- La vía existe y se sondeó ANTES de escribir nada: `POST /{page-id}/messages`
-- con `messaging_type` en UTILITY y `message.template`. Con un destinatario
-- inválido a propósito, Meta se queja del DESTINATARIO y no de la forma, que es
-- como se comprueba que una forma se acepta sin mandarle nada a nadie.
--
-- NO SE DUPLICA LA LÓGICA DE WHATSAPP. Vincular era una función por canal a punto
-- de ser dos copias de cincuenta líneas que se separarían en el primer arreglo
-- que se hiciera solo en una. El cuerpo pasa a `private.vincular_plantilla_meta`
-- y las dos públicas son envoltorios.

-- ---------------------------------------------------------------------------
-- 1. La tabla tiene que admitir el tipo nuevo.
--
-- `plantillas_estado_coherente` decía «solo las de WhatsApp pueden estar en un
-- estado que no sea borrador», que era cierto cuando WhatsApp era el único canal
-- con aprobación de Meta. Las de la Página también la tienen.
-- ---------------------------------------------------------------------------
alter table public.plantillas drop constraint if exists plantillas_tipo_check;
alter table public.plantillas add  constraint plantillas_tipo_check
  check (tipo in ('interna', 'whatsapp', 'messenger'));

alter table public.plantillas drop constraint if exists plantillas_estado_coherente;
alter table public.plantillas add  constraint plantillas_estado_coherente
  check (tipo in ('whatsapp', 'messenger') or estado = 'borrador');

alter table public.plantillas drop constraint if exists plantillas_whatsapp_completa;
alter table public.plantillas drop constraint if exists plantillas_de_meta_completa;
alter table public.plantillas add  constraint plantillas_de_meta_completa
  check (tipo not in ('whatsapp', 'messenger')
         or (categoria is not null and idioma is not null));

-- ---------------------------------------------------------------------------
-- 2. Vincular, una sola vez, para los dos canales.
-- ---------------------------------------------------------------------------
create or replace function private.vincular_plantilla_meta(
  p_org uuid, p_tipo text, p_meta_nombre text, p_idioma text, p_categoria text,
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
  if p_tipo not in ('whatsapp', 'messenger') then
    raise exception 'Solo se vinculan plantillas de WhatsApp o de Messenger.' using errcode = '22023';
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
   where p.organization_id = p_org and p.tipo = p_tipo
     and p.meta_nombre = p_meta_nombre and p.idioma = p_idioma
     and p.archivado_en is null;

  if v_id is null then
    insert into public.plantillas
      (organization_id, tipo, nombre, cuerpo, variables, categoria, idioma,
       estado, meta_nombre, creada_por)
    values
      (p_org, p_tipo, p_meta_nombre, p_cuerpo, coalesce(p_variables, '[]'::jsonb),
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
    jsonb_build_object('nombre', p_meta_nombre, 'idioma', p_idioma, 'canal', p_tipo,
                       'huecos', jsonb_array_length(coalesce(p_variables, '[]'::jsonb))));

  return v_id;
end $fn$;

revoke execute on function private.vincular_plantilla_meta(uuid, text, text, text, text, text, jsonb)
  from public, anon;

-- Los dos envoltorios. El de WhatsApp mantiene su firma exacta porque la pantalla
-- ya lo llama así, y cambiarla obligaría a desplegar las dos cosas a la vez.
create or replace function public.vincular_plantilla_whatsapp(
  p_org uuid, p_meta_nombre text, p_idioma text, p_categoria text,
  p_cuerpo text, p_variables jsonb
) returns uuid
language sql volatile security definer set search_path = ''
as $fn$
  select private.vincular_plantilla_meta(
    p_org, 'whatsapp', p_meta_nombre, p_idioma, p_categoria, p_cuerpo, p_variables);
$fn$;

revoke execute on function public.vincular_plantilla_whatsapp(uuid, text, text, text, text, jsonb)
  from public, anon;
grant  execute on function public.vincular_plantilla_whatsapp(uuid, text, text, text, text, jsonb)
  to authenticated;

create or replace function public.vincular_plantilla_messenger(
  p_org uuid, p_meta_nombre text, p_idioma text, p_categoria text,
  p_cuerpo text, p_variables jsonb
) returns uuid
language sql volatile security definer set search_path = ''
as $fn$
  select private.vincular_plantilla_meta(
    p_org, 'messenger', p_meta_nombre, p_idioma, p_categoria, p_cuerpo, p_variables);
$fn$;

revoke execute on function public.vincular_plantilla_messenger(uuid, text, text, text, text, jsonb)
  from public, anon;
grant  execute on function public.vincular_plantilla_messenger(uuid, text, text, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Las que el compositor puede ofrecer, por canal.
-- ---------------------------------------------------------------------------
create or replace function public.plantillas_messenger_usables(p_org uuid)
returns table (id uuid, nombre text, cuerpo text, idioma text, categoria text, huecos int)
language sql stable security definer set search_path = ''
as $fn$
  select p.id, p.nombre, p.cuerpo, p.idioma, p.categoria,
         coalesce(jsonb_array_length(p.variables), 0)
    from public.plantillas p
   where p.organization_id = p_org
     and p.tipo = 'messenger'
     and p.estado = 'aprobada'
     and p.archivado_en is null
     and public.es_miembro(p_org)
   order by p.nombre;
$fn$;

revoke execute on function public.plantillas_messenger_usables(uuid) from public, anon;
grant  execute on function public.plantillas_messenger_usables(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Los parámetros: mismo cálculo, dos canales.
-- ---------------------------------------------------------------------------
create or replace function public.parametros_de_plantilla(p_plantilla uuid, p_tarjeta uuid)
returns table (nombres text[], valores text[], faltan text[], nombrada boolean)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_tipo text; v_vars jsonb; v_cuerpo text;
  v_valores jsonb;
  v_nombres text[] := '{}'; v_out text[] := '{}'; v_faltan text[] := '{}';
  v_nombrada boolean;
  v_i int; v_clave text; v_valor text; v_n text;
begin
  select p.organization_id, p.tipo, p.variables, p.cuerpo
    into v_org, v_tipo, v_vars, v_cuerpo
    from public.plantillas p where p.id = p_plantilla;
  if v_org is null or not public.es_miembro(v_org) then
    raise exception 'No existe esa plantilla.' using errcode = 'P0002';
  end if;
  if v_tipo not in ('whatsapp', 'messenger') then
    raise exception 'Esa plantilla no es de Meta.' using errcode = '22023';
  end if;

  v_valores := private.valores_de_tarjeta(p_tarjeta, (select auth.uid()));
  if v_valores is null then
    raise exception 'No existe esa tarjeta.' using errcode = 'P0002';
  end if;

  -- CON NOMBRE O POSICIONAL, y lo decide el TEXTO. Un hueco numerado es
  -- posicional; uno con nombre, con nombre. Guardar un indicador aparte sería
  -- otro dato que puede discrepar del cuerpo.
  v_nombrada := v_cuerpo ~ '\{\{\s*[a-z][a-z0-9_]*\s*\}\}';

  if v_nombrada then
    -- Se recorre lo que el cuerpo PIDE, en el orden en que aparece, sin repetir.
    for v_n in
      select distinct m[1] from regexp_matches(v_cuerpo, '\{\{\s*([a-z][a-z0-9_]*)\s*\}\}', 'g') as m
    loop
      v_clave := private.clave_desde_nombre_meta(v_n);
      v_valor := case when v_clave is null then null else v_valores ->> v_clave end;
      v_nombres := v_nombres || v_n;
      if v_valor is null or btrim(v_valor) = '' then
        v_faltan := v_faltan || coalesce(v_clave, v_n);
        v_valor := '';
      end if;
      v_out := v_out || v_valor;
    end loop;
  else
    for v_i in 1 .. coalesce(jsonb_array_length(v_vars), 0) loop
      v_clave := v_vars ->> (v_i - 1);
      v_valor := v_valores ->> v_clave;
      v_nombres := v_nombres || v_i::text;
      if v_valor is null or btrim(v_valor) = '' then
        v_faltan := v_faltan || coalesce(v_clave, '{{' || v_i || '}}');
        v_valor := '';
      end if;
      v_out := v_out || v_valor;
    end loop;
  end if;

  return query select v_nombres, v_out, v_faltan, v_nombrada;
end $fn$;

revoke execute on function public.parametros_de_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.parametros_de_plantilla(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Encolar, con lo que cada canal necesita.
--
-- Lo que cambia por canal son solo tres cosas: de qué columna sale la partición
-- —el número o la Página—, de qué identidad sale el destinatario, y si lleva
-- `messaging_type`. En WhatsApp NO se manda (ver la 0106: allí no existe la
-- prórroga humana y un tag de Messenger devuelve error); en Messenger es
-- justamente UTILITY, que es el permiso que se está pidiendo.
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
  v_mensajeria text;
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
  if v_canal not in ('whatsapp', 'messenger') then
    raise exception 'Las plantillas se mandan por WhatsApp o por Messenger, no por %.', v_canal
      using errcode = '22023';
  end if;

  select p.meta_nombre, p.idioma, p.tipo, p.estado, p.organization_id
    into v_meta, v_idioma, v_ptipo, v_estado, v_porg
    from public.plantillas p where p.id = p_plantilla and p.archivado_en is null;

  if v_meta is null or v_porg <> v_org then
    raise exception 'Esa plantilla no existe en este espacio.' using errcode = 'P0002';
  end if;

  -- LA PLANTILLA Y LA CONVERSACIÓN TIENEN QUE SER DEL MISMO CANAL. Una plantilla
  -- de la Página no existe para la cuenta de WhatsApp ni al contrario, y mandarla
  -- cruzada da un error de nombre no encontrado que no dice nada de la causa.
  if v_ptipo <> v_canal then
    raise exception 'Esa plantilla es de % y la conversación es de %.', v_ptipo, v_canal
      using errcode = '22023';
  end if;
  if v_estado <> 'aprobada' then
    raise exception 'Esa plantilla no está aprobada en Meta.' using errcode = '22023';
  end if;
  if v_tarjeta is null then
    raise exception 'Esa conversación no tiene ficha, y los huecos salen de la ficha.'
      using errcode = '22023';
  end if;

  select * into v_p from public.parametros_de_plantilla(p_plantilla, v_tarjeta);
  if array_length(v_p.faltan, 1) > 0 then
    raise exception 'Faltan datos en la ficha para rellenar: %', array_to_string(v_p.faltan, ', ')
      using errcode = '22023';
  end if;

  if v_canal = 'whatsapp' then
    select phone_number_id into v_particion from public.meta_connections where id = v_conexion;
    v_mensajeria := null;
  else
    select page_id into v_particion from public.meta_connections where id = v_conexion;
    v_mensajeria := 'UTILITY';
  end if;

  if v_particion is null then
    raise exception 'Esa conexión no tiene el identificador que hace falta para enviar.'
      using errcode = 'P0002';
  end if;

  select scoped_id into v_destino
    from public.contact_identities
   where contact_id = v_contacto and canal = v_canal::public.canal_meta
   limit 1;
  if v_destino is null then
    raise exception 'Este contacto no tiene identidad de %.', v_canal using errcode = 'P0002';
  end if;

  insert into public.outbound_messages
    (organization_id, conversation_id, canal, particion, emisor, messaging_type, cuerpo, metadata)
  values
    (v_org, p_conversacion, v_canal::public.canal_meta, v_particion, 'humano', v_mensajeria,
     jsonb_build_object(
       'tipo', 'plantilla',
       'destinatario', v_destino,
       'plantilla', v_meta,
       'idioma', v_idioma,
       'nombrada', v_p.nombrada,
       -- Los nombres viajan al lado de los valores: con parámetros con nombre
       -- Meta empareja por nombre y el orden deja de importar.
       'nombres', to_jsonb(coalesce(v_p.nombres, '{}'::text[])),
       'parametros', to_jsonb(coalesce(v_p.valores, '{}'::text[]))),
     'kavea:' || gen_random_uuid()::text)
  returning id into v_id;

  perform private.registrar_actividad_tarjeta(
    v_org, v_tarjeta, 'plantilla.enviada', 'usuario', v_user,
    jsonb_build_object('nombre', v_meta, 'idioma', v_idioma, 'canal', v_canal));

  return v_id;
end $fn$;

revoke execute on function public.encolar_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.encolar_plantilla(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Y el texto que se lee en el hilo, para los dos canales (ver la 0111).
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
     and p.tipo in ('whatsapp', 'messenger')
     and p.archivado_en is null
   limit 1;

  if v_cuerpo is null then
    return null;
  end if;

  for v_i in 0 .. coalesce(jsonb_array_length(p_parametros), 0) - 1 loop
    v_valor := p_parametros ->> v_i;

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
