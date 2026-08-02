-- 0051_rpc_verificacion.sql — envoltorio público para el diagnosticador.
--
-- PostgREST NO EXPONE EL ESQUEMA `private`. Van tres veces: `reclamar_envios`
-- en 0035, `invitacion_por_token` en 0041 y ahora esto. La segunda fue peor que
-- la primera porque la pantalla trataba «no puedo consultar» y «no existe» como
-- lo mismo, y una invitación válida decía que ya no valía.
--
-- El envoltorio vive en `public` porque es donde PostgREST mira, y se le quita
-- el permiso a todo el mundo menos al rol de servicio. La lógica sigue en
-- `private`: lo que se expone es la puerta, no la habitación.
create or replace function public.anotar_verificacion(
  p_org       uuid,
  p_conexion  uuid,
  p_codigo    text,
  p_titulo    text,
  p_resultado text,
  p_causa     text default null,
  p_crudo     jsonb default null,
  p_bloquea   boolean default true
)
returns void
language sql volatile security definer set search_path = ''
as $$
  select private.anotar_verificacion(
    p_org, p_conexion, p_codigo, p_titulo, p_resultado, p_causa, p_crudo, p_bloquea)
$$;

revoke execute on function public.anotar_verificacion(uuid,uuid,text,text,text,text,jsonb,boolean)
  from public, anon, authenticated;

comment on function public.anotar_verificacion(uuid,uuid,text,text,text,text,jsonb,boolean) is
  'Puerta para el diagnosticador, que habla por PostgREST y no alcanza el '
  'esquema private. Sin permiso para anon ni authenticated: un cliente que '
  'pudiera escribir aqui se pintaria la conexion en verde.';
