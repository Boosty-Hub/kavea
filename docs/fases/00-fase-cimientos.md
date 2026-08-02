# Fase 0 — Cimientos

**Fecha:** 2 de agosto de 2026
**Estado:** plan de ejecución
**Revisión:** reescrito el 2 de agosto de 2026 sobre `02` §7 (corrección de precedencia del `06` §0) y con la app en Netlify (decisión de Gabriel, 2-ago)

**Fuentes, por orden de precedencia:**

| Materia | Documento |
|---|---|
| Invariantes de Meta | `03-invariantes-meta.md` — normativo, por encima de todo |
| Modelo de datos, RLS, cifrado de tokens | `02-conexion-instagram-facebook.md` §7 |
| Ingesta, cola, credenciales, Realtime | `02` §5 |
| Superficies, subdominio, panel interno, break-glass | `06-arquitectura-plataforma.md` §2, §3, §6 |
| Alcance y criterio de avance | `00-documento-base.md` |

**Corresponde a:** bloque 0 de la sección 8 del doc 06.

> **Dos correcciones incorporadas en esta revisión.**
>
> **Primera, de fuente.** La versión anterior de este plan tomó el modelo de datos del `06`
> §4 original, escrito sin haber leído el `02`. Quedaba mal en seis puntos: `memberships` en
> vez de `organization_members`; enrutado por índices únicos parciales en `channels` en vez
> de `meta_asset_routes`; `credenciales jsonb` en vez de `private.meta_credentials`;
> funciones de RLS en `private` en vez del `public.es_miembro` del §7.7; cola de eventos en
> Postgres en vez de Cloudflare Queues; y una Edge Function de Supabase que el `02` §5.2
> descarta con todas las letras (*"Supabase Edge Functions → no se despliega ninguna en
> v1"*). Corregido contra el `02` §7.1 a §7.8.
>
> **Segunda, de proveedor.** La app va en **Netlify**, no en Vercel. Eso cambia el
> despliegue, el middleware, los previews y —sobre todo— el certificado comodín, que pasa de
> ser una nota a ser el riesgo principal del bloque. Ver R1 y T26.
>
> El `06` §1 y §2 ya están corregidos: dicen Netlify. Además el `06` §3 recoge la decisión
> de delegar la zona a Netlify DNS y por qué se descartó Cloudflare para ese papel.

---

## Objetivo

Dejar el repositorio, la base de datos y el despliegue en un estado donde
`boosty.kavea.ai` abre sesión, resuelve su organización y **no puede ver ni escribir datos
de otra**, con esa afirmación demostrada por una batería de pruebas que falla si RLS está
mal.

Lo que esta fase produce no se ve: no hay bandeja, no hay mensajes, no hay agentes. Lo que
produce son las **dos fronteras** del sistema, que el `02` §7.7 distingue y que es fácil
confundir:

- **Plano de lectura:** RLS sobre `organization_members`. Decide qué ve una sesión.
- **Plano de escritura de ingesta:** la clave primaria de `meta_asset_routes`. Decide en
  qué tenant se escribe un evento entrante. El worker escribe con rol de servicio y salta
  RLS por diseño, porque tiene que poder escribir en cualquier tenant.

*Confundir las dos cosas es cómo se llega a un incidente de cruce de datos con RLS
"activado"* (`02` §7.7). Esta fase construye las dos y las prueba por separado.

**Fuera de alcance.** Worker de ingesta, Queues y crones de Cloudflare (bloque 1);
normalizador (bloque 2); bandeja (bloque 3); envío (bloque 4); módulo de configuración
(bloque 5); agentes (bloque 6); primer cliente (bloque 7). También el flujo de OAuth de
alta, que vive en route handlers de Next.js pero pertenece al bloque 5.

Lo que sí entra de Cloudflare: la cuenta, la estructura del repositorio y la prueba de
coherencia de secretos entre proveedores que el `06` §1 exige. No se escribe lógica de
ingesta.

---

## Precondiciones

| # | Precondición | Cómo se verifica |
|---|---|---|
| 1 | `kavea.ai` en GoDaddy (`ns35`/`ns36.domaincontrol.com`), con acceso al panel DNS | Se puede crear un registro TXT arbitrario |
| 2 | Organización de GitHub `Boosty-Hub`, con 2FA obligatorio | Ajustes de la organización |
| 3 | Cuenta de Netlify con acceso a `Boosty-Hub` y con el sitio público ya conectado | Se ve el sitio de `kavea.ai` en el panel |
| 4 | Cuenta de Cloudflare con Workers, Queues y R2 habilitados | `wrangler whoami` responde |
| 5 | Proyecto Supabase `sdazqohyjzzylwbkvovx`, con la contraseña de base de datos | `supabase link` termina sin error |
| 6 | Postgres 15 o superior en ese proyecto | `show server_version` |
| 7 | Docker en marcha en local | `docker ps` responde |
| 8 | Claves de API: Anthropic, Resend | En el gestor de secretos, no en un chat |
| 9 | **Decisión tomada sobre R1** (dónde vive la zona DNS) | Ver T26; condiciona T22 y T24 |

La precondición 9 es nueva y bloquea de verdad: sin resolver dónde vive la zona no hay
certificado comodín, y sin comodín no hay `*.kavea.ai`. Se decide antes de escribir la
primera línea del middleware, no después.

**Resend ya está resuelto.** El `06` §7 lo da por verificado y operativo el 2 de agosto:
DKIM, subdominio de envío `send.kavea.ai` y MX de entrada publicados, con prueba de extremo
a extremo. No es tarea de esta fase, pero **sí es carga útil de R1**: si la zona se muda,
esos registros se mudan con ella y romperlos deja sin correo la dirección publicada en las
páginas legales, que es lo que sostiene el App Review.

Las credenciales de Meta **no** son precondición. El trámite corre en paralelo (doc 05) y
bloquea el bloque 1, no el 0. Sí se crean las variables de entorno vacías, en los dos
proveedores, para que el bloque 1 no tenga que tocar la configuración de despliegue.

---

## Entregables

1. Repositorio privado `Boosty-Hub/kavea` como monorepo: `web/`, `app/`, `workers/`,
   `supabase/`, `docs/`, `brand/`, `scripts/`.
2. Trece migraciones SQL que reconstruyen el esquema del `02` §7 desde cero con
   `supabase db reset`.
3. `public.es_miembro(uuid)`, `public.es_owner(uuid)`, `public.es_staff()` y
   `public.org_ids_con_grant()`, en la forma del `02` §7.7 con `search_path` cerrado.
4. RLS activo y forzado en las trece tablas de `public`, con `webhook_events` a cero
   políticas.
5. `private.meta_credentials`, con el esquema `private` fuera de la configuración de la API.
6. **Dos sitios de Netlify sobre el mismo repositorio**: el existente con `base = "web"` y
   uno nuevo con `base = "app"`.
7. DNS resuelto según la opción elegida en T26, con certificado comodín válido y con
   vigilancia de caducidad.
8. Tres entornos con secretos separados: local, Deploy Preview, producción.
9. Batería de aislamiento en pgTAP (lectura y escritura), prueba de extremo a extremo sobre
   PostgREST, y prueba de coherencia de secretos entre Netlify y Cloudflare.
10. CI que en cada push comprueba tipos, lint, build, migraciones desde cero y aislamiento.
11. Organización `boosty` sembrada en producción con su primer usuario `owner`.

---

## Decisiones que esta fase cierra

| Decisión | Elección | Razón |
|---|---|---|
| Alojamiento de la app | **Netlify**, segundo sitio sobre el mismo repositorio | Decisión de Gabriel, 2-ago |
| Gestor de paquetes | pnpm con workspaces | Un lockfile; Netlify lo detecta con `base` |
| Runtime | Node 22 LTS, fijado en `.nvmrc` y CI | Que local, CI y Netlify coincidan |
| Vocabularios | `text` con `check`, o dominio | `02` §7: nunca `enum`; Meta añade valores sin avisar |
| Timestamps de Meta | `bigint` verbatim + columna generada | `02` §7: el error de segundos contra milisegundos no puede cometerse en silencio |
| Entorno de preview | Proyecto Supabase aparte | Un Deploy Preview con la clave de servicio de producción lee todos los tenants |
| Cookie de sesión | Dominio `.kavea.ai` | Un usuario con varias organizaciones no inicia sesión N veces |
| Resolución de `organization_id` | En el servidor, no en el middleware | El middleware corre en cada petición; el id sin comprobar membresía no sirve |
| Escritura en `organization_members` | Solo rol `owner` | Con una política uniforme, un `agente` se asciende a sí mismo |
| Escritura en `messages`, `message_events`, `media` | Solo rol de servicio | Las escribe el normalizador; el envío pasa por la lógica de ventana |
| Alta de organizaciones | Solo rol de servicio | No hay registro self-service en v1 |
| Claves foráneas | Compuestas sobre `(organization_id, id)` | Ver T9 |
| Reversión de migraciones | Migración compensatoria hacia adelante | El CLI de Supabase no tiene `down` |

---

## Diferencias con el `02` §7, y por qué

El `02` §7 es la fuente. Donde este plan se aparta, se aparta a propósito y con argumento.
Siete puntos, ninguno enterrado.

**1. `search_path = ''` en vez de `= public`.**
El §7.7 declara `public.es_miembro` con `set search_path = public`. Este plan lo cierra a
`''`. El motivo: con `security definer`, `search_path` es la superficie de ataque clásica —
quien pueda crear un objeto en un esquema que preceda a `public` en la ruta puede shadowear
`public.organization_members` y hacer que la función devuelva `true` siempre. En Supabase
`authenticated` no puede crear objetos en `public` por defecto, así que el riesgo práctico
hoy es bajo; pero el cambio **no cuesta nada**, porque el cuerpo del §7.7 ya cualifica todo
(`public.organization_members`, `auth.uid()`) y por tanto funciona sin modificaciones con la
ruta vacía. Endurecer algo gratis y sin tocar el cuerpo es una mejora, no una discrepancia
de criterio.

Y hay un efecto colateral que resuelve un riesgo que la versión anterior de este plan
arrastraba: con `search_path = ''`, un tipo como `citext` —que en Supabase vive en el
esquema `extensions`— dejaría de resolver. Como el §7.1 declara `slug text`, no `citext`, el
conflicto desaparece por completo. Se adopta el `text` del §7.1 y se descarta `citext`.

**2. `force row level security`, además de `enable`.**
El §7.7 activa RLS; este plan lo fuerza. `enable` no aplica las políticas al dueño de la
tabla; `force` sí. No cambia nada para `service_role` ni para `postgres`, que tienen
`BYPASSRLS` y lo saltan igual —por eso la ingesta sigue funcionando—, pero cierra el caso de
un rol futuro que sea dueño de tablas sin ese atributo. Coste: si el rol que aplica
migraciones no tuviera `BYPASSRLS`, la migración de semilla fallaría. Se comprueba en T17 y
queda como R8.

**3. Claves foráneas compuestas sobre `(organization_id, id)`.**
El §7 usa claves simples. Ver T9, que es la evaluación completa. Resumen: las claves simples
permiten coser un mensaje de A a una conversación de B y RLS no lo detecta, porque cada fila
cumple su propia política. No es la frontera principal —esa es `meta_asset_routes`— pero
cierra una fuga real de contenido por break-glass.

**4. `es_owner` para la escritura sobre `organization_members`.**
El §7.7 da un solo predicado, `es_miembro`. Aplicado uniformemente a `organization_members`
permite `update … set rol='owner' where user_id = auth.uid()`: cualquier `agente` se asciende
dentro de su tenant. La tabla que **define** la autorización no puede regirse por la misma
regla que las tablas que la consumen. Se añade un segundo predicado con la misma forma.

**5. Formato y reserva del `slug`.**
El §7.1 declara `slug text not null unique` y nada más, lo cual es correcto para el §7: allí
el slug es un identificador. En este plan el slug **es el subdominio**, así que su formato es
una restricción de enrutado. Un `slug = 'admin'` produciría una organización que colisiona
con el panel interno. Se añaden dos `check`.

**6. Índices con `organization_id` como columna líder.**
El §7.5 declara `messages_hilo_idx on (conversation_id, meta_timestamp desc)` y el §7.3
`contact_identities_contact_idx on (contact_id)`. Ambos cumplen su propósito, y el punto 2
del §7.7 —índice sobre `organization_id` en cada tabla— lo satisface en `messages` el índice
único de idempotencia. Este plan antepone `organization_id` a esos dos índices para que uno
solo sirva a la vez al filtro de la política, a la cascada de la clave compuesta y a la
consulta original. Es economía de índices, no un desacuerdo.

**7. Restricciones sobre `access_grants`.**
El `06` §6 declara `motivo text not null` y `expira_en timestamptz not null`. Se añade
longitud mínima al motivo y techo de 72 horas a la vigencia. Un motivo de tres palabras no es
un motivo, y un break-glass que dura una semana es un permiso permanente con otro nombre.

**Y una donde el `02` gana y este plan cede.** La versión anterior proponía funciones sin
argumentos que devolvían `setof uuid`, usadas como `organization_id in (select f())`, porque
se evalúan una vez por consulta en lugar de una vez por fila. Es más rápido, pero se aparta
de la forma del §7.7 sin haberlo medido. Se adopta `es_miembro(org)` tal cual, y la
optimización queda condicionada a la medición de T23 y a llevarla de vuelta al `02` si
procede. Ver P4.

---

## Tareas

### T1 — Repositorio y estructura de monorepo

El directorio local (`docs/`, `brand/`) no está versionado. Primera acción: ponerlo bajo
control de versiones y traer el sitio Astro dentro.

```
kavea/
├─ app/                 Next.js App Router → sitio de Netlify con base = "app"
│  └─ netlify.toml
├─ web/                 Astro → sitio de Netlify con base = "web" (ya existe)
│  └─ netlify.toml
├─ supabase/
│  ├─ config.toml       incluye verify_jwt = false del receptor
│  ├─ functions/        Edge Functions: receptor y normalizador (esqueleto en esta fase)
│  ├─ migrations/       0001…0013
│  ├─ tests/            pgTAP
│  └─ seed.sql          solo local
├─ scripts/
├─ docs/
├─ brand/
├─ .github/workflows/ci.yml
├─ pnpm-workspace.yaml
├─ package.json
├─ .env.example
├─ .nvmrc
└─ .gitignore
```

`workers/` existe desde ahora aunque no tenga lógica. El `06` §1 avisa de que varios
proveedores significan varios almacenes de secretos que pueden desincronizarse; tener el
Worker en el mismo repositorio que la app es la única forma de que una prueba compare ambos
(T22).

El sitio Astro entra preservando historia:

```bash
git subtree add --prefix web https://github.com/Boosty-Hub/<repo-astro>.git main --squash
```

Si el subtree falla por historia divergente, se copia el árbol de trabajo y el repositorio
viejo queda archivado con un README que apunte al nuevo. Se pierde historia, no código.

**El `netlify.toml` de la raíz se elimina.** Hoy existe y apunta a `web/`. Con dos sitios
sobre el mismo repositorio, un fichero en la raíz aplicaría a los dos y el segundo heredaría
la configuración del primero. Se mueve su contenido a `web/netlify.toml` y se crea
`app/netlify.toml`. La `base` de cada sitio se fija en el panel de Netlify, y Netlify busca
el `netlify.toml` dentro de esa base. **Comprobar en el registro del primer despliegue qué
fichero leyó**: la resolución de configuración con `base` fijada tiene matices y no conviene
darla por supuesta.

`.gitignore` desde el primer commit: `.env`, `.env.local`, `.env*.local`, `.netlify`,
`.next`, `node_modules`, `supabase/.temp`, `supabase/.branches`, `.wrangler`.

**Criterio de aceptación.** `git clone` en máquina limpia + `pnpm install` + `pnpm -r build`
termina en cero. El sitio público sirve sin interrupción durante toda la operación.

---

### T2 — Los dos sitios de Netlify

No es un despliegue por cliente. Es uno por superficie, sobre el mismo repositorio.

| Sitio | `base` | Dominios | Estado |
|---|---|---|---|
| Público | `web` | `kavea.ai`, `www.kavea.ai` | Existe y está vivo. **No se toca** |
| Aplicación | `app` | `*.kavea.ai`, `admin.kavea.ai` | Se crea nuevo |

El sitio nuevo se crea aparte, se despliega, se verifica en su URL `*.netlify.app`, y solo
entonces se le asignan dominios. En ningún momento se modifica la configuración del sitio
existente.

`app/netlify.toml`:

```toml
[build]
  command = "pnpm build"
  publish = ".next"

# Con dos sitios sobre un repositorio, cada commit dispara los dos builds.
# `ignore` corta el que no toca. El comando se evalúa desde `base`.
  ignore = "git diff --quiet HEAD^ HEAD -- ."

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Dos avisos:

- **Fijar la versión del plugin de Next.js.** El Next Runtime es lo que convierte el
  middleware en una Edge Function de Netlify y lo que decide cómo se sirven las rutas del App
  Router. Una actualización automática cambia ese comportamiento sin que nadie lo pida.
- **`ignore` es lo que impide que un commit en `docs/` reconstruya la aplicación.** Sin él,
  cada cambio de documentación dispara dos builds y el tiempo de CI se dobla sin motivo. Hay
  que verificar que `ignore` se evalúa relativo a `base`; si no lo hace, la forma explícita
  es `git diff --quiet HEAD^ HEAD -- app/`.

**Criterio de aceptación.** Un commit que solo toca `docs/` no dispara ninguno de los dos
builds. Un commit que toca `web/` dispara solo el público. Un commit que toca `app/` dispara
solo el de aplicación. El sitio público sigue sirviendo con el mismo certificado y el mismo
contenido que antes de la operación.

---

### T3 — Cadena de herramientas y entorno local

Versiones fijadas, no "la última": Node 22.x en `.nvmrc` y en `engines`; pnpm en
`packageManager`; CLI de Supabase fijado a una versión concreta en CI; `wrangler` fijado en
`workers/package.json`; `@netlify/plugin-nextjs` fijado en `app/`.

`supabase init`, `supabase start`, `supabase link --project-ref sdazqohyjzzylwbkvovx`.

Guarda de enlace: `scripts/comprobar-enlace.ts` lee `supabase/.temp/project-ref` y falla si no
coincide con el esperado por el entorno. Aplicar migraciones al proyecto equivocado es un
error de un carácter.

**Criterio de aceptación.** `supabase start && supabase db reset` en máquina limpia
reconstruye el esquema y termina en cero. `node --version` coincide con `.nvmrc`.

---

### T4 — Entornos y separación producción / preview / local

| Entorno | Base | Quién la toca |
|---|---|---|
| local | Stack del CLI en Docker | El desarrollador |
| preview | Proyecto Supabase `kavea-preview` | Deploy Previews y branch deploys de Netlify |
| producción | `sdazqohyjzzylwbkvovx` | Solo la rama por defecto tras CI verde |

Preview **no apunta a producción**. Un Deploy Preview lleva la clave de servicio en sus
variables; con esa clave se lee cualquier fila de cualquier tenant sin pasar por RLS, y
cualquiera con acceso al repositorio puede abrir un PR y desplegar un preview. En Netlify
esto se configura con *deploy contexts*: `production`, `deploy-preview` y `branch-deploy`
tienen valores distintos para la misma variable.

Alternativa evaluada para la base: Supabase Branching, una base efímera por PR. Aísla mejor y
evita la deriva de esquema, con coste por rama. Queda como P1.

Antes de la primera migración con datos reales: comprobar si el proyecto tiene *point-in-time
recovery* o solo copias diarias. La respuesta define la ventana real de recuperación y qué
migraciones se consideran seguras.

**Criterio de aceptación.** Los tres entornos tienen la misma versión de esquema
(`supabase migration list` coincide). Ninguna variable del contexto `deploy-preview` contiene
una clave de producción, verificado leyendo la configuración de Netlify por contexto.

---

### T5 — Migración 0001: base, dominio y membresías

`02` §7.1, verbatim salvo los añadidos señalados.

```sql
-- 0001_base.sql

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Dominio, no enum. Meta añade valores sin avisar y un enum convierte un tipo
-- desconocido en un INSERT fallido que tumba el lote entero.
create domain canal_meta as text
  check (value in ('messenger', 'instagram'));

create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- AÑADIDO (diferencia 5). El slug es el subdominio: su formato es una
  -- restricción de enrutado, no de presentación.
  constraint organizations_slug_formato
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),

  constraint organizations_slug_reservado
    check (slug not in (
      'www','admin','app','api','hooks','webhooks','mail','smtp','send','status',
      'docs','static','assets','cdn','blog','soporte','support','ayuda','help',
      'dev','staging','preview','test','demo','kavea'
    ))
);

