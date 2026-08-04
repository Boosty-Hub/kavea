-- Aislamiento entre organizaciones, a nivel de esquema.
--
-- Complementa a canarios.sql: aquellos comprueban la FORMA del esquema, este
-- comprueba su COMPORTAMIENTO intentando cruces reales.
--
-- Corre con el rol de migración, que tiene BYPASSRLS. Eso es deliberado: lo que
-- se prueba aquí es la frontera del PLANO DE ESCRITURA —claves compuestas y
-- restricciones—, que es la que protege al normalizador. La frontera de lectura
-- se prueba con sesiones reales en scripts/prueba-aislamiento.ps1, porque
-- necesita dos JWT y PostgREST.
--
-- Con una sesión normal, el `with check` de RLS bloquearía estos inserts y la
-- prueba no demostraría nada. Ese es justo el punto.

\set ON_ERROR_STOP on

begin;

insert into public.organizations (id, nombre, slug) values
  ('00000000-0000-4000-8000-0000000000a1', 'Aislamiento A', 'aisl-a'),
  ('00000000-0000-4000-8000-0000000000b1', 'Aislamiento B', 'aisl-b');

insert into public.contacts (id, organization_id, nombre) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'Contacto de A');

-- A1: una identidad de B no puede apuntar a un contacto de A ----------------
do $$
begin
  begin
    insert into public.contact_identities (organization_id, contact_id, canal, scoped_id)
    values ('00000000-0000-4000-8000-0000000000b1',
            '00000000-0000-4000-8000-0000000000a2', 'messenger', 'cruzado');
    raise exception 'A1: se acepto una identidad que cruza tenants';
  exception
    when foreign_key_violation then null;   -- correcto
  end;
end $$;

-- A2: una ruta de enrutado no puede apuntar a una conexión inexistente -------
do $$
begin
  begin
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values ('asset-x', 'page', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid());
    raise exception 'A2: se acepto una ruta hacia una conexion inexistente';
  exception
    when foreign_key_violation then null;
  end;
end $$;

-- A3: asset_id es clave primaria, así que no puede resolver a dos tenants ----
--
-- Los insert de preparación van FUERA del bloque de excepción. Un bloque
-- `begin ... exception` abre una subtransacción: al capturar el error se
-- revierte todo lo hecho dentro, incluidas las filas que las comprobaciones
-- siguientes necesitan. Este fichero ya falló una vez por eso.
insert into public.meta_connections (id, organization_id, page_id) values
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a1', 'page-a'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b1', 'page-b');

insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
values ('page-a', 'page', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000a3');

do $$
begin
  begin
    insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
    values ('page-a', 'page', '00000000-0000-4000-8000-0000000000b1',
            '00000000-0000-4000-8000-0000000000b3');
    raise exception 'A3: un mismo asset_id resolvio a dos organizaciones';
  exception
    when unique_violation then null;
  end;
end $$;

-- A4: la conversación abierta es única por contacto y canal ------------------
-- Predicado "distinto de cerrada", no "igual a abierta": con cuatro estados,
-- una conversación en 'esperando' quedaría desprotegida y tres fotos seguidas
-- crearían tres hilos.
insert into public.channels (id, organization_id, meta_connection_id, canal, nombre)
values ('00000000-0000-4000-8000-0000000000a4',
        '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000a3', 'messenger', 'Canal A');

-- Desde 0027, una conversación SIEMPRE cuelga de una tarjeta: `tarjeta_id` es NOT
-- NULL y no tiene valor por defecto. Esta prueba insertaba sin ella y llevaba
-- días tumbando el job de esquema, escondida detrás de los canarios C2, C4 y C5:
-- cada `ON_ERROR_STOP` tapa lo que viene después.
insert into public.tarjetas (id, organization_id, contact_id)
values ('00000000-0000-4000-8000-0000000000a5',
        '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000a2');

insert into public.conversations (organization_id, channel_id, canal, contact_id, estado, tarjeta_id)
values ('00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000a4', 'messenger',
        '00000000-0000-4000-8000-0000000000a2', 'esperando',
        '00000000-0000-4000-8000-0000000000a5');

do $$
begin
  begin
    insert into public.conversations (organization_id, channel_id, canal, contact_id, estado, tarjeta_id)
    values ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000a4', 'messenger',
            '00000000-0000-4000-8000-0000000000a2', 'nueva',
            '00000000-0000-4000-8000-0000000000a5');
    raise exception 'A4: se creo una segunda conversacion no cerrada para el mismo contacto';
  exception
    when unique_violation then null;
  end;
end $$;

-- A5: los timestamps de Meta vienen en milisegundos --------------------------
-- Si la columna generada divide mal, la fecha cae en 1970 y nadie lo nota
-- hasta que la bandeja ordena al revés.
do $$
declare v_anio int;
begin
  select extract(year from to_timestamp(1754092800000 / 1000.0))::int into v_anio;
  if v_anio < 2020 then
    raise exception 'A5: la derivacion de meta_timestamp confunde segundos con milisegundos (anio %)', v_anio;
  end if;
end $$;

-- A6: la media entrante no se puede guardar como saliente --------------------
do $$
begin
  begin
    insert into public.media (organization_id, message_id, origen, cdn_url, storage_path, tipo, payload)
    values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
            'meta_cdn', 'https://lookaside.fbsbx.com/x', 'bucket/objeto', 'image', '{}'::jsonb);
    raise exception 'A6: se acepto media entrante con ruta de almacenamiento propio';
  exception
    when check_violation then null;
    when foreign_key_violation then null;   -- el mensaje no existe; el CHECK ya no llega a evaluarse
  end;
end $$;

-- A7: un grant de break-glass no puede durar más de 72 horas -----------------
do $$
begin
  begin
    insert into public.access_grants (organization_id, user_id, motivo, expira_en)
    values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
            'motivo suficientemente largo para pasar la restriccion', now() + interval '7 days');
    raise exception 'A7: se acepto un grant de mas de 72 horas';
  exception
    when check_violation then null;
    when foreign_key_violation then null;   -- el usuario no existe
  end;
end $$;

rollback;

\echo 'Aislamiento de esquema: las siete comprobaciones pasan.'
