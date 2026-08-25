-- 0106_en_whatsapp_no_hay_intervencion_humana.sql — la ventana mentía en un canal.
--
-- QUÉ ESTABA MAL. `ventana_de` devuelve, para cualquier canal entre las 24 horas
-- y los 7 días, la clase `humana` con `messaging_type = MESSAGE_TAG` y
-- `tag = HUMAN_AGENT`. Eso es exacto en Messenger y en Instagram. **En WhatsApp
-- no existe HUMAN_AGENT**, y el propio despachador lo dice de su puño:
--
--     «Y NO SE MANDA `tag` NI `messaging_type`. En WhatsApp no existe
--      HUMAN_AGENT: fuera de las 24 h la única vía es una plantilla aprobada»
--
-- pero acto seguido añade «la ventana ya se reevaluó más arriba con `ventana_de()`,
-- así que si llegamos hasta aquí es que está abierta». No lo está: `humana` no es
-- `abierta`, y `encolar_envio` solo se niega ante `cerrada`. El resultado es que
-- un texto escrito a un WhatsApp que respondió hace treinta horas se encola, sale
-- hacia Cloud API y Meta lo rechaza. El operador ve «enviando» y luego un error
-- de Meta en inglés sobre una ventana que la pantalla le decía que estaba abierta.
--
-- Comprobado hoy: las dos conversaciones de WhatsApp del espacio, con entrantes
-- de hace 29,6 h y 34,8 h, devolvían `humana`.
--
-- QUÉ CAMBIA. En WhatsApp, pasadas las 24 horas la ventana está CERRADA, y el
-- motivo dice qué hacer en vez de solo qué no se puede. Ahora hay una respuesta
-- de verdad que dar: desde la 0105 se pueden mandar plantillas.
--
-- LOS OTROS DOS CANALES NO SE TOCAN. Ahí `HUMAN_AGENT` es real, está medido y es
-- la feature que se pidió en el App Review.

create or replace function public.ventana_de(p_conversacion uuid, p_emisor text default 'humano')
returns table (clase text, motivo text, messaging_type text, tag text)
language plpgsql stable security definer set search_path = ''
as $fn$
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

  if not coalesce(v_activo, false) then
    return query select 'cerrada', 'El canal está pausado.', null::text, null::text; return;
  end if;

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
    return query select 'abierta', null::text,
      case when v_canal = 'messenger' then 'RESPONSE' end, null::text;
    return;
  end if;

  -- WHATSAPP NO TIENE PRÓRROGA. Ver la cabecera: no hay HUMAN_AGENT en Cloud
  -- API, así que pasadas las 24 horas la única salida es una plantilla aprobada.
  -- El motivo lo dice, porque un «no se puede» sin salida es lo que hace que el
  -- operador escriba igualmente y se lleve el error de Meta.
  if v_canal = 'whatsapp' then
    return query select 'cerrada',
      'Pasaron 24 horas desde su último mensaje. En WhatsApp, a partir de ahí solo se puede '
      || 'escribir con una plantilla aprobada.',
      null::text, null::text;
    return;
  end if;

  if v_delta <= interval '7 days' then
    if p_emisor <> 'humano' then
      return query select 'cerrada',
        'Fuera de la ventana de 24 horas. Solo una persona puede responder, nunca un agente.',
        null::text, null::text;
      return;
    end if;
    return query select 'humana',
      'Fuera de las 24 horas. Se enviará como intervención humana, y solo vale hasta los 7 días.',
      'MESSAGE_TAG', 'HUMAN_AGENT';
    return;
  end if;

  return query select 'cerrada',
    'Pasaron más de 7 días desde su último mensaje. Ya no se puede responder por este canal.',
    null::text, null::text;
end $fn$;

revoke execute on function public.ventana_de(uuid, text) from public, anon;
grant  execute on function public.ventana_de(uuid, text) to authenticated, service_role;