create trigger organizations_touch before update on public.organizations
  for each row execute function public.tocar_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  rol             text not null check (rol in ('owner', 'admin', 'agente')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx
  on public.organization_members (user_id);
```

`organization_members_user_idx` no es opcional: `es_miembro()` filtra por `user_id` y se
ejecuta en cada consulta de cada tabla. Sin ese índice, todo el modelo de RLS hace escaneo
secuencial.

`slug` es `text`, no `citext`, siguiendo el §7.1. El check de formato ya fuerza minúsculas, y
eso elimina la dependencia de una extensión que en Supabase vive en `extensions` y no
resolvería bajo `search_path = ''` (diferencia 1).

**Criterio de aceptación.** `insert … values ('x','Admin')` falla por formato; `'admin'` falla
por reservados; `'boosty-2'` entra. `rol = 'jefe'` falla. Un `update` sobre `organizations`
mueve `updated_at`.

---

### T6 — Migración 0002: `es_miembro`, `es_owner` y RLS de identidad

La forma del `02` §7.7, con `search_path` cerrado por la diferencia 1. El cuerpo es el del
§7.7 sin cambios: ya cualifica `public.organization_members` y `auth.uid()`.

```sql
-- 0002_rls_identidad.sql

create or replace function public.es_miembro(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.es_miembro(uuid) from anon;

-- AÑADIDO (diferencia 4). La escritura sobre organization_members no puede
-- regirse por es_miembro: sería auto-ascenso.
create or replace function public.es_owner(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.rol = 'owner'
  );
$$;

revoke execute on function public.es_owner(uuid) from anon;

alter table public.organizations        enable row level security;
alter table public.organizations        force  row level security;
alter table public.organization_members enable row level security;
alter table public.organization_members force  row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.es_miembro(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using      (public.es_owner(id))
  with check (public.es_owner(id));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.es_miembro(organization_id));

create policy organization_members_write on public.organization_members
  for all to authenticated
  using      (public.es_owner(organization_id))
  with check (public.es_owner(organization_id));
```

**Recursión.** La política de `organization_members` llama a una función que lee
`organization_members`. No recursa porque `security definer` salta RLS sobre las tablas que
toca. Una política escrita como `exists (select 1 from organization_members …)` directamente
sobre la propia tabla sí recursa y Postgres la rechaza en ejecución. La indirección por
función no es estética.

**`execute` para `authenticated`.** El §7.7 revoca solo de `anon` y se respeta. Lo que
protege la función es la comprobación de identidad de su cuerpo: devuelve `true` únicamente
para organizaciones donde el llamante es miembro, así que llamarla directamente no revela
nada que la política no revele ya. Mantenerlo así evita además el modo de fallo en el que una
política no puede invocar una función por falta de privilegio.

**Coste por fila, y cómo se decide.** `es_miembro(organization_id)` recibe la columna de la
fila, así que es una llamada correlacionada: se evalúa una vez por fila candidata, y
`security definer` impide que Postgres la inline. El §7.7 ya prescribe la mitigación —índice
sobre `organization_id` en cada tabla— que reduce el conjunto candidato a las filas del tenant
antes de que la función corra sobre cada una. Si eso basta se mide en T23 con 200.000
mensajes; la salida documentada, si el plan muestra que la función domina, está en P4. No se
adopta sin la medición, y no se descarta sin ella.

**Criterio de aceptación.** Prueba T7 de la batería (§T23): un `agente` de A que intenta
`update organization_members set rol='owner' where user_id = auth.uid()` afecta cero filas.
`has_function_privilege('anon','public.es_miembro(uuid)','execute')` es `false`.

---

### T7 — Migración 0003: `meta_connections` y `meta_asset_routes`

Esta migración crea la frontera del plano de escritura. No es configuración: es el control
que impide que un evento de un cliente acabe escrito en el tenant de otro.

```sql
-- 0003_conexiones_meta.sql

create table public.meta_connections (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  page_id                 text not null,
  page_name               text,
  ig_business_account_id  text,          -- null si el cliente todavía no vinculó IG
  ig_username             text,

  business_id       text,
  config_id         text,
  graph_api_version text not null default 'v26.0',

  subscribed_fields_messenger  text[] not null default '{}',
  subscribed_fields_instagram  text[] not null default '{}',
  last_subscription_check_at   timestamptz,
  subscription_ok              boolean not null default false,

  messaging_feature_status          jsonb,
  default_application_confirmed_at  timestamptz,

  token_last_verified_at  timestamptz,
  token_invalid_since     timestamptz,

  estado      text not null default 'connected'
                check (estado in ('connected', 'degraded', 'disconnected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint meta_connections_page_unica unique (page_id),
  -- AÑADIDO: destino de las claves compuestas de channels y meta_asset_routes.
  constraint meta_connections_org_id_uniq unique (organization_id, id)
);

create unique index meta_connections_ig_unica
  on public.meta_connections (ig_business_account_id)
  where ig_business_account_id is not null;

create index meta_connections_org_idx on public.meta_connections (organization_id);

create trigger meta_connections_touch before update on public.meta_connections
  for each row execute function public.tocar_updated_at();

-- Aplana page_id e ig_business_account_id en una sola columna, para que resolver
-- entry[].id sea un único acierto de índice antes de tocar nada más.
create table public.meta_asset_routes (
  asset_id            text primary key,   -- tal como llega en entry[].id
  tipo                text not null check (tipo in ('page', 'ig_business_account')),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id  uuid not null,
  created_at          timestamptz not null default now(),

  -- AÑADIDO: la ruta y la conexión a la que apunta pertenecen a la misma
  -- organización por construcción, no por convención del código de alta.
  constraint meta_asset_routes_conexion_mismo_tenant
    foreign key (organization_id, meta_connection_id)
    references public.meta_connections (organization_id, id) on delete cascade
);

create index meta_asset_routes_conexion_idx
  on public.meta_asset_routes (organization_id, meta_connection_id);

alter table public.meta_connections  enable row level security;
alter table public.meta_connections  force  row level security;
alter table public.meta_asset_routes enable row level security;
alter table public.meta_asset_routes force  row level security;

create policy meta_connections_select on public.meta_connections
  for select to authenticated
  using (public.es_miembro(organization_id));

create policy meta_asset_routes_select on public.meta_asset_routes
  for select to authenticated
  using (public.es_miembro(organization_id));
```

**`asset_id` es la clave primaria, no un índice cualquiera.** Eso obliga a que la resolución
sea una función: un `entry[].id` mapea a exactamente una organización o a ninguna. Si mapeara
a dos, se escribirían mensajes de un cliente en el tenant de otro. Un `entry[].id` que no
resuelve se registra y se descarta; nunca se adivina.

`token_invalid_since` está en `public` a propósito (`02` §7.8): la UI necesita leer el estado
para mostrar el banner de reconexión, y no necesita leer el token.

Sin políticas de escritura para `authenticated`. Conectar una Página es el flujo de OAuth del
bloque 5, que corre en un route handler con rol de servicio tras validar la sesión.

**Criterio de aceptación.** Dos `insert` en `meta_asset_routes` con el mismo `asset_id` y
distinta organización: el segundo falla por clave primaria. Un `insert` cuyo
`meta_connection_id` pertenece a otra organización falla con `23503`.

---

### T8 — Migración 0004: `private.meta_credentials`

`02` §7.8. Los tokens no viven en `public`, ni cifrados. Esto responde y cierra la pregunta
que la versión anterior de este plan dejaba abierta sobre el mecanismo de cifrado: **ya estaba
decidido**.

```sql
-- 0004_credenciales.sql

create table private.meta_credentials (
  meta_connection_id  uuid primary key
                        references public.meta_connections(id) on delete cascade,

  page_access_token_cipher  bytea not null,   -- AES-256-GCM
  page_access_token_nonce   bytea not null,
  page_access_token_kid     text  not null,   -- identifica la clave usada, para rotar sin big bang

  bisu_token_cipher  bytea,
  bisu_token_nonce   bytea,
  bisu_token_kid     text,

  cifrado_en   timestamptz not null default now(),
  rotado_en    timestamptz
);

-- Defensa en profundidad: el esquema no está publicado por la API, pero una tabla
-- con RLS activo y cero políticas no la ve nadie salvo roles con BYPASSRLS.
alter table private.meta_credentials enable row level security;
alter table private.meta_credentials force  row level security;
```

Tres cosas fuera del SQL que son parte del entregable:

1. **Retirar `private` de la lista de esquemas expuestos** en la configuración de la API del
   proyecto, y verificarlo. Si `private` aparece ahí, todo lo demás sobra.
2. **La clave de cifrado vive en el almacén de secretos del Worker**, no en la base. Un
   volcado de la base de datos no contiene la clave. AES-256-GCM con `crypto.subtle`.
3. **`kid` desde el primer día.** Sin identificador de clave, rotar significa descifrar y
   volver a cifrar todo a la vez, con ventana de indisponibilidad. Con `kid`, la rotación es
   perezosa.

En fase 0 la tabla se crea vacía: no hay tokens hasta que exista el flujo de OAuth. Lo que se
prueba ahora es que **no se puede leer**, ni por PostgREST ni con una sesión.

El §7.8 marca Supabase Vault como *sin confirmar — verificar la API vigente*, porque el
mecanismo de cifrado transparente de Supabase ha cambiado más de una vez. La decisión del `02`
es cifrar en la aplicación; esta fase la ejecuta y no reabre el debate.

Regla operativa que se establece aquí: **el token nunca aparece en un log.** Los ejemplos de
Meta pasan el token en la query string. El cliente HTTP no registra URLs completas, y el
manejador de errores recorta cualquier cadena que contenga `access_token=` antes de
escribirla. Se prueba en T22.

**Criterio de aceptación.** `GET /rest/v1/meta_credentials` con la clave publicable devuelve
error de esquema inexistente. `select * from private.meta_credentials` con `set local role
authenticated` falla por permisos de esquema. La lista de esquemas expuestos del proyecto no
contiene `private`, comprobado en el panel.

---

### T9 — Migración 0005: `channels`, y la evaluación de las claves compuestas

```sql
-- 0005_canales.sql

create table public.channels (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id  uuid not null,
  canal               canal_meta not null,
  nombre              text not null,

  -- Kill-switch por canal y por tenant. Meta puede restringir la app sin aviso.
  activo          boolean not null default true,
  pausado_motivo  text,
  pausado_desde   timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint channels_unico unique (meta_connection_id, canal),
  constraint channels_org_id_uniq unique (organization_id, id),
  constraint channels_conexion_mismo_tenant
    foreign key (organization_id, meta_connection_id)
    references public.meta_connections (organization_id, id) on delete cascade
);

create index channels_org_idx on public.channels (organization_id, canal);

create trigger channels_touch before update on public.channels
  for each row execute function public.tocar_updated_at();

alter table public.channels enable row level security;
alter table public.channels force  row level security;

create policy channels_select on public.channels
  for select to authenticated
  using (public.es_miembro(organization_id));
```

El kill-switch lo opera el panel interno (`06` §6) con rol de servicio, no el cliente. Por eso
no hay política de `update` para `authenticated`: un cliente no se despausa a sí mismo un
canal que Boosty pausó por una restricción de Meta.

#### La evaluación de las claves foráneas compuestas

**Confirmado, con dos matices que cambian su prioridad.**

**El fallo existe.** Con las claves simples del §7 —`messages.conversation_id references
conversations(id)`— nada impide una fila con `organization_id = A` cuyo `conversation_id`
apunta a una conversación de B. Las comprobaciones de integridad referencial de Postgres
**saltan RLS**: el chequeo es de sistema, no bajo la política del que inserta. Y RLS no lo
detecta después, porque cada fila cumple su propia política por separado: la de `messages`
dice A y se muestra a los miembros de A; la de `conversations` dice B y se muestra a los de B.

El daño, en orden de gravedad:

1. **Break-glass.** La política de `messages` filtra por `messages.organization_id`. Un grant
   de staff sobre A mostraría un mensaje cuyo contenido real pertenece a una conversación de
   B. Es el único caso donde el fallo produce fuga de contenido real, y basta para justificar
   el arreglo.
2. **Hilos rotos.** Un miembro de A ve un mensaje cuyo `join` a `conversations` no devuelve
   nada. La bandeja muestra un mensaje huérfano sin explicación.
3. **Cascadas incoherentes.** Borrar la organización B borra en cascada conversaciones que
   sostienen mensajes de A.

**Primer matiz: no es la frontera principal**, y decir lo contrario sería repetir el error que
el `06` §0 acaba de corregir. El §7.7 punto 3 es explícito: lo que impide escribir en el
tenant equivocado es la clave primaria de `meta_asset_routes`, porque el normalizador escribe
con rol de servicio y no pasa por RLS. Una clave compuesta no sustituye a eso: protege del
caso en que el normalizador resuelve bien el tenant y luego cose mal las filas dentro de él —
un fallo de código, no de enrutado. Es defensa en profundidad de segundo orden.

**Segundo matiz: no es gratis.** Cada padre necesita `unique (organization_id, id)`, que es un
índice más por tabla; cada hijo necesita índice sobre `(organization_id, padre_id)` para que
la cascada no haga escaneo secuencial; y `on delete set null` sobre clave compuesta obliga a
la forma con lista de columnas de Postgres 15, porque anular las dos violaría el `not null` de
`organization_id`.

**Decisión: se incorpora.** El coste es de índices y el beneficio incluye cerrar una fuga de
contenido real. Se aplica a: `meta_asset_routes` → `meta_connections`, `channels` →
`meta_connections`, `contact_identities` → `contacts`, `conversations` → `contacts` y →
`channels`, `messages` → `conversations`, `message_events` → `conversations`, `media` →
`messages`.

Donde no se aplica: `conversations.asignado_a` referencia `auth.users`, que no tiene
`organization_id`. Se cierra con un trigger o en la capa de servicio cuando exista la bandeja,
y queda anotado como hueco conocido.

**Criterio de aceptación.** Pruebas T4a a T4f (§T23): con **rol de servicio** —que es quien
escribe la ingesta y quien podría cometer el fallo—, cada `insert` que cruza tenants por clave
foránea falla con `23503`. Que la prueba use rol de servicio y no una sesión es el punto: con
sesión el `with check` ya lo bloquearía y la prueba no demostraría nada.

---

### T10 — Migración 0006: `contacts` y `contact_identities`

```sql
-- 0006_contactos.sql

create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nombre           text,
  username         text,
  profile_pic_url  text,

  -- El error 230 (consentimiento de perfil no otorgado) es normal y se ignora.
  perfil_consentido  boolean not null default false,
  perfil_leido_en    timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint contacts_org_id_uniq unique (organization_id, id)
);

create index contacts_org_idx on public.contacts (organization_id);

create trigger contacts_touch before update on public.contacts
  for each row execute function public.tocar_updated_at();

create table public.contact_identities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contact_id       uuid not null,
  canal            canal_meta not null,

  -- PSID en messenger, IGSID en instagram. Espacios distintos, no intercambiables,
  -- no portables entre apps.
  scoped_id  text not null,

  -- Columna SEPARADA. Las solicitudes de borrado de datos de Meta llegan con un
  -- App-Scoped ID que no es ninguno de los dos.
  app_scoped_id  text,

  created_at  timestamptz not null default now(),

  constraint contact_identities_unica unique (organization_id, canal, scoped_id),
  constraint contact_identities_contacto_mismo_tenant
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade
);

-- Diferencia 6: se antepone organization_id al índice del §7.3.
create index contact_identities_contact_idx
  on public.contact_identities (organization_id, contact_id);

-- Este NO lleva organization_id, y es deliberado: las solicitudes de borrado de
-- Meta llegan con un App-Scoped ID sin contexto de organización.
create index contact_identities_app_scoped_idx
  on public.contact_identities (app_scoped_id)
  where app_scoped_id is not null;

alter table public.contacts           enable row level security;
alter table public.contacts           force  row level security;
alter table public.contact_identities enable row level security;
alter table public.contact_identities force  row level security;

create policy contacts_select on public.contacts
  for select to authenticated
  using (public.es_miembro(organization_id));

-- Un agente edita el nombre de un contacto desde la ficha.
create policy contacts_update on public.contacts
  for update to authenticated
  using      (public.es_miembro(organization_id))
  with check (public.es_miembro(organization_id));

create policy contact_identities_select on public.contact_identities
  for select to authenticated
  using (public.es_miembro(organization_id));
```

**Criterio de aceptación.** Con rol de servicio, un `insert` en `contact_identities` con
`organization_id = A` y `contact_id` de B falla con `23503`. Con sesión de miembro de A,
`update contacts set nombre='x' where organization_id = B` afecta cero filas.

---

### T11 — Migración 0007: `conversations`

```sql
-- 0007_conversaciones.sql

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  channel_id       uuid not null,
  canal            canal_meta not null,
  contact_id       uuid not null,

  status  text not null default 'open'
            check (status in ('open', 'pending', 'closed')),

  -- ÚNICA base del cálculo de la ventana de 24 h / 7 días.
  -- Un echo saliente NO la toca. Jamás un flag global.
  last_incoming_at  timestamptz,
  last_message_at   timestamptz,

  -- Conversation Routing. Sin esto, Kavea intenta enviar cuando no es dueña del hilo.
  thread_owner_app_id       text,
  en_standby                boolean not null default false,
  thread_control_updated_at timestamptz,

  asignado_a  uuid references auth.users(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint conversations_org_id_uniq unique (organization_id, id),
  constraint conversations_contacto_mismo_tenant
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id) on delete cascade,
  constraint conversations_canal_mismo_tenant
    foreign key (organization_id, channel_id)
    references public.channels (organization_id, id) on delete cascade
);

-- Segunda capa de idempotencia: impide que tres fotos seguidas creen tres conversaciones.
create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where status = 'open';

create index conversations_bandeja_idx
  on public.conversations (organization_id, channel_id, status, last_message_at desc);

create index conversations_contacto_idx
  on public.conversations (organization_id, contact_id);

create index conversations_asignado_idx
  on public.conversations (asignado_a) where asignado_a is not null;

create trigger conversations_touch before update on public.conversations
  for each row execute function public.tocar_updated_at();

alter table public.conversations enable row level security;
alter table public.conversations force  row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.es_miembro(organization_id));

