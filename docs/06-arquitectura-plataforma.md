# Kavea — Arquitectura de la plataforma

**Fecha:** 2 de agosto de 2026
**Estado:** decisiones cerradas, sin código escrito
**Depende de:** `00-documento-base.md`, `03-invariantes-meta.md`

Este documento fija cómo se construye Kavea. Lo que aquí se decide no se rediscute sin
una razón nueva; lo que queda abierto está marcado como tal en la sección 10.

---

## 1. Decisiones cerradas

| Decisión | Elección | Por qué |
|---|---|---|
| Alojamiento de la app | **Vercel** | Next.js App Router, middleware en edge y wildcard con certificado automático |
| Alojamiento del sitio público | **Netlify** | Ya desplegado, estático, sin motivo para moverlo |
| Base de datos | **Supabase** — `sdazqohyjzzylwbkvovx` | Postgres con RLS, auth y realtime en la misma pieza |
| Aislamiento | **Una sola base, RLS desde el día uno** | Un despliegue por cliente es el modelo que se rompe en el cliente diez |
| Enrutado de tenant | **Subdominio, desde el día uno** | `boosty.kavea.ai` durante el dogfooding |
| Acceso del admin | **Solo metadatos, con break-glass auditado** | Coherente con la política de privacidad publicada |
| Correo | **Resend**, entrante y saliente | Recibe y almacena aunque no haya webhook |

---

## 2. Las cuatro superficies

| Superficie | Dominio | Despliegue | Quién entra |
|---|---|---|---|
| Sitio público | `kavea.ai` | Netlify | Cualquiera |
| App de cliente | `*.kavea.ai` | Vercel | Equipo del cliente |
| Panel interno | `admin.kavea.ai` | Vercel, misma base de código | Solo Boosty |
| Receptor de eventos | Supabase Edge Function | Supabase | Meta y Resend |

Son cuatro, no tres. El receptor es el componente que faltaba en el planteamiento
inicial y es el más crítico de los cuatro.

### Por qué el receptor va aparte

Meta desuscribe una Página tras **una hora** de entregas fallidas, en silencio y por
cliente. Si el receptor fuera una ruta del mismo despliegue que la interfaz, un mal
despliegue del panel un viernes por la tarde apagaría la ingesta de todos los clientes
sin que nadie se entere hasta el lunes.

Va como **Supabase Edge Function**, desplegada con su propio ciclo, escribiendo directo
a la cola en la misma base. Dos detalles operativos que cuestan una tarde si se
descubren tarde:

- La función debe desplegarse con **verificación de JWT desactivada**. Meta no manda
  bearer token; con la verificación activa devuelve 401 y Meta desuscribe.
- La URL es `https://sdazqohyjzzylwbkvovx.supabase.co/functions/v1/meta-webhook`. Sirve
  tal cual para configurarla en Meta. Un dominio propio tipo `hooks.kavea.ai` es
  cosmético y se puede añadir después.

---

## 3. Cómo funciona el multi-tenant

### El subdominio es enrutado, no aislamiento

```
cliente1.kavea.ai  ──►  middleware lee el Host
                        ──►  resuelve slug → organization_id
                        ──►  lo pasa como contexto de petición
                                    │
                        RLS filtra por organization_id ◄── frontera real
```

**La frontera de seguridad es RLS más el token de sesión, nunca el subdominio.** Si
alguien falsifica la cabecera `Host`, Postgres lo bloquea igual porque la pertenencia
del usuario se resuelve contra `memberships`, no contra el dominio. El subdominio solo
decide qué organización se intenta abrir; RLS decide si se puede.

### Un solo despliegue

No hay copia por cliente. Hay una aplicación y N filas en `organizations`. Publicar una
mejora la ve todo el mundo en el mismo segundo porque solo existe una instancia. Dar de
alta un cliente es un `insert`, no un despliegue.

DNS: `*.kavea.ai` en CNAME hacia Vercel, más `admin.kavea.ai` explícito para que no
caiga en el comodín.

