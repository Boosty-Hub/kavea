-- 0099_alguien_mira_la_revision.sql — que un cambio en el App Review se sepa el mismo día.
--
-- POR QUÉ EXISTE. La respuesta del App Review del 7-ago estuvo DIECISÉIS DÍAS sin
-- leerse. No fue descuido: no hay nada que avise. Meta no manda webhook de esto,
-- el correo cae en una bandeja que nadie mira a diario, y el panel de la app hay
-- que abrirlo a propósito. Dieciséis días es lo que cuesta enterarse cuando el
-- aviso depende de acordarse.
--
-- QUÉ SE MIRA. `GET /{app-id}/permissions` con token de app devuelve los permisos
-- que están vivos y su estado. Hoy son cinco `live`; los ocho rechazados NO
-- APARECEN en la lista, así que un permiso aprobado se nota porque aparece, y uno
-- revocado porque desaparece. Las dos direcciones importan: la segunda es la que
-- avisaría de que Kavea se quedó sin poder mandar mensajes.
--
-- LA PRIMERA PASADA NO AVISA. Con la tabla vacía todo parece un cambio, y un
-- vigilante que grita el día que lo instalas es un vigilante al que se deja de
-- hacer caso. La primera vez siembra y calla; a partir de ahí compara.
--
-- Y NO ES UNA ACTIVIDAD, es una alerta. La actividad vive dentro de una
-- organización y esto es de la plataforma: no le pertenece a ningún inquilino.
-- `alertas` ya tiene `organization_id` nulable y `vigilante` en su vocabulario.

create table if not exists private.revision_permisos (
  permiso      text primary key,
  -- Sin lista cerrada: el día que Meta añada un estado nuevo, el vigilante tiene
  -- que poder anotarlo, no reventar. `ausente` es nuestro, no de Meta: significa
  -- que dejó de venir en la lista.
  estado       text not null,
  visto_en     timestamptz not null default now(),
  cambiado_en  timestamptz not null default now()
);

comment on table private.revision_permisos is
  'Lo último que Meta dijo de cada permiso de la app. Se compara para avisar de un cambio.';