-- La bandeja cambia estado y asignación. No crea ni borra hilos: eso lo hace
-- el normalizador con rol de servicio.
create policy conversations_update on public.conversations
  for update to authenticated
  using      (public.es_miembro(organization_id))
  with check (public.es_miembro(organization_id));
```

Hueco conocido y aceptado: `asignado_a` no comprueba que el usuario sea miembro de la
organización. Una clave foránea no puede expresarlo. No filtra datos —RLS sigue filtrando—
pero produce asignaciones rotas. Se cierra con un trigger cuando exista la bandeja.

**Criterio de aceptación.** Dos `insert` concurrentes con el mismo `(organization_id, canal,
contact_id)` y `status='open'` producen una fila. Con rol de servicio, un `insert` con
`channel_id` de otro tenant falla con `23503`.

---

### T12 — Migración 0008: `messages`

```sql
-- 0008_mensajes.sql

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid not null,
  canal            canal_meta not null,

  mid        text not null,
  direccion  text not null check (direccion in ('inbound', 'outbound')),

  is_echo  boolean not null default false,
  app_id   text,     -- distingue lo enviado por Kavea de lo enviado por el cliente por fuera
  metadata text,     -- el `metadata` pasado en el Send API, que vuelve en el echo

  send_api_message_id  text,   -- correlaciona el envío con su echo

  sender_scoped_id     text,
  recipient_scoped_id  text,

  texto               text,
  reply_to_mid        text,
  reply_to_story      jsonb,   -- solo Instagram
  quick_reply_payload text,
  referral            jsonb,   -- atribución a pauta: ad_id, source, ref, type

  llego_por_standby  boolean not null default false,
  is_unsupported     boolean not null default false,
  deleted_at         timestamptz,   -- unsend / is_deleted. UPDATE, nunca INSERT.

  meta_timestamp_ms  bigint not null,
  meta_timestamp     timestamptz
                       generated always as (to_timestamp(meta_timestamp_ms / 1000.0)) stored,

  raw         jsonb not null,
  created_at  timestamptz not null default now(),

  -- LA restricción de idempotencia. Acotada por tenant porque Meta no documenta
  -- el ámbito de unicidad de mid.
  constraint messages_idempotencia unique (organization_id, canal, mid),
  constraint messages_org_id_uniq unique (organization_id, id),
  constraint messages_conversacion_mismo_tenant
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade
);

