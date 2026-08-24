-- 0088_conexion_por_oauth.sql — dar de alta una conexión desde el flujo de
-- Facebook Login for Business, sin que haya un operador de Boosty detrás.
--
-- POR QUÉ NO VALE `registrar_conexion`. La 0058 la escribió para el alta que
-- conduce Boosty a mano, y por eso empieza con `if not public.es_staff()`. En el
-- autoservicio no hay staff: quien autoriza es el cliente en el diálogo de Meta,
-- y quien escribe la fila es el borde con el rol de servicio. La comprobación de
-- quién puede ya ocurrió antes —`puede(org,'conectar')` en `/api/meta/oauth/start`
-- y OTRA VEZ en el callback, al volver de Meta—, así que aquí no se repite: aquí
-- no hay `auth.uid()` que consultar.
--
-- LA DIFERENCIA QUE IMPORTA CON LA 0058: aquí la reconexión es un caso normal.
-- El token BISU no se refresca, se renueva reautorizando (fase 5 §T9), así que
-- pasar por este camino una segunda vez con la misma Página tiene que actualizar,
-- no reventar. Lo que sigue siendo un error duro es la MISMA Página en OTRO
-- espacio: eso metería los mensajes de un cliente en la bandeja de otro, que es
-- el fallo de aislamiento más caro que existe en este producto.

-- ---------------------------------------------------------------------------
-- 1. Conexión, canales y rutas — en una transacción
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
    -- Reconexión. `token_invalid_since` se limpia porque acaba de llegar un
    -- token nuevo: dejarlo puesto mantendría el banner de «reconecta» encendido
    -- delante de un cliente que acaba de hacer exactamente eso.
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

  -- Instagram solo si hay cuenta vinculada; un canal sin IGSID promete algo que
  -- no puede cumplir. Y si el cliente la DESVINCULÓ desde la última vez, el
  -- canal se apaga en lugar de quedarse mintiendo.
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

  -- El enrutado: por dónde sabrá el receptor de quién es cada webhook. Sin esto
  -- los eventos llegan y se descartan en silencio.
  insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
  values (p_page_id, 'page', p_org, v_conexion)
  on conflict (asset_id) do update
    set organization_id = excluded.organization_id,
        meta_connection_id = excluded.meta_connection_id;

  if p_ig_id is not null then
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (p_ig_id, 'instagram', p_org, v_conexion)
    on conflict (asset_id) do update
      set organization_id = excluded.organization_id,
          meta_connection_id = excluded.meta_connection_id;
  end if;

  -- `usuario` sería mentira: quien escribe es el borde. El actor es el sistema,
  -- y el rastro deja constancia de por qué vía entró.
  perform private.registrar_actividad(
    p_org, 'canal.conectado', 'sistema', null, null,
    jsonb_build_object('via', 'oauth', 'pagina', p_page_name, 'page_id', p_page_id,
                       'instagram', p_ig_user, 'config_id', p_config_id,
                       'tasks', to_jsonb(coalesce(p_tasks, '{}'::text[]))));

  return v_conexion;
end $fn$;

create or replace function public.registrar_conexion_oauth(
  p_org uuid, p_page_id text, p_page_name text,
  p_ig_id text default null, p_ig_user text default null,
  p_business text default null, p_tasks text[] default null,
  p_config_id text default null
)
returns uuid
language sql volatile security definer set search_path = ''
as $fn$
  select private.registrar_conexion_oauth(
    p_org, p_page_id, p_page_name, p_ig_id, p_ig_user, p_business, p_tasks, p_config_id)
$fn$;

