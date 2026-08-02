# Fase 2 — Normalización y persistencia

**Fecha:** 2 de agosto de 2026
**Estado:** plan cerrado, sin código escrito
**Depende de:** `03-invariantes-meta.md` (normativo), `02-conexion-instagram-facebook.md` §5 y §7,
`06-arquitectura-plataforma.md` §1.1
**Revisión:** reescrito el 2 de agosto de 2026 sobre Supabase Edge Functions y Postgres

> **Precedencia.** Este plan obedece al `03` por encima de todo, y al `02` §7 en cuanto a modelo de
> datos y RLS. En materia de plataforma manda la decisión de Gabriel del 2 de agosto, que **anula el
> `02` §5.3** y **corrige el `06` §1.1**: la cola es una tabla de Postgres, el normalizador es una
> Supabase Edge Function, los crones son `pg_cron` con `pg_net` y el amortiguador de emergencia del
> receptor es Netlify Blobs.

> **Sobre la numeración.** Bloque 2 del orden de construcción: *normalizador e idempotencia*.
> No es la "Fase 2 — Orchestra" de `00-documento-base.md` §9, que es la bandeja.

### Nota de revisión: qué cambia y por qué

Este documento ha tenido varias versiones. La primera puso la cola en una tabla de Postgres
reclamada con `for update skip locked`. La segunda la movió a Cloudflare Queues, siguiendo el `02`
§5.3. Gabriel revirtió la ingesta a Postgres y fijó Supabase como sitio de toda función de borde.

Esta versión **recupera el mecanismo de la primera y conserva las mejoras de la segunda**. Vuelven
el retroceso exponencial calculado en la base, la cola de fallidos como estado de tabla y el
recuperador de bloqueos huérfanos. Se conservan intactos los adaptadores puros, el aplicador como
único escritor, la unidad transaccional por actualización, el gate de efectos secundarios, la tabla
de claves derivadas, la lápida diferida, la regla de que ningún echo dispara al agente, el avance
monótono de `last_incoming_at`, la allowlist de host, SafeFetch, las claves foráneas compuestas y el
enrutado de WhatsApp con dos tipos de fila.

Desaparece todo lo de Cloudflare Queues: `ack()` y `retry()`, `message.attempts`, `max_retries`, la
DLQ como cola, `meta_raw` y `meta_raw_dlq`, el tope de 128 KB por mensaje y la pregunta abierta sobre
el tamaño del cuerpo, que deja de aplicar porque una fila de Postgres no tiene ese techo.

**Límites de plataforma verificados, que no se vuelven a discutir:**

| Recurso | Límite |
|---|---|
| Edge Function, duración total | 400 s en plan de pago, 150 s en gratuito |
| Edge Function, **CPU por petición** | **2 s**, sin contar operaciones asíncronas |
| Edge Function, memoria | 256 MB |
| `pg_cron` | Granularidad de minuto, sintaxis cron estándar |
| `pg_net` | Llamada HTTPS asíncrona desde la base, encolada y enviada por un worker de fondo |

**El límite que gobierna el diseño de esta fase es el de CPU, no el de duración.** Los 400 segundos
son de reloj y esperar a Postgres no los consume; los 2 segundos son de cómputo, y parsear un cuerpo
con 1000 updates y construir sus efectos es cómputo puro. De ahí sale el troceado de la tarea 3, que
es la diferencia estructural más grande respecto a todas las versiones anteriores de este plan.

---

## 1. Objetivo

Convertir los cuerpos crudos que la cola de `webhook_events` entrega en filas correctas de
`messages`, `message_events`, `media`, `conversations`, `contacts` y `contact_identities`, en el
tenant correcto, sin duplicados, sin perder eventos y sin lanzar excepciones que tumben un cuerpo
entero.

Cuatro afirmaciones que resumen lo que la fase garantiza:

1. **El mismo evento entregado N veces produce una sola fila y un solo efecto secundario.** No
   basta con que el `insert` no duplique: si el `insert` no ocurrió, tampoco ocurre el Broadcast
   a la bandeja, ni el disparo del agente, ni el avance de los contadores.
2. **Ningún dato se escribe antes de saber de qué organización es.** El normalizador escribe con
   rol de servicio y salta RLS por diseño. La frontera entre tenants en el plano de escritura es
   la clave primaria de `meta_asset_routes`, no RLS.
3. **Nada de lo que llega por un webhook puede reventar el proceso.** Un tipo de adjunto
   desconocido, una clave raíz nueva, un `entry[].id` que no resuelve: todo tiene salida
   registrada y el resto del cuerpo sigue.
4. **El normalizador tolera eventos que llegan con horas de retraso y fuera de orden.** El
   amortiguador de Netlify Blobs de la fase 1 no es una cola: cuando Postgres no está, el receptor
   vuelca el cuerpo crudo en Blobs y un drenaje lo recoge después. Un mensaje puede entrar en
   `webhook_events` tres horas tarde y detrás de eventos posteriores suyos. El diseño ya lo
   aguantaba —la clave de idempotencia lleva el timestamp del evento, no el de recepción, y la
   ventana avanza con `greatest`— y el drenaje convierte eso de precaución en camino habitual.

Lo que esta fase **no** hace: no consulta la Graph API (ni perfiles, ni Conversations API), no
envía mensajes, no descarga media, no construye interfaz. Esa ausencia es deliberada: el bloque
2 se completa y se prueba entero con Standard Access, sin App Review y sin tocar los límites de
tasa.

---

## 2. Precondiciones

Bloqueantes. Si alguna no se cumple, la fase no arranca.

| # | Precondición | Cómo se comprueba |
|---|---|---|
| P1 | Esquema del `02` §7 aplicado en Supabase, con RLS activo en todas las tablas y `webhook_events` con RLS y cero políticas | Un usuario `authenticated` de la org A no lee filas de la org B; nadie lee `webhook_events` por PostgREST |
| P2 | Receptor de la fase 1 desplegado como Edge Function: lee el cuerpo crudo, valida HMAC-SHA256 en tiempo constante, encola en `webhook_events` y devuelve 200 en menos de 5 s | Hay filas reales con `estado = 'pendiente'` |
| P3 | Columnas de cola sobre `webhook_events` aplicadas: `estado`, `disponible_en`, `reclamado_en`, `reclamado_por`, `rescates`, `cursor_update`, `updates_total`, `origen`, `blob_key`, `encolado_en` | Las trae la fase 1; si no, las trae la tarea 1 de esta fase. Ver §2.1 |
| P4 | Camino de Blobs operativo: el receptor vuelca a Blobs cuando Postgres falla y el drenaje inserta esos cuerpos en `webhook_events` con `origen = 'blobs'` | Apagar Postgres, mandar tres mensajes, ver tres 200 y las tres filas al volver |
| P5 | `pg_cron` y `pg_net` habilitados en el proyecto, y el secreto de invocación del normalizador guardado en Vault y legible solo por el rol de servicio | `cron.schedule` acepta un trabajo y `net.http_post` sale de la base |
| P6 | Cadena de Supavisor en **modo transacción** disponible para las Edge Functions, con tamaño de pool acordado | El normalizador abre conexión y ejecuta el reclamo |
| P7 | Al menos una fila real en `meta_connections` y sus filas correspondientes en `meta_asset_routes` (Página de Boosty y cuenta de Instagram vinculada) | La resolución de un `entry[].id` real devuelve una organización |
| P8 | Corpus de payloads reales capturado y guardado como ficheros para el arnés de pruebas, **con el peor caso de tamaño incluido** | Existe `tests/payloads/` con al menos un ejemplar de cada forma de la §7 del `02` |
| P9 | `GRAPH_API_VERSION=v26.0` como variable única | Aunque esta fase no llama a Graph, el arnés no introduce la primera excepción |

Sobre P8: es la parte de la fase que no se acelera escribiendo código. Cada payload que no se
tenga capturado es una rama del parser escrita a ciegas, y sin el peor caso de tamaño no se puede
calibrar el troceado de la tarea 3.

### 2.1 Dos documentos que esta fase contradice, y hay que corregir en origen

**Resuelto el 2-ago-2026.** `01-fase-ingesta.md` se rehízo en paralelo y ya está sobre la misma
arquitectura: receptor en Supabase Edge Function, cola en `webhook_events`, amortiguador en
Netlify Blobs y crones con `pg_cron`. Los seis contratos C1–C6 de la sección 8 siguen siendo
la referencia para verificar que ambos documentos encajan.

**`06-arquitectura-plataforma.md` §1.1 también queda desfasado.** Su tabla de decisiones sitúa la
ingesta, la cola y los crones en Netlify Functions y Scheduled Functions, y el amortiguador en
Netlify Blobs. La decisión vigente conserva Blobs como amortiguador y mueve todo lo demás: el
receptor y el normalizador son Supabase Edge Functions y los crones son `pg_cron` con `pg_net`.
Cloudflare sale de la arquitectura por completo, incluida la media saliente, que pasa a Supabase
Storage. El `06` necesita su propia corrección; se anota en la §8 de este documento y no se
contradice en silencio, que es el error que ya costó una ronda.

Lo que esta fase necesita que la fase 1 fije, y que se da por supuesto aquí:

| # | Contrato con la fase 1 | Supuesto de esta fase |
|---|---|---|
| C1 | Quién aplica las columnas de cola sobre `webhook_events` | Las aplica la fase 1, porque su receptor las escribe. Si no llega, la tarea 1 las trae |
| C2 | El receptor **nunca** inserta una fila con `firma_ok = false` | Un cuerpo con firma inválida no llega a Postgres. El contador de rechazos se incrementa en la tabla de métricas, sin cuerpo |
| C3 | El receptor encola y despacha en **un solo viaje** a Postgres, con el amortiguador de la tarea 3 | Es lo que hace que el mensaje llegue a la bandeja en segundos y no en el siguiente minuto de cron |
| C4 | Si el despacho falla, el receptor devuelve 200 igual | La red de seguridad es el cron, no el receptor |
| C5 | El drenaje de Blobs inserta con `origen = 'blobs'`, `blob_key` puesta y `recibido_en` recuperado del nombre del objeto, no `now()` | Sin eso, el retraso de drenaje no se puede medir y el orden por recepción miente |
| C6 | El drenaje es idempotente por `blob_key` | Un drenaje que muere entre el `insert` y el borrado del objeto no puede duplicar el cuerpo |

Si la fase 1 rehecha decide otra cosa en cualquiera de los seis puntos, gana la fase 1 y esta
sección se corrige. Lo que no puede quedar es la contradicción en silencio.

### 2.2 Qué cubre de verdad el amortiguador de Blobs, dicho sin adornos

El receptor y la base viven ahora en el mismo proveedor. Conviene ser exacto sobre qué fallo
absorbe Blobs y cuál no:

- **Postgres no disponible y las Edge Functions vivas** —migración larga, pool agotado, ventana de
  mantenimiento, tormenta de bloqueos— es el fallo frecuente y es el que Blobs cubre entero. El
  receptor responde 200, el cuerpo va a Blobs, el drenaje lo recoge y esta fase lo procesa con retraso.
- **El proyecto entero caído** deja también sin servicio al receptor. Meta empieza a acumular
  entregas fallidas y a la hora desuscribe la Página. Contra eso no hay mitigación dentro de esta
  arquitectura.

**Por qué el amortiguador no puede ser Supabase Storage**, que sería lo coherente con "todo en
Supabase": los metadatos de Storage viven en `storage.objects`, una tabla del mismo Postgres. Un
almacén cuyo índice está dentro de la base no es respaldo de nada cuando la base es justamente lo
que falta. Netlify Blobs es del otro proveedor que queda en la arquitectura y no comparte plano de
fallo con Supabase, que es la única propiedad que se le pide.

Límites de Blobs, verificados: objeto hasta 5 GB —un cuerpo de webhook está seis órdenes de magnitud
por debajo—, metadata hasta 2 KB, clave hasta 600 bytes y **consistencia eventual por defecto**. La
consistencia hay que pedirla explícitamente en la escritura del receptor; el listado es lo que no la
tiene, y de ahí sale la regla de la tarea 6 de que un listado vacío no autoriza a dar el drenaje por
terminado.

Lo que esta fase tiene que asumir es solo la consecuencia: **el camino de Blobs va a dispararse de
verdad, y sus eventos llegan tarde y desordenados.** La tarea 6 se ocupa.

---

## 3. Entregables

1. **Normalizador**: Supabase Edge Function que reclama filas de `webhook_events` con
   `for update skip locked`, las procesa por tramos dentro del presupuesto de CPU y las cierra, las
   cede o las devuelve a la cola con retroceso.
2. **Despachador amortiguado**: función de base que encola la llamada HTTPS al normalizador con
   `pg_net`, con un techo de disparos por segundo.
3. **Crones de `pg_cron`**: red de seguridad del normalizador, recuperador de huérfanos, barrido de
   cuarentena y purga de la bitácora.
4. **Recuperador de bloqueos huérfanos**, con tope de rescates.
5. **Resolutor de tenant**: `asset_id` contra `meta_asset_routes`, sin caché, con cuarentena cuando
   no resuelve.
6. **Adaptadores por canal**: funciones puras `payload → Efecto[]`, una por formato, sin acceso
   a base de datos ni a red.
7. **RPC de ingestión** en Postgres, troceado, con subtransacción por efecto. Es donde vive la
   unidad transaccional.
8. **Migración aditiva** sobre el esquema del `02` §7, incluidos los cuatro estados de conversación
   y la corrección del índice único parcial (tarea 1).
9. **Barrera de tenant en el esquema**: claves foráneas compuestas (§7).
10. **Modelo canónico** documentado y tipado (§5), con su tabla de mapeo por canal (§6).
11. **Validador de allowlist de host** y **SafeFetch**, con cero llamantes en esta fase.
12. **Resolución de conversaciones y contactos** sin duplicados, en función de base de datos.
13. **Operación de fusión de contactos** manual, auditada y reversible.
14. **Métricas de ingesta** y alertas, en una tabla de la base.
15. **Batería de pruebas** de la §9, con las mediciones de calibración de la §9.1.
16. **Política de retención** de `webhook_events` y de la tabla de cuarentena.

---

## 4. Tareas

### Tarea 1 — Delta de esquema sobre el documento 02 §7

El esquema del `02` §7 es el correcto y cubre casi todo: `messages` ya lleva `app_id`,
`metadata`, `send_api_message_id`, `llego_por_standby`, `is_unsupported`, `deleted_at`,
`meta_timestamp_ms` con `meta_timestamp` derivada y `raw`; `message_events` ya lleva
`clave_dedupe` calculada por la base de datos; `media` ya separa `meta_cdn` de `kavea_r2` con un
`CHECK`; `conversations` ya lleva `en_standby` y `thread_owner_app_id`. Lo que falta es poco y es
aditivo.

```sql
-- messages
alter table public.messages
  add column emisor text not null default 'contacto'
    check (emisor in ('contacto', 'humano', 'agente')),
  add column edited_at timestamptz;

-- message_events
alter table public.message_events
  add column llego_por_standby boolean not null default false,
  add column aplicado_en       timestamptz;   -- lápida diferida: ver tarea 11

create index message_events_pendientes_idx
  on public.message_events (organization_id, canal, target_mid)
  where tipo in ('delete', 'edit') and aplicado_en is null;
```

`emisor` no está en el `02` §7.5 y hace falta: es lo que distingue en la bandeja una respuesta
del agente de IA de una que escribió un humano del cliente desde el móvil. Se deriva del `app_id`
del echo y de la correlación con los envíos propios (tarea 12).

`aplicado_en` es lo que permite que un borrado que llega antes que su mensaje no se pierda ni
obligue a insertar una fila fantasma (tarea 11). Con el drenaje de Blobs por delante, ese caso deja de
ser raro.

#### Cuatro estados de conversación, y el índice que hay que corregir

Decisión de Gabriel del 2 de agosto: los estados son `nueva`, `en_curso`, `esperando` y `cerrada`,
no los tres del `02` §7.4. El defecto del índice lo encontró el plan de la fase 3 y es de esta
fase, no de aquella: **el normalizador es el primer escritor de `conversations` y el índice es lo
único que impide que tres fotos en paralelo creen tres conversaciones.** Con el predicado
`where status = 'open'`, una conversación en `esperando` queda sin protección y el patrón
"buscar o crear" duplica al lado de la que ya existe.

La migración va aquí. La fase 3 conserva el resto de su delta —`no_leidos`, `preview_texto`,
colores, etiquetas— y no vuelve a tocar ni el `check` ni el índice.

```sql
alter table public.conversations rename column status to estado;

alter table public.conversations
  drop constraint conversations_status_check;

-- Correspondencia, por si el esquema del 02 ya está desplegado con filas.
update public.conversations
   set estado = case estado
                  when 'open'    then 'nueva'
                  when 'pending' then 'esperando'
                  when 'closed'  then 'cerrada'
                  else estado
                end;

alter table public.conversations
  alter column estado set default 'nueva',
  add constraint conversations_estado_check
    check (estado in ('nueva', 'en_curso', 'esperando', 'cerrada'));

-- El predicado correcto es el complemento de cerrada, no la igualdad con un estado.
drop index public.conversations_abierta_unica;

create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where estado <> 'cerrada';

drop index public.conversations_bandeja_idx;

create index conversations_bandeja_idx
  on public.conversations (organization_id, channel_id, estado, last_message_at desc);
```

Consecuencia que hay que aceptar con los ojos abiertos: **cerrar es definitivo.** Ese índice hace
que una conversación cerrada no se pueda reabrir; si el contacto vuelve a escribir, el normalizador
crea una conversación nueva. Es correcto y es la única forma de que el "buscar o crear" sea seguro
bajo webhooks paralelos. La consecuencia de interfaz —mostrar las conversaciones anteriores del
contacto— la resuelve la fase 3.

#### Columnas de cola sobre `webhook_events`

Las escribe el receptor de la fase 1, así que la migración le corresponde a ella (C1). Se
reproducen aquí porque son el mecanismo de las tareas 2 a 6 y porque si la fase 1 no las trae, las
trae esta.

