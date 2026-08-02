# Kavea — Arquitectura de la plataforma

**Fecha:** 2 de agosto de 2026
**Estado:** decisiones cerradas, sin código escrito
**Revisión:** corregido el 2 de agosto de 2026 tras contrastarlo con el documento 02

---

## 0. Precedencia entre documentos

Este documento **no** es la fuente de verdad de la conexión con Meta. Lo es el 02, y su
extracto normativo el 03. La primera versión de este documento se escribió sin haber
leído el 02 y contradijo varias de sus decisiones; esta versión las corrige.

| Materia | Documento que manda |
|---|---|
| Invariantes de Meta | `03-invariantes-meta.md` — normativo, por encima de todo |
| Conexión con Meta: flujo, receptor, cola, credenciales | `02-conexion-instagram-facebook.md` §5 |
| Modelo de datos, RLS, cifrado de tokens | `02` §7 |
| Envío, ventana, handover, límites | `02` §8, §9, §10 |
| Identidad visual y voz | `01-identidad-de-marca.md` |
| **Superficies, dominios, multi-tenant por subdominio, panel interno** | **este documento** |

Si este documento y el 02 discrepan en algo de la columna del 02, gana el 02. Lo que
queda aquí es lo que el 02 no cubre: dónde vive cada superficie, cómo se resuelve el
tenant por subdominio, y qué puede ver Boosty sobre los datos de sus clientes.

### Erratas corregidas respecto a la primera versión

| Error | Corrección | Fuente |
|---|---|---|
| Receptor en Supabase Edge Functions | **Cloudflare Worker** | `02` §5.3 |
| Cola en tabla de Postgres `webhook_events` | **Cloudflare Queues** | `02` §5.2 |
| Cron de reconciliación en Supabase | **Cron Trigger de Cloudflare** | `02` §5.2 |
| `channels.credenciales jsonb` | **`private.meta_credentials`**, AES-256-GCM con `kid` | `02` §7.8 |
| Enrutado por índices únicos parciales en `channels` | **`meta_asset_routes`** con `asset_id` como clave primaria | `02` §7.2 |
| "La frontera de seguridad es RLS" | RLS protege **la lectura**. La escritura de ingesta la protege la clave primaria de `meta_asset_routes` | `02` §7.7 |

---

## 1. Decisiones cerradas

| Decisión | Elección | Origen |
|---|---|---|
| Sitio público | Netlify, desde `web/` | ya desplegado |
| App multi-tenant y panel interno | **Netlify** | decisión de Gabriel, 2-ago |
| Base de datos | **Supabase** — `sdazqohyjzzylwbkvovx` | `00` §5 |
| Ingesta, cola y crones de Meta | **Cloudflare** Workers, Queues y Cron Triggers | `02` §5.3 |
| Media saliente | **Cloudflare R2** | `00` §5 |
| Aislamiento | Una sola base, RLS desde el día uno | `02` §7.7 |
| Enrutado de tenant | **Subdominio, desde el día uno** | decisión de Gabriel, 2-ago |
| Acceso del panel interno | **Solo metadatos, con break-glass auditado** | decisión de Gabriel, 2-ago |
| Correo | **Resend**, entrante y saliente. Verificado y operativo | 2-ago |

### El coste de esta arquitectura, dicho sin adornos

Son tres proveedores: Netlify, Supabase y Cloudflare. Es exactamente la cuenta que el
documento 02 ya asumía: *"dos proveedores, dos almacenes de secretos, dos pipelines de
despliegue y observabilidad partida"*, más Netlify que ya estaba.

Se acepta porque la razón del 02 no es de comodidad sino de supervivencia: el camino de
ingesta no puede compartir dominio de fallo con Postgres. Pero hay que mitigarlo con un
test que compare los secretos entre entornos, no con disciplina. `GRAPH_API_VERSION` y el
App Secret viven en más de un sitio y pueden desincronizarse.

---

## 2. Las cuatro superficies

