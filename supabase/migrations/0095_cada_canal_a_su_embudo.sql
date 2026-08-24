-- 0095_cada_canal_a_su_embudo.sql
--
-- Pedido por Gabriel el 24-ago, después de crear un segundo embudo («Clientes»):
--
--   «en los canales, si hay varios instagram o messenger o los whatsapp, se pueda
--    elegir a qué embudo se quiere que entren esas conversaciones. Si solo hay un
--    embudo o si no se selecciona, por defecto es el primero.»
--
-- Hoy `tarjeta_de_contacto` mete TODA tarjeta nueva en el embudo predeterminado
-- de la organización, y no sabe por qué canal entró la conversación. Con un solo
-- canal eso era invisible; con dos números de WhatsApp o dos Instagram, mezcla en
-- un tablero cosas que el negocio lleva por separado.
--
-- LA TARJETA SIGUE SIENDO POR CONTACTO, y eso tiene una consecuencia que hay que
-- decir en voz alta: si la misma persona escribe primero por un canal y después
-- por otro que apunta a otro embudo, la tarjeta NO se mueve. Manda el canal por
-- el que llegó primero. Es deliberado — partir la ficha de un contacto en dos
-- tableros porque escribió dos veces sería peor que el problema que resuelve—, y
-- es la misma regla que ya rige la unión de canales desde la 0082.
--
-- EL EMBUDO ES DEL CANAL, no de la conexión. Una conexión de Página trae
-- Messenger e Instagram, y no hay ninguna razón para que los dos vayan al mismo
-- sitio: un negocio puede atender Instagram como captación y Messenger como
-- posventa.

-- ---------------------------------------------------------------------------
-- 1. La columna, con guarda de inquilino
-- ---------------------------------------------------------------------------
-- La clave compuesta es la misma defensa que usa `channels_conexion_mismo_tenant`
-- desde la 0005: sin ella, un `embudo_id` de otra organización entra sin que nada
-- se queje y las conversaciones de un cliente aparecen en el tablero de otro.
-- Postgres necesita un único al que apuntar.
create unique index if not exists embudos_org_id_uniq
  on public.embudos (organization_id, id);

alter table public.channels
  add column if not exists embudo_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'channels_embudo_mismo_tenant'
  ) then
    alter table public.channels
      add constraint channels_embudo_mismo_tenant
      foreign key (organization_id, embudo_id)
      references public.embudos (organization_id, id) on delete set null;
  end if;
end $$;

comment on column public.channels.embudo_id is
  'A que embudo entran las conversaciones nuevas de este canal. Null = el '
  'predeterminado de la organizacion. Manda el canal por el que el contacto '
  'escribio PRIMERO: la tarjeta es por contacto y no se mueve despues.';