```sql
alter table public.webhook_events
  add column estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'hecho', 'fallido')),
  add column disponible_en timestamptz not null default now(),
  add column reclamado_en  timestamptz,
  add column reclamado_por text,
  add column rescates      smallint    not null default 0,

  -- Troceado por presupuesto de CPU. Ver tarea 3.
  add column cursor_update int not null default 0,
  add column updates_total int,

  add column origen text not null default 'directo'
    check (origen in ('directo', 'blobs')),
  add column blob_key      text,
  add column encolado_en timestamptz not null default now();

-- El índice del 02 §7.6 ordena por recibido_en y filtra por procesado_en.
-- El reclamo necesita ordenar por disponible_en, que es lo que mueve el retroceso.
drop index public.webhook_events_pendientes_idx;

create index webhook_events_reclamo_idx
  on public.webhook_events (disponible_en, id)
  where estado = 'pendiente';

create index webhook_events_procesando_idx
  on public.webhook_events (reclamado_en)
  where estado = 'procesando';

create index webhook_events_fallidos_idx
  on public.webhook_events (recibido_en)
  where estado = 'fallido';

-- Idempotencia del drenaje de Blobs: un blob se inserta una vez.
create unique index webhook_events_r2_key_idx
  on public.webhook_events (blob_key)
  where blob_key is not null;

-- La tabla recibe varios UPDATE por fila y tocan columnas indexadas, así que
-- ninguno puede ser HOT. Sin esto, el índice de reclamo se hincha.
alter table public.webhook_events set (
  fillfactor = 85,
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
```

`recibido_en` es cuándo el receptor recibió el cuerpo. `encolado_en` es cuándo la fila entró en la
cola. En el camino directo coinciden; en el de Blobs, la diferencia es el retraso del drenaje y es la
métrica que dice cuánto tiempo estuvo la base sin servicio.

**Fusión de contactos**, tabla nueva:

```sql
create table public.contact_merges (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  superviviente_id uuid not null references public.contacts(id) on delete cascade,
  absorbido_id     uuid not null,          -- sin FK: la fila absorbida desaparece
  identidades      jsonb not null,         -- estado previo, para deshacer
  conversaciones   jsonb not null,
  motivo           text not null,
  actor_user_id    uuid references auth.users(id),
  deshecho_en      timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.contact_merges enable row level security;
```

**Cuarentena**, tabla nueva. Es donde acaba lo que no se puede enrutar ni procesar y no se puede
tirar. Guarda **sub-payloads**, no cuerpos: la granularidad de la cuarentena es la actualización, la
del estado `fallido` de `webhook_events` es el cuerpo entero.

```sql
create table public.webhook_cuarentena (
  id               bigserial primary key,
  webhook_event_id bigint references public.webhook_events(id) on delete set null,
  recibido_en      timestamptz not null default now(),
  motivo           text not null,   -- tenant_no_resuelto | permanente
  asset_id         text,            -- entry[].id o phone_number_id, si se pudo extraer
  sub_payload      jsonb not null,  -- solo la actualización afectada, no el cuerpo entero
  error            text,
  intentos         smallint not null default 0,
  resuelto_en      timestamptz,
  resuelto_como    text             -- reprocesado | descartado
);

create index webhook_cuarentena_pendientes_idx
  on public.webhook_cuarentena (asset_id)
  where resuelto_en is null;

alter table public.webhook_cuarentena enable row level security;  -- cero políticas
```

No lleva `organization_id` —por definición no se sabe de quién es— y por tanto entra en la misma
categoría que la bitácora: RLS activo, cero políticas, solo la toca el rol de servicio, nunca se
expone por PostgREST.

**Tabla de métricas**, para que el panel interno agregue sin leer contenido, y **tabla de
despacho**, que es el amortiguador de la tarea 3:

```sql
create table public.ingesta_metricas (
  nombre   text   not null,
  etiqueta text   not null default '',
  dia      date   not null default current_date,
  valor    bigint not null default 0,
  primary key (nombre, etiqueta, dia)
);

alter table public.ingesta_metricas enable row level security;  -- cero políticas

create table private.ingesta_despacho (
  id             boolean primary key default true check (id),   -- una sola fila
  ultimo_disparo timestamptz not null default '-infinity'
);

insert into private.ingesta_despacho default values;
```

**Criterio de aceptación.** La migración aplica y revierte limpia sobre el esquema del `02` §7.
`webhook_cuarentena`, `contact_merges` e `ingesta_metricas` devuelven cero filas a cualquier
consulta hecha con el rol `anon` o `authenticated`. Un `insert` de conversación con
`estado = 'open'` falla contra el `check`. Dos conversaciones del mismo contacto y canal, una en
`esperando` y otra en `nueva`, violan el índice único.

---

### Tarea 2 — La cola en Postgres: reclamo con `for update skip locked`

**Qué es un mensaje de cola.** Una fila de `webhook_events` con el cuerpo de webhook completo, tal
como llegó. Puede traer hasta 1000 updates. El receptor no lo parsea más allá de lo necesario para
extraer `entry_ids` y `cuerpo_bytes`, porque su presupuesto no puede depender del número de eventos.

**Qué se gana y qué se pierde respecto a una cola externa.** Se pierde la separación de dominios de
fallo en la recepción, y eso ya está pagado: lo compensa el amortiguador de Blobs, con el alcance
exacto que fija la §2.2. Lo que se gana, y no es menor, es que **el reclamo, el retroceso, el estado
y la escritura de negocio viven en la misma base**. No hay dos sistemas que puedan discrepar sobre
si un mensaje se procesó.

Y hay una asimetría que cambia el diseño de los reintentos: **con la cola en Postgres, "Postgres
está caído" no es un escenario de reintento.** Si la base no responde, el normalizador ni siquiera
puede reclamar; las filas se quedan en `pendiente` y esperan. El retroceso ya no tiene que cubrir
una caída larga de la base, porque durante esa caída no hay intentos que gastar. Cubre otra cosa:
interbloqueos, tiempos de espera de sentencia, contención y errores que un despliegue arregla.

**El reclamo.**

```sql
create or replace function private.reclamar_webhooks(
  p_consumidor text,
  p_limite     int default 3
) returns setof public.webhook_events
language sql
security definer
set search_path = ''
as $$
  update public.webhook_events e
     set estado        = 'procesando',
         reclamado_en  = now(),
         reclamado_por = p_consumidor
   where e.id in (
     select id
       from public.webhook_events
      where estado = 'pendiente'
        and firma_ok                       -- ver abajo: no es decorativo
        and disponible_en <= now()
      order by disponible_en, id
      limit p_limite
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function private.reclamar_webhooks(text, int) from public, anon, authenticated;
```

`skip locked` es lo que permite N normalizadores en paralelo sin que ninguno espere al otro y sin
que dos reclamen la misma fila. Sin él, el segundo se bloquea detrás del primero y la concurrencia
es decorativa.

**El reclamo no incrementa `intentos`.** Un reclamo no es un intento fallido: una fila puede ser
reclamada tres veces por troceado de CPU sin que nada haya salido mal. `intentos` lo incrementa
solo el cierre con error (tarea 4). Confundir las dos cosas gastaría el presupuesto de reintentos
en cuerpos grandes y sanos, que es justo lo contrario de lo que se quiere.

**Por qué el reclamo filtra `firma_ok`, y por qué eso es un hallazgo recuperado.** La primera
versión de este plan señaló que la consulta de reclamo no lo filtraba; la segunda lo marcó como
obsoleto porque con Queues no había consulta de reclamo. Vuelve a aplicar. El contrato C2 dice que
el receptor nunca inserta una fila con firma inválida, así que hoy el predicado no descarta nada.
Se escribe igual, por dos razones: cuesta cero —el índice parcial ya restringe a `pendiente`— y el
día que alguien decida guardar cuerpos rechazados para forense, el normalizador no procesará
contenido no autenticado por olvido. Un predicado que hoy es tautología y mañana es la única
defensa se escribe hoy.

**Orden.** `order by disponible_en, id` da un FIFO aproximado, y aproximado es suficiente: ni Meta
ni el drenaje de Blobs garantizan orden, y el sistema ordena por `meta_timestamp` en la lectura y
avanza la ventana con `greatest`. Pedirle orden estricto a la cola sería pagar por una garantía que
el resto del diseño no usa.

**Tamaño del reclamo.** Empieza en 3 filas, no en 10. El techo es el presupuesto de CPU de la tarea
3, no el reloj: reclamar más filas de las que caben en 2 segundos de cómputo solo alarga la ventana
en la que un proceso muerto deja filas bloqueadas. Se calibra con la medición M2 de la §9.1.

**Cómo se conecta el normalizador.** Conexión directa por **Supavisor en modo transacción**. Las
tres operaciones del ciclo —reclamo, RPC de ingestión, cierre— están envueltas cada una en una
función de base, de modo que cada viaje es una sentencia y el modo transacción las admite sin
reservas. Esa envoltura no es adorno: es lo que hace que el mecanismo no dependa de mantener una
sesión abierta, que es exactamente lo que un pooler en modo transacción no garantiza.

**Por qué el reclamo y el proceso no van en la misma transacción.** La alternativa es tomar el
bloqueo de fila y mantenerlo abierto durante todo el procesamiento: si el proceso muere, el bloqueo
se libera solo y no hace falta recuperador de huérfanos. Se descarta por tres razones. Obligaría a
que el cuerpo entero fuera una sola transacción, que es lo que la tarea 9 impide: 1000 updates y uno
roto perderían los 999. Mantendría una transacción abierta durante minutos, con su `xmin` frenando
el vacuum de todas las tablas de negocio. Y sería incompatible con el troceado por CPU, porque un
cuerpo que necesita tres invocaciones necesita tres transacciones distintas. Se paga el recuperador
de la tarea 5 a cambio.

**Por qué no un bloqueo consultivo por fila.** `pg_try_advisory_lock` de ámbito de sesión muere con
la conexión y haría innecesario el recuperador. No está disponible: con Supavisor en modo
transacción la conexión física se comparte entre clientes y un bloqueo de sesión queda huérfano en
un backend ajeno. El modo sesión lo resolvería a cambio de topar el número de normalizadores
concurrentes al tamaño del pool. Se descarta.

**Criterio de aceptación.** Diez normalizadores reclamando a la vez sobre una cola de 500 filas
procesan las 500 exactamente una vez, sin esperas mutuas medibles y sin ninguna fila reclamada por
dos. Un `explain` del reclamo usa `webhook_events_reclamo_idx` y no toca la tabla completa con un
millón de filas en `hecho`.

---

### Tarea 3 — El normalizador: presupuesto de CPU, troceado y despacho

Esta es la tarea que más cambia respecto a todas las versiones anteriores del plan, y el motivo es
un solo número: **2 segundos de CPU por invocación**.

#### Por qué el límite de CPU manda y el de reloj no

Los 400 segundos de duración son de reloj y no se consumen esperando a Postgres. Los 2 segundos son
de cómputo, y el trabajo del normalizador es cómputo casi puro: parsear el cuerpo, recorrer
`entry[]`, ejecutar el adaptador de cada actualización y construir los efectos. Esperar no ayuda y
dormir tampoco: **la única salida es partir el trabajo.**

Tres costes se reparten ese presupuesto, y conviene distinguirlos porque escalan con cosas
distintas:

| Coste | Escala con | Se paga |
|---|---|---|
| Parseo del cuerpo a objetos | Bytes del cuerpo | Una vez por invocación, íntegro, aunque solo se procese un tramo |
| Adaptación | Número de actualizaciones del tramo | Por tramo |
| Serialización de los efectos para el RPC | Número de efectos del tramo | Por tramo |

El parseo es el que duele: **se vuelve a pagar entero en cada reanudación.** Un cuerpo que necesita
cuatro invocaciones se parsea cuatro veces. Por eso el tramo se hace tan grande como el presupuesto
permita, y por eso la medición M1 de la §9.1 mide el parseo por separado y no dentro del total: si
el parseo del peor cuerpo real consume una fracción grande de los 2 segundos, el troceado deja de
ser viable y la salida es que el receptor parta los cuerpos grandes al encolar, lo que es un cambio
en la fase 1 y hay que saberlo pronto.

La memoria de 256 MB es el otro techo del mismo problema. Un cuerpo grande parseado a objetos ocupa
varias veces su tamaño en bytes. La medición M3 fija el `cuerpo_bytes` máximo que cabe.

#### El cursor: cómo se reanuda un cuerpo a medias

`webhook_events.cursor_update` cuenta cuántas actualizaciones de ese cuerpo se han aplicado ya.
`updates_total` se rellena en el primer parseo y sirve para saber si el cuerpo terminó y para las
métricas.

El cursor se define sobre un **aplanado determinista** del cuerpo:

```
para cada entry en entry[]        (en orden del array)
    para cada m en entry.messaging[]   (en orden)
    para cada s en entry.standby[]     (en orden)
    para cada c in entry.changes[]     (en orden)
```

**El orden del aplanado es parte del contrato y no se puede cambiar sin invalidar los cursores en
vuelo.** Cambiarlo entre despliegues haría que una reanudación saltara actualizaciones. Que
`cuerpo` sea `jsonb` no estorba: `jsonb` normaliza el orden de las claves de objeto, que el cursor
no usa, y **preserva el orden de los arrays**, que es lo único de lo que el cursor depende.

Regla de oro, y es la que hace que esto sea seguro: **el cursor avanza después de que el tramo se
haya confirmado, nunca antes.** Si el proceso muere a mitad de un tramo, el cursor apunta a antes de
ese tramo y el tramo se repite. Repetir es gratis —cada efecto vuelve como `duplicado` por la clave
de idempotencia de la tarea 10— y perder no lo es. Toda la tolerancia de este mecanismo se apoya en
que la idempotencia sea real, que es lo que la tarea 10 garantiza y las pruebas 1 y 11 comprueban.

#### Ciclo del normalizador

```
al arrancar:
    marcar t0 y presupuesto de CPU = 2 s, con margen de seguridad al 70 %

mientras quede presupuesto:
    reclamar hasta 3 filas
    si no reclama ninguna → salir

    por cada fila:
        parsear el cuerpo            ← coste fijo, se mide y se descuenta
        si updates_total es null → calcularlo y guardarlo
        desde cursor_update, por tramos:
            adaptar el tramo → Efecto[]
            trocear los efectos en grupos de 64 y llamar a ingerir_lote por grupo
            avanzar cursor_update en la misma llamada que confirma el último grupo
            si el presupuesto consumido supera el margen:
                ceder la fila (vuelve a 'pendiente', disponible ya, sin gastar intento)
                salir del bucle de la fila
        si se llegó a updates_total → cerrar la fila como 'hecho'

al terminar:
    si quedan filas pendientes disponibles → despachar un sucesor
```

**Margen al 70 %.** Se cede la fila al llegar a 1,4 segundos de cómputo, no a 2. Los 600 ms de
margen cubren el error del proxy de medición y el coste de cerrar. Agotar la CPU de verdad hace que
la plataforma corte la invocación, y una invocación cortada deja la fila en `procesando` hasta que
el recuperador de la tarea 5 la rescate diez minutos después: se pierde latencia, no datos, pero se
pierde por nada.

**Cómo se mide el consumo de CPU desde dentro.** No hay API de tiempo de CPU en el entorno de
ejecución. Se usan dos frenos a la vez y salta el primero que llegue:

1. **Un tope de actualizaciones por invocación**, calibrado con la medición M2. Es determinista y no
   depende de ningún proxy. Es el freno principal.
2. **Un reloj sobre la sección síncrona**, medido con `performance.now()` alrededor del bucle de
   adaptación, que no contiene esperas. Sin `await` dentro, reloj y CPU coinciden con buena
   aproximación. Es el freno de respaldo, y el que cubre el caso de un cuerpo con actualizaciones
   patológicamente caras.

**Ceder no es fallar.** Una fila cedida vuelve a `pendiente` con `disponible_en = now()`, el cursor
avanzado, `reclamado_en` a nulo y **sin tocar `intentos`**. Cualquier normalizador la retoma, no
necesariamente el mismo.

```sql
create or replace function private.ceder_webhook(
  p_id     bigint,
  p_cursor int,
  p_total  int default null
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_events
     set estado        = 'pendiente',
         cursor_update = greatest(cursor_update, p_cursor),
         updates_total = coalesce(updates_total, p_total),
         reclamado_en  = null,
         reclamado_por = null,
         disponible_en = now()
   where id = p_id;
$$;
```

`greatest` en el cursor y `coalesce` en el total hacen la cesión idempotente: dos cesiones de la
misma fila no pueden retroceder el progreso.

#### Despacho: quién invoca al normalizador

Tres caminos, y los tres hacen falta:

| Camino | Quién lo dispara | Para qué |
|---|---|---|
| Encolado del receptor | El receptor, en el mismo viaje del `insert` | Que el mensaje llegue a la bandeja en segundos |
| Red de seguridad | `pg_cron`, cada minuto | Recoge lo que quedó atrás: despacho fallido, fila devuelta por retroceso, fila drenada desde Blobs |
| Sucesor | El propio normalizador al terminar, si quedan pendientes | Drena una acumulación a velocidad de proceso, no a velocidad de cron |

La llamada HTTPS la hace `pg_net`, que encola la petición y la envía desde un worker de fondo: la
sentencia devuelve de inmediato y no bloquea a quien la ejecutó. Eso es exactamente la invocación
sin esperar respuesta que hace falta, y sale gratis por estar dentro de la base.

**El receptor encola y despacha en un solo viaje.** Una sola función hace el `insert` y, si procede,
el `net.http_post`. Si Postgres no responde, fallan las dos cosas a la vez y el receptor se va por
el camino de Blobs, que es el comportamiento correcto: no existe el estado intermedio "encolado pero
sin despachar por un fallo de red distinto".

#### El amortiguador de despacho, que es lo que evita la invocación en tromba

Cincuenta mensajes en un segundo producirían cincuenta invocaciones del normalizador. `skip locked`
las hace **seguras**, pero no las hace **gratis**: cada una abre una conexión del pool de Supavisor,
y el pool es el recurso escaso de toda la arquitectura. La mayoría de esas cincuenta reclamarían
cero filas y terminarían, habiendo pagado la conexión.

El amortiguador es una fila y una sentencia:

```sql
create or replace function private.encolar_webhook(
  p_firma_ok     boolean,
  p_object       text,
  p_cuerpo       jsonb,
  p_cuerpo_bytes integer,
  p_entry_ids    text[]
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      bigint;
  v_disparo boolean;
begin
  insert into public.webhook_events
         (firma_ok, object, cuerpo, cuerpo_bytes, entry_ids)
  values (p_firma_ok, p_object, p_cuerpo, p_cuerpo_bytes, p_entry_ids)
  returning id into v_id;

  -- Solo un despacho cada 2 segundos gana la carrera. El resto no dispara.
  update private.ingesta_despacho
     set ultimo_disparo = now()
   where ultimo_disparo < now() - interval '2 seconds';

  get diagnostics v_disparo = row_count;

  if v_disparo then
    perform private.despachar_normalizador();
  end if;

  return v_id;
end;
$$;
```

`private.despachar_normalizador()` es la envoltura de `net.http_post` contra la URL de la Edge
Function, con el secreto de invocación leído de Vault.

