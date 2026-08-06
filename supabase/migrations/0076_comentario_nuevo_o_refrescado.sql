-- 0076_comentario_nuevo_o_refrescado.sql — el contador decía «aplicados» sin aplicar nada.
--
-- QUÉ ARREGLA
--
-- `private.aplicar_efecto` devuelve `estado: 'aplicado'` tanto si el upsert
-- INSERTA como si REFRESCA una fila que ya estaba. La sincronización de
-- comentarios contaba eso y anunciaba «3 aplicados, 0 duplicados» en una pasada
-- que no cambió una sola fila.
--
-- POR QUÉ IMPORTA UN CONTADOR
--
-- Porque es lo único que se mira. Nadie va a la tabla a contar filas después de
-- pulsar un botón: se lee el resumen. Un resumen que dice que trajo tres cuando
-- no trajo ninguno es peor que no tener resumen, porque se cree. Y este contador
-- en concreto es el que va a decir si la lectura por API está supliendo al
-- webhook que no llega o si lleva días sin traer nada nuevo.
--
-- Se resuelve en el envoltorio y no tocando `aplicar_efecto`, que es compartida
-- con toda la mensajería y no tengo nada que decirle.

create or replace function private.ingerir_comentario(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_existe boolean; v_res jsonb;
begin
  -- Se mira ANTES, porque después del upsert ya no hay forma de distinguirlo
  -- desde aquí: la función que aplica no dice si insertó o actualizó.
  select exists (
    select 1 from public.comentarios
     where organization_id = (p->>'organization_id')::uuid
       and comment_id = p->>'comment_id'
  ) into v_existe;

  -- El tipo se IMPONE, no se lee de la entrada. Si viniera del cuerpo, bastaría
  -- mandar `mensaje.upsert` para escribir en la bandeja por esta puerta.
  v_res := private.aplicar_efecto(
    (p - 'tipo') || jsonb_build_object('tipo', 'comentario.upsert')
  );

  return v_res || jsonb_build_object('nuevo', not v_existe);
end $$;

revoke execute on function private.ingerir_comentario(jsonb) from public, anon, authenticated;
