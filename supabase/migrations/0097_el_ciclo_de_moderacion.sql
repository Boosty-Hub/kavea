-- 0097_el_ciclo_de_moderacion.sql — publicar, ocultar, editar y borrar un comentario.
--
-- POR QUÉ AHORA. Es la nota verbatim con la que Meta rechazó
-- `instagram_manage_comments` el 7-ago: «a complete comment moderation loop…
-- add a comment from your app, edit that comment, and delete it. Then, open the
-- native client to confirm the final state on that post». Kavea sabía responder
-- y nada más: lo publicado desde aquí no volvía a aparecer hasta la siguiente
-- lectura, y no había forma de tocarlo.
--
-- LO QUE INSTAGRAM NO DEJA HACER, y que decide la forma de esto: el texto de un
-- comentario de Instagram NO SE PUEDE EDITAR. Graph expone crear, ocultar,
-- mostrar y borrar; editar no existe en la arista. Así que «editar» aquí es
-- publicar el nuevo y borrar el anterior, EN ESE ORDEN —si falla el segundo paso
-- quedan dos comentarios, que se ven y se arreglan; al revés no queda ninguno—.
-- La interfaz lo dice con esas palabras. Un botón que promete algo que la
-- plataforma no hace es una mentira que se descubre en público.
--
-- QUÉ SE PUEDE TOCAR Y QUÉ NO. Ocultar y mostrar valen para cualquier comentario
-- que esté en nuestra publicación: es moderación, y es de quien tiene la cuenta.
-- Editar y borrar, solo lo que publicó Kavea (`propio`). Borrar el comentario de
-- un cliente desde una bandeja compartida, sin dueño y sin vuelta atrás, es un
-- botón que un día se pulsa por error y no hay manera de deshacerlo.
--
-- EL BORRADO ES BLANDO AQUÍ Y DURO EN META. La fila se queda con `borrado_en`
-- para que el hilo siga contando lo que pasó y la actividad tenga a qué apuntar.
-- En Instagram desaparece de verdad, que es lo que el revisor va a comprobar en
-- el cliente nativo.

alter table public.comentarios
  -- Lo publicó Kavea. Es lo que separa «puedo moderarlo» de «puedo cambiarlo».
  add column if not exists propio      boolean not null default false,
  add column if not exists borrado_en  timestamptz,
  add column if not exists editado_en  timestamptz;

comment on column public.comentarios.propio is
  'Lo publicó Kavea desde la bandeja. Solo esto se puede editar o borrar.';
comment on column public.comentarios.borrado_en is
  'Cuándo se borró en Meta. La fila se queda para que el hilo siga contando lo que pasó.';

-- Las respuestas propias se buscan por el padre al pintar el hilo, y el hilo se
-- pinta en cada visita a un comentario.
create index if not exists comentarios_propios_idx
  on public.comentarios (organization_id, parent_id)
  where propio and borrado_en is null;

-- ---------------------------------------------------------------------------
-- 1. AUTORIZAR. No cambia nada: decide y devuelve lo que el borde necesita.
--
-- Se separa de la anotación porque el estado solo es verdad si Meta dijo que sí.
-- `responder_comentario` hace lo contrario —marca antes de publicar— y ahí es
-- deliberado: un estado adelantado se corrige a la vista y una respuesta
-- duplicada en público no. Aquí no hay ese dilema: nada se duplica por esperar.
-- ---------------------------------------------------------------------------
create or replace function public.moderar_comentario(
  p_comentario uuid,
  p_accion     text,
  p_texto      text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  c public.comentarios%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if p_accion not in ('ocultar', 'mostrar', 'borrar', 'editar') then
    raise exception 'Acción no válida: %', p_accion using errcode = '22023';
  end if;

  -- La pertenencia se comprueba AQUÍ y no se confía en RLS: esta función es
  -- `security definer` y RLS no la mira.
  select * into c
    from public.comentarios cc
   where cc.id = p_comentario
     and exists (
       select 1 from public.organization_members m
        where m.organization_id = cc.organization_id
          and m.user_id = (select auth.uid())
     );

  if c.id is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;
  if c.borrado_en is not null then
    raise exception 'Ese comentario ya está borrado.' using errcode = '22023';
  end if;

  if p_accion in ('editar', 'borrar') and not c.propio then
    raise exception 'Solo se puede editar o borrar lo que se publicó desde Kavea.'
      using errcode = '42501';
  end if;
  if p_accion = 'editar' and coalesce(btrim(p_texto), '') = '' then
    raise exception 'El texto nuevo está vacío.' using errcode = '22023';
  end if;
  if p_accion = 'ocultar' and c.oculto then
    raise exception 'Ese comentario ya está oculto.' using errcode = '22023';
  end if;
  if p_accion = 'mostrar' and not c.oculto then
    raise exception 'Ese comentario no está oculto.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'comentario',   c.id,
    'accion',       p_accion,
    'comment_id',   c.comment_id,
    'parent_id',    c.parent_id,
    'post_id',      c.post_id,
    'asset_id',     c.asset_id,
    'canal',        c.canal,
    'texto',        p_texto,
    'organizacion', c.organization_id
  );
end $fn$;