**Dos segundos y no cero.** Es el retardo máximo que el amortiguador añade a un mensaje, y es
irrelevante frente al presupuesto de 5 segundos de recepción a bandeja. A cambio, acota los
despachos del camino del receptor a 30 por minuto pase lo que pase, con independencia del tráfico.
El sucesor encadenado es lo que cubre el hueco: una ráfaga de cincuenta mensajes dispara una
invocación, esa invocación drena lo que puede, ve que quedan pendientes y despacha un sucesor de
inmediato. La cola se drena a velocidad de proceso sin que el receptor tenga que disparar cincuenta
veces.

**Techo de concurrencia.** El amortiguador acota el camino del receptor; el cron añade uno por
minuto; el sucesor añade uno por normalizador que termina con trabajo pendiente. Esa población es
naturalmente acotada y no hace falta un semáforo explícito, que además tendría el problema de
quedarse colgado cuando un proceso muere. Lo que sí hace falta es **observarla**: la métrica es
`count(distinct reclamado_por)` sobre las filas en `procesando`, y la alerta salta al pasar del
umbral acordado con el tamaño del pool de Supavisor. Si esa métrica sube de forma sostenida, el
parámetro que se toca es el intervalo del amortiguador, no el código.

**Por qué el sucesor y no dejarlo al cron.** Un drenaje de Blobs tras una caída de veinte minutos puede
meter miles de filas de golpe. A una invocación por minuto, cada una procesando tres filas, eso son
horas. Con sucesor encadenado se drena en minutos. La cadena no lleva tope: cada invocación engendra
como mucho una, y solo si hay trabajo disponible. Lo que impide el bucle infinito con una fila
envenenada no es un contador de cadena, es el tope de rescates de la tarea 5 y el estado `fallido` de
la tarea 4.

**Criterio de aceptación.** Un webhook recibido produce un mensaje visible en `messages` en menos de
5 segundos p95, medido de `recibido_en` a `created_at`. Un cuerpo con 1000 actualizaciones se
completa aunque necesite varias invocaciones, deja `cursor_update = updates_total`, y reprocesarlo
entero devuelve todos los efectos como `duplicado`. Matar el proceso a mitad de un tramo no pierde
ninguna actualización ni duplica ninguna fila. Cincuenta webhooks en un segundo no producen más de
un despacho del receptor, y las cincuenta filas se procesan igual.

---

### Tarea 4 — Reintentos, retroceso y cola de fallidos

**Clasificación del fallo, que es lo que decide qué se hace con la fila:**

- **Transitorio** — interbloqueo, tiempo de espera de sentencia, conexión cortada, error de
  serialización, contención en el pool. La fila vuelve a `pendiente` con retroceso, conservando su
  cursor: lo ya aplicado no se reprocesa salvo el tramo que falló.
- **Permanente en un update concreto** — payload que no encaja en ninguna forma conocida,
  restricción no resoluble. **No se reintenta el cuerpo entero**: ese update va a
  `webhook_cuarentena` con motivo `permanente`, el cursor avanza por encima de él y el cuerpo sigue.
  Reintentar 1000 updates por uno roto reprocesa los otros 999 sin arreglar nada.
- **`tenant_no_resuelto`** — el `asset_id` no está en `meta_asset_routes`. A cuarentena con ese
  motivo, cursor avanzado, cuerpo cerrado como `hecho` al llegar al final. No se reintenta en bucle:
  reintentar no crea la fila que falta. Un barrido lo reprocesa cuando aparezca la ruta. Es el caso
  real de una organización que autoriza y cuyo primer mensaje llega antes de que el alta termine de
  escribir.
- **Presupuesto de CPU agotado** — no es un fallo. Se cede la fila (tarea 3) y no se gasta intento.
- **Desconocido** — se trata como transitorio y se alerta desde el primer intento.

**Retroceso**, calculado sobre `intentos`, que ahora es una columna de la fila y no un dato de la
plataforma:

| Intento | Espera hasta el siguiente | Acumulado |
|---|---|---|
| 1 | 5 s | 5 s |
| 2 | 30 s | 35 s |
| 3 | 2 min | 2 min 35 s |
| 4 | 10 min | 12 min 35 s |
| 5 | 1 h | 1 h 12 min |
| 6 | 6 h | 7 h 12 min |
| agotado | — | `estado = 'fallido'` |

**Seis intentos y no cinco, con esta forma y no otra.** Los cuatro primeros cubren lo que se arregla
solo: un interbloqueo, un pico de contención, un despliegue de treinta segundos. Los dos últimos
cubren lo que solo arregla una persona: un error del aplicador que hay que corregir y desplegar. Y
el reloj de Meta no entra en la cuenta, porque Meta ya recibió su 200 en el receptor; el techo lo
pone la atención humana, y siete horas es el plazo en el que alguien mira una alerta en un día
laborable.

```sql
create or replace function private.retroceso(p_intentos smallint)
returns interval
language sql immutable
as $$
  select case p_intentos
           when 1 then interval '5 seconds'
           when 2 then interval '30 seconds'
           when 3 then interval '2 minutes'
           when 4 then interval '10 minutes'
           when 5 then interval '1 hour'
           else        interval '6 hours'
         end;
$$;

create or replace function private.cerrar_webhook(
  p_id     bigint,
  p_cursor int  default null,
  p_error  text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intentos smallint;
begin
  if p_error is null then
    update public.webhook_events
       set estado        = 'hecho',
           procesado_en  = now(),
           error         = null,
           cursor_update = coalesce(p_cursor, cursor_update),
           reclamado_en  = null,
           reclamado_por = null
     where id = p_id;
    return 'hecho';
  end if;

  -- El intento se gasta aquí, no en el reclamo.
  update public.webhook_events
     set intentos      = intentos + 1,
         cursor_update = greatest(cursor_update, coalesce(p_cursor, 0))
   where id = p_id
  returning intentos into v_intentos;

  if v_intentos >= 6 then
    update public.webhook_events
       set estado = 'fallido', error = p_error, procesado_en = now(),
           reclamado_en = null, reclamado_por = null
     where id = p_id;
    return 'fallido';
  end if;

  update public.webhook_events
     set estado        = 'pendiente',
         error         = p_error,
         reclamado_en  = null,
         reclamado_por = null,
         disponible_en = now() + private.retroceso(v_intentos)
   where id = p_id;
  return 'pendiente';
end;
$$;
```

**La cola de fallidos es una tabla, y es esta tabla.** `estado = 'fallido'` en `webhook_events`, no
una tabla aparte. La alternativa —mover la fila a `webhook_fallidos`— duplica el cuerpo íntegro de
todos los tenants en un segundo sitio, obliga a mantener dos políticas de retención sobre el mismo
contenido sensible y no aporta nada: el índice parcial `webhook_events_fallidos_idx` da el mismo
acceso barato que daría una tabla dedicada, y el índice de reclamo no ve esas filas porque su
predicado es `estado = 'pendiente'`.

Nada la vacía sola. Una fila en `fallido` se reprocesa devolviéndola a `pendiente` con `intentos` a
cero, y eso lo hace una persona después de mirar el `error`. Que la cola de fallidos no se drene
sola es la diferencia entre una cola de fallidos y un agujero.

**Alerta:** cualquier fila en `fallido` alerta. El objetivo operativo es cero.

**Criterio de aceptación.** Una fila cuyo procesamiento lanza un error transitorio simulado seis
veces recorre exactamente los seis retrocesos y acaba en `fallido`, con el error del último intento
guardado y el cursor conservado. Una fila con un update permanentemente roto avanza el cursor por
encima de él, no se reintenta, y deja exactamente una fila en `webhook_cuarentena`. Ceder una fila
veinte veces por presupuesto de CPU no consume ningún intento. Devolver una fila `fallido` a
`pendiente` la reprocesa y no crea ninguna fila de negocio nueva.

---

### Tarea 5 — Recuperador de bloqueos huérfanos

Un normalizador que muere después de reclamar y antes de cerrar o ceder deja filas en `procesando`
para siempre. Nadie las vuelve a reclamar, porque el predicado del índice de reclamo es
`estado = 'pendiente'`, y nadie se entera, porque la cola de pendientes se ve vacía. Es el modo de
fallo silencioso de este mecanismo y necesita su propia pieza. Con el presupuesto de CPU por medio
deja de ser un caso raro: una invocación cortada por agotar la CPU es exactamente esto.

**El plazo lo fija la plataforma, no una constante inventada.** El techo de duración de una Edge
Function es de 400 segundos, seis minutos y cuarenta segundos. Una fila reclamada hace más de diez
minutos no puede tener un proceso vivo detrás. Los tres minutos largos de margen cubren el desfase
de reloj y el tiempo entre el reclamo y el arranque real del trabajo.

**Tope de rescates, que es lo que evita el bucle.** Una fila que mata al normalizador —memoria
agotada por un cuerpo patológico, una recursión en el parser— se rescata, mata al siguiente, se
rescata otra vez, y así indefinidamente. Sin tope, el recuperador convierte una fila envenenada en
una caída permanente de toda la ingesta, porque cada proceso muerto se lleva por delante las otras
dos filas que había reclamado. Tres rescates y la fila va a `fallido` con un error explícito.

El cursor cambia el cálculo a mejor: una fila que muere siempre en el mismo tramo avanza el cursor
en los tramos anteriores, así que el tercer rescate empieza justo en la actualización que mata al
proceso. El `error` de la fila envenenada registra ese cursor, que apunta a la actualización
culpable y hace el diagnóstico inmediato.

```sql
create or replace function private.recuperar_huerfanos()
returns table (rescatadas bigint, envenenadas bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with vencidas as (
    select id, rescates, cursor_update
      from public.webhook_events
     where estado = 'procesando'
       and reclamado_en < now() - interval '10 minutes'
     order by reclamado_en
     limit 500
     for update skip locked
  ),
  envenenadas as (
    update public.webhook_events e
       set estado = 'fallido',
           error  = 'el proceso muere en esta fila tras ' || e.rescates
                    || ' rescates, cursor ' || e.cursor_update,
           procesado_en  = now(),
           reclamado_en  = null,
           reclamado_por = null
      from vencidas v
     where e.id = v.id and v.rescates >= 3
    returning e.id
  ),
  rescatadas as (
    update public.webhook_events e
       set estado        = 'pendiente',
           rescates      = e.rescates + 1,
           reclamado_en  = null,
           reclamado_por = null,
           disponible_en = now()
      from vencidas v
     where e.id = v.id and v.rescates < 3
    returning e.id
  )
  select (select count(*) from rescatadas), (select count(*) from envenenadas);
end;
$$;
```

**Dónde corre.** `pg_cron`, cada 5 minutos. Cinco minutos frente a un plazo de diez da holgura
suficiente y no compite con el cron de despacho.

**Qué no hace.** No incrementa `intentos`. Un rescate no es un intento fallido de procesar: es un
proceso que desapareció, y confundir las dos cosas consumiría el presupuesto de reintentos de la
tarea 4 por causas ajenas a la fila. Por eso `rescates` es una columna propia.

**Alerta:** cualquier rescate alerta, porque significa que un proceso murió. Una fila envenenada
alerta con severidad alta.

**Criterio de aceptación.** Matar el proceso justo después del reclamo deja tres filas en
`procesando`; a los 10 minutos el recuperador las devuelve a `pendiente` y el siguiente normalizador
las procesa, con todos los efectos devueltos como `duplicado` para lo que ya se había escrito. Una
fila que provoca la muerte del proceso de forma determinista acaba en `fallido` tras tres rescates y
no antes, con el cursor de la actualización culpable en el `error`, y la cola sigue avanzando con el
resto.

---

### Tarea 6 — Eventos que llegan por el drenaje de Blobs

Cuando Postgres no está, el receptor vuelca el cuerpo crudo en Netlify Blobs y devuelve 200; un
drenaje los recoge hacia `webhook_events` al recuperarse el servicio. Es lo que hace viable la
decisión de plataforma, con el alcance exacto de la §2.2. La consecuencia para esta fase es
concreta: **el normalizador puede recibir eventos con horas de retraso y en orden arbitrario
respecto a los que llegaron por el camino directo.**

**Qué aguanta sin tocar nada, y por qué.**

| Mecanismo | Por qué el retraso no lo rompe |
|---|---|
| `unique (organization_id, canal, mid)` | La clave no contiene tiempo. Un mensaje drenado tres horas tarde choca con el que ya está y se reporta `duplicado` |
| Claves derivadas de `message_events` | Todas usan el `timestamp` **del evento**, que viaja dentro del payload y es estable entre entregas. Nunca la hora de recepción |
| Orden del hilo | `messages_hilo_idx` ordena por `meta_timestamp`, no por `created_at`. Un mensaje drenado tarde aparece en su sitio, no al final |
| `last_incoming_at` | Avanza con `greatest`. Un mensaje antiguo drenado después no rebobina la ventana |
| Lápida diferida | Ya estaba diseñada para borrados que llegan antes que su mensaje. El drenaje hace que ese caso pase de raro a esperable |

La lápida diferida es la pieza que más se refuerza. Con el camino directo, un borrado antes que su
mensaje exigía que Meta invirtiera dos entregas separadas por segundos. Con el drenaje, basta con
que el mensaje llegara durante la caída y el borrado después de la recuperación: el borrado entra
por el camino directo, se procesa en segundos, no encuentra fila, y queda con `aplicado_en is null`
hasta que el drenaje trae el mensaje una hora más tarde. Sin la lápida diferida ese borrado se
perdería, y el cliente vería para siempre un mensaje que cree haber eliminado.

**Lo que sí hay que cambiar: no reabrir conversaciones aparcadas.** La transición automática de la
tarea 15 lleva una conversación de `esperando` a `en_curso` cuando entra un mensaje del contacto.
Un mensaje drenado con tres horas de retraso no debe hacer eso: el operador ya vio ese mensaje por
otro camino, o ya decidió que la conversación estaba en espera. La transición se condiciona a que el
mensaje sea realmente el más reciente, es decir, a que `last_incoming_at` avance de verdad.

**Marcado, y para qué sirve.** `origen = 'blobs'` y la diferencia entre `encolado_en` y `recibido_en`.
Tres usos:

1. **Métrica `retraso_drenaje_p95`.** Es la medida directa de cuánto tiempo estuvo la base sin
   servicio, vista desde el único sitio que lo sabe.
2. **Decisión de la fase 6.** La política de Meta exige que un bot responda a cualquier entrada del
   usuario en menos de 30 segundos. Un mensaje que entra con tres horas de retraso ya incumplió, y
   responderlo automáticamente tres horas tarde puede ser peor que no responderlo. El normalizador
   no decide eso: marca la fila, propaga el retraso al efecto y deja constancia; la fase 6 elige. Lo
   que no puede pasar es que la fase 6 no tenga forma de distinguirlo.
3. **Diagnóstico.** Un hilo que en la bandeja aparece con un salto temporal raro se explica mirando
   el origen de sus filas.

**Idempotencia del drenaje.** Es responsabilidad de la fase 1 (C6), y el esquema la impone desde
aquí: `webhook_events_blob_key_idx` es único sobre `blob_key`. Un drenaje que muere entre el
`insert` y el borrado del blob reintenta y choca con la clave. El `insert` del drenaje va con
`on conflict (blob_key) do nothing`.

**La clave del blob lleva el tiempo de recepción**, con la forma `{recibido_ms}-{uuid}`. Son unos
50 bytes de los 600 disponibles, así que no hay tensión con el límite. Permite dos cosas: que el
drenaje ordene por tiempo de recepción sin abrir el objeto, y que `recibido_en` de la fila sea el
real y no el del drenaje (C5). El resto —`object`, `cuerpo_bytes`, los `entry_ids` extraídos— cabe
en los 2 KB de metadata si la fase 1 decide no reparsear al drenar, y si no cabe, se reparsea: la
metadata es una optimización, no un sitio donde guardar datos que no estén también en el cuerpo.

**El listado de Blobs no es la señal de que no queda nada.** Es la parte con consistencia eventual.
El drenaje corre en bucle y vuelve a listar; la unicidad por `blob_key` hace inofensivo que una
clave aparezca en dos pasadas. Un listado vacío en una pasada no autoriza a dar el drenaje por
terminado, y el drenaje no borra un blob hasta que su fila está confirmada en Postgres.

**Criterio de aceptación.** Con Postgres inaccesible durante 20 minutos, el receptor devuelve 200 a
todo, los cuerpos quedan en Blobs y al volver el servicio aparecen en `webhook_events` con
`origen = 'blobs'` y `recibido_en` anterior a `encolado_en`. Ningún mensaje se pierde y ninguno se
duplica. Un mensaje drenado con tres horas de retraso sobre una conversación en `esperando` no la
mueve a `en_curso` si hay un entrante posterior ya registrado. Ejecutar el drenaje dos veces sobre
el mismo objeto inserta una sola fila.

---

### Tarea 7 — Resolutor de tenant, sin caché

Es la tarea con el peor fallo posible del sistema. El `03` lo dice sin adornos: un error aquí
escribe mensajes de un cliente en el tenant de otro. Y conviene repetir por qué duele aquí y no
en el plano de lectura: **el normalizador escribe con rol de servicio y salta RLS por diseño**,
porque tiene que poder escribir en cualquier tenant. RLS no lo va a atrapar.

**Camino de resolución, en este orden:**

1. **Postgres**, `select organization_id, meta_connection_id from public.meta_asset_routes where
   asset_id = any($1)`. Una sola consulta por cuerpo, con todos los `asset_id` del cuerpo juntos.
2. **Cuarentena.** Sin correspondencia no hay escritura por defecto. No existe organización de
   respaldo, ni "primera organización", ni fila huérfana a reasignar después.

**No hay caché, y esa es la decisión.** Las versiones anteriores del plan ponían Workers KV delante
con TTL de 60 segundos, invalidación en la escritura, procedimiento manual de reasignación y un cron
de reconciliación. Todo eso desaparece. El argumento, en tres partes:

1. **`asset_id` es la clave primaria de `meta_asset_routes`.** La consulta es un acierto de índice
   único sobre una tabla con tantas filas como activos conectados —decenas hoy, unos miles en el
   escenario bueno—, que cabe entera en memoria de la base. El coste es una lectura de índice, no
   una búsqueda.
2. **Se resuelve una vez por cuerpo, no una vez por actualización.** Un cuerpo con 1000 updates de
   cincuenta contactos de la misma Página hace **una** consulta. La caché ahorraría, en el mejor de
   los casos, un viaje por invocación sobre una conexión que el normalizador ya tiene abierta para
   reclamar y para escribir.
3. **La caché reintroducía por la puerta de atrás el fallo que la clave primaria impide.** Una
   entrada obsoleta después de reasignar un activo enruta mensajes al tenant anterior. Ese es
   literalmente el peor fallo del sistema, y se estaba aceptando a cambio de ahorrar una lectura de
   índice. La relación entre lo que costaba y lo que arriesgaba nunca fue buena; sin Workers KV
   disponible, ni siquiera hay que discutirla.

