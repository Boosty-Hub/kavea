-- 0039_busqueda_sin_html.sql — el resaltado no puede ser HTML.
--
-- `ts_headline` devuelve por defecto `<b>palabra</b>`, y ese texto sale de un
-- MENSAJE QUE ESCRIBIÓ UN TERCERO. Pintarlo con `dangerouslySetInnerHTML` para
-- que se vea la negrita sería XSS almacenado servido desde la bandeja del
-- cliente: un contacto escribe `<img onerror=...>` y ejecuta en el navegador del
-- operador que busque esa palabra.
--
-- La salida no lleva marcado. Se delimita con dos caracteres de control que no
-- aparecen en texto escrito por personas —ni los teclados los producen ni Meta
-- los transporta— y la interfaz parte por ahí y pinta con React, que escapa todo
-- por defecto. Si algún día un mensaje trajera el delimitador, lo peor que pasa
-- es un resaltado raro. Nunca ejecución.

create or replace function public.buscar_tarjetas(p_texto text, p_limite integer default 30)
returns table (
  tarjeta_id      uuid,
  titulo          text,
  contacto        text,
  estado          text,
  last_message_at timestamptz,
  fragmento       text,
  donde           text
)
language sql stable security invoker set search_path = public
as $$
  with termino as (
    select websearch_to_tsquery('spanish', p_texto) as q,
           '%' || btrim(p_texto) || '%' as like_q
  ),
  por_mensaje as (
    select c.tarjeta_id,
           ts_rank(to_tsvector('spanish', coalesce(m.texto, '')), t.q) as rango,
           ts_headline('spanish', coalesce(m.texto, ''), t.q,
                       'MaxWords=14, MinWords=5, ShortWord=2, MaxFragments=1, '
                       'StartSel=' || chr(1) || ', StopSel=' || chr(2)) as fragmento,
           'mensaje'::text as donde
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     cross join termino t
     where t.q is not null
       and to_tsvector('spanish', coalesce(m.texto, '')) @@ t.q
       and m.deleted_at is null
  ),
  por_ficha as (
    select tj.id as tarjeta_id, 1.0::real as rango,
           coalesce(tj.titulo, ct.nombre, ct.username, '') as fragmento,
           'persona'::text as donde
      from public.tarjetas tj
      left join public.contacts ct on ct.id = tj.contact_id
     cross join termino t
     where tj.titulo ilike t.like_q
        or ct.nombre ilike t.like_q
        or ct.username ilike t.like_q
  ),
  todo as (
    select * from por_mensaje
    union all
    select * from por_ficha
  )
  select distinct on (tj.id)
         tj.id,
         tj.titulo,
         coalesce(ct.nombre, ct.username, 'Contacto sin nombre'),
         tj.estado,
         tj.last_message_at,
         todo.fragmento,
         todo.donde
    from todo
    join public.tarjetas tj on tj.id = todo.tarjeta_id
    left join public.contacts ct on ct.id = tj.contact_id
   order by tj.id, todo.rango desc, tj.last_message_at desc nulls last
   limit p_limite
$$;

comment on function public.buscar_tarjetas(text, integer) is
  'Busca en mensajes, nombre de contacto y título de tarjeta y devuelve TARJETAS '
  'desduplicadas. El resaltado va entre chr(1) y chr(2), NO en HTML: el texto es '
  'de un tercero y pintarlo como marcado sería XSS. security invoker: el filtro '
  'por organización lo pone RLS.';
