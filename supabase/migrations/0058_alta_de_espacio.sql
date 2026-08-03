-- 0058_alta_de_espacio.sql — crear un cliente y conectarle una Página, sin SQL.
-- Fuente: docs/fases/05b-fase-panel-interno.md, bloque B.
--
-- DÓNDE VIVE EL TOKEN DE PORTAFOLIO, Y POR QUÉ NO AQUÍ
--
-- El plan decía guardarlo cifrado en la base. Se hace distinto y mejor: vive en
-- los secretos del proyecto (`META_PORTFOLIO_TOKEN`), fuera de Postgres.
--
-- Razón: Boosty tiene UN portafolio. Un token único de instalación no gana nada
-- por estar en una tabla —no hay varios, no hay que consultarlo por cliente— y
-- pierde bastante: un volcado de la base dejaría de ser inofensivo, y habría que
-- protegerlo con las mismas políticas que todo lo demás. En los secretos no lo
-- alcanza ninguna consulta, ni siquiera con el rol de servicio.
--
-- El día que un cliente traiga SU portafolio por OAuth, ese token sí va cifrado
-- por conexión en `private.meta_credentials.bisu_token_cipher`, que ya existe
-- vacío desde la fase 0. Son dos casos distintos y merecen dos sitios distintos.

-- ---------------------------------------------------------------------------
-- 1. Guardar una credencial cifrada
-- ---------------------------------------------------------------------------
-- La llama el borde con el rol de servicio, con el token YA cifrado: la base
-- nunca ve el texto claro. Sin permiso para nadie más.
create or replace function private.guardar_credencial(
  p_conexion uuid,
  p_cipher   bytea,
  p_nonce    bytea,
  p_kid      text
)
returns void
language sql volatile security definer set search_path = ''
as $$
  insert into private.meta_credentials
    (meta_connection_id, page_access_token_cipher, page_access_token_nonce,
     page_access_token_kid, cifrado_en)
  values (p_conexion, p_cipher, p_nonce, p_kid, now())
  on conflict (meta_connection_id) do update
    set page_access_token_cipher = excluded.page_access_token_cipher,
        page_access_token_nonce  = excluded.page_access_token_nonce,
        page_access_token_kid    = excluded.page_access_token_kid,
        rotado_en = now();
$$;

create or replace function public.guardar_credencial(
  p_conexion uuid, p_cipher bytea, p_nonce bytea, p_kid text
)
returns void
language sql volatile security definer set search_path = ''
as $$ select private.guardar_credencial(p_conexion, p_cipher, p_nonce, p_kid) $$;

revoke execute on function private.guardar_credencial(uuid,bytea,bytea,text)
  from public, anon, authenticated;
revoke execute on function public.guardar_credencial(uuid,bytea,bytea,text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Crear el espacio de un cliente
-- ---------------------------------------------------------------------------
-- El slug es el subdominio, y una vez repartido no se cambia. Se valida aquí y
-- no en el formulario: un slug con mayúsculas o con un punto produce una URL que
-- no resuelve, y el fallo aparece días después cuando alguien intenta entrar.
create or replace function public.crear_espacio(
  p_nombre text,
  p_slug   text,
  p_huso   text default 'America/Caracas'
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid; v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El nombre es demasiado corto.' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$' then
    raise exception 'El subdominio va en minúsculas, sin acentos ni puntos, y con guiones en medio.'
      using errcode = '22023';
  end if;
  -- Reservados: son subdominios que ya significan otra cosa. Uno de estos
  -- secuestraría el panel interno o la web pública para siempre.
  if v_slug in ('admin', 'www', 'app', 'api', 'kavea', 'staff', 'soporte', 'support') then
    raise exception 'Ese subdominio está reservado.' using errcode = '22023';
  end if;
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise exception 'Ya hay un espacio con ese subdominio.' using errcode = '23505';
  end if;

  -- El embudo por defecto lo siembra el trigger `organizations_embudo` desde
  -- 0032. No se repite aquí: dos semillas del mismo dato divergen.
  insert into public.organizations (nombre, slug, zona_horaria)
  values (btrim(p_nombre), v_slug, coalesce(nullif(btrim(p_huso), ''), 'America/Caracas'))
  returning id into v_id;

  perform private.registrar_actividad(
    v_id, 'espacio.creado', 'usuario', null, (select auth.uid()),
    jsonb_build_object('nombre', btrim(p_nombre), 'slug', v_slug));

  return v_id;
end $$;

revoke execute on function public.crear_espacio(text, text, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Registrar la conexión de una Página
-- ---------------------------------------------------------------------------
-- Todo en UNA transacción: conexión, canales y ruta de enrutado. A medias es
-- peor que nada — una conexión sin ruta recibe webhooks que no sabe de quién son
-- y los descarta en silencio.
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
as $$
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
  on conflict (asset_id) do nothing;   -- la clave primaria es solo asset_id

  if p_ig_id is not null then
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (p_ig_id, 'instagram', p_org, v_conexion)
    on conflict (asset_id) do nothing;   -- la clave primaria es solo asset_id
  end if;

  perform private.registrar_actividad(
    p_org, 'canal.conectado', 'usuario', null, (select auth.uid()),
    jsonb_build_object('pagina', p_page_name, 'page_id', p_page_id,
                       'instagram', p_ig_user, 'tasks', to_jsonb(coalesce(p_tasks, '{}'::text[]))));

  return v_conexion;
end $$;

revoke execute on function public.registrar_conexion(uuid,text,text,text,text,text,text[])
  from public, anon;

comment on function public.registrar_conexion(uuid,text,text,text,text,text,text[]) is
  'Conexion, canales y rutas en UNA transaccion. A medias es peor que nada: una '
  'conexion sin ruta recibe webhooks que no sabe de quien son y los descarta en '
  'silencio.';
