-- 0042_plantillas.sql — plantillas de mensaje con variables.
--
-- DOS TIPOS QUE NO SE PARECEN EN NADA, y por eso están en la misma tabla con
-- columnas distintas en vez de en dos tablas o, peor, fingiendo que son iguales:
--
--   INTERNA   Respuesta rápida que escribe el operador. Variables CON NOMBRE
--             —{{contacto.nombre}}—, se edita cuando quiera, no la aprueba
--             nadie, y se puede cambiar el texto sin pedir permiso.
--
--   WHATSAPP  La aprueba Meta antes de poder usarse. Marcadores POSICIONALES
--             —{{1}}, {{2}}—, con categoría e idioma, y cambiar una coma del
--             texto obliga a volver a pasar por aprobación.
--
-- Lo posicional no es un capricho de diseño: es como funciona la API de
-- plantillas de WhatsApp. Fingir que admite nombres y traducir por detrás sería
-- inventarse la interfaz de un sistema que no controlamos, y el documento 03
-- marca WhatsApp como SIN INVESTIGAR. Aquí se modela el ciclo de vida; no se
-- envía nada a Meta.

create table public.plantillas (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  tipo    text not null check (tipo in ('interna', 'whatsapp')),
  nombre  text not null check (length(btrim(nombre)) between 1 and 80),

  -- Lo que se escribe. En las internas lleva {{ambito.clave}}; en las de
  -- WhatsApp, {{1}}, {{2}}…
  cuerpo  text not null check (length(btrim(cuerpo)) between 1 and 4000),

  -- Para escribirla rápido en el compositor: "/precio".
  atajo  text check (atajo ~ '^[a-z][a-z0-9_-]{1,24}$'),

  -- ------------------------------------------------------------------
  -- Solo WhatsApp
  -- ------------------------------------------------------------------
  -- Qué variable va en cada posición: ["contacto.nombre","tarjeta.valor"].
  -- El índice del array es la posición menos uno.
  variables  jsonb not null default '[]'::jsonb,

  -- Las tres categorías que documenta Meta. Sin `check` cerrado sobre valores
  -- que no hemos verificado en la consola: el documento 03 marca WhatsApp como
  -- sin investigar y una restricción sobre un enum no confirmado convierte una
  -- duda documental en una migración.
  categoria  text,
  idioma     text,

  estado  text not null default 'borrador'
    check (estado in ('borrador', 'enviada', 'aprobada', 'rechazada', 'pausada', 'inhabilitada')),

  -- Lo que devuelva Meta cuando exista el envío. Hoy se rellenan a mano desde
  -- la interfaz para llevar el registro de lo que ya está aprobado allí.
  meta_nombre      text,
  meta_id          text,
  motivo_rechazo   text,
  revisada_en      timestamptz,

  archivado_en  timestamptz,
  creada_por    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint plantillas_org_id_uniq unique (organization_id, id),
  -- Una plantilla interna no tiene estado de aprobación: nace usable.
  constraint plantillas_estado_coherente check (
    tipo = 'whatsapp' or estado = 'borrador'),
  constraint plantillas_whatsapp_completa check (
    tipo <> 'whatsapp' or (categoria is not null and idioma is not null))
);

create unique index plantillas_atajo_unico
  on public.plantillas (organization_id, atajo)
  where atajo is not null and archivado_en is null;

create index plantillas_org_idx
  on public.plantillas (organization_id, tipo, nombre)
  where archivado_en is null;

create trigger plantillas_touch before update on public.plantillas
  for each row execute function public.tocar_updated_at();

alter table public.plantillas enable row level security;
alter table public.plantillas force  row level security;

create policy plantillas_select on public.plantillas
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin escritura directa: por RPC, como todo lo que deja actividad.

