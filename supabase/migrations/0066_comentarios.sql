-- Comentarios de Instagram y Facebook.
--
-- POR QUÉ SON UN CAMINO APARTE Y NO UN CANAL MÁS
--
-- El comentario de `reconciliar-suscripciones` lo dejó escrito el 2 de agosto y
-- sigue siendo la razón: un comentario NO tiene ventana de 24 h, NO pertenece a
-- ninguna conversación, y trae `comment_id` en vez de PSID o IGSID. Meterlos en
-- `messages` obligaría a que `ventana_de()` devolviera algo para una fila que no
-- tiene reloj, y a que `conversations` tuviera filas sin hilo.
--
-- Y hay una diferencia de privacidad que decide el modelo: un mensaje directo es
-- privado entre dos, un comentario es PÚBLICO y lo ve cualquiera. Responder a un
-- comentario en público con datos que el contacto dio en privado es una fuga, así
-- que las dos cosas no comparten tabla ni se unen por defecto.
--
-- LO QUE ESTE MODELO NO HACE, a propósito: no une el comentario con el contacto.
-- El autor de un comentario de Instagram llega con un id de comentario y un
-- username, y cruzarlo con el IGSID de la bandeja no está confirmado que sea
-- posible. Se guarda lo que llega; unir personas es la fase de duplicados, que ya
-- existe y que NUNCA une sola.

create table if not exists public.comentarios (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- El canal, con la misma lista cerrada que el resto del sistema. Los
  -- comentarios existen en Instagram y en Facebook, no en WhatsApp.
  canal            text not null check (canal in ('instagram', 'messenger')),

  -- El asset por el que entró: la cuenta de IG o la Página. Es lo que enlaza con
  -- `meta_asset_routes` y por tanto con el tenant.
  asset_id         text not null,

  -- IDENTIDAD DE META. `comment_id` es único por comentario y es la clave de
  -- deduplicación: Meta reintrega el mismo evento y sin esto un reintento crea
  -- una fila nueva.
  comment_id       text not null,
  -- El comentario padre, cuando es una respuesta a otro comentario. Null en los
  -- de primer nivel.
  parent_id        text,
  -- La publicación sobre la que se comenta. Un hilo de comentarios sin saber de
  -- qué post es no se puede ni abrir en Instagram.
  post_id          text,

  -- EL AUTOR, con lo que Meta manda y nada más. `autor_id` es scoped a la app,
  -- no es el IGSID de la mensajería, y confundirlos es enseñar la conversación
  -- privada de alguien bajo el nombre de otro.
  autor_id         text,
  autor_username   text,

  texto            text,
  -- Un comentario puede llegar sin texto: solo con una imagen o un sticker.
  adjuntos         jsonb not null default '[]'::jsonb,

  -- Estado de trabajo, no de Meta. Es lo que hace que un comentario sea una
  -- tarea y no una notificación que se pierde.
  estado           text not null default 'nuevo'
                     check (estado in ('nuevo', 'respondido', 'ignorado')),
  -- `oculto` lo decide Meta cuando alguien lo esconde, y hay que saberlo: seguir
  -- respondiendo a un comentario oculto es hablarle a una pared.
  oculto           boolean not null default false,

  meta_timestamp_ms bigint,
  raw              jsonb not null,

  respondido_en    timestamptz,
  respondido_por   uuid references auth.users(id) on delete set null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- La deduplicación va por (organización, comentario) y no por comment_id solo:
  -- así dos tenants nunca colisionan si Meta reutilizara un id, y el índice
  -- empieza por organization_id, que es lo que exige el canario C2.
  unique (organization_id, comment_id)
);

-- RLS y FORCE, como toda tabla de negocio. FORCE importa: sin él, el dueño de la
-- tabla se salta sus propias políticas y cualquier función `security definer`
-- pasaría por encima sin querer.
alter table public.comentarios enable row level security;
alter table public.comentarios force  row level security;

-- Lectura: solo miembros de la organización. Nada de `for all`: la política de
-- membresías con `for all` es exactamente el fallo que permitía escalar a
-- propietario, y está anotado en la bitácora del 2 de agosto.
drop policy if exists comentarios_lee_miembro on public.comentarios;
create policy comentarios_lee_miembro on public.comentarios
  for select to authenticated
  using (exists (
    select 1 from public.organization_members m
     where m.organization_id = comentarios.organization_id
       and m.user_id = auth.uid()
  ));

-- Escritura: NINGUNA política. La ingesta entra por el rol de servicio desde la
-- función de borde, y lo que hace un operador pasa por RPC para que quede
-- actividad. Un `insert` directo desde el navegador no debe existir.

revoke all on public.comentarios from anon, authenticated;
grant select on public.comentarios to authenticated;

-- El índice que sirve la pantalla: los nuevos primero, por organización.
create index if not exists comentarios_bandeja_idx
  on public.comentarios (organization_id, estado, created_at desc);

-- Y el del hilo de una publicación.
create index if not exists comentarios_post_idx
  on public.comentarios (organization_id, post_id, created_at);

comment on table public.comentarios is
  'Comentarios públicos de Instagram y Facebook. Camino aparte de messages: sin ventana de 24 h, sin conversación, y con comment_id en vez de PSID/IGSID. Un comentario es público y un mensaje no: responder en público con datos dados en privado es una fuga.';

comment on column public.comentarios.autor_id is
  'Scoped a la app. NO es el IGSID de la mensajería y no se debe cruzar con contact_identities sin confirmarlo: hacerlo enseñaría la conversación privada de alguien bajo el nombre de otro.';
