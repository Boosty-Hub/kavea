-- 0089_la_ruta_de_instagram_nunca_pudo_insertarse.sql
--
-- `meta_asset_routes.tipo` admite exactamente tres valores, y lo dice una
-- restricción CHECK desde la 0003:
--
--     tipo = ANY (ARRAY['page', 'ig_business_account', 'whatsapp_phone_number'])
--
-- Las dos funciones que dan de alta una conexión escriben `'instagram'`. No es
-- uno de los tres. Cualquier alta de una Página CON Instagram vinculado muere
-- con un 23514 y se deshace entera.
--
-- CUÁNTO LLEVABA ROTO Y POR QUÉ NADIE LO VIO. Desde la 0058, el 6-ago. La ruta
-- del staff (`registrar_conexion`) nunca se ejecutó contra una Página que
-- tuviera Instagram: la de Boosty ya estaba conectada de antes —su fila de ruta
-- dice `ig_business_account`, así que la escribió otro camino, el
-- aprovisionamiento por token de system user— y el alta del 6-ago no llegó a
-- pisar esta rama. El fallo salió a la luz el 24-ago, en el primer alta real por
-- OAuth, porque `registrar_conexion_oauth` heredó la línea al copiarse de su
-- hermana.
--
-- `on conflict (asset_id) do ...` no salvaba nada: esa cláusula resuelve
-- conflictos de unicidad, no violaciones de CHECK. Un CHECK siempre aborta.
--
-- Se arreglan LAS DOS. Arreglar solo la nueva dejaría la del staff esperando al
-- primer cliente con Instagram que se dé de alta a mano.

