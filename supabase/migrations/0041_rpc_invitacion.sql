-- 0041_rpc_invitacion.sql — la aplicación no puede llamar al esquema privado.
--
-- SEGUNDA VEZ CON EL MISMO ERROR. Igual que con `reclamar_envios` en 0035: se
-- escribió la lógica en `private` —que está bien, ahí debe vivir— y luego se
-- llamó desde la aplicación con `.schema('private')`. PostgREST NO expone ese
-- esquema, que es exactamente para lo que existe.
--
-- Y esta vez el fallo fue peor que un error visible: la página de invitación
-- trata «no encuentro la invitación» y «no puedo consultar» como lo mismo, así
-- que un enlace perfectamente válido decía «esta invitación ya no vale». Un
-- fallo de infraestructura disfrazado de invitación caducada.
--
-- Los envoltorios van en `public` y revocados de todo el mundo: solo el rol de
-- servicio los alcanza, que es quien crea la cuenta en Supabase Auth.

create or replace function public.invitacion_por_token(p_token text)
returns table (id uuid, organization_id uuid, correo text, rol text, organizacion text, slug text)
language sql stable security definer set search_path = ''
as $$ select * from private.invitacion_por_token(p_token) $$;

create or replace function public.aceptar_invitacion(p_token text, p_usuario uuid)
returns uuid
language sql volatile security definer set search_path = ''
as $$ select private.aceptar_invitacion(p_token, p_usuario) $$;

-- `authenticated` tampoco: quien acepta todavía no tiene sesión, y quien ya la
-- tiene no gana nada pudiendo canjear tokens de otros desde el navegador.
revoke execute on function public.invitacion_por_token(text)      from public, anon, authenticated;
revoke execute on function public.aceptar_invitacion(text, uuid)  from public, anon, authenticated;