revoke execute on function public.moderar_comentario(uuid, text, text) from public, anon;
grant  execute on function public.moderar_comentario(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. ANOTAR lo que Meta ya aceptó. Solo el borde, con la clave de servicio.
--
-- Lleva el actor por parámetro porque quien la llama es la función de borde y
-- allí `auth.uid()` es nulo. Sin esto la actividad diría «el sistema ocultó un
-- comentario» de algo que decidió una persona.
-- ---------------------------------------------------------------------------
create or replace function private.anotar_moderacion(
  p_comentario uuid,
  p_accion     text,
  p_actor      uuid,
  p_texto      text default null,
  p_nuevo_id   text default null
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  c public.comentarios%rowtype;
  -- El tipo se escribe ENTERO y no se concatena. Construirlo con
  -- 'comentario.' || ... lo vuelve invisible para el guardián de CI que
  -- comprueba que toda actividad sabe decirse en castellano: busca literales, y
  -- una mitad no es un literal. Ya dijo «63 tipos, todos traducidos» de cuatro
  -- que no sabía que existían.
  v_tipo text := case p_accion
                   when 'ocultar' then 'comentario.oculto'
                   when 'mostrar' then 'comentario.mostrado'
                   when 'borrar'  then 'comentario.borrado'
                   when 'editar'  then 'comentario.editado'
                 end;
begin
  select * into c from public.comentarios cc where cc.id = p_comentario;
  if c.id is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;
  if v_tipo is null then
    raise exception 'Acción no válida: %', p_accion using errcode = '22023';
  end if;

  if p_accion = 'ocultar' then
    update public.comentarios set oculto = true,  updated_at = now() where id = c.id;
  elsif p_accion = 'mostrar' then
    update public.comentarios set oculto = false, updated_at = now() where id = c.id;
  elsif p_accion = 'borrar' then
    update public.comentarios set borrado_en = now(), updated_at = now() where id = c.id;
  elsif p_accion = 'editar' then
    -- El comentario viejo ya no existe en Meta y el nuevo tiene otro id: el
    -- identificador se actualiza o la siguiente acción apuntaría a un fantasma.
    update public.comentarios
       set texto = p_texto,
           comment_id = coalesce(p_nuevo_id, comment_id),
           editado_en = now(),
           updated_at = now()
     where id = c.id;
  else
    raise exception 'Acción no válida: %', p_accion using errcode = '22023';
  end if;

  perform private.registrar_actividad(
    c.organization_id, v_tipo,
    case when p_actor is null then 'sistema' else 'usuario' end, null, p_actor,
    jsonb_build_object('comentario_id', c.id, 'comment_id', c.comment_id, 'canal', c.canal)
  );
end $fn$;

revoke execute on function private.anotar_moderacion(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant  execute on function private.anotar_moderacion(uuid, text, uuid, text, text) to service_role;

create or replace function public.anotar_moderacion(
  p_comentario uuid, p_accion text, p_actor uuid,
  p_texto text default null, p_nuevo_id text default null
) returns void
language sql volatile security definer set search_path = ''
as $$ select private.anotar_moderacion(p_comentario, p_accion, p_actor, p_texto, p_nuevo_id) $$;

revoke execute on function public.anotar_moderacion(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant  execute on function public.anotar_moderacion(uuid, text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. GUARDAR LO PUBLICADO. Sin esto no hay ciclo que cerrar.
--
-- Hasta hoy la respuesta se publicaba en Meta y aquí no quedaba fila: reaparecía
-- —o no— en la siguiente lectura, sin marca de ser nuestra. Un ciclo de
-- moderación necesita que lo recién publicado esté a mano para tocarlo, y el
-- operador necesita ver lo que acaba de escribir sin refrescar contra Meta.
-- ---------------------------------------------------------------------------
create or replace function private.anotar_respuesta(
  p_padre      uuid,
  p_comment_id text,
  p_texto      text,
  p_actor      uuid,
  p_autor      text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare
  padre public.comentarios%rowtype;
  v_id  uuid;
begin
  select * into padre from public.comentarios cc where cc.id = p_padre;
  if padre.id is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;

  -- `comment_id` es único: si Meta reintenta o el operador pulsa dos veces, la
  -- segunda no crea una fila nueva. Devolver el id existente hace que el camino
  -- de reintento acabe igual que el primero.
  select cc.id into v_id from public.comentarios cc where cc.comment_id = p_comment_id;
  if v_id is not null then return v_id; end if;

  insert into public.comentarios (
    organization_id, canal, asset_id, comment_id, parent_id, post_id,
    autor_username, texto, estado, propio, respondido_por, respondido_en
  ) values (
    padre.organization_id, padre.canal, padre.asset_id, p_comment_id,
    padre.comment_id, padre.post_id,
    p_autor, p_texto,
    -- Una respuesta nuestra no es una tarea pendiente de nadie.
    'respondido', true, p_actor, now()
  )
  returning id into v_id;

  return v_id;
end $fn$;

revoke execute on function private.anotar_respuesta(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant  execute on function private.anotar_respuesta(uuid, text, text, uuid, text) to service_role;

create or replace function public.anotar_respuesta(
  p_padre uuid, p_comment_id text, p_texto text, p_actor uuid, p_autor text default null
) returns uuid
language sql volatile security definer set search_path = ''
as $$ select private.anotar_respuesta(p_padre, p_comment_id, p_texto, p_actor, p_autor) $$;

revoke execute on function public.anotar_respuesta(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant  execute on function public.anotar_respuesta(uuid, text, text, uuid, text) to service_role;
