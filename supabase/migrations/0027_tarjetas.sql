-- 0027_tarjetas.sql — la tarjeta es la unidad de trabajo; la conversación, el transporte.
-- Fuente: docs/fases/03b-fase-tarjetas.md §1 y §2.
--
-- EL PROBLEMA
--
-- Una persona escribe por Instagram y luego por WhatsApp. Son dos hilos en Meta
-- y un solo asunto para quien atiende. Con la unidad de trabajo puesta en la
-- conversación, ese asunto no existe: no se le puede asignar responsable, no
-- tiene un estado, y no hay dónde guardar lo que el negocio sabe del caso.
--
-- LO QUE SUBE Y LO QUE SE QUEDA
--
-- Suben a la tarjeta el estado del trabajo y el responsable. Se quedan en la
-- conversación el canal, la ventana de 24 h, el token, la propiedad del hilo y
-- el espacio de `mid`. Fundirlo todo obligaría a llevar dos relojes de ventana
-- en la misma fila y el compositor no podría decidir si se puede responder.

create table public.tarjetas (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contact_id       uuid not null,

  -- Por defecto se muestra el nombre del contacto. En cuanto alguien lo escribe
  -- manda lo escrito: "Pedido 4412" dice más que "Contacto sin nombre".
  titulo  text,

  estado  text not null default 'nueva'
            check (estado in ('nueva', 'en_curso', 'esperando', 'cerrada')),
  asignado_a  uuid references auth.users(id) on delete set null,

  -- Denormalizado, igual que estaba en conversaciones: la lista no puede hacer
  -- una subconsulta por fila.
  last_message_at  timestamptz,
  preview_texto    text,
  preview_emisor   text,
  no_leidos        integer not null default 0,

  cerrada_en  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tarjetas_org_id_uniq unique (organization_id, id),
  constraint tarjetas_contacto_mismo_tenant
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade
);

-- Una persona con asunto abierto tiene exactamente una tarjeta. Misma técnica
-- que protege la creación de conversaciones frente a webhooks paralelos: la
-- restricción, no un mutex.
create unique index tarjetas_abierta_unica
  on public.tarjetas (organization_id, contact_id)
  where cerrada_en is null;

create index tarjetas_bandeja_idx
  on public.tarjetas (organization_id, estado, last_message_at desc)
  include (titulo, preview_texto, no_leidos);

create index tarjetas_asignado_idx
  on public.tarjetas (asignado_a) where asignado_a is not null;

create trigger tarjetas_touch before update on public.tarjetas
  for each row execute function public.tocar_updated_at();

alter table public.tarjetas enable row level security;
alter table public.tarjetas force  row level security;

create policy tarjetas_select on public.tarjetas
  for select to authenticated using (public.es_miembro(organization_id));

-- El estado y la asignación se cambian desde la interfaz; el resto lo escribe
-- el normalizador. Se conceden solo esas dos columnas, por la misma razón que
-- en `contacts`: revocar la tabla y volver a conceder columna a columna es la
-- única forma que funciona en Postgres.
create policy tarjetas_update on public.tarjetas
  for update to authenticated
  using      (public.es_miembro(organization_id))
  with check (public.es_miembro(organization_id));

revoke update on public.tarjetas from authenticated;
grant  update (estado, asignado_a, titulo) on public.tarjetas to authenticated;

-- ---------------------------------------------------------------------------
-- La conversación se cuelga de una tarjeta
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column tarjeta_id uuid,
  -- El índice único que impide duplicados dependía de `estado <> 'cerrada'`, y
  -- ese estado se va a la tarjeta. La conversación necesita su propio ciclo de
  -- vida, que además es otra cosa: un asunto puede estar `esperando` con su
  -- hilo de Instagram perfectamente vivo.
  add column cerrada_en timestamptz,
  add constraint conversations_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Relleno: una tarjeta por conversación viva, arrastrando su estado
-- ---------------------------------------------------------------------------
-- Se hace antes de tocar los índices para que ninguna fila quede sin tarjeta ni
-- un instante.
insert into public.tarjetas
  (organization_id, contact_id, estado, asignado_a, last_message_at,
   preview_texto, preview_emisor, no_leidos, cerrada_en, created_at)
