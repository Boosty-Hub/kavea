-- 0030_actividad_de_tarjeta.sql — la actividad de la tarjeta se registra UNA vez.
--
-- EL DEFECTO, VISTO EN LA PRIMERA TARJETA REAL DE DOS CANALES
--
-- "unió otra tarjeta con esta" salía dos veces seguidas en el hilo. La causa:
-- los RPC escribían la actividad recorriendo TODAS las conversaciones de la
-- tarjeta, porque `actividades` solo sabía colgar de una conversación. Con un
-- canal eso daba una fila y parecía correcto; con dos da dos, y con cuatro
-- daría cuatro.
--
-- El bucle era el síntoma. El fallo de fondo es que hay actividad que es DE LA
-- TARJETA —unir, cambiar el estado, rellenar un campo, vincular un canal— y no
-- de ninguna conversación en concreto. Repartirla por conversaciones es
-- guardar N copias de un hecho que ocurrió una vez.

alter table public.actividades
  add column tarjeta_id uuid,
  add constraint actividades_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete cascade,
  -- Una actividad cuelga de una conversación o de una tarjeta, nunca de las dos
  -- ni de ninguna de las dos. La de organización —conectar un canal, abrir un
  -- acceso temporal— sigue sin ninguna de las dos, y por eso el check admite
  -- que ambas sean nulas.
  add constraint actividades_ambito_coherente check (
    conversation_id is null or tarjeta_id is null);

create index actividades_tarjeta_idx
  on public.actividades (organization_id, tarjeta_id, created_at desc)
  where tarjeta_id is not null;

comment on column public.actividades.tarjeta_id is
  'Actividad DEL ASUNTO: unir, estado, asignación, campos, canales. Se registra '
  'una sola vez aunque la tarjeta tenga varias conversaciones. La actividad de '
  'un hilo concreto usa conversation_id; las dos son excluyentes.';

