-- 0113_el_nombre_de_una_persona_se_puede_escribir.sql
--
-- Se intentó mandar una plantilla y salió: «Faltan datos en la ficha para
-- rellenar: tarjeta.valor, contacto.nombre». Dos fallos en una sola frase.
--
-- EL PRIMERO: no había forma de poner el nombre. La ficha edita los campos
-- personalizados de la persona y del asunto, pero `contacts.nombre` no era
-- ninguno de ellos: venía de Meta cuando Meta lo daba y, cuando no —Messenger no
-- entrega el nombre sin `pages_user_locale` ni perfil accesible—, la persona se
-- quedaba «Contacto sin nombre» para siempre. La plantilla lo pedía, y no había
-- pantalla donde arreglarlo. Un error que señala a algo que no se puede tocar.
--
-- EL SEGUNDO: el mensaje daba la CLAVE INTERNA. «tarjeta.valor» no está escrito
-- en ninguna parte de la interfaz; lo que se lee en la ficha es «Valor (USD)».
-- El operador tenía que adivinar la correspondencia, y para «contacto.nombre» no
-- existía destino ninguno.

-- ---------------------------------------------------------------------------
-- 1. El nombre de una persona se puede escribir.
--
-- Misma guarda que `guardar_campo`: cualquier miembro. Poner el nombre de quien
-- escribe es trabajo de quien atiende, no de quien configura, y pedir rol de
-- administrador para eso deja fichas sin nombre.
-- ---------------------------------------------------------------------------
create or replace function public.renombrar_contacto(p_contacto uuid, p_nombre text)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_antes text; v_nuevo text;
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select c.organization_id, c.nombre into v_org, v_antes
    from public.contacts c where c.id = p_contacto;
  if v_org is null then
    raise exception 'Esa persona no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  -- Vacío BORRA el nombre en vez de guardar una cadena vacía: un nombre en
  -- blanco haría que la ficha dijera que hay nombre y la plantilla siguiera sin
  -- poder rellenar el hueco.
  v_nuevo := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nuevo is not null and length(v_nuevo) > 120 then
    raise exception 'El nombre no puede pasar de 120 caracteres.' using errcode = '22023';
  end if;

  -- Sin cambio no se escribe: cada guardado deja una línea en el hilo, y entrar
  -- y salir de un campo no es un cambio.
  if coalesce(v_nuevo, '') = coalesce(v_antes, '') then
    return;
  end if;

  update public.contacts set nombre = v_nuevo, updated_at = now() where id = p_contacto;

  perform private.registrar_actividad(
    v_org, 'contacto.renombrado', 'usuario', null, v_user,
    jsonb_build_object('antes', v_antes, 'despues', v_nuevo));
end $fn$;

revoke execute on function public.renombrar_contacto(uuid, text) from public, anon;
grant  execute on function public.renombrar_contacto(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los huecos que faltan se dicen como se leen en la pantalla.
--
-- `variables_disponibles` ya tiene la etiqueta de cada clave —es la lista que
-- alimenta el selector de campos al crear una plantilla— así que la traducción
-- no hay que inventarla: se busca ahí. Y se añade DÓNDE se rellena, porque saber
-- que falta «Valor del asunto» sin saber en qué bloque de la ficha vive es la
-- mitad de la respuesta.
-- ---------------------------------------------------------------------------
create or replace function private.donde_se_rellena(p_clave text) returns text
language sql immutable set search_path = ''
as $fn$
  select case
    when p_clave = 'contacto.nombre'  then 'en la ficha, arriba, junto a los canales'
    when p_clave like 'contacto.%'    then 'lo da la red social, no se escribe aquí'
    when p_clave = 'tarjeta.valor'    then 'en la ficha, bloque Embudo'
    when p_clave = 'tarjeta.etapa'    then 'en la ficha, bloque Embudo'
    when p_clave = 'tarjeta.titulo'   then 'en la cabecera de la conversación'
    when p_clave like 'campo.%'       then 'en la ficha, Datos de este asunto o Datos de la persona'
    when p_clave like 'agente.%'      then 'sale de quien escribe'
    when p_clave like 'org.%'         then 'en Ajustes → La organización'
    else null
  end;
$fn$;

create or replace function private.huecos_en_castellano(p_org uuid, p_claves text[])
returns text
language sql stable security definer set search_path = ''
as $fn$
  select string_agg(
           coalesce(v.etiqueta, c.clave)
             || coalesce(' (' || private.donde_se_rellena(c.clave) || ')', ''),
           '; ' order by c.orden)
    from unnest(p_claves) with ordinality as c(clave, orden)
    left join public.variables_disponibles(p_org) v on v.clave = c.clave;
$fn$;

revoke execute on function private.huecos_en_castellano(uuid, text[]) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. `encolar_plantilla`, con el mensaje que se puede seguir.
--
-- Solo cambia el `raise` de los huecos que faltan. El resto es la 0112 sin
-- tocar: se reescribe entera porque `create or replace` no admite cambiar una
-- línea sola.
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
    raise exception 'Para mandar esta plantilla falta rellenar: %',
      private.huecos_en_castellano(v_org, v_p.faltan) using errcode = '22023';
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
