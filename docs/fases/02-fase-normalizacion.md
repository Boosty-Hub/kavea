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
> receptor es Cloudflare R2.

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
   amortiguador de Cloudflare R2 de la fase 1 no es una cola: cuando Postgres no está, el receptor
   vuelca el cuerpo crudo en R2 y un drenaje lo recoge después. Un mensaje puede entrar en
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
| P3 | Columnas de cola sobre `webhook_events` aplicadas: `estado`, `disponible_en`, `reclamado_en`, `reclamado_por`, `rescates`, `cursor_update`, `updates_total`, `origen`, `r2_key`, `encolado_en` | Las trae la fase 1; si no, las trae la tarea 1 de esta fase. Ver §2.1 |
| P4 | Camino de R2 operativo: el receptor vuelca a R2 cuando Postgres falla y el drenaje inserta esos cuerpos en `webhook_events` con `origen = 'r2'` | Apagar Postgres, mandar tres mensajes, ver tres 200 y las tres filas al volver |
| P5 | `pg_cron` y `pg_net` habilitados en el proyecto, y el secreto de invocación del normalizador guardado en Vault y legible solo por el rol de servicio | `cron.schedule` acepta un trabajo y `net.http_post` sale de la base |
| P6 | Cadena de Supavisor en **modo transacción** disponible para las Edge Functions, con tamaño de pool acordado | El normalizador abre conexión y ejecuta el reclamo |
| P7 | Al menos una fila real en `meta_connections` y sus filas correspondientes en `meta_asset_routes` (Página de Boosty y cuenta de Instagram vinculada) | La resolución de un `entry[].id` real devuelve una organización |
| P8 | Corpus de payloads reales capturado y guardado como ficheros para el arnés de pruebas, **con el peor caso de tamaño incluido** | Existe `tests/payloads/` con al menos un ejemplar de cada forma de la §7 del `02` |
| P9 | `GRAPH_API_VERSION=v26.0` como variable única | Aunque esta fase no llama a Graph, el arnés no introduce la primera excepción |

Sobre P8: es la parte de la fase que no se acelera escribiendo código. Cada payload que no se
tenga capturado es una rama del parser escrita a ciegas, y sin el peor caso de tamaño no se puede
calibrar el troceado de la tarea 3.

### 2.1 Dos documentos que esta fase contradice, y hay que corregir en origen

**`01-fase-ingesta.md` está escrito contra Cloudflare Workers y Cloudflare Queues y se está
rehaciendo en paralelo.** Mientras no se rehaga, contradice a este documento en la plataforma del
receptor, en la existencia de `meta_raw` y en la ubicación de los crones.

**`06-arquitectura-plataforma.md` §1.1 también queda desfasado.** Su tabla de decisiones sitúa la
ingesta, la cola y los crones en Netlify Functions y Scheduled Functions, y el amortiguador en
Netlify Blobs. La decisión vigente es Supabase Edge Functions, `pg_cron` con `pg_net` y Cloudflare
R2. El `06` necesita su propia corrección; se anota en la §8 de este documento y no se contradice en
silencio, que es el error que ya costó una ronda.

Lo que esta fase necesita que la fase 1 fije, y que se da por supuesto aquí:

| # | Contrato con la fase 1 | Supuesto de esta fase |
|---|---|---|
| C1 | Quién aplica las columnas de cola sobre `webhook_events` | Las aplica la fase 1, porque su receptor las escribe. Si no llega, la tarea 1 las trae |
| C2 | El receptor **nunca** inserta una fila con `firma_ok = false` | Un cuerpo con firma inválida no llega a Postgres. El contador de rechazos se incrementa en la tabla de métricas, sin cuerpo |
| C3 | El receptor encola y despacha en **un solo viaje** a Postgres, con el amortiguador de la tarea 3 | Es lo que hace que el mensaje llegue a la bandeja en segundos y no en el siguiente minuto de cron |
| C4 | Si el despacho falla, el receptor devuelve 200 igual | La red de seguridad es el cron, no el receptor |
| C5 | El drenaje de R2 inserta con `origen = 'r2'`, `r2_key` puesta y `recibido_en` recuperado del nombre del objeto, no `now()` | Sin eso, el retraso de drenaje no se puede medir y el orden por recepción miente |
| C6 | El drenaje es idempotente por `r2_key` | Un drenaje que muere entre el `insert` y el borrado del objeto no puede duplicar el cuerpo |

Si la fase 1 rehecha decide otra cosa en cualquiera de los seis puntos, gana la fase 1 y esta
sección se corrige. Lo que no puede quedar es la contradicción en silencio.

### 2.2 Qué cubre de verdad el amortiguador de R2, dicho sin adornos

El receptor y la base viven ahora en el mismo proveedor. Conviene ser exacto sobre qué fallo
absorbe R2 y cuál no:

