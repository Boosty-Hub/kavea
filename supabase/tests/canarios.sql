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
-- «RLS con cero políticas» es la configuración MÁS restrictiva que existe: no
-- deniega por descuido, deniega del todo. El canario no está para prohibirla,
-- está para que sea siempre una decisión y nunca un olvido. De ahí la lista, y
-- de ahí que cada entrada lleve escrito su motivo.
--
--   webhook_events, alertas — una fila puede ser ANTERIOR al enrutado y no tener
--     tenant, así que no puede quedar bajo RLS de organización.
--   schema_migrations       — control del aplicador, sin dueño.
--   rate_limit_usage        — «diagnóstico interno, ni siquiera los miembros lo
--     leen», 0034 línea 103. Lo escribe el despachador con el rol de servicio y
--     lo lee panel_uso, que es definer.
--   solicitudes             — 0060 lo razona entero: entra por pedir_demo(), que
--     es el único RPC con permiso para anon, y sale por panel_solicitudes().
--   correos, correo_adjuntos — 0061, mismo patrón. Una bandeja de soporte tiene
--     todo lo que la gente escribe cuando algo le va mal.
--
-- OJO AL LEER ESTE FICHERO: se ejecuta con ON_ERROR_STOP=1, así que **los
-- canarios se tapan unos a otros**. Este C4 llevaba días fallando por
-- rate_limit_usage y solicitudes sin que se viera, porque C2 abortaba antes.
-- Arreglar un canario destapa el siguiente: no es una regresión nueva.
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
     and c.relname not in (
       'webhook_events', 'alertas', 'schema_migrations',
       'rate_limit_usage', 'solicitudes', 'correos', 'correo_adjuntos'
     )
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

-- C8 -------------------------------------------------------------------------
-- Ninguna función SECURITY DEFINER de `public` ejecutable por PUBLIC, salvo las
-- cinco de la lista.
--
-- POR QUÉ EXISTE. Postgres concede EXECUTE a `public` en toda función nueva, y
-- `anon` hereda de `public`. Siete migraciones escribieron
-- `revoke all on function ... from anon` creyendo que cerraban la puerta: no
-- quita nada, porque el permiso no venía de `anon`. El 23-ago-2026 eso dejaba
-- `credencial_whatsapp_de_conexion` devolviendo el blob cifrado del token de
-- WhatsApp a cualquiera con la clave publicable —la que va en el bundle del
-- navegador— y `guardar_credencial_whatsapp` aceptando escrituras sin
-- autenticar. Cerrado en la 0084. Lo correcto es `revoke ... from public, anon`.
--
-- DOS FORMAS DE TENER EL PERMISO, Y LA SEGUNDA ES LA TRAMPOSA. `proacl` lista
-- las concesiones explícitas, pero una función a la que NADIE le tocó los
-- permisos tiene `proacl` NULL, y eso no significa «sin permisos»: significa
-- que rigen los de por defecto, o sea PUBLIC. La primera versión de este
-- canario, escrita el mismo 23-ago, filtraba por `proacl is not null` y por eso
-- se habría saltado el caso más probable de todos: una migración que crea una
-- función SECURITY DEFINER nueva y no revoca nada. Se comprobó contra
-- producción antes de corregirlo: 19 funciones así, todas en `private`.
--
-- SOLO `public`, Y NO ES DEJADEZ. PostgREST únicamente resuelve funciones del
-- esquema expuesto: una llamada a algo de `private` devuelve PGRST202 incluso
-- con el rol de servicio, comprobado el 23-ago. `public` es la superficie que
-- se alcanza por HTTP, que es de lo que trata este canario. Si algún día se
-- expone otro esquema, hay que añadirlo AQUÍ el mismo día.
--
-- LAS EXCEPCIONES. Cuatro corren DENTRO de las políticas de RLS, con el rol de
-- quien consulta: quitarles `public` haría que una consulta de `anon` fallara
-- con «permission denied» en vez de devolver cero filas. Solo devuelven
-- booleanos o ids sobre el `auth.uid()` de quien llama. La quinta,
-- `rls_auto_enable`, devuelve `event_trigger`, y Postgres no deja invocar
-- directamente una función de ese tipo: no hay forma de llamarla.
--
-- Si añades una función a esta lista, que sea porque no lee ni escribe datos de
-- un tenant, no porque el canario molesta.
do $$
declare v_fallos text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into v_fallos
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     -- Las de las extensiones no las gobernamos nosotros.
     and not exists (
       select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
     )
     and (
       -- Sin ACL: rigen los permisos por defecto, y el de por defecto es PUBLIC.
       p.proacl is null
       -- Con ACL: PUBLIC aparece como concesión de grantee 0.
       or exists (
         select 1 from aclexplode(p.proacl) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
       )
     )
     and p.proname not in (
       'es_miembro', 'es_owner', 'es_staff', 'org_ids_con_grant', 'rls_auto_enable'
     );

  if v_fallos is not null then
    raise exception 'C8: security definer de public ejecutable por PUBLIC (revoca de public, no solo de anon): %', v_fallos;
  end if;
end $$;

-- C9 -------------------------------------------------------------------------
-- Ni `anon` ni `authenticated` pueden TRUNCATE en ninguna tabla de public.
--
-- RLS NO SE APLICA A TRUNCATE. Es una excepción explícita de Postgres: las
-- políticas filtran filas, y TRUNCATE no mira filas. Los otros siete
-- privilegios que la plataforma concede por defecto —`arwdDxtm`— quedan
-- contenidos por RLS; este no lo contiene nada.
--
-- No es alcanzable por PostgREST, que no tiene verbo TRUNCATE. Lo que este
-- canario protege es el futuro: una función SQL a la que se le olvide
-- `security definer` corre con los privilegios de quien llama, y si trunca
-- algo, RLS no tiene nada que decir.
--
-- SE COMPRUEBAN LAS DOS MITADES, porque arreglar solo una dura hasta el
-- siguiente `create table`: los permisos de las tablas que hay, y el
-- `alter default privileges` que decide los de las que vengan. La 0085 hizo
-- las dos; esto vigila que sigan hechas.
--
-- El default de `supabase_admin` conserva la D y no se toca: es de la
-- plataforma y no crea tablas de esta aplicación. Las migraciones se aplican
-- como `postgres`.
do $$
declare v_tablas text; v_default text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_tablas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'TRUNCATE')
       or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));

  if v_tablas is not null then
    raise exception 'C9: anon o authenticated pueden TRUNCATE (RLS no lo gobierna): %', v_tablas;
  end if;

  select d.defaclacl::text into v_default
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'r'
     and pg_get_userbyid(d.defaclrole) = 'postgres';

  -- `D` es TRUNCATE en la notacion de aclitem. Si vuelve a aparecer para anon
  -- o authenticated, la proxima tabla nacera con el privilegio otra vez.
  if v_default is null
     or v_default ~ 'anon=[a-zA-Z]*D'
     or v_default ~ 'authenticated=[a-zA-Z]*D' then
    raise exception 'C9: el default privileges de postgres en public vuelve a dar TRUNCATE (o desaparecio): %',
      coalesce(v_default, 'sin fila');
  end if;
end $$;

\echo 'Canarios: los nueve pasan.'
