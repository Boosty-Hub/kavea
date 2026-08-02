-- Canarios de esquema.
--
-- No comprueban una tabla concreta: se generan desde pg_catalog, así que cubren
-- también las tablas que creen las fases futuras. Un canario que hay que
-- actualizar a mano cada vez que se añade una tabla deja de correrse.
--
-- Cada bloque LANZA EXCEPCIÓN si encuentra un fallo, de modo que psql sale con
-- código distinto de cero y el build se rompe. Un canario que solo imprime se
-- ignora en cuanto la salida del CI pasa de veinte líneas.

\set ON_ERROR_STOP on

-- C1 -------------------------------------------------------------------------
-- Toda tabla de negocio con RLS activo Y forzado.
-- Sin `force`, la política no aplica al dueño de la tabla.
do $$
declare v_fallos text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ')
    into v_fallos
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private')
     and c.relkind = 'r'
     and c.relname not in ('schema_migrations')
     and not (c.relrowsecurity and c.relforcerowsecurity);

  if v_fallos is not null then
    raise exception 'C1: tablas sin RLS activo y forzado: %', v_fallos;
  end if;
end $$;

-- C2 -------------------------------------------------------------------------
-- Toda columna organization_id con un índice que empiece por ella.
-- La política de RLS se convierte en un filtro; sin índice, cada lectura de
-- bandeja es un escaneo secuencial.
do $$
declare v_fallos text;
begin
  select string_agg(c.relname, ', ')
    into v_fallos
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
                       and a.attname = 'organization_id'
                       and a.attnum > 0
                       and not a.attisdropped
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.oid and i.indkey[0] = a.attnum
     );

  if v_fallos is not null then
    raise exception 'C2: organization_id sin indice que empiece por ella: %', v_fallos;
  end if;
end $$;

-- C3 -------------------------------------------------------------------------
-- auth.uid() envuelto en subconsulta.
-- Sin envolver, Postgres lo evalúa una vez POR FILA en lugar de una vez por
-- consulta. En una bandeja con cientos de miles de mensajes no es cosmético.
--
-- OJO con el patrón: Postgres renderiza la forma correcta como
--   ( SELECT auth.uid() AS uid)
-- en mayúsculas y con alias. Un patrón que busque 'select auth.uid()' en
-- minúsculas y sin alias marca como rotas políticas que están bien, y un
-- canario que grita en falso se acaba ignorando. Esto ya pasó una vez.
do $$
declare v_fallos text;
begin
  select string_agg(c.relname || '.' || p.polname, ', ')
    into v_fallos
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where pg_get_expr(p.polqual, p.polrelid) ~* 'auth\.uid\s*\(\s*\)'
     and pg_get_expr(p.polqual, p.polrelid) !~* '\(\s*SELECT\s+auth\.uid\s*\(\s*\)';

  if v_fallos is not null then
    raise exception 'C3: auth.uid() sin envolver en: %', v_fallos;
  end if;
end $$;

-- C4 -------------------------------------------------------------------------
-- Tabla con RLS activo y cero políticas, fuera de las esperadas.
--
-- webhook_events y alertas son así a propósito: deniegan todo. Una fila de
-- cualquiera de las dos puede ser ANTERIOR al enrutado y por tanto no tener
-- tenant, así que no puede quedar bajo RLS de organización. Cualquier otra
-- tabla en ese estado es un olvido que deja los datos inaccesibles.
do $$
declare v_fallos text;
begin
  select string_agg(c.relname, ', ')
    into v_fallos
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and c.relname not in ('webhook_events', 'alertas', 'schema_migrations')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if v_fallos is not null then
    raise exception 'C4: tablas con RLS y sin politicas: %', v_fallos;
  end if;
end $$;

-- C5 -------------------------------------------------------------------------
-- Clave foránea intra-tenant que no es compuesta.
-- La integridad referencial de Postgres SALTA RLS, igual que el rol de
-- servicio. Sin clave compuesta, una fila de la organización A puede apuntar a
-- una de la B, y RLS no lo detecta porque cada fila cumple su propia política.
do $$
declare v_fallos text;
begin
  select string_agg(con.conname, ', ')
    into v_fallos
    from pg_constraint con
    join pg_class hijo  on hijo.oid  = con.conrelid
    join pg_class padre on padre.oid = con.confrelid
    join pg_namespace n on n.oid = hijo.relnamespace
   where con.contype = 'f'
     and n.nspname = 'public'
     and array_length(con.conkey, 1) = 1
     and padre.relname <> 'organizations'
     and exists (select 1 from pg_attribute a
                  where a.attrelid = padre.oid and a.attname = 'organization_id'
                    and not a.attisdropped)
     and exists (select 1 from pg_attribute a
                  where a.attrelid = hijo.oid and a.attname = 'organization_id'
                    and not a.attisdropped);

  if v_fallos is not null then
    raise exception 'C5: claves foraneas intra-tenant sin componer: %', v_fallos;
  end if;
end $$;

-- C6 -------------------------------------------------------------------------
-- Ninguna función SECURITY DEFINER con search_path abierto.
-- Un search_path mutable en una función que corre con privilegios del creador
-- es una vía de escalada: basta crear un objeto que sombree al esperado.
do $$
declare v_fallos text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ')
    into v_fallos
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
     );

  if v_fallos is not null then
    raise exception 'C6: security definer sin search_path fijado: %', v_fallos;
  end if;
end $$;

-- C7 -------------------------------------------------------------------------
-- La media entrante de Meta nunca se almacena, solo su URL.
-- Es invariante del docs/03 y causa documentada de rechazo del App Review.
-- El CHECK que lo impone no puede desaparecer en una migración distraída.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'media_origen_coherente'
       and conrelid = 'public.media'::regclass
  ) then
    raise exception 'C7: falta media_origen_coherente, que impide cachear media entrante';
  end if;
end $$;

\echo 'Canarios: los siete pasan.'