| Superficie | Dominio | Despliegue | Quién entra |
|---|---|---|---|
| Sitio público | `kavea.ai` | Netlify, desde `web/` | Cualquiera |
| App de cliente | `*.kavea.ai` | Netlify, desde `app/` | Equipo del cliente |
| Panel interno | `admin.kavea.ai` | Netlify, misma base de código | Solo Boosty |
| Ingesta | Worker de Cloudflare | Cloudflare | Meta y Resend |

Son dos sitios de Netlify sobre el mismo repositorio, con `base` distinta: `web/` para el
público y `app/` para la aplicación. No es un despliegue por cliente; es un despliegue por
superficie.

El OAuth de alta —inicio y callback— **no** va en el Worker. Va en route handlers de
Next.js, porque el callback es un redirect con `code` y `state`, necesita la sesión del
usuario de Boosty que conduce el alta, y el intercambio expone el App Secret. Está en
`02` §5.2.

---

## 3. Cómo funciona el multi-tenant

Esta sección sí es de este documento: el 02 fija el aislamiento de datos, pero no cómo se
resuelve el tenant desde la web.

```
cliente1.kavea.ai  ──►  middleware lee el Host
                        ──►  resuelve slug → organization_id
                        ──►  contexto de la petición
                                    │
                        RLS filtra por membresía ◄── frontera del PLANO DE LECTURA
```

### El subdominio no es aislamiento

La pertenencia se resuelve contra `organization_members`, no contra el dominio. Si
alguien falsifica la cabecera `Host`, Postgres lo bloquea igual. El subdominio decide qué
organización se intenta abrir; RLS decide si se puede.

### Y RLS tampoco protege la ingesta

Esta es la distinción que la primera versión de este documento se saltó, y está en
`02` §7.7 con todas las letras: el worker de webhooks escribe con rol de servicio y salta
RLS por diseño, porque tiene que poder escribir en cualquier tenant. **Lo que impide que
escriba en el tenant equivocado no es RLS: es que `asset_id` sea la clave primaria de
`meta_asset_routes`.** Un `entry[].id` mapea a exactamente una organización o a ninguna.
Si no resuelve, va a cuarentena y alerta; nunca se adivina.

Confundir las dos fronteras es cómo se llega a un incidente de cruce de datos con RLS
"activado".

### Un solo despliegue

No hay copia por cliente. Hay una aplicación y N filas en `organizations`. Publicar una
mejora la ve todo el mundo en el mismo segundo porque solo existe una instancia. Dar de
alta un cliente es un `insert`, no un despliegue.

**El DNS condiciona esto y hay que decirlo.** Netlify solo emite y **renueva**
certificados comodín cuando la zona está en Netlify DNS: con DNS externo, la validación
por TXT del reto ACME no es posible y la renovación falla a los tres meses. Hoy la zona
está en GoDaddy (`ns35`/`ns36.domaincontrol.com`) y el certificado vigente cubre
`kavea.ai` y `www.kavea.ai`, sin comodín.

**Decisión: la zona se delega a Netlify DNS.** Cloudflare se descartó pese a estar ya en
la arquitectura por dos razones verificadas: en modo DNS-only no resuelve el problema
—Netlify sigue sin poder escribir el TXT del reto ACME—, y en modo proxy sí lo resolvería
pero Netlify desaconseja por escrito poner su CDN detrás de otro. Además el Universal SSL
de Cloudflare solo cubre el primer nivel de subdominio, lo que habría matado cualquier
esquema del tipo `cliente1.app.kavea.ai`.

Lo que se paga: los Workers de Cloudflare solo admiten dominio propio si la zona está en
Cloudflare. El receptor vive en `*.workers.dev`, que a Meta le sirve igual.

Estado al 2 de agosto de 2026: zona `kavea.ai` creada en Netlify DNS
(`6a6ee626cbdd2038473198ed`) con los siete registros replicados y **verificados
consultando directamente a `dns1.p05.nsone.net`** antes del cambio. Nameservers de
destino:

```
dns1.p05.nsone.net    dns2.p05.nsone.net
dns3.p05.nsone.net    dns4.p05.nsone.net
```