- **Postgres no disponible y las Edge Functions vivas** —migración larga, pool agotado, ventana de
  mantenimiento, tormenta de bloqueos— es el fallo frecuente y es el que R2 cubre entero. El
  receptor responde 200, el cuerpo va a R2, el drenaje lo recoge y esta fase lo procesa con retraso.
- **El proyecto entero caído** deja también sin servicio al receptor. Meta empieza a acumular
  entregas fallidas y a la hora desuscribe la Página. Contra eso no hay mitigación dentro de esta
  arquitectura, y por eso R2 se eligió en vez de Supabase Storage: los metadatos de Storage viven en
  `storage.objects`, dentro del mismo Postgres, así que Storage no es respaldo de nada cuando la
  base es justamente lo que falta.

Lo que esta fase tiene que asumir es solo la consecuencia: **el camino de R2 va a dispararse de
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
obligue a insertar una fila fantasma (tarea 11). Con el drenaje de R2 por delante, ese caso deja de
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
    check (origen in ('directo', 'r2')),
  add column r2_key      text,
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

-- Idempotencia del drenaje de R2: un objeto se inserta una vez.
create unique index webhook_events_r2_key_idx
  on public.webhook_events (r2_key)
  where r2_key is not null;

-- La tabla recibe varios UPDATE por fila y tocan columnas indexadas, así que
-- ninguno puede ser HOT. Sin esto, el índice de reclamo se hincha.
alter table public.webhook_events set (
  fillfactor = 85,
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
```

`recibido_en` es cuándo el receptor recibió el cuerpo. `encolado_en` es cuándo la fila entró en la
cola. En el camino directo coinciden; en el de R2, la diferencia es el retraso del drenaje y es la
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
fallo en la recepción, y eso ya está pagado: lo compensa el amortiguador de R2, con el alcance
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
ni el drenaje de R2 garantizan orden, y el sistema ordena por `meta_timestamp` en la lectura y
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
| Red de seguridad | `pg_cron`, cada minuto | Recoge lo que quedó atrás: despacho fallido, fila devuelta por retroceso, fila drenada desde R2 |
| Sucesor | El propio normalizador al terminar, si quedan pendientes | Drena una acumulación a velocidad de proceso, no a velocidad de cron |

La llamada HTTPS la hace `pg_net`, que encola la petición y la envía desde un worker de fondo: la
sentencia devuelve de inmediato y no bloquea a quien la ejecutó. Eso es exactamente la invocación
sin esperar respuesta que hace falta, y sale gratis por estar dentro de la base.

**El receptor encola y despacha en un solo viaje.** Una sola función hace el `insert` y, si procede,
el `net.http_post`. Si Postgres no responde, fallan las dos cosas a la vez y el receptor se va por
el camino de R2, que es el comportamiento correcto: no existe el estado intermedio "encolado pero
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

**Por qué el sucesor y no dejarlo al cron.** Un drenaje de R2 tras una caída de veinte minutos puede
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

### Tarea 6 — Eventos que llegan por el drenaje de R2

Cuando Postgres no está, el receptor vuelca el cuerpo crudo en Cloudflare R2 y devuelve 200; un
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

**Marcado, y para qué sirve.** `origen = 'r2'` y la diferencia entre `encolado_en` y `recibido_en`.
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
aquí: `webhook_events_r2_key_idx` es único sobre `r2_key`. Un drenaje que muere entre el `insert` y
el borrado del objeto reintenta y choca con la clave. El `insert` del drenaje va con
`on conflict (r2_key) do nothing`.

**El nombre del objeto lleva el tiempo de recepción**, con la forma `{recibido_ms}-{uuid}`. Eso
permite dos cosas: que el drenaje ordene por tiempo de recepción sin abrir el objeto, y que
`recibido_en` de la fila sea el real y no el del drenaje (C5). El resto —`object`, `cuerpo_bytes`,
los `entry_ids` extraídos— cabe en los metadatos del objeto si la fase 1 decide no reparsear al
drenar.

**El listado de R2 no es la señal de que no queda nada.** El drenaje corre en bucle y vuelve a
listar; la unicidad por `r2_key` hace inofensivo que un objeto aparezca en dos pasadas. Un listado
vacío en una pasada no autoriza a dar el drenaje por terminado, y el drenaje no borra un objeto
hasta que su fila está confirmada en Postgres.

**Criterio de aceptación.** Con Postgres inaccesible durante 20 minutos, el receptor devuelve 200 a
todo, los cuerpos quedan en R2 y al volver el servicio aparecen en `webhook_events` con
`origen = 'r2'` y `recibido_en` anterior a `encolado_en`. Ningún mensaje se pierde y ninguno se
duplica. Un mensaje drenado con tres horas de retraso sobre una conversación en `esperando` no la
mueve a `en_curso` si hay un entrante posterior ya registrado. Ejecutar el drenaje dos veces sobre
el mismo objeto inserta una sola fila.

---
