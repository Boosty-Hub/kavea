-- 0073_particion_de_whatsapp.sql — desde la interfaz no se podía mandar un WhatsApp.
--
-- EL FALLO
--
-- `encolar_envio` calculaba la partición así, desde la 0034:
--
--   select page_id, coalesce(ig_business_account_id, page_id)
--     into v_particion, v_destino
--     from public.meta_connections where id = v_conexion;
--   if v_canal = 'instagram' then v_particion := v_destino; end if;
--
-- En una conexión de WhatsApp `page_id` es NULL, y no por accidente: la
-- restricción `meta_connections_forma` de la 0065 EXIGE que sea null cuando hay
-- `waba_id` y `phone_number_id`. Así que `v_particion` salía null y el insert
-- moría contra el NOT NULL de `outbound_messages.particion`.
--
-- Resultado: **el compositor nunca ha podido mandar un WhatsApp**. Ni una vez.
-- Se descubrió el 6 de agosto de 2026 intentando provocar la llamada que el App
-- Review exige para `whatsapp_business_messaging`, que el panel de Meta contaba
-- en cero.
--
-- POR QUÉ NADIE LO VIO
--
-- Porque el único envío de WhatsApp que existe en la base se insertó A MANO, sin
-- pasar por esta función. Aquel probó el despachador y el token; no probó el
-- camino que usa el producto. Y encima quedó marcado `fallido` con
-- `error_mensaje: HTTP 200`, que es otro fallo distinto —el del `mid`, ya
-- corregido seis minutos después— y que se llevó toda la atención.
--
-- La bitácora daba «WhatsApp saliente» por bueno con una vuelta completa. La
-- corrección del `mid` sí se hizo; el envío nunca se repitió, y por debajo seguía
-- esto.
--
-- POR QUÉ EL ARREGLO ES UNA FUNCIÓN Y NO TRES PARCHES
--
-- Ese mismo cálculo está COPIADO en `encolar_envio`, `encolar_archivo` y
-- `encolar_corazon`. Tres copias es exactamente por qué la 0065 pudo añadir un
-- canal entero sin que ninguna se enterara. Se extrae a un solo sitio; añadir el
-- cuarto canal será tocar una función, y si alguien se olvida, fallará en las
-- tres a la vez y no en la que nadie mira.

