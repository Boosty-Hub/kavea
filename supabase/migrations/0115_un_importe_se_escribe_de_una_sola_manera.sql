-- 0115_un_importe_se_escribe_de_una_sola_manera.sql
--
-- El mismo dato salía distinto según quién lo pintara. `tarjeta.valor` vale 2000
-- y las plantillas de Meta lo escribían «2,000.00» —`FM999G999G990D00`, dos
-- decimales siempre— mientras las internas lo escribían «2000»
-- —`FM999999999990` cuando es entero—. Dos formateadores para una columna, y el
-- cliente recibía uno u otro según por dónde saliera el mensaje.
--
-- Se unifica en `private.importe`: separador de miles siempre, y decimales SOLO
-- cuando los hay. «2,000» y «2,400.50». Un importe con «.00» pegado detrás en un
-- aviso de pedido se lee como un precio de catálogo, no como una cantidad.
--
-- Las dos funciones se reaplican tal cual estaban, con la expresión cambiada y
-- nada más: se generaron desde `pg_get_functiondef` en vez de transcribirlas, que
-- es como se copia un cuerpo de ochenta líneas sin cambiarle una coma sin querer.

create or replace function private.importe(p_valor numeric) returns text
language sql immutable set search_path = ''
as $fn$
  select case
    when p_valor is null then null
    when p_valor = trunc(p_valor) then to_char(p_valor, 'FM999G999G999G990')
    else to_char(p_valor, 'FM999G999G999G990D00')
  end;
$fn$;

CREATE OR REPLACE FUNCTION private.valores_de_tarjeta(p_tarjeta uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'contacto.nombre',  ct.nombre,
    'contacto.usuario', ct.username,
    'tarjeta.titulo',   t.titulo,
    'tarjeta.valor',    private.importe(t.valor),
    'tarjeta.moneda',   t.moneda,
    'tarjeta.etapa',    e.nombre,
    'agente.nombre',    (select coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email,'@',1))
                           from auth.users u where u.id = p_actor),
    'org.nombre',       o.nombre
  ) || coalesce((
    select jsonb_object_agg('campo.' || c.clave, cv.valor #>> '{}')
      from public.campo_valores cv
      join public.campos c on c.id = cv.campo_id
     where (cv.tarjeta_id = t.id or cv.contacto_id = t.contact_id)
       and cv.valor is not null
  ), '{}'::jsonb))
  from public.tarjetas t
  join public.organizations o on o.id = t.organization_id
  left join public.contacts ct on ct.id = t.contact_id
  left join public.etapas e on e.id = t.etapa_id
  where t.id = p_tarjeta;
$function$;

CREATE OR REPLACE FUNCTION public.renderizar_plantilla(p_plantilla uuid, p_tarjeta uuid)
 RETURNS TABLE(texto text, faltan text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'tarjeta.valor',    private.importe(t.valor),
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
end $function$;