select
  c.organization_id,
  c.contact_id,
  -- Si un contacto tiene varias conversaciones, la tarjeta se queda con el
  -- estado de la más activa y el resto se cuelgan de ella.
  (array_agg(c.estado order by c.last_message_at desc nulls last))[1],
  (array_agg(c.asignado_a order by c.last_message_at desc nulls last))[1],
  max(c.last_message_at),
  (array_agg(c.preview_texto order by c.last_message_at desc nulls last))[1],
  (array_agg(c.preview_emisor order by c.last_message_at desc nulls last))[1],
  sum(c.no_leidos),
  case when bool_and(c.estado = 'cerrada') then now() else null end,
  min(c.created_at)
from public.conversations c
group by c.organization_id, c.contact_id;

update public.conversations c
   set tarjeta_id = t.id,
       cerrada_en = case when c.estado = 'cerrada' then coalesce(c.updated_at, now()) else null end
  from public.tarjetas t
 where t.organization_id = c.organization_id
   and t.contact_id = c.contact_id;

alter table public.conversations alter column tarjeta_id set not null;

create index conversations_tarjeta_idx
  on public.conversations (organization_id, tarjeta_id, last_message_at desc);

-- Ahora sí: el índice de duplicados pasa a depender del ciclo de vida propio de
-- la conversación.
drop index public.conversations_abierta_unica;
create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where cerrada_en is null;

-- `estado` y `asignado_a` se quedan en conversations por ahora, sin uso, para
-- que un despliegue a medias no rompa nada. Los quita 0029 cuando la aplicación
-- ya no los lea. Una columna viva que nadie lee miente menos que una columna
-- borrada bajo los pies de la versión anterior.
comment on column public.conversations.estado is
  'OBSOLETA desde 0027: el estado del trabajo vive en tarjetas.estado. Se '
  'mantiene solo para que el despliegue pueda solaparse. La quita 0029.';
comment on column public.conversations.asignado_a is
  'OBSOLETA desde 0027: la asignación vive en tarjetas.asignado_a. La quita 0029.';

-- ---------------------------------------------------------------------------
-- El normalizador busca o crea tarjeta
-- ---------------------------------------------------------------------------
create or replace function private.tarjeta_de_contacto(p_org uuid, p_contact uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_t uuid;
begin
  select id into v_t from public.tarjetas
   where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  if v_t is not null then return v_t; end if;

  insert into public.tarjetas (organization_id, contact_id)
  values (p_org, p_contact)
  on conflict (organization_id, contact_id) where cerrada_en is null do nothing
  returning id into v_t;

  -- Dos webhooks en paralelo: uno inserta y el otro se encuentra el conflicto.
  -- El segundo tiene que leer lo que escribió el primero, no devolver null.
  if v_t is null then
    select id into v_t from public.tarjetas
     where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  end if;

  return v_t;
end $$;

-- Misma firma exacta que en 0019, argumentos incluidos: la llama `aplicar_efecto`
-- y un cambio de firma dejaría una función huérfana y otra sin llamar, con la
-- ingesta fallando en silencio.
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
     and contact_id = p_contact and cerrada_en is null;

  if v_conv is not null then return v_conv; end if;

  -- La tarjeta primero: la conversación no puede existir sin ella. Y si el
  -- contacto ya tiene una viva, el canal nuevo entra ahí. Esa es la unión
  -- automática, y es determinista: mismo contact_id, sin interpretar parecidos.
  v_tarjeta := private.tarjeta_de_contacto(p_org, p_contact);

  insert into public.conversations
    (organization_id, channel_id, canal, contact_id, tarjeta_id, estado)
  values (p_org, p_channel, p_canal::public.canal_meta, p_contact, v_tarjeta, 'nueva')
  on conflict (organization_id, canal, contact_id) where cerrada_en is null do nothing
  returning id into v_conv;

  if v_conv is null then
    select id into v_conv
      from public.conversations
     where organization_id = p_org and canal = p_canal::public.canal_meta
       and contact_id = p_contact and cerrada_en is null;
  end if;

  return v_conv;
end $$;

-- ---------------------------------------------------------------------------
-- El adelanto y el contador suben a la tarjeta
-- ---------------------------------------------------------------------------
create or replace function private.refrescar_adelanto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), new.meta_timestamp)
   where id = new.conversation_id;

  update public.tarjetas t
     set preview_texto  = case
           when new.deleted_at is not null then 'Mensaje eliminado'
           when new.texto is not null and length(btrim(new.texto)) > 0 then left(new.texto, 140)
           else '[adjunto]' end,
         preview_emisor  = new.emisor,
         last_message_at = greatest(coalesce(t.last_message_at, 'epoch'::timestamptz), new.meta_timestamp),
         no_leidos = case
           when new.direccion = 'inbound' and not new.is_echo
           then t.no_leidos + 1 else t.no_leidos end
   where t.id = (select c.tarjeta_id from public.conversations c where c.id = new.conversation_id);
  return null;
