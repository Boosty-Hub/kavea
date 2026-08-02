-- 0033_archivos_y_documentos.sql — la ficha guarda archivos y el historial comercial.
-- Fuente: docs/fases/03d-fase-ficha.md.
--
-- LA DECISIÓN QUE ORDENA ESTE ARCHIVO
--
-- Los documentos comerciales cuelgan de la PERSONA, no de la tarjeta. Un cliente
-- que compra tres veces en un año tiene tres asuntos y un solo historial. Si el
-- documento colgara de la tarjeta, al abrir la conversación de hoy no se vería
-- lo que compró en marzo, que es justo el dato que decide cómo se le atiende.
--
-- `tarjeta_id` queda como referencia informativa: dice de qué conversación
-- salió, sin que el documento le pertenezca. Una tarjeta que se cierra no se
-- lleva el historial de la persona.
--
-- Con los archivos es al revés y también a propósito: uno puede ser de la
-- tarjeta (el plano de este pedido), de la persona (su documento de identidad)
-- o de la organización entera (el catálogo). Las tres combinaciones significan
-- cosas distintas, así que las dos referencias son opcionales.

-- ---------------------------------------------------------------------------
-- 1. El almacén
-- ---------------------------------------------------------------------------
-- Media SALIENTE, que es lo que el invariante del 03 permite guardar. La media
-- entrante de Meta sigue siendo solo URL y no toca este bucket; que los dos
-- caminos no se crucen lo garantiza el CHECK de `media` desde 0010.
insert into storage.buckets (id, name, public, file_size_limit)
values ('salientes', 'salientes', false, 26214400)   -- 25 MB, el techo de Meta
on conflict (id) do nothing;

-- La organización es el PRIMER SEGMENTO de la ruta, y eso es lo que separa a un
-- cliente de otro dentro del bucket.
--
-- Se compara como texto y no casteando a uuid a propósito: un objeto con una
-- ruta que no empiece por un uuid haría fallar el cast DENTRO de la política, y
-- una política que lanza excepción no deniega, rompe la consulta entera. La
-- subconsulta va con `in (select ...)` y no con un `exists` correlacionado para
-- que se evalúe una vez y no por fila.
create policy salientes_leer on storage.objects
  for select to authenticated
  using (
    bucket_id = 'salientes'
    and (storage.foldername(name))[1] in (
      select m.organization_id::text from public.organization_members m
       where m.user_id = (select auth.uid())
    )
  );

create policy salientes_subir on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'salientes'
    and (storage.foldername(name))[1] in (
      select m.organization_id::text from public.organization_members m
       where m.user_id = (select auth.uid())
    )
  );

