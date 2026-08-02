-- 0019_aplicador.sql — el único componente que escribe datos de negocio.
-- Fuente: docs/fases/02-fase-normalizacion.md tareas 9 a 17.
--
-- Los adaptadores del normalizador son funciones PURAS: payload → efectos.
-- Aquí se aplican. Esa separación es lo que permite probar casi toda la lógica
-- en memoria, sin base de datos.

-- ---------------------------------------------------------------------------
-- Contacto e identidad
-- ---------------------------------------------------------------------------
create or replace function private.resolver_contacto(
  p_org uuid, p_canal text, p_scoped_id text, p_nombre text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_contact uuid;
begin
  select contact_id into v_contact
    from public.contact_identities
   where organization_id = p_org and canal = p_canal::public.canal_meta
     and scoped_id = p_scoped_id;

  if v_contact is not null then return v_contact; end if;

  insert into public.contacts (organization_id, nombre)
  values (p_org, p_nombre)
  returning id into v_contact;

  -- Dos webhooks en paralelo del mismo contacto pueden llegar aquí a la vez.
  -- El unique de (organization_id, canal, scoped_id) decide, y el perdedor
  -- relee en lugar de fallar.
  insert into public.contact_identities (organization_id, contact_id, canal, scoped_id)
  values (p_org, v_contact, p_canal::public.canal_meta, p_scoped_id)
  on conflict (organization_id, canal, scoped_id) do nothing;

  select contact_id into v_contact
    from public.contact_identities
   where organization_id = p_org and canal = p_canal::public.canal_meta
     and scoped_id = p_scoped_id;

  return v_contact;
end $$;

-- ---------------------------------------------------------------------------
-- Conversación
-- ---------------------------------------------------------------------------
create or replace function private.resolver_conversacion(
  p_org uuid, p_canal text, p_contact uuid, p_channel uuid
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_conv uuid;
begin
  -- El índice único parcial sobre (org, canal, contact) where estado <> 'cerrada'
  -- es lo único que impide que tres fotos seguidas creen tres conversaciones.
  -- Chatwoot necesitó un mutex distribuido en Redis para esto; en Postgres lo
  -- resuelve una restricción.
  select id into v_conv
    from public.conversations
   where organization_id = p_org and canal = p_canal::public.canal_meta
     and contact_id = p_contact and estado <> 'cerrada';

  if v_conv is not null then return v_conv; end if;

  insert into public.conversations (organization_id, channel_id, canal, contact_id, estado)
  values (p_org, p_channel, p_canal::public.canal_meta, p_contact, 'nueva')
  on conflict (organization_id, canal, contact_id) where estado <> 'cerrada' do nothing
  returning id into v_conv;

  if v_conv is null then
    select id into v_conv
      from public.conversations
     where organization_id = p_org and canal = p_canal::public.canal_meta
       and contact_id = p_contact and estado <> 'cerrada';
  end if;

  return v_conv;
end $$;

-- ---------------------------------------------------------------------------
-- Aplicación de un efecto
-- ---------------------------------------------------------------------------
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
begin
  ------------------------------------------------------------------ mensaje --
  if v_tipo = 'mensaje.upsert' then

    -- Atajo de reentrega: una lectura por la clave de idempotencia convierte
    -- mil resoluciones completas en mil aciertos de índice. Con reanudaciones
    -- frecuentes por presupuesto de CPU, esto deja de ser una optimización y
    -- pasa a ser necesario.
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
    -- GATE DE EFECTOS SECUNDARIOS. Si no devuelve fila, el mensaje ya existía:
    -- se corta aquí. No se avanza last_message_at ni se dispara el agente. Esa
    -- es la diferencia entre "no duplicar filas" y "ser idempotente de verdad":
    -- una entrega repetida que vuelve a disparar el agente cuesta dinero y
    -- puede producir una segunda respuesta al cliente final.
    on conflict (organization_id, canal, mid) do nothing
    returning id into v_msg;

    if v_msg is null then
      return jsonb_build_object('estado', 'duplicado', 'mid', e->>'mid');
    end if;

    -- Lápida diferida: si el borrado o la edición llegaron ANTES que el
    -- mensaje, se aplican ahora, en esta misma transacción.
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

    -- LA VENTANA DE 24 H.
    --
    -- last_incoming_at solo lo mueve un mensaje ENTRANTE. Un echo saliente NO
    -- reabre la ventana, y por eso se excluye explícitamente. La comparación
    -- con greatest lo hace monótono: un evento que llega tarde por el drenaje
    -- del amortiguador no puede retroceder el reloj.
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

    return jsonb_build_object('estado','aplicado','mid',e->>'mid','message_id',v_msg);

  ------------------------------------------------------- borrado / edicion --
  elsif v_tipo in ('mensaje.borrar','mensaje.editar') then
    -- SIEMPRE UPDATE, JAMÁS INSERT. Un unsend de Instagram llega como un objeto
    -- `message` normal con solo {mid, is_deleted:true}, sin text ni adjuntos:
    -- un insert ciego crearía una fila fantasma vacía.
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

    -- Se registra el evento aunque no haya afectado a nada: si el mensaje
    -- todavía no ha llegado, esta fila es la lápida que lo esperará.
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

  ------------------------------------------------------------------ evento --
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

  ------------------------------------------------------------- desconocido --
  else
    -- Un sub-evento que Meta invente mañana no puede tumbar el lote. Se guarda
    -- crudo con métrica y se sigue: en Chatwoot, cada tipo nuevo tumbaba el job
    -- completo y perdía TODOS los mensajes del lote, no solo el afectado.
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

-- ---------------------------------------------------------------------------
-- Lote: 64 efectos como máximo
-- ---------------------------------------------------------------------------
create or replace function private.ingerir_lote(p_efectos jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  efecto     jsonb;
  resultados jsonb := '[]'::jsonb;
begin
  -- EL TOPE DE 64 NO ES ARBITRARIO.
  --
  -- Cada bloque `begin ... exception` que escribe consume un identificador de
  -- subtransacción, y el backend solo cachea 64 por transacción de nivel
  -- superior. Al pasar de ahí el backend se marca como desbordado y el resto
  -- del clúster tiene que consultar pg_subtrans para resolver visibilidad.
  -- La degradación no es de este RPC: es de TODA la base, incluida la bandeja
  -- de clientes que no tienen nada que ver con este cuerpo.
  if jsonb_array_length(p_efectos) > 64 then
    raise exception 'ingerir_lote admite 64 efectos como maximo, recibidos %',
      jsonb_array_length(p_efectos)
      using hint = 'el cache de subtransacciones del backend es de 64 por transaccion';
  end if;

  for efecto in select * from jsonb_array_elements(p_efectos) loop
    begin
      resultados := resultados || private.aplicar_efecto(efecto);
    exception when others then
      -- Solo se revierte ESTA iteración. El resto del grupo queda confirmado.
      -- Sin esto, un update roto entre mil pierde los otros novecientos noventa
      -- y nueve.
      resultados := resultados || jsonb_build_object(
        'estado','error','sqlstate',sqlstate,'mensaje',left(sqlerrm,200));
    end;
  end loop;

  return resultados;
end $$;

revoke execute on function private.ingerir_lote(jsonb) from public, anon, authenticated;

-- Avance del cursor EN LA MISMA TRANSACCIÓN que el último grupo del tramo.
-- Si fuera una llamada aparte existiría la ventana en la que el grupo está
-- escrito y el cursor no, o al revés. La primera se repara sola por
-- idempotencia; la segunda perdería actualizaciones.
create or replace function private.ingerir_tramo(
  p_evento bigint, p_efectos jsonb, p_cursor int, p_total int, p_final boolean
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_res jsonb;
begin
  v_res := private.ingerir_lote(p_efectos);

  update public.webhook_events
     set cursor_update = p_cursor,
         updates_total = p_total,
         estado        = case when p_final then 'procesado' else estado end,
         procesado_en  = case when p_final then now() else procesado_en end
   where id = p_evento;

  return v_res;
end $$;

revoke execute on function private.ingerir_tramo(bigint, jsonb, int, int, boolean)
  from public, anon, authenticated;