### El receptor no sabe de subdominios

Invariante del documento 03: **un único endpoint recibe los eventos de todos los
clientes**, y el enrutado se hace por `entry[].id` contra una tabla que guarda tanto
`page_id` como `ig_business_account_id` por organización. Esa resolución ocurre **antes**
de tocar cualquier dato. Un fallo ahí escribe mensajes de un cliente en el tenant de
otro, que es el peor fallo posible bajo RLS.

---

## 4. Esquema de datos

Todas las tablas de negocio llevan `organization_id` y RLS activo. Identificadores en
minúscula y sin comillas, claves primarias `uuid`, marcas de tiempo `timestamptz`.

### Núcleo

```sql
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        citext not null unique,          -- 'boosty' → boosty.kavea.ai
  nombre      text not null,
  estado      text not null default 'activa',  -- activa | suspendida
  created_at  timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  rol             text not null default 'agente',  -- propietario | admin | agente
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);
```

### Canales y enrutado de eventos

```sql
create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  canal           text not null,        -- whatsapp | instagram | messenger | email
  estado          text not null default 'desconectado',
  page_id                  text,        -- Messenger
  ig_business_account_id   text,        -- Instagram
  waba_id                  text,        -- WhatsApp
  phone_number_id          text,
  credenciales    jsonb,                -- cifrado en columna, nunca en claro
  created_at      timestamptz not null default now()
);

-- Resolución de entry[].id → organización. Únicos y globales a propósito:
-- una misma Página no puede estar en dos organizaciones a la vez.
create unique index channels_page_idx on public.channels (page_id)   where page_id is not null;
create unique index channels_ig_idx   on public.channels (ig_business_account_id) where ig_business_account_id is not null;
create unique index channels_waba_idx on public.channels (phone_number_id) where phone_number_id is not null;
create index channels_org_idx on public.channels (organization_id);
```

### Contactos y conversaciones

```sql
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nombre          text,
  telefono        text,
  created_at      timestamptz not null default now()
);

create table public.contact_identities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  canal           text not null,
  scoped_id       text not null,   -- PSID o IGSID: espacios distintos, no intercambiables
  app_scoped_id   text,            -- columna SEPARADA desde el día uno
  unique (organization_id, canal, scoped_id)
);
```

`app_scoped_id` va separada desde el principio porque las solicitudes de borrado de datos
de Meta llegan con un App-Scoped ID que **no es** ni el PSID ni el IGSID. Chatwoot tiene
un issue abierto por no poder resolver esa correspondencia.

```sql
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  canal           text not null,
  estado          text not null default 'nueva',  -- nueva|en_curso|esperando|cerrada
  asignado_a      uuid references auth.users(id),
  last_incoming_at timestamptz,   -- la ventana de 24 h se calcula SOLO sobre esto
  last_message_at  timestamptz,
  created_at      timestamptz not null default now()
);

-- Evita conversaciones duplicadas cuando llegan webhooks en paralelo
create unique index conversations_abierta_idx
  on public.conversations (organization_id, canal, contact_id)
  where estado <> 'cerrada';

create index conversations_bandeja_idx
  on public.conversations (organization_id, estado, last_message_at desc);
```

Ese índice único parcial es la solución al problema que Chatwoot resolvió con un mutex
en Redis: cuando alguien manda tres fotos seguidas llegan webhooks paralelos y un patrón
"buscar o crear" produce tres conversaciones. Con `on conflict do nothing returning`, lo
resuelve Postgres sin infraestructura extra.

### Mensajes

```sql
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  canal           text not null,
  mid             text not null,      -- entry[].messaging[].message.mid
  direccion       text not null,      -- entrante | saliente
  es_echo         boolean not null default false,
  emisor          text not null,      -- contacto | humano | agente
  texto           text,
  adjuntos        jsonb,              -- solo URLs del CDN de Meta, nunca binarios
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, canal, mid)
);

create index messages_hilo_idx on public.messages (conversation_id, created_at desc);
```

