-- 0055_adjunto_que_no_servimos.sql — un adjunto que no podemos mostrar existe igual.
--
-- EL FALLO, COMPLETO
--
-- El 2 de agosto de 2026 el contacto mandó dos GIF desde el selector de GIPHY
-- que Instagram lleva dentro. En la bandeja no apareció nada: dos burbujas que
-- decían «Sin contenido». La cadena, eslabón a eslabón:
--
--   1. El adjunto llega con `payload.url` en `media4.giphy.com`. La allowlist
--      de `adaptadores.ts` solo conoce hosts de Meta, así que `cdn_url` sale
--      nula. Correcto en intención —es defensa contra SSRF— y equivocado en
--      alcance: el selector de GIF ES una función de Instagram, y sirve desde
--      GIPHY.
--   2. Con `cdn_url` nula y `origen = 'meta_cdn'`, el CHECK `media_origen_
--      coherente` rechaza la fila. También correcto por separado.
--   3. `aplicar_adjuntos` captura la excepción y sigue, para que un adjunto roto
--      no tumbe el mensaje entero. Correcto otra vez. Su comentario dice que el
--      adjunto «se pierde con métrica»: NO HABÍA MÉTRICA. Se perdía en silencio.
--
-- Tres decisiones razonables encadenadas producen una pérdida invisible de
-- datos. Ninguna es el error; el error es que no quedaba rastro.
--
-- LO QUE CAMBIA: un adjunto cuyo host no sabemos servir se guarda igual, con
-- `origen = 'sin_servir'`. Sin URL que enseñar, pero con su tipo y su payload
-- crudo, que es donde vive la dirección original. La pantalla puede decir «el
-- contacto mandó un GIF que no podemos mostrar», que es una frase accionable, en
-- vez de «Sin contenido», que parece un mensaje vacío del cliente.

alter table public.media drop constraint media_origen_check;
alter table public.media drop constraint media_origen_coherente;

alter table public.media add constraint media_origen_check
  check (origen in ('meta_cdn', 'kavea_storage', 'sin_servir'));

alter table public.media add constraint media_origen_coherente check (
  (origen = 'meta_cdn'      and cdn_url is not null and storage_path is null)
  or (origen = 'kavea_storage' and storage_path is not null and cdn_url is null)
  -- Ni URL ni objeto: solo sabemos que llegó algo y de qué tipo era. El payload
  -- crudo es obligatorio en la tabla, así que la dirección original nunca se
  -- pierde aunque no se pueda pintar.
  or (origen = 'sin_servir' and cdn_url is null and storage_path is null)
);

comment on column public.media.origen is
  'meta_cdn: URL de un host de Meta que sabemos servir. kavea_storage: objeto '
  'nuestro. sin_servir: llego un adjunto cuyo host no esta en la allowlist; se '
  'guarda el tipo y el payload crudo para que no desaparezca en silencio.';

-- ---------------------------------------------------------------------------
-- El aplicador deja de perder adjuntos
-- ---------------------------------------------------------------------------
create or replace function private.aplicar_adjuntos(
  p_org uuid, p_mensaje uuid, p_adjuntos jsonb
)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare a jsonb; n int := 0;
begin
  if p_adjuntos is null or jsonb_typeof(p_adjuntos) <> 'array' then return 0; end if;

  for a in select * from jsonb_array_elements(p_adjuntos) loop
    begin
      if a->>'cdn_url' is not null then
        insert into public.media (
          organization_id, message_id, origen,
          cdn_url, cdn_host, cdn_url_recibida_en, tipo, payload
        ) values (
          p_org, p_mensaje, 'meta_cdn',
          a->>'cdn_url', a->>'cdn_host', now(),
          coalesce(a->>'tipo', 'fallback'), coalesce(a->'payload', '{}'::jsonb)
        );
      else
        -- Sin URL que sepamos servir. Antes esto reventaba el CHECK y el adjunto
        -- desaparecía; ahora queda, y la pantalla puede decir qué llegó.
        insert into public.media (
          organization_id, message_id, origen, cdn_url_recibida_en, tipo, payload
        ) values (
          p_org, p_mensaje, 'sin_servir', now(),
          coalesce(a->>'tipo', 'fallback'), coalesce(a->'payload', '{}'::jsonb)
        );
      end if;
      n := n + 1;
    exception when others then
      -- Sigue sin poder tumbar el mensaje: el mensaje ya está escrito y es lo
      -- que el operador necesita ver. Pero ahora esto es el último recurso de
      -- verdad y no la vía normal para media de terceros.
      null;
    end;
  end loop;

  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Recuperar lo que ya se perdió
-- ---------------------------------------------------------------------------
-- Los adjuntos siguen enteros dentro de `messages.raw`: lo que faltó fue la fila
-- de `media`. Se reconstruyen desde ahí, sin volver a llamar a Meta.
--
-- La lista de hosts se repite aquí, y es la única vez que se hace. La AUTORIDAD
-- es `HOSTS_PERMITIDOS` en `functions/_compartido/adaptadores.ts`; esto es un
-- rescate de una sola pasada, no una segunda implementación con la que después
-- haya que vivir.
insert into public.media
  (organization_id, message_id, origen, cdn_url, cdn_host, cdn_url_recibida_en, tipo, payload)
select
  m.organization_id, m.id,
  case when h.host is not null then 'meta_cdn' else 'sin_servir' end,
  case when h.host is not null then a->'payload'->>'url' end,
  h.host,
  m.created_at,
  coalesce(a->>'type', 'fallback'),
  a
from public.messages m
cross join lateral jsonb_array_elements(coalesce(m.raw->'message'->'attachments', '[]'::jsonb)) a
cross join lateral (
  select nullif(split_part(split_part(a->'payload'->>'url', '://', 2), '/', 1), '') as bruto
) u
cross join lateral (
  select case
    when u.bruto ~ '(^|\.)giphy\.com$' or u.bruto ~ '(^|\.)tenor\.com$'
      or u.bruto ~ '(^|\.)fbcdn\.net$' or u.bruto = 'lookaside.fbsbx.com'
      or u.bruto like 'scontent%'
    then u.bruto end as host
) h
where not exists (select 1 from public.media d where d.message_id = m.id);
