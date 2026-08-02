-- 0050_verificaciones.sql — el estado real de una conexión, comprobación a comprobación.
-- Fuente: docs/fases/05-fase-configuracion.md T12 (V1–V7).
--
-- LA DECISIÓN QUE ORDENA ESTE ARCHIVO
--
-- UN BOOLEANO GLOBAL NO SIRVE PARA NADA. «La conexión falla» no le dice a nadie
-- qué hacer; «la app no aparece en subscribed_apps» sí. El 80 % de los fallos de
-- conexión son configuración del cliente, no código, y un OAuth que devuelve 200
-- y una Página de la que no llega un solo mensaje son el MISMO estado desde el
-- código y estados opuestos desde el negocio. Esta tabla existe para
-- distinguirlos.
--
-- Cada comprobación es una fila. `no_verificable` es un resultado de primera
-- clase y no un fallo disfrazado: el toggle «Permitir acceso a mensajes» no lo
-- expone ninguna API, y decir «no lo sé» es lo único cierto que se puede decir.
-- Un `fallo` inventado por no tener el dato manda a alguien a arreglar lo que no
-- está roto.
--
-- SE GUARDA EL ESTADO ACTUAL, NO EL HISTORIAL. Una fila por comprobación, que se
-- pisa en cada pasada. El historial que importa —que algo pasó de verde a rojo—
-- se escribe en `actividades` SOLO cuando el resultado cambia: siete filas
-- nuevas cada vez que corre el cron serían ruido que entierra el único evento
-- que alguien quiere ver.

create table public.verificaciones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id uuid not null,

  -- V1..V7. Texto y no enum: la lista crece con cada canal nuevo, y una
  -- migración para añadir una comprobación es fricción que acaba en que la
  -- comprobación no se añade.
  codigo   text not null check (codigo ~ '^V[0-9]+$'),
  titulo   text not null,

  resultado text not null check (resultado in ('ok', 'fallo', 'no_verificable', 'sin_probar')),
  -- Qué hacer, no qué pasó. «Error 190» no es una causa para quien lo lee.
  causa    text,
  -- La respuesta cruda de Meta. Es lo que permite cerrar un incierto meses
  -- después sin volver a llamar.
  crudo    jsonb,

  bloquea  boolean not null default true,

  verificado_en timestamptz not null default now(),

  constraint verificaciones_org_id_uniq unique (organization_id, id),
  constraint verificaciones_conexion_mismo_tenant
    foreign key (organization_id, meta_connection_id)
    references public.meta_connections (organization_id, id) on delete cascade,
  constraint verificaciones_una_por_codigo unique (meta_connection_id, codigo)
);

create index verificaciones_conexion_idx
  on public.verificaciones (organization_id, meta_connection_id, codigo);

alter table public.verificaciones enable row level security;
alter table public.verificaciones force  row level security;

create policy verificaciones_select on public.verificaciones
  for select to authenticated using (public.es_miembro(organization_id));

-- Sin políticas de escritura: escribe el rol de servicio desde el diagnosticador.
-- Un cliente que pudiera escribir aquí podría pintarse una conexión en verde.

comment on table public.verificaciones is
  'Estado actual de cada comprobación de conexión, una fila por codigo. '
  'no_verificable es un resultado de primera clase: el toggle de mensajes no lo '
  'expone ninguna API y fingir un fallo manda a arreglar lo que no esta roto.';

-- ---------------------------------------------------------------------------
-- Escribir un resultado, y dejar rastro solo si cambia
-- ---------------------------------------------------------------------------
create or replace function private.anotar_verificacion(
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
language plpgsql volatile security definer set search_path = ''
as $$
declare v_antes text;
begin
  select resultado into v_antes
    from public.verificaciones
   where meta_connection_id = p_conexion and codigo = p_codigo;

  insert into public.verificaciones
    (organization_id, meta_connection_id, codigo, titulo, resultado, causa, crudo, bloquea)
  values (p_org, p_conexion, p_codigo, p_titulo, p_resultado, p_causa, p_crudo, p_bloquea)
  on conflict (meta_connection_id, codigo) do update
    set titulo = excluded.titulo,
        resultado = excluded.resultado,
        causa = excluded.causa,
        crudo = excluded.crudo,
        bloquea = excluded.bloquea,
        verificado_en = now();

  -- Solo el cambio. Una pasada del cron que confirma lo de siempre no es un
  -- acontecimiento; que una conexión se caiga de madrugada, sí.
  if v_antes is distinct from p_resultado then
    insert into public.actividades (organization_id, tipo, actor_tipo, actor_nombre, detalle)
    values (p_org, 'conexion.verificacion', 'sistema', 'Kavea',
            jsonb_build_object('codigo', p_codigo, 'titulo', p_titulo,
                               'de', v_antes, 'a', p_resultado, 'causa', p_causa));
  end if;
end $$;

revoke execute on function private.anotar_verificacion(uuid,uuid,text,text,text,text,jsonb,boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ve la pantalla
-- ---------------------------------------------------------------------------
-- El estado de la conexión ENTERA se deriva de las filas, no se guarda aparte.
-- Un campo `estado` almacenado junto a siete comprobaciones es un octavo dato
-- que puede contradecir a los otros siete, y el día que se contradiga nadie
-- sabrá cuál creer.
create view public.estado_de_conexion
with (security_invoker = on) as
  select
    c.organization_id,
    c.id as meta_connection_id,
    c.page_name,
    c.page_id,
    c.ig_username,
    count(*) filter (where v.resultado = 'ok')             as en_verde,
    count(*) filter (where v.resultado = 'fallo')          as en_rojo,
    count(*) filter (where v.resultado = 'no_verificable') as sin_saber,
    count(*) filter (where v.resultado = 'sin_probar')     as sin_probar,
    -- Bloqueada si algo que bloquea está en rojo. Lo que no bloquea avisa.
    bool_or(v.resultado = 'fallo' and v.bloquea)           as bloqueada,
    max(v.verificado_en)                                   as ultima_pasada
  from public.meta_connections c
  left join public.verificaciones v on v.meta_connection_id = c.id
 group by c.organization_id, c.id, c.page_name, c.page_id, c.ig_username;

comment on view public.estado_de_conexion is
  'El estado global se DERIVA de las comprobaciones, no se guarda. Un campo '
  'estado junto a siete comprobaciones es un octavo dato que puede '
  'contradecirlas, y el dia que lo haga nadie sabra cual creer.';

-- ---------------------------------------------------------------------------
-- El cron: una pasada diaria por cada conexión
-- ---------------------------------------------------------------------------
-- Una conexión no se rompe cuando alguien la mira; se rompe de madrugada, con
-- un token revocado o una app desuscrita por Meta. Sin pasada periódica, el
-- cliente se entera por el silencio de su bandeja.
create or replace function private.disparar_diagnostico()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_key text; r record;
begin
  v_url := private.cfg('functions_url');
  v_key := private.cfg('service_key');
  if v_url is null or v_key is null then return; end if;

  for r in select id from public.meta_connections where token_invalid_since is null loop
    perform net.http_post(
      url     := v_url || '/diagnosticar',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('conexion', r.id, 'origen', 'cron'),
      timeout_milliseconds := 25000
    );
  end loop;
end $$;

revoke execute on function private.disparar_diagnostico() from public, anon, authenticated;

select cron.schedule('diagnosticar-conexiones', '17 6 * * *',
                     $cron$ select private.disparar_diagnostico(); $cron$);