Lo que sí queda es una **memoización dentro del proceso**, con la vida de la invocación: un `Map`
que evita repetir la consulta para el mismo `asset_id` entre las tres filas reclamadas. Muere con la
invocación, así que no puede quedarse obsoleta y no necesita invalidación, TTL ni cron. Es caché en
el sentido inocuo del término, y con el troceado de la tarea 3 gana algo de valor: un cuerpo que se
procesa en cuatro invocaciones resuelve cuatro veces, una por invocación, no cuatro mil.

**Reasignar un activo entre organizaciones** pasa a ser un `update` en `meta_asset_routes` y nada
más. Sin propagación que esperar y sin ventana de obsolescencia. Lo único que hay que decir es que
los cuerpos ya reclamados que se estén procesando en ese instante terminan con la organización
antigua, porque la resolvieron antes del `update`: la ventana es de segundos, no de un TTL, y se
cierra del todo esperando a que no queden filas en `procesando`. Se documenta como procedimiento y
se comprueba en la prueba 17.

**Reglas que no cambian:**

- Se enruta por `entry[].id`, **nunca** por el campo `object`. El valor de `object` para
  Instagram es una contradicción documental sin resolver entre dos páginas oficiales de Meta. El
  handler acepta `page`, `instagram` y `whatsapp_business_account`, y no toma ninguna decisión
  con ese valor más allá de elegir qué adaptador probar.
- La resolución ocurre **antes** de cualquier escritura de negocio.
- Un cuerpo puede mezclar `entry[]` de organizaciones distintas y hay que tratarlo como el caso
  normal, no como la excepción.

**WhatsApp: `meta_asset_routes` resuelve la mitad del problema.** La forma es la correcta —una
tabla plana de `asset_id` a organización, con clave primaria— pero hoy no admite WhatsApp: `tipo`
está restringido a `('page', 'ig_business_account')` y el dominio `canal_meta` a
`('messenger', 'instagram')`. Y hay un matiz que no se ve hasta mirar el payload: en WhatsApp
`entry[].id` es el identificador de la WABA, y una WABA puede tener varios números, así que
`entry[].id` no identifica el canal. La clave de enrutado es
`changes[].value.metadata.phone_number_id`.

La extensión es pequeña y encaja sin rediseño: se registran **dos tipos de fila** por cliente de
WhatsApp, la de la WABA y una por número, todas apuntando a la misma organización.

```sql
alter table public.meta_asset_routes
  drop constraint meta_asset_routes_tipo_check,
  add  constraint meta_asset_routes_tipo_check
    check (tipo in ('page', 'ig_business_account', 'waba', 'phone_number'));
```

El normalizador resuelve WhatsApp por `phone_number_id` y usa `entry[].id` solo como comprobación
cruzada contra la fila de tipo `waba`: si ambos resuelven y no coinciden en organización, se
aborta y se alerta con severidad máxima.

Un efecto secundario bueno de que `asset_id` sea clave primaria global sobre todos los tipos: si
un `phone_number_id` colisionara alguna vez con un `page_id`, el `insert` del alta falla en voz
alta en vez de enrutar mal en silencio. Todo lo referente a la forma del payload de WhatsApp
sigue marcado como no verificado en el `03` y se confirma empíricamente antes de escribir el
adaptador.

**Criterio de aceptación.** Un cuerpo que mezcla `entry[]` de dos organizaciones deja cada
mensaje en la suya, verificado leyendo con el rol `authenticated` de cada una: cada usuario ve
solo lo suyo y el total de ambas suma el total del lote. Un `asset_id` inventado no produce
ninguna fila de negocio y sí una en `webhook_cuarentena`. Un cuerpo con 1000 actualizaciones de dos
Páginas hace exactamente dos resoluciones por invocación, comprobado contando consultas. Una prueba
de propiedades genera cuerpos aleatorios mezclando tenants y comprueba que ninguna fila queda con
`organization_id` distinto del que le corresponde por su `asset_id`.

---

### Tarea 8 — Adaptadores por canal

Cuatro formatos de entrada, un modelo de salida. Los adaptadores son **funciones puras**: no
tocan la base, no hacen red, no leen reloj. Reciben el payload y el `organization_id` ya
resuelto, y devuelven una lista de efectos (§5). Esa pureza es lo que permite ejecutar la mayor
parte de la batería de pruebas en milisegundos y sin base de datos, lo que permite reprocesar
cuarentena sin volver a pedirle nada a Meta, y —esto es nuevo— **lo que hace medible el presupuesto
de CPU**: la medición M2 de la §9.1 cronometra exactamente estas funciones, sin ruido de red.

**Formato A — Messenger.** `object: 'page'`, `entry[].id` = Page ID, arrays
`entry[].messaging[]` y `entry[].standby[]`.

**Formato B — Instagram.** `object: 'instagram'` o `'page'` (contradicción sin resolver),
`entry[].id` = IG professional account ID, mismos dos arrays. Comparte el 80 % de la forma con
Messenger pero difiere en acuses, respuestas a historia y tipos de adjunto, de modo que son dos
adaptadores y no uno con condicionales.

**Formato C — WhatsApp.** `object: 'whatsapp_business_account'`,
`entry[].changes[].value.messages[]`. Es una cuarta forma incompatible con las anteriores. Del
`03` solo se da por bueno lo que ahí está escrito: el valor de `object` y la ruta del array.
Ningún otro nombre de campo se asume. En esta fase se entrega la **interfaz** del adaptador y una
prueba que falla con un mensaje explícito indicando que falta la verificación empírica; el cuerpo
se escribe cuando exista un payload real capturado.

**Formato D — Correo (Resend).** Fuera del alcance de v1 por el `00` §4. Lo que sí se cierra aquí
es que el modelo canónico lo admita sin rediseño: `mid` = cabecera `Message-ID`, hilo por
`In-Reply-To` y `References`, `canal = 'email'`. La clave `unique (organization_id, canal, mid)`
funciona igual. No se escribe el adaptador. Nota de esquema: el dominio `canal_meta` del `02`
§7.1 está restringido a `('messenger','instagram')`, así que admitir correo o WhatsApp exige
ampliarlo; se hace cuando el canal entre, no antes.

**Regla de despacho.** Dentro de `messaging[]` y `standby[]`, la raíz no siempre es `message`.
Puede ser `reaction`, `postback`, `read`, `delivery`, `message_edit`, `referral`, `optin` o algo
que Meta añada mañana. El despacho es **por qué clave existe**, nunca por suposición: un
`evt.message.mid` sin comprobar explota con la primera reacción. Una clave raíz no reconocida
produce un efecto `desconocido.registrar` con el sub-payload íntegro, una métrica y ninguna
excepción.

`entry[].changes[]` también existe en Messenger e Instagram, para eventos de contenido
(comentarios, menciones). Los comentarios están fuera de v1: se registran y se descartan sin
lanzar nada.

**Restricción nueva que impone el presupuesto de CPU.** Los adaptadores no pueden hacer trabajo
superlineal sobre el tamaño del cuerpo. Nada de buscar en `entry[]` desde dentro del bucle de
`messaging[]`, nada de reconstruir índices por actualización, nada de expresiones regulares con
retroceso sobre texto libre del usuario. El aplanado de la tarea 3 se calcula una vez y se recorre;
cualquier dato del cuerpo que el adaptador necesite varias veces se precomputa antes del bucle. Es
una regla de revisión de código, y la prueba 11 la comprueba midiendo que el tiempo de adaptación
crece de forma lineal con el número de actualizaciones.

**Criterio de aceptación.** Cada adaptador se ejecuta sobre todo el corpus de P8 sin lanzar
excepciones. Una prueba alimenta cada adaptador con basura estructurada —objetos vacíos, arrays
donde se esperan objetos, campos nulos, claves inventadas— y comprueba que en todos los casos
devuelve una lista de efectos, posiblemente con `desconocido.registrar`, y nunca lanza. El tiempo de
adaptación medido sobre 100, 500 y 1000 actualizaciones crece de forma lineal.

---

### Tarea 9 — Aplicador: un RPC troceado, una subtransacción por efecto

Un solo componente escribe. El aplicador es un **RPC de Postgres** que el normalizador llama con un
grupo de efectos ya normalizados y agrupados por organización.

Esa forma es la que preserva la regla que más importa: **la unidad transaccional es la
actualización, no el lote.** Un bloque `begin ... exception` dentro de un bucle de PL/pgSQL abre
una subtransacción por iteración; un fallo revierte esa iteración y solo esa.

#### Reevaluación: sigue siendo un RPC, y ahora con mejor argumento

El RPC nació como forma de evitar mil viajes por PostgREST desde el borde. Ahora que la escritura
va por conexión directa, la alternativa existe de verdad: un bucle en el cliente con `savepoint` y
`rollback to savepoint` explícitos daría el mismo aislamiento por efecto sin PL/pgSQL. Se descarta,
y por razones más fuertes que antes:

- **Viajes de red.** Mil efectos serían al menos mil viajes desde una Edge Function, cada uno con su
  latencia contra el presupuesto de 400 segundos de reloj que también tiene que cubrir el resto del
  ciclo. Con el RPC son los que dicte el troceado.
- **El troceado del cliente ya existe.** La tarea 3 parte el trabajo por CPU; añadir un segundo
  nivel de partición en el cliente, por efecto, multiplicaría los estados intermedios que hay que
  razonar sin ganar nada.
- **La subtransacción vive donde vive el dato.** Un `savepoint` desde el cliente sobre un pooler en
  modo transacción es correcto pero frágil: exige que todo el grupo viaje en una sola transacción
  explícita, y cualquier reconexión a mitad la parte en silencio.

Lo que sí cambia es el tamaño.

#### El troceado a 64 efectos, y por qué ese número

Las subtransacciones de PL/pgSQL no son gratis, y el coste no es local. Cada bloque con `exception`
que escribe consume un identificador de subtransacción, y **el backend solo cachea 64 por
transacción de nivel superior**. Al pasar de ahí, el backend se marca como desbordado y el resto de
backends del clúster tiene que consultar `pg_subtrans` para resolver visibilidad. La degradación no
es del RPC: es de toda la base, incluida la bandeja de los clientes que no tienen nada que ver con
ese cuerpo.

Mil iteraciones en una sola llamada cruzarían ese umbral por un factor de dieciséis. La salida es
trocear: **como mucho 64 efectos por llamada, y por tanto por transacción**. Un cuerpo con 1000
actualizaciones son unas dieciséis llamadas, cada una su propia transacción de nivel superior, cada
una por debajo del caché. La medición M4 de la §9.1 lo comprueba en la instancia real en vez de
darlo por bueno.

La función lo impone en vez de confiarlo al llamante:

```sql
create or replace function private.ingerir_lote(p_efectos jsonb)
returns jsonb                     -- un resultado por efecto: aplicado | duplicado | error
language plpgsql
security definer
set search_path = ''
as $$
declare
  efecto     jsonb;
  resultados jsonb := '[]'::jsonb;
begin
  if jsonb_array_length(p_efectos) > 64 then
    raise exception 'ingerir_lote admite 64 efectos como maximo, recibidos %',
      jsonb_array_length(p_efectos)
      using hint = 'el cache de subtransacciones del backend es de 64 por transaccion';
  end if;

  for efecto in select * from jsonb_array_elements(p_efectos) loop
    begin
      resultados := resultados || private.aplicar_efecto(efecto);
    exception when others then
      -- Solo se revierte ESTA iteración. El resto del grupo queda confirmado.
      resultados := resultados || jsonb_build_object(
        'estado', 'error', 'sqlstate', sqlstate, 'mensaje', sqlerrm);
    end;
  end loop;
  return resultados;
end;
$$;
```

**Consecuencia sobre el modelo de fallo, que hay que decir en voz alta.** Con dieciséis
transacciones en lugar de una, un cuerpo puede quedar a medias de forma confirmada: ocho grupos
escritos y el proceso muerto. Eso es aceptable y es el mismo razonamiento del cursor de la tarea 3:
el cursor avanza con el grupo confirmado, la reanudación empieza donde se quedó, y si el cursor se
quedó corto se repite un grupo y todos sus efectos vuelven como `duplicado`. Nunca se pierde; como
mucho se repite.

**El avance del cursor va en la misma transacción que el último grupo del tramo.** Si fuera una
llamada aparte, existiría la ventana en la que el grupo está escrito y el cursor no, o al revés. La
primera se repara sola por idempotencia; la segunda perdería actualizaciones, y esa no se puede
permitir. Al ir juntos, la única ventana posible es la benigna.

Orden dentro de un efecto de mensaje: tenant (ya resuelto) → identidad de contacto → contacto →
conversación → mensaje → media → contadores de la conversación.

**Gate de efectos secundarios.** El `insert` de mensaje es
`on conflict (organization_id, canal, mid) do nothing returning id`. Si no devuelve fila, el
mensaje ya existía: se corta ahí y el efecto se reporta como `duplicado`. No se avanza
`last_message_at`, no se encola el agente. Esta es la diferencia entre "no duplicar filas" y "ser
idempotente de verdad": una entrega repetida que vuelve a disparar el agente cuesta dinero y
puede producir una segunda respuesta al cliente final. Con el troceado por CPU y el recuperador de
huérfanos, la reentrega deja de ser un caso de borde y pasa a ser parte del funcionamiento normal,
así que este gate protege más que antes, no menos.

El Broadcast a la bandeja queda protegido por construcción. El `02` §5.2 lo emite desde un
trigger `after insert` que publica al canal `org:{organization_id}`, no con `postgres_changes`
con filtro. Si el `insert` no ocurre, el trigger no dispara y no hay Broadcast: el gate es
estructural, no una comprobación que alguien pueda olvidar.

**Optimización para cuerpos grandes:** antes de resolver contacto y conversación, una lectura por
`(organization_id, canal, mid)`. En una reentrega, eso convierte 1000 resoluciones completas en
1000 aciertos de índice. Con reanudaciones frecuentes por presupuesto de CPU, esa optimización pasa
de conveniente a necesaria.

**Criterio de aceptación.** No existe ninguna sentencia de escritura sobre tablas de negocio
fuera de `private.aplicar_efecto`, verificado con una regla de análisis estático sobre el código del
normalizador: solo llama a RPC. Una llamada con 65 efectos falla con el mensaje explícito.
Reprocesar un cuerpo ya procesado devuelve todos los efectos como `duplicado` y no emite ningún
Broadcast ni ninguna entrada nueva en la cola del agente. Durante el procesamiento de un cuerpo de
1000 actualizaciones ningún backend queda con el caché de subtransacciones desbordado.

---

### Tarea 10 — Idempotencia: clave canónica y claves derivadas

**Mensajes.** `unique (organization_id, canal, mid)` con `insert ... on conflict do nothing`, tal
como fija el `03`. `mid` es `entry[].messaging[].message.mid` y `entry[].standby[].message.mid`,
que son el mismo espacio de identificadores.

Lleva `organization_id` porque Meta define `mid` solo como *"Message ID"* y no afirma en ningún
sitio cuál es su ámbito de unicidad ni su estabilidad temporal. Al no estar documentado, se acota
por tenant. Nunca `unique(mid)` global.

**Eventos sin `mid` propio.** No usan esa clave. Derivan la suya, y la restricción la impone la
base de datos mediante `clave_dedupe`, no el código de ingesta:

| Evento | Qué identifica | Clave derivada | Nota |
|---|---|---|---|
| Reacción | La acción de un usuario sobre un mensaje | `(organization_id, canal, 'reaction', reaction.mid, sender.id, reaction.action, timestamp)` | `reaction.mid` referencia el mensaje **reaccionado**, no la reacción. Un `react` y un `unreact` del mismo usuario sobre el mismo mensaje son dos filas porque `action` entra en la clave |
| Lectura Messenger | Un instante, no un mensaje | `(organization_id, canal, 'read', sender.id, read.watermark)` | `read.watermark` significa "todo lo anterior a este instante fue leído". No identifica ningún mensaje concreto y no puede compartir columna con `read.mid` |
| Lectura Instagram | Un mensaje concreto | `(organization_id, canal, 'read', sender.id, read.mid)` | `messaging_seen`. Modelo de acuse distinto al de Messenger; columnas distintas a propósito |
| Entrega Messenger | Un instante | `(organization_id, canal, 'delivery', sender.id, delivery.watermark)` | Los `delivery.mids[]` se guardan en el array pero no entran en la clave: la lista puede variar entre reentregas del mismo watermark |
| Entrega Instagram | — | — | No existe acuse de entrega en Instagram |
| Postback | Una pulsación | `(organization_id, canal, 'postback', sender.id, timestamp)` | El `payload` **no** entra en la clave: por standby llega ausente, y si entrara, el mismo postback derivaría claves distintas según por dónde llegue |
| Edición | Una versión de un mensaje | `(organization_id, canal, 'edit', message.mid, timestamp)` | El `mid` es el del mensaje editado. Un mensaje editado dos veces produce dos eventos |
| Borrado | La orden de borrar un mensaje | `(organization_id, canal, 'delete', message.mid, timestamp)` | Se registra siempre, haya o no fila que actualizar. Ver tarea 11 |
| Referral / optin | Un evento de origen | `(organization_id, canal, tipo, sender.id, timestamp)` | |
| Handover | Un cambio de propiedad del hilo | `(organization_id, canal, tipo, recipient.id, timestamp)` | El string `primary_receiver` sigue llegando en `app_roles` y se persiste tal cual |
| Clave raíz desconocida | Lo que Meta añada | `(organization_id, canal, <clave>, sender.id, timestamp)` | Se registra con el payload crudo y una métrica |

El `timestamp` que entra en estas claves es el del evento, que viaja dentro del payload y por
tanto es estable entre reentregas del mismo evento, vengan de Meta, del reclamo repetido de una fila
cedida por presupuesto de CPU, de un rescate de bloqueo huérfano o del drenaje de Blobs. No es la
hora de recepción, y esa distinción es lo que sostiene los mecanismos de las tareas 3, 5 y 6.

**Límite conocido y aceptado:** dos eventos genuinamente distintos del mismo tipo, del mismo
actor y en el mismo milisegundo colapsan en uno. Para postbacks y reacciones es un escenario que
no se da con interacción humana. Queda escrito para que nadie lo descubra como sorpresa.

**Criterio de aceptación.** Reproducir el corpus completo de P8 tres veces seguidas deja el mismo
número de filas en `messages` y en `message_events` que reproducirlo una vez. Una reacción y su
retirada sobre el mismo mensaje producen dos filas. Un cuerpo procesado en cuatro tramos, con el
cursor forzado a retroceder un tramo entre el segundo y el tercero, deja exactamente las mismas
filas que procesado de una vez.