-- Diferencia 6: un índice sirve al filtro de la política, a la cascada de la
-- clave compuesta y a la consulta del hilo del §7.5.
create index messages_hilo_idx
  on public.messages (organization_id, conversation_id, meta_timestamp desc);

create index messages_send_api_idx
  on public.messages (organization_id, send_api_message_id)
  where send_api_message_id is not null;

create index messages_metadata_idx
  on public.messages (organization_id, metadata)
  where metadata is not null;

alter table public.messages enable row level security;
alter table public.messages force  row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (public.es_miembro(organization_id));
```

Cuatro notas:

- **Sin política de escritura para `authenticated`.** Enviar un mensaje pasa por una ruta de
  servidor que calcula la ventana sobre `last_incoming_at`, elige `messaging_type` y `tag`
  según la regla del `03`, llama al Send API y **después** escribe la fila con rol de
  servicio. Si el cliente pudiera insertar directamente, se saltaría toda esa lógica y la
  fila quedaría sin correlato en Meta.
- `meta_timestamp` es columna generada a partir del entero en milisegundos. El entero se
  guarda verbatim: así el error de segundos contra milisegundos no se puede cometer en
  silencio.
- **No se particiona.** El `06` §4 lo razona: una tabla particionada por rango exige que la
  clave de partición esté en todo índice único, lo que rompería `messages_idempotencia`; y
  una tabla de deduplicación con caducidad tampoco sirve, porque los borrados y ediciones
  llegan con el mismo `mid` meses después. Si el volumen lo exige, la salida es archivar
  conversaciones cerradas a una tabla fría.
- Los borrados y ediciones son `update` sobre la fila existente, jamás `insert`.

**Criterio de aceptación.** `insert … on conflict on constraint messages_idempotencia do
nothing` ejecutado tres veces con el mismo payload produce una fila; con distinto
`organization_id`, dos. `meta_timestamp_ms = 1754092800000` produce `meta_timestamp` en 2025,
no en 1970: la prueba detecta la confusión de unidades.

---

### T13 — Migración 0009: `message_events`

Eventos sin `mid` propio. La clave la deriva la base de datos, no el código de ingesta.

```sql
-- 0009_eventos_mensaje.sql

create table public.message_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid,
  canal            canal_meta not null,

  -- Sin CHECK cerrado a propósito: Meta añade sub-eventos sin aviso.
  tipo  text not null,

  target_mid        text,   -- referencia el mensaje REACCIONADO, no la reacción
  actor_scoped_id   text,
  accion            text,
  emoji             text,
  reaction          text,   -- valor crudo de Meta, sin validar

  read_watermark_ms  bigint,   -- Messenger: "todo lo anterior leído"
  read_mid           text,     -- Instagram messaging_seen: un mid concreto
  delivery_mids      text[],

  -- NULL cuando el evento llega por standby: standby no entrega el payload.
  postback_payload  text,
  postback_title    text,

  meta_timestamp_ms  bigint not null,
  meta_timestamp     timestamptz
                       generated always as (to_timestamp(meta_timestamp_ms / 1000.0)) stored,

  clave_dedupe text generated always as (
    tipo
    || '|' || coalesce(target_mid, read_mid, '')
    || '|' || coalesce(actor_scoped_id, '')
    || '|' || coalesce(accion, '')
    || '|' || coalesce(read_watermark_ms, meta_timestamp_ms)::text
  ) stored,

  raw         jsonb not null,
  created_at  timestamptz not null default now(),

  constraint message_events_dedupe unique (organization_id, canal, tipo, clave_dedupe),
  constraint message_events_conversacion_mismo_tenant
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade
);

create index message_events_conv_idx
  on public.message_events (organization_id, conversation_id, meta_timestamp desc);

alter table public.message_events enable row level security;
alter table public.message_events force  row level security;

create policy message_events_select on public.message_events
  for select to authenticated
  using (public.es_miembro(organization_id));
```

`tipo` sin `check` cerrado es deliberado y sigue la regla del §7: un vocabulario de Meta
restringido convierte un sub-evento nuevo en un `INSERT` fallido que tumba el lote entero.
`reaction` guarda el valor crudo por la misma razón.

`conversation_id` es nullable: un evento puede llegar antes de que exista la conversación. Una
clave foránea compuesta con una columna nula no se comprueba, que es el comportamiento
correcto aquí.

**Criterio de aceptación.** Dos `insert` de la misma reacción producen una fila. Un `insert`
con `tipo = 'un_evento_que_meta_inventa_mañana'` entra sin error.

---

### T14 — Migración 0010: `media`

```sql
-- 0010_media.sql

create table public.media (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  message_id       uuid not null,

  origen  text not null check (origen in ('meta_cdn', 'kavea_r2')),

  -- origen = 'meta_cdn': SOLO la URL. Nunca el binario. Nunca R2.
  cdn_url             text,
  cdn_host            text,   -- para auditar la allowlist
  cdn_url_recibida_en timestamptz,

  -- origen = 'kavea_r2': media SALIENTE que Kavea genera o que el agente envía.
  r2_bucket     text,
  r2_key        text,
  content_type  text,
  bytes         bigint,

  -- Valor de attachment.type TAL COMO LLEGA. Tipo desconocido → 'fallback' + payload crudo.
  tipo     text not null,
  payload  jsonb not null,

  created_at  timestamptz not null default now(),

  constraint media_origen_coherente check (
    (origen = 'meta_cdn'  and cdn_url is not null and r2_key  is null)
    or
    (origen = 'kavea_r2'  and r2_key  is not null and cdn_url is null)
  ),
  constraint media_mensaje_mismo_tenant
    foreign key (organization_id, message_id)
    references public.messages (organization_id, id) on delete cascade
);

create index media_message_idx on public.media (organization_id, message_id);

alter table public.media enable row level security;
alter table public.media force  row level security;

create policy media_select on public.media
  for select to authenticated
  using (public.es_miembro(organization_id));
```

El `check` es lo que impide que un `INSERT` distraído cachee media entrante en R2. Meta rechaza
App Reviews por eso; es la causa documentada del rechazo a usuarios de Chatwoot. La separación
no se deja a la disciplina del equipo.

**Criterio de aceptación.** `origen='meta_cdn'` con `r2_key` no nulo falla. `origen='kavea_r2'`
con `cdn_url` no nulo falla. `tipo='sticker_de_2027'` entra.

---

### T15 — Migración 0011: `webhook_events`

**Cola y bitácora a la vez.** Esta tabla es las dos cosas: el receptor inserta aquí, el
normalizador reclama con `for update skip locked`, y la fila se conserva después como registro
crudo de qué llegó y a qué tenant se enrutó. La forma definitiva la fija la fase 2, que es su
consumidor; aquí solo se crea con RLS activo y cero políticas.

El `02` §5.2 la definía como bitácora pura porque la cola era Cloudflare Queues. Esa decisión
está anulada: ver `06` §1.1.

```sql
-- 0011_bitacora_webhooks.sql

create table public.webhook_events (
  id             bigserial primary key,
  recibido_en    timestamptz not null default now(),
  firma_ok       boolean not null,
  object         text,      -- 'page' o 'instagram'. Se acepta cualquiera de los dos.
  cuerpo         jsonb not null,
  cuerpo_bytes   integer not null,
  entry_ids      text[],    -- todos los entry[].id del lote, para trazar el enrutado
  procesado_en   timestamptz,
  intentos       smallint not null default 0,
  error          text
);

create index webhook_events_pendientes_idx
  on public.webhook_events (recibido_en)
  where procesado_en is null;

create index webhook_events_entry_idx
  on public.webhook_events using gin (entry_ids);

-- RLS activo y CERO políticas: deniega todo. Solo la tocan roles con BYPASSRLS.
alter table public.webhook_events enable row level security;
alter table public.webhook_events force  row level security;

revoke all on public.webhook_events from anon, authenticated;
revoke all on sequence public.webhook_events_id_seq from anon, authenticated;
```

**No lleva `organization_id`, y es una decisión, no un olvido.** Un lote puede traer hasta 1000
updates de assets distintos y Meta no garantiza que sean todos del mismo tenant. La fila cruda
es **anterior** al enrutado, así que es potencialmente multi-tenant: no puede quedar bajo RLS
de organización y no se expone a la API.

`object` se acepta como `'page'` o `'instagram'` sin `check`: dos páginas oficiales de Meta se
contradicen sobre cuál llega en la vía Facebook Login, y el `03` prohíbe afirmar cuál es. El
handler acepta ambos y enruta por `entry[].id`.

`entry_ids` con índice GIN es lo que permite responder "¿qué lotes tocaron esta Página?"
durante una investigación de cruce de datos. Es la herramienta forense de la frontera de
escritura.

**Criterio de aceptación.** Con la clave publicable y una sesión válida, `GET
/rest/v1/webhook_events` devuelve error de permisos o lista vacía. Con clave de servicio,
devuelve filas.

---

### T16 — Migración 0012: `staff`, `access_grants` y break-glass

`06` §6. Es la parte del modelo que no está en el `02`.

```sql
-- 0012_staff_breakglass.sql

