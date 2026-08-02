-- 0028_union_y_campos.sql — unir tarjetas, y campos propios de cada negocio.
-- Fuente: docs/fases/03b-fase-tarjetas.md §1, §2.3 y §3.

-- ---------------------------------------------------------------------------
-- 1. Unir dos tarjetas
-- ---------------------------------------------------------------------------
-- Es LA operación que resuelve "esta persona de WhatsApp es la misma que la de
-- Instagram". Mueve las conversaciones de una tarjeta a otra y, si los
-- contactos son distintos, también unifica la persona.
--
-- Una sola palabra para el operador —unir— aunque por debajo toque tres tablas.
-- Tener "fusionar contactos" y "fusionar tarjetas" como dos acciones distintas
-- obligaría a explicar una diferencia que a quien atiende no le importa.

create table public.uniones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  tarjeta_superviviente uuid not null,
  tarjeta_absorbida     uuid not null,

  -- Exactamente lo que se movió. Deshacer no adivina: devuelve estas filas y
  -- ninguna otra. Si entre la unión y el deshacer llegó una conversación nueva,
  -- se queda donde está, que es lo correcto.
  conversaciones  uuid[] not null default '{}',
  identidades     uuid[] not null default '{}',
  contacto_absorbido uuid,

  motivo     text not null,
  hecha_por  uuid references auth.users(id) on delete set null,
  hecha_en   timestamptz not null default now(),

  deshecha_en  timestamptz,
  deshecha_por uuid references auth.users(id) on delete set null,

  constraint uniones_superviviente_mismo_tenant
    foreign key (organization_id, tarjeta_superviviente)
    references public.tarjetas (organization_id, id) on delete cascade,
  constraint uniones_absorbida_mismo_tenant
    foreign key (organization_id, tarjeta_absorbida)
    references public.tarjetas (organization_id, id) on delete cascade,
  constraint uniones_distintas check (tarjeta_superviviente <> tarjeta_absorbida)
);

create index uniones_org_idx on public.uniones (organization_id, hecha_en desc);

alter table public.uniones enable row level security;
alter table public.uniones force  row level security;

create policy uniones_select on public.uniones
  for select to authenticated using (public.es_miembro(organization_id));

