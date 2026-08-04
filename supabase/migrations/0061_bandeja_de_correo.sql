-- 0061_bandeja_de_correo.sql — el correo de kavea.ai, dentro de Kavea.
--
-- QUÉ RESUELVE
--
-- `support@kavea.ai` está publicado en la política de privacidad, en los
-- términos y en la página de eliminación de datos. Meta rastrea esas páginas y
-- una dirección publicada que nadie lee es peor que no publicarla. Hasta ahora
-- el correo entrante vivía solo en Resend y ninguna superficie de Kavea lo
-- mostraba.
--
-- POR QUÉ SE CONSULTA AL ABRIR Y NO POR WEBHOOK
--
-- Decidido por Gabriel el 3 de agosto de 2026. El invariante de `docs/03` que
-- exige arquitectura webhook-first es de los canales de Meta, y existe por una
-- razón que aquí no se da: la Conversations API está topada a 2 llamadas por
-- segundo y solo devuelve los veinte mensajes más recientes, así que el
-- histórico no es recuperable y hay que capturarlo al vuelo o perderlo.
--
-- Resend no tiene ese problema: `GET /emails/inbound` lista todo, con `has_more`
-- y cursor. Nada se pierde por no estar escuchando. Así que se sincroniza al
-- abrir el módulo: sin endpoint público, sin firmas Svix que verificar y sin un
-- cron más que vigilar. El coste es que la primera carga tarda.
--
-- POR QUÉ LOS ADJUNTOS SE DESCARGAN Y NO SE ENLAZAN
--
-- Medido el 3 de agosto de 2026: el `download_url` que devuelve Resend viene con
-- `expires_at` a una hora. Enlazarlo daría una bandeja donde los adjuntos
-- funcionan la primera tarde y dan 403 para siempre después. Se descargan y se
-- guardan.
--
-- Van a Supabase Storage y no a R2 por dos razones. Una, R2 no está
-- aprovisionado: no hay ni una credencial suya en el proyecto. Dos, un adjunto
-- de correo no es media de Meta, así que el invariante de `docs/03` que prohíbe
-- persistir binarios entrantes no aplica — ese existe porque Meta rechaza App
-- Reviews por cachear Platform Data, y un correo no es Platform Data.
--
-- QUIÉN PUEDE LEER ESTO
--
-- Solo el staff de Boosty, y por RPC. Misma forma que `solicitudes`: RLS
-- forzada y CERO políticas, porque una bandeja de correo de soporte contiene
-- todo lo que la gente escribe cuando tiene un problema, incluidas cosas que no
-- deberían haber escrito.

create table public.correos (
  id            uuid primary key default gen_random_uuid(),

  -- El id de Resend. En un entrante es el del correo recibido; en un saliente,
  -- el que devuelve `POST /emails`. Es la clave de deduplicación de la
  -- sincronización: sin ella, abrir el módulo dos veces duplica la bandeja.
  resend_id     text not null,

  direccion     text not null check (direccion in ('entrante', 'saliente')),

  de            text not null,
  para          text[] not null default '{}',
  cc            text[] not null default '{}',
  bcc           text[] not null default '{}',
  responder_a   text[] not null default '{}',

  -- `received_for` de Resend: a qué dirección del dominio llegó de verdad. El MX
  -- captura kavea.ai entero, así que aquí caen también no-reply@, hola@ y lo que
  -- alguien invente. Sin esta columna no se puede filtrar por buzón.
  recibido_para text,

  asunto        text,
  texto         text,
  html          text,

  -- Cabeceras RFC 5322 para hilar. Se guardan desde el día uno porque
  -- reconstruir hilos a posteriori es imposible: la información no está en
  -- ningún otro sitio y Resend no agrupa por conversación.
  message_id    text,
  in_reply_to   text,
  referencias   text[] not null default '{}',

  -- Fecha del correo, no de la fila. Un entrante de hace tres días que se
  -- sincroniza hoy tiene que ordenarse por cuándo se escribió.
  fecha         timestamptz not null,
  leido_en      timestamptz,
  insertado_en  timestamptz not null default now()
);

create unique index correos_resend_idx on public.correos (resend_id);
create index correos_fecha_idx      on public.correos (fecha desc);
create index correos_hilo_idx       on public.correos (in_reply_to) where in_reply_to is not null;
create index correos_message_id_idx on public.correos (message_id)  where message_id is not null;
create index correos_sin_leer_idx   on public.correos (fecha desc)
  where direccion = 'entrante' and leido_en is null;

alter table public.correos enable row level security;
alter table public.correos force  row level security;

comment on table public.correos is
  'Correo de kavea.ai, entrante y saliente. Se sincroniza desde Resend al abrir '
  'el modulo. Sin politicas: se entra solo por los RPC de staff.';

create table public.correo_adjuntos (
  id          uuid primary key default gen_random_uuid(),
  correo_id   uuid not null references public.correos(id) on delete cascade,

  resend_id   text not null,
  nombre      text not null,
  tipo        text,
  bytes       bigint,

  -- Ruta dentro del bucket `correo-adjuntos`. Nula mientras la descarga no haya
  -- terminado: un adjunto anotado y sin bajar es un estado real y hay que poder
  -- distinguirlo de uno bajado.
  ruta        text,
  guardado_en timestamptz,

  insertado_en timestamptz not null default now()
);

create unique index correo_adjuntos_resend_idx on public.correo_adjuntos (correo_id, resend_id);
create index correo_adjuntos_correo_idx on public.correo_adjuntos (correo_id);

