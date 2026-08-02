-- 0056_ajustes_de_organizacion.sql — el nombre y el huso, editables.
--
-- POR QUÉ AHORA
--
-- `zona_horaria` existe desde 0046 y hasta hoy la usaba una sola pantalla. Con
-- el cambio de los relojes la usa TODA la aplicación: cada hora de cada mensaje,
-- cada fecha de cada tarea. Y no había ninguna forma de cambiarla que no fuera
-- un UPDATE a mano en la base.
--
-- Un campo del que depende toda la interfaz y que solo se puede tocar por SQL no
-- es una configuración: es una constante escondida. El día que un cliente de
-- México entre, alguien tendría que abrir el editor de Supabase.
--
-- POR RPC Y NO POR PATCH. Existe `organizations_update`, así que técnicamente la
-- interfaz podría escribir directo. No se hace: cambiar el huso reinterpreta
-- TODA la historia de la organización —los mensajes de ayer pasan a leerse a
-- otra hora— y eso tiene que dejar actividad con el antes y el después. Un
-- cambio silencioso de huso es indistinguible de un fallo de la aplicación.
create or replace function public.guardar_organizacion(
  p_org    uuid,
  p_nombre text,
  p_huso   text
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_nombre_antes text; v_huso_antes text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_huso   text := btrim(coalesce(p_huso, ''));
  v_cambios jsonb := '{}'::jsonb;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'configurar') then
    raise exception 'Hace falta permiso de configuración.' using errcode = '42501';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'El nombre tiene que tener entre 2 y 80 caracteres.' using errcode = '22023';
  end if;

  -- El huso lo valida el trigger `organizations_zona` contra pg_timezone_names,
  -- que es la lista de verdad. Aquí solo se comprueba que no venga vacío: dejar
  -- que el trigger hable evita tener dos listas de husos que se desincronizan.
  if v_huso = '' then
    raise exception 'Hace falta una zona horaria.' using errcode = '22023';
  end if;

  select nombre, zona_horaria into v_nombre_antes, v_huso_antes
    from public.organizations where id = p_org;

  update public.organizations
     set nombre = v_nombre, zona_horaria = v_huso
   where id = p_org;

  if v_nombre_antes is distinct from v_nombre then
    v_cambios := v_cambios || jsonb_build_object('nombre', jsonb_build_array(v_nombre_antes, v_nombre));
  end if;
  if v_huso_antes is distinct from v_huso then
    v_cambios := v_cambios || jsonb_build_object('huso', jsonb_build_array(v_huso_antes, v_huso));
  end if;

  -- Nada que contar si no cambió nada. Guardar sin tocar no es un movimiento.
  if v_cambios <> '{}'::jsonb then
    perform private.registrar_actividad(
      p_org, 'organizacion.editada', 'usuario', null, v_user, v_cambios);
  end if;
end $$;

revoke execute on function public.guardar_organizacion(uuid, text, text) from public, anon;

comment on function public.guardar_organizacion(uuid, text, text) is
  'Va por RPC y no por PATCH porque cambiar el huso reinterpreta toda la '
  'historia de la organizacion: los mensajes de ayer pasan a leerse a otra '
  'hora. Un cambio silencioso de huso es indistinguible de un fallo.';

-- ---------------------------------------------------------------------------
-- Los husos que se ofrecen
-- ---------------------------------------------------------------------------
-- Se leen de `pg_timezone_names`, que es la misma lista contra la que valida el
-- trigger. Una lista escrita a mano en el cliente sería una segunda verdad, y la
-- que se quede corta es la que rechaza al cliente que vive en ella.
--
-- Se filtra a Continente/Ciudad para no ofrecer los alias históricos ni los
-- `posix/` y `right/`, que son la misma hora con otro nombre y triplican un
-- desplegable ya largo.
create or replace function public.husos_disponibles()
returns table (nombre text, desfase text)
language sql stable security definer set search_path = ''
as $$
  select name::text,
         to_char(utc_offset, 'HH24:MI')::text
    from pg_catalog.pg_timezone_names
   where name like '%/%'
     and name not like 'posix/%'
     and name not like 'right/%'
     and name not like 'Etc/%'
   order by utc_offset, name
$$;

revoke execute on function public.husos_disponibles() from public, anon;
grant  execute on function public.husos_disponibles() to authenticated;
