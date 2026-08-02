-- 0031_embudos.sql — embudos y etapas. El eje comercial, separado del de atención.
-- Fuente: docs/fases/03c-fase-embudos.md.
--
-- LA DECISIÓN QUE ORDENA TODO ESTE ARCHIVO
--
-- `tarjetas.estado` responde "¿esto necesita a alguien ahora?".
-- `tarjetas.etapa_id` responde "¿dónde está esto en el proceso comercial?".
--
-- Son dos hechos independientes y los dos pueden ser ciertos a la vez: una
-- tarjeta puede estar ESPERANDO —la pelota está en el tejado del cliente— y a la
-- vez en PROPUESTA ENVIADA.
--
-- Kommo los mezcla: mover de etapa cambia el estado, y cerrar la conversación
-- saca la tarjeta del embudo. El resultado es que o el embudo miente sobre el
-- negocio o la bandeja miente sobre el trabajo pendiente. Aquí van en dos
-- columnas y ninguna acción sobre una toca la otra. Si alguien añade más
-- adelante un trigger que las sincronice, estará reintroduciendo el defecto.

create table public.embudos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  nombre       text not null check (length(btrim(nombre)) between 1 and 60),
  descripcion  text,
  orden        integer not null default 0,

  -- Donde caen las tarjetas nuevas.
  es_predeterminado boolean not null default false,

  archivado_en  timestamptz,
  creado_por    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint embudos_org_id_uniq unique (organization_id, id)
);

-- Uno solo predeterminado por organización. Dos serían una ambigüedad silenciosa
-- en la ruta que más se ejecuta: la creación de tarjetas desde el normalizador.
create unique index embudos_predeterminado_unico
  on public.embudos (organization_id)
  where es_predeterminado and archivado_en is null;

create index embudos_org_idx on public.embudos (organization_id, orden)
  where archivado_en is null;

create trigger embudos_touch before update on public.embudos
  for each row execute function public.tocar_updated_at();

create table public.etapas (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  embudo_id        uuid not null,

  nombre  text not null check (length(btrim(nombre)) between 1 and 40),
  orden   integer not null default 0,

  -- Paleta cerrada. Un color libre acaba en un tablero de ocho colores
  -- saturados que contradice el libro de marca y cansa a la tercera hora.
  color  text not null default 'piedra'
    check (color in ('piedra','terracota','azul','verde','ambar','ciruela','teja','oliva')),

  -- NO es decoración. Sin saber qué etapas son terminales y de qué signo, no se
  -- puede calcular una tasa de conversión ni saber qué hay realmente en curso.
  -- Un embudo cuyas etapas son todas 'abierta' es una lista, no un embudo.
  tipo  text not null default 'abierta' check (tipo in ('abierta','ganada','perdida')),

  archivado_en  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint etapas_org_id_uniq unique (organization_id, id),
  constraint etapas_embudo_mismo_tenant
    foreign key (organization_id, embudo_id)
    references public.embudos (organization_id, id) on delete cascade
);

create index etapas_embudo_idx on public.etapas (organization_id, embudo_id, orden)
  where archivado_en is null;

create trigger etapas_touch before update on public.etapas
  for each row execute function public.tocar_updated_at();

alter table public.embudos enable row level security;
alter table public.embudos force  row level security;
alter table public.etapas  enable row level security;
alter table public.etapas  force  row level security;

create policy embudos_select on public.embudos
  for select to authenticated using (public.es_miembro(organization_id));
create policy etapas_select on public.etapas
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin políticas de escritura: todo por RPC, como en 0028. Definir un embudo
-- cambia el tablero de toda la organización.

-- ---------------------------------------------------------------------------
-- Lo que se añade a la tarjeta
-- ---------------------------------------------------------------------------
alter table public.tarjetas
  add column embudo_id  uuid,
  add column etapa_id   uuid,
  -- Da el "lleva 9 días aquí", que es la señal más útil de un embudo: no la
  -- etapa, sino cuánto lleva parada. Si no se captura al mover, no se puede
  -- reconstruir después.
  add column etapa_desde timestamptz,
  -- De primera clase y no un campo propio: el tablero suma por columna, y sumar
  -- un campo propio exigiría saber cuál de todos es el importe.
  add column valor  numeric(14,2),
  add column moneda text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),
  add constraint tarjetas_embudo_mismo_tenant
    foreign key (organization_id, embudo_id)
    references public.embudos (organization_id, id) on delete set null,
  add constraint tarjetas_etapa_mismo_tenant
    foreign key (organization_id, etapa_id)
    references public.etapas (organization_id, id) on delete set null;

