-- 0104_una_conexion_retirada_deja_de_estorbar.sql — quitar de la lista lo desconectado.
--
-- QUÉ SE PIDIÓ: poder eliminar los números ya desconectados para que no sigan
-- saliendo en Canales. Hoy la pantalla arrastra cinco conexiones muertas —dos
-- WhatsApp retirados, dos Páginas de clientes que se fueron— y la lista útil
-- queda debajo.
--
-- POR QUÉ NO SE BORRA DE VERDAD, aunque la palabra fuera «eliminar». Las claves
-- ajenas están encadenadas con `on delete cascade`:
--
--     meta_connections → channels → conversations → messages
--
-- Un `delete` de la conexión se lleva por delante **el historial completo de ese
-- canal**: cada conversación y cada mensaje que pasó por él. Para un número
-- retirado eso es justo lo que NO se puede perder — es el histórico comercial del
-- cliente, y es lo que hay que poder enseñar si alguien reclama. Un botón que
-- dice «eliminar» y borra tres tablas en cascada es el peor botón posible: hace
-- exactamente lo que promete y nadie esperaba tanto.
--
-- ASÍ QUE SE ARCHIVA. Desaparece de la lista, que es lo que se pidió, y no se
-- pierde nada. Y se puede deshacer, porque la razón para ocultar algo casi nunca
-- sobrevive un año.
--
-- SOLO LO DESCONECTADO. Archivar una conexión viva la escondería mientras sigue
-- recibiendo mensajes, y entonces la pantalla que existe para decir por dónde
-- entran las cosas estaría ocultando por dónde entran las cosas.

alter table public.meta_connections
  add column if not exists archivada_en timestamptz;

comment on column public.meta_connections.archivada_en is
  'Retirada de la lista de Canales. No borra nada: el historial del canal se queda.';

-- La lista de Canales pide las no archivadas, y son la mayoría.
create index if not exists meta_connections_visibles_idx
  on public.meta_connections (organization_id)
  where archivada_en is null;

create or replace function public.archivar_conexion(p_conexion uuid, p_archivar boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  c public.meta_connections%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;

  select * into c from public.meta_connections mc where mc.id = p_conexion;
  if c.id is null then
    raise exception 'No existe esa conexión.' using errcode = 'P0002';
  end if;
  if not public.puede(c.organization_id, 'conectar') then
    raise exception 'No tienes permiso para retirar canales de la lista.' using errcode = '42501';
  end if;

  -- Ver la cabecera: esconder algo vivo convierte esta pantalla en lo contrario
  -- de lo que es.
  if p_archivar and c.estado <> 'disconnected' then
    raise exception 'Solo se puede retirar de la lista una conexión desconectada.'
      using errcode = '22023';
  end if;

  update public.meta_connections
     set archivada_en = case when p_archivar then now() else null end,
         updated_at = now()
   where id = c.id;

  perform private.registrar_actividad(
    c.organization_id,
    case when p_archivar then 'conexion.archivada' else 'conexion.desarchivada' end,
    'usuario', null, (select auth.uid()),
    jsonb_build_object('nombre',
      coalesce(c.page_name, c.display_phone_number, c.verified_name, c.page_id, c.waba_id)));

  return jsonb_build_object('conexion', c.id, 'archivada', p_archivar);
end $fn$;

revoke execute on function public.archivar_conexion(uuid, boolean) from public, anon;
grant  execute on function public.archivar_conexion(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- La vista también, o la pantalla no puede saberlo.
--
-- `estado_de_conexion` es de dónde sale la lista de Canales. Añadir la columna a
-- la tabla y no a la vista habría dejado el archivado invisible para la única
-- pantalla que lo necesita — y sin error en ninguna parte, que es lo que hace
-- que se descubra tarde.
-- ---------------------------------------------------------------------------
create or replace view public.estado_de_conexion as
 SELECT c.organization_id,
    c.id AS meta_connection_id,
    c.page_name,
    c.page_id,
    c.ig_username,
    count(*) FILTER (WHERE v.resultado = 'ok'::text) AS en_verde,
    count(*) FILTER (WHERE v.resultado = 'fallo'::text) AS en_rojo,
    count(*) FILTER (WHERE v.resultado = 'no_verificable'::text) AS sin_saber,
    count(*) FILTER (WHERE v.resultado = 'sin_probar'::text) AS sin_probar,
    bool_or(v.resultado = 'fallo'::text AND v.bloquea) AS bloqueada,
    max(v.verificado_en) AS ultima_pasada,
    c.invalidado_en AS cambiada_en,
    c.token_invalid_since AS token_invalido_desde,
    c.estado,
    c.archivada_en
   FROM meta_connections c
     LEFT JOIN verificaciones v ON v.meta_connection_id = c.id
  GROUP BY c.organization_id, c.id, c.page_name, c.page_id, c.ig_username,
           c.invalidado_en, c.token_invalid_since, c.estado, c.archivada_en;
