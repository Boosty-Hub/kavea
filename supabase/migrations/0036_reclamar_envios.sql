-- 0036_reclamar_envios.sql — dos correcciones sobre la reclamación de 0034.
--
-- 1. NO COMPILABA. `distinct on (particion) ... for update skip locked` es
--    inválido: Postgres responde "FOR UPDATE is not allowed with DISTINCT
--    clause". Lo mismo pasa con GROUP BY, funciones de ventana y UNION. La fila
--    se quedaba en `encolado` y el despachador devolvía error sin haber tocado
--    Meta. Se parte en dos CTE: una elige y otra bloquea.
--
-- 2. ERA DEMASIADO PRUDENTE. Una fila por partición y tanda significa que tres
--    mensajes seguidos del mismo operador tardan tres despachos en salir. El
--    límite de Instagram para texto es 100/s por cuenta; un bucle secuencial con
--    ida y vuelta HTTP a Graph no llega ni de lejos, así que la partición no
--    está aquí para frenar, sino para que un cliente con 500 mensajes en cola no
--    deje al de al lado esperando. Se permiten hasta 3 por partición y tanda:
--    suficiente para que una conversación fluya, poco para monopolizar.

create or replace function private.reclamar_envios(p_lote integer default 10)
returns setof public.outbound_messages
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return query
  with ordenadas as (
    select o.id,
           row_number() over (partition by o.particion order by o.created_at) as puesto
      from public.outbound_messages o
     where o.estado in ('encolado', 'bloqueado')
       and o.no_antes_de <= now()
  ),
  elegidas as (
    select id from ordenadas where puesto <= 3 limit p_lote
  ),
  -- Este CTE sí puede llevar `for update`: es un select llano sobre la tabla.
  -- El `skip locked` es lo que evita que dos invocaciones concurrentes del
  -- despachador se peleen por la misma fila y la manden dos veces.
  tomadas as (
    select o.id
      from public.outbound_messages o
     where o.id in (select id from elegidas)
       and o.estado in ('encolado', 'bloqueado')
       for update skip locked
  )
  update public.outbound_messages o
     set estado = 'enviando', intentos = o.intentos + 1
    from tomadas t
   where o.id = t.id
  returning o.*;
end $$;
