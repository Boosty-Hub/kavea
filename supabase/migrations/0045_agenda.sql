-- 0045_agenda.sql — tareas con recordatorio y centro de notificaciones.
-- Fuente: docs/fases/03e-fase-agenda.md.
--
-- LO QUE SEPARA UNA ACTIVIDAD DE UNA NOTIFICACIÓN
--
--   `actividades`     lo que PASÓ. De la organización. No se borra. Se escribe
--                     siempre, en todo RPC que cambia algo.
--   `notificaciones`  lo que ALGUIEN tiene que saber. De una persona. Se marca
--                     leída. Se escribe solo si a alguien le cambia el día.
--
-- Si de cada actividad saliera una notificación, el centro sería una segunda
-- copia del registro y quedaría inservible en una semana. La lista de
-- disparadores es corta a propósito y cada uno nuevo entra con la pregunta
-- delante: ¿esto le cambia el día a alguien, o solo es que pasó?

-- ---------------------------------------------------------------------------
-- 1. Tareas
-- ---------------------------------------------------------------------------
create table public.tareas (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- OPCIONAL. «Llamar al proveedor» no cuelga de ninguna conversación, y
  -- obligar a inventarse una para poder apuntarla es cómo se consigue que la
  -- gente use su móvil en vez del sistema.
  tarjeta_id  uuid,

  titulo   text not null check (length(btrim(titulo)) between 1 and 200),
  detalle  text,

  -- Con hora, no solo fecha: «llamar mañana» y «llamar mañana a las 9» son
  -- recordatorios distintos, y el segundo es el que sirve.
  vence_en     timestamptz not null,
  -- Separado del vencimiento. Avisar cuando ya venció es llegar tarde por
  -- diseño.
  recordar_en  timestamptz,
  recordado_en timestamptz,
  -- Se marca cuando se avisa del vencimiento, para no repetirlo cada minuto.
  vencido_avisado_en timestamptz,

  -- Obligatorio. Una tarea sin responsable no la hace nadie y nadie lo nota.
  asignado_a  uuid not null references auth.users(id) on delete cascade,

  completada_en   timestamptz,
  completada_por  uuid references auth.users(id) on delete set null,
  creada_por      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tareas_org_id_uniq unique (organization_id, id),
  constraint tareas_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete cascade,
  constraint tareas_recordatorio_antes check (recordar_en is null or recordar_en <= vence_en),
  constraint tareas_completada_coherente check (
    (completada_en is null) = (completada_por is null))
);

-- La consulta del calendario: por organización y rango de fechas.
create index tareas_calendario_idx on public.tareas (organization_id, vence_en);
-- Las mías pendientes, que es la otra pregunta que se hace todo el rato.
create index tareas_mias_idx on public.tareas (asignado_a, vence_en)
  where completada_en is null;
create index tareas_tarjeta_idx on public.tareas (organization_id, tarjeta_id)
  where tarjeta_id is not null;
-- Para el cron: lo que toca avisar.
create index tareas_recordar_idx on public.tareas (recordar_en)
  where completada_en is null and recordado_en is null and recordar_en is not null;

create trigger tareas_touch before update on public.tareas
  for each row execute function public.tocar_updated_at();

alter table public.tareas enable row level security;
alter table public.tareas force  row level security;

create policy tareas_select on public.tareas
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin escritura directa: por RPC, que además registra actividad.

-- ---------------------------------------------------------------------------
-- 2. Notificaciones
-- ---------------------------------------------------------------------------
create table public.notificaciones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,

  tipo    text not null,
  titulo  text not null,
  cuerpo  text,
  enlace  text,

  tarjeta_id  uuid,
  tarea_id    uuid references public.tareas(id) on delete cascade,

  leida_en    timestamptz,
  created_at  timestamptz not null default now(),

  constraint notificaciones_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete cascade
);

