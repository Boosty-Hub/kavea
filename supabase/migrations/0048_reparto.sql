-- 0048_reparto.sql — reparto por turnos de las conversaciones que entran.
-- Fuente: docs/fases/03f-fase-reparto.md.
--
-- LA DECISIÓN QUE EVITA EL FALLO CLÁSICO
--
-- No hay puntero. Se elige a QUIEN LLEVA MÁS TIEMPO SIN RECIBIR una.
--
-- Un round robin de manual guarda un cursor —«el último fue el tercero, ahora
-- toca el cuarto»— y ese cursor se rompe en cuanto la lista cambia: alguien se
-- va de vacaciones y se le saca del turno, entra una persona nueva, se despide
-- otra. El cursor apunta a una posición que ya no significa lo mismo y el
-- reparto se atasca en una persona o salta a otra sin motivo.
--
-- «Quien lleva más sin recibir» es equivalente a un turno cuando la lista es
-- estable, y se arregla solo cuando no lo es: quien entra hoy tiene null y por
-- tanto pasa el primero; a quien se saca simplemente deja de mirarse.

alter table public.organizations
  add column reparto_automatico boolean not null default false;

comment on column public.organizations.reparto_automatico is
  'Nace APAGADO. Encender un reparto sin que el cliente lo haya decidido '
  'reparte trabajo real entre personas que no lo esperaban.';

alter table public.organization_members
  -- Por defecto CIERTO: quien entra al equipo entra al turno. Al revés —entrar
  -- fuera y tener que añadirse— hace que el reparto parezca roto el día que se
  -- contrata a alguien.
  add column en_rotacion boolean not null default true,
  add column ultima_asignacion timestamptz;

