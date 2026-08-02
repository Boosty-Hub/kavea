-- 0044_renderizar_definer.sql — resolver una plantilla necesita leer auth.users.
--
-- EL FALLO
--
-- `renderizar_plantilla` se escribió `security invoker` por prudencia: así RLS
-- filtra las tarjetas y los campos con la sesión de quien llama, y no hay que
-- comprobar nada a mano. Correcto salvo por un detalle: la variable
-- `agente.nombre` sale de `auth.users`, y `authenticated` NO tiene lectura
-- sobre esa tabla.
--
-- Resultado en vivo: 403 con «permission denied for table users», y el
-- compositor insertaba una cadena vacía. Sin error visible para el operador:
-- elegía una plantilla y no pasaba nada.
--
-- LO QUE CAMBIA, Y LO QUE ESO OBLIGA
--
-- Pasa a `security definer`, y con eso deja de aplicarse la RLS de `tarjetas`.
-- Así que la pertenencia se comprueba AQUÍ, explícitamente, contra la
-- organización de la tarjeta. Sin esa línea, cualquiera con sesión podría
-- resolver una plantilla contra la tarjeta de otro cliente y leer de vuelta el
-- nombre de su contacto, su importe y sus campos: una fuga de datos con forma
-- de mensaje de cortesía.
--
-- Regla general que deja esto: en cuanto una función necesita `auth.users`, o
-- es `security definer` con su comprobación escrita a mano, o no funciona.

create or replace function public.renderizar_plantilla(p_plantilla uuid, p_tarjeta uuid)
returns table (texto text, faltan text[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cuerpo text; v_tipo text; v_vars jsonb; v_org_p uuid; v_org_t uuid;
  v_texto text; v_faltan text[] := '{}';
  v_valores jsonb;
  v_clave text; v_valor text; v_i integer;
begin
  select t.organization_id into v_org_t from public.tarjetas t where t.id = p_tarjeta;
  if v_org_t is null then
    return query select ''::text, array['tarjeta_inexistente']::text[]; return;
  end if;

  -- LA LÍNEA QUE SUSTITUYE A LA RLS QUE `definer` DESACTIVA.
  if not public.es_miembro(v_org_t) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  select p.cuerpo, p.tipo, p.variables, p.organization_id
    into v_cuerpo, v_tipo, v_vars, v_org_p
    from public.plantillas p where p.id = p_plantilla;

  -- Y la plantilla tiene que ser de la MISMA organización que la tarjeta: si no,
  -- se podría usar una plantilla ajena como sonda contra los datos propios, o al
  -- revés.
  if v_cuerpo is null or v_org_p <> v_org_t then
    return query select ''::text, array['plantilla_inexistente']::text[]; return;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'contacto.nombre',  ct.nombre,
    'contacto.usuario', ct.username,
    'tarjeta.titulo',   t.titulo,
    'tarjeta.valor',    btrim(to_char(
                          t.valor,
                          case when t.valor = trunc(t.valor)
                               then 'FM999999999990'
                               else 'FM999999999990.00' end)),
    'tarjeta.moneda',   t.moneda,
    'tarjeta.etapa',    e.nombre,
    'agente.nombre',    (select coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email,'@',1))
                           from auth.users u where u.id = (select auth.uid())),
    'org.nombre',       o.nombre
  ) || coalesce((
    select jsonb_object_agg('campo.' || c.clave, cv.valor #>> '{}')
      from public.campo_valores cv
      join public.campos c on c.id = cv.campo_id
     where (cv.tarjeta_id = t.id or cv.contacto_id = t.contact_id)
       and cv.valor is not null
  ), '{}'::jsonb))
  into v_valores
  from public.tarjetas t
  join public.organizations o on o.id = t.organization_id
  left join public.contacts ct on ct.id = t.contact_id
  left join public.etapas e on e.id = t.etapa_id
  where t.id = p_tarjeta;

  v_texto := v_cuerpo;

  if v_tipo = 'whatsapp' then
    for v_i in 1 .. coalesce(jsonb_array_length(v_vars), 0) loop
      v_clave := v_vars ->> (v_i - 1);
      v_valor := v_valores ->> v_clave;
      if v_valor is null or btrim(v_valor) = '' then
        v_faltan := v_faltan || v_clave;
        v_valor := '{{' || v_i || '}}';
      end if;
      v_texto := replace(v_texto, '{{' || v_i || '}}', v_valor);
    end loop;
  else
    for v_clave in
      select distinct m[1]
        from regexp_matches(v_cuerpo, '\{\{\s*([a-z0-9_.]+)\s*\}\}', 'g') as m
    loop
      v_valor := v_valores ->> v_clave;
      if v_valor is null or btrim(v_valor) = '' then
        v_faltan := v_faltan || v_clave;
      else
        v_texto := regexp_replace(v_texto, '\{\{\s*' || v_clave || '\s*\}\}', v_valor, 'g');
      end if;
    end loop;
  end if;

  return query select v_texto, v_faltan;
end $$;

revoke execute on function public.renderizar_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.renderizar_plantilla(uuid, uuid) to authenticated;

comment on function public.renderizar_plantilla(uuid, uuid) is
  'security DEFINER porque necesita auth.users para la variable agente.nombre. '
  'Eso desactiva la RLS de tarjetas, así que la pertenencia se comprueba a mano '
  'en la primera línea del cuerpo: no quitar esa comprobación.';