-- SE AGRUPAN, NO SE ACUMULAN.
--
-- Diez mensajes seguidos en la misma conversación tienen que producir UNA
-- notificación, no diez. Este índice es lo que lo hace posible: el disparador
-- hace `on conflict do update` sobre la que ya está sin leer.
--
-- Sin esto, media hora sin mirar la pantalla deja cuarenta líneas de la misma
-- conversación, y la reacción de cualquiera es marcarlo todo como leído sin
-- mirarlo. Una bandeja que se vacía a ciegas no notifica nada.
create unique index notificaciones_agrupadas
  on public.notificaciones (user_id, tipo, coalesce(tarjeta_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where leida_en is null;

create index notificaciones_mias_idx
  on public.notificaciones (user_id, created_at desc);
create index notificaciones_sin_leer_idx
  on public.notificaciones (user_id) where leida_en is null;

alter table public.notificaciones enable row level security;
alter table public.notificaciones force  row level security;

-- CADA UNO VE LAS SUYAS. No las de su organización: las SUYAS. Una notificación
-- lleva el nombre de un contacto y un fragmento de conversación, y no hay
-- ninguna razón para que un compañero lea los avisos de otro.
create policy notificaciones_select on public.notificaciones
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Marcar leída es lo único que se escribe desde el cliente, y solo sobre las
-- propias.
create policy notificaciones_update on public.notificaciones
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.notificaciones from authenticated;
grant  update (leida_en) on public.notificaciones to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cómo se crea una notificación
-- ---------------------------------------------------------------------------
create or replace function private.notificar(
  p_org uuid, p_usuario uuid, p_tipo text, p_titulo text,
  p_cuerpo text default null, p_enlace text default null,
  p_tarjeta uuid default null, p_tarea uuid default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_usuario is null then return; end if;

  -- NADIE SE NOTIFICA A SÍ MISMO.
  --
  -- Si cierro yo la conversación, no me llega un aviso de que se cerró. Parece
  -- obvio y es lo primero que se rompe cuando el disparador vive en un trigger
  -- que no sabe quién actuó. Aquí sí lo sabe.
  if p_usuario = (select auth.uid()) then return; end if;

  insert into public.notificaciones
    (organization_id, user_id, tipo, titulo, cuerpo, enlace, tarjeta_id, tarea_id)
  values
    (p_org, p_usuario, p_tipo, p_titulo, p_cuerpo, p_enlace, p_tarjeta, p_tarea)
  on conflict (user_id, tipo, coalesce(tarjeta_id, '00000000-0000-0000-0000-000000000000'::uuid))
    where leida_en is null
  do update set
    titulo = excluded.titulo,
    cuerpo = excluded.cuerpo,
    created_at = now();
end $$;

revoke execute on function private.notificar(uuid,uuid,text,text,text,text,uuid,uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Los disparadores. Lista corta y cerrada.
-- ---------------------------------------------------------------------------
-- Te asignan una conversación.
create or replace function private.notificar_asignacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_nombre text;
begin
  if new.asignado_a is distinct from old.asignado_a and new.asignado_a is not null then
    select coalesce(c.nombre, c.username, 'Contacto sin nombre') into v_nombre
      from public.contacts c where c.id = new.contact_id;

    perform private.notificar(
      new.organization_id, new.asignado_a, 'tarjeta.asignada',
      'Te han asignado una conversación',
      coalesce(new.titulo, v_nombre),
      '/bandeja/' || new.id::text,
      new.id);
  end if;
  return null;
end $$;

create trigger tarjetas_notificar_asignacion
  after update on public.tarjetas
  for each row execute function private.notificar_asignacion();

-- Entra un mensaje en una conversación tuya.
create or replace function private.notificar_mensaje()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_tarjeta uuid; v_asignado uuid; v_org uuid; v_nombre text;
begin
  -- Solo lo que ENTRA. Un echo saliente es nuestro propio mensaje volviendo.
  if new.direccion <> 'inbound' or new.is_echo then return null; end if;

  select t.id, t.asignado_a, t.organization_id,
         coalesce(t.titulo, c.nombre, c.username, 'Contacto sin nombre')
    into v_tarjeta, v_asignado, v_org, v_nombre
    from public.conversations cv
    join public.tarjetas t on t.id = cv.tarjeta_id
    left join public.contacts c on c.id = t.contact_id
   where cv.id = new.conversation_id;

  -- Sin responsable no hay a quién avisar. La conversación se ve igual en la
  -- bandeja: no se inventa un destinatario.
  if v_asignado is null then return null; end if;

  perform private.notificar(
    v_org, v_asignado, 'mensaje.nuevo',
    'Mensaje nuevo de ' || v_nombre,
    left(coalesce(new.texto, '[adjunto]'), 140),
    '/bandeja/' || v_tarjeta::text,
    v_tarjeta);
  return null;
end $$;

create trigger messages_notificar
  after insert on public.messages
  for each row execute function private.notificar_mensaje();

-- ---------------------------------------------------------------------------
-- 5. Crear, completar y reprogramar
-- ---------------------------------------------------------------------------
create or replace function public.guardar_tarea(
  p_org        uuid,
  p_titulo     text,
  p_vence_en   timestamptz,
  p_asignado   uuid default null,
  p_detalle    text default null,
  p_recordar_en timestamptz default null,
  p_tarjeta    uuid default null,
  p_tarea      uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_asignado uuid; v_antes uuid;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'gestionar') then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'La tarea necesita un título.' using errcode = '22023';
  end if;

  -- Por defecto, para quien la crea. Una tarea sin responsable no la hace nadie.
  v_asignado := coalesce(p_asignado, v_user);
  if not exists (
    select 1 from public.organization_members m
     where m.organization_id = p_org and m.user_id = v_asignado
  ) then
    raise exception 'Esa persona no está en el equipo.' using errcode = 'P0002';
  end if;

  if p_tarea is null then
    insert into public.tareas
      (organization_id, tarjeta_id, titulo, detalle, vence_en, recordar_en, asignado_a, creada_por)
    values
      (p_org, p_tarjeta, btrim(p_titulo), nullif(btrim(coalesce(p_detalle,'')), ''),
       p_vence_en, p_recordar_en, v_asignado, v_user)
    returning id into v_id;

    if p_tarjeta is not null then
      perform private.registrar_actividad_tarjeta(
        p_org, p_tarjeta, 'tarea.creada', 'usuario', v_user,
        jsonb_build_object('titulo', btrim(p_titulo), 'vence_en', p_vence_en));
    else
      perform private.registrar_actividad(
        p_org, 'tarea.creada', 'usuario', null, v_user,
        jsonb_build_object('titulo', btrim(p_titulo), 'vence_en', p_vence_en));
    end if;

    -- Si se la asigno a otro, se entera. Si es para mí, `notificar` lo descarta.
    perform private.notificar(
      p_org, v_asignado, 'tarea.asignada', 'Te han asignado una tarea',
      btrim(p_titulo),
      case when p_tarjeta is not null then '/bandeja/' || p_tarjeta::text else '/agenda' end,
      p_tarjeta, v_id);
  else
    select asignado_a into v_antes from public.tareas
     where id = p_tarea and organization_id = p_org;
    if v_antes is null then raise exception 'Esa tarea no existe.' using errcode = 'P0002'; end if;

    update public.tareas
       set titulo = btrim(p_titulo),
           detalle = nullif(btrim(coalesce(p_detalle,'')), ''),
           vence_en = p_vence_en,
           recordar_en = p_recordar_en,
           -- Cambiar la fecha vuelve a armar el aviso: si no, reprogramar una
           -- tarea ya avisada la dejaría sin recordatorio para siempre.
           recordado_en = case when p_recordar_en is distinct from recordar_en
                               then null else recordado_en end,
           vencido_avisado_en = case when p_vence_en is distinct from vence_en
                                     then null else vencido_avisado_en end,
           asignado_a = v_asignado
     where id = p_tarea
    returning id into v_id;

    if v_antes is distinct from v_asignado then
      perform private.notificar(
        p_org, v_asignado, 'tarea.asignada', 'Te han asignado una tarea',
        btrim(p_titulo),
        case when p_tarjeta is not null then '/bandeja/' || p_tarjeta::text else '/agenda' end,
        p_tarjeta, v_id);
    end if;
  end if;

  return v_id;
end $$;

create or replace function public.completar_tarea(p_tarea uuid, p_completada boolean default true)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_titulo text; v_tarjeta uuid; v_user uuid := (select auth.uid());
begin
  select organization_id, titulo, tarjeta_id into v_org, v_titulo, v_tarjeta
    from public.tareas where id = p_tarea;
  if v_org is null then raise exception 'Esa tarea no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'gestionar') then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  update public.tareas
     set completada_en  = case when p_completada then now() end,
         completada_por = case when p_completada then v_user end
   where id = p_tarea;

  -- Al completarla se retiran sus avisos sin leer: seguir recordando algo hecho
  -- es la forma más rápida de que se deje de mirar el centro.
  update public.notificaciones
     set leida_en = now()
   where tarea_id = p_tarea and leida_en is null;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, case when p_completada then 'tarea.completada' else 'tarea.reabierta' end,
      'usuario', v_user, jsonb_build_object('titulo', v_titulo));
  else
    perform private.registrar_actividad(
      v_org, case when p_completada then 'tarea.completada' else 'tarea.reabierta' end,
      'usuario', null, v_user, jsonb_build_object('titulo', v_titulo));
  end if;
end $$;

create or replace function public.borrar_tarea(p_tarea uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_titulo text; v_tarjeta uuid; v_user uuid := (select auth.uid());
begin
  select organization_id, titulo, tarjeta_id into v_org, v_titulo, v_tarjeta
    from public.tareas where id = p_tarea;
  if v_org is null then raise exception 'Esa tarea no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'gestionar') then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  delete from public.tareas where id = p_tarea;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'tarea.borrada', 'usuario', v_user,
      jsonb_build_object('titulo', v_titulo));
  else
    perform private.registrar_actividad(
      v_org, 'tarea.borrada', 'usuario', null, v_user, jsonb_build_object('titulo', v_titulo));
  end if;
end $$;

create or replace function public.marcar_notificaciones(p_ids uuid[] default null)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_n integer;
begin
  if v_user is null then return 0; end if;
  update public.notificaciones
     set leida_en = now()
   where user_id = v_user and leida_en is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.guardar_tarea(uuid,text,timestamptz,uuid,text,timestamptz,uuid,uuid) from public, anon;
revoke execute on function public.completar_tarea(uuid, boolean) from public, anon;
revoke execute on function public.borrar_tarea(uuid)             from public, anon;
revoke execute on function public.marcar_notificaciones(uuid[])  from public, anon;

-- ---------------------------------------------------------------------------
-- 6. El reloj de los recordatorios
-- ---------------------------------------------------------------------------
-- `recordado_en` se marca en la MISMA sentencia que crea la notificación. Si se
-- marcara después, un fallo entre medias repetiría el aviso cada minuto, que es
-- peor que no avisar: a la tercera vez se ignora el centro entero.
create or replace function private.avisar_tareas()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_n integer := 0; t record;
begin
  -- Recordatorios.
  for t in
    update public.tareas
       set recordado_en = now()
     where completada_en is null
       and recordar_en is not null
       and recordado_en is null
       and recordar_en <= now()
    returning *
  loop
    insert into public.notificaciones
      (organization_id, user_id, tipo, titulo, cuerpo, enlace, tarjeta_id, tarea_id)
    values
      (t.organization_id, t.asignado_a, 'tarea.recordatorio', 'Recordatorio: ' || t.titulo,
       to_char(t.vence_en, 'DD/MM HH24:MI'),
       case when t.tarjeta_id is not null then '/bandeja/' || t.tarjeta_id::text else '/agenda' end,
       t.tarjeta_id, t.id)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  -- Vencidas sin completar.
  for t in
    update public.tareas
       set vencido_avisado_en = now()
     where completada_en is null
       and vencido_avisado_en is null
       and vence_en <= now()
    returning *
  loop
    insert into public.notificaciones
      (organization_id, user_id, tipo, titulo, cuerpo, enlace, tarjeta_id, tarea_id)
    values
      (t.organization_id, t.asignado_a, 'tarea.vencida', 'Venció: ' || t.titulo,
       to_char(t.vence_en, 'DD/MM HH24:MI'),
       case when t.tarjeta_id is not null then '/bandeja/' || t.tarjeta_id::text else '/agenda' end,
       t.tarjeta_id, t.id)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

revoke execute on function private.avisar_tareas() from public, anon, authenticated;

select cron.schedule('avisar-tareas', '* * * * *', $cron$ select private.avisar_tareas(); $cron$);

-- ---------------------------------------------------------------------------
-- 7. Tiempo real del contador
-- ---------------------------------------------------------------------------
-- Por el mismo canal que ya usa la bandeja. El payload no lleva el contenido:
-- solo avisa de que hay algo, y el cliente relee bajo RLS.
create or replace function private.avisar_notificacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('tabla', 'notificaciones', 'user_id', new.user_id, 'momento', now()),
    'cambio', 'org:' || new.organization_id::text, false);
  return null;
exception when others then
  return null;
end $$;

create trigger notificaciones_avisar
  after insert on public.notificaciones
  for each row execute function private.avisar_notificacion();