-- ---------------------------------------------------------------------------
-- Anotar lo que Meta contesta y devolver QUÉ CAMBIÓ.
--
-- La comparación se hace en SQL y no en la función de borde a propósito: si el
-- borde comparase, el estado anterior tendría que viajar de ida y vuelta y dos
-- pasadas simultáneas podrían anotar la misma novedad dos veces.
-- ---------------------------------------------------------------------------
create or replace function private.anotar_revision(p_permisos jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_primera boolean;
  v_cambios jsonb;
  v_alerta  bigint;
begin
  if p_permisos is null or jsonb_typeof(p_permisos) <> 'array' then
    raise exception 'Se esperaba la lista de permisos.' using errcode = '22023';
  end if;
  -- Una lista VACÍA no es «no hay permisos»: es una respuesta que no dice nada, y
  -- tratarla como pérdida total inventaría trece revocaciones de golpe. Quien
  -- llama ya distingue el error de la respuesta buena; esto es el segundo cinturón.
  if jsonb_array_length(p_permisos) = 0 then
    raise exception 'La lista de permisos vino vacía; no se anota nada.' using errcode = '22023';
  end if;

  select not exists (select 1 from private.revision_permisos) into v_primera;

  -- Lo que Meta manda ahora. `distinct on` porque un duplicado en la lista haría
  -- que `on conflict` tocase la misma fila dos veces y la sentencia entera
  -- fallaría —a las 06:05, sin nadie delante.
  insert into private.revision_permisos as rp (permiso, estado)
  select distinct on (x->>'permission')
         x->>'permission', coalesce(x->>'status', 'sin_estado')
    from jsonb_array_elements(p_permisos) x
   where x->>'permission' is not null
  on conflict (permiso) do update
    set visto_en = now(),
        -- `cambiado_en` solo se mueve cuando el estado cambia de verdad. Es la
        -- misma distinción que la 0091 tuvo que aprender: mirar algo no es que
        -- ese algo cambie.
        cambiado_en = case when rp.estado <> excluded.estado then now() else rp.cambiado_en end,
        estado = excluded.estado;

  -- Y los que dejaron de venir. Se marcan `ausente` en vez de borrarse: la fila
  -- es la prueba de que ese permiso estuvo vivo alguna vez.
  update private.revision_permisos rp
     set estado = 'ausente', cambiado_en = now(), visto_en = now()
   where rp.estado <> 'ausente'
     and not exists (
       select 1 from jsonb_array_elements(p_permisos) x
        where x->>'permission' = rp.permiso
     );

  -- QUÉ CAMBIÓ EN ESTA PASADA, con igualdad y no con una ventana de segundos:
  -- `now()` es el instante de la transacción y no se mueve dentro de ella, así
  -- que las filas que acaba de tocar son exactamente las que valen `now()`. Una
  -- ventana de cinco segundos habría arrastrado además lo de la pasada anterior.
  select coalesce(
           jsonb_agg(jsonb_build_object('permiso', permiso, 'estado', estado) order by permiso),
           '[]'::jsonb)
    into v_cambios
    from private.revision_permisos
   where cambiado_en = now();

  if v_primera or jsonb_array_length(v_cambios) = 0 then
    return jsonb_build_object('primera_vez', v_primera, 'cambios', v_cambios, 'alerta', null);
  end if;

  insert into public.alertas (tipo, severidad, detalle)
  values ('vigilante', 'p2',
          jsonb_build_object('asunto', 'app_review', 'cambios', v_cambios))
  returning id into v_alerta;

  return jsonb_build_object('primera_vez', false, 'cambios', v_cambios, 'alerta', v_alerta);
end $fn$;

revoke execute on function private.anotar_revision(jsonb) from public, anon, authenticated;
grant  execute on function private.anotar_revision(jsonb) to service_role;

create or replace function public.anotar_revision(p_permisos jsonb)
returns jsonb
language sql volatile security definer set search_path = ''
as $$ select private.anotar_revision(p_permisos) $$;

revoke execute on function public.anotar_revision(jsonb) from public, anon, authenticated;
grant  execute on function public.anotar_revision(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Marcar que la alerta salió por correo.
--
-- Se marca DESPUÉS de que el proveedor acepte, no antes. Una alerta con
-- `notificada_en` puesto y ningún correo enviado es peor que ninguna alerta:
-- deja de aparecer entre las pendientes y nadie vuelve a mirarla.
-- ---------------------------------------------------------------------------
create or replace function private.alerta_notificada(p_alerta bigint)
returns void
language sql volatile security definer set search_path = ''
as $$ update public.alertas set notificada_en = now() where id = p_alerta $$;

revoke execute on function private.alerta_notificada(bigint) from public, anon, authenticated;
grant  execute on function private.alerta_notificada(bigint) to service_role;

create or replace function public.alerta_notificada(p_alerta bigint)
returns void
language sql volatile security definer set search_path = ''
as $$ select private.alerta_notificada(p_alerta) $$;

revoke execute on function public.alerta_notificada(bigint) from public, anon, authenticated;
grant  execute on function public.alerta_notificada(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- El cron. 06:05 UTC, una vez al día.
--
-- Una vez al día basta: el App Review tarda días, no minutos. Y va con
-- `private.cfg` como el resto de los crones —no con `vault.decrypted_secrets`,
-- que fue el error que dejó dos crones mudos en agosto.
-- ---------------------------------------------------------------------------
do $cron$
begin
  perform cron.unschedule('kavea-vigilar-revision');
exception when others then null;
end $cron$;

select cron.schedule(
  'kavea-vigilar-revision',
  '5 6 * * *',
  $cmd$
  select net.http_post(
    url     := private.cfg('functions_url') || '/vigilar-revision',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || private.cfg('service_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
);
