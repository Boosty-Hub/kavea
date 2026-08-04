-- Ingesta de comentarios, y responder a uno.
--
-- POR QUÉ SE RENOMBRA `aplicar_efecto` EN VEZ DE REESCRIBIRLA
--
-- Añadir una rama a esa función exigiría un `create or replace` con su cuerpo
-- entero: cientos de líneas de lógica de mensajes, adjuntos y eventos que ya
-- funcionan y que no tengo nada que decirles. Copiarlas para tocar el final es la
-- forma más fácil de introducir un cambio que nadie pidió en algo que ya va bien.
--
-- Así que la original se renombra a `aplicar_efecto_mensajeria`, intacta, y el
-- nombre que todo el mundo llama pasa a ser un envoltorio que atiende los
-- comentarios y delega el resto. Reversible con dos líneas.

alter function private.aplicar_efecto(jsonb) rename to aplicar_efecto_mensajeria;

create or replace function private.aplicar_efecto(e jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (e->>'tipo') <> 'comentario.upsert' then
    return private.aplicar_efecto_mensajeria(e);
  end if;

  -- Sin `comment_id` no hay clave de deduplicación, y sin ella un reintento de
  -- Meta crea una fila nueva por cada entrega. Se descarta diciendo por qué en
  -- vez de insertar algo que no se puede volver a encontrar.
  if coalesce(e->>'comment_id', '') = '' then
    return jsonb_build_object('estado', 'descartado', 'motivo', 'sin comment_id');
  end if;

  insert into public.comentarios (
    organization_id, canal, asset_id, comment_id, parent_id, post_id,
    autor_id, autor_username, texto, oculto, meta_timestamp_ms, raw
  ) values (
    (e->>'organization_id')::uuid,
    e->>'canal',
    e->>'asset_id',
    e->>'comment_id',
    nullif(e->>'parent_id', ''),
    nullif(e->>'post_id', ''),
    nullif(e->>'autor_id', ''),
    nullif(e->>'autor_username', ''),
    nullif(e->>'texto', ''),
    coalesce((e->>'borrado')::boolean, false),
    (e->>'meta_timestamp_ms')::bigint,
    coalesce(e->'raw', '{}'::jsonb)
  )
  -- REENTRANTE A PROPÓSITO. Meta reintrega, y un comentario editado llega otra
  -- vez con el mismo id y otro texto. El upsert refresca lo que puede cambiar y
  -- NO toca `estado` ni `respondido_en`: que alguien haya respondido no se
  -- deshace porque el autor edite su comentario.
  on conflict (organization_id, comment_id) do update
    set texto      = excluded.texto,
        oculto     = excluded.oculto,
        raw        = excluded.raw,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('estado', 'aplicado', 'tipo', 'comentario', 'id', v_id);
end;
$$;

-- Responder a un comentario.
--
-- Devuelve lo que hay que mandarle a Meta y registra la actividad, pero NO llama
-- al grafo: eso es trabajo de la función de borde, que es la única que tiene el
-- token. Aquí solo se decide si se puede y se deja constancia de quién lo hizo.
create or replace function public.responder_comentario(p_comentario uuid, p_texto text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org  uuid;
  v_cid  text;
  v_canal text;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'La respuesta está vacía.' using errcode = '22023';
  end if;

  -- La pertenencia se comprueba AQUÍ y no se confía en RLS, porque esta función
  -- es `security definer` y RLS no la mira. Es el mismo cuidado que hubo que
  -- escribir a mano en `renderizar_plantilla` al pasarla a definer.
  select c.organization_id, c.comment_id, c.canal
    into v_org, v_cid, v_canal
    from public.comentarios c
   where c.id = p_comentario
     and exists (
       select 1 from public.organization_members m
        where m.organization_id = c.organization_id
          and m.user_id = auth.uid()
     );

  if v_org is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;

  update public.comentarios
     set estado = 'respondido',
         respondido_en = now(),
         respondido_por = auth.uid(),
         updated_at = now()
   where id = p_comentario;

  -- Toda función que registra algo necesita su línea en `describir()`. Van tres
  -- veces que el hilo escupe el identificador técnico por añadir el tipo en la
  -- base y no en la interfaz.
  perform public.registrar_actividad(
    v_org, 'comentario_respondido',
    jsonb_build_object('comentario_id', p_comentario, 'comment_id', v_cid)
  );

  return jsonb_build_object('comment_id', v_cid, 'canal', v_canal, 'texto', p_texto);
end;
$$;

revoke all on function public.responder_comentario(uuid, text) from anon;
grant execute on function public.responder_comentario(uuid, text) to authenticated;

-- Ocultar y reabrir sin respuesta: dos acciones que la pantalla necesita y que
-- también tienen que dejar rastro.
create or replace function public.marcar_comentario(p_comentario uuid, p_estado text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if p_estado not in ('nuevo', 'ignorado') then
    raise exception 'Estado no válido: %', p_estado using errcode = '22023';
  end if;

  select c.organization_id into v_org
    from public.comentarios c
   where c.id = p_comentario
     and exists (select 1 from public.organization_members m
                  where m.organization_id = c.organization_id and m.user_id = auth.uid());
  if v_org is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;

  update public.comentarios set estado = p_estado, updated_at = now() where id = p_comentario;
  perform public.registrar_actividad(v_org, 'comentario_marcado',
    jsonb_build_object('comentario_id', p_comentario, 'estado', p_estado));
end;
$$;

revoke all on function public.marcar_comentario(uuid, text) from anon;
grant execute on function public.marcar_comentario(uuid, text) to authenticated;
