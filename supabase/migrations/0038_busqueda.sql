-- 0038_busqueda.sql — buscar en la bandeja.
--
-- El índice `messages_busqueda_idx` existe desde la fase 3 y NADIE lo usaba: un
-- GIN que se paga en cada inserción de mensaje y no servía ni una consulta. Con
-- treinta conversaciones no se nota; con trescientas, no encontrar una es no
-- poder trabajar.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN `.textSearch()` DESDE LA APLICACIÓN
--
-- La búsqueda tiene que mirar en tres sitios a la vez —el texto de los mensajes,
-- el nombre de la persona y el título de la tarjeta— y devolver TARJETAS, no
-- mensajes: quien busca "presupuesto" quiere el asunto donde se habló de eso, no
-- catorce líneas sueltas. Eso es un `union` con desduplicación y ranking, que
-- desde PostgREST serían tres consultas y una mezcla en el cliente que no se
-- puede paginar.

create or replace function public.buscar_tarjetas(p_texto text, p_limite integer default 30)
returns table (
  tarjeta_id     uuid,
  titulo         text,
  contacto       text,
  estado         text,
  last_message_at timestamptz,
  fragmento      text,
  donde          text
)
language sql stable security invoker set search_path = public
as $$
  with termino as (
    -- `websearch_to_tsquery` y no `plainto_tsquery`: entiende comillas para la
    -- frase exacta y el `-` para excluir, que es lo que la gente ya escribe sin
    -- que nadie se lo explique.
    select websearch_to_tsquery('spanish', p_texto) as q,
           '%' || btrim(p_texto) || '%' as like_q
  ),
  -- Por contenido de los mensajes. Aquí es donde entra el índice GIN.
  por_mensaje as (
    select c.tarjeta_id,
           ts_rank(to_tsvector('spanish', coalesce(m.texto, '')), t.q) as rango,
           ts_headline('spanish', coalesce(m.texto, ''), t.q,
                       'MaxWords=14, MinWords=5, ShortWord=2, MaxFragments=1') as fragmento,
           'mensaje'::text as donde
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     cross join termino t
     where t.q is not null
       and to_tsvector('spanish', coalesce(m.texto, '')) @@ t.q
       and m.deleted_at is null
  ),
  -- Por persona o por título. Van con `ilike` y no con tsquery: un nombre propio
  -- no se lematiza, y buscar "Gonzá" tiene que encontrar a "González".
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
  -- Una fila por tarjeta, con su mejor coincidencia. Sin esto, una conversación
  -- que menciona la palabra ocho veces aparecería ocho veces y taparía al resto.
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

-- `security invoker`: la búsqueda se ejecuta con los permisos de quien la llama
-- y RLS filtra por organización en `messages`, `conversations` y `tarjetas`. No
-- hace falta comprobar la pertenencia a mano, y no se debe: una función de
-- búsqueda `security definer` sería la forma más fácil de que un tenant
-- encontrara texto de otro.
comment on function public.buscar_tarjetas(text, integer) is
  'Busca en mensajes, nombre de contacto y título de tarjeta, y devuelve TARJETAS '
  'desduplicadas con su mejor fragmento. security invoker a propósito: el filtro '
  'por organización lo pone RLS sobre las tablas base.';

revoke execute on function public.buscar_tarjetas(text, integer) from public, anon;
grant  execute on function public.buscar_tarjetas(text, integer) to authenticated;

-- El índice que faltaba para la mitad `ilike` de la búsqueda. Sin él, buscar por
-- nombre hace un recorrido secuencial de contactos: irrelevante con cien,
-- perceptible con cien mil.
create extension if not exists pg_trgm;

create index if not exists contacts_nombre_trgm_idx
  on public.contacts using gin (nombre gin_trgm_ops) where nombre is not null;
create index if not exists contacts_username_trgm_idx
  on public.contacts using gin (username gin_trgm_ops) where username is not null;
create index if not exists tarjetas_titulo_trgm_idx
  on public.tarjetas using gin (titulo gin_trgm_ops) where titulo is not null;
