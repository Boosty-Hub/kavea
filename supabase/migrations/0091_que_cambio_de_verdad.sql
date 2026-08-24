-- 0091_que_cambio_de_verdad.sql
--
-- La 0090 expuso `updated_at` para poder decir «este diagnóstico es viejo».
-- Medido acto seguido: sale viejo SIEMPRE, en las tres conexiones, y por 45
-- milisegundos.
--
-- El motivo es que el propio diagnóstico escribe en la conexión —guarda
-- `messaging_feature_status` en V6 y `token_last_verified_at` en V4—, así que
-- `updated_at` queda por delante de las verificaciones que acaba de producir.
-- Comparar contra `updated_at` es preguntar «¿cambió algo desde el diagnóstico?»
-- cuando lo único que cambió fue el diagnóstico.
--
-- Un aviso que sale siempre no avisa de nada: enseña a ignorar el panel. Es la
-- misma lección que ya costó una vez, cuando un indicador confundía «no se pudo
-- comprobar» con «está mal» y pintaba de rojo lo que estaba sano.
--
-- LA SOLUCIÓN NO ES ACORDARSE EN CADA SITIO. Poner `invalidado_en = now()` a mano
-- en cada función que toca una conexión funciona hasta que alguien escribe la
-- séptima y se olvida. Va en un trigger, que es el único sitio por el que pasan
-- todas las escrituras, y decide mirando QUÉ columna cambió:
--
--   · Cambios del MUNDO —quién es la Página, qué permisos concede, si está
--     suscrita, si el token murió— invalidan el veredicto.
--   · Cambios del OBSERVADOR —lo que el propio diagnóstico anota— no.
--
-- La lista es explícita a propósito: una columna nueva no invalida nada hasta
-- que alguien decida que debe, y eso es más seguro que lo contrario.

alter table public.meta_connections
  add column if not exists invalidado_en timestamptz;

create or replace function private.marcar_conexion_invalidada()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.invalidado_en := now();
    return new;
  end if;

  -- `is distinct from` y no `<>`: con nulos de por medio, `<>` devuelve null y
  -- el `or` entero se queda en null, o sea en «no cambió». Un token que pasa de
  -- null a inválido es exactamente el caso que no puede escaparse.
  if new.page_id                is distinct from old.page_id
     or new.ig_business_account_id is distinct from old.ig_business_account_id
     or new.config_id           is distinct from old.config_id
     or new.tasks               is distinct from old.tasks
     or new.estado              is distinct from old.estado
     or new.subscription_ok     is distinct from old.subscription_ok
     or new.token_invalid_since is distinct from old.token_invalid_since
     or new.subscribed_fields_messenger is distinct from old.subscribed_fields_messenger
     or new.subscribed_fields_instagram is distinct from old.subscribed_fields_instagram
  then
    new.invalidado_en := now();
  end if;

  return new;
end $fn$;

drop trigger if exists meta_connections_invalidar on public.meta_connections;
create trigger meta_connections_invalidar
  before insert or update on public.meta_connections
  for each row execute function private.marcar_conexion_invalidada();

-- Las conexiones que ya existen no han «cambiado» desde su último diagnóstico:
-- dejarlas en null es lo correcto, porque la vista solo marca viejo cuando hay
-- una fecha con la que comparar. Ponerles now() las marcaría a todas de golpe,
-- que es justo el falso positivo que esta migración viene a quitar.

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
    c.token_invalid_since AS token_invalido_desde
   FROM meta_connections c
     LEFT JOIN verificaciones v ON v.meta_connection_id = c.id
  GROUP BY c.organization_id, c.id, c.page_name, c.page_id, c.ig_username,
           c.invalidado_en, c.token_invalid_since;

comment on column public.meta_connections.invalidado_en is
  'Cuando cambio algo que invalida un diagnostico. Lo pone un trigger mirando que '
  'columna cambio: lo que describe el mundo invalida, lo que escribe el propio '
  'diagnostico no. Comparar contra updated_at no sirve: el diagnostico lo toca al '
  'guardar messaging_feature_status y token_last_verified_at.';
