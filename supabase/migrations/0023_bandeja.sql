-- 0023_bandeja.sql — lo que la bandeja necesita para ser rápida y estar viva.
-- Fuente: docs/fases/03-fase-bandeja.md.

-- Adelanto denormalizado -----------------------------------------------------
-- La lista muestra el último texto y cuántos sin leer. Calcularlo con un join
-- por fila convierte una lista de cincuenta conversaciones en cincuenta
-- consultas al hilo. Se mantiene al escribir, que es mil veces menos frecuente
-- que leer la bandeja.
alter table public.conversations
  add column preview_texto text,
  add column preview_emisor text,
  add column no_leidos int not null default 0,
  add column leido_hasta timestamptz;

-- Índice de la bandeja con INCLUDE: la consulta se resuelve solo con el índice,
-- sin volver a la tabla. Con cientos de miles de mensajes eso es la diferencia
-- entre una bandeja que abre y una que se piensa.
drop index if exists public.conversations_bandeja_idx;

create index conversations_bandeja_idx
  on public.conversations (organization_id, estado, last_message_at desc)
  include (canal, contact_id, preview_texto, preview_emisor, no_leidos, asignado_a, last_incoming_at)
  where estado <> 'cerrada';

-- Las cerradas se consultan aparte y con menos frecuencia.
create index conversations_cerradas_idx
  on public.conversations (organization_id, last_message_at desc)
  where estado = 'cerrada';

-- Búsqueda ---------------------------------------------------------------------
-- Español sin acentos: buscar "cafe" tiene que encontrar "café". Con unaccent
-- en el diccionario, no normalizando el texto al guardar, que destruiría el
-- original.
create extension if not exists unaccent;
create extension if not exists btree_gin;

create index messages_busqueda_idx
  on public.messages using gin (organization_id, to_tsvector('spanish', coalesce(texto,'')));

comment on index public.messages_busqueda_idx is
  'btree_gin permite meter organization_id DENTRO del indice GIN. Sin eso, la '
  'busqueda escanea el indice de texto de TODOS los tenants y filtra despues.';

-- Mantenimiento del adelanto y del contador -----------------------------------
create or replace function private.refrescar_adelanto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
     set preview_texto  = case
           when new.deleted_at is not null then null
           when new.texto is not null then left(new.texto, 140)
           else '[adjunto]' end,
         preview_emisor = new.emisor,
         -- Solo cuentan como no leídos los ENTRANTES. Un echo de la propia
         -- Página no es trabajo pendiente para nadie.
         no_leidos = case
           when new.direccion = 'inbound' and not new.is_echo
           then c.no_leidos + 1 else c.no_leidos end
   where c.id = new.conversation_id;
  return null;
end $$;

create trigger messages_adelanto
  after insert on public.messages
  for each row execute function private.refrescar_adelanto();

-- Tiempo real -------------------------------------------------------------------
-- BROADCAST DESDE TRIGGER, no postgres_changes con filtro.
--
-- postgres_changes evalúa las políticas RLS por suscriptor Y por cambio: una
-- bandeja compartida con varios agentes conectados es exactamente el patrón que
-- lo castiga. Con Broadcast, la autorización del canal se resuelve una vez, al
-- suscribirse.
--
-- El payload lleva identificadores y metadatos, NUNCA el texto del mensaje: el
-- cliente recibe el aviso y relee bajo RLS. Así un fallo de autorización de
-- canal no filtra contenido.
create or replace function private.avisar_bandeja()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_conv uuid;
begin
  if tg_table_name = 'messages' then
    v_org := new.organization_id; v_conv := new.conversation_id;
  else
    v_org := new.organization_id; v_conv := new.id;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'tabla', tg_table_name,
      'conversation_id', v_conv,
      'momento', now()
    ),
    'cambio',
    'org:' || v_org::text,
    false          -- no es privado a nivel de payload; la autorización va en el canal
  );
  return null;
exception when others then
  -- Un fallo de Realtime no puede tumbar la ingesta. La bandeja se refresca
  -- sola en el siguiente sondeo.
  return null;
end $$;

create trigger messages_avisar
  after insert on public.messages
  for each row execute function private.avisar_bandeja();

create trigger conversations_avisar
  after update on public.conversations
  for each row execute function private.avisar_bandeja();

-- Marcar leído -------------------------------------------------------------------
create or replace function public.marcar_leido(p_conversacion uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.conversations where id = p_conversacion;
  if v_org is null or not public.es_miembro(v_org) then
    raise exception 'sin acceso';
  end if;

  update public.conversations
     set no_leidos = 0, leido_hasta = now()
   where id = p_conversacion;
end $$;

-- Esta sí la puede llamar un miembro: comprueba la pertenencia en el cuerpo.
grant execute on function public.marcar_leido(uuid) to authenticated;

-- Adelanto inicial para lo que ya existe.
update public.conversations c
   set preview_texto = sub.texto, preview_emisor = sub.emisor,
       no_leidos = sub.entrantes
  from (
    select conversation_id,
           (array_agg(case when deleted_at is not null then null
                           when texto is not null then left(texto,140)
                           else '[adjunto]' end order by meta_timestamp desc))[1] as texto,
           (array_agg(emisor order by meta_timestamp desc))[1] as emisor,
           count(*) filter (where direccion='inbound' and not is_echo) as entrantes
      from public.messages group by conversation_id
  ) sub
 where c.id = sub.conversation_id;