**La clave de idempotencia lleva `organization_id` a propósito.** Meta documenta `mid`
solo como "Message ID" y no afirma en ninguna parte cuál es su ámbito de unicidad. Al no
estar documentado, se acota por tenant. Nunca `unique(mid)` global.

Borrados y ediciones llegan con el **mismo** `mid` y son `update`, jamás `insert`: un
insert ciego crea una fila fantasma vacía.

### Cola de eventos

```sql
create table public.webhook_events (
  id            bigserial primary key,
  origen        text not null,       -- meta | resend
  payload       jsonb not null,      -- cuerpo crudo, tal como llegó
  firma_ok      boolean not null,
  estado        text not null default 'pendiente',
  intentos      int  not null default 0,
  error         text,
  locked_at     timestamptz,
  received_at   timestamptz not null default now()
);

create index webhook_events_pendientes_idx
  on public.webhook_events (received_at)
  where estado = 'pendiente';
```

El worker reclama trabajo con `skip locked`, que permite varios procesos en paralelo sin
bloquearse entre ellos:

```sql
update public.webhook_events
   set estado = 'procesando', locked_at = now(), intentos = intentos + 1
 where id = (
   select id from public.webhook_events
    where estado = 'pendiente'
    order by received_at
    limit 1
    for update skip locked
 )
returning *;
```

Esta tabla **no lleva `organization_id`**: el evento llega antes de saber de quién es.
Se resuelve en el normalizador. Por eso queda fuera de RLS y solo la toca el rol de
servicio.

### Auditoría de agentes

```sql
create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  entrada         jsonb,
  salida          jsonb,
  modelo          text,
  decision        text,       -- responder | escalar | ignorar
  costo_usd       numeric(10,6),
  latencia_ms     int,
  created_at      timestamptz not null default now()
);
```

Es el registro que permite decir *el sistema decidió esto por esto*. No es opcional: es
lo que separa operar de improvisar, y es lo que sobrevive cuando se borra el contenido
de una conversación.

---

## 5. RLS

Patrón único para todas las tablas de negocio. La función va en un esquema privado,
es `security definer`, y comprueba la identidad del llamante dentro del cuerpo:

```sql
create schema if not exists private;

create or replace function private.org_ids_del_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
    from public.memberships
   where user_id = (select auth.uid());
$$;

revoke execute on function private.org_ids_del_usuario() from public, anon;
```

Y la política, idéntica en cada tabla:

```sql
alter table public.conversations enable row level security;
alter table public.conversations force row level security;

create policy conversations_tenant on public.conversations
  for all
  to authenticated
  using      (organization_id in (select private.org_ids_del_usuario()))
  with check (organization_id in (select private.org_ids_del_usuario()));
```

Tres reglas que no se saltan:

1. **La llamada a la función va envuelta en `select`.** Sin eso Postgres la ejecuta una
   vez por fila; con eso, una sola vez por consulta. Es diferencia de 100× en tablas
   grandes.
2. **`force row level security`**, para que la política aplique también al dueño de la
   tabla.
3. **Índice sobre `organization_id` en toda tabla con política**, porque la política se
   convierte en un filtro y sin índice es un escaneo secuencial.

---

## 6. El panel interno y el break-glass

Decisión tomada: el admin ve **metadatos siempre, contenido nunca por defecto**.

```sql
create table public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rol        text not null default 'soporte'
);

-- Acceso temporal y motivado al contenido de una organización
create table public.access_grants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  motivo          text not null,
  expira_en       timestamptz not null,
  created_at      timestamptz not null default now()
);

create index access_grants_activos_idx
  on public.access_grants (user_id, organization_id, expira_en);
```

Política adicional sobre `messages`, que convive con la de tenant:

```sql
create policy messages_staff_breakglass on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.access_grants g
       where g.user_id = (select auth.uid())
         and g.organization_id = messages.organization_id
         and g.expira_en > now()
    )
  );
```