---

### Tarea 11 — Borrados y ediciones: UPDATE, nunca INSERT

El unsend de Instagram no es un evento aparte. Llega como un objeto `message` normal con solo
`{mid, is_deleted: true}`, sin `text` y sin `attachments`, y con el **mismo** `mid` del mensaje
original. Un `insert` ciego crea una fila fantasma vacía en la bandeja.

```sql
update public.messages
   set deleted_at = now(), texto = null
 where organization_id = $1 and canal = $2 and mid = $3
   and deleted_at is null
returning id;
-- y borrado de las filas de media asociadas
```

La edición es análoga: mismo `mid`, `update` de `texto` y `edited_at`, con el texto anterior
conservado en el `raw` del `message_events` de tipo `edit`.

**El caso que casi siempre se olvida: el borrado llega antes que el mensaje.** No hay garantía de
orden, ni en Meta, ni entre el camino directo y el drenaje de Blobs, ni entre dos tramos de cuerpos
distintos procesados por normalizadores concurrentes. Si el `update` afecta a 0 filas, insertar está
prohibido por invariante, y descartar el borrado deja visible para siempre un mensaje que el usuario
cree haber eliminado. La salida es una lápida diferida:

1. El efecto de borrado se registra **siempre** en `message_events` con `tipo = 'delete'` y
   `target_mid`, haya o no fila que actualizar.
2. Si el `update` afectó a alguna fila, se marca `aplicado_en`. Si afectó a 0, queda pendiente.
3. El aplicador, **después** de cada `insert` de mensaje que sí crea fila, consulta si existe un
   `message_events` de tipo `delete` o `edit` con `aplicado_en is null` para ese `target_mid`, y
   lo aplica en la misma subtransacción.

Así el mensaje nace ya borrado o ya editado, sin ventana en la que sea visible, y sin insertar
nunca una fila que no venga de un mensaje real. El índice parcial de la tarea 1 es lo que hace
que esa consulta cueste casi lo mismo que no hacerla.

**Por qué la lápida es más importante ahora.** Con la arquitectura anterior el desorden venía solo
de Meta y era raro. Ahora hay tres fuentes más: el drenaje de Blobs puede meter el mensaje horas
después de su borrado, dos normalizadores concurrentes pueden procesar el borrado y el mensaje en
orden inverso, y una fila cedida por presupuesto de CPU deja la segunda mitad de su cuerpo para
después de que otro cuerpo entero se haya procesado. La lápida diferida deja de ser una precaución y
pasa a ser el camino habitual de una parte real de los borrados.

**Criterio de aceptación.** Un unsend sobre un mensaje existente deja la fila con `deleted_at` no
nulo, `texto` nulo y sin filas en `media`, y **no** crea una fila nueva: el recuento de `messages`
no cambia. Un unsend cuyo mensaje llega diez minutos después deja, al terminar, una sola fila con
`deleted_at` no nulo, y en ningún instante intermedio hay una fila visible con texto. Lo mismo con
el mensaje llegando tres horas después por el drenaje de Blobs. Un unsend de un `mid` que nunca
llega no deja fila en `messages`.

---

### Tarea 12 — Echoes y anti-bucle

En un echo (`is_echo: true`) **`sender` y `recipient` están invertidos**: `sender.id` es la
Página o la cuenta de Instagram, `recipient.id` es el PSID o el IGSID del contacto. Un
normalizador que asuma que `sender` es siempre el contacto atribuye los salientes al contacto
equivocado y corrompe el hilo entero.

Reglas del adaptador:

- `is_echo = true` → `direccion = 'outbound'`, `contacto_scoped_id = recipient.id`,
  `cuenta_scoped_id = sender.id`.
- El echo trae su propio `mid` y entra por la misma clave de idempotencia.
- **Un echo saliente no reabre la ventana de 24 h.** `last_incoming_at` no se toca. Solo avanza
  `last_message_at`.

**Atribución por `app_id`:**

| `app_id` | Qué es | `emisor` |
|---|---|---|
| App de Kavea, correlacionado con un envío del agente | Respuesta automática propia | `agente` |
| App de Kavea, correlacionado con un envío humano desde la bandeja | Respuesta de un agente humano por Kavea | `humano` |
| App de Kavea, sin correlación | No debería ocurrir | `humano` provisional, métrica y alerta |
| Otro `app_id` conocido (bandeja de Business Suite) | El cliente escribió desde el móvil o desde Business Suite | `humano` |
| `app_id` desconocido | Hay una tercera herramienta conectada a la Página | `humano`, métrica y alerta en el panel interno |

**Decisión sobre el anti-bucle: ningún echo dispara el agente de IA, sea cual sea su `app_id`.**
El `03` marca como incierto el App ID de la bandeja de Meta Business Suite: la página de
Conversation Routing indica `263902037430900` (15 dígitos) y la referencia de `message_echoes`
muestra `26390203743090` (14). Construir la protección contra bucles sobre un valor que dos
páginas oficiales escriben distinto es construirla sobre arena. Con la regla "ningún echo dispara
al agente", la discrepancia deja de ser bloqueante para esta fase: el `app_id` se usa para
atribuir y para alertar, no para decidir si el agente actúa. Sigue haciendo falta resolverlo
empíricamente, pero no bloquea el bloque 2.

**Correlación con los envíos propios.** El `03` es explícito: los echoes **no** se deduplican
contra el mensaje que Kavea envió; se correlacionan por el `message_id` que devuelve el Send API
o por el campo `metadata` que se pasa en el envío y vuelve en el echo. En esta fase no existe
camino de envío (es el bloque 4), así que:

- Se usan las columnas `send_api_message_id` y `metadata` que el `02` §7.5 ya define, con sus
  índices parciales.
- Se entrega la función de correlación y sus pruebas contra payloads sintéticos.
- Mientras no haya envíos, todo echo se clasifica como `humano` externo, que es el comportamiento
  correcto durante el dogfooding: el equipo de Boosty va a estar respondiendo desde el móvil.
- Queda abierta y marcada la pregunta de si el `mid` del echo coincide con el `message_id` que
  devuelve el Send API. Si coinciden, el `on conflict do nothing` resuelve la correlación solo; si
  no, hace falta el camino por `metadata`, cuya disponibilidad en Instagram tampoco está
  confirmada.

**Criterio de aceptación.** Un echo se persiste con `direccion = 'outbound'` y su
`conversation_id` es el mismo que el de los mensajes entrantes de ese contacto: no se crea una
conversación nueva ni un contacto con el Page ID como `scoped_id`. Tras procesar un echo,
`last_incoming_at` de la conversación conserva exactamente el valor que tenía antes. Ninguna
entrada en la cola del agente procede de un mensaje con `is_echo = true`.

---

### Tarea 13 — `standby[]` y propiedad del hilo

El parser lee `entry[].messaging[]` **y** `entry[].standby[]`, con la misma normalización y el
mismo camino de escritura. La diferencia se guarda en una columna, no en dos tuberías. El aplanado
de la tarea 3 los recorre en ese orden, y ese orden es contrato.

Cuando la Bandeja de Meta Business Suite se apropia del hilo —al mover la conversación a Main o
al responder un agente del cliente— los eventos dejan de llegar en `messaging[]` y pasan a
`standby[]`. No hay error, no hay código de estado, no hay registro. Si solo se lee `messaging[]`,
Kavea se queda ciega y muda para ese cliente y nadie se entera hasta que el cliente reclama.

- `messages.llego_por_standby` y `message_events.llego_por_standby` marcan la procedencia.
- Los postbacks entregados por standby **no incluyen** el campo `payload`. Cualquier lógica que
  dependa de `postback.payload` falla en silencio justo cuando se pierde la propiedad del hilo. Se
  persiste `postback_payload = null` y se registra métrica.
- `conversations.en_standby` y `thread_owner_app_id`, que el `02` §7.4 ya define, se actualizan
  desde aquí. En fases posteriores esa marca es la que impide que el agente responda en un hilo
  que Kavea no posee: responder ahí produce respuestas duplicadas al cliente final.

Aviso del `03` que no se puede ignorar: la tabla de `/docs/instagram-platform/webhooks` declara
que en la vía Facebook Login **no** están disponibles `standby`, `message_echoes`,
`message_reactions`, `messaging_handover` ni `messaging_optins`, mientras que la página de
`/docs/messenger-platform/instagram/features/webhook` sí lista `standby` y `message_reactions`
como suscribibles. El parser se escribe para ambos casos; qué llega de verdad en Instagram es una
comprobación empírica pendiente y va en la §12.

**Criterio de aceptación.** El mismo mensaje colocado en `standby[]` en lugar de `messaging[]`
produce la misma fila salvo `llego_por_standby = true`, y deja `conversations.en_standby` a
cierto. Una prueba de cobertura falla si algún adaptador lee `messaging` sin leer `standby`.

---

### Tarea 14 — Parser de adjuntos tolerante, allowlist y SSRF

**Tolerancia.** Un tipo de adjunto desconocido va a `fallback` con el payload crudo en JSONB, se
registra métrica y se sigue procesando. Nunca se lanza excepción. En Chatwoot cada tipo nuevo de
Meta —`sticker` en junio de 2026, `post` en junio de 2026— tumbó el job completo y perdió todos
los mensajes del lote, no solo el afectado.

El esquema ya ayuda: el `02` §7 prohíbe `enum` en los vocabularios de Meta precisamente porque un
valor nuevo convertiría un tipo desconocido en un `insert` fallido. `media.tipo` es `text` sin
restricción y guarda el valor de `attachment.type` tal como llega.

Tipos que el parser reconoce desde el día uno, sin que la lista sea cerrada:

- Comunes: `image`, `audio`, `video`, `file`.
- Messenger: `sticker` (con `sticker_id`), `appointment_booking`, `fallback`, `template`.
- Instagram: `story_mention`, `ig_reel`, `reel`, `ephemeral`, y **`share` e `ig_post` a la vez**.
  Se anunció que `share` desaparecía el 1 de febrero de 2026 en favor de `ig_post`, pero la página
  de referencia viva sigue listando `share`. Contradicción sin resolver: el parser acepta los dos
  y no asume la desaparición de ninguno.

**Fecha dura a 28 días.** Después del **30 de agosto de 2026** los stickers de Messenger dejan de
llegar duplicados como `image` y solo llegan como `sticker`. El parser trata `sticker` como tipo
de primera clase desde ahora y no depende de la copia como `image`. Es criterio de aceptación
explícito, no una nota al pie.

**Media entrante: solo la URL.** Se persiste `attachment.payload.url` en `media.cdn_url` con
`origen = 'meta_cdn'`, y nada más. Ni binario, ni copia, ni proxy por dominio de Kavea, ni
almacenamiento de ningún tipo. Meta rechazó el App Review de `instagram_manage_messages` a usuarios
de Chatwoot por exactamente esto. La restricción `media_origen_coherente` del `02` §7.5 es lo que
impide que un `insert` distraído lo haga: el almacén de objetos queda reservado a media saliente,
que llega en un bloque posterior.

Nota de esquema aguas arriba: el `02` §7.5 nombra ese almacén como R2 en el valor `kavea_r2` y en
las columnas `r2_bucket` y `r2_key`. La media saliente pasa a Supabase Storage y esos nombres se
quedan desalineados. No bloquea esta fase, que no escribe ni una fila con ese origen, y se anota en
la §8 para corregirlo antes del bloque 4.

**Allowlist de host.** Toda URL que venga de un webhook se valida contra `lookaside.fbsbx.com`,
`*.fbcdn.net` y `scontent.*` **antes de persistirse**, y el host se guarda en `media.cdn_host`
para poder auditarlo después. Si el host no está en la lista:

- No se guarda la URL.
- Se conserva el payload crudo en `media.payload` y en `messages.raw`, se marca `is_unsupported` y
  se registra métrica con alerta.
- **No se lanza excepción y el mensaje se guarda igual, con su texto.** Un host desconocido es o
  bien un cambio de Meta o bien un ataque; en ninguno de los dos casos la respuesta correcta es
  perder el mensaje del cliente.

**SafeFetch.** Se entrega el ayudante aunque en esta fase **no tenga ni un solo llamante**, y esa
ausencia es el diseño: si nadie descarga, la superficie de SSRF es cero. Reglas del ayudante, para
cuando alguien lo necesite: allowlist de host, resolución de DNS y bloqueo de rangos privados y de
enlace local, sin seguir redirecciones fuera de la lista, tiempo de espera y tamaño máximo. Regla
de equipo: ninguna llamada de red con una URL procedente de un webhook se escribe sin pasar por
él, verificada con una regla de análisis estático.

**Caso especial, historias.** Una historia caduca a las 24 horas y su URL deja de renderizar. Para
respuestas a historia y menciones en historia el contexto visual se pierde y no hay forma legítima
de conservarlo. Se persiste `reply_to_story` con lo que llegue y se asume que a las 24 horas no
estará. Con el drenaje de Blobs por medio, ese plazo puede consumirse antes de que el mensaje
llegue siquiera a la bandeja: no cambia la decisión, pero conviene que nadie lo lea como un fallo.

**Criterio de aceptación.** Un adjunto de tipo `xyz_inventado` produce una fila en `media` con ese
tipo tal cual, el payload crudo, una métrica incrementada y ninguna excepción. Un adjunto de tipo
`sticker` sin copia como `image` se persiste correctamente. Una URL con host `evil.example.com` no
se persiste, el mensaje sí, y salta la alerta. Una URL apuntando a `169.254.169.254` no llega a
persistirse. Un `insert` en `media` con `origen = 'meta_cdn'` y clave de almacén no nula falla
contra la restricción.

---

### Tarea 15 — Conversaciones sin duplicados, con cuatro estados

La idempotencia de mensajes no protege de conversaciones duplicadas. Cuando alguien manda tres
fotos seguidas llegan webhooks paralelos —y ahora, además, varios normalizadores concurrentes
reclamando filas distintas del mismo contacto— y un patrón "buscar o crear" crea tres
conversaciones. Chatwoot necesitó un mutex distribuido en Redis con TTL de 3 s y admite que no
garantiza orden. En Postgres se resuelve con el índice único parcial, **con el predicado corregido
de la tarea 1**.

El detalle que rompe la implementación ingenua: **`on conflict do nothing returning` no devuelve
fila cuando hay conflicto**. Un `insert ... on conflict do nothing returning id` en carrera
devuelve cero filas y el código se queda sin `conversation_id`. Hace falta el ciclo completo, y al
vivir dentro del RPC de la tarea 9 no cuesta ningún viaje de red extra:

```sql
create or replace function private.resolver_conversacion(
  p_org uuid, p_channel uuid, p_canal text, p_contact uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  for i in 1..3 loop
    select id into v_id
      from public.conversations
     where organization_id = p_org and canal = p_canal and contact_id = p_contact
       and estado <> 'cerrada'
     limit 1;
    if found then return v_id; end if;

    insert into public.conversations
           (organization_id, channel_id, canal, contact_id, estado)
    values (p_org, p_channel, p_canal, p_contact, 'nueva')
    on conflict (organization_id, canal, contact_id) where estado <> 'cerrada'
    do nothing
    returning id into v_id;
    if v_id is not null then return v_id; end if;
    -- conflicto: otro normalizador ganó la carrera, se vuelve a leer
  end loop;
  raise exception 'no se pudo resolver la conversacion para % / % / %', p_org, p_canal, p_contact;
end;
$$;
```

Notas de comportamiento que hay que tener presentes:

- La inferencia del índice parcial exige repetir el predicado `where estado <> 'cerrada'` en la
  cláusula `on conflict`. Sin él, Postgres no encuentra índice que inferir y la sentencia falla.
- **La pregunta abierta sobre `pending` queda cerrada.** La versión anterior de este plan la dejaba
  pendiente porque el predicado era `where status = 'open'` y dos conversaciones en `pending` no lo
  violaban. Con `estado <> 'cerrada'`, los tres estados vivos están cubiertos y no hay hueco.
- Si la única conversación existente está `cerrada`, se crea una nueva. Reabrir un hilo cerrado
  meses después es una conversación nueva, no la misma.
- El bucle acotado a tres intentos evita un ciclo infinito si alguien elimina el índice.
- `pg_advisory_xact_lock` sobre el hash de `(canal, contacto)` es la alternativa si aparece
  contención real, y con Supavisor en modo transacción sigue disponible porque es de ámbito de
  transacción, no de sesión. No se adopta de entrada porque serializa por contacto sin necesidad.

**Transición automática de estado, y la salvaguarda del drenaje.** Un mensaje entrante sobre una
conversación en `esperando` la devuelve a `en_curso`. Sobre `nueva` o `en_curso` no cambia nada. Y
la transición solo ocurre si el mensaje es realmente el más reciente, para que un mensaje drenado
horas tarde no resucite una conversación que el operador ya aparcó:

```sql
update public.conversations
   set last_incoming_at = greatest(coalesce(last_incoming_at, '-infinity'::timestamptz), $1),
       last_message_at  = greatest(coalesce(last_message_at,  '-infinity'::timestamptz), $1),
       estado = case
                  when estado = 'esperando'
                   and $1 > coalesce(last_incoming_at, '-infinity'::timestamptz)
                  then 'en_curso'
                  else estado
                end
 where id = $2;
```

Las tres expresiones del `set` leen la fila anterior a la actualización, así que la comparación con
`last_incoming_at` en la rama del `case` es contra el valor viejo, que es lo que se quiere.

**Criterio de aceptación.** Diez llamadas concurrentes con el mismo `(organization_id, canal,
contact_id)` producen exactamente una conversación y devuelven el mismo identificador, tanto si la
existente está en `nueva` como en `en_curso` o en `esperando`. Tres fotos enviadas de golpe por el
mismo contacto producen una conversación y tres mensajes, con varios normalizadores en concurrencia.
Un mensaje entrante sobre una conversación en `esperando` la deja en `en_curso`; el mismo mensaje
reprocesado no vuelve a cambiar nada.

---

### Tarea 16 — Contactos, identidades y unificación

**Identidades.** `(organization_id, canal, scoped_id)` es único, con el mismo patrón de resolución
de la tarea 15. PSID e IGSID son espacios de identificadores distintos, no intercambiables y no
portables entre apps: nunca se comparan entre sí, nunca se copia uno en la columna del otro.

`app_scoped_id` queda como columna separada y en esta fase se deja nula: las solicitudes de borrado
de datos de Meta llegan con un App-Scoped ID que no es ni el PSID ni el IGSID, y no hay forma de
rellenarla desde el webhook de mensajería. La columna existe para que la correspondencia se pueda
resolver cuando se implementen los callbacks, sin migración de por medio.