end $$;

create or replace function private.adelanto_tras_borrado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.tarjetas t
       set preview_texto = 'Mensaje eliminado'
     where t.id = (select c.tarjeta_id from public.conversations c where c.id = new.conversation_id)
       -- Solo si es el último mensaje DE LA TARJETA, no de su conversación: con
       -- varios canales, el último puede haber llegado por otro.
       and not exists (
         select 1
           from public.messages m2
           join public.conversations c2 on c2.id = m2.conversation_id
          where c2.tarjeta_id = t.id
            and m2.meta_timestamp > new.meta_timestamp
       );
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Actividad y tiempo real de la tarjeta
-- ---------------------------------------------------------------------------
-- El trigger de actividad estaba sobre `conversations.estado`. Ese estado ya no
-- vive ahí, así que se mueve. La actividad se escribe en TODAS las
-- conversaciones de la tarjeta: el requisito es que salga en la conversación, y
-- una tarjeta puede tener varias.
create or replace function private.actividad_de_tarjeta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_conv uuid; v_tipo text; v_detalle jsonb;
begin
  if new.estado is distinct from old.estado then
    v_tipo := case new.estado when 'cerrada' then 'tarjeta.cerrada' else 'tarjeta.estado' end;
    v_detalle := jsonb_build_object('de', old.estado, 'a', new.estado);
    for v_conv in select c.id from public.conversations c where c.tarjeta_id = new.id loop
      perform private.registrar_actividad(
        new.organization_id, v_tipo,
        case when v_user is null then 'sistema' else 'usuario' end,
        v_conv, v_user, v_detalle);
    end loop;
  end if;

  if new.asignado_a is distinct from old.asignado_a then
    v_tipo := case when new.asignado_a is null then 'tarjeta.desasignada' else 'tarjeta.asignada' end;
    v_detalle := jsonb_build_object(
      'de', old.asignado_a, 'a', new.asignado_a,
      'a_nombre', (select coalesce(u.raw_user_meta_data->>'nombre', u.email)
                     from auth.users u where u.id = new.asignado_a));
    for v_conv in select c.id from public.conversations c where c.tarjeta_id = new.id loop
      perform private.registrar_actividad(
        new.organization_id, v_tipo,
        case when v_user is null then 'sistema' else 'usuario' end,
        v_conv, v_user, v_detalle);
    end loop;
  end if;

  if new.titulo is distinct from old.titulo then
    for v_conv in select c.id from public.conversations c where c.tarjeta_id = new.id loop
      perform private.registrar_actividad(
        new.organization_id, 'tarjeta.titulo', 'usuario', v_conv, v_user,
        jsonb_build_object('de', old.titulo, 'a', new.titulo));
    end loop;
  end if;

  return new;
end $$;

drop trigger conversations_actividad on public.conversations;
drop function private.actividad_de_conversacion();

create trigger tarjetas_actividad
  after update on public.tarjetas
  for each row execute function private.actividad_de_tarjeta();

create trigger tarjetas_avisar
  after update on public.tarjetas
  for each row execute function private.avisar_bandeja();

-- `avisar_bandeja` distingue por nombre de tabla. Para tarjetas no hay una
-- conversación concreta que refrescar: se avisa de la organización y el cliente
-- relee lo que tenga abierto.
create or replace function private.avisar_bandeja()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_conv uuid;
begin
  if tg_table_name in ('messages', 'actividades') then
    v_org := new.organization_id; v_conv := new.conversation_id;
  elsif tg_table_name = 'tarjetas' then
    v_org := new.organization_id; v_conv := null;
  else
    v_org := new.organization_id; v_conv := new.id;
  end if;

  perform realtime.send(
    jsonb_build_object('tabla', tg_table_name, 'conversation_id', v_conv, 'momento', now()),
    'cambio', 'org:' || v_org::text, false);
  return null;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Marcar leído pasa a ser de la tarjeta
-- ---------------------------------------------------------------------------
create or replace function public.marcar_leido(p_conversacion uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_tarjeta uuid;
begin
  select c.organization_id, c.tarjeta_id into v_org, v_tarjeta
    from public.conversations c where c.id = p_conversacion;
  if v_org is null or not public.es_miembro(v_org) then return; end if;
  update public.tarjetas set no_leidos = 0 where id = v_tarjeta and no_leidos <> 0;
end $$;