Pendiente: cambiar los nameservers en GoDaddy y, cuando exista el sitio de la aplicación,
añadir `*.kavea.ai` y `admin.kavea.ai` como alias de dominio para que Netlify emita el
certificado comodín.

---

## 4. Modelo de datos

**Definido en `02` §7.** No se reproduce aquí para que no existan dos versiones que se
desincronicen. Lo que hay que tener presente al construir:

- `organizations`, `organization_members` — base y membresía
- `meta_connections` — una fila por Página conectada, con estado de suscripción, salud de
  token y `messaging_feature_status`
- `meta_asset_routes` — `asset_id` como clave primaria. El enrutado de ingesta
- `channels` — canal por conexión, con kill-switch por canal y por tenant
- `contacts`, `contact_identities` — con `app_scoped_id` en columna separada
- `conversations`, `messages`, `message_events`, `media`
- `webhook_events` — bitácora, RLS activo y cero políticas: deniega todo
- `private.meta_credentials` — tokens cifrados, esquema no publicado por la API

Reglas transversales del 02 §7 que es fácil incumplir sin darse cuenta:

1. **Nunca `enum`.** `text` con `check` o dominio. Meta añade valores sin avisar y un
   `enum` convierte un tipo desconocido en un `insert` fallido que tumba el lote entero.
2. **Los timestamps de Meta vienen en milisegundos.** Se guarda el entero verbatim y la
   marca temporal se deriva, para que el error de segundos contra milisegundos no se pueda
   cometer en silencio.
3. **Idempotencia por constraint, no por comprobación previa.**

### Lo que este documento sí aporta al modelo

**Tensión entre particionado e idempotencia.** Una tabla particionada por rango exige que
la clave de partición esté dentro de todo índice único, así que la clave de idempotencia
tendría que incluir `created_at` y dejaría de garantizar nada. Tampoco sirve una tabla de
deduplicación con caducidad, porque los borrados y ediciones llegan con el mismo `mid`
meses después y hay que localizar la fila original para actualizarla.

**Decisión:** en v1 `messages` no se particiona. Si el volumen lo exige, la salida es
archivar conversaciones cerradas a una tabla fría, no particionar la caliente.

---

## 5. Realtime

`02` §5.2 lo fija y conviene repetirlo porque es contraintuitivo: **Broadcast desde un
trigger de la base de datos, no `postgres_changes` con filtro.**

`postgres_changes` evalúa las políticas RLS por suscriptor y por cambio, y una bandeja
compartida multi-tenant con muchos agentes conectados es exactamente el patrón que lo
castiga. El trigger emite al canal `org:{organization_id}` y la autorización del canal se
resuelve una vez, al suscribirse.

---

## 6. El panel interno y el break-glass

Decisión de Gabriel: el panel ve **metadatos siempre, contenido nunca por defecto**. Esta
sección no está en el 02.

```sql
create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol     text not null default 'soporte'
);

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
create or replace function private.org_ids_con_grant()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select organization_id
    from public.access_grants
   where user_id = (select auth.uid())
     and expira_en > now();
$$;

revoke execute on function private.org_ids_con_grant() from public, anon;

create policy messages_staff_breakglass on public.messages
  for select to authenticated
  using (organization_id in (select private.org_ids_con_grant()));
```

**Corregido el 2-ago.** La primera versión usaba un `exists` correlacionado contra
`access_grants`, que se evalúa una vez por fila de `messages` y además anida la RLS de
`access_grants` dentro de la de `messages`. Violaba la regla de rendimiento de la propia
sección 5. La forma con `in (select ...)` se evalúa una sola vez como InitPlan.

### Dos reglas que la primera versión se saltó

1. **La membresía no lleva la política uniforme.** Con `for all`, un `agente` ejecuta
   `update organization_members set rol = 'propietario' where user_id = auth.uid()` y
   escala privilegios dentro de su propio tenant. La escritura sobre membresías queda
   reservada a `propietario`; la lectura sigue el patrón común.