**Contactos.** Una identidad sin contacto crea un contacto con `nombre` nulo. Esta fase **no llama
a la Graph API** para leer el perfil: el error 230 (consentimiento de perfil no otorgado) es normal
y esperable, y añadir esa llamada mete a la fase en el terreno de los límites de tasa y del App
Review sin necesidad. Hay además una razón nueva y concreta: una llamada HTTP por contacto dentro
del bucle del normalizador consumiría reloj del presupuesto de 400 segundos y convertiría un cuerpo
de 1000 actualizaciones en un problema de latencia sin ninguna necesidad. La bandeja del bloque 3
muestra el `scoped_id` hasta que exista enriquecimiento de perfil. `perfil_consentido` y
`perfil_leido_en`, que el `02` §7.3 ya define, se quedan en sus valores por defecto.

**Unificación entre canales.** Aquí hay que ser explícito, porque es donde se cuelan los errores
caros.

- **En esta fase no hay ninguna fusión automática entre canales de Meta.** El mismo humano en
  WhatsApp y en Instagram no trae ningún identificador común, y no lo va a traer. PSID e IGSID no
  se cruzan.
- **No se fusiona por parecido de nombre ni de nombre de usuario.** "Maria Gonzalez" en Instagram y
  "María González" en Messenger pueden ser dos personas distintas. Una fusión errónea mezcla dos
  historiales de conversación de dos clientes reales, y en un producto que guarda conversaciones
  comerciales eso es una incidencia de privacidad, no un error de datos.
- **Señales deterministas y solo esas.** Un teléfono normalizado a E.164 o un correo verificado que
  coincidan pueden **proponer** una fusión. Si WhatsApp entrega el número del remitente —pendiente
  de verificar, §12— ese es el único caso realista, y aun así entra como propuesta, no como acción.
- **Cola de candidatos.** Las coincidencias se escriben en una tabla de sugerencias que no actúa
  por sí sola. Un humano confirma desde la interfaz, en un bloque posterior.

**Fusión, cuando la haya: auditada y reversible.** La tabla `contact_merges` de la tarea 1 guarda
el estado previo suficiente para devolver cada identidad y cada conversación a su contacto
original. El falso positivo se gestiona por reversibilidad, no por prevención perfecta.

**Colisión que hay que resolver en la fusión y que no es evidente:** si los dos contactos tienen
una conversación viva en el **mismo** canal, repuntar `contact_id` viola el índice único parcial
`conversations (organization_id, canal, contact_id) where estado <> 'cerrada'`. Con el predicado
corregido esa colisión es más probable que antes, no menos: ahora también choca si una está en
`esperando` y la otra en `nueva`. La fusión tiene que decidir antes: conservar la de actividad más
reciente y cerrar la otra dejando constancia, o unir los mensajes en una sola. Se elige cerrar la
menos reciente, porque mover mensajes entre conversaciones es una operación destructiva que no se
deshace bien.

**Criterio de aceptación.** Dos mensajes del mismo PSID producen un contacto y una identidad. El
mismo humano escribiendo por Instagram y por Messenger produce dos contactos, y eso es el
comportamiento correcto en esta fase. Una fusión de dos contactos con conversación viva en el
mismo canal no viola el índice y deja registro suficiente para revertirse. Revertir una fusión
devuelve exactamente el estado anterior.

---

### Tarea 17 — Ventana de 24 h: `last_incoming_at` monótono

La ventana de servicio se calcula **por conversación**, sobre `last_incoming_at`, nunca con un
flag global. Chatwoot usa un flag global 24 h/7 d y esa es la implementación incorrecta que no se
copia.

Dos reglas que parecen menores y no lo son:

1. **Solo los mensajes entrantes no-echo avanzan `last_incoming_at`.** Un echo saliente no reabre
   la ventana.
2. **El avance es monótono.** Sin garantía de orden —ni en Meta, ni entre el camino directo y el
   drenaje de Blobs, ni entre tramos de un mismo cuerpo procesados por invocaciones distintas— un
   mensaje viejo puede llegar después de uno nuevo, y una asignación directa rebobinaría el reloj.
   Rebobinarlo cerraría la ventana antes de tiempo; y en el caso simétrico, reprocesar un evento
   antiguo tras haber cerrado y reabierto la haría parecer abierta cuando no lo está, lo que produce
   un error 100 de Meta o, peor, un envío fuera de política.

La sentencia es la de la tarea 15, que combina el avance monótono con la transición de estado en un
solo `update`. Para un mensaje saliente o un echo, solo avanza `last_message_at`.

**Criterio de aceptación.** Procesar un mensaje entrante con timestamp anterior al último
registrado no modifica `last_incoming_at`. Procesar un echo no modifica `last_incoming_at` y sí
`last_message_at`. Una prueba reproduce un cuerpo en orden inverso y comprueba que
`last_incoming_at` acaba con el valor del mensaje más reciente. Una prueba reproduce el mismo cuerpo
partido en cuatro tramos, con los tramos aplicados en orden aleatorio, y obtiene el mismo valor.

---

### Tarea 18 — Retención de `webhook_events`

`webhook_events` guarda el cuerpo íntegro de todos los tenants, no lleva `organization_id` y queda
fuera de RLS por deny-all. **Es la tabla con más contenido sensible y menos protección del
sistema**, y hoy no tiene plazo. Ahora, además, es la cola: su tamaño afecta al rendimiento, no
solo a la exposición.

**Propuesta por defecto, en dos plazos y no en uno.** La versión anterior proponía purgar a los 30
días. Es peor que separar contenido de metadatos, porque tira las dos cosas a la vez:

| Qué | Plazo | Argumento |
|---|---|---|
| `cuerpo` de las filas en `hecho` | **7 días**, se pone a `null` | El cuerpo solo sirve para reprocesar. `messages.raw`, `media.payload` y el `sub_payload` de la cuarentena ya conservan lo reprocesable por mensaje. Siete días es el plazo realista para que alguien detecte un fallo de adaptador y quiera rehacer el tráfico de la semana |
| La fila entera, en `hecho` | **90 días**, se borra | Sin cuerpo, la fila es metadato: cuándo llegó, de qué activos, cuántos bytes, por qué camino. Eso es lo que responde una pregunta de auditoría o de privacidad, y no contiene ni un mensaje |
| Filas en `fallido` o con `error` no nulo | **No se purgan nunca automáticamente** | Purgarlas destruiría la única copia de algo que no se procesó. Salen de ahí cuando una persona las reprocesa o las descarta |
| `webhook_cuarentena` | Igual que las fallidas: nunca automáticamente | Mismo argumento, con la ventaja de que guarda sub-payloads y no cuerpos enteros |

Poner `cuerpo` a `null` en vez de borrar la fila es la decisión que más aporta: conserva la
trazabilidad completa de la ingesta y elimina el contenido que hace de la tabla un pasivo. Una
consulta de "qué recibimos del activo X el día Y" se sigue respondiendo a los tres meses sin que
exista un solo mensaje de un cliente guardado fuera de su tenant.

**Dónde corre.** `pg_cron`, una vez al día en hora de bajo tráfico. Es el caso en el que `pg_cron`
encaja mejor que nada: la purga es local a la base, no sale por HTTPS y no necesita granularidad
fina.

```sql
select cron.schedule('purga-webhook-events', '17 4 * * *', $$
  update public.webhook_events
     set cuerpo = '{}'::jsonb
   where estado = 'hecho'
     and error is null
     and cuerpo <> '{}'::jsonb
     and recibido_en < now() - interval '7 days';

  delete from public.webhook_events
   where estado = 'hecho'
     and error is null
     and recibido_en < now() - interval '90 days';
$$);
```

**Esto es una propuesta, no una decisión.** El plazo definitivo lo fija la política de privacidad
publicada, y es decisión de Gabriel. Va en la §12 con esa marca. Lo que sí es decisión de esta fase
es la **forma**: dos plazos, contenido y metadato separados, y nada automático sobre lo que falló.

**Salud de la tabla, que ahora también importa.** La tabla recibe varios `update` por fila sobre
columnas indexadas, así que ninguno es HOT y cada uno deja tupla muerta e índice que crece. Los
parámetros de autovacuum agresivo de la tarea 1 son parte de esta tarea, no un adorno: sin ellos, el
índice de reclamo se degrada y el reclamo deja de ser un acierto de índice. Se vigila con el tamaño
del índice y el retraso de autovacuum, y se comprueba con la prueba 29.

**Criterio de aceptación.** La purga corre y se ha comprobado que pone cuerpos a nulo y que borra
filas viejas. Una fila en `fallido` de hace seis meses sigue ahí con su cuerpo. Tras un millón de
filas procesadas y purgadas, el `explain` del reclamo sigue siendo un recorrido de índice y el
tamaño de `webhook_events_reclamo_idx` se mantiene proporcional al número de pendientes, no al
histórico.

---

### Tarea 19 — Observabilidad

**Un plano y medio, y eso es una mejora.** La arquitectura anterior tenía la observabilidad partida
entre Cloudflare y Supabase, y el `02` §5.3 lo reconocía como coste. Ahora las métricas de negocio
viven todas en `ingesta_metricas`, en la misma base que los datos, y el panel interno las agrega sin
leer contenido. Lo que queda fuera son los registros de ejecución de las Edge Functions, que están
en el panel de Supabase: es un sitio distinto, pero es el mismo proveedor y la misma sesión.

Las métricas las incrementa el propio RPC y las funciones de cola, no el código del normalizador:
una métrica que se pierde cuando el proceso muere no sirve para diagnosticar procesos que mueren.

| Métrica | Qué delata |
|---|---|
| `cola_pendientes` | Profundidad de la cola. Si sube y no baja, nadie está consumiendo |
| `cola_edad_mas_antiguo` | Mejor señal que la profundidad: una cola de 10 000 que se drena está sana, una de 3 con una fila de hace una hora no |
| `cola_procesando` y `consumidores_activos` | `count(*)` y `count(distinct reclamado_por)` en `procesando`. Techo de concurrencia contra el pool de Supavisor |
| `cola_fallidos` | Debe ser cero. Cualquier valor distinto es una alerta |
| `rescates_total` | Un proceso murió. Cada uno alerta |
| `envenenadas_total` | Una fila mata al normalizador de forma repetida. Severidad alta |
| `cesiones_por_cuerpo` | Cuántas invocaciones necesita un cuerpo. Si sube, el presupuesto de CPU se está quedando corto y hay que recalibrar |
| `cpu_adaptacion_ms` | Tiempo de la sección síncrona por invocación. Es el proxy del presupuesto de 2 s y la señal de que un despliegue lo empeoró |
| `retraso_drenaje_p95` | `encolado_en - recibido_en` en las filas con `origen = 'blobs'`. Cuánto estuvo la base sin servicio |
| `latencia_ingesta_p95` | De `recibido_en` a `messages.created_at`. Es el número que se le promete a la bandeja |
| `firmas_rechazadas_total` | Lo incrementa el receptor sin guardar cuerpo |
| `tenant_no_resuelto_total` | Un canal recién autorizado, o un error de enrutado |
| `cuarentena_pendientes` | Filas sin resolver, por motivo |
| `adjunto_desconocido_total{tipo}` | Detecta un tipo nuevo de Meta el día que aparece |
| `evento_desconocido_total{clave}` | Lo mismo para claves raíz nuevas |
| `echo_app_id_desconocido_total{app_id}` | Hay una tercera herramienta conectada a la Página |
| `host_bloqueado_total{host}` | Cambio de CDN de Meta o intento de SSRF |
| `postback_sin_payload_total` | Se está perdiendo la propiedad del hilo |
| `standby_total` | Lo mismo, con otra señal |

Alertas: cualquier fila en `fallido`, cualquier rescate, cualquier fila envenenada, edad del más
antiguo pendiente por encima de umbral durante 5 minutos, cualquier `tenant_no_resuelto`, cualquier
`host_bloqueado`, primera aparición de un `adjunto_desconocido` de un tipo nuevo, cualquier `app_id`
de echo no visto antes, y `cpu_adaptacion_ms` por encima del 70 % del presupuesto en el p95.

Esa última alerta es la que evita el fallo lento: un despliegue que hace el adaptador un 30 % más
caro no rompe nada el primer día, solo aumenta las cesiones. Sin métrica, se descubre el día que un
cuerpo grande empieza a agotar la CPU y a acumular rescates.

**Criterio de aceptación.** El panel interno muestra las métricas sin exponer texto de mensajes.
Detener el normalizador durante 10 minutos dispara la alerta de edad del más antiguo pendiente.
Desplegar una versión del adaptador deliberadamente lenta dispara la alerta de CPU antes de que
ninguna fila llegue a `fallido`.

---

### Tarea 20 — Arnés de pruebas

El corpus de P8 se guarda como ficheros y el arnés los reproduce. Tres capas:

- **U — unitaria**, sin base de datos ni red, sobre los adaptadores puros: entra payload, sale
  `Efecto[]`. Rápida, exhaustiva, es donde vive la mayoría de los casos y donde se cronometra la
  CPU.
- **B — de base de datos**, sobre Postgres efímero: RPC, subtransacciones, restricciones,
  concurrencia, RLS.
- **Q — de cola y consumidor**, con varios procesos de normalizador reales contra el mismo Postgres
  efímero: reclamo concurrente, cesión, retroceso, huérfanos, rescates, drenaje.

La capa Q ya no necesita simulador de ninguna plataforma: la cola es una tabla y el consumidor es un
proceso. Se levanta con `docker compose` y se ejecuta en integración continua como las otras dos, lo
que es una mejora clara respecto a depender del simulador local de un proveedor.

Un generador reproduce cuerpos: mezcla de tenants, orden aleatorio, duplicados inyectados, tipos
desconocidos, y **tamaños hasta el peor caso real capturado**, que es lo que alimenta las
mediciones. La batería concreta está en la §9.

---

## 5. Esquema del mensaje canónico

El adaptador no escribe: emite efectos. El RPC los materializa. La forma es una unión discriminada,
de modo que una clave raíz nueva de Meta acaba en `desconocido.registrar` y no en una excepción.

```ts
type Efecto =
  | { tipo: 'mensaje.upsert';        mensaje: MensajeCanonico }
  | { tipo: 'mensaje.borrar';        organization_id: string; canal: Canal; mid: string; ts_ms: number }
  | { tipo: 'mensaje.editar';        organization_id: string; canal: Canal; mid: string; texto: string; ts_ms: number }
  | { tipo: 'evento.registrar';      evento: EventoCanonico }
  | { tipo: 'desconocido.registrar'; organization_id: string; canal: Canal; clave: string; raw: unknown };

type Canal = 'messenger' | 'instagram' | 'whatsapp' | 'email';

interface MensajeCanonico {
  // Enrutado. Resuelto ANTES de construir esto.
  organization_id:    string;
  meta_connection_id: string;
  channel_id:         string;
  canal:              Canal;

  // Identidad e idempotencia
  mid:       string;              // clave canónica junto a (organization_id, canal)
  direccion: 'inbound' | 'outbound';
  is_echo:   boolean;
  app_id:    string | null;       // solo en echoes; atribución, no anti-bucle
  metadata:  string | null;       // lo que Kavea pasó al Send API y vuelve en el echo

  // Partes. En un echo vienen INVERTIDAS respecto al payload.
  contacto_scoped_id: string;     // PSID | IGSID | (WhatsApp: sin verificar)
  cuenta_scoped_id:   string;     // page_id | ig_business_account_id | phone_number_id
  emisor:             'contacto' | 'humano' | 'agente';

  // Contenido
  texto:               string | null;
  adjuntos:            AdjuntoCanonico[];   // se materializan como filas de `media`
  reply_to_mid:        string | null;
  reply_to_story:      unknown | null;      // solo Instagram
  quick_reply_payload: string | null;
  referral:            unknown | null;      // atribución a pauta

  // Procedencia y tolerancia
  llego_por_standby: boolean;
  is_unsupported:    boolean;
  raw:               unknown | null;        // solo si is_unsupported o hay adjunto en fallback

  // Procedencia de ingesta. La fase 6 decide con esto si el agente actúa.
  origen_ingesta:   'directo' | 'blobs';
  retraso_ingesta_ms: number;               // encolado_en - recibido_en

  // Tiempo. SIEMPRE el del evento, en milisegundos. Nunca la hora de recepción.
  meta_timestamp_ms: number;
}

interface AdjuntoCanonico {
  tipo:       string;          // valor de attachment.type TAL COMO LLEGA
  reconocido: boolean;         // false → fallback
  cdn_url:    string | null;   // solo si el host pasó la allowlist
  cdn_host:   string | null;   // para auditar
  bloqueado:  boolean;         // host fuera de allowlist
  payload:    unknown;         // payload crudo, siempre
}

interface EventoCanonico {
  organization_id:   string;
  canal:             Canal;
  tipo:              string;   // reaction|read|delivery|postback|edit|delete|handover|referral|optin|…
  target_mid:        string | null;
  actor_scoped_id:   string | null;
  accion:            string | null;
  emoji:             string | null;
  read_watermark_ms: number | null;   // Messenger. No identifica un mensaje.
  read_mid:          string | null;   // Instagram. Un mensaje concreto.
  delivery_mids:     string[] | null;
  postback_payload:  string | null;   // null por standby, y eso es información
  postback_title:    string | null;
  llego_por_standby: boolean;
  meta_timestamp_ms: number;
  raw:               unknown;
}
```

Cuatro decisiones que el tipo hace explícitas:

- `contacto_scoped_id` y `cuenta_scoped_id` en lugar de `sender` y `recipient`. El adaptador ya ha
  resuelto la inversión del echo; el aplicador no tiene que volver a pensarlo.
- `read_watermark_ms` y `read_mid` son campos distintos. Un watermark no identifica un mensaje y un
  `mid` no identifica un instante. Colapsarlos pierde semántica en los dos sentidos.
- `adjuntos[].payload` está siempre, reconocido o no. Es lo que permite reprocesar un tipo nuevo sin
  volver a pedirle nada a Meta, que es el único camino disponible: la Conversations API solo
  devuelve los 20 mensajes más recientes.
- `origen_ingesta` y `retraso_ingesta_ms` viajan en el efecto y no solo en la fila de la cola. Sin
  eso, la fase 6 tendría que hacer una consulta hacia atrás contra `webhook_events` para saber si un
  mensaje llegó con tres horas de retraso, y esa consulta sería contra una tabla cuyo cuerpo se
  purga a los siete días. El dato viaja con el mensaje porque es del mensaje.

---

## 6. Tabla de mapeo por canal

Un modelo canónico y cuatro formas de entrada. Esta tabla es el contrato de cada adaptador. Lo que
está marcado **sin verificar** no se escribe hasta tener un payload real capturado, y así consta en
el `03`.

### 6.1 Mensajes