create index tarjetas_embudo_idx
  on public.tarjetas (organization_id, embudo_id, etapa_id, last_message_at desc)
  where cerrada_en is null;

-- ---------------------------------------------------------------------------
-- Un embudo de partida por organización
-- ---------------------------------------------------------------------------
-- Sin esto, la primera vez que alguien abre el tablero ve una pantalla vacía y
-- tiene que diseñar un embudo antes de poder mirar nada. Las etapas son las de
-- un proceso de venta corriente y se cambian desde la interfaz.
insert into public.embudos (organization_id, nombre, descripcion, orden, es_predeterminado)
select o.id, 'Ventas', 'Embudo de partida. Renombra o cambia las etapas cuando quieras.', 0, true
  from public.organizations o
 where not exists (select 1 from public.embudos e where e.organization_id = o.id);

insert into public.etapas (organization_id, embudo_id, nombre, orden, color, tipo)
select e.organization_id, e.id, x.nombre, x.orden, x.color, x.tipo
  from public.embudos e
 cross join (values
   ('Nuevo',            0, 'piedra',    'abierta'),
   ('Contactado',       1, 'azul',      'abierta'),
   ('Interesado',       2, 'terracota', 'abierta'),
   ('Propuesta enviada',3, 'ambar',     'abierta'),
   ('Ganada',           4, 'verde',     'ganada'),
   ('Perdida',          5, 'teja',      'perdida')
 ) as x(nombre, orden, color, tipo)
 where e.nombre = 'Ventas'
   and not exists (select 1 from public.etapas t where t.embudo_id = e.id);

-- Las tarjetas que ya existen entran por la primera etapa abierta.
update public.tarjetas t
   set embudo_id = e.id, etapa_id = p.id, etapa_desde = coalesce(t.created_at, now())
  from public.embudos e
  join lateral (
    select id from public.etapas
     where embudo_id = e.id and tipo = 'abierta' and archivado_en is null
     order by orden limit 1
  ) p on true
 where e.organization_id = t.organization_id
   and e.es_predeterminado and e.archivado_en is null
   and t.etapa_id is null;

