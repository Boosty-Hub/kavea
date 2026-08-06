-- 0077_responder_comentario_registraba_mal.sql — los dos RPC de comentarios no funcionaban.
--
-- QUÉ ARREGLA
--
-- `responder_comentario` y `marcar_comentario`, de la 0067, llamaban a
--
--   public.registrar_actividad(v_org, 'comentario_respondido', jsonb)
--
-- que NO EXISTE. La real vive en `private` y es
--
--   private.registrar_actividad(p_org, p_tipo, p_actor_tipo, p_conv, p_user,
--                               p_detalle, p_visibilidad)
--
-- Otro esquema, otro número de argumentos y otro orden. Las dos funciones han
-- estado rotas desde el 4 de agosto y nadie se enteró porque no había pantalla
-- que las llamara: se descubrió hoy, la primera vez que un operador pulsó
-- «Responder en público» y recibió un 42883.
--
-- Y EL NOMBRE DEL TIPO TAMBIÉN ESTABA MAL. Todo el sistema usa `algo.accion` con
-- punto —`contacto.editado`, `mensaje.encolado`, `tarjeta.cerrada`— y la 0067
-- escribió `comentario_respondido` con guion bajo. No es cosmético: el guardián
-- de CI que comprueba que toda actividad sabe decirse en castellano busca
-- literales CON PUNTO, así que un nombre con guion bajo le resulta invisible.
-- Por eso el guardián decía «57 tipos, todos traducidos» mientras estos dos no
-- estaban traducidos ni existían. El patrón del guardián se amplía en el mismo
-- commit.

create or replace function public.responder_comentario(p_comentario uuid, p_texto text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org  uuid;
  v_cid  text;
  v_canal text;
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'La respuesta está vacía.' using errcode = '22023';
  end if;

  -- La pertenencia se comprueba AQUÍ y no se confía en RLS, porque esta función
  -- es `security definer` y RLS no la mira.
  select c.organization_id, c.comment_id, c.canal
    into v_org, v_cid, v_canal
    from public.comentarios c
   where c.id = p_comentario
     and exists (
       select 1 from public.organization_members m
        where m.organization_id = c.organization_id
          and m.user_id = (select auth.uid())
     );

  if v_org is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;

  update public.comentarios
     set estado = 'respondido',
         respondido_en = now(),
         respondido_por = (select auth.uid()),
         updated_at = now()
   where id = p_comentario;

  perform private.registrar_actividad(
    v_org, 'comentario.respondido', 'usuario', null, v_user,
    jsonb_build_object('comentario_id', p_comentario, 'comment_id', v_cid, 'canal', v_canal)
  );

  return jsonb_build_object('comment_id', v_cid, 'canal', v_canal, 'texto', p_texto);
end;
$$;

revoke all on function public.responder_comentario(uuid, text) from public, anon;
grant execute on function public.responder_comentario(uuid, text) to authenticated;

create or replace function public.marcar_comentario(p_comentario uuid, p_estado text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if p_estado not in ('nuevo', 'ignorado') then
    raise exception 'Estado no válido: %', p_estado using errcode = '22023';
  end if;

  select c.organization_id into v_org
    from public.comentarios c
   where c.id = p_comentario
     and exists (select 1 from public.organization_members m
                  where m.organization_id = c.organization_id
                    and m.user_id = (select auth.uid()));
  if v_org is null then
    raise exception 'No existe ese comentario.' using errcode = 'P0002';
  end if;

  update public.comentarios set estado = p_estado, updated_at = now() where id = p_comentario;

  perform private.registrar_actividad(
    v_org, 'comentario.marcado', 'usuario', null, v_user,
    jsonb_build_object('comentario_id', p_comentario, 'estado', p_estado)
  );
end;
$$;

revoke all on function public.marcar_comentario(uuid, text) from public, anon;
grant execute on function public.marcar_comentario(uuid, text) to authenticated;
