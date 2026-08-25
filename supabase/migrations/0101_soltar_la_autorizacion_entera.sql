-- 0101_soltar_la_autorizacion_entera.sql — desconectar la cuenta de Facebook, no solo un canal.
--
-- QUÉ FALTABA. Desde la 0092 una organización tiene UNA autorización de Facebook
-- y de ella cuelgan todas sus Páginas e Instagram. Se podía soltar un canal
-- —`desconectar_conexion`, de la 0079— pero no la autorización: la fila seguía en
-- `private.meta_autorizaciones` con su BISU cifrado, la pantalla seguía diciendo
-- «ya autorizaste tu cuenta de Facebook», y Kavea seguía pudiendo pedirle activos
-- a Meta en nombre de alguien que creía haberse ido. Un producto que deja entrar
-- tiene que dejar salir, y por la misma puerta.
--
-- QUÉ ES SOLTAR, DE VERDAD. Tres cosas, y las tres importan:
--   1. Desconectar TODAS las conexiones de la organización: credenciales
--      borradas, enrutado borrado, canales apagados. Es lo local.
--   2. Revocar el permiso EN META con el propio BISU. Sin esto, Kavea sigue
--      apareciendo en los ajustes de Facebook del cliente como una app con
--      acceso, y «desconectar» habría sido solo dejar de mirar.
--   3. Dar de baja los webhooks de cada activo, o Meta sigue mandando eventos a
--      una ruta que ya no existe.
-- Aquí va el paso 1 y el permiso para hacerlo; los otros dos son del borde,
-- porque hace falta el token descifrado.
--
-- POR QUÉ LA FILA NO SE BORRA AQUÍ. El borde necesita el BISU para revocar en
-- Meta, y si esta función lo borrase ya no habría con qué. Se marca
-- `revocada_en`: para la aplicación deja de existir en el mismo instante —la
-- pantalla vuelve a ofrecer «Conectar con Facebook»— y el borde todavía puede
-- leerla para terminar el trabajo. Si el borde falla, el cliente ya está
-- desconectado de Kavea, que es lo que pidió, y queda un reintento pendiente en
-- vez de un estado a medias que se ve bien.
--
-- QUIÉN PUEDE: `conectar`, que es solo el propietario. Conectar y desconectar la
-- cuenta entera es la misma decisión mirada desde los dos lados; que un
-- administrador pueda hacer una y no la otra sería una asimetría sin motivo.

alter table private.meta_autorizaciones
  add column if not exists revocada_en timestamptz;

comment on column private.meta_autorizaciones.revocada_en is
  'Cuándo se soltó. Marcada, no borrada: el borde aún necesita el BISU para revocar en Meta.';

-- ---------------------------------------------------------------------------
-- Lo revocado deja de contar en todas partes.
-- ---------------------------------------------------------------------------
create or replace function public.autorizacion_de_organizacion(p_org uuid)
returns table (bisu_cipher bytea, bisu_nonce bytea, bisu_kid text, config_id text)
language sql stable security definer set search_path = ''
as $fn$
  select bisu_cipher, bisu_nonce, bisu_kid, config_id
    from private.meta_autorizaciones
   where organization_id = p_org
     and revocada_en is null;
$fn$;

create or replace function public.organizaciones_con_autorizacion()
returns table (organization_id uuid)
language sql stable security definer set search_path = ''
as $fn$
  -- El cron diario de `debug_token` no tiene nada que comprobar en una
  -- autorización soltada: el token ya no es nuestro.
  select organization_id from private.meta_autorizaciones where revocada_en is null;
$fn$;

drop function if exists public.hay_autorizacion_meta(uuid);

create function public.hay_autorizacion_meta(p_org uuid)
returns table (
  autorizado_en   timestamptz,
  renovado_en     timestamptz,
  verificada_en   timestamptz,
  invalida_desde  timestamptz,
  ultimo_motivo   text
)
language sql stable security definer set search_path = ''
as $fn$
  select a.autorizado_en, a.renovado_en, a.verificada_en, a.invalida_desde, a.ultimo_motivo
    from private.meta_autorizaciones a
   where a.organization_id = p_org
     and a.revocada_en is null
     and public.es_miembro(p_org);
