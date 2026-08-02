-- 0046_zona_horaria.sql — cada organización tiene su huso.
--
-- EL FALLO, DESTAPADO POR UN ERROR DE HIDRATACIÓN DE REACT
--
-- El calendario colocaba cada tarea con `vence_en.slice(0,10)`, es decir, por su
-- fecha en UTC. Una tarea a las 22:00 hora de Caracas son las 02:00 UTC del día
-- SIGUIENTE: aparecía un día tarde. Y la hora se pintaba con la del servidor en
-- el servidor y con la del navegador en el cliente, lo que además producía un
-- desajuste de hidratación.
--
-- El síntoma era un aviso críptico de React. La causa es que a Kavea le faltaba
-- un dato del negocio: en qué huso trabaja. No es un detalle de formato —Boosty
-- opera en Venezuela, República Dominicana y México, y son tres husos
-- distintos—, y sin él ni un recordatorio a las 9 de la mañana significa nada.
--
-- Se guarda en la organización, no en el usuario: la agenda es del negocio. Si
-- algún día hace falta por persona, se añade encima sin mover esto.

alter table public.organizations
  add column zona_horaria text not null default 'America/Caracas';

-- El nombre tiene que existir de verdad en la base de husos de Postgres. Un
-- 'America/Caracaz' con errata haría fallar todas las conversiones a la vez, y
-- el error saldría lejísimos de donde se escribió.
--
-- Va en un TRIGGER y no en un `CHECK`: un check no admite subconsultas
-- —Postgres responde «cannot use subquery in check constraint»— y `pg_timezone_names`
-- no es una lista que se pueda escribir a mano ni congelar en un enum: cambia
-- con las actualizaciones de la base de husos.
create or replace function private.validar_zona_horaria()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.zona_horaria) then
    raise exception '«%» no es un huso horario conocido. Se escribe como America/Caracas o America/Mexico_City.', new.zona_horaria
      using errcode = '22023';
  end if;
  return new;
end $$;

create trigger organizations_zona
  before insert or update of zona_horaria on public.organizations
  for each row execute function private.validar_zona_horaria();

comment on column public.organizations.zona_horaria is
  'Huso del negocio, en nombre IANA. Lo usan el calendario y los recordatorios. '
  'Boosty opera en VE, RD y MX: son tres husos y sin este dato una tarea a las '
  '22:00 se coloca el día siguiente.';
