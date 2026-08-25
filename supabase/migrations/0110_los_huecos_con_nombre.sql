-- 0110_los_huecos_con_nombre.sql — que la plantilla diga qué campo va en cada hueco.
--
-- QUÉ SE PIDIÓ. «Para crear las de WhatsApp o Messenger no veo dónde poner las
-- variables que tiene el sistema. Solo sale {{1}}, pero la idea es que sean campos
-- reales y al ponerlos se pongan dentro del mensaje tipo {{presupuesto}}».
--
-- Y RESULTA QUE META YA LO PERMITE. Comprobado hoy contra las dos superficies:
-- `parameter_format: 'NAMED'` con `example.body_text_named_params`. Messenger
-- aprobó una así en segundos; WhatsApp la aceptó en cuanto el texto fue lo bastante
-- largo —su primer rechazo no era por el formato sino por «demasiadas variables en
-- relación con la longitud del mensaje», que es otra regla suya—.
--
-- LO QUE ESO CAMBIA, y no es cosmético. Con huecos numerados hacía falta un mapeo
-- aparte —`plantillas.variables`, un array donde la posición manda— y ese mapeo
-- podía desincronizarse del texto: reordena las variables en el cuerpo y el mapeo
-- sigue apuntando a las posiciones viejas, sin error, mandando el presupuesto donde
-- iba el nombre. **Con nombres el texto ES el mapeo.** No hay dos sitios que puedan
-- discrepar.
--
-- EL NOMBRE EN META SE DERIVA DE LA CLAVE, con el punto convertido en guion bajo:
-- `campo.presupuesto_estimado` ↔ `campo_presupuesto_estimado`. Meta no admite
-- puntos. La vuelta es fiable porque el ámbito es una lista cerrada —`contacto`,
-- `tarjeta`, `campo`, `agente`, `org`— así que se parte por el PRIMER guion bajo y
-- se comprueba que lo de delante sea un ámbito conocido.
--
-- LO POSICIONAL SIGUE FUNCIONANDO. Hay plantillas aprobadas en Meta con `{{1}}` que
-- no se van a rehacer, así que las dos formas conviven y se distingue por el texto.

-- ---------------------------------------------------------------------------
-- La conversión, en un solo sitio para que no haya dos versiones.
-- ---------------------------------------------------------------------------
create or replace function private.clave_desde_nombre_meta(p_nombre text)
returns text
language sql immutable set search_path = ''
as $fn$
  select case
    when p_nombre ~ '^(contacto|tarjeta|campo|agente|org)_'
      then regexp_replace(p_nombre, '^(contacto|tarjeta|campo|agente|org)_', '\1.')
    else null
  end;
$fn$;

revoke execute on function private.clave_desde_nombre_meta(text) from public, anon;
grant  execute on function private.clave_desde_nombre_meta(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Los parámetros, ahora con su nombre al lado.
--
-- `create or replace` no puede cambiar el tipo de retorno, así que se suelta
-- primero. Es la misma lección que la 0093 tuvo que aprender con
-- `hay_autorizacion_meta`.
-- ---------------------------------------------------------------------------
drop function if exists public.parametros_de_plantilla(uuid, uuid);

create function public.parametros_de_plantilla(p_plantilla uuid, p_tarjeta uuid)
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
  if v_tipo <> 'whatsapp' then
    raise exception 'Esa plantilla no es de WhatsApp.' using errcode = '22023';
  end if;

  v_valores := private.valores_de_tarjeta(p_tarjeta, (select auth.uid()));
  if v_valores is null then
    raise exception 'No existe esa tarjeta.' using errcode = 'P0002';
  end if;

  -- CON NOMBRE O POSICIONAL, y lo decide el TEXTO. Un `{{1}}` es posicional; un
  -- `{{contacto_nombre}}`, con nombre. Guardar un indicador aparte sería otro
  -- dato que puede discrepar del cuerpo.
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
-- Y el encolado lleva los nombres cuando los hay.
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
       'nombrada', v_p.nombrada,
       -- Los nombres viajan al lado de los valores: con `parameter_format: NAMED`
       -- Meta empareja por nombre y el orden deja de importar.
       'nombres', to_jsonb(coalesce(v_p.nombres, '{}'::text[])),
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