create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol     text not null default 'soporte'
          check (rol in ('soporte','ingenieria','direccion'))
);

create table public.access_grants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  motivo          text not null,
  expira_en       timestamptz not null,
  created_at      timestamptz not null default now(),

  -- AÑADIDOS (diferencia 7).
  constraint access_grants_motivo_sustantivo check (length(btrim(motivo)) >= 20),
  constraint access_grants_vigencia          check (expira_en > created_at),
  constraint access_grants_techo             check (expira_en <= created_at + interval '72 hours')
);

create index access_grants_activos_idx
  on public.access_grants (user_id, organization_id, expira_en);

-- La cascada de organizations necesita un índice que empiece por organization_id.
create index access_grants_org_idx
  on public.access_grants (organization_id, created_at desc);

create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;

revoke execute on function public.es_staff() from anon;

-- Sin argumentos a propósito: se evalúa una vez por consulta como subplan hasheado,
-- no una vez por fila. Sobre `messages` esa diferencia no es cosmética.
create or replace function public.org_ids_con_grant()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.organization_id
    from public.access_grants g
   where g.user_id = (select auth.uid())
     and g.expira_en > now()
     and exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;

revoke execute on function public.org_ids_con_grant() from anon;

alter table public.staff         enable row level security;
alter table public.staff         force  row level security;
alter table public.access_grants enable row level security;
alter table public.access_grants force  row level security;

create policy staff_ve_su_fila on public.staff
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy access_grants_propios on public.access_grants
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Transparencia: los miembros de una organización ven quién abrió un grant sobre
-- sus datos y con qué motivo. Es lo que sostiene la promesa de privacidad.
create policy access_grants_transparencia on public.access_grants
  for select to authenticated
  using (public.es_miembro(organization_id));

-- El staff ve metadatos de todas las organizaciones. Metadatos, no contenido.
create policy organizations_staff_select on public.organizations
  for select to authenticated
  using ((select public.es_staff()));

-- Break-glass sobre el contenido. Convive con messages_select:
-- las políticas permisivas se combinan con OR.
create policy messages_staff_breakglass on public.messages
  for select to authenticated
  using (organization_id in (select public.org_ids_con_grant()));
```

**Dos cambios sobre la forma del `06` §6, ambos justificados por el §7.7.**

1. El `06` §6 escribe la política como `exists (select 1 from access_grants g where …
   g.organization_id = messages.organization_id …)`. Esa forma referencia la columna de la
   fila, así que es una subconsulta correlacionada evaluada **una vez por fila**. Sobre
   `messages`, que crece sin techo, es exactamente el coste que el punto 1 del §7.7 existe
   para evitar. La forma `organization_id in (select f())` con función sin argumentos se
   evalúa una vez por consulta.
2. La forma del `06` referencia `access_grants` desde dentro de la política de `messages`, y
   `access_grants` tiene su propia RLS. Eso hace que el resultado dependa de si el staff pasa
   además la política de `access_grants`. La indirección por función `security definer` corta
   esa dependencia.

**La comprobación de staff va dentro de la función.** Una fila de grant para un usuario que no
es staff no abre nada. Sin ese `exists`, bastaría con crear un grant para cualquier usuario.

**No hay política de `insert` sobre `access_grants`.** El staff no se concede su propio grant:
lo crea el panel desde el servidor, con rol de servicio, tras comprobar `staff` y registrar el
motivo. Y queda en la tabla para siempre.

**Lo que el staff no obtiene en esta fase:** lectura de `conversations`, `contacts`,
`channels`, `messages` sin grant, `message_events` ni `media`. El panel de métricas agregadas
del `06` §6 es una superficie posterior y se construirá con funciones `security definer` que
devuelvan recuentos, no con políticas de lectura. Es P5.

**Criterio de aceptación.** Prueba T8: staff sin grant ve cero mensajes de A; con grant vigente
ve los de A y ninguno de B; con grant caducado vuelve a cero. `insert into access_grants` desde
sesión de staff falla. `motivo = 'soporte'` falla por longitud. `expira_en = now() + interval
'7 days'` falla por techo.

---

### T17 — Migración 0013: semilla de la organización `boosty`

```sql
-- 0013_semilla_boosty.sql

insert into public.organizations (id, nombre, slug)
values ('00000000-0000-4000-8000-000000000001', 'Boosty Digital', 'boosty')
on conflict (slug) do nothing;
```

UUID fijo para que pruebas y scripts la referencien sin buscarla. Meter datos en una migración
de esquema es discutible en general; aquí se justifica porque es una fila de arranque, es la
misma en los tres entornos, y así se reproduce con `db reset` sin un paso manual que alguien
olvide.

El **usuario** no va en una migración. `auth.users` es propiedad de Supabase Auth y una
inserción directa exige coherencia con `auth.identities` y con el formato de
`encrypted_password`. Se crea con la API de administración desde `scripts/semilla.ts` (T25).

Comprobar `select rolbypassrls from pg_roles where rolname = 'postgres'` antes de aplicar: con
`force row level security` (diferencia 2), si el rol que ejecuta migraciones no salta RLS este
`insert` falla contra la política de `organizations`. La salida es envolverlo en `set local
role supabase_admin` o mover la semilla al script con clave de servicio. Es R8.

**Criterio de aceptación.** Tras `supabase db reset`, `select slug from organizations` devuelve
exactamente `boosty`. Aplicar dos veces no duplica ni falla.

---

### T18 — Orden de aplicación y estrategia de reversión

**Orden.** Lo imponen dependencias reales:

```
0001 base: private, canal_meta, organizations, organization_members
  └─ 0002 es_miembro / es_owner + RLS de identidad   (SQL con cuerpo literal: la tabla debe existir)
       ├─ 0003 meta_connections + meta_asset_routes
       │    ├─ 0004 private.meta_credentials          (FK a meta_connections)
       │    └─ 0005 channels                          (FK compuesta a meta_connections)
       ├─ 0006 contacts + contact_identities
       │    └─ 0007 conversations                     (FK compuestas a contacts y channels)
       │         ├─ 0008 messages                     (FK compuesta a conversations)
       │         │    └─ 0010 media                   (FK compuesta a messages)
       │         └─ 0009 message_events               (FK compuesta a conversations)
       └─ 0011 webhook_events                         (sin dependencias)
            └─ 0012 staff, access_grants, break-glass (política sobre messages)
                 └─ 0013 semilla
```

**RLS se activa en la misma migración que crea la tabla, nunca después.** Con RLS al final,
entre desplegar la migración que crea `messages` y la que la protege existe una ventana en la
que la tabla está en `public` y expuesta. Esto importa en Supabase porque `public` está
expuesto por la Data API y los privilegios por defecto conceden acceso a `anon` y
`authenticated` en tablas nuevas. Comprobar la configuración de la Data API del proyecto y, en
cualquier caso, hacer los `grant`/`revoke` explícitos: no dar por hecho ni lo uno ni lo
contrario.

Cuatro dependencias duras: el dominio `canal_meta` antes de cualquier tabla que lo use;
`organization_members` antes de las funciones que la leen, porque las funciones SQL con cuerpo
literal se validan al crearse, no al llamarse; `meta_connections` antes de `channels` y de las
credenciales; `messages` antes de la política de break-glass que la referencia.

**Nombres de fichero.** El CLI genera `<timestamp>_<nombre>.sql`. Los números son lógicos. El
timestamp debe ser monótono creciente en la rama por defecto: dos personas creando migraciones
en ramas paralelas producen timestamps entrelazados que aplican en orden distinto al de merge.
En fase 0 hay un solo autor; a partir del bloque 1, renombrar antes de mezclar.

**Reversión.** El CLI de Supabase no tiene `down`. Tres capas:

1. **Antes de producción.** `supabase db reset` en local y preview reconstruye desde cero. La
   reversión es gratis. Toda la fase debe probarse así antes de tocar producción.
2. **En producción, cambios aditivos.** Migración compensatoria hacia adelante: `drop policy`,
   `drop index`, `drop table` si está vacía. Se escribe **a la vez** que la original y se
   guarda en `supabase/migrations/rollback/NNNN_revertir.sql`, fuera del directorio que aplica
   el CLI. No se aplica automáticamente; existe para no tener que escribirla bajo presión.
3. **En producción, cambios destructivos.** No los hay en fase 0. La regla para las
   siguientes: expandir y contraer. Añadir la columna nueva, migrar datos, desplegar el código
   que la usa, y solo entonces, en una migración posterior y separada, eliminar la vieja. Un
   `drop column` no se revierte con una migración: los datos ya no están. Ahí la única salida
   es la copia de seguridad, y por eso T4 exige conocer el nivel de PITR antes de la primera
   migración con datos reales.

**Un aviso propio de este esquema.** `canal_meta` es un dominio y hoy admite solo `messenger` e
`instagram`. WhatsApp y correo entran después. Ampliarlo es `alter domain … drop constraint` +
`add constraint`, que revalida todas las columnas del tipo y toma un bloqueo. Sobre `messages`
con millones de filas eso es una ventana de indisponibilidad. La salida —añadir la restricción
como `not valid` y validar después— se documenta ahora para que quien amplíe el dominio no lo
descubra en producción.

**Criterio de aceptación.** `supabase db reset` aplica las trece migraciones en orden y termina
en cero. Cada migración tiene su fichero en `rollback/`, y aplicarlos en orden inverso sobre
una base recién migrada deja el esquema vacío sin errores.

---

### T19 — Auth: usuarios, sesión, cookies y roles

**Modelo.** Un `auth.users` global. Un usuario puede pertenecer a varias organizaciones vía
`organization_members`; el rol vive en la fila de membresía, no en el usuario. Un miembro del
staff de Boosty es un usuario normal con una fila adicional en `staff`.

**Roles** (`02` §7.1): `owner` — todo dentro de su organización, incluida la gestión de
membresías; `admin` — todo salvo membresías; `agente` — bandeja y contactos. En fase 0 solo se
distinguen a efectos de RLS.

**Acceso.** Correo y contraseña con confirmación. Sin OAuth de terceros en v1: cada proveedor
añade superficie de configuración y no aporta nada al dogfooding. Sin invitaciones
self-service.

**Cookies.** `cookieOptions: { domain: '.kavea.ai' }` en producción, para que la sesión valga
en cualquier subdominio. La alternativa —cookie por subdominio— obligaría a iniciar sesión una
vez por organización. El riesgo de compartir cookie entre subdominios es que un subdominio
hostil la lea; aquí todos son de primera parte y los controla Kavea, con la lista de reservados
de T5 impidiendo que alguien registre `admin` o `api`. En local el dominio se deja sin fijar:
`.localhost` no acepta cookie de dominio.

**URLs de redirección.** Añadir a la lista blanca de Auth `https://*.kavea.ai/**`,
`https://admin.kavea.ai/**`, el patrón de Deploy Previews de Netlify
(`https://deploy-preview-*--<sitio>.netlify.app/**`) y `http://localhost:3000/**`. Sin eso, la
confirmación de correo redirige al sitio por defecto.

**Verificación de sesión.** `getUser()` valida contra el servidor de Auth en cada petición;
`getClaims()` verifica el JWT localmente cuando el proyecto tiene claves asimétricas. Comprobar
qué tiene este proyecto y usar la variante local si está disponible: en el middleware, una ida
y vuelta por petición es una tasa de latencia sobre todo el tráfico.

**Criterio de aceptación.** Un usuario creado con la API de administración inicia sesión en
`boosty.kavea.ai` y la sesión sigue viva al navegar a `otra.kavea.ai`, donde no ve datos.
Cerrar sesión invalida la cookie en ambos subdominios.

---

### T20 — Next.js en Netlify: middleware de subdominio y resolución de organización

En Netlify, Next.js se sirve por el Next Runtime y **el middleware corre como Edge Function de
Netlify**, sobre Deno, no sobre el runtime de Vercel. El diseño se sostiene, con tres
verificaciones que hay que hacer empíricamente en el primer despliegue en lugar de darlas por
supuestas.

**Qué se sostiene igual.** Leer `Host`, borrar cabeceras entrantes falsificables, y refrescar
la sesión de Supabase sin consultar la base. Las tres son API web estándar: `Headers`,
`Request`, cookies. `@supabase/ssr` no usa API de Node, así que funciona sobre Deno sin
cambios. El `matcher` del `config` lo traduce el Next Runtime a la configuración de rutas de la
Edge Function.