-- ---------------------------------------------------------------------------
-- Las tarjetas nuevas caen en el embudo predeterminado
-- ---------------------------------------------------------------------------
create or replace function private.tarjeta_de_contacto(p_org uuid, p_contact uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_t uuid; v_embudo uuid; v_etapa uuid;
begin
  select id into v_t from public.tarjetas
   where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  if v_t is not null then return v_t; end if;

  -- Determinista y sin adivinar. Si la organización no tiene embudos, la
  -- tarjeta se crea sin etapa y el tablero lo dice: no se inventa uno.
  select e.id, p.id into v_embudo, v_etapa
    from public.embudos e
    left join lateral (
      select id from public.etapas
       where embudo_id = e.id and tipo = 'abierta' and archivado_en is null
       order by orden limit 1
    ) p on true
   where e.organization_id = p_org and e.es_predeterminado and e.archivado_en is null;

  insert into public.tarjetas (organization_id, contact_id, embudo_id, etapa_id, etapa_desde)
  values (p_org, p_contact, v_embudo, v_etapa, case when v_etapa is not null then now() end)
  on conflict (organization_id, contact_id) where cerrada_en is null do nothing
  returning id into v_t;

  if v_t is null then
    select id into v_t from public.tarjetas
     where organization_id = p_org and contact_id = p_contact and cerrada_en is null;
  end if;

  return v_t;
end $$;

-- ---------------------------------------------------------------------------
-- Mover de etapa
-- ---------------------------------------------------------------------------
create or replace function public.mover_etapa(p_tarjeta uuid, p_etapa uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_org_e uuid; v_user uuid := (select auth.uid());
  v_embudo_actual uuid; v_etapa_actual uuid; v_desde timestamptz;
  v_embudo_nuevo uuid;
  v_nombre_de text; v_nombre_a text; v_nombre_embudo text; v_dias numeric;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select organization_id, embudo_id, etapa_id, etapa_desde
    into v_org, v_embudo_actual, v_etapa_actual, v_desde
    from public.tarjetas where id = p_tarjeta;
  if v_org is null then raise exception 'Esa tarjeta no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  select organization_id, embudo_id, nombre into v_org_e, v_embudo_nuevo, v_nombre_a
    from public.etapas where id = p_etapa and archivado_en is null;
  if v_org_e is null then
    raise exception 'Esa etapa no existe o está archivada.' using errcode = 'P0002';
  end if;
  -- La frontera de tenant. Sin esta línea se podría mover el negocio de un
  -- cliente al tablero de otro, que es el peor fallo posible bajo RLS.
  if v_org_e <> v_org then
    raise exception 'Esa etapa es de otra organización.' using errcode = '42501';
  end if;

  if v_etapa_actual is not distinct from p_etapa then return; end if;

  select nombre into v_nombre_de from public.etapas where id = v_etapa_actual;
  select nombre into v_nombre_embudo from public.embudos where id = v_embudo_nuevo;
  v_dias := case when v_desde is not null
                 then round(extract(epoch from (now() - v_desde)) / 86400.0, 1) end;

  -- OJO: no se toca `estado`. Mover a "Ganada" NO cierra la conversación. Si el
  -- cliente sigue escribiendo, la conversación sigue viva, y cerrarla aquí es
  -- lo que hace que un mensaje posterior a la venta se pierda de vista.
  update public.tarjetas
     set etapa_id = p_etapa, embudo_id = v_embudo_nuevo, etapa_desde = now()
   where id = p_tarjeta;

  if v_embudo_actual is distinct from v_embudo_nuevo then
    perform private.registrar_actividad_tarjeta(
      v_org, p_tarjeta, 'tarjeta.embudo', 'usuario', v_user,
      jsonb_build_object(
        'de', (select nombre from public.embudos where id = v_embudo_actual),
        'a', v_nombre_embudo));
  end if;

  perform private.registrar_actividad_tarjeta(
    v_org, p_tarjeta, 'tarjeta.etapa', 'usuario', v_user,
    jsonb_build_object('de', v_nombre_de, 'a', v_nombre_a,
                       'embudo', v_nombre_embudo, 'dias_en_etapa_anterior', v_dias));
end $$;

create or replace function public.fijar_valor(
  p_tarjeta uuid, p_valor numeric, p_moneda text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_user uuid := (select auth.uid()); v_antes numeric; v_moneda text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select organization_id, valor, moneda into v_org, v_antes, v_moneda
    from public.tarjetas where id = p_tarjeta;
  if v_org is null then raise exception 'Esa tarjeta no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if p_valor is not null and p_valor < 0 then
    raise exception 'El valor no puede ser negativo.' using errcode = '22023';
  end if;

  v_moneda := coalesce(upper(nullif(btrim(coalesce(p_moneda, '')), '')), v_moneda);
  if v_moneda !~ '^[A-Z]{3}$' then
    raise exception 'La moneda se escribe con tres letras, por ejemplo USD.' using errcode = '22023';
  end if;

  if v_antes is not distinct from p_valor and v_moneda = (select moneda from public.tarjetas where id = p_tarjeta) then
    return;
  end if;

  update public.tarjetas set valor = p_valor, moneda = v_moneda where id = p_tarjeta;

  perform private.registrar_actividad_tarjeta(
    v_org, p_tarjeta, 'tarjeta.valor', 'usuario', v_user,
    jsonb_build_object('de', v_antes, 'a', p_valor, 'moneda', v_moneda));
end $$;

-- ---------------------------------------------------------------------------
-- Definir embudos y etapas
-- ---------------------------------------------------------------------------
create or replace function public.definir_embudo(
  p_org uuid, p_nombre text, p_descripcion text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_orden integer;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.es_owner(p_org) then
    raise exception 'Solo quien administra la organización define embudos.' using errcode = '42501';
  end if;

  select coalesce(max(orden), -1) + 1 into v_orden
    from public.embudos where organization_id = p_org;

  insert into public.embudos (organization_id, nombre, descripcion, orden, creado_por)
  values (p_org, btrim(p_nombre), nullif(btrim(coalesce(p_descripcion,'')), ''), v_orden, v_user)
  returning id into v_id;

  perform private.registrar_actividad(
    p_org, 'embudo.definido', 'usuario', null, v_user,
    jsonb_build_object('nombre', btrim(p_nombre)));
  return v_id;
end $$;

create or replace function public.definir_etapa(
  p_embudo uuid, p_nombre text, p_tipo text default 'abierta', p_color text default 'piedra'
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_user uuid := (select auth.uid()); v_id uuid; v_orden integer;
begin
  select organization_id into v_org from public.embudos where id = p_embudo;
  if v_org is null then raise exception 'Ese embudo no existe.' using errcode = 'P0002'; end if;
  if not public.es_owner(v_org) then
    raise exception 'Solo quien administra la organización define etapas.' using errcode = '42501';
  end if;

  -- Las terminales van al final; las abiertas, antes de ellas. Un embudo con
  -- "Ganada" en medio no se lee de izquierda a derecha.
  if p_tipo = 'abierta' then
    select coalesce(min(orden), 100) into v_orden
      from public.etapas where embudo_id = p_embudo and tipo <> 'abierta' and archivado_en is null;
    update public.etapas set orden = orden + 1
     where embudo_id = p_embudo and tipo <> 'abierta';
  else
    select coalesce(max(orden), -1) + 1 into v_orden
      from public.etapas where embudo_id = p_embudo;
  end if;

  insert into public.etapas (organization_id, embudo_id, nombre, orden, color, tipo)
  values (v_org, p_embudo, btrim(p_nombre), v_orden, p_color, p_tipo)
  returning id into v_id;

  perform private.registrar_actividad(
    v_org, 'etapa.definida', 'usuario', null, v_user,
    jsonb_build_object('nombre', btrim(p_nombre), 'tipo', p_tipo));
  return v_id;
end $$;

create or replace function public.archivar_etapa(p_etapa uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_embudo uuid; v_nombre text; v_user uuid := (select auth.uid()); v_quedan integer;
begin
  select organization_id, embudo_id, nombre into v_org, v_embudo, v_nombre
    from public.etapas where id = p_etapa;
  if v_org is null then raise exception 'Esa etapa no existe.' using errcode = 'P0002'; end if;
  if not public.es_owner(v_org) then
    raise exception 'Solo quien administra la organización archiva etapas.' using errcode = '42501';
  end if;

  -- Archivar la última etapa abierta dejaría el embudo sin sitio donde caer las
  -- tarjetas nuevas, y el normalizador las crearía sin etapa en silencio.
  select count(*) into v_quedan from public.etapas
   where embudo_id = v_embudo and tipo = 'abierta' and archivado_en is null and id <> p_etapa;
  if v_quedan = 0 then
    raise exception 'Es la única etapa abierta del embudo. Crea otra antes de archivar esta.'
      using errcode = '22023';
  end if;

  update public.etapas set archivado_en = now() where id = p_etapa;

  -- Las tarjetas que estaban ahí no se quedan huérfanas: pasan a la primera
  -- etapa abierta que quede. Dejarlas apuntando a una etapa archivada las haría
  -- desaparecer del tablero sin que nadie sepa por qué.
  update public.tarjetas t
     set etapa_id = (select id from public.etapas
                      where embudo_id = v_embudo and tipo = 'abierta' and archivado_en is null
                      order by orden limit 1),
         etapa_desde = now()
   where t.etapa_id = p_etapa;

  perform private.registrar_actividad(
    v_org, 'etapa.archivada', 'usuario', null, v_user,
    jsonb_build_object('nombre', v_nombre));
end $$;

revoke execute on function public.mover_etapa(uuid, uuid)                  from public, anon;
revoke execute on function public.fijar_valor(uuid, numeric, text)         from public, anon;
revoke execute on function public.definir_embudo(uuid, text, text)         from public, anon;
revoke execute on function public.definir_etapa(uuid, text, text, text)    from public, anon;
revoke execute on function public.archivar_etapa(uuid)                     from public, anon;

-- ---------------------------------------------------------------------------
-- El resumen del tablero
-- ---------------------------------------------------------------------------
-- Cuenta y suma por columna en una sola consulta. La cabecera de cada columna
-- es la razón de ser de la vista de embudo: sin la suma, es una lista con
-- colores.
create view public.embudo_resumen
with (security_invoker = on) as
  select
    e.organization_id,
    e.embudo_id,
    e.id      as etapa_id,
    e.nombre,
    e.orden,
    e.color,
    e.tipo,
    count(t.id)                        as tarjetas,
    coalesce(sum(t.valor), 0)::numeric as valor,
    -- La moneda del tablero es la de sus tarjetas mientras sea una sola. En
    -- cuanto hay dos, sumar sería inventar un tipo de cambio.
    (array_agg(distinct t.moneda) filter (where t.valor is not null)) as monedas
  from public.etapas e
  left join public.tarjetas t
    on t.etapa_id = e.id and t.cerrada_en is null
 where e.archivado_en is null
 group by e.organization_id, e.embudo_id, e.id, e.nombre, e.orden, e.color, e.tipo;

comment on view public.embudo_resumen is
  'Una fila por etapa viva, con cuántas tarjetas tiene y cuánto suman. Incluye '
  'las etapas vacías, que es justo lo que hay que ver en un tablero.';
