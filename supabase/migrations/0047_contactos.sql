-- 0047_contactos.sql — editar un contacto se registra, y se detectan los duplicados.
--
-- HUECO QUE CIERRA
--
-- El requisito es que en el sistema quede TODO lo que hace un usuario. Se
-- auditaron las 41 funciones públicas: las 30 que cambian algo registran. Pero
-- `contacts` se edita con un PATCH directo —`nombre`, `username` y
-- `profile_pic_url` están concedidas desde 0026 para la ficha— y eso no pasaba
-- por ninguna función. Cambiar el nombre de un contacto no dejaba rastro.
--
-- Se arregla con trigger y no obligando a un RPC, por la misma razón que el
-- estado de la tarjeta: depender de que cada ruta se acuerde de registrar es
-- garantizar que alguna no lo haga. El trigger lo ve pase lo que pase.

create or replace function private.actividad_de_contacto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_tarjeta uuid; v_cambios jsonb := '{}'::jsonb;
begin
  if new.nombre is distinct from old.nombre then
    v_cambios := v_cambios || jsonb_build_object('nombre', jsonb_build_array(old.nombre, new.nombre));
  end if;
  if new.username is distinct from old.username then
    v_cambios := v_cambios || jsonb_build_object('usuario', jsonb_build_array(old.username, new.username));
  end if;
  if v_cambios = '{}'::jsonb then return null; end if;

  -- Sale en la tarjeta viva de esa persona, que es donde se estaba mirando
  -- cuando se editó. Si no tiene ninguna abierta, va al registro de la
  -- organización.
  select id into v_tarjeta from public.tarjetas
   where contact_id = new.id and cerrada_en is null limit 1;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      new.organization_id, v_tarjeta, 'contacto.editado',
      case when v_user is null then 'sistema' else 'usuario' end, v_user, v_cambios);
  else
    perform private.registrar_actividad(
      new.organization_id, 'contacto.editado',
      case when v_user is null then 'sistema' else 'usuario' end, null, v_user, v_cambios);
  end if;
  return null;
end $$;

create trigger contacts_actividad
  after update on public.contacts
  for each row execute function private.actividad_de_contacto();

-- ---------------------------------------------------------------------------
-- La lista de contactos
-- ---------------------------------------------------------------------------
-- Con lo que hace falta para decidir a quién abrir: por dónde escribe, cuándo
-- fue la última vez y cuánto ha comprado. Sin eso, una lista de nombres no
-- sirve para nada.
create or replace function public.listar_contactos(
  p_org uuid, p_texto text default null, p_limite integer default 60, p_desplazar integer default 0
)
returns table (
  id uuid, nombre text, username text,
  canales text[], tarjetas integer, ultimo_mensaje timestamptz,
  comprado numeric, moneda text, fusionado boolean
)
language sql stable security invoker set search_path = public
as $$
  select c.id,
         c.nombre,
         c.username,
         coalesce((select array_agg(distinct i.canal::text order by i.canal::text)
                     from contact_identities i where i.contact_id = c.id), '{}'),
         (select count(*)::int from tarjetas t where t.contact_id = c.id),
         (select max(t.last_message_at) from tarjetas t where t.contact_id = c.id),
         coalesce((select sum(r.comprado) from resumen_comercial r where r.contacto_id = c.id), 0),
         (select r.moneda from resumen_comercial r where r.contacto_id = c.id limit 1),
         c.fusionado_en is not null
    from contacts c
   where c.organization_id = p_org
     and (p_texto is null or btrim(p_texto) = ''
          or c.nombre ilike '%' || btrim(p_texto) || '%'
          or c.username ilike '%' || btrim(p_texto) || '%'
          or exists (select 1 from contact_identities i
                      where i.contact_id = c.id
                        and (i.scoped_id ilike '%' || btrim(p_texto) || '%'
                             or i.etiqueta ilike '%' || btrim(p_texto) || '%')))
   order by (select max(t.last_message_at) from tarjetas t where t.contact_id = c.id)
              desc nulls last,
            c.created_at desc
   limit p_limite offset p_desplazar
$$;

