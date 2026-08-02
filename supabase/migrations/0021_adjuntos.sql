-- 0021_adjuntos.sql — persistencia de adjuntos entrantes.
-- Fuente: docs/fases/02-fase-normalizacion.md tarea 14.
--
-- LA REGLA QUE NO SE ROMPE: de la media ENTRANTE solo se guarda la URL del CDN
-- de Meta, nunca el binario. Meta rechaza App Reviews por cachear media, y es
-- la causa documentada del rechazo a usuarios de Chatwoot. El CHECK de la tabla
-- `media` ya lo impone; esto solo añade el camino de escritura.
--
-- Consecuencia que hay que conocer: cuando Meta borre o caduque el archivo,
-- dejará de verse también en Kavea. Es deliberado, no una limitación.

create or replace function private.aplicar_adjuntos(
  p_org uuid, p_mensaje uuid, p_adjuntos jsonb
)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare a jsonb; n int := 0;
begin
  if p_adjuntos is null or jsonb_typeof(p_adjuntos) <> 'array' then return 0; end if;

  for a in select * from jsonb_array_elements(p_adjuntos) loop
    begin
      insert into public.media (
        organization_id, message_id, origen,
        cdn_url, cdn_host, cdn_url_recibida_en,
        tipo, payload
      ) values (
        p_org, p_mensaje, 'meta_cdn',
        a->>'cdn_url', a->>'cdn_host', now(),
        coalesce(a->>'tipo', 'fallback'), coalesce(a->'payload', '{}'::jsonb)
      );
      n := n + 1;
    exception when others then
      -- Un adjunto que no entra no puede tumbar el mensaje entero. El mensaje
      -- ya está escrito y es lo que el operador necesita ver; el adjunto se
      -- pierde con métrica, no con excepción.
      null;
    end;
  end loop;

  return n;
end $$;

