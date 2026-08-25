-- 0114_una_plantilla_se_ve_antes_de_mandarla.sql
--
-- Una plantilla de Meta se envía ENTERA y no se puede corregir después: sale tal
-- cual y se factura. Hasta ahora el único aviso era un `confirm()` del navegador
-- con el nombre técnico dentro —«Enviar pedido_devuelto»— que no enseñaba ni una
-- palabra de lo que la persona iba a recibir. Confirmar sin ver es firmar sin
-- leer.
--
-- Y cuando faltaba un dato, el error mandaba a la ficha a rellenarlo y a volver.
-- Dos pantallas y una búsqueda para un campo que se podía pedir ahí mismo.
--
-- Esto añade las dos piezas que faltaban en la base:
--
--   `vista_previa_plantilla`  el texto tal como llegará, y la lista de huecos
--                             con su etiqueta, su valor, si falta y si se puede
--                             escribir desde el diálogo.
--   `rellenar_variable`       escribe un dato DONDE VIVE de verdad, por su clave.
--                             El diálogo no sabe —ni debe— que el nombre está en
--                             `contacts` y el presupuesto en `campo_valores`.

-- ---------------------------------------------------------------------------
-- 1. Qué se puede escribir desde el diálogo, y qué no.
--
-- No es lo mismo «falta» que «se puede arreglar aquí». La etapa del embudo es una
-- lista cerrada y el nombre de quien escribe sale de la sesión: pedirlos en una
-- caja de texto produciría datos inventados. Se dice cuáles sí y de los otros se
-- explica dónde se tocan, que ya lo sabe `donde_se_rellena`.
-- ---------------------------------------------------------------------------
create or replace function private.se_rellena_desde_el_dialogo(p_clave text) returns boolean
language sql immutable set search_path = ''
as $fn$
  select p_clave = 'contacto.nombre'
      or p_clave = 'tarjeta.valor'
      or p_clave like 'campo.%';
$fn$;

-- ---------------------------------------------------------------------------
-- 2. La vista previa.
--
-- El texto se monta con los MISMOS valores que va a usar el envío: sale de
-- `parametros_de_plantilla`, que es la función que `encolar_plantilla` llama. Un
-- segundo cálculo «para la vista previa» sería una previsualización que puede
-- discrepar de lo que se manda, que es peor que no tenerla.
-- ---------------------------------------------------------------------------
create or replace function public.vista_previa_plantilla(p_plantilla uuid, p_tarjeta uuid)
returns table (texto text, huecos jsonb)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_cuerpo text; v_vars jsonb; v_porg uuid;
  v_p record;
  v_texto text;
  v_lista jsonb := '[]'::jsonb;
  v_i int; v_nombre text; v_clave text; v_valor text; v_falta boolean; v_marca text;
begin
  select t.organization_id into v_org from public.tarjetas t where t.id = p_tarjeta;
  if v_org is null then
    raise exception 'Esa ficha no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  select p.cuerpo, p.variables, p.organization_id into v_cuerpo, v_vars, v_porg
    from public.plantillas p where p.id = p_plantilla and p.archivado_en is null;
  if v_cuerpo is null or v_porg <> v_org then
    raise exception 'Esa plantilla no existe en este espacio.' using errcode = 'P0002';
  end if;

  select * into v_p from public.parametros_de_plantilla(p_plantilla, p_tarjeta);

  v_texto := v_cuerpo;
  for v_i in 1 .. coalesce(array_length(v_p.nombres, 1), 0) loop
    v_nombre := v_p.nombres[v_i];
    v_valor  := v_p.valores[v_i];

    -- La clave del dato: con nombre sale del propio hueco; posicional, de la
    -- lista de variables que se guardó al vincular la plantilla.
    v_clave := case
      when v_p.nombrada then private.clave_desde_nombre_meta(v_nombre)
      else v_vars ->> (v_i - 1)
    end;

    v_marca := '{{' || v_nombre || '}}';
    v_falta := v_valor is null or btrim(v_valor) = '';

    -- En el texto, un hueco vacío se marca en vez de desaparecer: un mensaje con
    -- un agujero invisible se lee como si estuviera completo.
    v_texto := replace(v_texto, v_marca,
      case when v_falta then '[falta]' else v_valor end);

    v_lista := v_lista || jsonb_build_object(
      'marca',      v_marca,
      'clave',      v_clave,
      'etiqueta',   coalesce(
                      (select v.etiqueta from public.variables_disponibles(v_org) v
                        where v.clave = v_clave),
                      coalesce(v_clave, v_nombre)),
      'valor',      case when v_falta then null else v_valor end,
      'falta',      v_falta,
      'rellenable', v_clave is not null and private.se_rellena_desde_el_dialogo(v_clave),
      'donde',      private.donde_se_rellena(coalesce(v_clave, '')));
  end loop;

  return query select v_texto, v_lista;
