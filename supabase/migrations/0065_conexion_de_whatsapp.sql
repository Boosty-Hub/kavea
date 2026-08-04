-- WhatsApp como INTEGRACIÓN PROPIA, no como un campo más de la conexión de la Página.
--
-- POR QUÉ NO CUELGA DE LA CONEXIÓN QUE YA EXISTE
--
-- `meta_connections` nació centrada en Página: `page_id` era NOT NULL y la fila
-- de Boosty lleva la Página y la cuenta de Instagram juntas, porque en Meta esos
-- dos assets vienen del mismo diálogo de autorización y comparten el Page Access
-- Token. Una WABA no: es otro asset, con otro diálogo, otro token y otra
-- caducidad. Meterla en la misma fila obligaría a rotar dos credenciales a la vez
-- y a que la que se olvide falle en silencio.
--
-- Y hay una razón de producto que pesa más: en la fase 5 cada cliente conecta sus
-- propios canales, uno por uno, con una configuración de Facebook Login for
-- Business por canal. Un cliente puede traer solo WhatsApp, solo Instagram, o los
-- dos en momentos distintos y con semanas de diferencia. Si la fila exige Página,
-- el cliente que solo trae WhatsApp no se puede dar de alta.
--
-- Así que una conexión es (organización, integración), y hay dos formas de
-- integración: Página+Instagram, o WABA+número. El CHECK de abajo las hace
-- excluyentes en vez de dejarlo escrito en un comentario.

-- 1. La forma de Página deja de ser obligatoria.
alter table public.meta_connections alter column page_id drop not null;

alter table public.meta_connections
  add column if not exists waba_id              text,
  add column if not exists phone_number_id      text,
  add column if not exists display_phone_number text,
  add column if not exists verified_name        text,
  -- El estado de aprobación del Display Name. Medido el 4-ago-2026 en el número
  -- de Boosty: `NON_EXISTS`, o sea que el cliente ve el número y no el nombre.
  -- Se guarda porque llega por el webhook `phone_number_name_update` y sin
  -- columna no habría dónde escribirlo.
  add column if not exists name_status          text,
  add column if not exists subscribed_fields_whatsapp text[] not null default '{}';

-- 2. Una conexión es de una forma o de la otra, nunca de las dos ni de ninguna.
--
-- Sin esto, una fila a medio rellenar —Página sin token, o WABA sin número— pasa
-- y el fallo aparece en el despachador, a los días, como un error de Meta.
alter table public.meta_connections
  drop constraint if exists meta_connections_forma;
alter table public.meta_connections
  add constraint meta_connections_forma check (
    (page_id is not null and waba_id is null and phone_number_id is null)
    or
    (page_id is null and waba_id is not null and phone_number_id is not null)
  );

-- 3. Un número de teléfono no puede estar en dos organizaciones.
--
-- Es la misma protección que ya tiene `meta_asset_routes` por su clave primaria,
-- pero aquí arriba: si dos clientes registran el mismo número, los mensajes de
-- uno acabarían en la bandeja del otro y RLS no lo vería venir, porque las dos
-- filas serían legítimas cada una en su tenant.
create unique index if not exists meta_connections_phone_number_unico
  on public.meta_connections (phone_number_id)
  where phone_number_id is not null;

create unique index if not exists meta_connections_waba_unico
  on public.meta_connections (waba_id)
  where waba_id is not null;

-- 4. Una ranura de token propia para WhatsApp.
--
-- NO se reutiliza `page_access_token_*`. Guardar un token de system user en una
-- columna que se llama «page access token» es exactamente el error que costó una
-- investigación con `conversations.preview_texto`: una columna cuyo nombre miente
-- sobrevive a todas las revisiones porque suena plausible.
--
-- Se sigue el precedente de `bisu_token_*`, que ya es una segunda ranura opcional
-- en esta misma tabla: mismo esquema AES-256-GCM, `kid` desde el primer día para
-- que rotar no exija descifrar y volver a cifrar todo a la vez.
alter table private.meta_credentials
  add column if not exists whatsapp_token_cipher bytea,
  add column if not exists whatsapp_token_nonce  bytea,
  add column if not exists whatsapp_token_kid    text;

-- El token de Página deja de ser obligatorio, porque una conexión de WhatsApp no
-- tiene ninguno. Lo que se conserva es la garantía real: la fila tiene que llevar
-- AL MENOS un juego de credenciales completo. Una fila sin ninguno es una conexión
-- que no puede ni leer ni enviar, y hoy eso lo impedía el NOT NULL.
alter table private.meta_credentials alter column page_access_token_cipher drop not null;
alter table private.meta_credentials alter column page_access_token_nonce  drop not null;
alter table private.meta_credentials alter column page_access_token_kid    drop not null;

alter table private.meta_credentials
  drop constraint if exists meta_credentials_algun_token;
alter table private.meta_credentials
  add constraint meta_credentials_algun_token check (
    (page_access_token_cipher is not null
      and page_access_token_nonce is not null
      and page_access_token_kid   is not null)
    or
    (whatsapp_token_cipher is not null
      and whatsapp_token_nonce is not null
      and whatsapp_token_kid   is not null)
  );

