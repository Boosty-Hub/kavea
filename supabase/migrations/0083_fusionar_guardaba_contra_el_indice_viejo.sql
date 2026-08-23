-- 0083_fusionar_guardaba_contra_el_indice_viejo.sql
--
-- CABO SUELTO DE LA 0082, DEL MISMO DÍA.
--
-- La 0082 cambió `conversations_abierta_unica` de
-- (organization_id, canal, contact_id) a
-- (organization_id, canal, contact_id, channel_id).
-- `fusionar_contactos` tenía una guarda escrita contra el índice VIEJO, con el
-- índice viejo citado en su comentario:
--
--   «conversations tiene una única parcial sobre
--    (organization_id, canal, contact_id) para los no cerrados»
--
-- Eso ya no es verdad, y deja la función más estricta que la restricción que
-- dice proteger: dos contactos con un hilo abierto de WhatsApp cada uno pero
-- por NÚMEROS DISTINTOS se pueden fusionar sin romper nada, y la función los
-- rechazaba. Un comentario que describe un índice que ya no existe es peor que
-- ninguno: el siguiente que lo lea va a confiar en él.
--
-- Y DE PASO, UNA DERIVA MÁS VIEJA. La guarda comparaba `estado <> 'cerrada'`
-- mientras el índice usa `cerrada_en is null`. Son dos predicados distintos: si
-- alguna vez se separan —una fila cerrada sin fecha, o al revés— la guarda deja
-- pasar el caso y el usuario recibe el 23505 crudo de Postgres en lugar de la
-- frase que esta función se molesta en escribir. La guarda pasa a usar el mismo
-- predicado que el índice, que es la única forma de que no vuelvan a separarse.

create or replace function public.fusionar_contactos(
  p_superviviente uuid, p_absorbido uuid, p_motivo text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid; v_org_b uuid;
  v_user uuid := (select auth.uid());
  v_ids uuid[]; v_convs uuid[];
  v_choque text; v_fusion uuid; v_conv uuid;
  v_nombre_abs text; v_user_abs text;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  if p_superviviente = p_absorbido then
    raise exception 'Un contacto no se puede fusionar consigo mismo.' using errcode = '22023';
  end if;
  -- El motivo no es burocracia: una fusión mal hecha enseña la conversación de
  -- una persona bajo el nombre de otra, y dentro de tres meses nadie recuerda
  -- por qué se hizo. Es la misma regla que el acceso temporal del staff.
  if p_motivo is null or length(btrim(p_motivo)) < 8 then
    raise exception 'La fusión necesita un motivo de al menos 8 caracteres: queda escrito en el hilo.'
      using errcode = '22023';
  end if;

  select organization_id, nombre, username into v_org, v_nombre_abs, v_user_abs
    from public.contacts where id = p_absorbido;
  select organization_id into v_org_b from public.contacts where id = p_superviviente;

  if v_org is null or v_org_b is null then
    raise exception 'Alguno de los contactos no existe.' using errcode = 'P0002';
  end if;
  -- Sin esta línea, un miembro podría absorber el contacto de OTRO cliente y
  -- arrastrar sus conversaciones a su propia bandeja. Es la frontera de tenant
  -- de esta función.
  if v_org <> v_org_b then
    raise exception 'No se pueden fusionar contactos de organizaciones distintas.' using errcode = '42501';
  end if;
  if not public.es_miembro(v_org) then
    raise exception 'Sin acceso a esa organización.' using errcode = '42501';
  end if;

  -- Choque real: mismo canal Y MISMO CANAL CONCRETO. Es exactamente
  -- `conversations_abierta_unica` tal y como la dejó la 0082, con su mismo
  -- predicado `cerrada_en is null`. Dos hilos de WhatsApp por números
  -- distintos no chocan, y antes se rechazaban.
  select string_agg(distinct coalesce(ch.nombre, a.canal::text), ', ') into v_choque
    from public.conversations a
    join public.conversations b
      on b.contact_id = p_superviviente
     and b.canal = a.canal
     and b.channel_id is not distinct from a.channel_id
     and b.cerrada_en is null
    left join public.channels ch on ch.id = a.channel_id
   where a.contact_id = p_absorbido and a.cerrada_en is null;

  if v_choque is not null then
    raise exception 'Los dos contactos tienen una conversación abierta en %. Cierra una de las dos antes de fusionar.', v_choque
      using errcode = '23505';
  end if;

  select coalesce(array_agg(id), '{}') into v_ids
    from public.contact_identities where contact_id = p_absorbido;
  select coalesce(array_agg(id), '{}') into v_convs
    from public.conversations where contact_id = p_absorbido;

  update public.contact_identities set contact_id = p_superviviente where id = any(v_ids);
  update public.conversations       set contact_id = p_superviviente where id = any(v_convs);
  update public.contacts            set fusionado_en = p_superviviente where id = p_absorbido;

  -- El superviviente se queda con el mejor dato disponible, sin pisar el suyo.
  update public.contacts
     set nombre   = coalesce(nombre, v_nombre_abs),
         username = coalesce(username, v_user_abs)
   where id = p_superviviente;

  insert into public.contact_fusiones
    (organization_id, superviviente_id, absorbido_id, identidades, conversaciones, motivo, hecha_por)
  values
    (v_org, p_superviviente, p_absorbido, v_ids, v_convs, btrim(p_motivo), v_user)
  returning id into v_fusion;

  for v_conv in
    select c.id from public.conversations c where c.contact_id = p_superviviente
  loop
    perform private.registrar_actividad(
      v_org, 'contacto.fusionado', 'usuario', v_conv, v_user,
      jsonb_build_object(
        'fusion_id', v_fusion,
        'absorbido', coalesce(v_nombre_abs, v_user_abs, 'contacto sin nombre'),
        'motivo', btrim(p_motivo),
        'conversaciones', coalesce(array_length(v_convs, 1), 0),
        'identidades', coalesce(array_length(v_ids, 1), 0))
    );
  end loop;

  return v_fusion;
end $$;