-- ---------------------------------------------------------------------------
-- Qué variables existen
-- ---------------------------------------------------------------------------
-- Se calculan, no se listan a mano: los campos propios los define cada
-- organización y una lista fija se quedaría desfasada el primer día. La interfaz
-- pinta esto para que nadie tenga que adivinar cómo se escribe una variable.
create or replace function public.variables_disponibles(p_org uuid)
returns table (clave text, etiqueta text, ejemplo text)
language sql stable security invoker set search_path = public
as $$
  select * from (values
    ('contacto.nombre',   'Nombre de la persona',       'María'),
    ('contacto.usuario',  'Usuario de la red',          'maria.gz'),
    ('tarjeta.titulo',    'Título del asunto',          'Pedido de marzo'),
    ('tarjeta.valor',     'Valor del asunto',           '1.200'),
    ('tarjeta.moneda',    'Moneda',                     'USD'),
    ('tarjeta.etapa',     'Etapa del embudo',           'Propuesta enviada'),
    ('agente.nombre',     'Quien escribe',              'Gabriel'),
    ('org.nombre',        'Nombre del negocio',         'Boosty Digital')
  ) as fijas(clave, etiqueta, ejemplo)
  union all
  select 'campo.' || c.clave, c.etiqueta,
         case c.tipo when 'moneda' then '1.200' when 'fecha' then '2026-03-14' else 'texto' end
    from public.campos c
   where c.organization_id = p_org and c.archivado_en is null
   order by 1
$$;