revoke execute on function public.listar_contactos(uuid, text, integer, integer) from public, anon;
grant  execute on function public.listar_contactos(uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Duplicados: se PROPONEN, nunca se unen solos
-- ---------------------------------------------------------------------------
-- El documento 02 lo fija y sigue vigente: «no se fusiona por parecido de nombre
-- ni de nombre de usuario. Maria Gonzalez en Instagram y María González en
-- Messenger pueden ser dos personas distintas. Una fusión errónea mezcla dos
-- historiales de dos clientes reales, y en un producto que guarda conversaciones
-- comerciales eso es una incidencia de privacidad, no un error de datos».
--
-- Así que esto no une nada. Devuelve parejas con el motivo y la fuerza de la
-- señal, y un humano decide desde la interfaz con el botón que ya existe.
--
-- Lo que NO puede ocurrir: dos contactos con la misma identidad de canal. El
-- índice único de `contact_identities (organization_id, canal, scoped_id)` lo
-- impide desde 0006. Eso es prevención, y es mejor que cualquier detección.
create or replace function public.posibles_duplicados(p_org uuid, p_limite integer default 40)
returns table (
  a_id uuid, a_nombre text, b_id uuid, b_nombre text, motivo text, fuerza text
)
language sql stable security invoker set search_path = public
as $$
  -- FUERTE: el mismo teléfono o el mismo correo en un campo propio. Son señales
  -- deterministas: dos personas no comparten número.
  select distinct on (least(va.contacto_id, vb.contacto_id), greatest(va.contacto_id, vb.contacto_id))
         ca.id, coalesce(ca.nombre, ca.username, 'Sin nombre'),
         cb.id, coalesce(cb.nombre, cb.username, 'Sin nombre'),
         'Mismo ' || lower(cp.etiqueta) || ': ' || (va.valor #>> '{}'),
         'fuerte'
    from campo_valores va
    join campo_valores vb
      on vb.campo_id = va.campo_id
     and vb.contacto_id > va.contacto_id
     and vb.valor = va.valor
    join campos cp on cp.id = va.campo_id
    join contacts ca on ca.id = va.contacto_id
    join contacts cb on cb.id = vb.contacto_id
   where cp.organization_id = p_org
     and cp.tipo in ('telefono', 'correo')
     and va.contacto_id is not null
     and btrim(coalesce(va.valor #>> '{}', '')) <> ''
     and ca.fusionado_en is null and cb.fusionado_en is null

  union all

  -- DÉBIL: el mismo nombre, normalizado. Se ofrece para revisar, marcado como
  -- débil, porque «Maria Gonzalez» y «María González» pueden ser dos personas.
  select distinct on (ca.id, cb.id)
         ca.id, ca.nombre, cb.id, cb.nombre,
         'Mismo nombre',
         'debil'
    from contacts ca
    join contacts cb
      on cb.organization_id = ca.organization_id
     and cb.id > ca.id
     and lower(unaccent(btrim(cb.nombre))) = lower(unaccent(btrim(ca.nombre)))
   where ca.organization_id = p_org
     and ca.nombre is not null and btrim(ca.nombre) <> ''
     and ca.fusionado_en is null and cb.fusionado_en is null

  limit p_limite
$$;

revoke execute on function public.posibles_duplicados(uuid, integer) from public, anon;
grant  execute on function public.posibles_duplicados(uuid, integer) to authenticated;

comment on function public.posibles_duplicados(uuid, integer) is
  'PROPONE parejas de contactos que podrían ser la misma persona, con el motivo '
  'y la fuerza de la señal. No une nada: una fusión errónea muestra la '
  'conversación de un cliente bajo el nombre de otro, y eso es una incidencia de '
  'privacidad. Decide una persona.';

-- ---------------------------------------------------------------------------
-- El registro de la organización, paginado
-- ---------------------------------------------------------------------------
-- Todo lo que hace cualquiera, en un solo sitio: lo que cuelga de una
-- conversación, lo que cuelga de un asunto y lo que no cuelga de nada.
create or replace function public.registro_actividad(
  p_org uuid,
  p_actor uuid default null,
  p_tipo text default null,
  p_desde timestamptz default null,
  p_limite integer default 80,
  p_antes_de timestamptz default null
)
returns table (
  id bigint, tipo text, actor_tipo text, actor_nombre text, detalle jsonb,
  created_at timestamptz, tarjeta_id uuid, titulo text
)
language sql stable security invoker set search_path = public
as $$
  select a.id, a.tipo, a.actor_tipo, a.actor_nombre, a.detalle, a.created_at,
         coalesce(a.tarjeta_id, cv.tarjeta_id) as tarjeta_id,
         coalesce(t.titulo, ct.nombre, ct.username) as titulo
    from actividades a
    left join conversations cv on cv.id = a.conversation_id
    left join tarjetas t on t.id = coalesce(a.tarjeta_id, cv.tarjeta_id)
    left join contacts ct on ct.id = t.contact_id
   where a.organization_id = p_org
     and (p_actor is null or a.actor_user_id = p_actor)
     and (p_tipo is null or a.tipo like p_tipo || '%')
     and (p_desde is null or a.created_at >= p_desde)
     -- Paginación por CURSOR, no por offset: con offset, la página 20 hace que
     -- Postgres lea y descarte las 19 anteriores, y una actividad nueva
     -- desplaza todo y duplica filas entre páginas.
     and (p_antes_de is null or a.created_at < p_antes_de)
   order by a.created_at desc
   limit p_limite
$$;

revoke execute on function public.registro_actividad(uuid, uuid, text, timestamptz, integer, timestamptz)
  from public, anon;
grant  execute on function public.registro_actividad(uuid, uuid, text, timestamptz, integer, timestamptz)
  to authenticated;
