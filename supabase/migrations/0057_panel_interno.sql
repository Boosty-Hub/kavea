-- 0057_panel_interno.sql — lo que Boosty necesita ver de todos sus clientes.
-- Fuente: docs/fases/05b-fase-panel-interno.md, bloque A.
--
-- LA REGLA QUE GOBIERNA ESTE ARCHIVO: AQUÍ NO SE DEVUELVE CONTENIDO.
--
-- Ni un texto de mensaje, ni un nombre de contacto, ni una nota. Solo cuentas,
-- códigos de error y marcas de tiempo. El break-glass sigue siendo el ÚNICO
-- camino a lo que un cliente escribió, con motivo declarado y caducidad, y esa
-- protección no es la política de la base: es la fricción deliberada. Un panel
-- que enseñe «el último mensaje decía...» la vacía de sentido aunque cada
-- consulta sea técnicamente legal.
--
-- Todo va por funciones `security definer` con `es_staff()` comprobado a mano en
-- la primera línea, no por políticas nuevas sobre las tablas. Una política de
-- staff sobre `messages` sería una puerta permanente; una función que solo sabe
-- contar no puede convertirse en una puerta por descuido.

-- ---------------------------------------------------------------------------
-- A1 · Salud, un renglón por espacio, lo peor primero
-- ---------------------------------------------------------------------------
create or replace function public.panel_salud()
returns table (
  organization_id  uuid,
  nombre           text,
  slug             text,
  conexiones       bigint,
  sin_verificar    bigint,
  con_bloqueo      bigint,
  con_aviso        bigint,
  nunca_llego_nada bigint,
  envios_atascados bigint,
  peor_error       integer,
  espera_limite    integer,
  ultima_pasada    timestamptz,
  gravedad         integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  return query
  with conex as (
    select c.organization_id, c.id,
           count(v.*) filter (where v.resultado = 'fallo' and v.bloquea)     as bloqueos,
           count(v.*) filter (where v.resultado = 'fallo' and not v.bloquea) as avisos,
           -- V7 sin probar: el canal dice «conectado» y no ha entrado un solo
           -- mensaje. Es el fallo que más cuesta diagnosticar y el que nadie ve
           -- hasta que el cliente pregunta por qué su bandeja está vacía.
           count(v.*) filter (where v.codigo = 'V7' and v.resultado = 'sin_probar') as mudos,
           count(v.*)                                                        as hechas,
           max(v.verificado_en)                                              as ultima
      from public.meta_connections c
      left join public.verificaciones v on v.meta_connection_id = c.id
     group by c.organization_id, c.id
  ),
  cola as (
    select o.organization_id,
           count(*) as atascados,
           -- El código más informativo, no el más reciente: un 190 entre veinte
           -- errores de red es lo único que hay que atender.
           min(o.error_codigo) filter (where o.error_codigo = 190) as critico,
           max(o.error_codigo)                                     as cualquiera
      from public.outbound_messages o
     where o.estado in ('bloqueado', 'fallido')
     group by o.organization_id
  ),
  limites as (
    select r.organization_id, max(r.regain_access_min) as espera
      from public.rate_limit_usage r
     where r.observed_at > now() - interval '1 hour'
     group by r.organization_id
  )
  select
    g.id, g.nombre, g.slug,
    coalesce(count(x.id), 0),
    coalesce(count(*) filter (where x.hechas = 0), 0),
    coalesce(sum(x.bloqueos), 0),
    coalesce(sum(x.avisos), 0),
    coalesce(sum(x.mudos), 0),
    coalesce(max(q.atascados), 0),
    coalesce(max(q.critico), max(q.cualquiera)),
    max(l.espera),
    max(x.ultima),
    -- La gravedad se calcula AQUÍ y no en la pantalla. Ordenar «por lo peor» es
    -- una regla de negocio: si vive en el cliente, la siguiente pantalla que
    -- muestre lo mismo la ordenará distinto.
    (case when coalesce(sum(x.bloqueos), 0) > 0 then 400 else 0 end
     + case when coalesce(max(q.critico), 0) = 190 then 300 else 0 end
     + case when coalesce(sum(x.mudos), 0) > 0 then 200 else 0 end
     + case when coalesce(max(q.atascados), 0) > 0 then 100 else 0 end
     + case when max(l.espera) > 0 then 50 else 0 end
     + case when count(x.id) = 0 then 20 else 0 end
     + case when coalesce(sum(x.avisos), 0) > 0 then 10 else 0 end)::integer
  from public.organizations g
  left join conex   x on x.organization_id = g.id
  left join cola    q on q.organization_id = g.id
  left join limites l on l.organization_id = g.id
  group by g.id, g.nombre, g.slug
  order by 13 desc, g.nombre;
end $$;

-- ---------------------------------------------------------------------------
-- A1b · La ingesta es GLOBAL, no por cliente
-- ---------------------------------------------------------------------------
-- `webhook_events` no tiene `organization_id`: se escribe ANTES de saber de quién
-- es el evento. Meterlo en la tabla de salud por cliente habría exigido inventar
-- una atribución que no existe.
create or replace function public.panel_ingesta()
returns table (
  estado     text,
  eventos    bigint,
  mas_viejo  timestamptz,
  retraso_s  numeric
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  return query
  select w.estado, count(*), min(w.recibido_en),
         round(max(extract(epoch from (coalesce(w.procesado_en, now()) - w.recibido_en)))::numeric, 1)
    from public.webhook_events w
   where w.recibido_en > now() - interval '24 hours'
   group by w.estado
   order by w.estado;
end $$;

-- ---------------------------------------------------------------------------
-- A3 · Espacios, con lo que de verdad los distingue
-- ---------------------------------------------------------------------------
create or replace function public.panel_espacios()
returns table (
  organization_id uuid,
  nombre          text,
  slug            text,
  zona_horaria    text,
  creada_en       timestamptz,
  canales         bigint,
  personas        bigint,
  invitaciones    bigint,
  abiertas        bigint,
  ultimo_mensaje  timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  return query
  select
    g.id, g.nombre, g.slug, g.zona_horaria, g.created_at,
    (select count(*) from public.channels c where c.organization_id = g.id and c.activo),
    (select count(*) from public.organization_members m where m.organization_id = g.id),
    (select count(*) from public.invitaciones i
      where i.organization_id = g.id and i.aceptada_en is null and i.expira_en > now()),
    (select count(*) from public.tarjetas t
      where t.organization_id = g.id and t.cerrada_en is null),
    -- Cuándo, no qué. La marca de tiempo dice si el espacio está vivo; el texto
    -- diría de qué hablan, y eso es del cliente.
    (select max(m.meta_timestamp) from public.messages m where m.organization_id = g.id)
  from public.organizations g
  order by g.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- A4 · Quién ha mirado qué
-- ---------------------------------------------------------------------------
-- Una auditoría que nadie puede leer no audita. Los grants existen desde la 0
-- con motivo y caducidad, y hasta hoy solo se veían por SQL.
create or replace function public.panel_accesos()
returns table (
  id              uuid,
  organization_id uuid,
  organizacion    text,
  quien           text,
  motivo          text,
  created_at      timestamptz,
  expira_en       timestamptz,
  vigente         boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  return query
  select a.id, a.organization_id, g.nombre,
         coalesce(u.email, a.user_id::text),
         a.motivo, a.created_at, a.expira_en,
         a.expira_en > now()
    from public.access_grants a
    join public.organizations g on g.id = a.organization_id
    left join auth.users u on u.id = a.user_id
   order by a.created_at desc
   limit 200;
end $$;

-- Cortar un acceso antes de que caduque. Se hace acortando la caducidad y no
-- borrando la fila: borrar el grant borraría la prueba de que existió.
create or replace function public.revocar_acceso(p_grant uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_motivo text; v_user uuid := (select auth.uid());
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  update public.access_grants
     set expira_en = now()
   where id = p_grant and expira_en > now()
  returning organization_id, motivo into v_org, v_motivo;

  if v_org is null then
    raise exception 'Ese acceso no existe o ya había caducado.' using errcode = 'P0002';
  end if;

  -- Queda en el registro DEL CLIENTE, no solo en el nuestro: la transparencia
  -- del break-glass es hacia quien tiene los datos.
  perform private.registrar_actividad(
    v_org, 'breakglass.revocado', 'usuario', null, v_user,
    jsonb_build_object('motivo', v_motivo));
end $$;

-- ---------------------------------------------------------------------------
-- A5 · Uso por cliente y mes
-- ---------------------------------------------------------------------------
-- Lo que dice si un cliente se va a ir. El uso cae semanas antes de que nadie lo
-- diga en voz alta.
create or replace function public.panel_uso(p_meses integer default 6)
returns table (
  organization_id uuid,
  nombre          text,
  mes             date,
  entrantes       bigint,
  salientes       bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  return query
  select g.id, g.nombre,
         date_trunc('month', m.meta_timestamp)::date,
         count(*) filter (where m.direccion = 'inbound'),
         count(*) filter (where m.direccion = 'outbound')
    from public.messages m
    join public.organizations g on g.id = m.organization_id
   where m.meta_timestamp > date_trunc('month', now()) - (greatest(p_meses, 1) || ' months')::interval
   group by g.id, g.nombre, 3
   order by g.nombre, 3;
end $$;

revoke execute on function public.panel_salud()          from public, anon;
revoke execute on function public.panel_ingesta()        from public, anon;
revoke execute on function public.panel_espacios()       from public, anon;
revoke execute on function public.panel_accesos()        from public, anon;
revoke execute on function public.panel_uso(integer)     from public, anon;
revoke execute on function public.revocar_acceso(uuid)   from public, anon;

comment on function public.panel_salud() is
  'Salud de todos los espacios, lo peor primero. NO DEVUELVE CONTENIDO: solo '
  'cuentas, codigos y marcas de tiempo. El break-glass sigue siendo el unico '
  'camino a lo que un cliente escribio.';

-- Corregido en la misma tanda: una invitacion revocada no esta 'sin usar',
-- esta muerta. Contarla hacia creer que hay alguien pendiente de entrar.
-- Una invitacion revocada no esta "sin usar": esta muerta. Contarla hacia creer
-- que hay alguien pendiente de entrar.
create or replace function public.panel_espacios()
returns table (
  organization_id uuid, nombre text, slug text, zona_horaria text,
  creada_en timestamptz, canales bigint, personas bigint, invitaciones bigint,
  abiertas bigint, ultimo_mensaje timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  return query
  select
    g.id, g.nombre, g.slug, g.zona_horaria, g.created_at,
    (select count(*) from public.channels c where c.organization_id = g.id and c.activo),
    (select count(*) from public.organization_members m where m.organization_id = g.id),
    (select count(*) from public.invitaciones i
      where i.organization_id = g.id and i.aceptada_en is null
        and i.revocada_en is null and i.expira_en > now()),
    (select count(*) from public.tarjetas t
      where t.organization_id = g.id and t.cerrada_en is null),
    (select max(m.meta_timestamp) from public.messages m where m.organization_id = g.id)
  from public.organizations g
  order by g.created_at;
end $$;
revoke execute on function public.panel_espacios() from public, anon;

-- Corregido: `sum()` sobre bigint devuelve NUMERIC, no bigint, y la funcion no
-- casaba con su propio tipo de retorno. Postgres lo dice claro -"structure of
-- query does not match function result type"- pero el cargador de la pantalla se
-- tragaba el error y pintaba "no hay espacios todavia". Vacio y roto se veian
-- igual, que es la peor forma de fallar.
create or replace function public.panel_salud()
returns table (
  organization_id uuid, nombre text, slug text,
  conexiones bigint, sin_verificar bigint, con_bloqueo bigint, con_aviso bigint,
  nunca_llego_nada bigint, envios_atascados bigint,
  peor_error integer, espera_limite integer, ultima_pasada timestamptz, gravedad integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  return query
  with conex as (
    select c.organization_id, c.id,
           count(v.*) filter (where v.resultado = 'fallo' and v.bloquea)     as bloqueos,
           count(v.*) filter (where v.resultado = 'fallo' and not v.bloquea) as avisos,
           count(v.*) filter (where v.codigo = 'V7' and v.resultado = 'sin_probar') as mudos,
           count(v.*) as hechas, max(v.verificado_en) as ultima
      from public.meta_connections c
      left join public.verificaciones v on v.meta_connection_id = c.id
     group by c.organization_id, c.id
  ),
  cola as (
    select o.organization_id, count(*) as atascados,
           min(o.error_codigo) filter (where o.error_codigo = 190) as critico,
           max(o.error_codigo) as cualquiera
      from public.outbound_messages o
     where o.estado in ('bloqueado', 'fallido')
     group by o.organization_id
  ),
  limites as (
    select r.organization_id, max(r.regain_access_min) as espera
      from public.rate_limit_usage r
     where r.observed_at > now() - interval '1 hour'
     group by r.organization_id
  )
  select
    g.id, g.nombre, g.slug,
    count(x.id)::bigint,
    (count(*) filter (where x.hechas = 0))::bigint,
    coalesce(sum(x.bloqueos), 0)::bigint,
    coalesce(sum(x.avisos), 0)::bigint,
    coalesce(sum(x.mudos), 0)::bigint,
    coalesce(max(q.atascados), 0)::bigint,
    coalesce(max(q.critico), max(q.cualquiera))::integer,
    max(l.espera)::integer,
    max(x.ultima),
    (case when coalesce(sum(x.bloqueos), 0) > 0 then 400 else 0 end
     + case when coalesce(max(q.critico), 0) = 190 then 300 else 0 end
     + case when coalesce(sum(x.mudos), 0) > 0 then 200 else 0 end
     + case when coalesce(max(q.atascados), 0) > 0 then 100 else 0 end
     + case when coalesce(max(l.espera), 0) > 0 then 50 else 0 end
     + case when count(x.id) = 0 then 20 else 0 end
     + case when coalesce(sum(x.avisos), 0) > 0 then 10 else 0 end)::integer
  from public.organizations g
  left join conex   x on x.organization_id = g.id
  left join cola    q on q.organization_id = g.id
  left join limites l on l.organization_id = g.id
  group by g.id, g.nombre, g.slug
  order by 13 desc, g.nombre;
end $$;
revoke execute on function public.panel_salud() from public, anon;