create or replace function public.unir_tarjetas(
  p_superviviente uuid,
  p_absorbida     uuid,
  p_motivo        text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_org_b uuid;
  v_user uuid := (select auth.uid());
  v_cont_sup uuid; v_cont_abs uuid;
  v_convs uuid[]; v_ids uuid[] := '{}';
  v_choque text; v_union uuid; v_conv uuid;
  v_nombre_abs text; v_user_abs text;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if p_superviviente = p_absorbida then
    raise exception 'Una tarjeta no se puede unir consigo misma.' using errcode = '22023';
  end if;
  -- Unir muestra la conversación de una persona bajo el nombre de otra si se
  -- hace mal. Dentro de tres meses nadie recuerda por qué se hizo.
  if p_motivo is null or length(btrim(p_motivo)) < 8 then
    raise exception 'La unión necesita un motivo de al menos 8 caracteres: queda escrito en el hilo.'
      using errcode = '22023';
  end if;

  select organization_id, contact_id into v_org,   v_cont_sup from public.tarjetas where id = p_superviviente;
  select organization_id, contact_id into v_org_b, v_cont_abs from public.tarjetas where id = p_absorbida;

  if v_org is null or v_org_b is null then
    raise exception 'Alguna de las tarjetas no existe.' using errcode = 'P0002';
  end if;
  -- La frontera de tenant de esta función. Sin esta línea, un miembro podría
  -- absorber la tarjeta de otro cliente y arrastrar sus hilos a su bandeja.
  if v_org <> v_org_b then
    raise exception 'No se pueden unir tarjetas de organizaciones distintas.' using errcode = '42501';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  -- Dos hilos vivos del mismo canal son dos cuentas distintas de ese canal.
  -- Y aunque no lo fueran, el índice único parcial sobre
  -- (organization_id, canal, contact_id) where cerrada_en is null reventaría al
  -- mover el contacto, con un error de constraint que no le dice nada a nadie.
  if v_cont_sup <> v_cont_abs then
    select string_agg(distinct a.canal::text, ', ') into v_choque
      from public.conversations a
      join public.conversations b
        on b.contact_id = v_cont_sup and b.canal = a.canal and b.cerrada_en is null
     where a.contact_id = v_cont_abs and a.cerrada_en is null;

    if v_choque is not null then
      raise exception 'Las dos personas tienen un hilo abierto en %. Cierra uno antes de unir: dos hilos vivos del mismo canal son dos cuentas distintas.', v_choque
        using errcode = '23505';
    end if;
  end if;

  select coalesce(array_agg(id), '{}') into v_convs
    from public.conversations where tarjeta_id = p_absorbida;

  update public.conversations set tarjeta_id = p_superviviente where id = any(v_convs);

  -- Si además son dos personas distintas, se unifica también la persona: es lo
  -- que el operador quiere decir cuando dice "es el mismo".
  if v_cont_sup <> v_cont_abs then
    select nombre, username into v_nombre_abs, v_user_abs from public.contacts where id = v_cont_abs;

    select coalesce(array_agg(id), '{}') into v_ids
      from public.contact_identities where contact_id = v_cont_abs;

    update public.contact_identities set contact_id = v_cont_sup where id = any(v_ids);
    update public.conversations       set contact_id = v_cont_sup where id = any(v_convs);
    update public.contacts            set fusionado_en = v_cont_sup where id = v_cont_abs;
    update public.contacts
       set nombre   = coalesce(nombre, v_nombre_abs),
           username = coalesce(username, v_user_abs)
     where id = v_cont_sup;
  end if;

  update public.tarjetas
     set cerrada_en = now(), estado = 'cerrada'
   where id = p_absorbida;

  insert into public.uniones
    (organization_id, tarjeta_superviviente, tarjeta_absorbida, conversaciones,
     identidades, contacto_absorbido, motivo, hecha_por)
  values
    (v_org, p_superviviente, p_absorbida, v_convs, v_ids,
     case when v_cont_sup <> v_cont_abs then v_cont_abs end, btrim(p_motivo), v_user)
  returning id into v_union;

  for v_conv in select c.id from public.conversations c where c.tarjeta_id = p_superviviente loop
    perform private.registrar_actividad(
      v_org, 'tarjetas.unidas', 'usuario', v_conv, v_user,
      jsonb_build_object(
        'union_id', v_union,
        'motivo', btrim(p_motivo),
        'conversaciones', coalesce(array_length(v_convs, 1), 0),
        'misma_persona', v_cont_sup = v_cont_abs));
  end loop;

  return v_union;
end $$;

create or replace function public.separar_tarjetas(p_union uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_sup uuid; v_abs uuid; v_convs uuid[]; v_ids uuid[];
  v_cont_abs uuid; v_deshecha timestamptz;
  v_user uuid := (select auth.uid()); v_conv uuid;
begin
  select organization_id, tarjeta_superviviente, tarjeta_absorbida, conversaciones,
         identidades, contacto_absorbido, deshecha_en
    into v_org, v_sup, v_abs, v_convs, v_ids, v_cont_abs, v_deshecha
    from public.uniones where id = p_union;

  if v_org is null then
    raise exception 'Esa unión no existe.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if v_deshecha is not null then
    raise exception 'Esa unión ya se deshizo.' using errcode = '22023';
  end if;

  -- Se avisa ANTES de separar: después, las conversaciones que vuelven ya no
  -- cuelgan de la tarjeta superviviente y el aviso no aparecería en ellas.
  for v_conv in select c.id from public.conversations c where c.tarjeta_id = v_sup loop
    perform private.registrar_actividad(
      v_org, 'tarjetas.separadas', 'usuario', v_conv, v_user,
      jsonb_build_object('union_id', p_union));
  end loop;

  if v_cont_abs is not null then
    update public.contact_identities set contact_id = v_cont_abs where id = any(v_ids);
    update public.conversations       set contact_id = v_cont_abs where id = any(v_convs);
    update public.contacts            set fusionado_en = null      where id = v_cont_abs;
  end if;

  update public.tarjetas set cerrada_en = null, estado = 'en_curso' where id = v_abs;
  update public.conversations set tarjeta_id = v_abs where id = any(v_convs);

  update public.uniones set deshecha_en = now(), deshecha_por = v_user where id = p_union;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Campos propios de cada negocio
-- ---------------------------------------------------------------------------
create table public.campos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- Estable, para filtros y API. La etiqueta se puede cambiar sin romper nada;
  -- la clave no se cambia.
  clave     text not null check (clave ~ '^[a-z][a-z0-9_]{1,38}$'),
  etiqueta  text not null check (length(btrim(etiqueta)) between 1 and 60),
  ayuda     text,

  tipo  text not null check (tipo in (
    'texto', 'texto_largo', 'numero', 'moneda', 'fecha', 'booleano',
    'seleccion', 'multiseleccion', 'telefono', 'correo', 'url')),

  -- Solo para seleccion y multiseleccion: array de strings.
  opciones  jsonb,

  obligatorio  boolean not null default false,
  orden        integer not null default 0,

  -- Un presupuesto es del asunto; un RIF es de la persona.
  ambito  text not null default 'tarjeta' check (ambito in ('tarjeta', 'contacto')),

  -- Se ARCHIVA, no se borra. Borrar la definición se llevaría por delante el
  -- histórico de valores, que es justo el dato que alguien quiso guardar.
  archivado_en  timestamptz,

  creado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint campos_clave_unica unique (organization_id, ambito, clave),
  constraint campos_org_id_uniq unique (organization_id, id),
  constraint campos_opciones_coherentes check (
    (tipo in ('seleccion', 'multiseleccion') and jsonb_typeof(opciones) = 'array'
     and jsonb_array_length(opciones) > 0)
    or (tipo not in ('seleccion', 'multiseleccion') and opciones is null))
);

create index campos_org_idx on public.campos (organization_id, ambito, orden)
  where archivado_en is null;

create trigger campos_touch before update on public.campos
  for each row execute function public.tocar_updated_at();

alter table public.campos enable row level security;
alter table public.campos force  row level security;

create policy campos_select on public.campos
  for select to authenticated using (public.es_miembro(organization_id));

create table public.campo_valores (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  campo_id         uuid not null,
  tarjeta_id       uuid,
  contacto_id      uuid,

  valor  jsonb not null,

  actualizado_por  uuid references auth.users(id) on delete set null,
  actualizado_en   timestamptz not null default now(),

  constraint campo_valores_uno_u_otro check (
    (tarjeta_id is not null and contacto_id is null) or
    (tarjeta_id is null and contacto_id is not null)),
  constraint campo_valores_campo_mismo_tenant
    foreign key (organization_id, campo_id)
    references public.campos (organization_id, id) on delete cascade,
  constraint campo_valores_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete cascade,
  constraint campo_valores_contacto_mismo_tenant
    foreign key (organization_id, contacto_id)
    references public.contacts (organization_id, id) on delete cascade
);

create unique index campo_valores_tarjeta_unico
  on public.campo_valores (campo_id, tarjeta_id) where tarjeta_id is not null;
create unique index campo_valores_contacto_unico
  on public.campo_valores (campo_id, contacto_id) where contacto_id is not null;
create index campo_valores_tarjeta_idx
  on public.campo_valores (organization_id, tarjeta_id) where tarjeta_id is not null;
create index campo_valores_contacto_idx
  on public.campo_valores (organization_id, contacto_id) where contacto_id is not null;

alter table public.campo_valores enable row level security;
alter table public.campo_valores force  row level security;

create policy campo_valores_select on public.campo_valores
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin políticas de escritura en ninguna de las dos: todo pasa por RPC. Una
-- política de tabla sería un camino que escribe sin dejar actividad, y el
-- requisito es que en la conversación salga todo lo que hace el usuario.

-- ---------------------------------------------------------------------------
-- 3. Definir campos
-- ---------------------------------------------------------------------------
create or replace function public.definir_campo(
  p_org       uuid,
  p_clave     text,
  p_etiqueta  text,
  p_tipo      text,
  p_ambito    text default 'tarjeta',
  p_opciones  jsonb default null,
  p_ayuda     text default null,
  p_obligatorio boolean default false
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_id uuid; v_orden integer;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  -- Definir un campo cambia el formulario de toda la organización. No es una
  -- acción de quien atiende un hilo.
  if not public.es_owner(p_org) then
    raise exception 'Solo quien administra la organización define campos.' using errcode = '42501';
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from public.campos where organization_id = p_org and ambito = p_ambito;

  insert into public.campos
    (organization_id, clave, etiqueta, tipo, ambito, opciones, ayuda, obligatorio, orden, creado_por)
  values
    (p_org, lower(btrim(p_clave)), btrim(p_etiqueta), p_tipo, p_ambito,
     p_opciones, nullif(btrim(coalesce(p_ayuda, '')), ''), p_obligatorio, v_orden, v_user)
  returning id into v_id;

  perform private.registrar_actividad(
    p_org, 'campo.definido', 'usuario', null, v_user,
    jsonb_build_object('clave', lower(btrim(p_clave)), 'etiqueta', btrim(p_etiqueta),
                       'tipo', p_tipo, 'ambito', p_ambito));
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un campo con la clave "%" en ese ámbito.', lower(btrim(p_clave))
    using errcode = '23505';
end $$;

create or replace function public.archivar_campo(p_campo uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_clave text; v_user uuid := (select auth.uid());
begin
  select organization_id, clave into v_org, v_clave from public.campos where id = p_campo;
  if v_org is null then
    raise exception 'Ese campo no existe.' using errcode = 'P0002';
  end if;
  if not public.es_owner(v_org) then
    raise exception 'Solo quien administra la organización archiva campos.' using errcode = '42501';
  end if;

  update public.campos set archivado_en = now() where id = p_campo;

  perform private.registrar_actividad(
    v_org, 'campo.archivado', 'usuario', null, v_user,
    jsonb_build_object('clave', v_clave));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Guardar un valor, validado contra su definición
-- ---------------------------------------------------------------------------
create or replace function public.guardar_campo(
  p_campo   uuid,
  p_destino uuid,       -- tarjeta o contacto, según el ámbito del campo
  p_valor   jsonb
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_tipo text; v_ambito text; v_etiqueta text; v_opciones jsonb;
  v_user uuid := (select auth.uid());
  v_anterior jsonb; v_texto text; v_conv uuid; v_tarjeta uuid;
  v_vacio boolean;
begin
  select organization_id, tipo, ambito, etiqueta, opciones
    into v_org, v_tipo, v_ambito, v_etiqueta, v_opciones
    from public.campos where id = p_campo and archivado_en is null;

  if v_org is null then
    raise exception 'Ese campo no existe o está archivado.' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  v_vacio := p_valor is null or jsonb_typeof(p_valor) = 'null'
             or (jsonb_typeof(p_valor) = 'string' and btrim(p_valor #>> '{}') = '');

  -- El tipo lo impone la definición, aquí, en la frontera. Guardar el jsonb tal
  -- como llega convertiría la tabla en un vertedero donde el mismo campo tiene
  -- números en unas filas y texto en otras.
  if not v_vacio then
    case v_tipo
      when 'numero', 'moneda' then
        if jsonb_typeof(p_valor) <> 'number' then
          raise exception '% espera un número.', v_etiqueta using errcode = '22023';
        end if;
      when 'booleano' then
        if jsonb_typeof(p_valor) <> 'boolean' then
          raise exception '% espera sí o no.', v_etiqueta using errcode = '22023';
        end if;
      when 'fecha' then
        begin
          perform (p_valor #>> '{}')::date;
        exception when others then
          raise exception '% espera una fecha con formato AAAA-MM-DD.', v_etiqueta using errcode = '22023';
        end;
      when 'seleccion' then
        if not (v_opciones @> jsonb_build_array(p_valor #>> '{}')) then
          raise exception '% solo admite: %', v_etiqueta,
            (select string_agg(x, ', ') from jsonb_array_elements_text(v_opciones) x)
            using errcode = '22023';
        end if;
      when 'multiseleccion' then
        if jsonb_typeof(p_valor) <> 'array' then
          raise exception '% espera una lista.', v_etiqueta using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements_text(p_valor) e
                    where not (v_opciones @> jsonb_build_array(e))) then
          raise exception '% tiene un valor que no está entre sus opciones.', v_etiqueta
            using errcode = '22023';
        end if;
      when 'correo' then
        if (p_valor #>> '{}') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
          raise exception '% espera un correo.', v_etiqueta using errcode = '22023';
        end if;
      when 'url' then
        if (p_valor #>> '{}') !~ '^https?://' then
          raise exception '% espera una dirección que empiece por http:// o https://', v_etiqueta
            using errcode = '22023';
        end if;
      else
        null;  -- texto, texto_largo, telefono: se aceptan tal cual
    end case;
  end if;

  if v_ambito = 'tarjeta' then
    select valor into v_anterior from public.campo_valores
     where campo_id = p_campo and tarjeta_id = p_destino;
    v_tarjeta := p_destino;
  else
    select valor into v_anterior from public.campo_valores
     where campo_id = p_campo and contacto_id = p_destino;
    -- Para un campo de contacto, la actividad va en las tarjetas de esa persona.
    select id into v_tarjeta from public.tarjetas
     where contact_id = p_destino and cerrada_en is null limit 1;
  end if;

  if v_anterior is not distinct from p_valor then return; end if;

  -- Las dos ramas están separadas porque la unicidad son dos ÍNDICES parciales,
  -- no una constraint: `on conflict on constraint` no vale, hay que inferir por
  -- columnas y predicado, y cada ámbito infiere el suyo.
  if v_vacio then
    if v_ambito = 'tarjeta' then
      delete from public.campo_valores where campo_id = p_campo and tarjeta_id = p_destino;
    else
      delete from public.campo_valores where campo_id = p_campo and contacto_id = p_destino;
    end if;
  elsif v_ambito = 'tarjeta' then
    insert into public.campo_valores
      (organization_id, campo_id, tarjeta_id, valor, actualizado_por, actualizado_en)
    values (v_org, p_campo, p_destino, p_valor, v_user, now())
    on conflict (campo_id, tarjeta_id) where tarjeta_id is not null do update
      set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
          actualizado_en = excluded.actualizado_en;
  else
    insert into public.campo_valores
      (organization_id, campo_id, contacto_id, valor, actualizado_por, actualizado_en)
    values (v_org, p_campo, p_destino, p_valor, v_user, now())
    on conflict (campo_id, contacto_id) where contacto_id is not null do update
      set valor = excluded.valor, actualizado_por = excluded.actualizado_por,
          actualizado_en = excluded.actualizado_en;
  end if;

  -- Con el valor anterior. Sin el antes, el registro dice que algo cambió pero
  -- no de qué a qué, y para eso no hace falta registro.
  for v_conv in select c.id from public.conversations c where c.tarjeta_id = v_tarjeta loop
    perform private.registrar_actividad(
      v_org, 'campo.valor', 'usuario', v_conv, v_user,
      jsonb_build_object('etiqueta', v_etiqueta, 'de', v_anterior, 'a',
                         case when v_vacio then null else p_valor end));
  end loop;
end $$;

revoke execute on function public.unir_tarjetas(uuid, uuid, text)          from public, anon;
revoke execute on function public.separar_tarjetas(uuid)                   from public, anon;
revoke execute on function public.definir_campo(uuid, text, text, text, text, jsonb, text, boolean) from public, anon;
revoke execute on function public.archivar_campo(uuid)                     from public, anon;
revoke execute on function public.guardar_campo(uuid, uuid, jsonb)         from public, anon;
