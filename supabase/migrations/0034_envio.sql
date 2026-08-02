-- 0034_envio.sql — cola de salida y ventana de servicio.
-- Fuente: docs/fases/04-fase-envio.md §3.1 y §5, subordinado a docs/03-invariantes-meta.md.
--
-- LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO
--
-- La ventana de 24 h se calcula POR CONVERSACIÓN sobre `last_incoming_at`, y se
-- REEVALÚA EN EL DESPACHO, no al encolar. Un mensaje aprobado a las 23:59 y
-- despachado a las 00:01 es un fallo real: la comprobación al encolar sirve para
-- no aceptar lo imposible, pero la que decide es la del momento de llamar a Meta.
--
-- Un echo saliente NO reabre la ventana. Ni el de Kavea ni el del cliente
-- respondiendo desde el móvil. Solo la mueve un entrante de verdad, y eso ya lo
-- garantiza `aplicar_efecto` desde 0019.

create table public.outbound_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid not null,
  canal            canal_meta not null,

  -- page_id o ig_business_account_id: la cola se particiona por aquí porque los
  -- límites de Meta son POR CUENTA, no por aplicación.
  particion  text not null,
  carril     text not null default 'texto' check (carril in ('texto', 'media')),

  emisor  text not null check (emisor in ('humano', 'agente')),

  -- TEXTO LIBRE a propósito, sin check ni enum. El documento 03 marca los
  -- literales RESPONSE / MESSAGE_TAG como NO confirmados en fuente oficial,
  -- corroborados solo en SDKs de terceros. Una restricción de base sobre un enum
  -- sin verificar convierte una duda documental en una migración.
  messaging_type  text,
  tag             text,

  cuerpo    jsonb not null,
  -- Se envía y vuelve en el echo. Correlación secundaria, por si el message_id
  -- que devuelve el Send API no coincide con el mid del echo (incierto abierto).
  metadata  text,

  estado  text not null default 'encolado'
    check (estado in ('encolado', 'enviando', 'enviado', 'fallido', 'bloqueado')),
  intentos  integer not null default 0,

  mid_devuelto  text,
  echo_mid      text,
  error_codigo  integer,
  error_mensaje text,
  error_payload jsonb,

  -- Materializa el respeto del bloqueo de Meta. Verbatim: "Continuing API calls
  -- during throttling extends the wait period further". Durante un bloqueo no se
  -- llama, ni siquiera para comprobar si ya pasó.
  no_antes_de  timestamptz not null default now(),

  created_at  timestamptz not null default now(),
  sent_at     timestamptz,

  constraint outbound_org_id_uniq unique (organization_id, id),
  constraint outbound_conversacion_mismo_tenant
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade
);

create index outbound_pendientes_idx
  on public.outbound_messages (particion, carril, no_antes_de)
  where estado in ('encolado', 'bloqueado');

create index outbound_conversacion_idx
  on public.outbound_messages (organization_id, conversation_id, created_at);

create unique index outbound_mid_idx
  on public.outbound_messages (organization_id, canal, mid_devuelto)
  where mid_devuelto is not null;

alter table public.outbound_messages enable row level security;
alter table public.outbound_messages force  row level security;

create policy outbound_select on public.outbound_messages
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin políticas de escritura: se encola por RPC y lo despacha el rol de
-- servicio. Un cliente que pudiera insertar aquí podría saltarse la ventana.

create table public.rate_limit_usage (
  id                bigserial primary key,
  organization_id   uuid references public.organizations(id) on delete cascade,
  particion         text,
  tipo              text,
  call_count        integer,
  total_cputime     integer,
  total_time        integer,
  regain_access_min integer,
  http_status       integer,
  error_codigo      integer,
  observed_at       timestamptz not null default now()
);

create index rate_limit_particion_idx
  on public.rate_limit_usage (particion, observed_at desc);

alter table public.rate_limit_usage enable row level security;
alter table public.rate_limit_usage force  row level security;
-- Cero políticas: es diagnóstico interno. Ni siquiera los miembros lo leen.