-- ---------------------------------------------------------------------------
-- 1. La ruta del staff, de la 0058
-- ---------------------------------------------------------------------------
create or replace function public.registrar_conexion(
  p_org        uuid,
  p_page_id    text,
  p_page_name  text,
  p_ig_id      text default null,
  p_ig_user    text default null,
  p_business   text default null,
  p_tasks      text[] default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_conexion uuid;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  -- Una Página en dos espacios haría que los mensajes de un cliente entraran en
  -- la bandeja de otro. Es el fallo de aislamiento más caro que existe aquí.
  if exists (select 1 from public.meta_connections where page_id = p_page_id) then
    raise exception 'Esa Página ya está conectada a un espacio.' using errcode = '23505';
  end if;

  insert into public.meta_connections
    (organization_id, page_id, page_name, ig_business_account_id, ig_username,
     business_id, tasks, estado)
  values (p_org, p_page_id, p_page_name, p_ig_id, p_ig_user, p_business, p_tasks, 'connected')
  returning id into v_conexion;

  insert into public.channels (organization_id, meta_connection_id, canal, nombre)
  values (p_org, v_conexion, 'messenger', coalesce(p_page_name, p_page_id));

  -- Instagram solo si hay cuenta vinculada. Un canal de Instagram sin IGSID es
  -- una fila que promete algo que no puede cumplir.
  if p_ig_id is not null then
    insert into public.channels (organization_id, meta_connection_id, canal, nombre)
    values (p_org, v_conexion, 'instagram', coalesce('@' || p_ig_user, p_ig_id));
  end if;

  -- El enrutado: por dónde sabrá el receptor de quién es cada webhook.
  insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
  values (p_page_id, 'page', p_org, v_conexion)
  on conflict (asset_id) do nothing;

  if p_ig_id is not null then
    -- OJO: `ig_business_account`, no `instagram`. El nombre del CANAL sí es
    -- `instagram` (ahí manda el enum `canal_meta`), pero el del ACTIVO no. Dos
    -- vocabularios distintos a dos columnas de distancia, y de ahí salió el fallo.
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (p_ig_id, 'ig_business_account', p_org, v_conexion)
    on conflict (asset_id) do nothing;
  end if;

  perform private.registrar_actividad(
    p_org, 'canal.conectado', 'usuario', null, (select auth.uid()),
    jsonb_build_object('pagina', p_page_name, 'page_id', p_page_id,
                       'instagram', p_ig_user, 'tasks', to_jsonb(coalesce(p_tasks, '{}'::text[]))));

  return v_conexion;
end $fn$;

-- ---------------------------------------------------------------------------
-- 2. La ruta de OAuth, de la 0088
-- ---------------------------------------------------------------------------
create or replace function private.registrar_conexion_oauth(
  p_org        uuid,
  p_page_id    text,
  p_page_name  text,
  p_ig_id      text default null,
  p_ig_user    text default null,
  p_business   text default null,
  p_tasks      text[] default null,
  p_config_id  text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_conexion uuid;
  v_duenio   uuid;
begin
  select id, organization_id into v_conexion, v_duenio
    from public.meta_connections where page_id = p_page_id;

  if v_conexion is not null and v_duenio <> p_org then
    raise exception 'Esa Página ya está conectada a otro espacio.' using errcode = '23505';
  end if;

  if v_conexion is null then
    insert into public.meta_connections
      (organization_id, page_id, page_name, ig_business_account_id, ig_username,
       business_id, tasks, config_id, estado)
    values (p_org, p_page_id, p_page_name, p_ig_id, p_ig_user,
            p_business, p_tasks, p_config_id, 'connected')
    returning id into v_conexion;
  else
    update public.meta_connections
       set page_name = coalesce(p_page_name, page_name),
           ig_business_account_id = p_ig_id,
           ig_username = p_ig_user,
           business_id = coalesce(p_business, business_id),
           tasks = coalesce(p_tasks, tasks),
           config_id = coalesce(p_config_id, config_id),
           estado = 'connected',
           token_invalid_since = null,
           token_last_verified_at = now(),
           updated_at = now()
     where id = v_conexion;
  end if;

  insert into public.channels (organization_id, meta_connection_id, canal, nombre)
  values (p_org, v_conexion, 'messenger', coalesce(p_page_name, p_page_id))
  on conflict (meta_connection_id, canal) do update
    set nombre = excluded.nombre, activo = true,
        pausado_motivo = null, pausado_desde = null;

  if p_ig_id is not null then
    insert into public.channels (organization_id, meta_connection_id, canal, nombre)
    values (p_org, v_conexion, 'instagram', coalesce('@' || p_ig_user, p_ig_id))
    on conflict (meta_connection_id, canal) do update
      set nombre = excluded.nombre, activo = true,
          pausado_motivo = null, pausado_desde = null;
  else
    update public.channels
       set activo = false,
           pausado_motivo = 'La cuenta de Instagram ya no está vinculada a la Página',
           pausado_desde = coalesce(pausado_desde, now())
     where meta_connection_id = v_conexion and canal = 'instagram' and activo;
  end if;

  insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
  values (p_page_id, 'page', p_org, v_conexion)
  on conflict (asset_id) do update
    set organization_id = excluded.organization_id,
        meta_connection_id = excluded.meta_connection_id;

  if p_ig_id is not null then
    -- `ig_business_account`, no `instagram`: ver la cabecera de esta migración.
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (p_ig_id, 'ig_business_account', p_org, v_conexion)
    on conflict (asset_id) do update
      set organization_id = excluded.organization_id,
          meta_connection_id = excluded.meta_connection_id;
  end if;

  perform private.registrar_actividad(
    p_org, 'canal.conectado', 'sistema', null, null,
    jsonb_build_object('via', 'oauth', 'pagina', p_page_name, 'page_id', p_page_id,
                       'instagram', p_ig_user, 'config_id', p_config_id,
                       'tasks', to_jsonb(coalesce(p_tasks, '{}'::text[]))));

  return v_conexion;
end $fn$;

-- `create or replace` conserva los permisos existentes, pero se repiten para que
-- esta migración siga siendo correcta aplicada sobre un esquema desde cero.
revoke execute on function public.registrar_conexion(uuid,text,text,text,text,text,text[])
  from public, anon;
revoke execute on function private.registrar_conexion_oauth(uuid,text,text,text,text,text,text[],text)
  from public, anon, authenticated;
grant execute on function public.registrar_conexion_oauth(uuid,text,text,text,text,text,text[],text)
  to service_role;