-- ---------------------------------------------------------------------------
-- 2. El BISU, cifrado
-- ---------------------------------------------------------------------------
-- La 0058 solo guardaba el Page Access Token. La tabla de la 0004 ya tenía
-- columnas para el BISU desde el primer día y nadie las había llenado: hasta
-- ahora no existía ningún flujo que produjera uno.
create or replace function private.guardar_credencial_bisu(
  p_conexion uuid, p_cipher bytea, p_nonce bytea, p_kid text
)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  update private.meta_credentials
     set bisu_token_cipher = p_cipher,
         bisu_token_nonce  = p_nonce,
         bisu_token_kid    = p_kid,
         rotado_en = now()
   where meta_connection_id = p_conexion;
$fn$;

create or replace function public.guardar_credencial_bisu(
  p_conexion uuid, p_cipher bytea, p_nonce bytea, p_kid text
)
returns void
language sql volatile security definer set search_path = ''
as $fn$ select private.guardar_credencial_bisu(p_conexion, p_cipher, p_nonce, p_kid) $fn$;

-- ---------------------------------------------------------------------------
-- 3. Cerrar el alta: la suscripción a webhooks
-- ---------------------------------------------------------------------------
-- `subscription_ok` es lo que separa una conexión viva de una que recibe cero
-- eventos sin quejarse. Se escribe SOLO cuando Meta confirmó la suscripción.
create or replace function private.marcar_suscripcion(
  p_conexion uuid,
  p_ok boolean,
  p_campos_messenger text[] default null,
  p_campos_instagram text[] default null
)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  update public.meta_connections
     set subscription_ok = p_ok,
         subscribed_fields_messenger = coalesce(p_campos_messenger, subscribed_fields_messenger),
         subscribed_fields_instagram = coalesce(p_campos_instagram, subscribed_fields_instagram),
         last_subscription_check_at = now(),
         estado = case when p_ok then 'connected' else 'degraded' end,
         updated_at = now()
   where id = p_conexion;
$fn$;

create or replace function public.marcar_suscripcion(
  p_conexion uuid, p_ok boolean,
  p_campos_messenger text[] default null, p_campos_instagram text[] default null
)
returns void
language sql volatile security definer set search_path = ''
as $fn$ select private.marcar_suscripcion(p_conexion, p_ok, p_campos_messenger, p_campos_instagram) $fn$;

-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
-- Se revoca de `public` y no solo de `anon`: la lección de la 0084. `anon`
-- hereda de `public`, así que quitárselo a `anon` no quita nada mientras
-- `public` lo conserve. Y sin `revoke`, una función nueva nace con `proacl`
-- NULL, que significa EXECUTE para PUBLIC — el canario C8 lo comprueba.
revoke execute on function private.registrar_conexion_oauth(uuid,text,text,text,text,text,text[],text)
  from public, anon, authenticated;
revoke execute on function public.registrar_conexion_oauth(uuid,text,text,text,text,text,text[],text)
  from public, anon, authenticated;
revoke execute on function private.guardar_credencial_bisu(uuid,bytea,bytea,text)
  from public, anon, authenticated;
revoke execute on function public.guardar_credencial_bisu(uuid,bytea,bytea,text)
  from public, anon, authenticated;
revoke execute on function private.marcar_suscripcion(uuid,boolean,text[],text[])
  from public, anon, authenticated;
revoke execute on function public.marcar_suscripcion(uuid,boolean,text[],text[])
  from public, anon, authenticated;

grant execute on function public.registrar_conexion_oauth(uuid,text,text,text,text,text,text[],text)
  to service_role;
grant execute on function public.guardar_credencial_bisu(uuid,bytea,bytea,text) to service_role;
grant execute on function public.marcar_suscripcion(uuid,boolean,text[],text[]) to service_role;

comment on function public.registrar_conexion_oauth(uuid,text,text,text,text,text,text[],text) is
  'Alta de conexion desde el flujo de Facebook Login for Business. Como la 0058 '
  'pero sin es_staff (no hay operador) y con la reconexion como caso normal: el '
  'BISU no se refresca, se renueva reautorizando. La misma Pagina en otro espacio '
  'sigue siendo error duro.';