**Qué hay que verificar.**

1. **Que la cabecera que fija el middleware llega al componente de servidor.** El mecanismo
   —`NextResponse.next({ request: { headers } })`— es una función de Next.js que el Next
   Runtime emula. Si no propaga, la salida documentada es reescribir la ruta e incluir el slug
   en el path (`/_org/<slug>/…`), que el App Router lee como segmento dinámico. Es un cambio
   contenido y no toca el modelo de datos.
2. **Que las cookies de refresco sobreviven.** La trampa de `@supabase/ssr` es la misma en
   cualquier proveedor: hay que **devolver el objeto `respuesta` tal cual**. Construir un
   `NextResponse` nuevo al final descarta las cookies que `setAll` acaba de escribir, y el
   síntoma es una sesión que se pierde de forma intermitente sin ningún error en los registros.
3. **Que el middleware no se salta para rutas estáticas.** Se comprueba con el registro de
   invocaciones de la Edge Function: si se dispara para `_next/static`, el `matcher` no se
   tradujo bien y se está pagando latencia sobre todo el tráfico.

**No resuelve `organization_id`, y conviene decir por qué.** El middleware corre en el edge en
cada petición, incluidas las que no necesitan la organización. Una consulta a la base ahí es
latencia y coste sobre todo el tráfico. Y el `organization_id` obtenido sin comprobar membresía
no sirve: la comprobación real la hace RLS al leer. Así que el middleware pasa el slug y un
ayudante de servidor, memorizado por petición, lo resuelve bajo RLS. Si el usuario no es
miembro, la consulta devuelve cero filas y la página responde 404.

```ts
// app/middleware.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Variable, no constante: T26 puede dejar los tenants en `kavea.ai` o en
// `app.kavea.ai`, y el middleware no debe enterarse.
const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'
const RESERVADOS = new Set(['www', 'admin', 'api', 'hooks', 'mail', 'send', 'status'])

function slugDesdeHost(host: string): string | null {
  const limpio = host.split(':')[0].toLowerCase()
  if (limpio.endsWith('.localhost')) return limpio.slice(0, -'.localhost'.length) || null
  const sufijo = `.${RAIZ}`
  if (!limpio.endsWith(sufijo)) return null
  const etiqueta = limpio.slice(0, -sufijo.length)
  if (!etiqueta || etiqueta.includes('.')) return null   // nada de sub-sub-dominios
  return etiqueta
}

export async function middleware(request: NextRequest) {
  // 1. Nadie de fuera decide la organización. Se borran antes de leer nada.
  const cabeceras = new Headers(request.headers)
  cabeceras.delete('x-kavea-org-slug')
  cabeceras.delete('x-kavea-superficie')

  const slug = slugDesdeHost(request.headers.get('host') ?? '')

  let respuesta = NextResponse.next({ request: { headers: cabeceras } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions:
        RAIZ === 'localhost' ? {} : { domain: `.${RAIZ}`, sameSite: 'lax', secure: true },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request: { headers: cabeceras } })
          cookies.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // 2. Refresco de sesión. Sin esta llamada el token caduca y el usuario
  //    aparece deslogueado a mitad de sesión.
  const { data: { user } } = await supabase.auth.getUser()

  // 3. Enrutado por superficie.
  if (slug === 'admin') {
    if (!user) return NextResponse.redirect(new URL('/entrar', request.url))
    cabeceras.set('x-kavea-superficie', 'admin')
    return respuesta
  }

  if (slug && !RESERVADOS.has(slug)) {
    cabeceras.set('x-kavea-org-slug', slug)
    cabeceras.set('x-kavea-superficie', 'app')
  }

  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
```

**`RAIZ` es variable de entorno y eso resuelve una dependencia con T26.** Si la salida de R1 es
delegar solo un subzona, los tenants pasan a vivir en `<slug>.app.kavea.ai`. El middleware no
cambia: cambia `NEXT_PUBLIC_DOMINIO_RAIZ`. Esa indirección es lo que permite decidir T26 sin
rehacer T20.

```ts
// app/lib/organizacion.ts
import { cache } from 'react'
import { headers } from 'next/headers'
import { crearClienteServidor } from './supabase/servidor'

export const organizacionActual = cache(async () => {
  const slug = (await headers()).get('x-kavea-org-slug')
  if (!slug) return null
  const supabase = await crearClienteServidor()
  // RLS: si el usuario no es miembro, esto devuelve cero filas.
  const { data } = await supabase
    .from('organizations')
    .select('id, slug, nombre')
    .eq('slug', slug)
    .maybeSingle()
  return data
})
```

Regla que rige todas las fases siguientes: **ninguna consulta de lectura filtra por
`organization_id` desde el cliente.** El filtro lo pone RLS. El `organization_id` resuelto sirve
para escribir, donde `with check` lo valida, no para leer.

**Desarrollo local.** `boosty.localhost:3000` funciona en Chrome y Firefox sin tocar el fichero
hosts. En Safari hay que añadir la entrada. Documentado en el README.

**Deploy Previews.** Los previews de Netlify sirven en
`deploy-preview-<PR>--<sitio>.netlify.app` y los branch deploys en
`<rama>--<sitio>.netlify.app`. De ninguno se puede extraer un slug de organización. Para esos
contextos el middleware acepta una segunda fuente, activa solo cuando `CONTEXT !==
'production'`: una cookie `kavea-org-dev` fijada por un selector visible únicamente ahí. Ver
P2 para la alternativa con dominio real.

**Cliente de servicio.** El módulo que crea el cliente con `SUPABASE_SECRET_KEY` importa
`server-only` en su primera línea. Si un componente de cliente lo importa por descuido, el
build falla. Es la única guarda fiable contra que la clave de servicio acabe en el bundle del
navegador.

**Realtime, anotado para el bloque 3.** El `02` §5.2 y el `06` §5 fijan Broadcast desde un
trigger, no `postgres_changes` con filtro, porque `postgres_changes` evalúa RLS por suscriptor
y por cambio. Consecuencia para las pruebas: la batería de esta fase no cubre Realtime, pero
cuando llegue la bandeja habrá que probar la **autorización del canal**
`org:{organization_id}`, que es un mecanismo distinto de RLS y no se hereda de él.

**Criterio de aceptación.** Una petición a `boosty.kavea.ai` con la cabecera
`x-kavea-org-slug: otra` falsificada resuelve `boosty`. Una petición con sesión de quien no es
miembro responde 404. `sub.dominio.kavea.ai` no resuelve slug. La sesión sobrevive a diez
navegaciones. Las tres verificaciones de la Edge Function están registradas con su resultado.

---

### T21 — `admin.kavea.ai` y la puerta del staff

Misma base de código, mismo sitio de Netlify, distinta superficie. En el App Router se resuelve
con grupos de rutas: `app/(cliente)/…` y `app/(admin)/…`, y el layout de `(admin)` comprueba en
el servidor que el usuario tenga fila en `staff` antes de renderizar nada.

`admin` está en la lista de reservados de T5, así que ninguna organización puede llamarse así.
Y el registro DNS `admin` es explícito, no cae en el comodín — lo que además significa que
`admin.kavea.ai` **puede obtener un certificado propio por HTTP-01 aunque el comodín falle**.
Ese detalle importa para R1: si la salida de T26 se retrasa, el panel interno puede funcionar
antes que las apps de cliente.

Lo que el panel hace en fase 0: comprobar sesión, comprobar `staff`, y listar organizaciones
con sus metadatos. Nada más. Métricas agregadas, kill-switch sobre `channels` e interfaz de
break-glass son superficies posteriores.

**Criterio de aceptación.** Un usuario sin fila en `staff` que abre `admin.kavea.ai` recibe
404, no un 403 que confirme que la ruta existe. Con fila en `staff`, ve la lista. La
comprobación es de servidor: desactivar JavaScript no la elude.

---

### T22 — Cloudflare: cuenta, estructura y coherencia de secretos

No se escribe lógica de ingesta. Se prepara el terreno y se cierra el riesgo que el `06` §1
señala: *"`GRAPH_API_VERSION` y el App Secret viven en más de un sitio y pueden
desincronizarse. Se mitiga con un test que compare ambos entornos, no con disciplina."*

Entregables:

1. Cuenta de Cloudflare con Workers, Queues y R2 habilitados. Bucket de R2 creado para media
   **saliente**; queda vacío.
2. `workers/` con `wrangler.toml` y un Worker que solo responde al handshake de verificación de
   webhooks (`GET` con `hub.mode`, `hub.challenge`, `hub.verify_token`, devolviendo el
   challenge crudo). No procesa `POST`. Sirve para validar despliegue, almacén de secretos y
   DNS, no para recibir eventos.
3. Secretos del Worker con `wrangler secret put`: `META_APP_SECRET`, `META_VERIFY_TOKEN`,
   `GRAPH_API_VERSION`. Vacíos o de prueba mientras el trámite de Meta no termine.
4. **Prueba de coherencia entre proveedores.** Un paso de CI que lee `GRAPH_API_VERSION` de la
   configuración de Netlify y de la de Cloudflare y falla si difieren. El App Secret no se
   compara en claro: se comparan huellas SHA-256.

```ts
// scripts/coherencia-secretos.test.ts
test('GRAPH_API_VERSION coincide en Netlify y en Cloudflare', async () => {
  expect(await versionEnNetlify()).toBe(await versionEnCloudflare())
})

test('la huella del App Secret coincide en los dos proveedores', async () => {
  expect(await huellaAppSecretNetlify()).toBe(await huellaAppSecretCloudflare())
})
```

5. **Prueba de redacción de tokens.** El §7.8 exige que el token nunca aparezca en un log. Se
   añade ahora, con el cliente HTTP compartido que usarán el Worker y la app:

```ts
test('el registrador recorta access_token de cualquier cadena', () => {
  const url = 'https://graph.facebook.com/v26.0/me/messages?access_token=EAAG123secreto'
  expect(redactar(url)).toBe('https://graph.facebook.com/v26.0/me/messages?access_token=[REDACTADO]')
})
```

6. **Vigilancia de caducidad del certificado.** Un `pg_cron` semanal que, con `pg_net`,
   comprueba el certificado de `boosty.kavea.ai` y alerta si le quedan menos de 21 días. Es
   la mitigación operativa de R1: el modo de fallo de un comodín mal aprovisionado no es que no
   funcione hoy, es que deje de renovarse a los tres meses, en silencio y para todos los
   tenants a la vez.

**Criterio de aceptación.** `curl
'https://<worker>/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=abc123'`
devuelve `abc123` en texto plano; con `verify_token` incorrecto, 403. Las pruebas de coherencia
y redacción pasan en CI, y se comprueba que fallan al desincronizar una variable a propósito.
El cron de certificado dispara una alerta de prueba.

---

### T23 — Batería de pruebas de aislamiento

Esta es la tarea que justifica la fase. Prueba **las dos fronteras por separado**, porque son
mecanismos distintos.

**Tres niveles, porque uno solo no basta.**

- **pgTAP con `set local role`** comprueba las políticas. No detecta un fallo de `grant`: una
  tabla expuesta a `anon` por la Data API se ve perfecta desde dentro.
- **pgTAP con rol de servicio** comprueba la frontera de escritura: claves compuestas y la
  clave primaria de `meta_asset_routes`. Es la única forma de probar lo que hace el
  normalizador, que salta RLS por diseño.
- **Extremo a extremo sobre PostgREST** con JWT reales comprueba `grant`, exposición de
  esquemas y privilegios.

**Fixtures.** Dos organizaciones, cinco usuarios, un árbol completo por organización:

| Fixture | Qué es |
|---|---|
| `org_a`, `org_b` | Dos organizaciones con UUID fijo |
| `a1` | `agente` en A |
| `a2` | `owner` en A |
| `b1` | `agente` en B |
| `s1` | Fila en `staff`, sin membresía en ninguna organización |
| `x1` | Autenticado, sin ninguna membresía |

Cada organización con una `meta_connection`, dos `meta_asset_routes`, un `channel`, un contacto
con identidad, una conversación y tres mensajes con su `message_event` y su `media`.

```sql
create or replace function tests.como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

create or replace function tests.como_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
```

**Plano de lectura.** Cada prueba está escrita para **fallar si RLS está mal**, no para pasar si
está bien. Una prueba que solo comprueba que A ve sus propios datos pasa aunque A vea también
los de B.

