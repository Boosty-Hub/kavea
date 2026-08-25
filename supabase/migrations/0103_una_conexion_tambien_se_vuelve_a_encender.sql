-- 0103_una_conexion_tambien_se_vuelve_a_encender.sql — faltaba el camino de vuelta.
--
-- QUÉ FALTABA. Desde la 0079 hay `desconectar_conexion` y no hay nada que lo
-- deshaga. Para una Página da igual: se vuelve a activar desde «Elegir qué
-- conectar», que la registra otra vez desde el BISU. Para WhatsApp no hay
-- equivalente —entra por el portafolio, con token de system user y desde una
-- pantalla de staff—, así que un número desconectado por error se quedaba
-- desconectado hasta que alguien escribiera SQL a mano.
--
-- Pasó anoche: el botón de soltar la cuenta de Facebook se llevó por delante
-- `+1 321-393-1397`. La 0102 arregla que vuelva a ocurrir; esta arregla poder
-- levantar lo que ya cayó.
--
-- QUÉ REHACE Y QUÉ NO. Rehace lo que `desconectar_conexion` deshizo del lado de
-- Postgres: el estado, las rutas de asset y los canales. NO rehace la credencial
-- —está cifrada y se emite fuera— ni la suscripción de webhooks en Meta: esos dos
-- son del borde, y quien llama tiene que encadenarlos. Prometer aquí una
-- reconexión completa sería mentir sobre lo que esta función puede saber.
--
-- LAS RUTAS SE DERIVAN DE LA FILA, no se reciben. Una conexión sabe qué activos
-- tiene —`page_id`, `ig_business_account_id`, `phone_number_id`— y cada uno va con
-- su `tipo`. Aceptarlos por parámetro sería ofrecer una forma de enrutar los
-- eventos de un activo ajeno hacia este espacio, que es exactamente el agujero
-- que `meta_asset_routes` existe para cerrar.

create or replace function public.reconectar_conexion(p_conexion uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  c public.meta_connections%rowtype;
  v_rutas int := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;

  select * into c from public.meta_connections mc where mc.id = p_conexion;
  if c.id is null then
    raise exception 'No existe esa conexión.' using errcode = 'P0002';
  end if;
  if not public.puede(c.organization_id, 'conectar') then
    raise exception 'No tienes permiso para reconectar canales.' using errcode = '42501';
  end if;

  update public.meta_connections set estado = 'connected', updated_at = now()
   where id = c.id;

  -- Las rutas, una por activo que la fila tenga. `on conflict do nothing` porque
  -- un asset ya enrutado a OTRA organización no se puede robar: la clave
  -- primaria es el asset, y esa colisión tiene que ser un no-op silencioso aquí
  -- y un problema visible en el diagnóstico, no un secuestro.
  if c.page_id is not null then
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (c.page_id, 'page', c.organization_id, c.id)
    on conflict (asset_id) do nothing;
    v_rutas := v_rutas + 1;
  end if;

  if c.ig_business_account_id is not null then
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (c.ig_business_account_id, 'ig_business_account', c.organization_id, c.id)
    on conflict (asset_id) do nothing;
    v_rutas := v_rutas + 1;
  end if;

  if c.phone_number_id is not null then
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values (c.phone_number_id, 'whatsapp_phone_number', c.organization_id, c.id)
    on conflict (asset_id) do nothing;
    v_rutas := v_rutas + 1;
  end if;

  -- Los canales vuelven a encenderse SOLO si los apagó una desconexión. Uno que
  -- alguien pausó a mano por otro motivo sigue pausado: reconectar no es
  -- deshacer todas las decisiones que se tomaron mientras tanto.
  update public.channels
     set activo = true, pausado_motivo = null, pausado_desde = null, updated_at = now()
   where meta_connection_id = c.id
     and not activo
     and pausado_motivo in ('Conexión desconectada', 'Cuenta de Facebook desconectada');

  perform private.registrar_actividad(
    c.organization_id, 'conexion.reconectada', 'usuario', null, (select auth.uid()),
    jsonb_build_object(
      'nombre', coalesce(c.page_name, c.display_phone_number, c.verified_name, c.page_id, c.waba_id),
      'rutas', v_rutas));

  return jsonb_build_object(
    'conexion', c.id,
    'nombre', coalesce(c.page_name, c.display_phone_number, c.verified_name, c.page_id, c.waba_id),
    'page_id', c.page_id,
    'waba_id', c.waba_id,
    'phone_number_id', c.phone_number_id,
    'rutas', v_rutas,
    -- Lo que ESTA función no pudo hacer, dicho por su nombre para que quien
    -- llama sepa qué le queda.
    'falta', jsonb_build_array('credencial', 'suscripcion'));
end $fn$;

revoke execute on function public.reconectar_conexion(uuid) from public, anon;
grant  execute on function public.reconectar_conexion(uuid) to authenticated;