-- ---------------------------------------------------------------------------
-- Escribir actividad de tarjeta
-- ---------------------------------------------------------------------------
create or replace function private.registrar_actividad_tarjeta(
  p_org      uuid,
  p_tarjeta  uuid,
  p_tipo     text,
  p_actor_tipo text,
  p_user     uuid    default null,
  p_detalle  jsonb   default '{}'::jsonb
)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id bigint; v_nombre text;
begin
  if p_user is not null then
    select coalesce(u.raw_user_meta_data->>'nombre', u.email)
      into v_nombre from auth.users u where u.id = p_user;
  elsif p_actor_tipo = 'agente' then v_nombre := 'Agente';
  elsif p_actor_tipo = 'sistema' then v_nombre := 'Kavea';
  end if;

  insert into public.actividades
    (organization_id, tarjeta_id, tipo, actor_tipo, actor_user_id, actor_nombre, detalle)
  values
    (p_org, p_tarjeta, p_tipo, p_actor_tipo, p_user, v_nombre, coalesce(p_detalle, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function private.registrar_actividad_tarjeta(uuid,uuid,text,text,uuid,jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Los tres sitios que hacían el bucle
-- ---------------------------------------------------------------------------
create or replace function private.actividad_de_tarjeta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_actor text;
begin
  v_actor := case when v_user is null then 'sistema' else 'usuario' end;

  if new.estado is distinct from old.estado then
    perform private.registrar_actividad_tarjeta(
      new.organization_id, new.id,
      case new.estado when 'cerrada' then 'tarjeta.cerrada' else 'tarjeta.estado' end,
      v_actor, v_user, jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;

  if new.asignado_a is distinct from old.asignado_a then
    perform private.registrar_actividad_tarjeta(
      new.organization_id, new.id,
      case when new.asignado_a is null then 'tarjeta.desasignada' else 'tarjeta.asignada' end,
      v_actor, v_user,
      jsonb_build_object(
        'de', old.asignado_a, 'a', new.asignado_a,
        'a_nombre', (select coalesce(u.raw_user_meta_data->>'nombre', u.email)
                       from auth.users u where u.id = new.asignado_a)));
  end if;

  if new.titulo is distinct from old.titulo then
    perform private.registrar_actividad_tarjeta(
      new.organization_id, new.id, 'tarjeta.titulo', v_actor, v_user,
      jsonb_build_object('de', old.titulo, 'a', new.titulo));
  end if;

  return new;
end $$;

-- Vincular y desvincular un canal es de la persona, y se registra en su tarjeta
-- viva. Antes recorría todas sus conversaciones.
create or replace function public.vincular_identidad(
  p_contacto uuid, p_canal text, p_valor text, p_etiqueta text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_user uuid := (select auth.uid()); v_valor text; v_id uuid; v_tarjeta uuid;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select organization_id into v_org from public.contacts where id = p_contacto;
  if v_org is null then raise exception 'Ese contacto no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  if p_canal = 'whatsapp' then
    v_valor := regexp_replace(coalesce(p_valor, ''), '[^0-9]', '', 'g');
    if v_valor !~ '^[1-9][0-9]{7,14}$' then
      raise exception 'Ese número no parece un teléfono internacional válido. Escríbelo con el código de país, por ejemplo 584125551122.'
        using errcode = '22023';
    end if;
  else
    v_valor := btrim(coalesce(p_valor, ''));
    if v_valor = '' then raise exception 'Falta el identificador.' using errcode = '22023'; end if;
  end if;

  insert into public.contact_identities
    (organization_id, contact_id, canal, scoped_id, origen, etiqueta, creada_por)
  values
    (v_org, p_contacto, p_canal::public.canal_meta, v_valor, 'manual',
     nullif(btrim(coalesce(p_etiqueta, '')), ''), v_user)
  returning id into v_id;

  select id into v_tarjeta from public.tarjetas
   where contact_id = p_contacto and cerrada_en is null limit 1;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'identidad.vinculada', 'usuario', v_user,
      jsonb_build_object('canal', p_canal, 'etiqueta', coalesce(p_etiqueta, v_valor)));
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Ese identificador ya está vinculado a un contacto de esta organización.'
    using errcode = '23505';
end $$;

create or replace function public.desvincular_identidad(p_identidad uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_contacto uuid; v_canal text; v_origen text; v_etiqueta text;
  v_user uuid := (select auth.uid()); v_tarjeta uuid;
begin
  select organization_id, contact_id, canal::text, origen, coalesce(etiqueta, scoped_id)
    into v_org, v_contacto, v_canal, v_origen, v_etiqueta
    from public.contact_identities where id = p_identidad;

  if v_org is null then raise exception 'Esa identidad no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if v_origen <> 'manual' then
    raise exception 'Esa identidad la creó Meta y es la que enruta los mensajes entrantes. Quitarla dejaría los mensajes sin destino.'
      using errcode = '42501';
  end if;

  delete from public.contact_identities where id = p_identidad;

  select id into v_tarjeta from public.tarjetas
   where contact_id = v_contacto and cerrada_en is null limit 1;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'identidad.desvinculada', 'usuario', v_user,
      jsonb_build_object('canal', v_canal, 'etiqueta', v_etiqueta));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Unir y separar
-- ---------------------------------------------------------------------------
create or replace function public.unir_tarjetas(
  p_superviviente uuid, p_absorbida uuid, p_motivo text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_org_b uuid;
  v_user uuid := (select auth.uid());
  v_cont_sup uuid; v_cont_abs uuid;
  v_convs uuid[]; v_ids uuid[] := '{}';
  v_choque text; v_union uuid;
  v_nombre_abs text; v_user_abs text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if p_superviviente = p_absorbida then
    raise exception 'Una tarjeta no se puede unir consigo misma.' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 8 then
    raise exception 'La unión necesita un motivo de al menos 8 caracteres: queda escrito en el hilo.'
      using errcode = '22023';
  end if;

  select organization_id, contact_id into v_org,   v_cont_sup from public.tarjetas where id = p_superviviente;
  select organization_id, contact_id into v_org_b, v_cont_abs from public.tarjetas where id = p_absorbida;

  if v_org is null or v_org_b is null then
    raise exception 'Alguna de las tarjetas no existe.' using errcode = 'P0002';
  end if;
  if v_org <> v_org_b then
    raise exception 'No se pueden unir tarjetas de organizaciones distintas.' using errcode = '42501';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  if v_cont_sup <> v_cont_abs then
    select string_agg(distinct a.canal::text, ', ') into v_choque
      from public.conversations a
      join public.conversations b
        on b.contact_id = v_cont_sup and b.canal = a.canal and b.cerrada_en is null
     where a.contact_id = v_cont_abs and a.cerrada_en is null;

    if v_choque is not null then
      raise exception 'Las dos personas tienen un hilo abierto en %. Cierra uno antes de unir: dos hilos vivos del mismo canal son dos cuentas distintas.', v_choque
        using errcode = '23505';
    end if;
  end if;

  select coalesce(array_agg(id), '{}') into v_convs
    from public.conversations where tarjeta_id = p_absorbida;

  update public.conversations set tarjeta_id = p_superviviente where id = any(v_convs);

  if v_cont_sup <> v_cont_abs then
    select nombre, username into v_nombre_abs, v_user_abs from public.contacts where id = v_cont_abs;
    select coalesce(array_agg(id), '{}') into v_ids
      from public.contact_identities where contact_id = v_cont_abs;

    update public.contact_identities set contact_id = v_cont_sup where id = any(v_ids);
    update public.conversations       set contact_id = v_cont_sup where id = any(v_convs);
    update public.contacts            set fusionado_en = v_cont_sup where id = v_cont_abs;
    update public.contacts
       set nombre   = coalesce(nombre, v_nombre_abs),
           username = coalesce(username, v_user_abs)
     where id = v_cont_sup;
  end if;

  -- La actividad de la tarjeta absorbida se muda con sus conversaciones: el
  -- historial del asunto no se parte en dos por haberlo unido.
  update public.actividades set tarjeta_id = p_superviviente
   where tarjeta_id = p_absorbida;

  update public.tarjetas set cerrada_en = now(), estado = 'cerrada' where id = p_absorbida;

  insert into public.uniones
    (organization_id, tarjeta_superviviente, tarjeta_absorbida, conversaciones,
     identidades, contacto_absorbido, motivo, hecha_por)
  values
    (v_org, p_superviviente, p_absorbida, v_convs, v_ids,
     case when v_cont_sup <> v_cont_abs then v_cont_abs end, btrim(p_motivo), v_user)
  returning id into v_union;

  perform private.registrar_actividad_tarjeta(
    v_org, p_superviviente, 'tarjetas.unidas', 'usuario', v_user,
    jsonb_build_object(
      'union_id', v_union, 'motivo', btrim(p_motivo),
      'conversaciones', coalesce(array_length(v_convs, 1), 0),
      'misma_persona', v_cont_sup = v_cont_abs));

  return v_union;
end $$;

create or replace function public.separar_tarjetas(p_union uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_sup uuid; v_abs uuid; v_convs uuid[]; v_ids uuid[];
  v_cont_abs uuid; v_deshecha timestamptz; v_user uuid := (select auth.uid());
begin
  select organization_id, tarjeta_superviviente, tarjeta_absorbida, conversaciones,
         identidades, contacto_absorbido, deshecha_en
    into v_org, v_sup, v_abs, v_convs, v_ids, v_cont_abs, v_deshecha
    from public.uniones where id = p_union;

  if v_org is null then raise exception 'Esa unión no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if v_deshecha is not null then
    raise exception 'Esa unión ya se deshizo.' using errcode = '22023';
  end if;

  perform private.registrar_actividad_tarjeta(
    v_org, v_sup, 'tarjetas.separadas', 'usuario', v_user,
    jsonb_build_object('union_id', p_union));

  if v_cont_abs is not null then
    update public.contact_identities set contact_id = v_cont_abs where id = any(v_ids);
    update public.conversations       set contact_id = v_cont_abs where id = any(v_convs);
    update public.contacts            set fusionado_en = null      where id = v_cont_abs;
  end if;

  update public.tarjetas set cerrada_en = null, estado = 'en_curso' where id = v_abs;
  update public.conversations set tarjeta_id = v_abs where id = any(v_convs);

  update public.uniones set deshecha_en = now(), deshecha_por = v_user where id = p_union;
end $$;

-- ---------------------------------------------------------------------------
-- Guardar un campo: una fila, no una por conversación
-- ---------------------------------------------------------------------------
create or replace function public.guardar_campo(p_campo uuid, p_destino uuid, p_valor jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_tipo text; v_ambito text; v_etiqueta text; v_opciones jsonb;
  v_user uuid := (select auth.uid());
  v_anterior jsonb; v_tarjeta uuid; v_vacio boolean;
begin
  select organization_id, tipo, ambito, etiqueta, opciones
    into v_org, v_tipo, v_ambito, v_etiqueta, v_opciones
    from public.campos where id = p_campo and archivado_en is null;

  if v_org is null then
    raise exception 'Ese campo no existe o está archivado.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  v_vacio := p_valor is null or jsonb_typeof(p_valor) = 'null'
             or (jsonb_typeof(p_valor) = 'string' and btrim(p_valor #>> '{}') = '');

  if not v_vacio then
    case v_tipo
      when 'numero', 'moneda' then
        if jsonb_typeof(p_valor) <> 'number' then
          raise exception '% espera un número.', v_etiqueta using errcode = '22023';
        end if;
      when 'booleano' then
        if jsonb_typeof(p_valor) <> 'boolean' then
          raise exception '% espera sí o no.', v_etiqueta using errcode = '22023';
        end if;
      when 'fecha' then
        begin perform (p_valor #>> '{}')::date;
        exception when others then
          raise exception '% espera una fecha con formato AAAA-MM-DD.', v_etiqueta using errcode = '22023';
        end;
      when 'seleccion' then
        if not (v_opciones @> jsonb_build_array(p_valor #>> '{}')) then
          raise exception '% solo admite: %', v_etiqueta,
            (select string_agg(x, ', ') from jsonb_array_elements_text(v_opciones) x)
            using errcode = '22023';
        end if;
      when 'multiseleccion' then
        if jsonb_typeof(p_valor) <> 'array' then
          raise exception '% espera una lista.', v_etiqueta using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements_text(p_valor) e
                    where not (v_opciones @> jsonb_build_array(e))) then
          raise exception '% tiene un valor que no está entre sus opciones.', v_etiqueta
            using errcode = '22023';
        end if;
      when 'correo' then
        if (p_valor #>> '{}') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
          raise exception '% espera un correo.', v_etiqueta using errcode = '22023';
        end if;
      when 'url' then
        if (p_valor #>> '{}') !~ '^https?://' then
          raise exception '% espera una dirección que empiece por http:// o https://', v_etiqueta
            using errcode = '22023';
        end if;
      else null;
    end case;
  end if;

  if v_ambito = 'tarjeta' then
    select valor into v_anterior from public.campo_valores
     where campo_id = p_campo and tarjeta_id = p_destino;
    v_tarjeta := p_destino;
  else
    select valor into v_anterior from public.campo_valores
     where campo_id = p_campo and contacto_id = p_destino;
    select id into v_tarjeta from public.tarjetas
     where contact_id = p_destino and cerrada_en is null limit 1;
  end if;

  if v_anterior is not distinct from p_valor then return; end if;

  if v_vacio then
    if v_ambito = 'tarjeta' then
      delete from public.campo_valores where campo_id = p_campo and tarjeta_id = p_destino;
    else
      delete from public.campo_valores where campo_id = p_campo and contacto_id = p_destino;
    end if;
  elsif v_ambito = 'tarjeta' then
    insert into public.campo_valores
      (organization_id, campo_id, tarjeta_id, valor, actualizado_por, actualizado_en)
    values (v_org, p_campo, p_destino, p_valor, v_user, now())
    on conflict (campo_id, tarjeta_id) where tarjeta_id is not null do update
      set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
          actualizado_en = excluded.actualizado_en;
  else
    insert into public.campo_valores
      (organization_id, campo_id, contacto_id, valor, actualizado_por, actualizado_en)
    values (v_org, p_campo, p_destino, p_valor, v_user, now())
    on conflict (campo_id, contacto_id) where contacto_id is not null do update
      set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
          actualizado_en = excluded.actualizado_en;
  end if;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'campo.valor', 'usuario', v_user,
      jsonb_build_object('etiqueta', v_etiqueta, 'de', v_anterior,
                         'a', case when v_vacio then null else p_valor end));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- La línea de tiempo recoge las dos formas de actividad
-- ---------------------------------------------------------------------------
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

  -- Actividad de un hilo concreto.
  select
    a.organization_id, a.conversation_id, c.tarjeta_id, c.canal::text,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  join public.conversations c on c.id = a.conversation_id
  where a.conversation_id is not null

  union all

  -- Actividad del asunto. No tiene canal, y eso es correcto: unir dos tarjetas
  -- o cambiar un campo no ocurre "por Instagram".
  select
    a.organization_id, null::uuid, a.tarjeta_id, null::text,
    'actividad', a.id::text, a.created_at,
    a.tipo, a.actor_tipo, a.actor_user_id, a.actor_nombre, a.detalle
  from public.actividades a
  where a.tarjeta_id is not null;

comment on view public.linea_tiempo is
  'Hilo unificado por tarjeta: mensajes, eventos de Meta y actividad, esta '
  'última tanto la de un hilo concreto como la del asunto entero. Las entradas '
  'sin canal son del asunto. security_invoker = on: no quitar esa opción.';
