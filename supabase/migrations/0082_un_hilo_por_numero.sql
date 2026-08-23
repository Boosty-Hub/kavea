-- 0082_un_hilo_por_numero.sql — la conversación es por canal CONCRETO, no por canal.
--
-- EL FALLO, MEDIDO EL 23-AGO-2026.
--
-- Se conectó un segundo número de WhatsApp (+1 321-393-1397) y se le escribió
-- desde un móvil. El webhook llegó bien —firma verificada, un intento— y el
-- enrutado por `meta_asset_routes` acertó la organización. Pero el mensaje se
-- pegó a la conversación que ya existía con ese contacto desde el 4-ago, que
-- cuelga del OTRO número (+1 829-954-3803):
--
--   mid wamid.HBgLMTQwNzUzMzI0ODAV…  recipient_scoped_id = 1273819772484741
--     └─ conversation 48f461af…  channel_id = a1 → «+1 829-954-3803»
--
-- La causa: `private.resolver_conversacion` busca por
-- `(organization_id, canal, contact_id)` y, si encuentra una abierta, la
-- devuelve SIN MIRAR `p_channel` —el parámetro se recibía y solo se usaba al
-- insertar—. El índice `conversations_abierta_unica` decía lo mismo. Para el
-- modelo «WhatsApp» era un canal, y que una organización tuviera dos números
-- no existía como concepto.
--
-- POR QUÉ NO ES COSMÉTICO. `encolar_envio` saca la conexión de
-- `conversations.channel_id`, así que responder a ese mensaje habría salido
-- por el 829-954-3803 —que Meta reporta DISCONNECTED—, no por el número al
-- que el contacto escribió. Y no se arreglaba solo desconectando el viejo:
-- `resolver_conversacion` tampoco mira si el canal está activo, así que todo
-- lo que entrara por el número nuevo iba a seguir cayendo en el hilo muerto.
--
-- LA REGLA NUEVA: un hilo por (organización, canal, contacto, CANAL CONCRETO).
--
-- La tarjeta sigue siendo el punto de unión entre canales —`tarjeta_de_contacto`
-- no cambia—, así que los dos hilos de WhatsApp de una misma persona cuelgan de
-- la misma ficha, exactamente igual que ya pasaba con Instagram y Messenger.
-- Lo que se parte es el hilo, que es lo que tiene que partirse: la ventana de
-- 24 h es por número, y desde qué número se responde deja de ser implícito.

-- ---------------------------------------------------------------------------
-- 1. El índice, que es quien de verdad manda.
-- ---------------------------------------------------------------------------
drop index if exists public.conversations_abierta_unica;

create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id, channel_id)
  where cerrada_en is null;

-- ---------------------------------------------------------------------------
-- 2. El resolutor deja de ignorar el canal que le pasan.
-- ---------------------------------------------------------------------------
create or replace function private.resolver_conversacion(
  p_org uuid, p_canal text, p_contact uuid, p_channel uuid
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_conv uuid; v_tarjeta uuid;
begin
  select id into v_conv
    from public.conversations
   where organization_id = p_org and canal = p_canal::public.canal_meta
     and contact_id = p_contact and channel_id = p_channel
     and cerrada_en is null;

  if v_conv is not null then return v_conv; end if;

  -- La tarjeta primero: la conversación no puede existir sin ella. Y si el
  -- contacto ya tiene una viva, el canal nuevo entra ahí. Esa es la unión
  -- automática, y es determinista: mismo contact_id, sin interpretar parecidos.
  -- Sigue siendo por CONTACTO, no por canal: es justo lo que hace que partir
  -- el hilo por número no parta la ficha.
  v_tarjeta := private.tarjeta_de_contacto(p_org, p_contact);

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
end $$;

-- ---------------------------------------------------------------------------
-- 3. Reparar lo que ya entró por la puerta equivocada.
-- ---------------------------------------------------------------------------
-- Se busca por DATOS y no por el id del mensaje de hoy: la condición es
-- «entrante de WhatsApp cuyo `recipient_scoped_id` no es el número de la
-- conexión de su canal, existiendo en la organización un canal que sí lo es».
-- Si mañana aparece otro, esta migración ya lo describió.
do $$
declare r record; v_conv uuid; v_movidos integer := 0;
begin
  for r in
    select m.id             as mensaje,
           m.organization_id as org,
           cv.contact_id     as contacto,
           cv.canal          as canal,
           cv.tarjeta_id     as tarjeta,
           ch_ok.id          as canal_ok
      from public.messages m
      join public.conversations cv on cv.id = m.conversation_id
      join public.channels ch      on ch.id = cv.channel_id
      join public.meta_connections mc on mc.id = ch.meta_connection_id
      join public.channels ch_ok
        on ch_ok.organization_id = m.organization_id
       and ch_ok.canal = 'whatsapp'
      join public.meta_connections mc_ok
        on mc_ok.id = ch_ok.meta_connection_id
       and mc_ok.phone_number_id = m.recipient_scoped_id
     where m.canal = 'whatsapp'
       and m.direccion = 'inbound'
       and m.recipient_scoped_id is not null
       and mc.phone_number_id is distinct from m.recipient_scoped_id
  loop
    select id into v_conv
      from public.conversations
     where organization_id = r.org and canal = r.canal
       and contact_id = r.contacto and channel_id = r.canal_ok
       and cerrada_en is null;

    if v_conv is null then
      insert into public.conversations
        (organization_id, channel_id, canal, contact_id, tarjeta_id, estado)
      values (r.org, r.canal_ok, r.canal, r.contacto, r.tarjeta, 'nueva')
      returning id into v_conv;
    end if;

    update public.messages set conversation_id = v_conv where id = r.mensaje;
    v_movidos := v_movidos + 1;
  end loop;

  raise notice 'mensajes movidos a su hilo correcto: %', v_movidos;
end $$;

-- Y recalcular los dos relojes de cada hilo de WhatsApp desde los mensajes.
-- Se usa `meta_timestamp_ms` y no `created_at` porque es lo que escribe
-- `aplicar_efecto_mensajeria`: el reloj de la ventana de 24 h es el de Meta,
-- no el de nuestra ingesta.
update public.conversations c
   set last_message_at  = s.ultimo,
       last_incoming_at = s.ultimo_entrante
  from (
    select m.conversation_id,
           max(to_timestamp(m.meta_timestamp_ms / 1000.0)) as ultimo,
           max(to_timestamp(m.meta_timestamp_ms / 1000.0))
             filter (where m.direccion = 'inbound'
                       and not coalesce(m.is_echo, false)) as ultimo_entrante
      from public.messages m
     where m.deleted_at is null
     group by m.conversation_id
  ) s
 where c.id = s.conversation_id
   and c.canal = 'whatsapp'
   and (c.last_message_at  is distinct from s.ultimo
     or c.last_incoming_at is distinct from s.ultimo_entrante);