revoke execute on function public.variables_disponibles(uuid) from public, anon;
grant  execute on function public.variables_disponibles(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resolver una plantilla contra una tarjeta
-- ---------------------------------------------------------------------------
-- Devuelve el texto Y las variables que no se pudieron resolver.
--
-- POR QUÉ DEVUELVE LAS QUE FALTAN Y NO SE LAS COME EN SILENCIO
--
-- Un {{contacto.nombre}} sin resolver que llega al cliente es peor que no
-- mandar nada. Y sustituirlo por una cadena vacía produce «Hola , ¿cómo
-- estás?», que es igual de malo y encima no se nota al revisar. El compositor
-- avisa antes de enviar y quien escribe decide.
create or replace function public.renderizar_plantilla(p_plantilla uuid, p_tarjeta uuid)
returns table (texto text, faltan text[])
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_cuerpo text; v_tipo text; v_vars jsonb; v_org uuid;
  v_texto text; v_faltan text[] := '{}';
  v_valores jsonb;
  v_clave text; v_valor text; v_i integer;
begin
  select p.cuerpo, p.tipo, p.variables, p.organization_id
    into v_cuerpo, v_tipo, v_vars, v_org
    from public.plantillas p where p.id = p_plantilla;
  if v_cuerpo is null then
    return query select ''::text, array['plantilla_inexistente']::text[]; return;
  end if;

  -- Todo lo resoluble de esta tarjeta, de una vez.
  select jsonb_strip_nulls(jsonb_build_object(
    'contacto.nombre',  ct.nombre,
    'contacto.usuario', ct.username,
    'tarjeta.titulo',   t.titulo,
    'tarjeta.valor',    to_char(t.valor, 'FM999G999G990D00'),
    'tarjeta.moneda',   t.moneda,
    'tarjeta.etapa',    e.nombre,
    'agente.nombre',    (select coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email,'@',1))
                           from auth.users u where u.id = (select auth.uid())),
    'org.nombre',       o.nombre
  ) || coalesce((
    -- Los campos propios, con su clave prefijada.
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
    -- Posicionales: {{1}} toma la variable del primer elemento del array.
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
    -- Con nombre: se recorre lo que la plantilla pide, no lo que existe.
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

revoke execute on function public.renderizar_plantilla(uuid, uuid) from public, anon;
grant  execute on function public.renderizar_plantilla(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar y archivar
-- ---------------------------------------------------------------------------
create or replace function public.guardar_plantilla(
  p_org        uuid,
  p_nombre     text,
  p_cuerpo     text,
  p_tipo       text default 'interna',
  p_atajo      text default null,
  p_variables  jsonb default '[]'::jsonb,
  p_categoria  text default null,
  p_idioma     text default null,
  p_plantilla  uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_antes text; v_estado text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.puede(p_org, 'configurar') then
    raise exception 'Solo quien administra la organización gestiona plantillas.' using errcode = '42501';
  end if;

  if p_plantilla is null then
    insert into public.plantillas
      (organization_id, tipo, nombre, cuerpo, atajo, variables, categoria, idioma, creada_por)
    values
      (p_org, p_tipo, btrim(p_nombre), btrim(p_cuerpo),
       nullif(btrim(coalesce(p_atajo,'')), ''), coalesce(p_variables,'[]'::jsonb),
       nullif(btrim(coalesce(p_categoria,'')), ''), nullif(btrim(coalesce(p_idioma,'')), ''), v_user)
    returning id into v_id;

    perform private.registrar_actividad(
      p_org, 'plantilla.creada', 'usuario', null, v_user,
      jsonb_build_object('nombre', btrim(p_nombre), 'tipo', p_tipo));
  else
    select cuerpo, estado into v_antes, v_estado
      from public.plantillas where id = p_plantilla and organization_id = p_org;
    if v_antes is null then raise exception 'Esa plantilla no existe.' using errcode = 'P0002'; end if;

    -- Cambiar el texto de una plantilla YA APROBADA por Meta la invalida allí.
    -- Se vuelve a borrador y se dice, en vez de dejar creer que sigue aprobada
    -- una plantilla que ya no coincide con la que Meta revisó.
    if p_tipo = 'whatsapp' and v_estado = 'aprobada' and btrim(p_cuerpo) <> v_antes then
      v_estado := 'borrador';
      perform private.registrar_actividad(
        p_org, 'plantilla.invalidada', 'usuario', null, v_user,
        jsonb_build_object('nombre', btrim(p_nombre)));
    end if;

    update public.plantillas
       set nombre = btrim(p_nombre), cuerpo = btrim(p_cuerpo),
           atajo = nullif(btrim(coalesce(p_atajo,'')), ''),
           variables = coalesce(p_variables,'[]'::jsonb),
           categoria = nullif(btrim(coalesce(p_categoria,'')), ''),
           idioma = nullif(btrim(coalesce(p_idioma,'')), ''),
           estado = v_estado
     where id = p_plantilla
    returning id into v_id;

    perform private.registrar_actividad(
      p_org, 'plantilla.editada', 'usuario', null, v_user,
      jsonb_build_object('nombre', btrim(p_nombre)));
  end if;

  return v_id;
exception when unique_violation then
  raise exception 'Ya hay una plantilla con el atajo "%".', p_atajo using errcode = '23505';
end $$;

create or replace function public.archivar_plantilla(p_plantilla uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_nombre text; v_user uuid := (select auth.uid());
begin
  select organization_id, nombre into v_org, v_nombre
    from public.plantillas where id = p_plantilla;
  if v_org is null then raise exception 'Esa plantilla no existe.' using errcode = 'P0002'; end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'Solo quien administra la organización archiva plantillas.' using errcode = '42501';
  end if;

  update public.plantillas set archivado_en = now() where id = p_plantilla;
  perform private.registrar_actividad(
    v_org, 'plantilla.archivada', 'usuario', null, v_user, jsonb_build_object('nombre', v_nombre));
end $$;

-- El estado de aprobación de WhatsApp se lleva a mano MIENTRAS no exista el
-- envío a Meta. Es un registro de lo que pasó allí, no una acción sobre Meta, y
-- la interfaz tiene que decirlo así de claro.
create or replace function public.marcar_estado_plantilla(
  p_plantilla uuid, p_estado text, p_meta_nombre text default null, p_motivo text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_nombre text; v_antes text; v_user uuid := (select auth.uid());
begin
  select organization_id, nombre, estado into v_org, v_nombre, v_antes
    from public.plantillas where id = p_plantilla and tipo = 'whatsapp';
  if v_org is null then
    raise exception 'Esa plantilla no existe o no es de WhatsApp.' using errcode = 'P0002';
  end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'Solo quien administra la organización cambia el estado.' using errcode = '42501';
  end if;

  update public.plantillas
     set estado = p_estado,
         meta_nombre = coalesce(nullif(btrim(coalesce(p_meta_nombre,'')), ''), meta_nombre),
         motivo_rechazo = case when p_estado = 'rechazada' then p_motivo else null end,
         revisada_en = now()
   where id = p_plantilla;

  perform private.registrar_actividad(
    v_org, 'plantilla.estado', 'usuario', null, v_user,
    jsonb_build_object('nombre', v_nombre, 'de', v_antes, 'a', p_estado));
end $$;

revoke execute on function public.guardar_plantilla(uuid,text,text,text,text,jsonb,text,text,uuid) from public, anon;
revoke execute on function public.archivar_plantilla(uuid) from public, anon;
revoke execute on function public.marcar_estado_plantilla(uuid,text,text,text) from public, anon;