-- ---------------------------------------------------------------------------
-- A quién le toca
-- ---------------------------------------------------------------------------
create or replace function private.a_quien_le_toca(p_org uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.user_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
   where m.organization_id = p_org
     and o.reparto_automatico
     and m.en_rotacion
   -- `nulls first`: quien nunca ha recibido pasa el primero. Sin eso, una
   -- persona nueva se quedaría la última para siempre, porque `null` ordena al
   -- final por defecto en orden ascendente.
   order by m.ultima_asignacion asc nulls first, m.user_id
   limit 1
$$;

revoke execute on function private.a_quien_le_toca(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El reloj de cada persona lo mueve CUALQUIER asignación
-- ---------------------------------------------------------------------------
-- También las de a mano. Si alguien le pasa cinco conversaciones a Ana, el
-- reparto automático la salta hasta que le toque de nuevo. Contar solo las
-- automáticas repartiría «por turnos» sobre una carga ya desequilibrada, que es
-- justo lo que se quería evitar.
create or replace function private.anotar_asignacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.asignado_a is not null and new.asignado_a is distinct from old.asignado_a then
    update public.organization_members
       set ultima_asignacion = now()
     where organization_id = new.organization_id and user_id = new.asignado_a;
  end if;
  return null;
end $$;

create trigger tarjetas_anotar_asignacion
  after insert or update of asignado_a on public.tarjetas
  for each row execute function private.anotar_asignacion();

-- ---------------------------------------------------------------------------
-- Se reparte al crear la tarjeta
-- ---------------------------------------------------------------------------
-- Que es cuando entra la conversación, y `tarjeta_de_contacto` es el único
-- sitio donde nacen.
create or replace function private.tarjeta_de_contacto(p_org uuid, p_contact uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_t uuid; v_embudo uuid; v_etapa uuid; v_quien uuid;
begin
  select id into v_t from public.tarjetas
   where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  if v_t is not null then return v_t; end if;

  select e.id, p.id into v_embudo, v_etapa
    from public.embudos e
    left join lateral (
      select id from public.etapas
       where embudo_id = e.id and tipo = 'abierta' and archivado_en is null
       order by orden limit 1
    ) p on true
   where e.organization_id = p_org and e.es_predeterminado and e.archivado_en is null;

  -- Si el reparto está apagado o no hay nadie en el turno, esto es null y la
  -- tarjeta nace del SISTEMA. Nunca se asigna a alguien que no está en el turno
  -- solo por rellenar el hueco.
  v_quien := private.a_quien_le_toca(p_org);

  insert into public.tarjetas
    (organization_id, contact_id, embudo_id, etapa_id, etapa_desde, asignado_a)
  values
    (p_org, p_contact, v_embudo, v_etapa,
     case when v_etapa is not null then now() end, v_quien)
  on conflict (organization_id, contact_id) where cerrada_en is null do nothing
  returning id into v_t;

  if v_t is null then
    select id into v_t from public.tarjetas
     where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  end if;

  return v_t;
end $$;

-- ---------------------------------------------------------------------------
-- Tomarla
-- ---------------------------------------------------------------------------
-- De un clic. Buscarse a uno mismo en un desplegable de doce nombres para
-- reclamar una conversación es fricción que acaba en que nadie reclama nada.
create or replace function public.reclamar_tarjeta(p_tarjeta uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_actual uuid; v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select organization_id, asignado_a into v_org, v_actual
    from public.tarjetas where id = p_tarjeta;
  if v_org is null then raise exception 'Esa conversación no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'conversar') then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  -- Quitársela a alguien que ya la tiene no es «reclamar»: es reasignar, y eso
  -- se hace con el selector, a la vista y con nombre. Este botón solo recoge lo
  -- que está del sistema.
  if v_actual is not null then
    if v_actual = v_user then return; end if;
    raise exception 'Ya la tiene otra persona. Si hace falta cambiarla, usa el selector de responsable.'
      using errcode = '42501';
  end if;

  -- El trigger de 0027 registra la actividad y el de arriba mueve el reloj.
  update public.tarjetas set asignado_a = v_user where id = p_tarjeta;
end $$;

revoke execute on function public.reclamar_tarjeta(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Configurar el reparto
-- ---------------------------------------------------------------------------
create or replace function public.configurar_reparto(p_org uuid, p_activo boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_antes boolean;
begin
  if not public.puede(p_org, 'equipo') then
    raise exception 'Solo quien administra la organización cambia el reparto.' using errcode = '42501';
  end if;

  select reparto_automatico into v_antes from public.organizations where id = p_org;
  if v_antes = p_activo then return; end if;

  update public.organizations set reparto_automatico = p_activo where id = p_org;

  perform private.registrar_actividad(
    p_org, case when p_activo then 'reparto.encendido' else 'reparto.apagado' end,
    'usuario', null, v_user, '{}'::jsonb);
end $$;

create or replace function public.rotacion_de(p_org uuid, p_usuario uuid, p_dentro boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_nombre text;
begin
  if not public.puede(p_org, 'equipo') then
    raise exception 'Solo quien administra la organización cambia el turno.' using errcode = '42501';
  end if;

  update public.organization_members
     set en_rotacion = p_dentro
   where organization_id = p_org and user_id = p_usuario;
  if not found then
    raise exception 'Esa persona no está en el equipo.' using errcode = 'P0002';
  end if;

  select coalesce(u.raw_user_meta_data->>'nombre', u.email) into v_nombre
    from auth.users u where u.id = p_usuario;

  perform private.registrar_actividad(
    p_org, case when p_dentro then 'reparto.dentro' else 'reparto.fuera' end,
    'usuario', null, v_user, jsonb_build_object('persona', v_nombre));
end $$;

revoke execute on function public.configurar_reparto(uuid, boolean)    from public, anon;
revoke execute on function public.rotacion_de(uuid, uuid, boolean)     from public, anon;

-- El equipo, ahora con su estado en el turno.
--
-- Se SUELTA y se recrea: `create or replace` no puede cambiar el tipo de
-- retorno de una función con parámetros OUT —Postgres responde «cannot change
-- return type of existing function»— y aquí se añaden tres columnas. Al ir
-- dentro de la misma transacción, no hay ningún instante en que falte.
drop function public.equipo_de(uuid);

create or replace function public.equipo_de(p_org uuid)
returns table (
  user_id uuid, correo text, nombre text, rol text, desde timestamptz,
  soy_yo boolean, en_rotacion boolean, ultima_asignacion timestamptz, abiertas integer
)
language sql stable security definer set search_path = ''
as $$
  select m.user_id,
         u.email,
         coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
         m.rol,
         m.created_at,
         m.user_id = (select auth.uid()),
         m.en_rotacion,
         m.ultima_asignacion,
         (select count(*)::int from public.tarjetas t
           where t.organization_id = p_org and t.asignado_a = m.user_id
             and t.cerrada_en is null)
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
