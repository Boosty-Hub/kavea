-- 0096_la_actividad_del_embudo_en_palabras.sql
--
-- La 0095 registraba `canal.embudo` con `{canal: <uuid>, embudo: <uuid>}`. El
-- guardián de CI —«Toda actividad sabe decirse en castellano»— lo cazó al no
-- encontrar texto para el tipo nuevo, y con razón: aunque lo hubiera tenido, la
-- frase habría salido «cambió el embudo de 4f3c… a 2298…».
--
-- La actividad la lee una persona buscando qué pasó en su espacio. Los
-- identificadores no se leen, así que se guardan los NOMBRES —el canal y el
-- embudo— en el momento de la acción. Si mañana alguien renombra el embudo, el
-- registro sigue diciendo cómo se llamaba cuando se hizo el cambio, que es lo
-- correcto en un histórico.

create or replace function public.asignar_embudo_a_canal(
  p_canal uuid, p_embudo uuid
)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org    uuid;
  v_canal  text;
  v_nombre text;
  v_embudo text;
begin
  select organization_id, canal::text, nombre
    into v_org, v_canal, v_nombre
    from public.channels where id = p_canal;

  if v_org is null then
    raise exception 'No existe ese canal.' using errcode = 'P0002';
  end if;
  if not public.puede(v_org, 'configurar') then
    raise exception 'No puedes configurar los canales de este espacio.' using errcode = '42501';
  end if;

  if p_embudo is not null then
    select nombre into v_embudo
      from public.embudos
     where id = p_embudo and organization_id = v_org and archivado_en is null;
    if v_embudo is null then
      raise exception 'Ese embudo no existe en este espacio.' using errcode = 'P0002';
    end if;
  end if;

  update public.channels set embudo_id = p_embudo, updated_at = now()
   where id = p_canal;

  perform private.registrar_actividad(
    v_org, 'canal.embudo', 'usuario', null, (select auth.uid()),
    jsonb_build_object('canal', v_canal, 'nombre', v_nombre, 'embudo', v_embudo));
end $fn$;

revoke execute on function public.asignar_embudo_a_canal(uuid, uuid) from public, anon;
grant  execute on function public.asignar_embudo_a_canal(uuid, uuid) to authenticated;
