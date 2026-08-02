-- 0024_adelanto_borrado.sql — el adelanto de un mensaje borrado dice que lo está.
--
-- Con `null`, la lista mostraba la conversación sin texto y eso se lee como un
-- fallo de la aplicación, no como "el contacto borró su mensaje". El estado
-- vacío tiene que explicarse solo.

create or replace function private.refrescar_adelanto()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
     set preview_texto  = case
           when new.deleted_at is not null then 'Mensaje eliminado'
           when new.texto is not null and length(btrim(new.texto)) > 0 then left(new.texto, 140)
           else '[adjunto]' end,
         preview_emisor = new.emisor,
         no_leidos = case
           when new.direccion = 'inbound' and not new.is_echo
           then c.no_leidos + 1 else c.no_leidos end
   where c.id = new.conversation_id;
  return null;
end $$;

-- Un borrado que llega DESPUÉS del mensaje también tiene que refrescar el
-- adelanto: si no, la lista sigue mostrando el texto que el contacto acaba de
-- eliminar, que es peor que mostrarlo vacío.
create or replace function private.adelanto_tras_borrado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.conversations c
       set preview_texto = 'Mensaje eliminado'
     where c.id = new.conversation_id
       and not exists (
         select 1 from public.messages m2
          where m2.conversation_id = new.conversation_id
            and m2.meta_timestamp > new.meta_timestamp
       );
  end if;
  return null;
end $$;

create trigger messages_adelanto_borrado
  after update on public.messages
  for each row execute function private.adelanto_tras_borrado();

-- Recalcular lo existente.
update public.conversations c
   set preview_texto = sub.texto, preview_emisor = sub.emisor
  from (
    select conversation_id,
           (array_agg(case when deleted_at is not null then 'Mensaje eliminado'
                           when texto is not null and length(btrim(texto)) > 0 then left(texto,140)
                           else '[adjunto]' end order by meta_timestamp desc))[1] as texto,
           (array_agg(emisor order by meta_timestamp desc))[1] as emisor
      from public.messages group by conversation_id
  ) sub
 where c.id = sub.conversation_id;
