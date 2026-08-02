-- 0040_equipo.sql — usuarios, roles y permisos.
--
-- EL HUECO QUE CIERRA
--
-- Hoy los usuarios solo se crean por la API de administración de Supabase, es
-- decir, a mano y por alguien con la clave de servicio. Kavea no reemplaza a
-- Kommo si solo puede entrar una persona.
--
-- Y hay un defecto de permisos de paso: `es_owner()` comprueba `rol = 'owner'`
-- literalmente, así que un `admin` NO puede definir un campo ni un embudo. Se
-- usó `es_owner` en 0028 y 0031 pensando «quien administra», y `admin` es
-- exactamente eso. Se corrige aquí.

-- ---------------------------------------------------------------------------
-- 1. La matriz de permisos, en un solo sitio
-- ---------------------------------------------------------------------------
-- Un `rol = 'owner'` esparcido por veinte funciones es una regla escrita veinte
-- veces, y la que se olvida de actualizar es la que abre el agujero. Aquí la
-- pregunta siempre es la misma: ¿puede esta persona hacer ESTO?
--
-- La interfaz llama a la misma función para decidir qué botones enseña, así que
-- no puede haber un botón que exista y falle al pulsarlo.
create or replace function public.puede(org uuid, accion text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_members m
     where m.organization_id = org
       and m.user_id = (select auth.uid())
       and case accion
         -- Atender: leer, responder, mover de etapa, rellenar la ficha, cerrar.
         -- Es el trabajo diario y lo hacen los tres roles.
         when 'conversar'  then m.rol in ('owner', 'admin', 'agente')
         when 'gestionar'  then m.rol in ('owner', 'admin', 'agente')
         -- Configurar cambia lo que ve TODA la organización: campos, embudos,
         -- etapas, plantillas. No es una acción de quien atiende un hilo.
         when 'configurar' then m.rol in ('owner', 'admin')
         -- Borrar documentos y archivos: se pierde histórico comercial.
         when 'borrar'     then m.rol in ('owner', 'admin')
         when 'equipo'     then m.rol in ('owner', 'admin')
         -- Conectar canales toca credenciales y el kill-switch. Solo el dueño.
         when 'conectar'   then m.rol = 'owner'
         else false
       end
  );
$$;

revoke execute on function public.puede(uuid, text) from public, anon;
grant  execute on function public.puede(uuid, text) to authenticated;

comment on function public.puede(uuid, text) is
  'La matriz rol → acción. Único sitio donde se decide quién puede qué. La '
  'interfaz la usa para saber qué enseñar y los RPC para decidir si dejan: así '
  'no existe un botón que se pueda pulsar y falle.';

-- Las funciones que decían `es_owner` querían decir «quien administra».
-- Se reapuntan a `puede(..., 'configurar')`, que incluye a `admin`.
create or replace function public.definir_campo(
  p_org uuid, p_clave text, p_etiqueta text, p_tipo text,
  p_ambito text default 'tarjeta', p_opciones jsonb default null,
  p_ayuda text default null, p_obligatorio boolean default false
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_orden integer;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'configurar') then
    raise exception 'Solo quien administra la organización define campos.' using errcode = '42501';
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from public.campos where organization_id = p_org and ambito = p_ambito;

  insert into public.campos
    (organization_id, clave, etiqueta, tipo, ambito, opciones, ayuda, obligatorio, orden, creado_por)
  values
    (p_org, lower(btrim(p_clave)), btrim(p_etiqueta), p_tipo, p_ambito,
     p_opciones, nullif(btrim(coalesce(p_ayuda, '')), ''), p_obligatorio, v_orden, v_user)
  returning id into v_id;

  perform private.registrar_actividad(
    p_org, 'campo.definido', 'usuario', null, v_user,
    jsonb_build_object('clave', lower(btrim(p_clave)), 'etiqueta', btrim(p_etiqueta),
                       'tipo', p_tipo, 'ambito', p_ambito));
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un campo con la clave "%" en ese ámbito.', lower(btrim(p_clave))
    using errcode = '23505';
end $$;

