-- 0026_multicanal.sql — una persona, varios canales.
--
-- EL CASO
--
-- La misma persona escribe por Instagram y además tiene WhatsApp. Para el
-- operador es UNA persona; para Meta son identificadores de espacios distintos
-- que no se pueden correlacionar por API (PSID, IGSID y número de teléfono son
-- incomparables, y Meta no ofrece ninguna forma de resolverlos entre sí).
--
-- LA DECISIÓN, Y POR QUÉ NO ES "UNA CONVERSACIÓN CON VARIOS CANALES"
--
-- La persona se unifica. La conversación NO. Un hilo sigue siendo de un canal,
-- porque las tres cosas que gobiernan un hilo son por canal y no se pueden
-- mezclar sin romper algo:
--
--   · La ventana de 24 h se cuenta sobre el último entrante DE ESE CANAL. Una
--     conversación mixta tendría dos relojes a la vez y el compositor no podría
--     decir si se puede responder.
--   · El envío va con el token y el endpoint de ese canal, a ese identificador.
--     No existe "responder a la persona": se responde a un hilo concreto.
--   · La propiedad del hilo (Conversation Routing, standby) es por canal. Meta
--     puede quitarnos el hilo de Instagram y dejarnos el de Messenger.
--
-- Así que lo que se une es el CONTACTO, que es lo que el esquema ya modelaba:
-- `contacts` es la persona y `contact_identities` son sus identidades por canal.
-- Lo que faltaba no era el modelo, era la maquinaria para unirlas y la interfaz
-- para verlas. Eso es lo que añade esta migración.

-- ---------------------------------------------------------------------------
-- 1. WhatsApp cabe en el modelo
-- ---------------------------------------------------------------------------
-- Se añade al dominio para que una identidad de WhatsApp se pueda REGISTRAR
-- hoy: el operador sabe el número de la persona y quiere dejarlo escrito junto
-- a su Instagram. Eso no es lo mismo que soportar el canal.
--
-- QUE QUEDE CLARO: no hay ingesta, ni envío, ni webhook de WhatsApp. El
-- documento 03 marca WhatsApp como no investigado y esta migración no cambia
-- eso ni una coma. Un valor en un dominio no es una integración.
alter domain public.canal_meta drop constraint canal_meta_check;
alter domain public.canal_meta add constraint canal_meta_check
  check (value in ('messenger', 'instagram', 'whatsapp'));

-- ---------------------------------------------------------------------------
-- 2. De dónde sale cada identidad
-- ---------------------------------------------------------------------------
alter table public.contact_identities
  add column origen text not null default 'meta' check (origen in ('meta', 'manual')),
  -- Lo que el operador lee: @usuario, +58 412..., un nombre. El scoped_id es
  -- opaco y no se le puede enseñar a nadie como identificación de una persona.
  add column etiqueta text,
  add column creada_por uuid references auth.users(id) on delete set null;

-- Un número de WhatsApp mal escrito es una identidad que nunca casará con nada
-- y que además se muestra como si fuera buena. Se valida en la frontera.
-- E.164 sin el '+': solo dígitos, sin cero inicial.
alter table public.contact_identities add constraint contact_identities_whatsapp_e164
  check (canal <> 'whatsapp' or scoped_id ~ '^[1-9][0-9]{7,14}$');

comment on column public.contact_identities.origen is
  'meta = la trajo un webhook y gobierna el enrutado. manual = la escribió una '
  'persona del equipo. Solo las manuales se pueden desvincular: borrar una de '
  'Meta dejaría huérfano el enrutado de los mensajes que ya están llegando.';

-- ---------------------------------------------------------------------------
-- 3. Un contacto absorbido no se borra
-- ---------------------------------------------------------------------------
-- Fusionar es reversible o no es fusionar. Si el absorbido desapareciera no
-- habría a dónde volver, y una fusión equivocada muestra el historial de una
-- persona bajo el nombre de otra: es de los errores más caros que puede cometer
-- un operador y tiene que poder deshacerlo él mismo, sin abrir un ticket.
alter table public.contacts
  add column fusionado_en uuid,
  add constraint contacts_fusionado_mismo_tenant
    foreign key (organization_id, fusionado_en)
    references public.contacts (organization_id, id) on delete set null;

create index contacts_fusionado_idx on public.contacts (organization_id, fusionado_en)
  where fusionado_en is not null;