create policy salientes_borrar on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'salientes'
    and (storage.foldername(name))[1] in (
      select m.organization_id::text from public.organization_members m
       where m.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Archivos
-- ---------------------------------------------------------------------------
create table public.archivos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- Las dos opcionales. Sin ninguna, el archivo es de la organización entera:
  -- el catálogo, la lista de precios, lo que se manda a todo el mundo.
  contacto_id  uuid,
  tarjeta_id   uuid,

  nombre        text not null check (length(btrim(nombre)) between 1 and 200),
  storage_path  text not null unique,
  content_type  text,
  bytes         bigint not null check (bytes >= 0),

  -- Se calcula AL SUBIR contra los límites de Meta, no al enviar. Es la
  -- diferencia entre avisar cuando todavía se puede cambiar el archivo y fallar
  -- delante del cliente cuatro días después.
  enviable            boolean not null default true,
  motivo_no_enviable  text,

  subido_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint archivos_org_id_uniq unique (organization_id, id),
  constraint archivos_contacto_mismo_tenant
    foreign key (organization_id, contacto_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint archivos_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete set null
);

create index archivos_tarjeta_idx on public.archivos (organization_id, tarjeta_id, created_at desc)
  where tarjeta_id is not null;
create index archivos_contacto_idx on public.archivos (organization_id, contacto_id, created_at desc)
  where contacto_id is not null;
create index archivos_biblioteca_idx on public.archivos (organization_id, created_at desc)
  where contacto_id is null and tarjeta_id is null;

alter table public.archivos enable row level security;
alter table public.archivos force  row level security;

create policy archivos_select on public.archivos
  for select to authenticated using (public.es_miembro(organization_id));

-- ---------------------------------------------------------------------------
-- 3. Documentos comerciales
-- ---------------------------------------------------------------------------
create table public.documentos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- OBLIGATORIO: el historial es de la persona.
  contacto_id  uuid not null,
  -- OPCIONAL e informativo: de qué conversación salió.
  tarjeta_id   uuid,

  tipo    text not null check (tipo in ('presupuesto', 'pedido', 'factura')),
  numero  text,
  concepto text not null check (length(btrim(concepto)) between 1 and 300),

  total   numeric(14,2) not null check (total >= 0),
  moneda  text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),

  estado  text not null default 'borrador'
    check (estado in ('borrador', 'enviado', 'aceptado', 'rechazado', 'pagado', 'anulado')),

  emitido_en  date not null default current_date,
  -- Lo que convierte "pendiente" en "vencido". Sin fecha hay un importe
  -- pendiente sin urgencia, que no es una deuda que se pueda reclamar.
  vence_en    date,
  pagado_en   date,

  -- El PDF, si lo hay. Opcional: se puede registrar la venta sin tener el papel.
  archivo_id  uuid,

  creado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint documentos_org_id_uniq unique (organization_id, id),
  constraint documentos_contacto_mismo_tenant
    foreign key (organization_id, contacto_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint documentos_tarjeta_mismo_tenant
    foreign key (organization_id, tarjeta_id)
    references public.tarjetas (organization_id, id) on delete set null,
  constraint documentos_archivo_mismo_tenant
    foreign key (organization_id, archivo_id)
    references public.archivos (organization_id, id) on delete set null,
  -- Un pagado sin fecha de pago es un dato a medias que después nadie sabe leer.
  constraint documentos_pagado_coherente check (estado <> 'pagado' or pagado_en is not null)
);

create index documentos_contacto_idx
  on public.documentos (organization_id, contacto_id, emitido_en desc);

-- Lo pendiente de cobro, que es la consulta que de verdad importa.
create index documentos_pendientes_idx
  on public.documentos (organization_id, vence_en)
  where estado in ('enviado', 'aceptado') and tipo in ('pedido', 'factura');

create trigger documentos_touch before update on public.documentos
  for each row execute function public.tocar_updated_at();

alter table public.documentos enable row level security;
alter table public.documentos force  row level security;

create policy documentos_select on public.documentos
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin políticas de escritura en ninguna de las dos: todo por RPC, para que no
-- exista ninguna ruta que escriba sin dejar actividad.