| # | Qué comprueba | Falla si |
|---|---|---|
| T1 | Como `a1`, `select count(*) from messages` = 3 y ninguno con `organization_id = org_b` | Falta la política o el `using` está mal |
| T2 | Como `a1`, `insert into contacts` con `organization_id = org_b` lanza `42501` | Falta el `with check` |
| T3 | Como `a1`, `update contacts set organization_id = org_b` lanza `42501` o afecta cero filas | El `with check` no cubre `update` |
| T5 | Como `anon`, toda tabla de negocio devuelve cero filas o error de permisos | Los `grant` por defecto dejaron algo abierto |
| T6 | Como `x1`, toda tabla devuelve cero filas | La política no comprueba membresía |
| T7 | Como `a1`, `update organization_members set rol='owner' where user_id = a1` afecta cero filas | La política de membresías permite auto-ascenso |
| T8 | `s1` sin grant ve 0 mensajes; con grant vigente sobre A ve 3 y 0 de B; con grant caducado vuelve a 0 | `org_ids_con_grant()` no filtra por vigencia o por staff |
| T9 | Como `s1`, `insert into access_grants` falla | Existe política de insert donde no debería |
| T10 | `has_function_privilege('anon','public.es_miembro(uuid)','execute')` es `false` | El `revoke` no se aplicó |
| T11 | Como `a1` y como `anon`, `select` sobre `webhook_events` falla o devuelve cero | La bitácora quedó expuesta |
| T12 | Como `a1`, `insert into messages` / `message_events` / `media` falla | Se añadió una política de escritura por descuido |
| T13 | Como `a1`, `select * from private.meta_credentials` falla por permisos de esquema | El esquema `private` quedó accesible |

**Plano de escritura.** Con rol de servicio, que es quien escribe la ingesta:

| # | Qué comprueba | Falla si |
|---|---|---|
| T4a | `insert into contact_identities` con `organization_id=A` y `contact_id` de B lanza `23503` | Falta la clave compuesta a `contacts` |
| T4b | `insert into conversations` con `channel_id` de otro tenant lanza `23503` | Falta la clave compuesta a `channels` |
| T4c | `insert into messages` con `conversation_id` de otro tenant lanza `23503` | Falta la clave compuesta a `conversations` |
| T4d | `insert into media` con `message_id` de otro tenant lanza `23503` | Falta la clave compuesta a `messages` |
| T4e | `insert into meta_asset_routes` con `asset_id` existente y otra organización falla por clave primaria | La frontera de enrutado se degradó a un índice no único |
| T4f | `insert into meta_asset_routes` con `meta_connection_id` de otro tenant lanza `23503` | Falta la clave compuesta a `meta_connections` |

T4e es la prueba de la frontera principal. Que use rol de servicio es el punto: con una sesión
el `with check` ya lo bloquearía y la prueba no demostraría nada sobre el camino que recorre la
ingesta.

**Forma del dato.**

| # | Qué comprueba |
|---|---|
| T14 | `meta_timestamp_ms = 1754092800000` produce `meta_timestamp` en 2025, no en 1970 |
| T15 | `insert` en `message_events` con `tipo` desconocido entra sin error |
| T16 | `insert` en `media` con `origen='meta_cdn'` y `r2_key` no nulo falla |
| T17 | Dos reacciones idénticas producen una fila por `message_events_dedupe` |
| T18 | El mismo `mid` tres veces produce una fila; con otro tenant, dos |

**Cinco canarios**, generados desde `pg_catalog`, que siguen protegiendo cuando la fase 0 sea
historia y cubren automáticamente las tablas que añadan los bloques 1 a 7:

```sql
-- C1. Toda tabla de public tiene RLS activo y forzado.
select is_empty($$
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (not c.relrowsecurity or not c.relforcerowsecurity)
$$, 'toda tabla de public tiene RLS activo y forzado');

-- C2. Toda tabla de public tiene al menos una política, salvo la lista de excepciones.
select is_empty($$
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('webhook_events')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
$$, 'toda tabla tiene política, salvo webhook_events por diseño');

-- C3. Ninguna política llama a auth.uid() sin envolverla en select.
--     Punto 1 del 02 §7.7, convertido en prueba.
select is_empty($$
  select p.polname from pg_policy p
   where (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'auth\.uid\(\)'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'auth\.uid\(\)')
     and not (coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ '\(\s*select\s+auth\.uid\(\)\s*\)'
           or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '\(\s*select\s+auth\.uid\(\)\s*\)')
$$, 'ninguna política llama a auth.uid() sin envolver');

-- C4. Toda tabla con organization_id tiene un índice que empieza por esa columna.
--     Punto 2 del 02 §7.7, convertido en prueba.
select is_empty($$
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'organization_id' and a.attnum > 0)
     and not exists (
       select 1 from pg_index i
         join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
        where i.indrelid = c.oid and a.attname = 'organization_id')
$$, 'toda tabla con organization_id tiene índice que empieza por organization_id');

-- C5. Ninguna columna de public usa un tipo enum. El 02 §7 lo prohíbe.
select is_empty($$
  select c.relname || '.' || a.attname
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
   where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and t.typtype = 'e'
$$, 'ninguna columna usa enum: Meta añade valores sin avisar');
```

**El barrido**, la prueba que más vale de todas: como `a1`, recorrer todas las tablas de
`public` con columna `organization_id` y comprobar que ninguna deja ver una fila de otro
tenant. Cubre las tablas futuras sin tocarla.

```sql
do $$
declare t record; n bigint;
begin
  perform tests.como(current_setting('tests.user_a1')::uuid);
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'organization_id' and a.attnum > 0)
  loop
    execute format('select count(*) from public.%I where organization_id <> $1', t.relname)
      into n using current_setting('tests.org_a')::uuid;
    if n > 0 then
      raise exception 'FUGA en %: % filas de otro tenant visibles', t.relname, n;
    end if;
  end loop;
end $$;
```

**Extremo a extremo sobre PostgREST**, contra el stack local, con usuarios reales creados por
la API de administración e iniciando sesión con contraseña para obtener JWT auténticos:

```ts
const a = await clienteAutenticado('a1@kavea.test')
const anon = createClient(URL, CLAVE_PUBLICABLE)

const { data } = await a.from('messages').select('id, organization_id')
expect(data!.every((m) => m.organization_id === ORG_A)).toBe(true)

expect((await a.from('contacts').insert({ organization_id: ORG_B, nombre: 'x' })).error?.code)
  .toBe('42501')

expect((await anon.from('messages').select('id')).data).toHaveLength(0)
expect((await anon.from('webhook_events').select('id')).data ?? []).toHaveLength(0)

// El esquema private no existe para la API.
expect((await a.schema('private' as never).from('meta_credentials').select('*')).error)
  .not.toBeNull()
```

**Medición de rendimiento de RLS** (cierra P4). Se siembran 200.000 mensajes entre los dos
tenants y se ejecuta la consulta de bandeja con sesión de `a1`:

```sql
explain (analyze, buffers)
select id, texto, meta_timestamp from public.messages
 where conversation_id = current_setting('tests.conv_a')::uuid
 order by meta_timestamp desc limit 50;
```

Se registra el tiempo y si `es_miembro` domina el plan. Si domina, se abre P4 con datos, no con
intuición.

**Criterio de aceptación.** `supabase test db` ejecuta lectura, escritura, forma, los cinco
canarios y el barrido, y termina en cero. **Y se comprueba que la batería detecta el fallo:**
quitar `enable row level security` de `messages` hace fallar C1; quitar `force` también hace
fallar C1; quitar la política de `contacts` hace fallar T1 y el barrido; sustituir una clave
compuesta por una simple hace fallar T4a a T4d; convertir `meta_asset_routes.asset_id` en
índice no único hace fallar T4e; cambiar `canal_meta` por un `enum` hace fallar C5. Una batería
que no se ha visto fallar no prueba nada.

---

### T24 — Integración continua

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  calidad:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck        # tsc --noEmit
      - run: pnpm -r lint
      - run: pnpm -r build
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: clave-de-build
          NEXT_PUBLIC_DOMINIO_RAIZ: kavea.ai
          GRAPH_API_VERSION: v26.0

  base-de-datos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: '<versión fijada>' }   # nunca `latest`
      - run: supabase start
      - run: supabase db reset                  # las 13 migraciones desde cero
      - run: supabase test db                   # aislamiento: lectura, escritura, canarios
      - run: supabase db lint --level warning
      - run: pnpm -r test:e2e                   # PostgREST con JWT reales

  coherencia:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coherencia-secretos      # Netlify contra Cloudflare (T22)

  secretos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
```

Cuatro decisiones:

- La versión del CLI de Supabase se fija. Con `latest`, una publicación del CLI rompe CI en un
  PR que no tocó la base de datos.
- `supabase db reset` en lugar de migraciones incrementales: comprueba que el esquema se
  reconstruye desde cero, que es lo que hace un entorno nuevo y lo que hace la recuperación
  tras un desastre.
- Las variables del build de `app/` son falsas. El build no habla con Supabase; si lo hiciera,
  sería un fallo de diseño que conviene descubrir aquí.
- El trabajo `coherencia` existe porque hay cuatro proveedores. Es la mitigación que el `06` §1
  pide, y va separado para que su fallo se lea como lo que es: una desincronización de
  configuración, no un error de código.

Los builds de Netlify son independientes de este workflow. Protección de rama: los cuatro
trabajos en verde antes de mezclar.

**Criterio de aceptación.** Un PR con error de tipos falla en `calidad`. Un PR que añade una
tabla sin RLS falla en `base-de-datos` por C1. Un PR que desincroniza `GRAPH_API_VERSION` falla
en `coherencia`. Un PR que commitea una clave falla en `secretos`.

---

### T25 — Semilla del primer usuario y verificación de extremo a extremo

```ts
// scripts/semilla.ts — se ejecuta con la clave de servicio del entorno destino
const admin = createClient(URL, SECRET_KEY, { auth: { autoRefreshToken: false } })

const { data: usuario, error } = await admin.auth.admin.createUser({
  email: correoPropietario,
  password: passwordInicial,   // se cambia en el primer acceso
  email_confirm: true,
})
if (error) throw error

await admin.from('organization_members').upsert({
  organization_id: ORG_BOOSTY,   // 00000000-0000-4000-8000-000000000001
  user_id: usuario.user.id,
  rol: 'owner',
})

// Staff de Boosty: el mismo usuario, con su fila en staff.
await admin.from('staff').upsert({ user_id: usuario.user.id, rol: 'direccion' })
```

Idempotente. Se ejecuta una vez por entorno. Para local, `supabase/seed.sql` carga además los
fixtures de prueba, de forma que `supabase db reset` deja un entorno utilizable.

**Verificación final**, a mano, contra producción:

1. Abrir `https://boosty.kavea.ai` e iniciar sesión con el usuario sembrado.
2. Confirmar que la organización resuelta es `boosty`.
3. Con rol de servicio, crear una organización `pruebas` y un usuario miembro solo de ella.
4. Desde la sesión de `boosty`, abrir `https://pruebas.kavea.ai`: 404.
5. Desde la sesión de `pruebas`, abrir `https://boosty.kavea.ai`: 404.
6. `curl -H "Host: pruebas.kavea.ai"` con la cookie de sesión de `boosty`: no devuelve datos de
   `pruebas`.
7. Con rol de servicio, `insert into meta_asset_routes` con un `asset_id` que ya existe en
   `boosty`, apuntando a `pruebas`: falla por clave primaria.
8. Abrir `https://admin.kavea.ai` con el usuario de `pruebas` (no staff): 404.
9. Abrir `https://admin.kavea.ai` con el usuario sembrado (staff): lista de organizaciones.
10. `openssl s_client -connect boosty.kavea.ai:443` devuelve un certificado que cubre
    `*.kavea.ai` con más de 30 días de vigencia.
11. Borrar la organización `pruebas` y su usuario.

**Criterio de aceptación.** Los once pasos se comportan como se describe. Los pasos 6, 7 y 10
son los que cierran la fase: el 6 demuestra que el subdominio es enrutado y RLS la frontera de
lectura; el 7, que la clave primaria de `meta_asset_routes` es la frontera de escritura; el 10,
que el comodín existe de verdad y no es una URL que funciona hoy y muere en noventa días.

---

### T26 — Zona DNS y certificado comodín: la decisión que condiciona el bloque

**El problema, en una frase.** Netlify solo emite y renueva certificados comodín cuando la zona
está en Netlify DNS, porque el reto ACME de un comodín exige validación DNS-01 y Netlify tiene
que poder escribir el TXT. Con DNS externo —hoy GoDaddy— el comodín no se puede validar. El
modo de fallo es peor que un error al desplegar: se puede improvisar un certificado que
funcione hoy y **dejar de renovarse a los tres meses**, en silencio y para todos los tenants a
la vez.