-- ---------------------------------------------------------------------------
-- La ventana, en un solo sitio
-- ---------------------------------------------------------------------------
-- Devuelve la clase de ventana de una conversación. La usa el RPC al encolar y
-- el despachador al despachar: dos llamadas a la MISMA función, para que no
-- puedan divergir. Tener la regla escrita dos veces es tenerla mal una vez.
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
    -- confirmado si es obligatorio. No se manda lo que no está documentado.
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
    return query select 'humana',
      'Fuera de las 24 horas. Se enviará como intervención humana, y solo vale hasta los 7 días.',
      case when v_canal = 'messenger' then 'MESSAGE_TAG' end, 'HUMAN_AGENT';
    return;
  end if;

  return query select 'cerrada',
    'La conversación superó los 7 días. Solo se reabre si el contacto vuelve a escribir.',
    null::text, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- Encolar
-- ---------------------------------------------------------------------------
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

  -- Confirmado verbatim para Instagram: "Message text must be UTF-8 and be
  -- 1,000 bytes or less". Son BYTES, no caracteres: con tildes y emojis el
  -- margen real es menor, y en Venezuela, República Dominicana y México eso es
  -- siempre. octet_length cuenta bytes; length contaría caracteres y mentiría.
  v_bytes := octet_length(v_texto);
  if v_canal = 'instagram' and v_bytes > 1000 then
    raise exception 'Instagram admite 1000 bytes y este mensaje ocupa %. Los acentos y emojis cuentan doble o más.', v_bytes
      using errcode = '22023';
  end if;
  if v_bytes > 4000 then
    -- Tope de cordura. El límite real de Messenger no está confirmado en fuente
    -- oficial, así que no se finge saberlo: esto solo evita un cuerpo absurdo.
    raise exception 'El mensaje es demasiado largo: % bytes.', v_bytes using errcode = '22023';
  end if;

  -- La ventana, por la misma función que usará el despachador.
  select * into v_v from public.ventana_de(p_conversacion, 'humano');
  if v_v.clase = 'cerrada' then
    raise exception '%', v_v.motivo using errcode = '42501';
  end if;

  select page_id, coalesce(ig_business_account_id, page_id)
    into v_particion, v_destino
    from public.meta_connections where id = v_conexion;
  if v_canal = 'instagram' then v_particion := v_destino; end if;

  -- El identificador del destinatario es el scoped_id de ESE canal. PSID e
  -- IGSID son espacios distintos y no se cruzan.
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
revoke execute on function public.ventana_de(uuid, text)    from public, anon;
grant  execute on function public.ventana_de(uuid, text)    to authenticated;

-- ---------------------------------------------------------------------------
-- Reclamar para despachar
-- ---------------------------------------------------------------------------
-- `for update skip locked` para que dos invocaciones concurrentes del
-- despachador no se peleen por la misma fila. Una por partición y tanda: los
-- límites de Meta son por cuenta y mandar en ráfaga por la misma Página es
-- justo lo que los dispara.
create or replace function private.reclamar_envios(p_lote integer default 10)
returns setof public.outbound_messages
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return query
  with candidatas as (
    select distinct on (o.particion) o.id
      from public.outbound_messages o
     where o.estado in ('encolado', 'bloqueado')
       and o.no_antes_de <= now()
     order by o.particion, o.created_at
     limit p_lote
     for update skip locked
  )
  update public.outbound_messages o
     set estado = 'enviando', intentos = o.intentos + 1
    from candidatas c
   where o.id = c.id
  returning o.*;
end $$;

-- ---------------------------------------------------------------------------
-- Lo enviado se ve en el hilo desde el primer segundo
-- ---------------------------------------------------------------------------
-- El mensaje real llega por el ECHO, y no está confirmado que Instagram entregue
-- echoes por la vía Facebook Login: dos páginas oficiales se contradicen. Si el
-- hilo esperara al echo, el operador escribiría, no vería nada y volvería a
-- escribir.
--
-- Así que la cola de salida entra en la línea de tiempo con su estado, y se
-- retira sola en cuanto el echo trae el mismo mid. Sin echo, el mensaje sigue
-- visible con su estado: es la única forma de no mentir en los dos escenarios.
drop view public.linea_tiempo;

