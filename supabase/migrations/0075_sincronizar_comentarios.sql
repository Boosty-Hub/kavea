-- 0075_sincronizar_comentarios.sql — leer los comentarios, no solo esperarlos.
--
-- POR QUÉ HACE FALTA
--
-- La ingesta de la 0067 depende del webhook, y el 6 de agosto de 2026 se
-- comprobó que NO LLEGA: se comentó una publicación real de la cuenta conectada
-- y no entró ni un evento. El comentario sí se leía por
-- `GET /{ig-user-id}/media?fields=comments{...}`, así que el dato existe y el
-- permiso alcanza; lo que falta es la suscripción al campo `comments` del objeto
-- `instagram`, que se configura en el panel de Meta y no desde aquí.
--
-- Y AUNQUE LLEGARA, ESTO SEGUIRÍA HACIENDO FALTA. Un webhook es una entrega, y
-- una entrega se pierde: durante una caída de más de una hora Meta desuscribe en
-- silencio, y lo que no llegó no vuelve. La lectura por API es la que permite
-- reconciliar y descubrir el hueco. Es la misma razón por la que existe el
-- reconciliador de suscripciones.
--
-- LA PUERTA ES ESTRECHA A PROPÓSITO
--
-- `private.aplicar_efecto` aplica CUALQUIER efecto: mensajes, adjuntos, eventos.
-- Exponerla entera para poder insertar un comentario sería abrir la escritura de
-- toda la mensajería a quien alcance el rol de servicio. Este envoltorio fuerza
-- el tipo y no deja pasar nada más.

create or replace function private.ingerir_comentario(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  -- El tipo se IMPONE, no se lee de la entrada. Si viniera del cuerpo, bastaría
  -- mandar `mensaje.upsert` para escribir en la bandeja por esta puerta.
  return private.aplicar_efecto(
    (p - 'tipo') || jsonb_build_object('tipo', 'comentario.upsert')
  );
end $$;

revoke execute on function private.ingerir_comentario(jsonb) from public, anon, authenticated;

-- Envoltorio en `public`, que es lo único que PostgREST puede invocar. Mismo
-- convenio que la 0020: exponer la puerta no es exponer la habitación.
create or replace function public.ingerir_comentario(p jsonb)
returns jsonb
language sql volatile security definer set search_path = ''
as $$ select private.ingerir_comentario(p) $$;

revoke execute on function public.ingerir_comentario(jsonb) from public, anon, authenticated;
