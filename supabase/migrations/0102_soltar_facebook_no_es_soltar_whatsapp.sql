-- 0102_soltar_facebook_no_es_soltar_whatsapp.sql — el botón se llevaba un canal que no era suyo.
--
-- QUÉ PASÓ, la misma noche que se desplegó la 0101. Gabriel pulsó «Desconectar la
-- cuenta de Facebook» y se apagaron DOS conexiones: la Página y el número de
-- WhatsApp `+1 321-393-1397`. La Página era la que tenía que caer; el número no.
--
-- WhatsApp NO CUELGA DE ESA AUTORIZACIÓN. Entra por otro camino: el portafolio,
-- con token de system user, por `/api/portafolio`, que es una superficie de staff.
-- El botón dice «cuenta de Facebook» y `desautorizar_meta` desconectaba todo lo
-- que hubiera en `meta_connections`, sin mirar de dónde venía. Un botón que apaga
-- más de lo que su texto promete es peor que uno que no existe, y el precio se
-- pagó entero: el número quedó sin rutas y volver a levantarlo NO es un clic en
-- «Elegir qué conectar» —esa pantalla solo activa Páginas e Instagram del BISU—,
-- hay que rehacerlo desde el panel interno.
--
-- EL CRITERIO. Cae lo que la autorización de Facebook produjo: las conexiones con
-- `page_id`, que son las Páginas y los Instagram que cuelgan de ellas. Se queda lo
-- que llegó por otra puerta.
--
-- CUÁNDO HABRÁ QUE VOLVER AQUÍ: el día que WhatsApp entre por Embedded Signup. Ahí
-- sí colgará de la misma autorización y tendrá que caer con ella. La regla no es
-- «WhatsApp nunca» sino «lo que vino de este permiso»; hoy se distinguen por
-- `page_id` porque hoy son dos puertas distintas.

create or replace function public.desautorizar_meta(p_org uuid, p_motivo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_habia    boolean;
  v_activos  jsonb := '[]'::jsonb;
  v_n        int := 0;
  v_intactas int := 0;
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

  -- Solo lo que produjo esta autorización. Ver la cabecera.
  select coalesce(jsonb_agg(jsonb_build_object(
           'conexion', mc.id,
           'page_id', mc.page_id,
           'waba_id', mc.waba_id,
           'nombre', coalesce(mc.page_name, mc.verified_name, mc.page_id)
         ) order by mc.page_name nulls last), '[]'::jsonb)
    into v_activos
    from public.meta_connections mc
   where mc.organization_id = p_org
     and mc.estado <> 'disconnected'
     and mc.page_id is not null;

  v_n := jsonb_array_length(v_activos);

  -- Y cuántas se quedan en pie, para poder decirlo. Un «se desconectaron 2» sin
  -- decir que otra sigue viva deja al operador sin saber qué tiene.
  select count(*) into v_intactas
    from public.meta_connections mc
   where mc.organization_id = p_org
     and mc.estado <> 'disconnected'
     and mc.page_id is null;

  update public.meta_connections
     set estado = 'disconnected'
   where organization_id = p_org and estado <> 'disconnected' and page_id is not null;

  update public.channels c
     set activo = false,
         pausado_motivo = 'Cuenta de Facebook desconectada',
         pausado_desde = now()
   where c.organization_id = p_org
     and c.activo
     and exists (
       select 1 from public.meta_connections mc
        where mc.id = c.meta_connection_id and mc.page_id is not null
     );

  delete from public.meta_asset_routes r
   where r.organization_id = p_org
     and exists (
       select 1 from public.meta_connections mc
        where mc.id = r.meta_connection_id and mc.page_id is not null
     );

  delete from private.meta_credentials
   where meta_connection_id in (
     select id from public.meta_connections
      where organization_id = p_org and page_id is not null
   );

  update private.meta_autorizaciones
     set revocada_en = now()
   where organization_id = p_org and revocada_en is null;

  perform private.registrar_actividad(
    p_org, 'meta.desautorizada', 'usuario', null, (select auth.uid()),
    jsonb_build_object('conexiones', v_n, 'intactas', v_intactas, 'motivo', p_motivo));

  return jsonb_build_object(
    'habia_autorizacion', v_habia,
    'conexiones', v_n,
    'intactas', v_intactas,
    'activos', v_activos);
end $fn$;

revoke execute on function public.desautorizar_meta(uuid, text) from public, anon;
grant  execute on function public.desautorizar_meta(uuid, text) to authenticated;
