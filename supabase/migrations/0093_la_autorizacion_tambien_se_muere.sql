-- 0093_la_autorizacion_tambien_se_muere.sql
--
-- Los Page Access Tokens ya tienen quien los vigile: el despachador marca
-- `token_invalid_since` al recibir un error 190 enviando, y el reconciliador lo
-- comprueba cada quince minutos. **El BISU no tiene a nadie.**
--
-- Y es el que más silenciosamente falla. Un Page Access Token muerto se nota al
-- primer envío. El BISU solo se usa al descubrir y activar activos, o sea una
-- vez cada mucho: puede llevar semanas muerto y el único síntoma aparece el día
-- que un cliente entra a conectar un canal nuevo y la pantalla se queda vacía
-- sin saber decir por qué.
--
-- «NO CADUCA» NO ES «NO SE INVALIDA». La configuración se creó con caducidad
-- `Never` a conciencia (23-ago), pero un token sin fecha muere igual: cuando el
-- cliente revoca la app desde sus ajustes de negocio, cuando la persona que
-- autorizó pierde su rol en el portafolio, con un cambio de contraseña, o si
-- Meta restringe la app. Ninguna de esas cosas avisa.
--
-- Se guarda lo que responde `debug_token`, que dice más que «sirve o no sirve»:
-- si sigue vivo, cuándo caduca de verdad, y qué scopes quedan — porque un
-- cliente puede quitar UN permiso sin revocar la app entera, y entonces el token
-- vale para unas cosas y no para otras.

alter table private.meta_autorizaciones
  add column if not exists verificada_en   timestamptz,
  add column if not exists invalida_desde  timestamptz,
  add column if not exists expira_en       timestamptz,
  add column if not exists ultimo_motivo   text;

comment on column private.meta_autorizaciones.invalida_desde is
  'Cuando se detecto que el BISU dejo de servir. Null = sana. Lo escribe el cron '
  'diario contra debug_token; se limpia sola al reautorizar.';

-- ---------------------------------------------------------------------------
-- Anotar el resultado de una comprobación
-- ---------------------------------------------------------------------------
create or replace function private.anotar_autorizacion(
  p_org uuid,
  p_valida boolean,
  p_expira_en timestamptz default null,
  p_scopes text[] default null,
  p_motivo text default null
)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  update private.meta_autorizaciones
     set verificada_en = now(),
         -- No se pisa la fecha de la primera vez que se vio muerta: saber que
         -- lleva tres días caída es distinto de saber que cayó hace un minuto.
         invalida_desde = case
                            when p_valida then null
                            else coalesce(invalida_desde, now())
                          end,
         expira_en = coalesce(p_expira_en, expira_en),
         scopes = coalesce(p_scopes, scopes),
         ultimo_motivo = case when p_valida then null else p_motivo end
   where organization_id = p_org;
$fn$;

create or replace function public.anotar_autorizacion(
  p_org uuid, p_valida boolean, p_expira_en timestamptz default null,
  p_scopes text[] default null, p_motivo text default null
)
returns void
language sql volatile security definer set search_path = ''
as $fn$
  select private.anotar_autorizacion(p_org, p_valida, p_expira_en, p_scopes, p_motivo)
$fn$;

-- Qué organizaciones hay que comprobar. Solo ids: el cron no necesita tokens.
create or replace function public.organizaciones_con_autorizacion()
returns table (organization_id uuid)
language sql stable security definer set search_path = ''
as $fn$
  select organization_id from private.meta_autorizaciones;
$fn$;

-- ---------------------------------------------------------------------------
-- Lo que la pantalla puede saber. Sin material criptográfico.
-- ---------------------------------------------------------------------------
-- `create or replace` NO puede cambiar el tipo de retorno, y la 0092 la creó
-- devolviendo dos columnas. Hay que soltarla primero o la migración falla con
-- «cannot change return type of existing function».
drop function if exists public.hay_autorizacion_meta(uuid);

create function public.hay_autorizacion_meta(p_org uuid)
returns table (
  autorizado_en   timestamptz,
  renovado_en     timestamptz,
  verificada_en   timestamptz,
  invalida_desde  timestamptz,
  ultimo_motivo   text
)
language sql stable security definer set search_path = ''
as $fn$
  select a.autorizado_en, a.renovado_en, a.verificada_en, a.invalida_desde, a.ultimo_motivo
    from private.meta_autorizaciones a
   where a.organization_id = p_org
     and public.es_miembro(p_org);
$fn$;

-- ---------------------------------------------------------------------------
-- El cron: una vez al día, a las 04:41
-- ---------------------------------------------------------------------------
-- A esa hora y no en punto por la razón de siempre: los minutos redondos son
-- donde se amontonan todos los crones del mundo.
create or replace function private.disparar_verificacion_autorizaciones()
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_url text; v_clave text;
begin
  -- `private.cfg`, como el resto de los crones. Se comprobó contra
  -- `disparar_diagnostico` antes de escribir esto: suponer el mecanismo habría
  -- dado una función que se aplica sin error y no dispara nunca.
  v_url   := private.cfg('functions_url');
  v_clave := private.cfg('service_key');
  if v_url is null or v_clave is null then return; end if;

  perform net.http_post(
    url     := v_url || '/verificar-autorizaciones',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_clave),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $fn$;

-- `cron.schedule` con un nombre que ya existe lo reemplaza, así que reaplicar
-- esta migración no duplica el trabajo.
select cron.schedule('kavea-verificar-autorizaciones', '41 4 * * *',
                     $cron$ select private.disparar_verificacion_autorizaciones(); $cron$);

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function private.anotar_autorizacion(uuid,boolean,timestamptz,text[],text)
  from public, anon, authenticated;
revoke execute on function public.anotar_autorizacion(uuid,boolean,timestamptz,text[],text)
  from public, anon, authenticated;
revoke execute on function public.organizaciones_con_autorizacion()
  from public, anon, authenticated;
revoke execute on function private.disparar_verificacion_autorizaciones()
  from public, anon, authenticated;
revoke execute on function public.hay_autorizacion_meta(uuid) from public, anon;

grant execute on function public.anotar_autorizacion(uuid,boolean,timestamptz,text[],text) to service_role;
grant execute on function public.organizaciones_con_autorizacion() to service_role;
grant execute on function public.hay_autorizacion_meta(uuid) to authenticated;