create or replace function public.archivar_campo(p_campo uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_clave text; v_user uuid := (select auth.uid());
begin
  select organization_id, clave into v_org, v_clave from public.campos where id = p_campo;
  if v_org is null then raise exception 'Ese campo no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'Solo quien administra la organización archiva campos.' using errcode = '42501';
  end if;

  update public.campos set archivado_en = now() where id = p_campo;
  perform private.registrar_actividad(
    v_org, 'campo.archivado', 'usuario', null, v_user, jsonb_build_object('clave', v_clave));
end $$;

create or replace function public.definir_embudo(p_org uuid, p_nombre text, p_descripcion text default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_orden integer;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'configurar') then
    raise exception 'Solo quien administra la organización define embudos.' using errcode = '42501';
  end if;

  select coalesce(max(orden), -1) + 1 into v_orden from public.embudos where organization_id = p_org;

  insert into public.embudos (organization_id, nombre, descripcion, orden, creado_por)
  values (p_org, btrim(p_nombre), nullif(btrim(coalesce(p_descripcion,'')), ''), v_orden, v_user)
  returning id into v_id;

  perform private.registrar_actividad(
    p_org, 'embudo.definido', 'usuario', null, v_user, jsonb_build_object('nombre', btrim(p_nombre)));
  return v_id;
end $$;

create or replace function public.definir_etapa(
  p_embudo uuid, p_nombre text, p_tipo text default 'abierta', p_color text default 'piedra'
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_user uuid := (select auth.uid()); v_id uuid; v_orden integer;
begin
  select organization_id into v_org from public.embudos where id = p_embudo;
  if v_org is null then raise exception 'Ese embudo no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'Solo quien administra la organización define etapas.' using errcode = '42501';
  end if;

  if p_tipo = 'abierta' then
    select coalesce(min(orden), 100) into v_orden
      from public.etapas where embudo_id = p_embudo and tipo <> 'abierta' and archivado_en is null;
    update public.etapas set orden = orden + 1 where embudo_id = p_embudo and tipo <> 'abierta';
  else
    select coalesce(max(orden), -1) + 1 into v_orden from public.etapas where embudo_id = p_embudo;
  end if;

  insert into public.etapas (organization_id, embudo_id, nombre, orden, color, tipo)
  values (v_org, p_embudo, btrim(p_nombre), v_orden, p_color, p_tipo)
  returning id into v_id;

  perform private.registrar_actividad(
    v_org, 'etapa.definida', 'usuario', null, v_user,
    jsonb_build_object('nombre', btrim(p_nombre), 'tipo', p_tipo));
  return v_id;
end $$;

create or replace function public.archivar_etapa(p_etapa uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_embudo uuid; v_nombre text; v_user uuid := (select auth.uid()); v_quedan integer;
begin
  select organization_id, embudo_id, nombre into v_org, v_embudo, v_nombre
    from public.etapas where id = p_etapa;
  if v_org is null then raise exception 'Esa etapa no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'Solo quien administra la organización archiva etapas.' using errcode = '42501';
  end if;

  select count(*) into v_quedan from public.etapas
   where embudo_id = v_embudo and tipo = 'abierta' and archivado_en is null and id <> p_etapa;
  if v_quedan = 0 then
    raise exception 'Es la única etapa abierta del embudo. Crea otra antes de archivar esta.'
      using errcode = '22023';
  end if;

  update public.etapas set archivado_en = now() where id = p_etapa;
  update public.tarjetas t
     set etapa_id = (select id from public.etapas
                      where embudo_id = v_embudo and tipo = 'abierta' and archivado_en is null
                      order by orden limit 1),
         etapa_desde = now()
   where t.etapa_id = p_etapa;

  perform private.registrar_actividad(
    v_org, 'etapa.archivada', 'usuario', null, v_user, jsonb_build_object('nombre', v_nombre));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Invitaciones
-- ---------------------------------------------------------------------------
create table public.invitaciones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  correo  text not null check (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  rol     text not null check (rol in ('owner', 'admin', 'agente')),

  -- SOLO EL HASH. Un volcado de la base no puede dar acceso a ninguna
  -- organización: el token en claro se devuelve una vez, al crear, y no se
  -- vuelve a poder leer ni desde dentro.
  token_sha  text not null unique,

  invitado_por  uuid references auth.users(id) on delete set null,
  expira_en     timestamptz not null,
  aceptada_en   timestamptz,
  aceptada_por  uuid references auth.users(id) on delete set null,
  revocada_en   timestamptz,
  created_at    timestamptz not null default now(),

  -- Una invitación viva por correo y organización. Sin esto, pulsar «invitar»
  -- tres veces manda tres correos con tres enlaces válidos y solo uno se usa:
  -- los otros dos quedan por ahí, válidos, durante días.
  constraint invitaciones_org_id_uniq unique (organization_id, id)
);

create unique index invitaciones_viva_unica
  on public.invitaciones (organization_id, lower(correo))
  where aceptada_en is null and revocada_en is null;

create index invitaciones_org_idx on public.invitaciones (organization_id, created_at desc);

alter table public.invitaciones enable row level security;
alter table public.invitaciones force  row level security;

-- Se ve quién está invitado, pero NUNCA el hash: la columna se excluye en las
-- consultas de la aplicación y aquí se deja constancia de por qué.
create policy invitaciones_select on public.invitaciones
  for select to authenticated
  using (public.puede(organization_id, 'equipo'));

-- ---------------------------------------------------------------------------
-- 3. Invitar, revocar, cambiar de rol, quitar
-- ---------------------------------------------------------------------------
create or replace function public.invitar_miembro(p_org uuid, p_correo text, p_rol text)
returns table (invitacion_id uuid, token text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid()); v_token text; v_correo text; v_id uuid;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'equipo') then
    raise exception 'No puedes invitar a nadie en esta organización.' using errcode = '42501';
  end if;
  -- Solo el dueño nombra a otro dueño. Si un admin pudiera, se ascendería por
  -- interpuesta persona: invita a su segundo correo como owner y entra.
  if p_rol = 'owner' and not public.es_owner(p_org) then
    raise exception 'Solo el propietario puede nombrar a otro propietario.' using errcode = '42501';
  end if;

  v_correo := lower(btrim(p_correo));

  if exists (
    select 1 from public.organization_members m
      join auth.users u on u.id = m.user_id
     where m.organization_id = p_org and lower(u.email) = v_correo
  ) then
    raise exception 'Esa persona ya está en el equipo.' using errcode = '23505';
  end if;

  -- Dos uuid son 256 bits de aleatoriedad de un generador criptográfico. No
  -- hace falta pgcrypto para esto y así no se añade una dependencia por un
  -- token.
  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  insert into public.invitaciones
    (organization_id, correo, rol, token_sha, invitado_por, expira_en)
  values
    (p_org, v_correo, p_rol, encode(sha256(v_token::bytea), 'hex'), v_user,
     now() + interval '7 days')
  returning id into v_id;

  perform private.registrar_actividad(
    p_org, 'equipo.invitado', 'usuario', null, v_user,
    jsonb_build_object('correo', v_correo, 'rol', p_rol));

  -- El token en claro sale UNA vez, para poder ponerlo en el correo. No se
  -- guarda en ningún sitio del que se pueda volver a leer.
  return query select v_id, v_token;
exception when unique_violation then
  raise exception 'Ya hay una invitación viva para ese correo. Revócala antes de mandar otra.'
    using errcode = '23505';
end $$;

create or replace function public.revocar_invitacion(p_invitacion uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_correo text; v_user uuid := (select auth.uid());
begin
  select organization_id, correo into v_org, v_correo
    from public.invitaciones where id = p_invitacion and aceptada_en is null;
  if v_org is null then raise exception 'Esa invitación no existe o ya se usó.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'equipo') then
    raise exception 'No puedes revocar invitaciones aquí.' using errcode = '42501';
  end if;

  update public.invitaciones set revocada_en = now() where id = p_invitacion;
  perform private.registrar_actividad(
    v_org, 'equipo.invitacion_revocada', 'usuario', null, v_user,
    jsonb_build_object('correo', v_correo));
end $$;

create or replace function public.cambiar_rol(p_org uuid, p_usuario uuid, p_rol text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_antes text; v_nombre text;
begin
  if not public.puede(p_org, 'equipo') then
    raise exception 'No puedes cambiar roles aquí.' using errcode = '42501';
  end if;
  if p_rol = 'owner' and not public.es_owner(p_org) then
    raise exception 'Solo el propietario puede nombrar a otro propietario.' using errcode = '42501';
  end if;

  select rol into v_antes from public.organization_members
   where organization_id = p_org and user_id = p_usuario;
  if v_antes is null then raise exception 'Esa persona no está en el equipo.' using errcode = 'P0002'; end if;

  -- Degradar al último propietario deja la organización sin quien pueda
  -- conectar canales ni nombrar a nadie. Es irreversible desde la interfaz.
  if v_antes = 'owner' and p_rol <> 'owner' and (
    select count(*) from public.organization_members
     where organization_id = p_org and rol = 'owner') <= 1
  then
    raise exception 'Es el único propietario. Nombra a otro antes de cambiarle el rol.'
      using errcode = '22023';
  end if;

  update public.organization_members set rol = p_rol
   where organization_id = p_org and user_id = p_usuario;

  select coalesce(u.raw_user_meta_data->>'nombre', u.email) into v_nombre
    from auth.users u where u.id = p_usuario;

  perform private.registrar_actividad(
    p_org, 'equipo.rol', 'usuario', null, v_user,
    jsonb_build_object('persona', v_nombre, 'de', v_antes, 'a', p_rol));
end $$;

create or replace function public.quitar_miembro(p_org uuid, p_usuario uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_rol text; v_nombre text;
begin
  if not public.puede(p_org, 'equipo') then
    raise exception 'No puedes quitar a nadie aquí.' using errcode = '42501';
  end if;

  select rol into v_rol from public.organization_members
   where organization_id = p_org and user_id = p_usuario;
  if v_rol is null then raise exception 'Esa persona no está en el equipo.' using errcode = 'P0002'; end if;

  if v_rol = 'owner' and (
    select count(*) from public.organization_members
     where organization_id = p_org and rol = 'owner') <= 1
  then
    raise exception 'Es el único propietario. La organización se quedaría sin nadie que pueda administrarla.'
      using errcode = '22023';
  end if;

  select coalesce(u.raw_user_meta_data->>'nombre', u.email) into v_nombre
    from auth.users u where u.id = p_usuario;

  delete from public.organization_members
   where organization_id = p_org and user_id = p_usuario;

  -- Las conversaciones que tenía asignadas quedan sin responsable, no
  -- asignadas a un fantasma. La clave foránea ya lo hace con `set null`; se
  -- registra para que se vea en el histórico por qué se quedaron libres.
  perform private.registrar_actividad(
    p_org, 'equipo.quitado', 'usuario', null, v_user,
    jsonb_build_object('persona', v_nombre, 'rol', v_rol));
end $$;

revoke execute on function public.invitar_miembro(uuid, text, text)  from public, anon;
revoke execute on function public.revocar_invitacion(uuid)           from public, anon;
revoke execute on function public.cambiar_rol(uuid, uuid, text)      from public, anon;
revoke execute on function public.quitar_miembro(uuid, uuid)         from public, anon;

-- ---------------------------------------------------------------------------
-- 4. Aceptar una invitación
-- ---------------------------------------------------------------------------
-- La consume el servidor de la aplicación, que es quien tiene la clave de
-- servicio y quien crea la cuenta en Supabase Auth. Devuelve los datos de la
-- invitación si el token vale, y nada si no.
create or replace function private.invitacion_por_token(p_token text)
returns table (id uuid, organization_id uuid, correo text, rol text, organizacion text, slug text)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.organization_id, i.correo, i.rol, o.nombre, o.slug
    from public.invitaciones i
    join public.organizations o on o.id = i.organization_id
   where i.token_sha = encode(sha256(p_token::bytea), 'hex')
     and i.aceptada_en is null
     and i.revocada_en is null
     and i.expira_en > now()
$$;

create or replace function private.aceptar_invitacion(p_token text, p_usuario uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_inv record;
begin
  select * into v_inv from private.invitacion_por_token(p_token);
  if v_inv.id is null then
    raise exception 'Esa invitación no vale: puede haber caducado, haberse usado o haberse revocado.'
      using errcode = 'P0002';
  end if;

  insert into public.organization_members (organization_id, user_id, rol)
  values (v_inv.organization_id, p_usuario, v_inv.rol)
  on conflict do nothing;

  update public.invitaciones
     set aceptada_en = now(), aceptada_por = p_usuario
   where id = v_inv.id;

  perform private.registrar_actividad(
    v_inv.organization_id, 'equipo.entro', 'usuario', null, p_usuario,
    jsonb_build_object('correo', v_inv.correo, 'rol', v_inv.rol));

  return v_inv.organization_id;
end $$;

revoke execute on function private.invitacion_por_token(text) from public, anon, authenticated;
revoke execute on function private.aceptar_invitacion(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. El equipo, con su rol y su estado
-- ---------------------------------------------------------------------------
create or replace function public.equipo_de(p_org uuid)
returns table (user_id uuid, correo text, nombre text, rol text, desde timestamptz, soy_yo boolean)
language sql stable security definer set search_path = ''
as $$
  select m.user_id,
         u.email,
         coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
         m.rol,
         m.created_at,
         m.user_id = (select auth.uid())
    from public.organization_members m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_org
     and public.es_miembro(p_org)
   order by
     case m.rol when 'owner' then 0 when 'admin' then 1 else 2 end,
     coalesce(u.raw_user_meta_data->>'nombre', u.email)
$$;

revoke execute on function public.equipo_de(uuid) from public, anon;
grant  execute on function public.equipo_de(uuid) to authenticated;