Lo que ve el admin sin grant: volúmenes, estados, latencias, salud de canal, colas
atascadas. Todo agregado, sin texto de mensajes. Abrir un grant exige motivo escrito,
caduca solo, y queda en la tabla para siempre.

El admin además controla el **kill-switch por canal y por tenant**, que es invariante:
Meta puede restringir la app entera sin aviso y dejar a todos los clientes sin servicio
a la vez. El modo degradado encola en vez de fallar.

---

## 7. Correo

`support@kavea.ai` con Resend, en dos tiempos:

- **Ahora.** Registros DNS (MX, DKIM, SPF, DMARC). Resend acepta y almacena el correo
  aunque no haya endpoint. La dirección publicada en las páginas legales deja de ser un
  riesgo el día que se propaguen los DNS.
- **Después.** Se apunta el webhook de Resend al receptor y el correo entra como cuarto
  canal en la misma bandeja. Es un cambio de configuración, no un rediseño.

Email como canal está **fuera del alcance de v1** por decisión del documento base. Tener
buzón no es lo mismo que construir el canal, y conviene no confundirlos.

---

## 8. Orden de construcción

| # | Bloque | Termina cuando |
|---|---|---|
| 0 | Cimientos: esquema, RLS, auth, middleware de subdominio | `boosty.kavea.ai` abre sesión y no ve datos de otra org |
| 1 | Receptor de webhooks | Meta entrega un evento, se valida la firma y queda en cola con 200 en menos de 5 s |
| 2 | Normalizador e idempotencia | El mismo evento entregado tres veces produce una sola fila |
| 3 | **Bandeja de solo lectura** | Se ven conversaciones reales llegando en vivo |
| 4 | Envío y ventana de 24 h | Se responde desde la bandeja y el compositor se bloquea fuera de ventana |
| 5 | **Módulo de configuración** | Un canal se conecta desde la interfaz, sin tocar la base |
| 6 | Agentes en modo copiloto | El agente propone, un humano aprueba, y queda en `agent_runs` |

El orden 1 y 2 antes que 3 no es negociable: no hay bandeja sin ingesta. Para el mes de
dogfooding, la configuración de canales de Boosty se siembra a mano; el bloque 5
construye la interfaz que generaliza eso.

**Atajo para acortar la realimentación:** los bloques 0 a 3 se validan con el número de
prueba que Meta da gratis en modo desarrollo. Mensajes reales entrando en días.

---

## 9. Lo que no se hace todavía

- **Registro self-service.** El onboarding real usa Embedded Signup, bloqueado hasta que
  Meta apruebe Tech Provider, y la regla de dogfooding impide clientes durante un mes.
  El front, por ahora: la web actual más lista de espera.
- **Facturación.** Fase 5.
- **Comentarios de Instagram.** Otro modelo de datos y otra ronda de App Review.
- **Email como canal.** Ver sección 7.

---

## 10. Decisiones diferidas, con su disparador

| Decisión | Cuándo se toma |
|---|---|
| Particionado de `messages` | Al acercarse al primer millón de filas. Ver nota abajo |
| Dominio propio para el receptor | Cuando estorbe la URL de Supabase, no antes |
| Modo autónomo de agentes | Solo tras medir calidad en copiloto, y por tipo de intención |
| Migrar el sitio público a Vercel | Solo si mantener dos proveedores duele de verdad |

**Nota sobre particionado.** Hay una tensión real: una tabla particionada por rango
exige que la clave de partición esté dentro de todo índice único, así que
`unique (organization_id, canal, mid)` tendría que incluir `created_at` y dejaría de
garantizar idempotencia. Y no se puede resolver con una tabla de deduplicación con TTL,
porque los borrados y ediciones de Instagram llegan con el mismo `mid` meses después y
hay que localizar la fila original. Conclusión: en v1 `messages` no se particiona. Si el
volumen lo exige, la salida es archivar conversaciones cerradas a una tabla fría, no
particionar la caliente.