-- ---------------------------------------------------------------------------
-- 2. La tarjeta nace donde diga su canal
-- ---------------------------------------------------------------------------
-- `p_channel` con default null para no romper a nadie que la llame con dos
-- argumentos: sin canal, el comportamiento es exactamente el de antes.
create or replace function private.tarjeta_de_contacto(
  p_org uuid, p_contact uuid, p_channel uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_t uuid; v_embudo uuid; v_etapa uuid; v_quien uuid;
begin
  select id into v_t from public.tarjetas
   where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  if v_t is not null then return v_t; end if;

  -- El embudo del canal manda; si no tiene, el predeterminado. Se resuelve en
  -- una sola consulta para que no haya un hueco entre «mirar» y «decidir».
  select coalesce(
           (select k.embudo_id
              from public.channels k
              join public.embudos ke on ke.id = k.embudo_id and ke.archivado_en is null
             where k.id = p_channel and k.organization_id = p_org),
           (select e.id
              from public.embudos e
             where e.organization_id = p_org
               and e.es_predeterminado and e.archivado_en is null
             limit 1)
         )
    into v_embudo;

  -- La primera etapa abierta de ESE embudo, sea cual sea.
  select id into v_etapa
    from public.etapas
   where embudo_id = v_embudo and tipo = 'abierta' and archivado_en is null
   order by orden limit 1;

  -- Si el reparto está apagado o no hay nadie en turno, esto es null y la
  -- tarjeta nace del SISTEMA. Nunca se asigna a alguien fuera de turno solo por
  -- rellenar el hueco. (Se conserva de la 0048.)
  v_quien := private.a_quien_le_toca(p_org);

  insert into public.tarjetas
    (organization_id, contact_id, embudo_id, etapa_id, etapa_desde, asignado_a)
  values
    (p_org, p_contact, v_embudo, v_etapa,
     case when v_etapa is not null then now() end, v_quien)
  on conflict (organization_id, contact_id) where cerrada_en is null do nothing
  returning id into v_t;

  if v_t is null then
    select id into v_t from public.tarjetas
     where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  end if;

  return v_t;
end $fn$;

-- ---------------------------------------------------------------------------
-- 3. Que el canal llegue hasta ahí
-- ---------------------------------------------------------------------------
-- `resolver_conversacion` ya recibía `p_channel` desde la 0082 —lo necesitaba
-- para no mezclar dos números de WhatsApp en un hilo— y no se lo pasaba a la
-- tarjeta. Es la única línea que cambia.
create or replace function private.resolver_conversacion(
  p_org uuid, p_canal text, p_contact uuid, p_channel uuid
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_conv uuid; v_tarjeta uuid;
begin
  select id into v_conv
    from public.conversations
   where organization_id = p_org and canal = p_canal::public.canal_meta
     and contact_id = p_contact and channel_id = p_channel
     and cerrada_en is null;

  if v_conv is not null then return v_conv; end if;

  v_tarjeta := private.tarjeta_de_contacto(p_org, p_contact, p_channel);

  insert into public.conversations
    (organization_id, channel_id, canal, contact_id, tarjeta_id, estado)
  values (p_org, p_channel, p_canal::public.canal_meta, p_contact, v_tarjeta, 'nueva')
  on conflict (organization_id, canal, contact_id, channel_id) where cerrada_en is null
  do nothing
  returning id into v_conv;

  if v_conv is null then
    select id into v_conv
      from public.conversations
     where organization_id = p_org and canal = p_canal::public.canal_meta
       and contact_id = p_contact and channel_id = p_channel
       and cerrada_en is null;
  end if;

  return v_conv;
end $fn$;

-- ---------------------------------------------------------------------------
-- 4. Cambiarlo desde la interfaz
-- ---------------------------------------------------------------------------
-- `configurar` y no `conectar`: esto no toca credenciales ni webhooks, solo
-- decide en qué tablero cae lo que entra. Es la misma acción que define embudos
-- y etapas, y la hacen `owner` y `admin`.
create or replace function public.asignar_embudo_a_canal(
  p_canal uuid, p_embudo uuid
)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  select organization_id into v_org from public.channels where id = p_canal;
  if v_org is null then
    raise exception 'No existe ese canal.' using errcode = 'P0002';
  end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'No puedes configurar los canales de este espacio.' using errcode = '42501';
  end if;

  -- Null = volver al predeterminado. Un embudo de otra organización lo para la
  -- clave compuesta, pero se comprueba aquí para poder decirlo con palabras en
  -- vez de con un error de integridad.
  if p_embudo is not null and not exists (
    select 1 from public.embudos
     where id = p_embudo and organization_id = v_org and archivado_en is null
  ) then
    raise exception 'Ese embudo no existe en este espacio.' using errcode = 'P0002';
  end if;

  update public.channels set embudo_id = p_embudo, updated_at = now()
   where id = p_canal;

  perform private.registrar_actividad(
    v_org, 'canal.embudo', 'usuario', null, (select auth.uid()),
    jsonb_build_object('canal', p_canal, 'embudo', p_embudo));
end $fn$;

revoke execute on function public.asignar_embudo_a_canal(uuid, uuid) from public, anon;
grant  execute on function public.asignar_embudo_a_canal(uuid, uuid) to authenticated;

comment on function public.asignar_embudo_a_canal(uuid, uuid) is
  'A que embudo entran las conversaciones nuevas de un canal. Null vuelve al '
  'predeterminado. Exige puede(org, configurar): no toca credenciales, solo '
  'decide en que tablero cae lo que entra.';
