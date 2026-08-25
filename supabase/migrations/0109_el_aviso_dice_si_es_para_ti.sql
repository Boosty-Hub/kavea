-- 0109_el_aviso_dice_si_es_para_ti.sql — que la difusión distinga lo que entra de lo que sale.
--
-- QUÉ FALTA PARA AVISAR DE VERDAD. `avisar_bandeja` difunde `{tabla,
-- conversation_id, momento}` y con eso basta para refrescar: la pantalla vuelve a
-- pedir y RLS decide. Pero para **avisar** —una notificación del navegador— hace
-- falta saber dos cosas más que el payload no lleva:
--
--   1. SI ES ENTRANTE. Hoy se difunde igual un mensaje que llega y uno que acaba
--      de mandar el propio operador. Notificar el segundo es avisar a alguien de
--      algo que acaba de hacer él, y es la forma más rápida de que apague los
--      avisos.
--   2. A DÓNDE LLEVA EL CLIC. La conversación no es la URL: la pantalla abre por
--      TARJETA. Sin el id de la tarjeta, el aviso puede sonar pero no puede
--      llevar a ninguna parte.
--
-- LO QUE SIGUE SIN VIAJAR ES EL CONTENIDO, y eso no cambia. El comentario
-- original de la 0023 lo dice: «el payload solo trae identificadores… así un
-- fallo de autorización de canal no puede filtrar contenido de mensajes». La
-- notificación dirá «Nuevo mensaje», no lo que dice el mensaje. Quien quiera
-- leerlo, hace clic y pasa por RLS como todo el mundo.
--
-- EL COSTE. Para un mensaje entrante hay que resolver su tarjeta, que es una
-- lectura más en el camino caliente de la ingesta. Se hace SOLO para los
-- entrantes: los salientes son la mitad del tráfico y no notifican nada.

create or replace function private.avisar_bandeja()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_conv uuid;
  v_tarjeta uuid;
  v_entrante boolean := false;
  v_id uuid;
begin
  if tg_table_name = 'messages' then
    v_org := new.organization_id;
    v_conv := new.conversation_id;
    v_id := new.id;
    -- `is_echo` es un mensaje NUESTRO que Meta nos devuelve. Notificarlo sería
    -- avisar al operador de su propio envío, con unos segundos de retraso.
    v_entrante := new.direccion = 'inbound' and coalesce(new.is_echo, false) = false;
    if v_entrante then
      select c.tarjeta_id into v_tarjeta from public.conversations c where c.id = v_conv;
    end if;

  elsif tg_table_name = 'comentarios' then
    v_org := new.organization_id;
    v_id := new.id;
    -- Un comentario propio es una respuesta que acaba de publicar el equipo.
    -- Y en un `update` no hay novedad que anunciar: moderar no es recibir.
    v_entrante := tg_op = 'INSERT' and coalesce(new.propio, false) = false;

  elsif tg_table_name = 'actividades' then
    v_org := new.organization_id; v_conv := new.conversation_id; v_id := new.id;

  else
    v_org := new.organization_id; v_conv := new.id; v_id := new.id;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'tabla', tg_table_name,
      'conversation_id', v_conv,
      -- Lo nuevo: a dónde lleva el clic y si merece sonar.
      'tarjeta_id', v_tarjeta,
      'fila_id', v_id,
      'entrante', v_entrante,
      'momento', now()
    ),
    'cambio',
    'org:' || v_org::text,
    false
  );
  return null;
exception when others then
  -- Igual que antes: la difusión NUNCA puede tumbar la escritura. Un aviso que
  -- no sale es una pantalla que tarda; una excepción aquí es un mensaje perdido.
  return null;
end $fn$;
