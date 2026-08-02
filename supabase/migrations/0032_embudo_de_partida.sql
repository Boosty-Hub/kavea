-- 0032_embudo_de_partida.sql — una organización nueva nace con embudo.
--
-- EL HUECO, DESTAPADO POR LA SUITE DE AISLAMIENTO
--
-- La semilla de 0031 recorrió las organizaciones que existían en ese momento.
-- Las que se creen después —es decir, todos los clientes que entren por el
-- onboarding de la fase 7— nacían sin embudo y sin etapas. Consecuencias:
--
--   · El tablero de un cliente nuevo aparece vacío el primer día, y antes de
--     poder mirar nada tiene que diseñar un embudo.
--   · Peor: `tarjeta_de_contacto` crea las tarjetas SIN etapa, en silencio. Las
--     conversaciones entran, se ven en la bandeja, y no están en ningún sitio
--     del tablero. Nadie se entera hasta que alguien abre el embudo.
--
-- Lo destapó la suite de aislamiento, que crea dos organizaciones desechables y
-- vio cero etapas. Es la segunda vez en dos días que la suite encuentra algo
-- antes que la interfaz.

create or replace function private.sembrar_embudo(p_org uuid)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_embudo uuid;
begin
  -- Idempotente: si ya tiene alguno, no se toca. Que esto se pueda llamar dos
  -- veces sin consecuencias es lo que permite usarlo tanto en el trigger como a
  -- mano para reparar una organización concreta.
  select id into v_embudo from public.embudos where organization_id = p_org limit 1;
  if v_embudo is not null then return v_embudo; end if;

  insert into public.embudos (organization_id, nombre, descripcion, orden, es_predeterminado)
  values (p_org, 'Ventas',
          'Embudo de partida. Renombra o cambia las etapas cuando quieras.', 0, true)
  returning id into v_embudo;

  insert into public.etapas (organization_id, embudo_id, nombre, orden, color, tipo)
  select p_org, v_embudo, x.nombre, x.orden, x.color, x.tipo
    from (values
      ('Nuevo',             0, 'piedra',    'abierta'),
      ('Contactado',        1, 'azul',      'abierta'),
      ('Interesado',        2, 'terracota', 'abierta'),
      ('Propuesta enviada', 3, 'ambar',     'abierta'),
      ('Ganada',            4, 'verde',     'ganada'),
      ('Perdida',           5, 'teja',      'perdida')
    ) as x(nombre, orden, color, tipo);

  return v_embudo;
end $$;

revoke execute on function private.sembrar_embudo(uuid) from public, anon, authenticated;

create or replace function private.embudo_al_crear_organizacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.sembrar_embudo(new.id);
  return null;
end $$;

create trigger organizations_embudo
  after insert on public.organizations
  for each row execute function private.embudo_al_crear_organizacion();

-- Y se repara lo que ya existiera sin embudo.
select private.sembrar_embudo(o.id)
  from public.organizations o
 where not exists (select 1 from public.embudos e where e.organization_id = o.id);