-- ---------------------------------------------------------------------------
-- Quién es el emisor, según el canal
-- ---------------------------------------------------------------------------
-- La partición es la cuenta desde la que sale el mensaje, y es también la clave
-- con la que el despachador agrupa por límites de Meta. Cada canal la tiene en
-- una columna distinta y no hay ninguna que sirva para los tres.
create or replace function private.particion_de(p_conexion uuid, p_canal text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v_p text; v_c record;
begin
  select page_id, ig_business_account_id, phone_number_id
    into v_c
    from public.meta_connections where id = p_conexion;

  if not found then
    raise exception 'No existe esa conexión.' using errcode = 'P0002';
  end if;

  v_p := case p_canal
           -- Instagram habla por /me/messages, así que la partición no viaja en
           -- la URL; sirve para agrupar por límites, y ahí lo que manda es la
           -- cuenta de Instagram y no la Página que la contiene.
           when 'instagram' then coalesce(v_c.ig_business_account_id, v_c.page_id)
           when 'messenger' then v_c.page_id
           when 'whatsapp'  then v_c.phone_number_id
         end;

  -- Nunca se devuelve null. El NOT NULL de `outbound_messages` acabaría
  -- rechazándolo igual, pero con un mensaje que habla de una columna en vez de
  -- decir qué le falta a la conexión: eso costó descubrir este fallo.
  if v_p is null then
    raise exception 'La conexión no tiene emisor para el canal %.', p_canal
      using errcode = 'P0002';
  end if;

  return v_p;
end $$;

revoke execute on function private.particion_de(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Las tres, apuntando al mismo sitio
-- ---------------------------------------------------------------------------
-- Solo cambia el bloque de la partición. Todo lo demás va literal para que el
-- diff diga la verdad sobre qué se tocó.

create or replace function public.encolar_envio(p_conversacion uuid, p_texto text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_canal text; v_contacto uuid; v_tarjeta uuid; v_conexion uuid;
  v_user uuid := (select auth.uid());
  v_v record; v_particion text; v_destino text; v_id uuid; v_bytes integer;
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if v_texto = '' then raise exception 'El mensaje está vacío.' using errcode = '22023'; end if;

  select c.organization_id, c.canal::text, c.contact_id, c.tarjeta_id, ch.meta_connection_id
    into v_org, v_canal, v_contacto, v_tarjeta, v_conexion
    from public.conversations c
    join public.channels ch on ch.id = c.channel_id
   where c.id = p_conversacion;

  if v_org is null then raise exception 'Esa conversación no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  v_bytes := octet_length(v_texto);
  if v_canal = 'instagram' and v_bytes > 1000 then
    raise exception 'Instagram admite 1000 bytes y este mensaje ocupa %. Los acentos y emojis cuentan doble o más.', v_bytes
      using errcode = '22023';
  end if;
  if v_bytes > 4000 then
    raise exception 'El mensaje es demasiado largo: % bytes.', v_bytes using errcode = '22023';
  end if;

  select * into v_v from public.ventana_de(p_conversacion, 'humano');
  if v_v.clase = 'cerrada' then
    raise exception '%', v_v.motivo using errcode = '42501';
  end if;

  v_particion := private.particion_de(v_conexion, v_canal);

  select scoped_id into v_destino
    from public.contact_identities
   where contact_id = v_contacto and canal = v_canal::public.canal_meta
   limit 1;
  if v_destino is null then
    raise exception 'No hay identidad de % para este contacto.', v_canal using errcode = 'P0002';
  end if;

  insert into public.outbound_messages
    (organization_id, conversation_id, canal, particion, emisor,
     messaging_type, tag, cuerpo, metadata)
  values
    (v_org, p_conversacion, v_canal::public.canal_meta, v_particion, 'humano',
     v_v.messaging_type, v_v.tag,
     jsonb_build_object('texto', v_texto, 'destinatario', v_destino),
     'kavea:' || gen_random_uuid()::text)
  returning id into v_id;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'mensaje.encolado', 'usuario', v_user,
      jsonb_build_object('canal', v_canal, 'bytes', v_bytes,
                         'fuera_de_ventana', v_v.clase = 'humana'));
  end if;

  return v_id;
end $$;

revoke execute on function public.encolar_envio(uuid, text) from public, anon;

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
  if v_org_a <> v_org then
    raise exception 'Ese archivo no es de esta organización.' using errcode = '42501';
  end if;

  if not v_enviable then
    raise exception '%', coalesce(v_motivo, 'Meta no acepta este archivo.') using errcode = '22023';
  end if;

  v_tipo := private.tipo_de_adjunto(coalesce(v_ct, ''));

  if v_canal = 'instagram' and v_tipo = 'file' then
    raise exception 'Instagram solo acepta imágenes, audio y vídeo. Un documento hay que mandarlo por otro canal.'
      using errcode = '22023';
  end if;

  select * into v_v from public.ventana_de(p_conversacion, 'humano');
  if v_v.clase = 'cerrada' then
    raise exception '%', v_v.motivo using errcode = '42501';
  end if;

  v_particion := private.particion_de(v_conexion, v_canal);

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

-- El corazón es de Instagram y solo de Instagram —es el único sticker que la API
-- manda—, así que aquí la partición nunca era null. Se cambia igual: dejar la
-- copia viva es dejar el fallo esperando a que alguien la reutilice.
create or replace function public.encolar_corazon(p_conversacion uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_canal text; v_contacto uuid; v_tarjeta uuid; v_conexion uuid;
  v_user uuid := (select auth.uid());
  v_v record; v_particion text; v_destino text; v_id uuid;
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
  if v_canal <> 'instagram' then
    raise exception 'El corazón solo existe en Instagram.' using errcode = '22023';
  end if;

  select * into v_v from public.ventana_de(p_conversacion, 'humano');
  if v_v.clase = 'cerrada' then raise exception '%', v_v.motivo using errcode = '42501'; end if;

  v_particion := private.particion_de(v_conexion, v_canal);

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
     jsonb_build_object('tipo', 'like_heart', 'nombre', 'Un corazón', 'destinatario', v_destino),
     'kavea:' || gen_random_uuid()::text)
  returning id into v_id;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'mensaje.encolado', 'usuario', v_user,
      jsonb_build_object('canal', v_canal, 'archivo', 'Un corazón',
                         'fuera_de_ventana', v_v.clase = 'humana'));
  end if;

  return v_id;
end $$;

revoke execute on function public.encolar_corazon(uuid) from public, anon;