create view public.linea_tiempo
with (security_invoker = on) as
  select
    m.organization_id, m.conversation_id, c.tarjeta_id, c.canal::text as canal,
    'mensaje'::text as clase, m.id::text as ref, m.meta_timestamp as momento,
    case when m.deleted_at is not null then 'mensaje.borrado'
         when m.direccion = 'outbound' then 'mensaje.saliente'
         else 'mensaje.entrante' end as tipo,
    m.emisor as actor_tipo, null::uuid as actor_user_id, null::text as actor_nombre,
    jsonb_build_object(
      'texto', m.texto, 'direccion', m.direccion, 'is_echo', m.is_echo,
      'borrado', m.deleted_at is not null, 'editado', m.edited_at is not null,
      'adjuntos', (select count(*) from public.media md where md.message_id = m.id)
    ) as detalle
  from public.messages m
  join public.conversations c on c.id = m.conversation_id

  union all

  select
    e.organization_id, e.conversation_id, c.tarjeta_id, c.canal::text,
    'evento', e.id::text, e.meta_timestamp,
    'evento.' || e.tipo, 'contacto', null::uuid, null::text,
    jsonb_build_object('emoji', e.emoji, 'accion', e.accion, 'target_mid', e.target_mid)
  from public.message_events e
  join public.conversations c on c.id = e.conversation_id
  where e.tipo not in ('delete','edit')

  union all

  select
    a.organization_id, a.conversation_id, c.tarjeta_id, c.canal::text,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  join public.conversations c on c.id = a.conversation_id
  where a.conversation_id is not null

  union all

  select
    a.organization_id, null::uuid, a.tarjeta_id, null::text,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  where a.tarjeta_id is not null

  union all

  -- La cola de salida, mientras el echo no la sustituya.
  select
    o.organization_id, o.conversation_id, c.tarjeta_id, o.canal::text,
    'mensaje', 'out-' || o.id::text, o.created_at,
    'mensaje.saliente',
    o.emisor, null::uuid, null::text,
    jsonb_build_object(
      'texto', o.cuerpo->>'texto', 'direccion', 'outbound', 'is_echo', false,
      'borrado', false, 'editado', false, 'adjuntos', 0,
      'envio_estado', o.estado, 'envio_error', o.error_mensaje,
      'fuera_de_ventana', o.tag is not null)
  from public.outbound_messages o
  join public.conversations c on c.id = o.conversation_id
  where o.estado <> 'enviado'
     or not exists (
       select 1 from public.messages m
        where m.organization_id = o.organization_id
          and m.canal = o.canal
          and m.mid = o.mid_devuelto
     );

comment on view public.linea_tiempo is
  'Hilo unificado por tarjeta: mensajes, eventos, actividad y la cola de salida '
  'mientras su echo no llega. security_invoker = on: no quitar esa opción.';

-- ---------------------------------------------------------------------------
-- El despachador se despierta solo
-- ---------------------------------------------------------------------------
-- Cada minuto. Un envío del operador no espera a esto: la interfaz llama a la
-- función en cuanto encola, y el cron es la red de seguridad para lo que quede
-- atascado tras un bloqueo o un fallo transitorio.
-- Los secretos van por `private.cfg`, igual que el resto de crones desde 0016:
-- un cron con el token escrito en su definición lo expone a cualquiera con
-- lectura sobre `cron.job`.
create or replace function private.disparar_despacho()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_key text;
begin
  v_url := private.cfg('functions_url');
  v_key := private.cfg('service_key');
  if v_url is null or v_key is null then return; end if;

  -- Solo se despierta si hay algo que hacer. Una invocación por minuto que casi
  -- siempre encuentra la cola vacía es gasto sin contrapartida.
  if not exists (
    select 1 from public.outbound_messages
     where estado in ('encolado', 'bloqueado') and no_antes_de <= now()
  ) then return; end if;

  perform net.http_post(
    url     := v_url || '/despachar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key),
    body    := '{"origen":"cron"}'::jsonb,
    timeout_milliseconds := 25000
  );
end $$;

revoke execute on function private.disparar_despacho() from public, anon, authenticated;

select cron.schedule('despachar-envios', '* * * * *', $cron$ select private.disparar_despacho(); $cron$);