$fn$;

revoke execute on function public.hay_autorizacion_meta(uuid) from public, anon;
grant  execute on function public.hay_autorizacion_meta(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- SOLTAR. Lo local, de una vez y por todas las conexiones.
-- ---------------------------------------------------------------------------
create or replace function public.desautorizar_meta(p_org uuid, p_motivo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_habia   boolean;
  v_activos jsonb := '[]'::jsonb;
  v_n       int := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if not public.puede(p_org, 'conectar') then
    raise exception 'Solo el propietario puede desconectar la cuenta de Facebook.'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from private.meta_autorizaciones
     where organization_id = p_org and revocada_en is null
  ) into v_habia;

  -- Los activos que hay que dar de baja en Meta se recogen ANTES de tocar nada:
  -- después de borrar el enrutado ya no se sabría a quién avisar.
  select coalesce(jsonb_agg(jsonb_build_object(
           'conexion', mc.id,
           'page_id', mc.page_id,
           'waba_id', mc.waba_id,
           'nombre', coalesce(mc.page_name, mc.display_phone_number, mc.verified_name,
                              mc.page_id, mc.waba_id)
         ) order by mc.page_name nulls last), '[]'::jsonb)
    into v_activos
    from public.meta_connections mc
   where mc.organization_id = p_org
     and mc.estado <> 'disconnected';

  v_n := jsonb_array_length(v_activos);

  -- Misma limpieza que `desconectar_conexion`, pero para todas a la vez. Se
  -- escribe aquí y no en un bucle que llame a aquella porque aquella vuelve a
  -- comprobar el permiso por conexión: con veinte Páginas serían veinte
  -- comprobaciones idénticas de algo que ya se decidió arriba.
  update public.meta_connections
     set estado = 'disconnected'
   where organization_id = p_org and estado <> 'disconnected';

  update public.channels
     set activo = false,
         pausado_motivo = 'Cuenta de Facebook desconectada',
         pausado_desde = now()
   where organization_id = p_org and activo;

  delete from public.meta_asset_routes where organization_id = p_org;

  delete from private.meta_credentials
   where meta_connection_id in (
     select id from public.meta_connections where organization_id = p_org
   );

  -- La autorización se marca, no se borra. Ver la cabecera.
  update private.meta_autorizaciones
     set revocada_en = now()
   where organization_id = p_org and revocada_en is null;

  perform private.registrar_actividad(
    p_org, 'meta.desautorizada', 'usuario', null, (select auth.uid()),
    jsonb_build_object('conexiones', v_n, 'motivo', p_motivo));

  return jsonb_build_object(
    'habia_autorizacion', v_habia,
    'conexiones', v_n,
    'activos', v_activos);
end $fn$;

revoke execute on function public.desautorizar_meta(uuid, text) from public, anon;
grant  execute on function public.desautorizar_meta(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que el borde necesita para terminar: leer el BISU marcado y luego olvidarlo.
-- ---------------------------------------------------------------------------
create or replace function public.autorizacion_por_revocar(p_org uuid)
returns table (bisu_cipher bytea, bisu_nonce bytea, bisu_kid text)
language sql stable security definer set search_path = ''
as $fn$
  select bisu_cipher, bisu_nonce, bisu_kid
    from private.meta_autorizaciones
   where organization_id = p_org and revocada_en is not null;
$fn$;

revoke execute on function public.autorizacion_por_revocar(uuid) from public, anon, authenticated;
grant  execute on function public.autorizacion_por_revocar(uuid) to service_role;

-- Y borrarla del todo cuando Meta ya lo sabe. Aquí sí desaparece el token: el
-- rastro de que existió queda en la actividad, que es donde vive la historia.
create or replace function public.olvidar_autorizacion(p_org uuid)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  delete from private.meta_autorizaciones
   where organization_id = p_org and revocada_en is not null;
$fn$;

revoke execute on function public.olvidar_autorizacion(uuid) from public, anon, authenticated;
grant  execute on function public.olvidar_autorizacion(uuid) to service_role;