-- La columna la mueve el RPC, que además deja registro. Sin esto, un miembro
-- podría marcar el contacto como fusionado con un PATCH directo, sin mover nada
-- y sin que quedara constancia: el estado quedaría mintiendo.
--
-- Se revoca la tabla entera y se vuelve a conceder columna a columna. Revocar
-- solo la columna NO sirve: con el UPDATE concedido a nivel de tabla, Postgres
-- responde "no privileges could be revoked for column" y deja el permiso
-- intacto. Un revoke que no revoca es peor que ninguno, porque parece que
-- protege.
revoke update on public.contacts from authenticated;
grant  update (nombre, username, profile_pic_url) on public.contacts to authenticated;

create table public.contact_fusiones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  superviviente_id uuid not null,
  absorbido_id     uuid not null,

  -- Exactamente lo que se movió. Deshacer no es "adivinar qué era de quién":
  -- es devolver estas filas y ninguna otra. Si entre la fusión y el deshacer
  -- llegó una identidad nueva, se queda donde está, que es lo correcto.
  identidades    uuid[] not null default '{}',
  conversaciones uuid[] not null default '{}',

  motivo     text not null,
  hecha_por  uuid references auth.users(id) on delete set null,
  hecha_en   timestamptz not null default now(),

  deshecha_en  timestamptz,
  deshecha_por uuid references auth.users(id) on delete set null,

  constraint contact_fusiones_superviviente_mismo_tenant
    foreign key (organization_id, superviviente_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint contact_fusiones_absorbido_mismo_tenant
    foreign key (organization_id, absorbido_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint contact_fusiones_distintos check (superviviente_id <> absorbido_id)
);

create index contact_fusiones_org_idx on public.contact_fusiones (organization_id, hecha_en desc);

alter table public.contact_fusiones enable row level security;
alter table public.contact_fusiones force  row level security;

create policy contact_fusiones_select on public.contact_fusiones
  for select to authenticated
  using (public.es_miembro(organization_id));

-- Sin insert, update ni delete: se escribe desde los RPC. Un registro de
-- fusiones que el propio operador puede reescribir no sirve para auditar nada.

-- ---------------------------------------------------------------------------
-- 4. Vincular una identidad a mano
-- ---------------------------------------------------------------------------
-- Va por RPC y no por política de insert precisamente para que no exista
-- ninguna ruta que escriba una identidad sin dejar actividad. El requisito es
-- que en la conversación salga todo lo que hace el usuario; una política de
-- tabla abriría un camino silencioso.
create or replace function public.vincular_identidad(
  p_contacto  uuid,
  p_canal     text,
  p_valor     text,
  p_etiqueta  text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org      uuid;
  v_user     uuid := (select auth.uid());
  v_valor    text;
  v_id       uuid;
  v_conv     uuid;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;

  select organization_id into v_org from public.contacts where id = p_contacto;
  if v_org is null then
    raise exception 'Ese contacto no existe.' using errcode = 'P0002';
  end if;
  -- SECURITY DEFINER se salta la RLS: la pertenencia se comprueba aquí a mano o
  -- no se comprueba en ningún sitio.
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  if p_canal = 'whatsapp' then
    -- Se guarda en E.164 sin adornos: '+58 412-555 11 22' y '584125551122' son
    -- el mismo número y tienen que colisionar en la clave única, no convivir.
    v_valor := regexp_replace(coalesce(p_valor, ''), '[^0-9]', '', 'g');
    if v_valor !~ '^[1-9][0-9]{7,14}$' then
      raise exception 'Ese número no parece un teléfono internacional válido. Escríbelo con el código de país, por ejemplo 584125551122.'
        using errcode = '22023';
    end if;
  else
    v_valor := btrim(coalesce(p_valor, ''));
    if v_valor = '' then
      raise exception 'Falta el identificador.' using errcode = '22023';
    end if;
  end if;

  insert into public.contact_identities
    (organization_id, contact_id, canal, scoped_id, origen, etiqueta, creada_por)
  values
    (v_org, p_contacto, p_canal::public.canal_meta, v_valor, 'manual',
     nullif(btrim(coalesce(p_etiqueta, '')), ''), v_user)
  returning id into v_id;

  -- Sale en TODAS las conversaciones de la persona: quien abra cualquiera de
  -- sus hilos tiene que enterarse de que ahora tiene otro canal asociado.
  for v_conv in
    select c.id from public.conversations c where c.contact_id = p_contacto
  loop
    perform private.registrar_actividad(
      v_org, 'identidad.vinculada', 'usuario', v_conv, v_user,
      jsonb_build_object('canal', p_canal, 'etiqueta', coalesce(p_etiqueta, v_valor))
    );
  end loop;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ese identificador ya está vinculado a un contacto de esta organización.'
      using errcode = '23505';
end $$;

-- El `canal` se pasa como text y se castea dentro: si el dominio crece, la
-- firma no cambia.
create or replace function public.desvincular_identidad(p_identidad uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_contacto uuid; v_canal text; v_origen text; v_etiqueta text;
  v_user uuid := (select auth.uid());
  v_conv uuid;
begin
  select organization_id, contact_id, canal::text, origen, coalesce(etiqueta, scoped_id)
    into v_org, v_contacto, v_canal, v_origen, v_etiqueta
    from public.contact_identities where id = p_identidad;

  if v_org is null then
    raise exception 'Esa identidad no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if v_origen <> 'manual' then
    raise exception 'Esa identidad la creó Meta y es la que enruta los mensajes entrantes. Quitarla dejaría los mensajes sin destino.'
      using errcode = '42501';
  end if;

  delete from public.contact_identities where id = p_identidad;

  for v_conv in select c.id from public.conversations c where c.contact_id = v_contacto loop
    perform private.registrar_actividad(
      v_org, 'identidad.desvinculada', 'usuario', v_conv, v_user,
      jsonb_build_object('canal', v_canal, 'etiqueta', v_etiqueta)
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Fusionar dos contactos
-- ---------------------------------------------------------------------------
create or replace function public.fusionar_contactos(
  p_superviviente uuid,
  p_absorbido     uuid,
  p_motivo        text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_org_b uuid;
  v_user uuid := (select auth.uid());
  v_ids uuid[]; v_convs uuid[];
  v_choque text; v_fusion uuid; v_conv uuid;
  v_nombre_abs text; v_user_abs text;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if p_superviviente = p_absorbido then
    raise exception 'Un contacto no se puede fusionar consigo mismo.' using errcode = '22023';
  end if;
  -- El motivo no es burocracia: una fusión mal hecha enseña la conversación de
  -- una persona bajo el nombre de otra, y dentro de tres meses nadie recuerda
  -- por qué se hizo. Es la misma regla que el acceso temporal del staff.
  if p_motivo is null or length(btrim(p_motivo)) < 8 then
    raise exception 'La fusión necesita un motivo de al menos 8 caracteres: queda escrito en el hilo.'
      using errcode = '22023';
  end if;

  select organization_id, nombre, username into v_org, v_nombre_abs, v_user_abs
    from public.contacts where id = p_absorbido;
  select organization_id into v_org_b from public.contacts where id = p_superviviente;

  if v_org is null or v_org_b is null then
    raise exception 'Alguno de los contactos no existe.' using errcode = 'P0002';
  end if;
  -- Sin esta línea, un miembro podría absorber el contacto de OTRO cliente y
  -- arrastrar sus conversaciones a su propia bandeja. Es la frontera de tenant
  -- de esta función.
  if v_org <> v_org_b then
    raise exception 'No se pueden fusionar contactos de organizaciones distintas.' using errcode = '42501';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  -- Dos hilos abiertos en el mismo canal son dos cuentas distintas de ese canal.
  -- Y aunque no lo fueran, `conversations` tiene una única parcial sobre
  -- (organization_id, canal, contact_id) para los no cerrados: mover reventaría
  -- con un error de constraint que no le dice nada a nadie. Mejor explicarlo.
  select string_agg(distinct a.canal::text, ', ') into v_choque
    from public.conversations a
    join public.conversations b
      on b.contact_id = p_superviviente and b.canal = a.canal and b.estado <> 'cerrada'
   where a.contact_id = p_absorbido and a.estado <> 'cerrada';

  if v_choque is not null then
    raise exception 'Los dos contactos tienen una conversación abierta en %. Cierra una de las dos antes de fusionar.', v_choque
      using errcode = '23505';
  end if;

  select coalesce(array_agg(id), '{}') into v_ids
    from public.contact_identities where contact_id = p_absorbido;
  select coalesce(array_agg(id), '{}') into v_convs
    from public.conversations where contact_id = p_absorbido;

  update public.contact_identities set contact_id = p_superviviente where id = any(v_ids);
  update public.conversations       set contact_id = p_superviviente where id = any(v_convs);
  update public.contacts            set fusionado_en = p_superviviente where id = p_absorbido;

  -- El superviviente se queda con el mejor dato disponible, sin pisar el suyo.
  update public.contacts
     set nombre   = coalesce(nombre, v_nombre_abs),
         username = coalesce(username, v_user_abs)
   where id = p_superviviente;

  insert into public.contact_fusiones
    (organization_id, superviviente_id, absorbido_id, identidades, conversaciones, motivo, hecha_por)
  values
    (v_org, p_superviviente, p_absorbido, v_ids, v_convs, btrim(p_motivo), v_user)
  returning id into v_fusion;

  for v_conv in
    select c.id from public.conversations c where c.contact_id = p_superviviente
  loop
    perform private.registrar_actividad(
      v_org, 'contacto.fusionado', 'usuario', v_conv, v_user,
      jsonb_build_object(
        'fusion_id', v_fusion,
        'absorbido', coalesce(v_nombre_abs, v_user_abs, 'contacto sin nombre'),
        'motivo', btrim(p_motivo),
        'conversaciones', coalesce(array_length(v_convs, 1), 0),
        'identidades', coalesce(array_length(v_ids, 1), 0))
    );
  end loop;

  return v_fusion;
end $$;

create or replace function public.deshacer_fusion(p_fusion uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_sup uuid; v_abs uuid; v_ids uuid[]; v_convs uuid[];
  v_user uuid := (select auth.uid());
  v_conv uuid; v_deshecha timestamptz;
begin
  select organization_id, superviviente_id, absorbido_id, identidades, conversaciones, deshecha_en
    into v_org, v_sup, v_abs, v_ids, v_convs, v_deshecha
    from public.contact_fusiones where id = p_fusion;

  if v_org is null then
    raise exception 'Esa fusión no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if v_deshecha is not null then
    raise exception 'Esa fusión ya se deshizo.' using errcode = '22023';
  end if;

  -- Se avisa ANTES de separar: después, las conversaciones que vuelven al
  -- absorbido ya no cuelgan del superviviente y el aviso no aparecería en ellas.
  for v_conv in select c.id from public.conversations c where c.contact_id = v_sup loop
    perform private.registrar_actividad(
      v_org, 'contacto.separado', 'usuario', v_conv, v_user,
      jsonb_build_object('fusion_id', p_fusion)
    );
  end loop;

  update public.contact_identities set contact_id = v_abs where id = any(v_ids);
  update public.conversations       set contact_id = v_abs where id = any(v_convs);
  update public.contacts            set fusionado_en = null where id = v_abs;

  update public.contact_fusiones
     set deshecha_en = now(), deshecha_por = v_user
   where id = p_fusion;
end $$;

revoke execute on function public.vincular_identidad(uuid, text, text, text) from public, anon;
revoke execute on function public.desvincular_identidad(uuid)               from public, anon;
revoke execute on function public.fusionar_contactos(uuid, uuid, text)      from public, anon;
revoke execute on function public.deshacer_fusion(uuid)                     from public, anon;

-- ---------------------------------------------------------------------------
-- 6. Lo que la interfaz necesita leer
-- ---------------------------------------------------------------------------
-- security_invoker desde el primer día. La lección de 0025 no se repite.
create view public.persona_canales
with (security_invoker = on) as
  select
    ci.organization_id,
    ci.contact_id,
    ci.id            as identidad_id,
    ci.canal,
    ci.scoped_id,
    ci.origen,
    coalesce(ci.etiqueta, c.username, ci.scoped_id) as etiqueta,
    (select v.id
       from public.conversations v
      where v.contact_id = ci.contact_id
        and v.canal = ci.canal
        and v.estado <> 'cerrada'
      order by v.last_message_at desc nulls last
      limit 1)       as conversacion_abierta
  from public.contact_identities ci
  join public.contacts c on c.id = ci.contact_id;

comment on view public.persona_canales is
  'Los canales por los que se puede hablar con una persona, con el hilo abierto '
  'de cada uno si lo hay. Una fila por identidad, no por conversación.';