| Campo canónico | Messenger | Instagram | WhatsApp (sin verificar) | Correo (fuera de v1) |
|---|---|---|---|---|
| `canal` | `messenger` | `instagram` | `whatsapp` | `email` |
| Activo de enrutado | `entry[].id` = Page ID | `entry[].id` = IG professional account ID | `changes[].value.metadata.phone_number_id`; `entry[].id` es la WABA y **no** identifica canal | Dirección de buzón |
| Array de eventos | `entry[].messaging[]` y `entry[].standby[]` | Los mismos dos | `entry[].changes[].value.messages[]` | Webhook de Resend |
| `mid` | `messaging[].message.mid` | Igual | Campo de identificador del mensaje, nombre sin confirmar | Cabecera `Message-ID` |
| `direccion` | `inbound`, salvo `is_echo` | Igual | Sin confirmar si existe equivalente de echo | Por buzón de origen |
| `contacto_scoped_id` | `sender.id` (PSID); en echo, `recipient.id` | `sender.id` (IGSID); en echo, `recipient.id` | Sin confirmar dónde viene el remitente ni si trae número | Dirección del remitente |
| `cuenta_scoped_id` | `recipient.id` = Page ID; en echo, `sender.id` | Igual con el IG account ID | `phone_number_id` | Buzón propio |
| `texto` | `message.text` | Igual | Sin confirmar | Cuerpo, sin citas |
| `adjuntos[]` | `message.attachments[]` con `type` y `payload.url` | Igual, con tipos propios de IG | Sin confirmar | Adjuntos MIME |
| `reply_to_mid` | `message.reply_to.mid` | Igual | Sin confirmar | `In-Reply-To` |
| `reply_to_story` | No existe | `message.reply_to.story` | No existe | No existe |
| `quick_reply_payload` | `message.quick_reply.payload` | Igual | No confirmado | No existe |
| `referral` | `messaging[].referral` o `message.referral` | Igual | No confirmado | No existe |
| `is_echo` / `app_id` | `message.is_echo`, `messaging[].app_id` | Igual, disponibilidad en disputa (§12) | Sin confirmar | No aplica |
| `llego_por_standby` | Cierto si vino de `standby[]` | Igual, disponibilidad en disputa (§12) | No existe | No existe |
| Borrado | No documentado | `message.is_deleted` con el mismo `mid` | Sin confirmar | No existe |
| `meta_timestamp_ms` | `messaging[].timestamp`, milisegundos | Igual | `value.messages[].timestamp`, **verificar unidad** | Cabecera `Date` |

Dos avisos que valen más que la tabla. **El `timestamp` de Meta viene en milisegundos y el de
WhatsApp hay que verificarlo**: si viniera en segundos y se tratara como milisegundos, todos los
mensajes de ese canal aparecerían en 1970 y la ventana de 24 h se calcularía sobre una fecha
imposible. Y **el enrutado de WhatsApp no es `entry[].id`**, que es el error natural de quien
extrapola desde Messenger.

### 6.2 Eventos sin `mid` propio

| Evento canónico | Messenger | Instagram | WhatsApp (sin verificar) |
|---|---|---|---|
| `reaction` | `messaging[].reaction` con `mid`, `action`, `emoji` | Igual; disponibilidad en disputa (§12) | Sin confirmar |
| `read` | `messaging[].read.watermark` | `messaging[].read.mid` (`messaging_seen`) | Estado `read` en `value.statuses[]`, sin confirmar |
| `delivery` | `messaging[].delivery` con `watermark` y `mids[]` | No existe | Estado `delivered` en `value.statuses[]`, sin confirmar |
| `postback` | `messaging[].postback` con `payload` y `title` | Igual | Botones de plantilla, sin confirmar |
| `edit` | `messaging[].message_edit`; existencia en disputa (§12) | Igual | Sin confirmar |
| `delete` | Derivado del mensaje con `is_deleted` | Igual | Sin confirmar |
| `handover` | `messaging[].pass_thread_control` y familia, con `app_roles` | Igual; disponibilidad en disputa (§12) | No existe |
| `optin` | `messaging[].optin` | Igual; disponibilidad en disputa (§12) | No existe |
| Clave desconocida | Cualquier otra clave raíz | Igual | Cualquier otra clave en `changes[].value` |

Los estados de WhatsApp viven en `value.statuses[]`, un array distinto de `value.messages[]`. Es la
diferencia estructural más grande con Messenger e Instagram, donde el acuse llega como una entrada
más del mismo array de mensajería, y es la razón por la que el adaptador C es un adaptador y no una
variante.

---

## 7. La barrera de tenant en el esquema

Esta sección tiene rango propio porque resuelve, dentro de la base de datos, el fallo que el `03`
califica como el peor posible.

**El problema.** El `02` §7.7 lo dice con todas las letras: *"RLS protege la lectura, no la
escritura de ingesta. El worker de webhooks usa el rol de servicio y salta RLS por diseño."* Lo
que impide que escriba en el tenant equivocado es la clave primaria de `meta_asset_routes`. Eso es
correcto y es la primera línea, pero es **una sola** línea, y vive en el código del normalizador.

**Lo que no cubre.** La clave primaria garantiza que un `asset_id` resuelve a una organización o a
ninguna. No garantiza que el resto del efecto sea coherente. Un fallo de programación en el
aplicador —una variable reutilizada en un bucle, un `organization_id` de la iteración anterior—
puede insertar un `messages` con `organization_id` de la org A y `conversation_id` de una
conversación de la org B. Ningún índice del `02` §7 lo impide, porque todas las claves foráneas son
simples: `conversation_id` referencia `conversations(id)` sin mirar la organización.

El resultado sería una fila que la política de RLS de la org A muestra, con el contenido de una
conversación de la org B. Es el incidente de cruce de datos, y llegaría con RLS "activado".

Y hay una razón nueva para que esto no sea opcional: **el troceado de la tarea 3 multiplica los
estados intermedios.** Un cuerpo que se procesa en cuatro invocaciones, con reanudaciones y con
memoización de tenant dentro del proceso, tiene más superficie para ese error que un bucle simple.
La defensa estructural pasa de recomendable a proporcionada al riesgo.

**La barrera.** Claves foráneas compuestas que arrastran `organization_id` por toda la cadena.
Cuestan un índice único adicional por tabla padre y hacen el error imposible de cometer:

```sql
create unique index conversations_org_id_idx on public.conversations (organization_id, id);
create unique index contacts_org_id_idx      on public.contacts      (organization_id, id);
create unique index messages_org_id_idx      on public.messages      (organization_id, id);

alter table public.messages
  add constraint messages_conv_mismo_tenant
  foreign key (organization_id, conversation_id)
  references public.conversations (organization_id, id) on delete cascade;

alter table public.conversations
  add constraint conversations_contacto_mismo_tenant
  foreign key (organization_id, contact_id)
  references public.contacts (organization_id, id) on delete cascade;

alter table public.contact_identities
  add constraint identidades_contacto_mismo_tenant
  foreign key (organization_id, contact_id)
  references public.contacts (organization_id, id) on delete cascade;

alter table public.message_events
  add constraint eventos_conv_mismo_tenant
  foreign key (organization_id, conversation_id)
  references public.conversations (organization_id, id) on delete cascade;

alter table public.media
  add constraint media_mensaje_mismo_tenant
  foreign key (organization_id, message_id)
  references public.messages (organization_id, id) on delete cascade;
```

**Qué cambia con esto.** El sistema pasa de una defensa a tres, en capas independientes:

1. **Resolución** — `meta_asset_routes` con `asset_id` como clave primaria decide de quién es el
   evento. Vive en el código del normalizador.
2. **Estructura** — las claves foráneas compuestas impiden coser filas de tenants distintos. Vive
   en Postgres y no depende de que nadie se acuerde.
3. **Lectura** — RLS por membresía. Vive en Postgres y solo protege el plano de lectura.

Las tres son necesarias. La segunda es la que faltaba, y es la más barata: cinco restricciones y
tres índices.

**Criterio de aceptación.** Un `insert` en `messages` con un `conversation_id` de otra organización
falla con violación de clave foránea. Una prueba lo intenta explícitamente con el rol de servicio y
espera el error; si algún día pasa, la prueba falla.

---

## 8. Qué se corrige aguas arriba

Los planes de fase señalan las erratas en vez de arrastrarlas. Estas son las que esta fase encuentra
y no puede corregir por su cuenta.

### 8.1 En el documento 02 §7

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **`webhook_events` conserva forma de cola** —`procesado_en`, `intentos`, `error`, índice parcial `where procesado_en is null`— | **Deja de ser errata.** Con la cola en Postgres, esas columnas vuelven a significar lo que decían. Lo que falta es lo que añade la tarea 1: `estado`, `disponible_en`, `reclamado_en`, `reclamado_por`, `rescates`, `cursor_update`, `updates_total`, `origen`, `blob_key`, `encolado_en`. El índice parcial sí cambia: ordena por `disponible_en`, no por `recibido_en` |
| 2 | **`firma_ok` no puede variar** si el receptor nunca inserta cuerpos con firma inválida | Se documenta como afirmación defensiva. El contador real de rechazos vive en `ingesta_metricas`. Nadie debe construir una alerta sobre una columna que no varía |
| 3 | **`webhook_events` no tiene retención** | Propuesta de la tarea 18: cuerpo a nulo a los 7 días, fila a los 90, nada automático sobre lo fallido. Decisión de Gabriel |
| 4 | **El índice único parcial de `conversations` usa `where status = 'open'`** | **Corregido en la tarea 1** a `where estado <> 'cerrada'`, con los cuatro estados. Hay que reflejarlo en el `02` §7.4 |
| 5 | **El dominio `canal_meta` está restringido a `('messenger','instagram')`** y `meta_asset_routes.tipo` a `('page','ig_business_account')` | Ninguno admite WhatsApp ni correo. Se amplían cuando el canal entre. Que lo impida un `check` y no un `enum` es exactamente por qué el `02` prohíbe los `enum` |
| 6 | **Claves foráneas simples** | Ver §7 |
| 7 | **`media` nombra el almacén saliente como R2**: valor `kavea_r2`, columnas `r2_bucket` y `r2_key` | La media saliente pasa a Supabase Storage. No bloquea esta fase, que no escribe ninguna fila con ese origen, pero hay que renombrar antes del bloque 4. La media **entrante** no cambia: solo la URL, nunca el binario, que es invariante del `03` |

### 8.2 En el documento 06

`06` §1.1 describe la ingesta sobre Netlify Functions, la cola sobre Postgres con drenaje por
Netlify Scheduled Functions, y la media saliente en Cloudflare R2. De eso sobrevive el amortiguador
en Netlify Blobs y la cola en Postgres. Hay que corregir:

- Receptor y normalizador: **Supabase Edge Functions**, con los límites de 400 s de reloj, 2 s de
  CPU y 256 MB.
- Crones: **`pg_cron` con `pg_net`**, no Scheduled Functions.
- Media saliente: **Supabase Storage**, no R2.
- El párrafo sobre el token bucket por `page_id` con `pg_advisory_xact_lock` sigue siendo válido y
  gana argumento: con Supavisor en modo transacción, el bloqueo de ámbito de transacción es
  precisamente el que sigue disponible.
- La afirmación de que "función sincrónica limitada a 10 segundos" deja de aplicar; el techo
  relevante ahora es el de CPU, no el de reloj.

### 8.3 En el índice de fases

**Corregido el 2-ago-2026.** `fases/README.md` §3 ya lista la arquitectura de dos proveedores y
§7 recoge las erratas vigentes del `02`, incluidas las claves foráneas compuestas, el índice
único parcial y el nombrado de la tabla `media`. La verificación número 12 de su §5 —TTL de las URLs de `lookaside`— sigue
en pie y sigue siendo de esta fase y de la 3.

---

## 9. Batería de pruebas

Cada caso indica su capa: **U** unitaria sobre adaptadores puros, **B** de base de datos, **Q** de
cola y consumidor.

| # | Caso | Montaje | Resultado esperado |
|---|---|---|---|
| 1 | **Entrega duplicada** (B+Q) | El mismo cuerpo se procesa tres veces, una de ellas por rescate real de un bloqueo huérfano | Una fila en `messages`. Un solo Broadcast. Ninguna entrada nueva en la cola del agente en la 2.ª y 3.ª pasada. `last_message_at` idéntico tras las tres |
| 2 | **Entrega fuera de orden** (B) | Tres mensajes con timestamps t1 < t2 < t3 procesados en orden t3, t1, t2 | El hilo ordenado por `meta_timestamp` da t1, t2, t3. `last_incoming_at` = t3 tras las tres, y no baja al procesar t1 |
| 3 | **Unsend con mensaje presente** (B) | Mensaje, luego `{mid, is_deleted:true}` | `deleted_at` no nulo, `texto` nulo, sin filas en `media`, recuento de `messages` sin cambios, evento `delete` con `aplicado_en` puesto |
| 4 | **Unsend antes del mensaje** (B) | El unsend primero, el mensaje 10 min después | Tras el unsend: cero filas en `messages`, evento con `aplicado_en` nulo. Tras el mensaje: una fila, ya con `deleted_at`, evento aplicado, y en ningún momento visible con texto |
| 5 | **Edición** (B) | Mensaje, luego `message_edit` con el mismo `mid` | Una fila, `texto` nuevo, `edited_at` puesto, texto anterior recuperable desde el `raw` del evento. Recuento sin cambios |
| 6 | **Edición repetida** (B) | Dos ediciones del mismo `mid` con timestamps distintos | Una fila de mensaje, dos filas de evento `edit` |
| 7 | **Echo propio** (B) | Echo con `app_id` de Kavea, correlacionado por `metadata` con un envío sintético | `direccion='outbound'`, `emisor='agente'`, misma `conversation_id` que los entrantes de ese contacto, `last_incoming_at` intacto, cero disparos del agente |
| 8 | **Echo ajeno** (B) | Echo con `app_id` de la bandeja de Business Suite y otro con `app_id` inventado | Ambos persistidos con `emisor='humano'`. El inventado incrementa `echo_app_id_desconocido_total` y alerta. Ninguno dispara el agente. Ninguno crea contacto con el Page ID como `scoped_id` |
| 9 | **Adjunto de tipo desconocido** (U+B) | `attachment.type = 'xyz_inventado'` | Fila en `media` con ese tipo y el payload crudo, métrica incrementada, mensaje persistido, cero excepciones. El resto del cuerpo se procesa |
| 10 | **Sticker sin copia como imagen** (U) | Adjunto solo `sticker`, sin `image` | Persistido como sticker. Simula el estado posterior al 30-ago-2026 |
| 11 | **Cuerpo de 1000 updates, troceado y subtransacciones** (U+B+Q) | Un cuerpo con 1000 mensajes de 50 contactos | 1000 mensajes, 50 conversaciones, 50 contactos. El cuerpo se completa aunque necesite varias invocaciones, `cursor_update = updates_total`. Ningún backend con el caché de subtransacciones desbordado. El tiempo de adaptación crece de forma lineal con 100, 500 y 1000. Reprocesar no crea nada |
| 12 | **Cuerpo de 1000 con una envenenada** (B+Q) | Igual, con la actualización 500 malformada | 999 mensajes persistidos, el RPC devuelve `error` para la 500, una fila en `webhook_cuarentena` con su sub-payload, el cursor avanza por encima de ella y el cuerpo acaba en `hecho`, no en `fallido` |
| 13 | **Aislamiento entre tenants** (B) | Cuerpo con `entry[]` de dos organizaciones intercalados | Cada mensaje en su organización. Leyendo con el rol `authenticated` de cada una, cada usuario ve solo lo suyo y la suma cuadra |
| 14 | **`asset_id` no resoluble** (B+Q) | Identificador inventado | Cero filas de negocio. Una fila en `webhook_cuarentena` con motivo `tenant_no_resuelto`. Cuerpo en `hecho`, no reintentado. Alerta. Al crear la ruta, el barrido lo reinyecta y aparece el mensaje |
| 15 | **Postgres caído 20 minutos** (Q) | Se corta el acceso a la base mientras Meta entrega | El receptor responde 200 a todo y vuelca a Blobs. Al volver, el drenaje inserta con `origen='blobs'` y `recibido_en` anterior a `encolado_en`. Todos los mensajes se persisten una sola vez. La cola no pierde ninguna fila que ya estuviera en `pendiente` |
| 16 | **Proceso muerto tras reclamar** (Q) | Matar el normalizador entre el reclamo y el cierre | Las filas quedan en `procesando`; a los 10 minutos el recuperador las devuelve a `pendiente`; el reproceso devuelve `duplicado` para lo ya escrito y no crea ninguna fila ni ningún Broadcast. `intentos` no se ha incrementado |
| 17 | **Reasignación de activo entre organizaciones** (B+Q) | Cambiar `organization_id` de una fila de `meta_asset_routes` con la cola vacía, y luego con un cuerpo en vuelo | Con la cola vacía, todo lo posterior va a la organización nueva y nada queda en la antigua. Con un cuerpo en vuelo, ese cuerpo termina en la antigua y se documenta como la ventana real del procedimiento. Sin caché no hay obsolescencia que esperar |
| 18 | **Standby** (B) | El mismo mensaje en `standby[]` en vez de `messaging[]` | Fila idéntica salvo `llego_por_standby = true`. `conversations.en_standby` a cierto |
| 19 | **Postback por standby** (B) | Postback sin campo `payload` | Evento con `postback_payload` nulo, métrica `postback_sin_payload_total`, cero excepciones |
| 20 | **Reacción y su retirada** (B) | `react` y `unreact` del mismo actor sobre el mismo `mid` | Dos filas en `message_events`. Reprocesar ambas no añade filas |
| 21 | **Acuses de los dos modelos** (B) | `read.watermark` de Messenger y `read.mid` de Instagram | Cada uno en su columna. Ninguno escribe en la del otro |
| 22 | **Host fuera de allowlist** (B) | `attachment.payload.url` en `evil.example.com`, y otra en `169.254.169.254` | URL no persistida, mensaje sí, `is_unsupported` marcado, `host_bloqueado_total` incrementado, alerta, cero excepciones |
| 23 | **Firma inválida** (Q) | `POST` al receptor con firma incorrecta | Cero filas en `webhook_events`, cero en Blobs, el contador de rechazos sube. Frontera con la fase 1, se comprueba desde aquí porque es la precondición del filtro `firma_ok` del reclamo |
| 24 | **Concurrencia de conversación** (B) | Diez llamadas simultáneas con el mismo `(org, canal, contacto)`, con la existente en `nueva`, en `en_curso` y en `esperando` | Una conversación en los tres casos, diez veces el mismo identificador devuelto |
| 25 | **Clave raíz desconocida** (U) | `messaging[]` con una clave que Meta no documenta hoy | Efecto `desconocido.registrar`, métrica, el resto del cuerpo intacto |
| 26 | **Basura estructurada** (U) | `entry` nulo, `messaging` como objeto, campos ausentes, cadenas donde van objetos | Ningún adaptador lanza. Todo acaba en efectos o en `desconocido.registrar` |
| 27 | **Cruce de tenant a nivel de esquema** (B) | `insert` deliberado en `messages` con `conversation_id` de otra organización, con rol de servicio | Falla con violación de clave foránea |
| 28 | **Fusión de contactos con conversación viva en el mismo canal** (B) | Dos contactos, uno con conversación en `en_curso` y otro en `esperando`, ambos en Instagram | La fusión no viola el índice único parcial. La menos reciente queda cerrada con registro. La reversión devuelve el estado exacto |
| 29 | **Reclamo concurrente** (Q) | Diez normalizadores contra una cola de 500 filas, más un millón de filas en `hecho` | Las 500 se procesan exactamente una vez. Ninguna fila reclamada por dos. Sin esperas mutuas medibles. El `explain` del reclamo sigue siendo recorrido de índice |
| 30 | **Fila envenenada que mata al proceso** (Q) | Un cuerpo que agota la memoria del normalizador de forma determinista, con otras filas detrás | Tres rescates, luego `fallido` con el cursor de la actualización culpable en el `error`. Las filas de detrás se procesan igual. La cola no se detiene |

