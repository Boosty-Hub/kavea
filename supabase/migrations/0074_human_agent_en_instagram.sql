-- 0074_human_agent_en_instagram.sql — el hallazgo del 3 de agosto que no volvió al SQL.
--
-- QUÉ ARREGLA
--
-- `ventana_de` emitía `messaging_type` SOLO para Messenger:
--
--   case when v_canal = 'messenger' then 'MESSAGE_TAG' end, 'HUMAN_AGENT'
--
-- Así que una respuesta de intervención humana por Instagram salía con `tag` y
-- sin `messaging_type`. Meta exige los dos juntos: el tag suelto no selecciona
-- nada.
--
-- La decisión original era prudente y está escrita en el propio código: «los
-- ejemplos oficiales NO incluyen messaging_type y no está confirmado si es
-- obligatorio. No se manda lo que no está documentado». Correcto mientras fue
-- una incertidumbre.
--
-- DEJÓ DE SERLO EL 3 DE AGOSTO DE 2026. Se midió, y la bitácora §3.5 lo da por
-- cerrado: `POST /me/messages` con el Page Access Token y cuerpo
-- `application/x-www-form-urlencoded` con `recipient`, `message`,
-- `messaging_type=MESSAGE_TAG` y `tag=HUMAN_AGENT`. Meta devuelve `message_id`.
-- `scripts/probar-human-agent.mjs` manda exactamente eso y volvió a funcionar
-- hoy, 6 de agosto, a las 11:39 UTC.
--
-- El hallazgo se escribió en la bitácora y en el script, y nunca volvió aquí. Es
-- el fallo de siempre: la medición vive en un sitio y la decisión en otro.
--
-- LO QUE NO SE TOCA, Y ES DELIBERADO
--
-- La rama de menos de 24 horas sigue sin mandar `messaging_type` en Instagram.
-- Ahí no hay medición que lo justifique y lo que hay funciona: los envíos
-- ordinarios de Instagram salen bien desde el 2 de agosto sin ese campo. Se
-- corrige lo que se midió y no se aprovecha el viaje para tocar lo que anda.

create or replace function public.ventana_de(p_conversacion uuid, p_emisor text default 'humano')
returns table (clase text, motivo text, messaging_type text, tag text)
language plpgsql stable security definer set search_path = ''
as $$
declare v_ultimo timestamptz; v_canal text; v_activo boolean; v_standby boolean; v_delta interval;
begin
  select c.last_incoming_at, c.canal::text, ch.activo, c.en_standby
    into v_ultimo, v_canal, v_activo, v_standby
    from public.conversations c
    join public.channels ch on ch.id = c.channel_id
   where c.id = p_conversacion;

  if v_canal is null then
    return query select 'cerrada', 'Esa conversación no existe.', null::text, null::text; return;
  end if;

  -- El kill-switch por canal y por tenant manda sobre todo lo demás: Meta puede
  -- restringir la app sin aviso y hay que poder parar sin tocar la ingesta.
  if not v_activo then
    return query select 'cerrada', 'El canal está pausado.', null::text, null::text; return;
  end if;

  -- Sin propiedad del hilo, el envío falla en silencio. Mejor decirlo antes.
  if v_standby then
    return query select 'cerrada',
      'Otra aplicación es dueña del hilo en Meta. Kavea recibe por standby y no puede responder.',
      null::text, null::text; return;
  end if;

  if v_ultimo is null then
    return query select 'cerrada', 'Este contacto nunca ha escrito.', null::text, null::text; return;
  end if;

  v_delta := now() - v_ultimo;

  if v_delta < interval '24 hours' then
    -- Instagram: los ejemplos oficiales NO incluyen messaging_type y no está
    -- confirmado si es obligatorio. No se manda lo que no está documentado, y
    -- aquí sigue sin estarlo: los envíos ordinarios salen bien sin el campo.
    return query select 'abierta', null::text,
      case when v_canal = 'messenger' then 'RESPONSE' end, null::text;
    return;
  end if;

  if v_delta <= interval '7 days' then
    -- Los agentes de IA NUNCA emiten con HUMAN_AGENT. La feature está para
    -- intervención humana real y el abuso de tags es causa documentada de
    -- restricción de la mensajería de la Página.
    if p_emisor <> 'humano' then
      return query select 'cerrada',
        'Fuera de la ventana de 24 horas. Solo una persona puede responder, nunca un agente.',
        null::text, null::text;
      return;
    end if;
    -- MESSAGE_TAG EN LOS DOS CANALES. Medido en Instagram el 3 de agosto y
    -- repetido el 6: el tag sin `messaging_type` no selecciona nada.
    return query select 'humana',
      'Fuera de las 24 horas. Se enviará como intervención humana, y solo vale hasta los 7 días.',
      'MESSAGE_TAG', 'HUMAN_AGENT';
    return;
  end if;

  return query select 'cerrada',
    'La conversación superó los 7 días. Solo se reabre si el contacto vuelve a escribir.',
    null::text, null::text;
end $$;

revoke execute on function public.ventana_de(uuid, text) from public, anon;
grant  execute on function public.ventana_de(uuid, text) to authenticated;
