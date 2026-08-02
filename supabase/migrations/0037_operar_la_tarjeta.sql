-- 0037_operar_la_tarjeta.sql — cerrar, asignar y anotar. Lo que falta para usarlo un día entero.
--
-- EL HUECO
--
-- `tarjetas` tiene `estado` y `asignado_a` desde 0027, con sus permisos por
-- columna y su trigger de actividad. Lo que no había es forma de tocarlos: la
-- bandeja FILTRA por estado y no deja CAMBIARLO. Se puede recibir, leer,
-- clasificar en el embudo y responder, pero no cerrar una conversación ni
-- pasársela a un compañero, que es la mitad del trabajo de una jornada.

-- ---------------------------------------------------------------------------
-- 1. Cerrar una tarjeta cierra sus conversaciones
-- ---------------------------------------------------------------------------
-- Sin esto hay un fallo silencioso y feo: la tarjeta se cierra, la conversación
-- se queda abierta, y el siguiente mensaje del contacto lo engancha
-- `resolver_conversacion` a esa conversación viva... cuya tarjeta está cerrada.
-- El mensaje entra en la base, no aparece en la bandeja de lo abierto y nadie
-- lo ve. Exactamente lo que Kavea existe para que no pase.
create or replace function private.cerrar_con_la_tarjeta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado = 'cerrada' and coalesce(old.estado, '') <> 'cerrada' then
    new.cerrada_en := coalesce(new.cerrada_en, now());
    update public.conversations
       set cerrada_en = now()
     where tarjeta_id = new.id and cerrada_en is null;

  elsif new.estado <> 'cerrada' and old.estado = 'cerrada' then
    -- Reabrir. Si mientras tanto la persona escribió y se le creó otra tarjeta
    -- viva, reabrir esta rompería el índice único con un error de constraint
    -- que no le dice nada a nadie. Mejor explicarlo.
    if exists (
      select 1 from public.tarjetas t
       where t.organization_id = new.organization_id
         and t.contact_id = new.contact_id
         and t.cerrada_en is null
         and t.id <> new.id
    ) then
      raise exception 'Esta persona ya tiene otro asunto abierto. Ciérralo antes de reabrir este, o únelos.'
        using errcode = '23505';
    end if;
    new.cerrada_en := null;
    -- Las conversaciones NO se reabren solas: la de Meta puede llevar semanas
    -- muerta y reabrirla haría creer que se puede responder por ahí. Si el
    -- contacto escribe, la ingesta crea una nueva y la engancha a esta tarjeta.
  end if;
  return new;
end $$;

create trigger tarjetas_cerrar
  before update on public.tarjetas
  for each row execute function private.cerrar_con_la_tarjeta();

-- ---------------------------------------------------------------------------
-- 2. Quién hay en el equipo
-- ---------------------------------------------------------------------------
-- Va por función y no por vista: el nombre vive en `auth.users`, sobre la que
-- `authenticated` no tiene lectura. Una vista `security_invoker` no podría
-- leerla, y una sin `security_invoker` se saltaría la RLS de
-- `organization_members`. La función es `security definer` con la comprobación
-- de pertenencia escrita a mano, que es la única forma honesta.
create or replace function public.miembros_de(p_org uuid)
returns table (user_id uuid, nombre text, rol text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id,
         coalesce(u.raw_user_meta_data->>'nombre', u.email),
         m.rol
    from public.organization_members m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_org
     and public.es_miembro(p_org)
   order by 2
$$;

revoke execute on function public.miembros_de(uuid) from public, anon;
grant  execute on function public.miembros_de(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Notas internas
-- ---------------------------------------------------------------------------
-- `nota.añadida` ya estaba en el vocabulario de 0022 y la interfaz ya sabe
-- pintarla. Faltaba poder escribirla.
--
-- Es la ÚNICA actividad cuyo detalle lleva texto libre del usuario, y está
-- previsto: el comentario de 0022 dice "NUNCA contenido de mensajes, salvo el
-- texto de una nota, que ES la nota".
create or replace function public.anadir_nota(p_tarjeta uuid, p_texto text)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_org uuid; v_user uuid := (select auth.uid()); v_texto text;
begin
  if v_user is null then raise exception 'Hace falta una sesión.' using errcode = '42501'; end if;

  v_texto := btrim(coalesce(p_texto, ''));
  if v_texto = '' then raise exception 'La nota está vacía.' using errcode = '22023'; end if;
  if length(v_texto) > 2000 then
    raise exception 'La nota es demasiado larga: % caracteres de 2000.', length(v_texto)
      using errcode = '22023';
  end if;

  select organization_id into v_org from public.tarjetas where id = p_tarjeta;
  if v_org is null then raise exception 'Esa tarjeta no existe.' using errcode = 'P0002'; end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  return private.registrar_actividad_tarjeta(
    v_org, p_tarjeta, 'nota.añadida', 'usuario', v_user,
    jsonb_build_object('texto', v_texto));
end $$;

revoke execute on function public.anadir_nota(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 4. `cerrada_en` no se toca a mano
-- ---------------------------------------------------------------------------
-- Lo pone y lo quita el trigger de arriba, en función del estado. Si un miembro
-- pudiera escribirlo directamente, podría dejar una tarjeta con estado 'cerrada'
-- y `cerrada_en` nulo —o al revés— y el índice único que impide dos asuntos
-- abiertos por persona dejaría de significar nada.
--
-- Las columnas concedidas siguen siendo las mismas de 0027: estado, asignado_a
-- y titulo. Se deja constancia aquí para que la próxima persona no añada
-- `cerrada_en` a esa lista pensando que falta.
comment on column public.tarjetas.cerrada_en is
  'La escribe el trigger tarjetas_cerrar a partir de `estado`. NO añadir a los '
  'grants de columna de authenticated: el índice tarjetas_abierta_unica depende '
  'de que estos dos valores no puedan contradecirse.';
