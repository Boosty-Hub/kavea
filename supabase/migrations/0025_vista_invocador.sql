-- 0025_vista_invocador.sql — la vista del hilo se evalúa como quien la llama.
--
-- EL FALLO QUE SE CIERRA AQUÍ
--
-- `linea_tiempo` se creó en 0022 con un comentario que afirmaba: "no lleva
-- security_invoker porque en Postgres 15+ las vistas son security_invoker por
-- defecto en Supabase". Eso es FALSO. En Postgres las vistas son
-- security_definer por defecto: `security_invoker` hay que activarlo a mano.
-- Comprobado en el proyecto vivo: pg_class.reloptions de la vista era null.
--
-- Consecuencia real: el acceso a las tablas base se comprobaba con los permisos
-- del dueño de la vista (`postgres`), no con los de quien consulta.
--
-- POR QUÉ NO HUBO FUGA, Y POR QUÉ AUN ASÍ HAY QUE ARREGLARLO
--
-- No la hubo por dos accidentes afortunados que se sostenían a la vez:
--   1. Las tres tablas base llevan FORCE ROW LEVEL SECURITY, así que ni siquiera
--      el dueño se salta sus políticas.
--   2. Las políticas se apoyan en `es_miembro(organization_id)`, que resuelve por
--      `auth.uid()` —una variable de sesión que viaja con la petición— y no por
--      el rol SQL. Da la respuesta correcta se ejecute con el rol que se ejecute.
--
-- Es decir: el aislamiento dependía de que ninguna política futura mirase el
-- ROL en vez del usuario, y de que nadie quitase FORCE. Dos condiciones que no
-- están escritas en ningún sitio y que la siguiente persona no tiene por qué
-- adivinar. Una propiedad de seguridad que se cumple por casualidad no es una
-- propiedad de seguridad: es una que todavía no ha fallado.
--
-- Con security_invoker la vista pasa a comprobarse con el rol y el usuario de
-- quien consulta, que es lo que el comentario original ya decía que pasaba.

alter view public.linea_tiempo set (security_invoker = on);

comment on view public.linea_tiempo is
  'Hilo unificado: mensajes, eventos de Meta y actividad del equipo en una sola '
  'consulta ordenable y paginable. security_invoker = on: se evalúa con los '
  'permisos y la RLS de quien la consulta, no con los del dueño de la vista. '
  'No quitar esa opción: sin ella el acceso a las tablas base se comprueba como '
  '`postgres` y el aislamiento pasa a depender de FORCE ROW LEVEL SECURITY.';

-- ---------------------------------------------------------------------------
-- La actividad también avisa en tiempo real
-- ---------------------------------------------------------------------------
-- El requisito es que todo lo que alguien hace se vea EN la conversación. Si
-- solo los mensajes emiten Broadcast, dos agentes mirando el mismo hilo ven los
-- mensajes al instante pero la asignación o el cambio de estado tardan hasta 60
-- segundos, los del sondeo de seguridad. Eso es justo el escenario que produce
-- trabajo duplicado: los dos creen que el hilo sigue libre.
create or replace function private.avisar_bandeja()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_conv uuid;
begin
  if tg_table_name = 'messages' then
    v_org := new.organization_id; v_conv := new.conversation_id;
  elsif tg_table_name = 'actividades' then
    v_org := new.organization_id; v_conv := new.conversation_id;
  else
    v_org := new.organization_id; v_conv := new.id;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'tabla', tg_table_name,
      'conversation_id', v_conv,
      'momento', now()
    ),
    'cambio',
    'org:' || v_org::text,
    false
  );
  return null;
exception when others then
  return null;
end $$;

create trigger actividades_avisar
  after insert on public.actividades
  for each row execute function private.avisar_bandeja();