2. **`messages` y `agent_runs` son de solo lectura para `authenticated`.** Escribir pasa
   por la ruta de servidor que calcula la ventana de 24 h y llama al Send API. Un
   registro de auditoría que puede escribir el auditado no es auditoría.

### Claves foráneas compuestas

Tres agentes lo encontraron por separado, así que va aquí y no en una nota al pie: las
claves foráneas simples permiten que un `message` de la organización A apunte a una
`conversation` de la B. **RLS no lo impide**, porque cada fila cumple su propia política
y porque las comprobaciones de integridad referencial de Postgres saltan RLS.

La salida es declarar las claves foráneas sobre `(organization_id, id)` en `contacts`,
`conversations`, `messages` y `agent_runs`, con la clave única correspondiente en el
padre. Aplica también al esquema del `02` §7, que usa claves simples.

Sin grant, el panel ve volúmenes, estados, latencias, salud de canal y colas atascadas.
Todo agregado, sin texto de mensajes. Abrir un grant exige motivo escrito, caduca solo, y
queda registrado para siempre.

El panel además opera el **kill-switch por canal y por tenant** de `channels`, y muestra
el estado de las conexiones según la máquina de estados de `02` §5.4: `conectado`,
`degradado`, `desconectado`, `suspendido`. La alerta va primero a Boosty, no al cliente:
el cliente se entera por su agencia, no por un producto que dejó de responder.

---

## 7. Correo

`support@kavea.ai` con Resend. **Verificado y operativo el 2 de agosto de 2026**: DKIM,
subdominio de envío y MX de entrada `inbound-smtp.us-east-1.amazonaws.com` publicados, y
prueba de extremo a extremo con un mensaje recibido y listado por la API.

Resend almacena los entrantes aunque no haya webhook configurado, así que la dirección
publicada en las páginas legales ya no es un riesgo para el App Review.

Cuando exista la bandeja, se apunta el webhook de Resend al receptor y el correo entra
como cuarto canal. Email como canal está **fuera del alcance de v1** por decisión del
`00` §4. Tener buzón no es construir el canal.

Pendiente menor: no hay SPF en la raíz del dominio. No bloquea nada hoy porque Resend usa
`send.kavea.ai` como ruta de retorno y el DMARC está en `p=quarantine` con alineación
relajada, de modo que pasa por DKIM.

---

## 8. Orden de construcción

| # | Bloque | Termina cuando |
|---|---|---|
| 0 | Cimientos: esquema del `02` §7, RLS, auth, middleware de subdominio | `boosty.kavea.ai` abre sesión y no ve datos de otra organización |
| 1 | Ingesta: Worker, Queues, cron de reconciliación | Meta entrega un evento, se valida la firma y se encola con 200 en menos de 5 s |
| 2 | Normalizador e idempotencia | El mismo evento entregado tres veces produce una sola fila |
| 3 | Bandeja de solo lectura | Se ven conversaciones reales llegando en vivo |
| 4 | Envío y ventana de 24 h | Se responde desde la bandeja y el compositor se bloquea fuera de ventana |
| 5 | Módulo de configuración | Un canal se conecta desde la interfaz, sin tocar la base |
| 6 | Agentes en modo copiloto | El agente propone, una persona aprueba, queda en `agent_runs` |
| 7 | Multi-tenant productivo | Entra el primer cliente, un mes después del dogfooding |

Los bloques 1 y 2 van antes que el 3: no hay bandeja sin ingesta. El detalle de cada uno
está en `docs/fases/`.

**Atajo:** los bloques 0 a 3 se validan con el número de prueba que Meta da gratis en
modo desarrollo. Mensajes reales entrando en días.

---

## 9. Lo que no se hace todavía

- **Registro self-service.** El onboarding usa Embedded Signup, bloqueado hasta que Meta
  apruebe Tech Provider, y la regla de dogfooding impide clientes durante un mes.
- **Facturación.** Bloque 7.
- **Comentarios de Instagram.** Otro modelo de datos y otra ronda de App Review.
- **Email como canal.** Ver sección 7.
