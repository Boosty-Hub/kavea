-- 0043_importe_sin_ambiguedad.sql — cómo se escribe un importe dentro de un mensaje.
--
-- `to_char(valor, 'FM999G999G990D00')` usa los separadores de `lc_numeric` del
-- servidor, que aquí da «2,400.00». Y ahí está el problema: **no hay un formato
-- correcto para los tres mercados de Boosty**.
--
--   España y Venezuela   2.400,50   la coma es el decimal
--   México               2,400.50   la coma es el millar
--
-- Un cliente venezolano que lee «2,400.00» puede entender dos con cuarenta. En
-- un presupuesto eso no es una errata, es una discusión.
--
-- Se quita el separador de millares. «2400» no es tan cómodo de leer como
-- «2.400», pero significa lo mismo en los tres países, y una cifra que se lee
-- un poco peor es infinitamente mejor que una que se lee mal.
--
-- Y se quitan los decimales cuando son cero: «2400» y no «2400.00». El «.00»
-- es ruido en el 90 % de los importes.

create or replace function public.renderizar_plantilla(p_plantilla uuid, p_tarjeta uuid)
returns table (texto text, faltan text[])
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_cuerpo text; v_tipo text; v_vars jsonb;
  v_texto text; v_faltan text[] := '{}';
  v_valores jsonb;
  v_clave text; v_valor text; v_i integer;
begin
  select p.cuerpo, p.tipo, p.variables
    into v_cuerpo, v_tipo, v_vars
    from public.plantillas p where p.id = p_plantilla;
  if v_cuerpo is null then
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

  if v_valores is null then
    return query select v_cuerpo, array['tarjeta_inexistente']::text[]; return;
  end if;

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
      select distinct m[1] from regexp_matches(v_cuerpo, '\{\{\s*([a-z0-9_.]+)\s*\}\}', 'g') as m
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

comment on function public.renderizar_plantilla(uuid, uuid) is
  'Resuelve una plantilla contra una tarjeta y devuelve el texto MÁS las '
  'variables que no se pudieron rellenar. No se las come en silencio: un '
  '"Hola , ¿cómo estás?" es peor que no mandar nada, y sin la lista nadie se '
  'entera antes de darle a enviar.';
