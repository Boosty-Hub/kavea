-- 0079_desconectar_canales.sql — pausar un canal, o desconectar la conexión entera.
--
-- DOS ACCIONES DISTINTAS, Y NO POR CAPRICHO.
--
-- Pausar (`pausar_canal`/`reanudar_canal`) es reversible en un clic: apaga un
-- canal de `channels` sin tocar ni el token ni la suscripción de Meta. Sirve
-- para «no quiero que Kavea despache por WhatsApp esta semana» sin perder
-- nada.
--
-- Desconectar (`desconectar_conexion`) es la conexión entera —Página+Instagram,
-- o WABA+número— y no se puede deshacer con un clic: borra la credencial
-- cifrada, borra el enrutado (`meta_asset_routes`) y marca la conexión
-- `disconnected`. Volver a conectar es dar de alta otra vez, no reanudar.
--
-- Las dos usan la misma matriz de permisos que ya existe desde la 0040:
-- `puede(org, 'conectar')`, hoy solo el propietario. «Conectar canales toca
-- credenciales y el kill-switch» decía el comentario original, y desconectar
-- es la misma familia de riesgo.

-- ---------------------------------------------------------------------------
-- 1. Pausar y reanudar un canal.
-- ---------------------------------------------------------------------------
create or replace function public.pausar_canal(p_canal uuid, p_motivo text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_canal text;
begin
  select c.organization_id, c.canal into v_org, v_canal
    from public.channels c where c.id = p_canal;
  if v_org is null then
    raise exception 'No existe ese canal.' using errcode = 'P0002';
  end if;
  if not public.puede(v_org, 'conectar') then
    raise exception 'No tienes permiso para pausar canales.' using errcode = '42501';
  end if;

  update public.channels
     set activo = false,
         pausado_motivo = coalesce(p_motivo, 'Pausado a mano'),
         pausado_desde = now()
   where id = p_canal;

  perform private.registrar_actividad(v_org, 'canal.pausado', 'usuario', null, (select auth.uid()),
    jsonb_build_object('canal', v_canal, 'motivo', p_motivo));
end $$;

create or replace function public.reanudar_canal(p_canal uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_canal text;
begin
  select c.organization_id, c.canal into v_org, v_canal
    from public.channels c where c.id = p_canal;
  if v_org is null then
    raise exception 'No existe ese canal.' using errcode = 'P0002';
  end if;
  if not public.puede(v_org, 'conectar') then
    raise exception 'No tienes permiso para reanudar canales.' using errcode = '42501';
  end if;

  update public.channels
     set activo = true, pausado_motivo = null, pausado_desde = null
   where id = p_canal;

  perform private.registrar_actividad(v_org, 'canal.reanudado', 'usuario', null, (select auth.uid()),
    jsonb_build_object('canal', v_canal));
end $$;

revoke all on function public.pausar_canal(uuid, text) from anon;
revoke all on function public.reanudar_canal(uuid) from anon;
grant execute on function public.pausar_canal(uuid, text) to authenticated;
grant execute on function public.reanudar_canal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Desconectar la conexión entera.
-- ---------------------------------------------------------------------------
-- Devuelve los identificadores de Meta ANTES de borrar nada, porque el
-- llamante los necesita para el segundo paso —dar de baja la suscripción de
-- webhooks en Meta, que corre en la función de borde `portafolio` con el
-- token de portafolio, no aquí: Postgres no le habla a la red—. Ese segundo
-- paso es best-effort a propósito: si Meta no confirma la baja, la conexión
-- ya quedó desconectada en Kavea de todas formas, porque `meta_asset_routes`
-- también se borra y ningún webhook que llegue después puede resolver tenant.
create or replace function public.desconectar_conexion(p_conexion uuid, p_motivo text default null)
returns table(page_id text, waba_id text, phone_number_id text, nombre text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_page_id text; v_waba_id text; v_phone_number_id text; v_nombre text;
begin
  select mc.organization_id, mc.page_id, mc.waba_id, mc.phone_number_id,
         coalesce(mc.page_name, mc.display_phone_number, mc.verified_name, mc.page_id, mc.waba_id)
    into v_org, v_page_id, v_waba_id, v_phone_number_id, v_nombre
    from public.meta_connections mc
   where mc.id = p_conexion;

  if v_org is null then
    raise exception 'No existe esa conexión.' using errcode = 'P0002';
  end if;
  if not public.puede(v_org, 'conectar') then
    raise exception 'No tienes permiso para desconectar canales.' using errcode = '42501';
  end if;

  update public.meta_connections set estado = 'disconnected' where id = p_conexion;

  update public.channels
     set activo = false, pausado_motivo = 'Conexión desconectada', pausado_desde = now()
   where meta_connection_id = p_conexion;

  delete from public.meta_asset_routes where meta_connection_id = p_conexion;
  delete from private.meta_credentials where meta_connection_id = p_conexion;

  perform private.registrar_actividad(v_org, 'conexion.desconectada', 'usuario', null, (select auth.uid()),
    jsonb_build_object('nombre', v_nombre, 'motivo', p_motivo));

  return query select v_page_id, v_waba_id, v_phone_number_id, v_nombre;
end $$;

revoke all on function public.desconectar_conexion(uuid, text) from anon;
grant execute on function public.desconectar_conexion(uuid, text) to authenticated;

comment on function public.desconectar_conexion(uuid, text) is
  'Desconexión local, siempre completa. La baja de la suscripción en Meta es un paso aparte, en la función de borde portafolio, y no bloquea esta.';