-- 5. Guardar y leer la credencial de WhatsApp.
--
-- Envoltorio en `public` porque PostgREST no expone el esquema `private`. Es el
-- patrón que existe desde la 0020 y que ya se olvidó una vez, con el
-- despachador devolviendo PGRST202 y la fila quieta en la cola.
create or replace function private.guardar_credencial_whatsapp(
  p_conexion uuid, p_cipher bytea, p_nonce bytea, p_kid text
) returns void
language sql security definer set search_path = ''
as $$
  insert into private.meta_credentials
    (meta_connection_id, whatsapp_token_cipher, whatsapp_token_nonce,
     whatsapp_token_kid, cifrado_en)
  values (p_conexion, p_cipher, p_nonce, p_kid, now())
  on conflict (meta_connection_id) do update
    set whatsapp_token_cipher = excluded.whatsapp_token_cipher,
        whatsapp_token_nonce  = excluded.whatsapp_token_nonce,
        whatsapp_token_kid    = excluded.whatsapp_token_kid,
        rotado_en = now();
$$;

create or replace function public.guardar_credencial_whatsapp(
  p_conexion uuid, p_cipher bytea, p_nonce bytea, p_kid text
) returns void
language sql security definer set search_path = ''
as $$ select private.guardar_credencial_whatsapp(p_conexion, p_cipher, p_nonce, p_kid) $$;

create or replace function public.credencial_whatsapp_de_conexion(p_conexion uuid)
returns table(whatsapp_token_cipher bytea, whatsapp_token_nonce bytea, whatsapp_token_kid text)
language sql stable security definer set search_path = ''
as $$
  select whatsapp_token_cipher, whatsapp_token_nonce, whatsapp_token_kid
    from private.meta_credentials
   where meta_connection_id = p_conexion;
$$;

revoke all on function public.guardar_credencial_whatsapp(uuid, bytea, bytea, text) from anon, authenticated;
revoke all on function public.credencial_whatsapp_de_conexion(uuid) from anon, authenticated;

-- 6. La conexión de WhatsApp de Boosty, con datos MEDIDOS el 4 de agosto de 2026.
--
-- El número existe, está CONNECTED en Cloud API, con calidad GREEN, y su WABA
-- tiene 25 plantillas de marketing aprobadas: la operación de WhatsApp de Boosty
-- lleva tiempo viva, solo que por la app de Kommo. Esta fila es lo que hace que
-- también entre por Kavea.
insert into public.meta_connections
  (id, organization_id, page_id, waba_id, phone_number_id,
   display_phone_number, verified_name, name_status, business_id,
   graph_api_version, subscribed_fields_whatsapp, subscription_ok, estado)
values
  ('00000000-0000-4000-8000-00000000c002',
   '00000000-0000-4000-8000-000000000001',
   null,
   '1415042803155441',
   '729819913546625',
   '+1 829-954-3803',
   'Boosty Digital',
   'NON_EXISTS',
   '2167414613399354',
   'v26.0',
   array['messages','smb_message_echoes','phone_number_quality_update',
         'phone_number_name_update','message_template_status_update',
         'message_template_quality_update','template_category_update',
         'account_update','account_review_update','account_alerts',
         'business_capability_update','security'],
   true,
   'connected')
on conflict (id) do nothing;

-- 7. El canal.
insert into public.channels (id, organization_id, meta_connection_id, canal, nombre, activo)
values ('00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-00000000c002',
        'whatsapp',
        '+1 829-954-3803',
        true)
on conflict (id) do nothing;

-- 8. El enrutado, que es lo único que decide si un mensaje encuentra su tenant.
--
-- LA CLAVE ES EL phone_number_id, NO LA WABA. Medido el 4-ago-2026: `entry[].id`
-- de un webhook de WhatsApp vale la WABA, y el asset de mensajería vive dos
-- niveles más abajo, en `changes[].value.metadata.phone_number_id`. Enrutar por
-- `entry.id` deja el mensaje sin organización y dispara `tenant_no_resuelto`.
-- El CHECK de `tipo` estaba cerrado a los dos assets que existían: `page` e
-- `ig_business_account`. Un número de WhatsApp es un tercer tipo de asset y sin
-- ampliarlo el insert de abajo revienta. Se amplía en vez de quitarse: la lista
-- cerrada es lo que impide que un `tipo` mal escrito enrute a ninguna parte.
alter table public.meta_asset_routes
  drop constraint if exists meta_asset_routes_tipo_check;
alter table public.meta_asset_routes
  add constraint meta_asset_routes_tipo_check check (
    tipo = any (array['page', 'ig_business_account', 'whatsapp_phone_number'])
  );

insert into public.meta_asset_routes (asset_id, tipo, organization_id, meta_connection_id)
values ('729819913546625',
        'whatsapp_phone_number',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-00000000c002')
on conflict (asset_id) do nothing;

comment on column public.meta_connections.phone_number_id is
  'Asset de mensajería de WhatsApp. Es la clave de enrutado, no waba_id: el entry.id del webhook trae la WABA y el número está dentro de changes[].value.metadata.';
