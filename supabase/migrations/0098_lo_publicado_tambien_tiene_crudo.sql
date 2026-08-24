-- 0098_lo_publicado_tambien_tiene_crudo.sql — `anotar_respuesta` no insertaba `raw`.
--
-- QUÉ PASÓ. La 0097 añadió la fila de la respuesta propia y se olvidó de `raw`,
-- que la 0066 declara `not null`. El insert reventó con 23502 en la primera
-- prueba real, DESPUÉS de que Meta ya hubiera publicado el comentario: quedó
-- uno suelto en la publicación de Instagram que Kavea no sabía que era suyo, y
-- por tanto no podía ni editar ni borrar. El aviso que la función de borde
-- devuelve —«salió en Meta pero no se pudo guardar aquí»— es lo que lo dijo, y
-- por eso está puesto: sin él la pantalla habría dicho «publicado» y ya.
--
-- QUÉ VA EN `raw` PARA UNA FILA NUESTRA. La columna existe porque «el día que la
-- forma cambie, el crudo es lo único que lo explica», y eso vale igual aquí: lo
-- que se guarda es lo que Kavea envió y el id que Meta devolvió, con `origen`
-- diciendo que esta fila no vino de una lectura. Inventar la forma de un
-- comentario de Graph que nadie leyó sería peor que decir la verdad pequeña.

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
    autor_username, texto, estado, propio, respondido_por, respondido_en,
    raw, meta_timestamp_ms
  ) values (
    padre.organization_id, padre.canal, padre.asset_id, p_comment_id,
    padre.comment_id, padre.post_id,
    p_autor, p_texto,
    -- Una respuesta nuestra no es una tarea pendiente de nadie.
    'respondido', true, p_actor, now(),
    jsonb_build_object(
      'id', p_comment_id, 'text', p_texto, 'username', p_autor, 'origen', 'kavea'),
    (extract(epoch from now()) * 1000)::bigint
  )
  returning id into v_id;

  return v_id;
end $fn$;