Cinco salidas, con su coste. Se decide **antes** de T20, aunque el middleware está escrito para
sobrevivir a A, B, C y D sin cambios de código gracias a `NEXT_PUBLIC_DOMINIO_RAIZ`.

| Opción | Qué implica | Coste | Veredicto |
|---|---|---|---|
| **A. Delegar toda la zona a Netlify DNS** | Cambiar los nameservers en GoDaddy y recrear todos los registros en Netlify | Migración de zona con el correo de Resend dentro; una cutover mal hecha deja sin correo la dirección de las páginas legales | **Recomendada** |
| **B. Delegar solo una subzona** | `NS` en GoDaddy para `app.kavea.ai` hacia Netlify DNS; los tenants viven en `<slug>.app.kavea.ai` | URL más larga; el apex y Resend no se tocan | Mejor relación riesgo/beneficio si A asusta |
| **C. Certificado propio subido a Netlify** | Emitirlo por DNS-01 contra la API de GoDaddy y subirlo | Renovación cada 90 días; un olvido tumba a todos los tenants | Solo como puente |
| **D. Cloudflare por delante** | Mover la zona a Cloudflare —proveedor que ya está en la arquitectura— y servir con su certificado comodín delante de Netlify | Un salto de proxy delante de la app; hay que verificar que el `Host` original llega intacto, porque **toda la resolución de tenant depende de esa cabecera** | Viable, y no añade un quinto proveedor |
| **E. Abandonar el subdominio** | `app.kavea.ai/boosty` | Contradice una decisión cerrada del `06` §3 | Último recurso |

**Recomendación: A, con B como repliegue.** A es la única que deja las URLs como el `06` §3 las
decidió y no añade piezas. Su riesgo es de ejecución, y la ejecución se puede hacer segura:

1. Inventariar la zona actual en GoDaddy, registro a registro, incluidos los cuatro de Resend
   (MX de entrada, DKIM, el subdominio `send.kavea.ai` y DMARC).
2. Bajar los TTL a 300 segundos y esperar a que caduque el TTL anterior.
3. Crear la zona en Netlify DNS y **recrear todos los registros antes de tocar nada**.
4. Comparar las dos zonas con `dig` registro a registro, desde fuera.
5. Cambiar los nameservers en GoDaddy.
6. Verificar en este orden: el sitio público responde; el correo entra en `support@kavea.ai`;
   el comodín se emite; `admin.kavea.ai` responde.
7. Subir los TTL de nuevo.

El paso 6 en ese orden no es casual: el correo es lo que sostiene el App Review, así que se
comprueba antes que el comodín.

**Y la mitigación que aplica a las cinco opciones:** el cron de vigilancia de certificado de
T22. Sea cual sea la salida, una alerta a 21 días de la caducidad es lo que convierte "dejó de
renovarse en silencio" en "un aviso el martes".

**Criterio de aceptación.** Decisión escrita, con fecha y firmante, en este documento. Si es A o
B, la migración ejecutada y verificada con los siete pasos. `openssl s_client -connect
<slug>.<raiz>:443` devuelve certificado válido para el comodín, y una segunda comprobación
treinta días después confirma que sigue vigente. El cron de T22 alerta correctamente en una
prueba forzada.

---

## Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **R1** | **Netlify no emite ni renueva comodín con la zona fuera de Netlify DNS. La zona está en GoDaddy** | **Ninguna app de cliente sirve; o peor, sirve noventa días y muere en silencio para todos los tenants a la vez** | **T26: decisión antes de T20, con cinco salidas evaluadas; migración de zona por pasos con el correo verificado antes que el certificado; cron de vigilancia a 21 días en T22** |
| R2 | Migrar la zona rompe los registros de Resend | El correo de `support@kavea.ai` cae y con él el enlace de las páginas legales del App Review | T26 pasos 1 a 6: recrear antes de cambiar nameservers, comparar con `dig`, verificar el correo antes que el certificado |
| R3 | Una tabla de un bloque futuro se crea sin RLS | Fuga entre tenants, silenciosa | Canario C1 en CI: falla el push, no el cliente |
| R4 | La clave de servicio acaba en el bundle del navegador | Cualquiera lee cualquier tenant | `server-only` en el módulo que la usa, `gitleaks` en CI, y nada secreto con prefijo `NEXT_PUBLIC_` |
| R5 | Deploy Preview apuntando a producción | Un PR de cualquiera lee todos los tenants | T4: proyecto Supabase separado por *deploy context* |
| R6 | El middleware como Edge Function de Netlify no propaga la cabecera al componente de servidor | La resolución de organización deja de funcionar | T20 verificación 1, con salida documentada (slug en la ruta reescrita) |
| R7 | Migraciones sin `down` | Recuperación por copia de seguridad, con pérdida | Migración compensatoria escrita a la vez; `db reset` en preview obligatorio; conocer el PITR antes de la primera migración con datos |
| R8 | `postgres` sin `BYPASSRLS` con `force row level security` | La migración de semilla falla en producción | T17: comprobar `rolbypassrls` antes; salida documentada |
| R9 | `private` publicado en la configuración de la API | Los tokens cifrados quedan legibles por PostgREST | T8: comprobación en el panel, más pruebas T13 y extremo a extremo |
| R10 | Mover el repositorio o el `netlify.toml` rompe el sitio público | El sitio comercial cae | T1 y T2: el sitio existente no se toca; el nuevo se crea aparte y se verifica en su URL `netlify.app` antes de asignarle dominios |
| R11 | Los dos sitios se reconstruyen con cada commit | CI y despliegues el doble de lentos | T2: `ignore` por sitio, verificado con tres commits de prueba |
| R12 | `es_miembro` por fila degrada la bandeja a volumen real | Consultas lentas con cientos de miles de mensajes | Medición en T23 con 200.000 filas; salida en P4 sin cambiar el contrato del §7.7 unilateralmente |
| R13 | La batería pasa siempre, incluso con RLS roto | Falsa sensación de seguridad, peor que ninguna | T23 exige demostrar que las pruebas fallan al romper cada control a propósito |
| R14 | Cuatro proveedores, secretos desincronizados | `GRAPH_API_VERSION` distinta en Worker y app; roturas intermitentes en el bloque 1 | T22 y el trabajo `coherencia` de CI |
| R15 | Ampliar `canal_meta` con WhatsApp bloquea `messages` | Ventana de indisponibilidad al revalidar el dominio | Documentado en T18 antes de que ocurra |
| R16 | Timestamps entrelazados al mezclar ramas de migraciones | El orden de aplicación no coincide con el lógico | Un solo autor en fase 0; a partir del bloque 1, renombrar antes de mezclar |

---

## Definición de terminado

- [ ] `Boosty-Hub/kavea` es privado y contiene `web/`, `app/`, `workers/`, `supabase/`,
      `docs/`, `brand/`, `scripts/`.
- [ ] Dos sitios de Netlify sobre el repositorio, con `base` distinta, y cada uno se construye
      solo cuando cambia su directorio.
- [ ] `git clone` + `pnpm install` + `supabase start` + `supabase db reset` en máquina limpia
      deja un entorno funcionando, sin pasos manuales fuera del README.
- [ ] Las trece migraciones aplican en orden en local, preview y producción, y
      `supabase migration list` coincide en los tres.
- [ ] Cada migración tiene su fichero de reversión en `supabase/migrations/rollback/`.
- [ ] `supabase test db` pasa: lectura, escritura, forma del dato, cinco canarios y barrido.
- [ ] Se ha demostrado que las pruebas fallan al romper cada control a propósito.
- [ ] La prueba de extremo a extremo sobre PostgREST pasa con JWT reales.
- [ ] `private` no aparece en la lista de esquemas expuestos del proyecto.
- [ ] `supabase db advisors` sale sin hallazgos de seguridad.
- [ ] CI verde: tipos, lint, build, migraciones desde cero, aislamiento, coherencia de secretos
      y escaneo de secretos.
- [ ] **T26 decidido y ejecutado**, con certificado comodín válido y cron de vigilancia
      probado.
- [ ] `https://boosty.<raiz>` sirve con certificado válido y permite iniciar sesión.
- [ ] `https://admin.kavea.ai` distingue staff de no staff, con la comprobación en servidor.
- [ ] `https://kavea.ai` sigue sirviendo desde Netlify sin interrupción.
- [ ] `support@kavea.ai` sigue recibiendo correo después de cualquier movimiento de zona.
- [ ] Las tres verificaciones del middleware como Edge Function están registradas con su
      resultado.
- [ ] El Worker responde al handshake de verificación con el challenge crudo.
- [ ] La medición de rendimiento de RLS con 200.000 mensajes está registrada, con veredicto
      sobre P4.
- [ ] Ningún secreto en el repositorio ni en su historia.
- [ ] Los once pasos de verificación manual de T25 se comportan como se describe, en particular
      el 6, el 7 y el 10.
- [ ] Las preguntas abiertas P1 a P6 tienen respuesta o fecha de decisión.
- [x] El `06` §1 y §2 corregidos: dicen Netlify, no Vercel. Hecho el 2-ago-2026.

Criterio del `00` §9: no se pasa de fase con deuda de la anterior. Un elemento sin marcar es
deuda, no un detalle.

---

## Preguntas abiertas

**P1 — Entorno de preview: proyecto separado o Supabase Branching.**
Línea base: segundo proyecto, sin coste variable, con deriva de esquema si alguien olvida
aplicar migraciones. Branching da una base por PR y elimina la deriva, con coste por rama.
*Disparador:* la segunda vez que un PR falle en preview por deriva de esquema.

**P2 — Subdominio de tenant en Deploy Previews de Netlify.**
Línea base: cookie de desarrollo con selector de organización, activa solo cuando `CONTEXT !==
'production'`. La alternativa realista depende de T26: si la zona acaba en Netlify DNS, se puede
mapear una rama `staging` a un dominio propio y darle su propio comodín. Si acaba en Cloudflare
(opción D), la vía es un registro comodín de preview delante del sitio.
*Disparador:* el primer fallo de enrutado que se escape a producción por no reproducirse en
preview.

**P3 — Gestión de la clave de cifrado de `private.meta_credentials`.**
El §7.8 fija AES-256-GCM con `crypto.subtle` en el Worker y la clave en su almacén de secretos.
Falta decidir cuántas claves activas coexisten, cada cuánto se rota y quién custodia la copia
de recuperación. Sin eso, `kid` es una columna sin proceso detrás. La fase 0 crea la tabla
vacía, así que no bloquea; el bloque 5 escribe el primer token y ahí sí bloquea.
*Disparador:* antes del primer alta real por OAuth.

**P4 — Coste por fila de `es_miembro`.**
El §7.7 fija la forma y esta fase la respeta. La medición de T23 dirá si sobre `messages` a
volumen real el coste importa. Si importa, la salida documentada es una función compañera sin
argumentos usada como `organization_id in (select public.org_ids_del_usuario())`, evaluada una
vez por consulta. No se adopta sin la medición; y si se adopta, **se lleva de vuelta al `02`
§7.7**, porque cambiar la forma en un solo documento es exactamente cómo se produjo la
desincronización que el `06` §0 acaba de corregir.
*Disparador:* la medición de T23.

**P5 — Qué ve exactamente el staff sin grant.**
La fase 0 le da lectura de `organizations` y nada más. El `06` §6 promete "volúmenes, estados,
latencias, salud de canal, colas atascadas". Eso son agregados sobre `conversations`, `messages`
y `webhook_events`, y la forma correcta de servirlos es una función `security definer` que
devuelva recuentos, no una política de lectura sobre las tablas. Falta decidir la forma concreta
y en qué esquema vive.
*Disparador:* la primera métrica del panel interno, en el bloque 3.

**P6 — Gobierno del rol `owner`.**
Un `owner` puede degradarse a sí mismo y dejar la organización sin nadie que gestione
membresías. Se cierra con un trigger que impida borrar o degradar la última fila con rol
`owner`, pero eso interactúa con el borrado en cascada de organizaciones. En fase 0 no hay
riesgo real: hay un `owner` y lo controla Boosty.
*Disparador:* antes del primer cliente, es decir, antes del bloque 7.

**P7 — Nivel de copias de seguridad del proyecto de producción.**
Comprobar si hay *point-in-time recovery* o solo copias diarias. La respuesta cambia qué
migraciones se consideran seguras y cuál es la ventana real de recuperación.
*Disparador:* antes de la primera migración que toque datos reales.