alter table public.correo_adjuntos enable row level security;
alter table public.correo_adjuntos force  row level security;

comment on table public.correo_adjuntos is
  'Adjuntos de los correos. Se descargan porque el download_url de Resend caduca '
  'a la hora. El binario vive en Supabase Storage, aqui solo la ruta.';

-- ---------------------------------------------------------------------------
-- El bucket
-- ---------------------------------------------------------------------------
-- Privado. Un adjunto de soporte puede ser una factura, un pantallazo con datos
-- de un cliente o un documento de identidad, y un bucket público sería una URL
-- adivinable a todo eso.
insert into storage.buckets (id, name, public)
values ('correo-adjuntos', 'correo-adjuntos', false)
on conflict (id) do nothing;

create policy "correo adjuntos: solo staff lee"
  on storage.objects for select
  using (bucket_id = 'correo-adjuntos' and public.es_staff());

create policy "correo adjuntos: solo staff escribe"
  on storage.objects for insert
  with check (bucket_id = 'correo-adjuntos' and public.es_staff());

-- ---------------------------------------------------------------------------
-- Lo que lee el panel
-- ---------------------------------------------------------------------------
create or replace function public.panel_correos(p_limite int default 200)
returns setof public.correos
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  return query
    select * from public.correos
     order by fecha desc
     limit least(greatest(coalesce(p_limite, 200), 1), 500);
end $$;

create or replace function public.panel_correo_adjuntos(p_correo uuid)
returns setof public.correo_adjuntos
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  return query
    select * from public.correo_adjuntos
     where correo_id = p_correo
     order by nombre;
end $$;

-- ---------------------------------------------------------------------------
-- Lo que escribe la sincronización
-- ---------------------------------------------------------------------------
-- Devuelve `nuevo` a propósito. La sincronización necesita saber si este correo
-- ya estaba para NO volver a descargar sus adjuntos: bajar 5 MB en cada apertura
-- del módulo por un correo de la semana pasada es gratis de evitar.
create or replace function public.guardar_correo_entrante(
  p_resend_id     text,
  p_de            text,
  p_para          text[],
  p_asunto        text,
  p_texto         text,
  p_html          text,
  p_fecha         timestamptz,
  p_recibido_para text default null,
  p_cc            text[] default '{}',
  p_bcc           text[] default '{}',
  p_responder_a   text[] default '{}',
  p_message_id    text default null,
  p_in_reply_to   text default null,
  p_referencias   text[] default '{}'
)
returns table (id uuid, nuevo boolean)
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  select c.id into v_id from public.correos c where c.resend_id = p_resend_id;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  insert into public.correos (
    resend_id, direccion, de, para, cc, bcc, responder_a, recibido_para,
    asunto, texto, html, message_id, in_reply_to, referencias, fecha
  ) values (
    p_resend_id, 'entrante', p_de,
    coalesce(p_para, '{}'), coalesce(p_cc, '{}'), coalesce(p_bcc, '{}'),
    coalesce(p_responder_a, '{}'), p_recibido_para,
    p_asunto, p_texto, p_html, p_message_id, p_in_reply_to,
    coalesce(p_referencias, '{}'), p_fecha
  )
  returning correos.id into v_id;

  return query select v_id, true;
end $$;

create or replace function public.registrar_correo_saliente(
  p_resend_id   text,
  p_para        text[],
  p_asunto      text,
  p_texto       text,
  p_de          text,
  p_in_reply_to text default null,
  p_referencias text[] default '{}'
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  insert into public.correos (
    resend_id, direccion, de, para, asunto, texto,
    in_reply_to, referencias, fecha
  ) values (
    p_resend_id, 'saliente', p_de, coalesce(p_para, '{}'), p_asunto, p_texto,
    p_in_reply_to, coalesce(p_referencias, '{}'), now()
  )
  returning correos.id into v_id;

  return v_id;
end $$;

create or replace function public.guardar_adjunto_de_correo(
  p_correo    uuid,
  p_resend_id text,
  p_nombre    text,
  p_tipo      text default null,
  p_bytes     bigint default null,
  p_ruta      text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;

  insert into public.correo_adjuntos (correo_id, resend_id, nombre, tipo, bytes, ruta, guardado_en)
  values (p_correo, p_resend_id, p_nombre, p_tipo, p_bytes, p_ruta,
          case when p_ruta is not null then now() end)
  on conflict (correo_id, resend_id) do update
     set ruta = coalesce(excluded.ruta, public.correo_adjuntos.ruta),
         guardado_en = coalesce(excluded.guardado_en, public.correo_adjuntos.guardado_en)
  returning correo_adjuntos.id into v_id;

  return v_id;
end $$;

create or replace function public.marcar_correo_leido(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Boosty.' using errcode = '42501';
  end if;
  update public.correos set leido_en = coalesce(leido_en, now()) where id = p_id;
end $$;

revoke execute on function public.panel_correos(int) from public, anon;
revoke execute on function public.panel_correo_adjuntos(uuid) from public, anon;
revoke execute on function public.guardar_correo_entrante(text,text,text[],text,text,text,timestamptz,text,text[],text[],text[],text,text,text[]) from public, anon;
revoke execute on function public.registrar_correo_saliente(text,text[],text,text,text,text,text[]) from public, anon;
revoke execute on function public.guardar_adjunto_de_correo(uuid,text,text,text,bigint,text) from public, anon;
revoke execute on function public.marcar_correo_leido(uuid) from public, anon;
