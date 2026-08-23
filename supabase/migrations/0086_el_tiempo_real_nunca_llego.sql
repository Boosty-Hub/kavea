-- 0086_el_tiempo_real_nunca_llego.sql — la bandeja no se actualizaba sola.
--
-- SINTOMA: entra un mensaje de fuera, la conversacion nueva no aparece y hay
-- que recargar la pagina. Reportado el 23-ago-2026.
--
-- No era un fallo, eran CUATRO, encadenados y todos mudos. El tiempo real de
-- la bandeja no ha funcionado nunca: lo que la salvaba era el sondeo de
-- seguridad de 60 s de `Refrescador`, escrito para cubrir un socket que deja
-- de entregar y que en realidad llevaba desde el principio siendo el unico
-- mecanismo vivo.
--
--   1. `realtime.messages` tiene RLS ACTIVADA y CERO POLITICAS. Un canal
--      privado se autoriza con una politica sobre esa tabla; sin ninguna, la
--      suscripcion se DENIEGA. `authenticated` ya tenia SELECT e INSERT sobre
--      la tabla y USAGE sobre el esquema: lo unico que faltaba era la politica.
--
--   2. `avisar_bandeja` emitia con `private => false` mientras el cliente se
--      suscribe con `config: { private: true }`. Aunque (1) estuviera resuelto,
--      los mensajes salian por el topico publico y el cliente escuchaba el
--      privado. Comprobado en `realtime.messages`: 5 filas de hoy, todas con
--      `private = false`.
--
--   3. `Refrescador` no mira el estado que devuelve `subscribe()`. Un
--      CHANNEL_ERROR por autorizacion denegada no se distingue de un canal
--      sano. Se arregla en el cliente, no aqui.
--
--   4. Y esta funcion se tragaba TODA excepcion con `when others then return
--      null`. Eso esta bien de fondo —un aviso que falla no puede tumbar la
--      ingesta de un mensaje— pero mudo del todo convierte cualquier rotura
--      futura en otro mes de bandeja quieta. Ahora deja rastro.

-- ---------------------------------------------------------------------------
-- 1. La politica que autoriza el canal privado `org:{uuid}`.
-- ---------------------------------------------------------------------------
-- Solo SELECT: el cliente RECIBE difusiones, nunca las emite. Sin politica de
-- INSERT, un navegador no puede inyectar un `cambio` falso en el canal de nadie.
--
-- EL CASE NO ES ADORNO. `substring(...)::uuid` sobre un topico que no lo sea
-- lanza 22P02, y Postgres no garantiza el orden de evaluacion de un `and`: con
-- `topico ~ '...' and es_miembro(cast)` el cast puede evaluarse primero y
-- reventar la suscripcion a cualquier otro canal. `case` si garantiza el orden.
--
-- `es_miembro` es SECURITY DEFINER y ejecutable por PUBLIC —una de las cuatro
-- excepciones documentadas de C8—, asi que Realtime puede llamarla con el rol
-- `authenticated` que saca del JWT.
create policy "difusion de la organizacion, solo para sus miembros"
  on realtime.messages
  for select
  to authenticated
  using (
    case
      when realtime.topic() ~ '^org:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.es_miembro(substring(realtime.topic() from 5)::uuid)
      else false
    end
  );

-- ---------------------------------------------------------------------------
-- 2. Emitir por el canal privado, y no callar si falla.
-- ---------------------------------------------------------------------------
create or replace function private.avisar_bandeja()
returns trigger
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_conv uuid;
begin
  if tg_table_name in ('messages', 'actividades') then
    v_org := new.organization_id; v_conv := new.conversation_id;
  elsif tg_table_name = 'tarjetas' then
    v_org := new.organization_id; v_conv := null;
  else
    v_org := new.organization_id; v_conv := new.id;
  end if;

  -- El payload sigue trayendo SOLO identificadores. Al recibirlo el cliente
  -- pide al servidor que revalide, y esa lectura vuelve a pasar por RLS: un
  -- fallo de autorizacion de canal no puede filtrar contenido de mensajes.
  --
  -- `private => true`: es lo que hace que llegue. El cuarto argumento es el
  -- que estaba en false y por eso el cliente no recibia nada.
  perform realtime.send(
    jsonb_build_object('tabla', tg_table_name, 'conversation_id', v_conv, 'momento', now()),
    'cambio', 'org:' || v_org::text, true);
  return null;
exception when others then
  -- Se sigue tragando la excepcion A PROPOSITO: avisar es accesorio y la
  -- ingesta del mensaje no puede caerse porque Realtime tenga un mal dia.
  -- Pero callar del todo fue lo que dejo esto roto sin que nadie lo viera, asi
  -- que queda escrito donde ya se miran las averias.
  begin
    insert into public.alertas (tipo, severidad, organization_id, detalle)
    values ('realtime.aviso_fallido', 'aviso', v_org,
            jsonb_build_object('tabla', tg_table_name,
                               'sqlstate', sqlstate,
                               'mensaje', left(sqlerrm, 300)));
  exception when others then
    null;  -- Si ni la alerta entra, no hay nada mas que hacer desde un trigger.
  end;
  return null;
end $$;
