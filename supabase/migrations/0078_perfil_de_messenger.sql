-- 0078_perfil_de_messenger.sql — el contacto de Messenger tampoco traía nombre.
--
-- La 0069 resolvió esto para Instagram. Messenger tiene el mismo hueco por la
-- misma razón —el `messaging[]` trae `sender.id` y nada más— y hasta hoy no se
-- había visto porque no había ninguna conversación de Messenger. Llegó la
-- primera el 6 de agosto de 2026 y apareció como «Contacto sin nombre».
--
-- LA DIFERENCIA CON INSTAGRAM, que justifica que esto no sea un `or canal =`
-- suelto en la consulta de la 0069:
--
-- Instagram devuelve `username`, que es un IDENTIFICADOR: `@fulanito`. Se guarda
-- ahí y `nombre` se deja en null a propósito, porque `nombre` significa «alguien
-- nombró a esta persona» y un handle no es un nombre.
--
-- Messenger NO tiene handle. Devuelve `first_name` y `last_name`, que sí son un
-- nombre de persona, igual que el `profile.name` que manda WhatsApp y que sí se
-- guarda en `nombre` desde el primer día. Así que aquí SÍ se escribe `nombre`, y
-- es coherente y no una excepción: se guarda en `nombre` lo que es un nombre.
--
-- LO QUE NO FUNCIONA TODAVÍA, medido el mismo día que se escribió esto:
--
--   GET /{psid}?fields=first_name,last_name,profile_pic
--   → (#100) Object with ID '...' does not exist, cannot be loaded due to
--     missing permissions... (error_subcode 33)
--
-- Con el Page Access Token correcto y el PSID de una conversación real. La
-- lectura del perfil de Messenger está cerrada mientras `pages_messaging` no
-- tenga acceso avanzado, así que hoy este camino se ejecuta y no trae nada.
--
-- Entra igual porque el código es correcto y el día que aprueben el permiso
-- empieza a funcionar solo. CON UNA SALVEDAD OPERATIVA: `perfil_leido_en` se
-- sella en todo intento contestado —y un 100/33 lo es—, así que los contactos
-- que ya pasaron por aquí no se reintentan. Tras la aprobación hay que
-- desbloquearlos una vez:
--
--   update public.contacts set perfil_leido_en = null where nombre is null;

-- SE SUELTAN ANTES DE RECREAR, y no es opcional.
--
-- `create or replace` no puede cambiar el tipo de retorno de una función que ya
-- existe —«cannot change return type of existing function»— y aquí se añade la
-- columna `canal` a la tabla que devuelve. El envoltorio público va primero
-- porque depende de la privada.
--
-- Y las versiones de TRES argumentos de `guardar_perfil_instagram` también se
-- sueltan, aunque la nueva de cuatro conviviría con ellas: PostgREST resuelve
-- por nombre y número de argumentos, y dejar dos candidatas es dejar que un día
-- elija la que no escribe el nombre. Una sobrecarga que nadie quiere es una
-- trampa esperando.
drop function if exists public.contactos_sin_perfil(integer);
drop function if exists private.contactos_sin_perfil(integer);
drop function if exists public.guardar_perfil_instagram(uuid, text, text);
drop function if exists private.guardar_perfil_instagram(uuid, text, text);

create or replace function private.contactos_sin_perfil(p_limite integer default 20)
returns table (
  contact_id uuid, organization_id uuid, scoped_id text,
  meta_connection_id uuid, canal text
)
language sql stable security definer set search_path = ''
as $$
  -- El canal viaja en la respuesta: el trabajador necesita saberlo para pedirle
  -- a Meta los campos correctos, que no son los mismos en los dos canales.
  select s.contact_id, s.organization_id, s.scoped_id, s.meta_connection_id, s.canal
    from (
      select distinct on (c.id, i.canal)
             c.id             as contact_id,
             c.organization_id,
             i.scoped_id,
             ch.meta_connection_id,
             i.canal::text    as canal,
             c.created_at
        from public.contacts c
        join public.contact_identities i
          on i.contact_id = c.id
         and i.canal in ('instagram', 'messenger')
        join public.channels ch
          on ch.organization_id = c.organization_id
         and ch.canal = i.canal
       where c.perfil_leido_en is null
         -- En Instagram basta el handle; en Messenger lo que falta es el nombre.
         and case i.canal::text
               when 'instagram' then c.username is null
               else c.nombre is null
             end
         and c.fusionado_en is null
         and ch.activo
       order by c.id, i.canal, ch.created_at
    ) s
   order by s.created_at
   limit p_limite
$$;

revoke execute on function private.contactos_sin_perfil(integer) from public, anon, authenticated;

create or replace function public.contactos_sin_perfil(p_limite integer default 20)
returns table (
  contact_id uuid, organization_id uuid, scoped_id text,
  meta_connection_id uuid, canal text
)
language sql stable security definer set search_path = ''
as $$ select * from private.contactos_sin_perfil(p_limite) $$;

revoke execute on function public.contactos_sin_perfil(integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guardar
-- ---------------------------------------------------------------------------
-- `nombre` solo se rellena si estaba vacío. Si alguien del equipo ya nombró a
-- esta persona a mano, lo que diga Meta no manda sobre lo que decidió un humano.
create or replace function private.guardar_perfil_instagram(
  p_contact uuid, p_username text default null, p_foto_ruta text default null,
  p_nombre text default null
)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.contacts
     set username        = coalesce(nullif(btrim(p_username), ''), username),
         nombre          = coalesce(nombre, nullif(btrim(p_nombre), '')),
         foto_ruta       = coalesce(nullif(btrim(p_foto_ruta), ''), foto_ruta),
         perfil_leido_en = now(),
         updated_at      = now()
   where id = p_contact
$$;

revoke execute on function private.guardar_perfil_instagram(uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.guardar_perfil_instagram(
  p_contact uuid, p_username text default null, p_foto_ruta text default null,
  p_nombre text default null
)
returns void
language sql volatile security definer set search_path = ''
as $$ select private.guardar_perfil_instagram(p_contact, p_username, p_foto_ruta, p_nombre) $$;

revoke execute on function public.guardar_perfil_instagram(uuid, text, text, text)
  from public, anon, authenticated;