-- ---------------------------------------------------------------------------
-- 4. Registrar un archivo ya subido
-- ---------------------------------------------------------------------------
-- La subida va directa del navegador a Storage bajo las políticas de arriba, y
-- después se registra aquí. Dos pasos, con el riesgo de dejar un objeto sin
-- fila si el segundo falla; queda anotado en el plan como barrido pendiente.
create or replace function public.registrar_archivo(
  p_org          uuid,
  p_nombre       text,
  p_ruta         text,
  p_bytes        bigint,
  p_content_type text default null,
  p_contacto     uuid default null,
  p_tarjeta      uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid; v_enviable boolean := true; v_motivo text; v_tipo text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;
  if not public.es_miembro(p_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  -- La ruta tiene que empezar por la organización o las políticas del bucket no
  -- lo protegen. Se comprueba también aquí: un cliente que registre una fila
  -- apuntando a la carpeta de otro no debe poder.
  if p_ruta not like p_org::text || '/%' then
    raise exception 'La ruta del archivo no corresponde a esta organización.' using errcode = '42501';
  end if;

  -- Límites de Meta del documento 03, comprobados al subir.
  v_tipo := coalesce(p_content_type, '');
  if v_tipo like 'image/%' then
    if v_tipo not in ('image/png', 'image/jpeg') then
      v_enviable := false; v_motivo := 'Meta solo acepta PNG y JPEG al enviar imágenes.';
    elsif p_bytes > 8 * 1024 * 1024 then
      v_enviable := false; v_motivo := 'Las imágenes que se envían por Meta no pueden pasar de 8 MB.';
    end if;
  elsif p_bytes > 25 * 1024 * 1024 then
    v_enviable := false; v_motivo := 'Meta no acepta archivos de más de 25 MB.';
  end if;

  insert into public.archivos
    (organization_id, contacto_id, tarjeta_id, nombre, storage_path, content_type,
     bytes, enviable, motivo_no_enviable, subido_por)
  values
    (p_org, p_contacto, p_tarjeta, btrim(p_nombre), p_ruta, nullif(v_tipo, ''),
     p_bytes, v_enviable, v_motivo, v_user)
  returning id into v_id;

  if p_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      p_org, p_tarjeta, 'archivo.subido', 'usuario', v_user,
      jsonb_build_object('nombre', btrim(p_nombre), 'bytes', p_bytes, 'enviable', v_enviable));
  end if;

  return v_id;
end $$;

create or replace function public.borrar_archivo(p_archivo uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_ruta text; v_nombre text; v_tarjeta uuid; v_user uuid := (select auth.uid());
begin
  select organization_id, storage_path, nombre, tarjeta_id
    into v_org, v_ruta, v_nombre, v_tarjeta
    from public.archivos where id = p_archivo;
  if v_org is null then raise exception 'Ese archivo no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  delete from public.archivos where id = p_archivo;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'archivo.borrado', 'usuario', v_user,
      jsonb_build_object('nombre', v_nombre));
  end if;

  -- Se devuelve la ruta para que el cliente borre también el objeto: hacerlo
  -- desde aquí exigiría que la base hablara con Storage.
  return v_ruta;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Documentos
-- ---------------------------------------------------------------------------
create or replace function public.guardar_documento(
  p_contacto  uuid,
  p_tipo      text,
  p_concepto  text,
  p_total     numeric,
  p_moneda    text default 'USD',
  p_estado    text default 'borrador',
  p_numero    text default null,
  p_emitido   date default null,
  p_vence     date default null,
  p_tarjeta   uuid default null,
  p_archivo   uuid default null,
  p_documento uuid default null      -- si viene, se edita en vez de crear
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_user uuid := (select auth.uid()); v_id uuid;
  v_antes jsonb; v_pagado date; v_tarjeta_act uuid;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  select organization_id into v_org from public.contacts where id = p_contacto;
  if v_org is null then raise exception 'Ese contacto no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'El importe no puede ser negativo.' using errcode = '22023';
  end if;
  if p_vence is not null and p_emitido is not null and p_vence < p_emitido then
    raise exception 'La fecha de vencimiento es anterior a la de emisión.' using errcode = '22023';
  end if;

  -- Un pagado necesita fecha: el CHECK lo exige y aquí se rellena sola en vez
  -- de devolver un error de constraint que no le dice nada a nadie.
  v_pagado := case when p_estado = 'pagado' then current_date end;

  if p_documento is null then
    insert into public.documentos
      (organization_id, contacto_id, tarjeta_id, tipo, numero, concepto, total, moneda,
       estado, emitido_en, vence_en, pagado_en, archivo_id, creado_por)
    values
      (v_org, p_contacto, p_tarjeta, p_tipo, nullif(btrim(coalesce(p_numero,'')), ''),
       btrim(p_concepto), p_total, upper(p_moneda), p_estado,
       coalesce(p_emitido, current_date), p_vence, v_pagado, p_archivo, v_user)
    returning id into v_id;

    v_tarjeta_act := coalesce(p_tarjeta, (select id from public.tarjetas
                                           where contact_id = p_contacto and cerrada_en is null limit 1));
    if v_tarjeta_act is not null then
      perform private.registrar_actividad_tarjeta(
        v_org, v_tarjeta_act, 'documento.registrado', 'usuario', v_user,
        jsonb_build_object('tipo', p_tipo, 'concepto', btrim(p_concepto),
                           'total', p_total, 'moneda', upper(p_moneda), 'estado', p_estado));
    end if;
  else
    select jsonb_build_object('estado', estado, 'total', total), tarjeta_id
      into v_antes, v_tarjeta_act
      from public.documentos where id = p_documento and organization_id = v_org;
    if v_antes is null then
      raise exception 'Ese documento no existe.' using errcode = 'P0002';
    end if;

    update public.documentos
       set tipo = p_tipo,
           numero = nullif(btrim(coalesce(p_numero,'')), ''),
           concepto = btrim(p_concepto),
           total = p_total,
           moneda = upper(p_moneda),
           estado = p_estado,
           emitido_en = coalesce(p_emitido, emitido_en),
           vence_en = p_vence,
           pagado_en = case when p_estado = 'pagado' then coalesce(pagado_en, current_date) end,
           archivo_id = p_archivo
     where id = p_documento
    returning id into v_id;

    v_tarjeta_act := coalesce(v_tarjeta_act, (select id from public.tarjetas
                                               where contact_id = p_contacto and cerrada_en is null limit 1));
    if v_tarjeta_act is not null and (v_antes->>'estado') is distinct from p_estado then
      perform private.registrar_actividad_tarjeta(
        v_org, v_tarjeta_act, 'documento.estado', 'usuario', v_user,
        jsonb_build_object('concepto', btrim(p_concepto),
                           'de', v_antes->>'estado', 'a', p_estado,
                           'total', p_total, 'moneda', upper(p_moneda)));
    end if;
  end if;

  return v_id;
end $$;

create or replace function public.borrar_documento(p_documento uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_concepto text; v_tarjeta uuid; v_user uuid := (select auth.uid());
begin
  select organization_id, concepto, tarjeta_id into v_org, v_concepto, v_tarjeta
    from public.documentos where id = p_documento;
  if v_org is null then raise exception 'Ese documento no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  delete from public.documentos where id = p_documento;

  if v_tarjeta is not null then
    perform private.registrar_actividad_tarjeta(
      v_org, v_tarjeta, 'documento.borrado', 'usuario', v_user,
      jsonb_build_object('concepto', v_concepto));
  end if;
end $$;

revoke execute on function public.registrar_archivo(uuid,text,text,bigint,text,uuid,uuid) from public, anon;
revoke execute on function public.borrar_archivo(uuid)   from public, anon;
revoke execute on function public.borrar_documento(uuid) from public, anon;
revoke execute on function public.guardar_documento(uuid,text,text,numeric,text,text,text,date,date,uuid,uuid,uuid)
  from public, anon;

-- ---------------------------------------------------------------------------
-- 6. Los tres números de la pestaña
-- ---------------------------------------------------------------------------
-- Comprado, pendiente y vencido. Es lo que hay que ver ANTES de escribir la
-- respuesta, no después de leer una tabla de veinte filas.
--
-- Lo vencido se CALCULA, no se guarda: un `estado = 'vencido'` almacenado
-- exigiría un cron nocturno y que alguien notara el día que dejara de correr.
-- `vence_en < current_date` no se puede quedar desactualizado.
create view public.resumen_comercial
with (security_invoker = on) as
  select
    d.organization_id,
    d.contacto_id,
    d.moneda,
    coalesce(sum(d.total) filter (
      where d.tipo in ('pedido','factura') and d.estado in ('aceptado','pagado')), 0) as comprado,
    coalesce(sum(d.total) filter (
      where d.tipo in ('pedido','factura') and d.estado in ('enviado','aceptado')), 0) as pendiente,
    coalesce(sum(d.total) filter (
      where d.tipo in ('pedido','factura') and d.estado in ('enviado','aceptado')
        and d.vence_en is not null and d.vence_en < current_date), 0) as vencido,
    count(*) filter (where d.tipo = 'presupuesto' and d.estado = 'enviado') as presupuestos_abiertos,
    count(*) filter (where d.tipo in ('pedido','factura') and d.estado = 'pagado') as compras
  from public.documentos d
 group by d.organization_id, d.contacto_id, d.moneda;

comment on view public.resumen_comercial is
  'Comprado, pendiente y vencido por persona y moneda. Lo vencido se calcula '
  'sobre vence_en: no hay ningún estado almacenado que pueda quedar obsoleto.';