end $fn$;

revoke execute on function public.vista_previa_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.vista_previa_plantilla(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Escribir un dato por su clave, donde de verdad vive.
--
-- El diálogo pide «Nombre de la persona» y «Presupuesto estimado» en la misma
-- lista, y no tiene por qué saber que uno es una columna de `contacts` y el otro
-- una fila de `campo_valores` con su tipo y su ámbito. Esa correspondencia vive
-- aquí, en el mismo sitio donde está escrita la lista de variables.
--
-- Reutiliza las funciones que ya escriben cada cosa —`renombrar_contacto`,
-- `fijar_valor`, `guardar_campo`— en vez de escribir las tablas a mano: son las
-- que registran la actividad, y una segunda vía de escritura sin actividad es un
-- cambio que no aparece en el hilo.
-- ---------------------------------------------------------------------------
create or replace function public.rellenar_variable(p_tarjeta uuid, p_clave text, p_valor text)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_contacto uuid; v_moneda text;
  v_user uuid := (select auth.uid());
  v_campo uuid; v_tipo text; v_ambito text; v_destino uuid;
  v_limpio text := nullif(btrim(coalesce(p_valor, '')), '');
  v_num numeric;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select t.organization_id, t.contact_id, t.moneda
    into v_org, v_contacto, v_moneda
    from public.tarjetas t where t.id = p_tarjeta;
  if v_org is null then
    raise exception 'Esa ficha no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if not private.se_rellena_desde_el_dialogo(p_clave) then
    raise exception 'El dato «%» no se escribe desde aquí: %', p_clave,
      coalesce(private.donde_se_rellena(p_clave), 'no es un dato editable')
      using errcode = '22023';
  end if;
  if v_limpio is null then
    raise exception 'Ese dato no puede quedarse vacío.' using errcode = '22023';
  end if;

  if p_clave = 'contacto.nombre' then
    if v_contacto is null then
      raise exception 'Esta ficha no tiene persona asociada.' using errcode = 'P0002';
    end if;
    perform public.renombrar_contacto(v_contacto, v_limpio);
    return;
  end if;

  if p_clave = 'tarjeta.valor' then
    -- Se acepta lo que la gente escribe: «2.400», «2,400», «2400 USD». Lo que no
    -- se acepta es guardar cero porque el texto no se pudo leer.
    begin
      v_num := replace(replace(regexp_replace(v_limpio, '[^0-9.,-]', '', 'g'), '.', ''), ',', '.')::numeric;
    exception when others then
      raise exception 'No entiendo «%» como una cantidad.', v_limpio using errcode = '22023';
    end;
    perform public.fijar_valor(p_tarjeta, v_num, v_moneda);
    return;
  end if;

  -- campo.X — el ámbito decide si se guarda en la ficha del asunto o en la
  -- persona, que es la misma regla que sigue la ficha al pintarlos.
  select c.id, c.tipo, c.ambito into v_campo, v_tipo, v_ambito
    from public.campos c
   where c.organization_id = v_org
     and c.clave = substring(p_clave from 7)
     and c.archivado_en is null;
  if v_campo is null then
    raise exception 'No existe el campo «%» en este espacio.', substring(p_clave from 7)
      using errcode = 'P0002';
  end if;

  v_destino := case when v_ambito = 'contacto' then v_contacto else p_tarjeta end;
  if v_destino is null then
    raise exception 'Esta ficha no tiene persona asociada.' using errcode = 'P0002';
  end if;

  perform public.guardar_campo(
    v_campo, v_destino,
    case
      when v_tipo in ('numero', 'moneda') then
        to_jsonb(replace(replace(regexp_replace(v_limpio, '[^0-9.,-]', '', 'g'), '.', ''), ',', '.')::numeric)
      when v_tipo = 'booleano' then to_jsonb(v_limpio in ('true', 'si', 'sí', '1'))
      else to_jsonb(v_limpio)
    end);
end $fn$;

revoke execute on function public.rellenar_variable(uuid, text, text) from public, anon;
grant  execute on function public.rellenar_variable(uuid, text, text) to authenticated;
