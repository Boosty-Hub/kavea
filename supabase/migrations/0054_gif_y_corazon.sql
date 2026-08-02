-- 0054_gif_y_corazon.sql — el GIF se puede enviar, y el sticker es uno solo.
--
-- DOS COSAS QUE DECÍA LA DOCUMENTACIÓN Y NOSOTROS NO
--
-- 1. EL GIF SE PUEDE ENVIAR. La página de mensajería de Instagram lo dice
--    verbatim: los adjuntos de tipo `image` llevan «url set to the URL for the
--    image or GIF». `registrar_archivo` lo marcaba como no enviable desde 0033
--    con el motivo «Meta solo acepta PNG y JPEG», que venía del plan de la fase
--    4 y no de la referencia. Era una restricción nuestra disfrazada de
--    restricción de Meta, que es la peor clase: nadie la discute porque parece
--    ajena.
--
-- 2. EL ÚNICO STICKER QUE SE PUEDE MANDAR ES EL CORAZÓN. No es un archivo: es
--    `attachment: {type: "like_heart"}`, sin payload y sin URL. Verbatim de la
--    misma referencia: «Avatar stickers, GIFs, custom stickers, and charged
--    packs are not supported». Un sticker propio subido como imagen llegaría
--    como imagen, no como sticker, y eso no es lo que nadie quiere decir cuando
--    dice «manda un sticker».
--
--    Se implementa como lo que es —una acción, no un archivo— para no inventar
--    una biblioteca de stickers que Meta no va a entregar.

-- ---------------------------------------------------------------------------
-- 1. El GIF entra
-- ---------------------------------------------------------------------------
create or replace function public.registrar_archivo(
  p_org          uuid,
  p_nombre       text,
  p_ruta         text,
  p_bytes        bigint,
  p_content_type text default null,
  p_contacto     uuid default null,
  p_tarjeta      uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid; v_enviable boolean := true; v_motivo text; v_tipo text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.es_miembro(p_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if p_ruta not like p_org::text || '/%' then
    raise exception 'La ruta del archivo no corresponde a esta organización.' using errcode = '42501';
  end if;

  v_tipo := coalesce(p_content_type, '');
  if v_tipo like 'image/%' then
    -- PNG, JPEG y GIF. El GIF está en la referencia de Instagram —«the URL for
    -- the image or GIF»— y llevaba desde 0033 bloqueado por una regla nuestra.
    -- El resto (webp, avif, heic) sigue fuera porque no aparece en ninguna
    -- página oficial, y aquí no se supone: se comprueba.
    if v_tipo not in ('image/png', 'image/jpeg', 'image/gif') then
      v_enviable := false;
      v_motivo := 'Meta documenta PNG, JPEG y GIF al enviar imágenes. Este formato no aparece.';
    elsif p_bytes > 8 * 1024 * 1024 then
      v_enviable := false; v_motivo := 'Las imágenes que se envían por Meta no pueden pasar de 8 MB.';
    end if;
  elsif p_bytes > 25 * 1024 * 1024 then
    v_enviable := false; v_motivo := 'Meta no acepta archivos de más de 25 MB.';
  end if;

  insert into public.archivos
    (organization_id, contacto_id, tarjeta_id, nombre, storage_path, content_type,
     bytes, enviable, motivo_no_enviable, subido_por)
  values
    (p_org, p_contacto, p_tarjeta, btrim(p_nombre), p_ruta, nullif(v_tipo, ''),
     p_bytes, v_enviable, v_motivo, v_user)
  returning id into v_id;

  if p_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      p_org, p_tarjeta, 'archivo.subido', 'usuario', v_user,
      jsonb_build_object('nombre', btrim(p_nombre), 'bytes', p_bytes, 'enviable', v_enviable));
  end if;

  return v_id;
end $$;

revoke execute on function public.registrar_archivo(uuid,text,text,bigint,text,uuid,uuid)
  from public, anon;

-- Los GIF ya subidos quedaron marcados con el motivo viejo. Se reabren: la fila
-- decía que Meta no lo aceptaba y no era verdad.
update public.archivos
   set enviable = true, motivo_no_enviable = null
 where content_type = 'image/gif'
   and enviable = false
   and motivo_no_enviable like 'Meta solo acepta PNG y JPEG%'
   and bytes <= 8 * 1024 * 1024;

-- ---------------------------------------------------------------------------
-- 2. El corazón
-- ---------------------------------------------------------------------------
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

  -- Documentado para Instagram. Para Messenger la referencia no lo recoge, y no
  -- se manda a ver qué pasa: gastaría cuota para recibir un error opaco.
  if v_canal <> 'instagram' then
    raise exception 'El corazón solo está documentado para Instagram.' using errcode = '22023';
  end if;

  select * into v_v from public.ventana_de(p_conversacion, 'humano');
  if v_v.clase = 'cerrada' then raise exception '%', v_v.motivo using errcode = '42501'; end if;

  select page_id, coalesce(ig_business_account_id, page_id)
    into v_particion, v_destino
    from public.meta_connections where id = v_conexion;
  v_particion := v_destino;

  select scoped_id into v_destino
    from public.contact_identities
   where contact_id = v_contacto and canal = v_canal::public.canal_meta
   limit 1;
  if v_destino is null then
    raise exception 'No hay identidad de % para este contacto.', v_canal using errcode = 'P0002';
  end if;

  -- Carril `media` aunque Meta no tenga nada que descargar: es un adjunto, y así
  -- la línea de tiempo lo pinta como tal sin un caso especial más en la vista.
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
      jsonb_build_object('canal', v_canal, 'corazon', true,
                         'fuera_de_ventana', v_v.clase = 'humana'));
  end if;

  return v_id;
end $$;

revoke execute on function public.encolar_corazon(uuid) from public, anon;

comment on function public.encolar_corazon(uuid) is
  'El unico sticker que la API de Instagram manda: attachment type like_heart, '
  'sin payload. Los stickers propios, los de avatar y los GIF como sticker no '
  'estan soportados, asi que no se finge una biblioteca que Meta no entregara.';