Los casos 1, 2, 3, 5, 7, 8, 9 y 11 son los exigidos por el alcance de la fase. Del 12 al 28 cubren
huecos que se descubrieron al escribir el plan. Los casos 29 y 30 son nuevos y los exige el
mecanismo de cola en Postgres: sin ellos, ni el reclamo concurrente ni el tope de rescates estarían
comprobados por nada.

### 9.1 Mediciones de calibración

No son pruebas de aprobado o suspenso: son números que hay que obtener antes de fijar constantes.
Cada uno tiene una cifra concreta que producir y una constante que depende de él. **Sin M1 y M2 el
troceado de la tarea 3 es adivinación.**

| # | Qué se mide | Cifra a obtener | Qué constante fija |
|---|---|---|---|
| **M1** | Coste de CPU del parseo, aislado del resto, sobre el peor cuerpo real capturado | Milisegundos de parseo por cada 100 KB de cuerpo, y qué fracción de los 2 s consume el peor caso | Si el peor caso pasa del 30 % del presupuesto, el troceado no compensa y hay que partir los cuerpos en el receptor. Es la medición número uno de la fase |
| **M2** | Coste de CPU de la adaptación, por actualización, por canal | Milisegundos por actualización en Messenger y en Instagram, con el p95 y no solo la media | El tope de actualizaciones por invocación, que es el freno principal de la tarea 3 |
| **M3** | Memoria residente al parsear el peor cuerpo | MB por cada MB de `cuerpo_bytes` | El `cuerpo_bytes` máximo que cabe en 256 MB, y por tanto el umbral a partir del cual el receptor tiene que trocear |
| **M4** | Consumo de subtransacciones con `ingerir_lote` a 64 efectos | Si algún backend queda marcado como desbordado durante un cuerpo de 1000 | Confirma o corrige el troceado a 64 de la tarea 9 |
| **M5** | Ocupación del pool de Supavisor con N normalizadores concurrentes | Conexiones ocupadas por normalizador y umbral de agotamiento | El intervalo del amortiguador de despacho y el umbral de la alerta de `consumidores_activos` |
| **M6** | Latencia de extremo a extremo, de `recibido_en` a `messages.created_at` | p50, p95 y p99 con tráfico real de un día | El presupuesto que se le promete a la bandeja. Decisión de Gabriel en la §12 |

---

## 10. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fallo de enrutado de tenant | Mensajes de un cliente en el tenant de otro. El peor fallo del sistema | Clave primaria de `meta_asset_routes`, claves foráneas compuestas de la §7, cuarentena sin organización de respaldo, sin caché que pueda quedarse obsoleta, pruebas 13, 17 y 27 |
| **El presupuesto de 2 s de CPU se queda corto** | El normalizador cede constantemente, el parseo se paga N veces y la latencia se dispara | Troceado con cursor, tope de actualizaciones calibrado con M2, alerta sobre `cpu_adaptacion_ms` al 70 %, regla de linealidad en los adaptadores. Si M1 dice que el parseo solo ya no cabe, el receptor trocea los cuerpos grandes al encolar |
| **El parseo del peor cuerpo no cabe en el presupuesto** | Un cuerpo grande no se puede procesar nunca, en ninguna invocación: la fila entra en bucle de rescates | M1 lo detecta antes de escribir código. El tope de rescates de la tarea 5 lo convierte en `fallido` con alerta en vez de en una caída de la ingesta |
| Postgres caído y el receptor vivo | La cola no avanza | Los eventos se acumulan en Blobs, el receptor responde 200 y Meta no desuscribe. Prueba 15 |
| Proyecto de Supabase entero caído | Meta desuscribe la Página a la hora, en silencio y por cliente | Sin mitigación dentro de la arquitectura. Riesgo aceptado y documentado en la §2.2. El cron de reconciliación de suscripciones de la fase 1 es lo que reduce el tiempo de recuperación |
| Bloqueos huérfanos tras un proceso muerto | Filas en `procesando` para siempre, con la cola de pendientes aparentemente vacía | Recuperador cada 5 minutos con plazo de 10, derivado del techo de 400 s. Alerta por cada rescate. Prueba 16 |
| Fila envenenada que mata al normalizador en bucle | Caída permanente de toda la ingesta, no solo de esa fila | Tope de tres rescates y paso a `fallido` con el cursor culpable. Prueba 30 |
| Desbordamiento del caché de subtransacciones | Degradación de **toda** la base, incluida la bandeja de tenants ajenos | Troceado a 64 efectos por transacción, impuesto por la propia función. Medición M4 y prueba 11 |
| Invocación en tromba del normalizador | Agotamiento del pool de Supavisor, que es el recurso escaso | Amortiguador de despacho a un disparo cada 2 s, sucesor encadenado para el drenaje, métrica `consumidores_activos` con alerta calibrada por M5 |
| Un update roto reintenta el cuerpo entero | Reproceso inútil de 999 updates y posible bucle | Clasificación transitorio contra permanente, cuarentena por update, cursor que avanza por encima del roto, prueba 12 |
| Eventos que entran horas tarde por el drenaje | La respuesta automática llega fuera de los 30 s que exige Meta | El normalizador marca `origen_ingesta` y `retraso_ingesta_ms` en el efecto; la fase 6 decide si responde. La alternativa —descartar el mensaje— es peor |
| Conversación aparcada que se reabre por un mensaje viejo drenado | El operador pierde su decisión de dejarla en espera | La transición a `en_curso` solo ocurre si `last_incoming_at` avanza de verdad. Prueba en el criterio de la tarea 15 |
| `standby` no disponible en Instagram vía Facebook Login | Kavea ciega y muda para ese cliente, sin error visible | El parser lo lee desde el día uno. Comprobación empírica en la §12. Métrica `standby_total` para detectar el día que empiece a llegar |
| Excepción en el parser tumba el cuerpo | Pérdida de todos los mensajes del lote, no solo del afectado | Subtransacción por efecto en el RPC, parser tolerante, prueba 12 |
| Tipo nuevo de adjunto de Meta | El parser deja de reconocer contenido | Fallback con payload crudo y métrica con alerta a la primera aparición. `raw` guardado permite reprocesar sin pedir nada a Meta, que además no lo daría: la Conversations API solo devuelve 20 mensajes |
| 30 de agosto de 2026: stickers solo como `sticker` | Los stickers dejan de verse en la bandeja | `sticker` es tipo de primera clase desde ahora. Prueba 10 |
| Descarga de media entrante por iniciativa de alguien | Rechazo del App Review, con precedente documentado | Solo URL, restricción `media_origen_coherente`, sin ruta de código que descargue, SafeFetch sin llamantes y regla de análisis estático |
| Rebobinado de `last_incoming_at` | Envío fuera de la ventana de 24 h, error 100 o violación de política | Avance monótono con `greatest`, pruebas 2 y 17 |
| Echo re-disparando al agente | Bucle de respuestas y quema del número o de la Página del cliente | Ningún echo dispara al agente, con independencia del `app_id`. Pruebas 7 y 8 |
| Conversaciones duplicadas | Hilo partido en la bandeja, contexto perdido para el agente | Índice único parcial con el predicado corregido a `estado <> 'cerrada'` más función de resolución con relectura. Prueba 24 |
| Fusión errónea de contactos | Dos historiales comerciales mezclados. Incidencia de privacidad | Cero fusión automática entre canales de Meta. Fusión manual, auditada y reversible |
| `webhook_events` como fuga de contenido | Tabla multi-tenant, sin `organization_id`, con el cuerpo íntegro de todos los mensajes | RLS con cero políticas, solo rol de servicio, nunca expuesta por PostgREST, cuerpo a nulo a los 7 días y fila a los 90 |
| Hinchazón de `webhook_events` como tabla de trabajo | El reclamo deja de ser un acierto de índice y la cola se degrada sola | Índices parciales que solo ven lo pendiente, `fillfactor` y autovacuum agresivo desde la migración, purga diaria. Prueba 29 con un millón de filas históricas |
| Forma real del payload de WhatsApp distinta de la supuesta | El adaptador C se reescribe entero | No se escribe hasta tener payload real capturado. La interfaz sí, para que el resto no dependa de ello |
| `messages` sin techo de crecimiento | Coste de Supabase y degradación de consultas | `raw` solo cuando hay algo que reprocesar. Sin particionado en v1; la salida es archivar conversaciones cerradas |

---

## 11. Definición de terminado

La fase está terminada cuando **todo** lo siguiente se cumple. No hay parciales: el criterio de
avance del `00` §9 es que no se pasa de fase con deuda de la anterior.

1. Los 30 casos de la §9 pasan en integración continua —unitarios, de base efímera y de cola con
   varios procesos reales— en cada `push`.
2. Las seis mediciones de la §9.1 están hechas, con su cifra anotada, y las constantes del troceado
   se derivan de ellas y no de una suposición.
3. Mensajes reales de Instagram y de Messenger de la cuenta de Boosty entran por el receptor, pasan
   por la cola y aparecen normalizados en `messages`, con su conversación, su contacto y su media,
   sin intervención manual.
4. Reproducir 24 horas de tráfico real capturado deja exactamente el mismo estado que procesarlo
   una vez.
5. Con Postgres inaccesible 20 minutos no se pierde ningún evento, el receptor devuelve 200 a todo y
   el drenaje de Blobs lo recupera entero.
6. Un cuerpo con 1000 actualizaciones se completa, con las invocaciones que hagan falta, sin dejar
   ninguna actualización sin aplicar y sin duplicar ninguna.
7. Matar el normalizador en cualquier punto del ciclo —tras reclamar, a mitad de un tramo, entre dos
   grupos de 64— no pierde nada y no duplica nada.
8. Ninguna escritura sobre tablas de negocio ocurre fuera del RPC, verificado por análisis estático.
9. Ninguna llamada de red usa una URL procedente de un webhook. El contador de llamantes de
   SafeFetch es cero, y es intencionado.
10. Las claves foráneas compuestas de la §7 están aplicadas y la prueba 27 falla si alguien las
    quita.
11. Los cuatro estados de conversación están aplicados y el índice único parcial usa
    `estado <> 'cerrada'`. La prueba 24 falla si alguien lo devuelve a `estado = 'nueva'`.
12. Las métricas de la tarea 19 se ven en el panel interno y las alertas disparan en una prueba de
    humo, incluida la de CPU.
13. La purga de `webhook_events` corre y se ha comprobado que pone cuerpos a nulo y que borra. El
    recuperador de huérfanos ha rescatado una fila real en una prueba.
14. El `02` §7 y el `06` §1.1 recogen las correcciones de la §8, o queda escrito por qué no.
15. Cada punto de la §12 está o resuelto con evidencia, o registrado como pendiente con responsable
    y fecha. Un incierto sin dueño es deuda.

---

## 12. Preguntas abiertas

Salen de la sección `inciertos` del `03`, de contradicciones detectadas al escribir este plan y de
límites de plataforma que solo se cierran midiendo. Ninguna se resuelve leyendo más documentación.

**Bloquean la fase:**

1. **Cuánta CPU consume el parseo del peor cuerpo real.** Si el parseo solo ya se come una fracción
   grande de los 2 segundos, el troceado con cursor no basta y hay que partir los cuerpos en el
   receptor, lo que es un cambio en la fase 1. *Comprobación:* medición M1, sobre el peor cuerpo
   capturado en P8. Es lo primero que se mide y lo primero que se escribe.
2. **Cuántas actualizaciones caben en el presupuesto de CPU.** Fija el tope por invocación, que es
   el freno principal del troceado. *Comprobación:* medición M2, por canal y con p95.
3. **Forma real del payload de WhatsApp.** Del `03` solo consta
   `object='whatsapp_business_account'` y la ruta `entry[].changes[].value.messages[]`. Todo lo
   demás —nombres de campo, dónde viene el identificador del remitente, si hay número de teléfono,
   si el timestamp está en segundos o en milisegundos, cómo llegan los estados de entrega, si hay
   equivalente de echo— es desconocido. *Comprobación:* capturar payloads reales de un número de
   prueba antes de escribir el adaptador C.
4. **Enrutado de WhatsApp por `phone_number_id`.** La tarea 7 propone registrar filas de tipo `waba`
   y `phone_number` en `meta_asset_routes`. Falta confirmar que `entry[].id` es efectivamente la
   WABA y que `value.metadata.phone_number_id` llega siempre. *Comprobación:* un webhook real con
   dos números en la misma WABA.

**No bloquean, pero condicionan lo que se puede prometer:**

5. **Cuántos normalizadores concurrentes soporta el pool de Supavisor** antes de que la ingesta se
   convierta en el cuello de botella de la base. Determina el intervalo del amortiguador de
   despacho. *Comprobación:* medición M5, con tráfico sintético en ráfaga.
6. **Si `standby`, `message_echoes`, `message_reactions` y `messaging_handover` llegan de verdad en
   Instagram por la vía Facebook Login.** Dos páginas oficiales se contradicen. Sin `standby`, Kavea
   se queda ciega cuando Business Suite se apropia del hilo. *Comprobación:* suscribir, mover una
   conversación a Main en Business Suite y observar dónde llegan los eventos.
7. **Si `message_edit` existe realmente.** Aparece en el changelog del 10-sep-2025 pero no en la
   tabla viva de campos suscribibles. *Comprobación:* suscribir y editar un mensaje.
8. **Valor real de `object` en los webhooks de Instagram**, `page` o `instagram`. No cambia el
   diseño —se enruta por `entry[].id`— pero cierra un incierto. *Comprobación:* leer el campo de un
   webhook real.
9. **Nombres exactos de `subscribed_fields`:** `messaging_referral` frente a `messaging_referrals`,
   `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a
   `messaging_reactions`. Un valor fuera del enum hace fallar la suscripción entera.
   *Comprobación:* Graph API Explorer.
10. **Si el `mid` del echo coincide con el `message_id` que devuelve el Send API.** Si coinciden, la
    correlación la resuelve el `on conflict do nothing`. Si no, hace falta el camino por `metadata`.
    *Comprobación:* enviar y capturar el echo, en el bloque 4.
11. **Si Instagram admite el campo `metadata` en el envío y lo devuelve en el echo.** Los ejemplos
    oficiales de Instagram no lo muestran. Sin él, la correlación de salientes propios en Instagram
    no tiene segundo camino. *Comprobación:* envío real.
12. **App ID de la bandeja de Meta Business Suite:** `263902037430900` (15 dígitos) frente a
    `26390203743090` (14). La decisión de que ningún echo dispare al agente lo saca del camino
    crítico, pero sigue haciendo falta para atribuir correctamente. *Comprobación:* leer el `app_id`
    de un echo enviado desde Business Suite.
13. **TTL de las URLs de `lookaside.fbsbx.com`** y si requieren token. No está documentado. Determina
    qué se le puede prometer al cliente sobre ver una imagen de hace un mes, y con el drenaje de
    Blobs por medio puede consumirse antes de que el mensaje llegue a la bandeja. *Comprobación:*
    guardar una URL real y sondearla hasta que devuelva 403 o 404.
14. **Si el navegador del usuario puede renderizar directamente una URL de `lookaside`** sin proxy y
    sin credenciales. Si no puede, la bandeja del bloque 3 tiene un problema que no se resuelve con
    un proxy propio, porque proxear es cachear. *Comprobación:* abrir una URL real desde una sesión
    limpia.
15. **Si Meta permite la descarga efímera en memoria para visión.** La política prohíbe
    *storing/caching the media content* y no dice nada sobre procesamiento transitorio. Es una
    decisión de riesgo, no un hecho. *Comprobación:* consulta por escrito a Meta Developer Support
    antes del App Review, con la respuesta guardada.

**Decisiones de Gabriel:**

16. **Retención de `webhook_events` y de `webhook_cuarentena`.** La propuesta de la tarea 18 es
    cuerpo a nulo a los 7 días, fila a los 90, y nada automático sobre lo fallido ni sobre la
    cuarentena. El plazo definitivo lo fija lo que diga la política de privacidad publicada; la
    forma de dos plazos es decisión técnica y ya está tomada.
17. **Presupuesto de latencia de ingesta.** Se propone p95 por debajo de 5 s de recepción a mensaje
    persistido, para dejar margen dentro de los 30 segundos que Meta exige a las respuestas
    automáticas. La medición M6 dice si es alcanzable.
18. **Si el agente debe responder a un mensaje que entró con horas de retraso** por el drenaje de
    Blobs. El normalizador entrega el dato y no decide. Es una decisión de producto que la fase 6
    necesita antes de escribirse.

**Cerradas por el cambio de arquitectura o por decisión posterior:**

- *Tamaño máximo de mensaje de la cola.* Ya no aplica: una fila de Postgres no tiene el tope de
  128 KB que tenía Cloudflare Queues. El techo ahora es la memoria del normalizador, y eso se mide
  en M3.
- *Si `pg_cron` admite intervalos sub-minuto.* No hace falta. El camino rápido es la invocación del
  receptor por `pg_net`; el cron es solo la red de seguridad y un minuto le sobra.
- *Si `pending` debe entrar en el predicado del índice único parcial de `conversations`.* Cerrada
  por los cuatro estados: el predicado es `estado <> 'cerrada'` y cubre los tres estados vivos.
- *Obsolescencia de la caché de enrutado.* Cerrada al eliminar la caché.
- *Observabilidad partida entre dos proveedores.* Cerrada: las métricas viven todas en Postgres.