revoke execute on function private.aplicar_adjuntos(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Se engancha al aplicador, justo después de insertar el mensaje.
create or replace function private.aplicar_efecto(e jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tipo     text := e->>'tipo';
  v_org      uuid := (e->>'organization_id')::uuid;
  v_canal    text := e->>'canal';
  v_channel  uuid := (e->>'channel_id')::uuid;
  v_contact  uuid;
  v_conv     uuid;
  v_msg      uuid;
  v_afectadas int;
  v_adj      int := 0;
begin
  if v_tipo = 'mensaje.upsert' then

    if exists (
      select 1 from public.messages
       where organization_id = v_org and canal = v_canal::public.canal_meta
         and mid = e->>'mid'
    ) then
      return jsonb_build_object('estado', 'duplicado', 'mid', e->>'mid');
    end if;

    v_contact := private.resolver_contacto(
      v_org, v_canal, e->>'contacto_scoped_id', e->>'contacto_nombre');
    v_conv := private.resolver_conversacion(v_org, v_canal, v_contact, v_channel);

    insert into public.messages (
      organization_id, conversation_id, canal, mid, direccion, emisor,
      is_echo, app_id, metadata, sender_scoped_id, recipient_scoped_id,
      texto, reply_to_mid, quick_reply_payload, referral,
      llego_por_standby, is_unsupported, meta_timestamp_ms, raw
    ) values (
      v_org, v_conv, v_canal::public.canal_meta, e->>'mid',
      coalesce(e->>'direccion','inbound'), coalesce(e->>'emisor','contacto'),
      coalesce((e->>'is_echo')::boolean, false), e->>'app_id', e->>'metadata',
      e->>'sender_scoped_id', e->>'recipient_scoped_id',
      e->>'texto', e->>'reply_to_mid', e->>'quick_reply_payload', e->'referral',
      coalesce((e->>'llego_por_standby')::boolean, false),
      coalesce((e->>'is_unsupported')::boolean, false),
      (e->>'meta_timestamp_ms')::bigint, e->'raw'
    )
    on conflict (organization_id, canal, mid) do nothing
    returning id into v_msg;

    if v_msg is null then
      return jsonb_build_object('estado', 'duplicado', 'mid', e->>'mid');
    end if;

    v_adj := private.aplicar_adjuntos(v_org, v_msg, e->'adjuntos');

    update public.messages m
       set deleted_at = case when ev.tipo = 'delete' then ev.meta_timestamp else m.deleted_at end,
           edited_at  = case when ev.tipo = 'edit'   then ev.meta_timestamp else m.edited_at end,
           texto      = case when ev.tipo = 'delete' then null else m.texto end
      from public.message_events ev
     where m.id = v_msg
       and ev.organization_id = v_org and ev.canal = v_canal::public.canal_meta
       and ev.target_mid = e->>'mid' and ev.tipo in ('delete','edit')
       and ev.aplicado_en is null;

    update public.message_events
       set aplicado_en = now()
     where organization_id = v_org and canal = v_canal::public.canal_meta
       and target_mid = e->>'mid' and tipo in ('delete','edit') and aplicado_en is null;

    update public.conversations
       set last_message_at  = greatest(coalesce(last_message_at, 'epoch'::timestamptz),
                                       to_timestamp((e->>'meta_timestamp_ms')::bigint / 1000.0)),
           last_incoming_at = case
             when coalesce(e->>'direccion','inbound') = 'inbound'
                  and not coalesce((e->>'is_echo')::boolean, false)
             then greatest(coalesce(last_incoming_at, 'epoch'::timestamptz),
                           to_timestamp((e->>'meta_timestamp_ms')::bigint / 1000.0))
             else last_incoming_at end,
           estado = case when estado = 'nueva'
                          and coalesce(e->>'direccion','inbound') = 'outbound'
                         then 'en_curso' else estado end
     where id = v_conv;

    return jsonb_build_object(
      'estado','aplicado','mid',e->>'mid','message_id',v_msg,'adjuntos',v_adj);

  elsif v_tipo in ('mensaje.borrar','mensaje.editar') then
    update public.messages
       set deleted_at = case when v_tipo = 'mensaje.borrar'
                             then to_timestamp((e->>'meta_timestamp_ms')::bigint/1000.0)
                             else deleted_at end,
           edited_at  = case when v_tipo = 'mensaje.editar'
                             then to_timestamp((e->>'meta_timestamp_ms')::bigint/1000.0)
                             else edited_at end,
           texto      = case when v_tipo = 'mensaje.borrar' then null
                             else coalesce(e->>'texto', texto) end
     where organization_id = v_org and canal = v_canal::public.canal_meta
       and mid = e->>'mid';
    get diagnostics v_afectadas = row_count;

    -- Un unsend borra también los adjuntos: la URL del CDN deja de servir el
    -- contenido y conservarla sería guardar un puntero muerto a algo que el
    -- usuario pidió eliminar.
    if v_tipo = 'mensaje.borrar' and v_afectadas > 0 then
      delete from public.media
       where organization_id = v_org
         and message_id in (
           select id from public.messages
            where organization_id = v_org and canal = v_canal::public.canal_meta
              and mid = e->>'mid');
    end if;

    insert into public.message_events (
      organization_id, canal, tipo, target_mid, meta_timestamp_ms, raw, aplicado_en
    ) values (
      v_org, v_canal::public.canal_meta,
      case when v_tipo = 'mensaje.borrar' then 'delete' else 'edit' end,
      e->>'mid', (e->>'meta_timestamp_ms')::bigint, e->'raw',
      case when v_afectadas > 0 then now() else null end
    )
    on conflict on constraint message_events_dedupe do nothing;

    return jsonb_build_object(
      'estado', case when v_afectadas > 0 then 'aplicado' else 'diferido' end,
      'mid', e->>'mid');

  elsif v_tipo = 'evento.registrar' then
    insert into public.message_events (
      organization_id, conversation_id, canal, tipo, target_mid, actor_scoped_id,
      accion, emoji, reaction, read_watermark_ms, read_mid, delivery_mids,
      postback_payload, postback_title, llego_por_standby, meta_timestamp_ms, raw
    ) values (
      v_org, nullif(e->>'conversation_id','')::uuid, v_canal::public.canal_meta,
      e->>'evento_tipo', e->>'target_mid', e->>'actor_scoped_id',
      e->>'accion', e->>'emoji', e->>'reaction',
      (e->>'read_watermark_ms')::bigint, e->>'read_mid',
      case when e ? 'delivery_mids'
           then array(select jsonb_array_elements_text(e->'delivery_mids')) end,
      e->>'postback_payload', e->>'postback_title',
      coalesce((e->>'llego_por_standby')::boolean, false),
      (e->>'meta_timestamp_ms')::bigint, e->'raw'
    )
    on conflict on constraint message_events_dedupe do nothing;

    return jsonb_build_object('estado','aplicado','evento',e->>'evento_tipo');

  else
    insert into public.message_events (
      organization_id, canal, tipo, meta_timestamp_ms, raw
    ) values (
      v_org, v_canal::public.canal_meta, coalesce(e->>'evento_tipo','desconocido'),
      coalesce((e->>'meta_timestamp_ms')::bigint, (extract(epoch from now())*1000)::bigint),
      e->'raw'
    )
    on conflict on constraint message_events_dedupe do nothing;

    return jsonb_build_object('estado','desconocido','tipo',v_tipo);
  end if;
end $$;

revoke execute on function private.aplicar_efecto(jsonb) from public, anon, authenticated;
