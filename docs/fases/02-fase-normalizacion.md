# Fase 2 — Normalización y persistencia

**Fecha:** 2 de agosto de 2026
**Estado:** plan cerrado, sin código escrito
**Depende de:** `03-invariantes-meta.md` (normativo), `02-conexion-instagram-facebook.md` §5 y §7, `06-arquitectura-plataforma.md`
**Revisión:** reescrito el 2 de agosto de 2026 tras la corrección del documento 06

> **Precedencia.** Este plan obedece al `03` por encima de todo, y al `02` §5 y §7 en cuanto a
> receptor, cola, modelo de datos y RLS. El `06` manda solo en superficies, dominios y panel
> interno. La primera versión de este plan se escribió contra un `06` que ponía la cola en una
> tabla de Postgres; el `06` ya lleva su tabla de erratas y aquí se corrige lo mismo.

> **Sobre la numeración.** Bloque 2 del orden de construcción: *normalizador e idempotencia*.
> No es la "Fase 2 — Orchestra" de `00-documento-base.md` §9, que es la bandeja.

---

## 1. Objetivo

Convertir los cuerpos crudos que la cola entrega en filas correctas de `messages`,
`message_events`, `media`, `conversations`, `contacts` y `contact_identities`, en el tenant
correcto, sin duplicados, sin perder eventos y sin lanzar excepciones que tumben un lote.

Tres afirmaciones que resumen lo que la fase garantiza:

1. **El mismo evento entregado N veces produce una sola fila y un solo efecto secundario.** No
   basta con que el `insert` no duplique: si el `insert` no ocurrió, tampoco ocurre el Broadcast
   a la bandeja, ni el disparo del agente, ni el avance de los contadores.
2. **Ningún dato se escribe antes de saber de qué organización es.** El normalizador escribe con
   rol de servicio y salta RLS por diseño. La frontera entre tenants en el plano de escritura es
   la clave primaria de `meta_asset_routes`, no RLS.
3. **Nada de lo que llega por un webhook puede reventar el proceso.** Un tipo de adjunto
   desconocido, una clave raíz nueva, un `entry[].id` que no resuelve: todo tiene salida
   registrada y el resto del lote sigue.

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
| P2 | Worker de ingesta desplegado: lee `request.arrayBuffer()`, valida HMAC-SHA256 en tiempo constante sobre el cuerpo crudo, encola y devuelve 200 en menos de 5 s, **sin tocar Postgres** | Hay mensajes reales en la cola `meta_raw` |
| P3 | Cola `meta_raw` creada en Cloudflare Queues, con `meta_raw_dlq` configurada como `dead_letter_queue` | Un mensaje que agota reintentos aparece en la DLQ |
| P4 | Espacio de Workers KV creado y enlazado al Worker normalizador, poblado por el alta desde `meta_asset_routes` | Una lectura de KV por `asset_id` devuelve `organization_id` |
| P5 | Al menos una fila real en `meta_connections` y sus filas correspondientes en `meta_asset_routes` (Página de Boosty y cuenta de Instagram vinculada) | La resolución de un `entry[].id` real devuelve una organización |
| P6 | Corpus de payloads reales capturado y guardado como ficheros para el arnés de pruebas | Existe `tests/payloads/` con al menos un ejemplar de cada forma de la §7 |
| P7 | `GRAPH_API_VERSION=v26.0` como variable única, y el test que compara secretos entre Cloudflare y Netlify | Aunque esta fase no llama a Graph, el arnés no introduce la primera excepción |
| P8 | Límite de tamaño de mensaje de Cloudflare Queues verificado en consola contra el peor caso de Meta: 1000 updates en un cuerpo | Ver §11, pregunta 1. Es bloqueante |

Sobre P6: es la parte de la fase que no se acelera escribiendo código. Cada payload que no se
tenga capturado es una rama del parser escrita a ciegas.

---

## 3. Entregables

1. **Consumidor de `meta_raw`**: Worker de Cloudflare con `ack()` y `retry()` por mensaje,
   retroceso calculado sobre `message.attempts`, DLQ y consumidor de DLQ.
2. **Resolutor de tenant**: `asset_id` contra Workers KV, con caída a `meta_asset_routes` en
   Postgres y cuarentena cuando no resuelve.
3. **Adaptadores por canal**: funciones puras `payload → Efecto[]`, una por formato, sin acceso
   a base de datos ni a red.
4. **RPC de ingestión** en Postgres: una llamada por mensaje de cola, con subtransacción por
   efecto. Es donde vive la unidad transaccional.
5. **Migración aditiva** sobre el esquema del `02` §7 (tarea 1).
6. **Barrera de tenant en el esquema**: claves foráneas compuestas (§6).
7. **Modelo canónico** documentado y tipado (§5).
8. **Validador de allowlist de host** y **SafeFetch**, con cero llamantes en esta fase.
9. **Resolución de conversaciones y contactos** sin duplicados, en función de base de datos.
10. **Operación de fusión de contactos** manual, auditada y reversible.
11. **Métricas de ingesta** y alertas, en el borde y en la base.
12. **Batería de pruebas** de la §8.
13. **Política de retención** de `webhook_events` y de la tabla de cuarentena.

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
  add column aplicado_en       timestamptz;   -- lápida diferida: ver tarea 7

create index message_events_pendientes_idx
  on public.message_events (organization_id, canal, target_mid)
  where tipo in ('delete', 'edit') and aplicado_en is null;
```

`emisor` no está en el `02` §7.5 y hace falta: es lo que distingue en la bandeja una respuesta
del agente de IA de una que escribió un humano del cliente desde el móvil. Se deriva del `app_id`
del echo y de la correlación con los envíos propios (tarea 8).

`aplicado_en` es lo que permite que un borrado que llega antes que su mensaje no se pierda ni
obligue a insertar una fila fantasma (tarea 7).

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
tirar:

```sql
create table public.webhook_cuarentena (
  id            bigserial primary key,
  recibido_en   timestamptz not null default now(),
  motivo        text not null,   -- tenant_no_resuelto | permanente | dlq
  asset_id      text,            -- entry[].id o phone_number_id, si se pudo extraer
  sub_payload   jsonb not null,  -- solo la actualización afectada, no el cuerpo entero
  error         text,
  intentos      smallint not null default 0,
  resuelto_en   timestamptz,
  resuelto_como text             -- reprocesado | descartado
);

create index webhook_cuarentena_pendientes_idx
  on public.webhook_cuarentena (asset_id)
  where resuelto_en is null;

alter table public.webhook_cuarentena enable row level security;  -- cero políticas
```

No lleva `organization_id` —por definición no se sabe de quién es— y por tanto entra en la misma
categoría que la bitácora: RLS activo, cero políticas, solo la toca el rol de servicio, nunca se
expone por PostgREST.

**Criterio de aceptación.** La migración aplica y revierte limpia sobre el esquema del `02` §7.
`webhook_cuarentena` y `contact_merges` devuelven cero filas a cualquier consulta hecha con el
rol `anon` o `authenticated`, con o sin `organization_id` en el filtro.

---

### Tarea 2 — Consumidor de la cola

**Dónde corre.** Worker de Cloudflare, consumidor de `meta_raw`. Es una pieza distinta del
Worker de ingesta, con su propio despliegue. Escribe en Postgres por HTTPS contra PostgREST con
rol de servicio; no abre conexiones TCP y no necesita pooler desde el borde.

**Por qué la cola no está en Postgres.** El `02` §5.3 lo fija: tras una hora de entregas
fallidas Meta manda "Webhooks Disabled" y desuscribe la app de esa Página, con resuscripción
manual. Si la cola fuera una tabla de staging, la capacidad de devolver 200 dependería de que la
base esté disponible, y una migración larga o un pool agotado se convertirían en una
desuscripción masiva de todos los tenants a la vez. Con Queues, Postgres puede estar caído una
hora y los eventos se acumulan en vez de perderse.

**Qué es un mensaje de cola.** Un cuerpo de webhook completo, crudo, tal como llegó. Puede traer
hasta 1000 updates. El Worker de ingesta lo encola sin parsear, porque parsear y re-serializar
rompería la firma de forma no determinista y porque su presupuesto no puede depender del número
de eventos.

**Configuración del consumidor.** Los valores se ajustan con tráfico real; los límites de la
plataforma se verifican en consola (§11).

| Parámetro | Valor inicial | Razón |
|---|---|---|
| `max_batch_size` | 10 | Cada mensaje puede contener 1000 updates; lotes grandes multiplican el peor caso |
| `max_batch_timeout` | 5 s | Techo de latencia añadida antes de que el agente pueda actuar |
| `max_retries` | 5 | Con el retroceso de abajo cubre unas 2 h de indisponibilidad de Postgres |
| `dead_letter_queue` | `meta_raw_dlq` | Nada se pierde al agotar reintentos |
| `max_concurrency` | sin fijar al principio | Se mide antes de topar: el limitante es Postgres, no el Worker |

**Acuse por mensaje, no por lote.** El handler no se limita a devolver sin error: acusa cada
mensaje explícitamente. Sin `ack()` por mensaje, una excepción a mitad del lote reencola los que
ya se procesaron.

```ts
export default {
  async queue(batch: MessageBatch<ArrayBuffer>, env: Env) {
    for (const msg of batch.messages) {
      try {
        const r = await procesar(msg.body, env);
        if (r.reintentable) {
          msg.retry({ delaySeconds: retroceso(msg.attempts) });
        } else {
          msg.ack();          // incluye el caso "procesado, con updates en cuarentena"
        }
      } catch {
        // Solo llega aquí lo que procesar() no supo clasificar.
        msg.retry({ delaySeconds: retroceso(msg.attempts) });
      }
    }
  }
};
```

**Retroceso**, calculado sobre `message.attempts`:

| Intento | `delaySeconds` |
|---|---|
| 1 | 5 |
| 2 | 30 |
| 3 | 120 |
| 4 | 600 |
| 5 | 3600 |
| agotado | a `meta_raw_dlq` |

El reloj de Meta y el de Kavea son independientes: Meta ya recibió su 200, así que estos
reintentos no influyen en la desuscripción a la hora. El techo lo pone la atención humana.

**Clasificación del fallo, que es lo que decide entre `retry()` y `ack()`:**

- **Transitorio** — PostgREST no responde, tiempo de espera, 5xx, interbloqueo. `retry()` con
  retroceso. Es el caso que justifica toda la arquitectura: Postgres caído no pierde nada.
- **Permanente en un update concreto** — payload que no encaja en ninguna forma conocida,
  restricción no resoluble. **No se reintenta el mensaje entero**: ese update va a
  `webhook_cuarentena` con motivo `permanente` y el mensaje se acusa. Reintentar el cuerpo
  completo por un update roto reprocesa los otros 999 sin arreglar nada.
- **`tenant_no_resuelto`** — el `asset_id` no está en `meta_asset_routes`. A cuarentena con ese
  motivo y `ack()`. No se reintenta en bucle: reintentar no crea la fila que falta. Un barrido lo
  reprocesa cuando aparezca la ruta. Es el caso real de una organización que autoriza y cuyo
  primer mensaje llega antes de que el alta termine de escribir.
- **Desconocido** — se trata como transitorio y se alerta desde el primer intento.

**Consumidor de la DLQ.** La retención de una cola es finita. Un segundo consumidor vacía
`meta_raw_dlq` a `webhook_cuarentena` con motivo `dlq` y levanta alerta, de modo que nada dependa
de que alguien mire la consola de Cloudflare antes de que expire.

**Barrido de cuarentena.** Cron Trigger de Cloudflare, cada 15 minutos, en el mismo Worker que ya
hace la reconciliación de suscripciones. Toma las filas con `motivo = 'tenant_no_resuelto'` y
`resuelto_en is null`, comprueba si su `asset_id` ya está en `meta_asset_routes` y en ese caso
las reinyecta en `meta_raw`. Las de motivo `permanente` y `dlq` no se reprocesan solas: exigen
que alguien mire.

**Entrega al menos una vez y sin orden.** Cloudflare Queues garantiza entrega, no unicidad ni
orden, igual que Meta. No es una complicación añadida: es la misma propiedad que el sistema ya
tenía que tolerar, y la tolera con la clave de idempotencia y con el orden por `meta_timestamp`
en lugar de por orden de llegada.

**Quién escribe la bitácora.** El `02` §5.3 prohíbe que la ingesta toque Postgres, así que
`webhook_events` (§7.6) **la escribe el consumidor**, no el receptor, una fila por mensaje de
cola. Consecuencias sobre esa tabla en la §7 de este documento.

**Criterio de aceptación.** Con Postgres inaccesible durante 20 minutos, ningún mensaje se pierde
y todos acaban persistidos al volver el servicio, sin duplicados. Matar el consumidor después de
escribir en Postgres y antes de `ack()` provoca reentrega, y la reentrega no crea ninguna fila
nueva ni ningún efecto secundario. Un mensaje con un update permanentemente roto se acusa, no se
reintenta, y deja exactamente una fila en `webhook_cuarentena`.

---

### Tarea 3 — Resolutor de tenant

Es la tarea con el peor fallo posible del sistema. El `03` lo dice sin adornos: un error aquí
escribe mensajes de un cliente en el tenant de otro. Y conviene repetir por qué duele aquí y no
en el plano de lectura: **el normalizador escribe con rol de servicio y salta RLS por diseño**,
porque tiene que poder escribir en cualquier tenant. RLS no lo va a atrapar.

**Camino de resolución, en este orden:**

1. **Workers KV** por `asset_id`. Acierto de caché: se usa.
2. **Postgres**, `select organization_id, meta_connection_id from public.meta_asset_routes where
   asset_id = $1`. Es una lectura por clave primaria. Al acertar, se escribe en KV con TTL.
3. **Cuarentena.** Sin correspondencia no hay escritura por defecto. No existe organización de
   respaldo, ni "primera organización", ni fila huérfana a reasignar después.

**Reglas:**

- Se enruta por `entry[].id`, **nunca** por el campo `object`. El valor de `object` para
  Instagram es una contradicción documental sin resolver entre dos páginas oficiales de Meta. El
  handler acepta `page`, `instagram` y `whatsapp_business_account`, y no toma ninguna decisión
  con ese valor más allá de elegir qué adaptador probar.
- La resolución ocurre **antes** de cualquier escritura de negocio.
- Una resolución por mensaje de cola: se recogen todos los `asset_id` del cuerpo y se resuelven
  juntos, no uno por update.
- **Solo se cachean aciertos.** Un fallo nunca se cachea: cachear la ausencia de una ruta
  convierte una carrera de alta en un cliente que no recibe mensajes durante todo el TTL.

**El riesgo real de la caché, dicho sin adornos.** Workers KV es de consistencia eventual. Una
entrada obsoleta después de reasignar un activo enrutaría mensajes al tenant anterior, y ese es
exactamente el fallo que la clave primaria de `meta_asset_routes` está pensada para impedir. La
caché lo reintroduce por la puerta de atrás. Mitigaciones, las cuatro:

1. **TTL corto**, 60 segundos. Acota la ventana de obsolescencia a algo explicable.
2. **Invalidación en la escritura.** El route handler del alta escribe `meta_asset_routes` y
   borra la clave de KV en la misma operación lógica; si el borrado falla, el alta falla.
3. **Procedimiento de reasignación**, no código: mover un activo de una organización a otra exige
   borrar la clave, esperar la propagación y solo entonces actualizar Postgres. Se documenta y se
   ejecuta a mano. No es una operación de producto.
4. **Cron de reconciliación** que compara KV contra `meta_asset_routes` y alerta ante cualquier
   discrepancia, y ante cualquier cambio de `organization_id` sobre un `asset_id` existente.

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
ninguna fila de negocio y sí una en `webhook_cuarentena`. Borrar una clave de KV y volver a
resolver devuelve el mismo resultado que Postgres. Una prueba de propiedades genera cuerpos
aleatorios mezclando tenants y comprueba que ninguna fila queda con `organization_id` distinto
del que le corresponde por su `asset_id`.

---

### Tarea 4 — Adaptadores por canal

Cuatro formatos de entrada, un modelo de salida. Los adaptadores son **funciones puras**: no
tocan la base, no hacen red, no leen reloj. Reciben el payload y el `organization_id` ya
resuelto, y devuelven una lista de efectos (§5). Esa pureza es lo que permite ejecutar la mayor
parte de la batería de pruebas en milisegundos y sin base de datos, y lo que permite reprocesar
cuarentena sin volver a pedirle nada a Meta.

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

**Criterio de aceptación.** Cada adaptador se ejecuta sobre todo el corpus de P6 sin lanzar
excepciones. Una prueba alimenta cada adaptador con basura estructurada —objetos vacíos, arrays
donde se esperan objetos, campos nulos, claves inventadas— y comprueba que en todos los casos
devuelve una lista de efectos, posiblemente con `desconocido.registrar`, y nunca lanza.

---

### Tarea 5 — Aplicador: un RPC, una subtransacción por efecto

Un solo componente escribe. Con la cola fuera de Postgres y la escritura por PostgREST, el
aplicador es un **RPC de Postgres** que el Worker llama una vez por mensaje de cola, con el lote
de efectos ya normalizados y agrupados por organización.

Esa forma es la que preserva la regla que más importa: **la unidad transaccional es la
actualización, no el lote.** Un bloque `begin ... exception` dentro de un bucle de PL/pgSQL abre
una subtransacción por iteración; un fallo revierte esa iteración y solo esa. Un cuerpo con 1000
updates y uno roto persiste 999 y devuelve un error para el que falló, en un solo viaje de red.

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
  for efecto in select * from jsonb_array_elements(p_efectos) loop
    begin
      resultados := resultados || private.aplicar_efecto(efecto);
    exception when others then
      -- Solo se revierte ESTA iteración. El resto del lote queda confirmado.
      resultados := resultados || jsonb_build_object(
        'estado', 'error', 'sqlstate', sqlstate, 'mensaje', sqlerrm);
    end;
  end loop;
  return resultados;
end;
$$;
```

Orden dentro de un efecto de mensaje: tenant (ya resuelto) → identidad de contacto → contacto →
conversación → mensaje → media → contadores de la conversación.

**Gate de efectos secundarios.** El `insert` de mensaje es
`on conflict (organization_id, canal, mid) do nothing returning id`. Si no devuelve fila, el
mensaje ya existía: se corta ahí y el efecto se reporta como `duplicado`. No se avanza
`last_message_at`, no se encola el agente. Esta es la diferencia entre "no duplicar filas" y "ser
idempotente de verdad": una entrega repetida que vuelve a disparar el agente cuesta dinero y
puede producir una segunda respuesta al cliente final.

El Broadcast a la bandeja queda protegido por construcción. El `02` §5.2 lo emite desde un
trigger `after insert` que publica al canal `org:{organization_id}`, no con `postgres_changes`
con filtro. Si el `insert` no ocurre, el trigger no dispara y no hay Broadcast: el gate es
estructural, no una comprobación que alguien pueda olvidar.

**Coste que hay que tener presente:** las subtransacciones de PL/pgSQL no son gratis; cada bloque
con `exception` consume un identificador de subtransacción. Con 1000 iteraciones por llamada es
asumible, pero es la razón por la que `max_batch_size` empieza en 10 y no en 100, y es lo que se
mide en la prueba 11.

**Optimización para cuerpos grandes:** antes de resolver contacto y conversación, una lectura por
`(organization_id, canal, mid)`. En una reentrega, eso convierte 1000 resoluciones completas en
1000 aciertos de índice.

**Criterio de aceptación.** No existe ninguna sentencia de escritura sobre tablas de negocio
fuera de `private.aplicar_efecto`, verificado con una regla de análisis estático sobre el Worker:
el consumidor solo llama a RPC. Reprocesar un cuerpo ya procesado devuelve todos los efectos como
`duplicado` y no emite ningún Broadcast ni ninguna entrada nueva en la cola del agente.

---

### Tarea 6 — Idempotencia: clave canónica y claves derivadas

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
| Borrado | La orden de borrar un mensaje | `(organization_id, canal, 'delete', message.mid, timestamp)` | Se registra siempre, haya o no fila que actualizar. Ver tarea 7 |
| Referral / optin | Un evento de origen | `(organization_id, canal, tipo, sender.id, timestamp)` | |
| Handover | Un cambio de propiedad del hilo | `(organization_id, canal, tipo, recipient.id, timestamp)` | El string `primary_receiver` sigue llegando en `app_roles` y se persiste tal cual |
| Clave raíz desconocida | Lo que Meta añada | `(organization_id, canal, <clave>, sender.id, timestamp)` | Se registra con el payload crudo y una métrica |

El `timestamp` que entra en estas claves es el del evento, que viaja dentro del payload y por
tanto es estable entre reentregas del mismo evento, vengan de Meta o de la cola. No es la hora de
recepción.

**Límite conocido y aceptado:** dos eventos genuinamente distintos del mismo tipo, del mismo
actor y en el mismo milisegundo colapsan en uno. Para postbacks y reacciones es un escenario que
no se da con interacción humana. Queda escrito para que nadie lo descubra como sorpresa.

**Criterio de aceptación.** Reproducir el corpus completo de P6 tres veces seguidas deja el mismo
número de filas en `messages` y en `message_events` que reproducirlo una vez. Una reacción y su
retirada sobre el mismo mensaje producen dos filas.

---

### Tarea 7 — Borrados y ediciones: UPDATE, nunca INSERT

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
orden, ni en Meta ni en la cola. Si el mensaje original venía en un cuerpo que aún se está
reintentando, o si Meta entrega las actualizaciones invertidas, el `update` afecta a 0 filas.
Insertar entonces está prohibido por invariante, y descartar el borrado deja visible para siempre
un mensaje que el usuario cree haber eliminado. La salida es una lápida diferida:

1. El efecto de borrado se registra **siempre** en `message_events` con `tipo = 'delete'` y
   `target_mid`, haya o no fila que actualizar.
2. Si el `update` afectó a alguna fila, se marca `aplicado_en`. Si afectó a 0, queda pendiente.
3. El aplicador, **después** de cada `insert` de mensaje que sí crea fila, consulta si existe un
   `message_events` de tipo `delete` o `edit` con `aplicado_en is null` para ese `target_mid`, y
   lo aplica en la misma subtransacción.

Así el mensaje nace ya borrado o ya editado, sin ventana en la que sea visible, y sin insertar
nunca una fila que no venga de un mensaje real. El índice parcial de la tarea 1 es lo que hace
que esa consulta cueste casi lo mismo que no hacerla.

**Criterio de aceptación.** Un unsend sobre un mensaje existente deja la fila con `deleted_at` no
nulo, `texto` nulo y sin filas en `media`, y **no** crea una fila nueva: el recuento de `messages`
no cambia. Un unsend cuyo mensaje llega diez minutos después deja, al terminar, una sola fila con
`deleted_at` no nulo, y en ningún instante intermedio hay una fila visible con texto. Un unsend
de un `mid` que nunca llega no deja fila en `messages`.

---

### Tarea 8 — Echoes y anti-bucle

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

### Tarea 9 — `standby[]` y propiedad del hilo

El parser lee `entry[].messaging[]` **y** `entry[].standby[]`, con la misma normalización y el
mismo camino de escritura. La diferencia se guarda en una columna, no en dos tuberías.

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
comprobación empírica pendiente y va en la §11.

**Criterio de aceptación.** El mismo mensaje colocado en `standby[]` en lugar de `messaging[]`
produce la misma fila salvo `llego_por_standby = true`, y deja `conversations.en_standby` a
cierto. Una prueba de cobertura falla si algún adaptador lee `messaging` sin leer `standby`.

---

### Tarea 10 — Parser de adjuntos tolerante, allowlist y SSRF

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
`origen = 'meta_cdn'`, y nada más. Ni binario, ni copia, ni proxy por dominio de Kavea, ni R2.
Meta rechazó el App Review de `instagram_manage_messages` a usuarios de Chatwoot por exactamente
esto. La restricción `media_origen_coherente` del `02` §7.5 es lo que impide que un `insert`
distraído lo haga: R2 queda reservado a media saliente, que llega en un bloque posterior.

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
estará.

**Criterio de aceptación.** Un adjunto de tipo `xyz_inventado` produce una fila en `media` con ese
tipo tal cual, el payload crudo, una métrica incrementada y ninguna excepción. Un adjunto de tipo
`sticker` sin copia como `image` se persiste correctamente. Una URL con host `evil.example.com` no
se persiste, el mensaje sí, y salta la alerta. Una URL apuntando a `169.254.169.254` no llega a
persistirse. Un `insert` en `media` con `origen = 'meta_cdn'` y `r2_key` no nulo falla contra la
restricción.

---

### Tarea 11 — Conversaciones sin duplicados

La idempotencia de mensajes no protege de conversaciones duplicadas. Cuando alguien manda tres
fotos seguidas llegan webhooks paralelos —y ahora, además, un consumidor de cola con concurrencia
automática— y un patrón "buscar o crear" crea tres conversaciones. Chatwoot necesitó un mutex
distribuido en Redis con TTL de 3 s y admite que no garantiza orden. En Postgres se resuelve con
el índice único parcial que ya está en el `02` §7.4.

El detalle que rompe la implementación ingenua: **`on conflict do nothing returning` no devuelve
fila cuando hay conflicto**. Un `insert ... on conflict do nothing returning id` en carrera
devuelve cero filas y el código se queda sin `conversation_id`. Hace falta el ciclo completo, y al
vivir dentro del RPC de la tarea 5 no cuesta ningún viaje de red extra:

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
       and status = 'open'
     limit 1;
    if found then return v_id; end if;

    insert into public.conversations (organization_id, channel_id, canal, contact_id)
    values (p_org, p_channel, p_canal, p_contact)
    on conflict (organization_id, canal, contact_id) where status = 'open'
    do nothing
    returning id into v_id;
    if v_id is not null then return v_id; end if;
    -- conflicto: otro consumidor ganó la carrera, se vuelve a leer
  end loop;
  raise exception 'no se pudo resolver la conversacion para % / % / %', p_org, p_canal, p_contact;
end;
$$;
```

Notas de comportamiento que hay que tener presentes:

- La inferencia del índice parcial exige repetir el predicado `where status = 'open'` en la
  cláusula `on conflict`. Sin él, Postgres no encuentra índice que inferir y la sentencia falla.
- El índice del `02` §7.4 es `where status = 'open'`, y `status` admite `pending`. Dos
  conversaciones en `pending` para el mismo contacto y canal **no** violan el índice. Hay que
  decidir si `pending` debe entrar en el predicado; mientras no se decida, la resolución busca solo
  `open` y una conversación en `pending` produce una nueva. Va como pregunta abierta.
- Si la única conversación existente está `closed`, se crea una nueva. Reabrir un hilo cerrado
  meses después es una conversación nueva, no la misma.
- El bucle acotado a tres intentos evita un ciclo infinito si alguien elimina el índice.
- `pg_advisory_xact_lock` sobre el hash de `(canal, contacto)` es la alternativa si aparece
  contención real. No se adopta de entrada porque serializa por contacto sin necesidad.

**Criterio de aceptación.** Diez llamadas concurrentes con el mismo `(organization_id, canal,
contact_id)` producen exactamente una conversación y devuelven el mismo identificador. Tres fotos
enviadas de golpe por el mismo contacto producen una conversación y tres mensajes, con el
consumidor corriendo en concurrencia.

---

### Tarea 12 — Contactos, identidades y unificación

**Identidades.** `(organization_id, canal, scoped_id)` es único, con el mismo patrón de resolución
de la tarea 11. PSID e IGSID son espacios de identificadores distintos, no intercambiables y no
portables entre apps: nunca se comparan entre sí, nunca se copia uno en la columna del otro.

`app_scoped_id` queda como columna separada y en esta fase se deja nula: las solicitudes de borrado
de datos de Meta llegan con un App-Scoped ID que no es ni el PSID ni el IGSID, y no hay forma de
rellenarla desde el webhook de mensajería. La columna existe para que la correspondencia se pueda
resolver cuando se implementen los callbacks, sin migración de por medio.

**Contactos.** Una identidad sin contacto crea un contacto con `nombre` nulo. Esta fase **no llama
a la Graph API** para leer el perfil: el error 230 (consentimiento de perfil no otorgado) es normal
y esperable, y añadir esa llamada mete a la fase en el terreno de los límites de tasa y del App
Review sin necesidad. La bandeja del bloque 3 muestra el `scoped_id` hasta que exista
enriquecimiento de perfil. `perfil_consentido` y `perfil_leido_en`, que el `02` §7.3 ya define, se
quedan en sus valores por defecto.

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
  de verificar, §11— ese es el único caso realista, y aun así entra como propuesta, no como acción.
- **Cola de candidatos.** Las coincidencias se escriben en una tabla de sugerencias que no actúa
  por sí sola. Un humano confirma desde la interfaz, en un bloque posterior.

**Fusión, cuando la haya: auditada y reversible.** La tabla `contact_merges` de la tarea 1 guarda
el estado previo suficiente para devolver cada identidad y cada conversación a su contacto
original. El falso positivo se gestiona por reversibilidad, no por prevención perfecta.

**Colisión que hay que resolver en la fusión y que no es evidente:** si los dos contactos tienen
una conversación `open` en el **mismo** canal, repuntar `contact_id` viola el índice único parcial
`conversations (organization_id, canal, contact_id) where status = 'open'`. La fusión tiene que
decidir antes: conservar la de actividad más reciente y cerrar la otra dejando constancia, o unir
los mensajes en una sola. Se elige cerrar la menos reciente, porque mover mensajes entre
conversaciones es una operación destructiva que no se deshace bien.

**Criterio de aceptación.** Dos mensajes del mismo PSID producen un contacto y una identidad. El
mismo humano escribiendo por Instagram y por Messenger produce dos contactos, y eso es el
comportamiento correcto en esta fase. Una fusión de dos contactos con conversación abierta en el
mismo canal no viola el índice y deja registro suficiente para revertirse. Revertir una fusión
devuelve exactamente el estado anterior.

---

### Tarea 13 — Ventana de 24 h: `last_incoming_at` monótono

La ventana de servicio se calcula **por conversación**, sobre `last_incoming_at`, nunca con un
flag global. Chatwoot usa un flag global 24 h/7 d y esa es la implementación incorrecta que no se
copia.

Dos reglas que parecen menores y no lo son:

1. **Solo los mensajes entrantes no-echo avanzan `last_incoming_at`.** Un echo saliente no reabre
   la ventana.
2. **El avance es monótono.** Sin garantía de orden —ni en Meta ni en la cola— un mensaje viejo
   puede llegar después de uno nuevo, y una asignación directa rebobinaría el reloj. Rebobinarlo
   cerraría la ventana antes de tiempo; y en el caso simétrico, reprocesar un evento antiguo tras
   haber cerrado y reabierto la haría parecer abierta cuando no lo está, lo que produce un error
   100 de Meta o, peor, un envío fuera de política.

```sql
update public.conversations
   set last_incoming_at = greatest(coalesce(last_incoming_at, '-infinity'::timestamptz), $1),
       last_message_at  = greatest(coalesce(last_message_at,  '-infinity'::timestamptz), $1)
 where id = $2;
```

Para un mensaje saliente o un echo, solo avanza `last_message_at`.

**Criterio de aceptación.** Procesar un mensaje entrante con timestamp anterior al último
registrado no modifica `last_incoming_at`. Procesar un echo no modifica `last_incoming_at` y sí
`last_message_at`. Una prueba reproduce un cuerpo en orden inverso y comprueba que
`last_incoming_at` acaba con el valor del mensaje más reciente.

---

### Tarea 14 — Observabilidad

Dos planos, porque la arquitectura tiene dos proveedores y no hay forma de evitarlo. Es el precio
que el `02` §5.3 ya reconoce: observabilidad partida.

**En el borde (Cloudflare):** profundidad de cola, tasa de `retry()`, tamaño de la DLQ, latencia
del consumidor, aciertos y fallos de KV, y rechazos de firma en el Worker de ingesta.

**En la base (Postgres):** contadores que el propio RPC incrementa en una tabla de métricas, que
el panel interno agrega. Encaja con la política del `06` §6: el admin ve metadatos sin contenido.

| Métrica | Dónde | Por qué |
|---|---|---|
| Profundidad de `meta_raw` | Borde | Si sube y no baja, el consumidor está caído o Postgres no responde |
| Tamaño de `meta_raw_dlq` | Borde | Debe ser cero. Cualquier valor distinto es una alerta |
| Latencia de ingesta p95 | Borde + base | De recepción a mensaje persistido |
| Firmas rechazadas | Borde | La ingesta no toca Postgres: este contador solo puede vivir aquí |
| Aciertos y fallos de KV | Borde | Un fallo sostenido delata invalidación mal hecha |
| `tenant_no_resuelto_total` | Base | Un canal recién autorizado, o un error de enrutado |
| `cuarentena_pendientes` | Base | Filas sin resolver, por motivo |
| `adjunto_desconocido_total{tipo}` | Base | Detecta un tipo nuevo de Meta el día que aparece |
| `evento_desconocido_total{clave}` | Base | Lo mismo para claves raíz nuevas |
| `echo_app_id_desconocido_total{app_id}` | Base | Hay una tercera herramienta conectada a la Página |
| `host_bloqueado_total{host}` | Base | Cambio de CDN de Meta o intento de SSRF |
| `postback_sin_payload_total` | Base | Se está perdiendo la propiedad del hilo |
| `standby_total` | Base | Lo mismo, con otra señal |

Alertas: cualquier fila en la DLQ, profundidad de cola por encima de umbral durante 5 minutos,
cualquier `tenant_no_resuelto`, cualquier `host_bloqueado`, primera aparición de un
`adjunto_desconocido` de un tipo nuevo, cualquier `app_id` de echo no visto antes, y cualquier
discrepancia entre KV y `meta_asset_routes`.

**Criterio de aceptación.** El panel interno muestra las métricas de base sin exponer texto de
mensajes. Detener el consumidor durante 10 minutos dispara la alerta de profundidad de cola.

---

### Tarea 15 — Arnés de pruebas

El corpus de P6 se guarda como ficheros y el arnés los reproduce. Tres capas:

- **Unitaria**, sin base de datos ni red, sobre los adaptadores puros: entra payload, sale
  `Efecto[]`. Rápida, exhaustiva, es donde vive la mayoría de los casos.
- **De base de datos**, sobre Postgres efímero: RPC, subtransacciones, restricciones,
  concurrencia, RLS.
- **De cola**, con el simulador local de Workers: ack, retry, retroceso, DLQ, reentrega.

Un generador reproduce cuerpos: mezcla de tenants, orden aleatorio, duplicados inyectados, tipos
desconocidos. La batería concreta está en la §8.

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

Tres decisiones que el tipo hace explícitas:

- `contacto_scoped_id` y `cuenta_scoped_id` en lugar de `sender` y `recipient`. El adaptador ya ha
  resuelto la inversión del echo; el aplicador no tiene que volver a pensarlo.
- `read_watermark_ms` y `read_mid` son campos distintos. Un watermark no identifica un mensaje y un
  `mid` no identifica un instante. Colapsarlos pierde semántica en los dos sentidos.
- `adjuntos[].payload` está siempre, reconocido o no. Es lo que permite reprocesar un tipo nuevo sin
  volver a pedirle nada a Meta, que es el único camino disponible: la Conversations API solo
  devuelve los 20 mensajes más recientes.

---

## 6. La barrera de tenant en el esquema

Esta sección tiene rango propio porque resuelve, dentro de la base de datos, el fallo que el `03`
califica como el peor posible.

**El problema.** El `02` §7.7 lo dice con todas las letras: *"RLS protege la lectura, no la
escritura de ingesta. El worker de webhooks usa el rol de servicio y salta RLS por diseño."* Lo
que impide que escriba en el tenant equivocado es la clave primaria de `meta_asset_routes`. Eso es
correcto y es la primera línea, pero es **una sola** línea, y vive en el código del Worker.

**Lo que no cubre.** La clave primaria garantiza que un `asset_id` resuelve a una organización o a
ninguna. No garantiza que el resto del efecto sea coherente. Un fallo de programación en el
aplicador —una variable reutilizada en un bucle, un `organization_id` de la iteración anterior—
puede insertar un `messages` con `organization_id` de la org A y `conversation_id` de una
conversación de la org B. Ningún índice del `02` §7 lo impide, porque todas las claves foráneas son
simples: `conversation_id` referencia `conversations(id)` sin mirar la organización.

El resultado sería una fila que la política de RLS de la org A muestra, con el contenido de una
conversación de la org B. Es el incidente de cruce de datos, y llegaría con RLS "activado".

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
   evento. Vive en el código del Worker.
2. **Estructura** — las claves foráneas compuestas impiden coser filas de tenants distintos. Vive
   en Postgres y no depende de que nadie se acuerde.
3. **Lectura** — RLS por membresía. Vive en Postgres y solo protege el plano de lectura.

Las tres son necesarias. La segunda es la que faltaba, y es la más barata: cinco restricciones y
tres índices.

**Criterio de aceptación.** Un `insert` en `messages` con un `conversation_id` de otra organización
falla con violación de clave foránea. Una prueba lo intenta explícitamente con el rol de servicio y
espera el error; si algún día pasa, la prueba falla.

---

## 7. Qué se corrige aguas arriba

Las tres correcciones que la primera versión de este plan hacía al `06` se comprueban ahora contra
el `02` §7.5 y §7.6, que es el documento que manda:

| Hallazgo original | Estado contra el documento 02 |
|---|---|
| La consulta de reclamo no filtra `firma_ok` | **Obsoleto.** No hay consulta de reclamo: la cola es Cloudflare Queues. Pero muta en el punto 1 de abajo |
| `messages_hilo_idx` ordena por `created_at` | **Resuelto en origen.** El `02` §7.5 ya lo define como `(conversation_id, meta_timestamp desc)`. El `06` lo había copiado mal |
| `channels_waba_idx` construido sobre `phone_number_id` | **Obsoleto.** El `channels` del `02` §7.2 no lleva identificadores de Meta: es `(meta_connection_id, canal)`. Sustituido por el hallazgo de WhatsApp de la tarea 3 |

Lo que sí persiste y hay que corregir en el `02` §7.6, o decidir explícitamente:

1. **Quién escribe `webhook_events` y qué significa `firma_ok`.** El `02` §5.3 prohíbe que la
   ingesta toque Postgres, así que el receptor no puede escribir la bitácora: la escribe el
   consumidor. Consecuencia directa: un cuerpo con firma inválida nunca entra en la cola y nunca
   llega a Postgres, de modo que `firma_ok` en la bitácora **siempre valdrá `true`**. La columna se
   queda como afirmación defensiva y el contador real de rechazos vive en el borde (tarea 14).
   Conviene escribirlo en el `02` para que nadie construya una alerta sobre una columna que no
   puede variar.
2. **`webhook_events` conserva forma de cola.** `procesado_en`, `intentos`, `error` y el índice
   parcial `where procesado_en is null` describen una tabla de trabajo pendiente que ya no existe.
   Propuesta: `procesado_en` se rellena siempre en el mismo `insert`; `intentos` pasa a significar
   `message.attempts` de la cola, que es información útil para diagnosticar; el índice parcial se
   sustituye por uno sobre `error is not null`.
3. **`webhook_events` no tiene retención.** Guarda el cuerpo íntegro de todos los tenants, no lleva
   `organization_id` y queda fuera de RLS por deny-all. Es la tabla con más contenido sensible y
   menos protección del sistema. Propuesta: purga de filas sin error a los 30 días. El plazo
   definitivo lo fija la política de privacidad publicada, no este documento.
4. **El dominio `canal_meta` está restringido a `('messenger','instagram')`** y
   `meta_asset_routes.tipo` a `('page','ig_business_account')`. Ninguno admite WhatsApp ni correo.
   Se amplían cuando el canal entre, y el hecho de que lo impida un `check` y no un `enum` es
   exactamente por qué el `02` prohíbe los `enum`.
5. **Claves foráneas simples.** Ver §6.

---

## 8. Batería de pruebas

Cada caso indica su capa: **U** unitaria sobre adaptadores puros, **B** de base de datos, **C** de
cola.

| # | Caso | Montaje | Resultado esperado |
|---|---|---|---|
| 1 | **Entrega duplicada** (B+C) | El mismo cuerpo se procesa tres veces, una de ellas por reentrega real de la cola | Una fila en `messages`. Un solo Broadcast. Ninguna entrada nueva en la cola del agente en la 2.ª y 3.ª pasada. `last_message_at` idéntico tras las tres |
| 2 | **Entrega fuera de orden** (B) | Tres mensajes con timestamps t1 < t2 < t3 procesados en orden t3, t1, t2 | El hilo ordenado por `meta_timestamp` da t1, t2, t3. `last_incoming_at` = t3 tras las tres, y no baja al procesar t1 |
| 3 | **Unsend con mensaje presente** (B) | Mensaje, luego `{mid, is_deleted:true}` | `deleted_at` no nulo, `texto` nulo, sin filas en `media`, recuento de `messages` sin cambios, evento `delete` con `aplicado_en` puesto |
| 4 | **Unsend antes del mensaje** (B) | El unsend primero, el mensaje 10 min después | Tras el unsend: cero filas en `messages`, evento con `aplicado_en` nulo. Tras el mensaje: una fila, ya con `deleted_at`, evento aplicado, y en ningún momento visible con texto |
| 5 | **Edición** (B) | Mensaje, luego `message_edit` con el mismo `mid` | Una fila, `texto` nuevo, `edited_at` puesto, texto anterior recuperable desde el `raw` del evento. Recuento sin cambios |
| 6 | **Edición repetida** (B) | Dos ediciones del mismo `mid` con timestamps distintos | Una fila de mensaje, dos filas de evento `edit` |
| 7 | **Echo propio** (B) | Echo con `app_id` de Kavea, correlacionado por `metadata` con un envío sintético | `direccion='outbound'`, `emisor='agente'`, misma `conversation_id` que los entrantes de ese contacto, `last_incoming_at` intacto, cero disparos del agente |
| 8 | **Echo ajeno** (B) | Echo con `app_id` de la bandeja de Business Suite y otro con `app_id` inventado | Ambos persistidos con `emisor='humano'`. El inventado incrementa `echo_app_id_desconocido_total` y alerta. Ninguno dispara el agente. Ninguno crea contacto con el Page ID como `scoped_id` |
| 9 | **Adjunto de tipo desconocido** (U+B) | `attachment.type = 'xyz_inventado'` | Fila en `media` con ese tipo y el payload crudo, métrica incrementada, mensaje persistido, cero excepciones. El resto del cuerpo se procesa |
| 10 | **Sticker sin copia como imagen** (U) | Adjunto solo `sticker`, sin `image` | Persistido como sticker. Simula el estado posterior al 30-ago-2026 |
| 11 | **Cuerpo de 1000 updates** (B+C) | Un mensaje de cola con 1000 mensajes de 50 contactos | 1000 mensajes, 50 conversaciones, 50 contactos, en una llamada al RPC. Reprocesar no crea nada. Latencia p95 dentro del presupuesto y consumo de subtransacciones medido |
| 12 | **Cuerpo de 1000 con una envenenada** (B+C) | Igual, con la actualización 500 malformada | 999 mensajes persistidos, el RPC devuelve `error` para la 500, una fila en `webhook_cuarentena` con su sub-payload, y el mensaje de cola **acusado**, no reintentado |
| 13 | **Aislamiento entre tenants** (B) | Cuerpo con `entry[]` de dos organizaciones intercalados | Cada mensaje en su organización. Leyendo con el rol `authenticated` de cada una, cada usuario ve solo lo suyo y la suma cuadra |
| 14 | **`asset_id` no resoluble** (B+C) | Identificador inventado | Cero filas de negocio. Una fila en `webhook_cuarentena` con motivo `tenant_no_resuelto`. Mensaje acusado, no reintentado. Alerta. Al crear la ruta, el barrido lo reinyecta y aparece el mensaje |
| 15 | **Postgres caído** (C) | PostgREST devuelve 503 durante 20 min | Los mensajes se reintentan con retroceso, ninguno llega a la DLQ, y al volver el servicio todos se persisten una sola vez |
| 16 | **Consumidor muerto antes del `ack`** (C) | Matar el proceso tras escribir en Postgres y antes de acusar | La reentrega devuelve todos los efectos como `duplicado` y no crea ninguna fila ni ningún Broadcast |
| 17 | **KV obsoleto** (B+C) | Entrada de KV que apunta a la organización anterior tras reasignar el activo | El cron de reconciliación detecta la discrepancia y alerta. Documenta el comportamiento real dentro de la ventana de TTL |
| 18 | **Standby** (B) | El mismo mensaje en `standby[]` en vez de `messaging[]` | Fila idéntica salvo `llego_por_standby = true`. `conversations.en_standby` a cierto |
| 19 | **Postback por standby** (B) | Postback sin campo `payload` | Evento con `postback_payload` nulo, métrica `postback_sin_payload_total`, cero excepciones |
| 20 | **Reacción y su retirada** (B) | `react` y `unreact` del mismo actor sobre el mismo `mid` | Dos filas en `message_events`. Reprocesar ambas no añade filas |
| 21 | **Acuses de los dos modelos** (B) | `read.watermark` de Messenger y `read.mid` de Instagram | Cada uno en su columna. Ninguno escribe en la del otro |
| 22 | **Host fuera de allowlist** (B) | `attachment.payload.url` en `evil.example.com`, y otra en `169.254.169.254` | URL no persistida, mensaje sí, `is_unsupported` marcado, `host_bloqueado_total` incrementado, alerta, cero excepciones |
| 23 | **Firma inválida** (C) | `POST` al Worker de ingesta con firma incorrecta | No se encola nada, no se escribe nada en Postgres, el contador de rechazos del borde sube |
| 24 | **Concurrencia de conversación** (B) | Diez llamadas simultáneas con el mismo `(org, canal, contacto)` | Una conversación, diez veces el mismo identificador devuelto |
| 25 | **Clave raíz desconocida** (U) | `messaging[]` con una clave que Meta no documenta hoy | Efecto `desconocido.registrar`, métrica, el resto del cuerpo intacto |
| 26 | **Basura estructurada** (U) | `entry` nulo, `messaging` como objeto, campos ausentes, cadenas donde van objetos | Ningún adaptador lanza. Todo acaba en efectos o en `desconocido.registrar` |
| 27 | **Cruce de tenant a nivel de esquema** (B) | `insert` deliberado en `messages` con `conversation_id` de otra organización, con rol de servicio | Falla con violación de clave foránea |
| 28 | **Fusión de contactos con conversación abierta en el mismo canal** (B) | Dos contactos, ambos con conversación `open` en Instagram | La fusión no viola el índice único parcial. La menos reciente queda cerrada con registro. La reversión devuelve el estado exacto |

Los casos 1, 2, 3, 5, 7, 8, 9 y 11 son los exigidos por el alcance de la fase. Los demás cubren
huecos que se descubrieron al escribir el plan y son igual de obligatorios.

---

## 9. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fallo de enrutado de tenant | Mensajes de un cliente en el tenant de otro. El peor fallo del sistema | Clave primaria de `meta_asset_routes`, claves foráneas compuestas de la §6, cuarentena sin organización de respaldo, pruebas 13 y 27 |
| KV obsoleto tras reasignar un activo | El mismo cruce de datos, por la puerta de atrás | TTL de 60 s, invalidación en la escritura, procedimiento manual de reasignación, cron de reconciliación KV contra Postgres, prueba 17 |
| Cuerpo de Meta mayor que el límite de mensaje de la cola | La ingesta no puede encolar y devuelve error, y Meta desuscribe a la hora | Verificación en consola antes de construir (§11, pregunta 1) y descarga a R2 con puntero en la cola si el límite queda corto |
| Un update roto reintenta el cuerpo entero | Reproceso inútil de 999 updates y posible bucle | Clasificación transitorio contra permanente, cuarentena por update, `ack()` en el caso permanente, prueba 12 |
| `standby` no disponible en Instagram vía Facebook Login | Kavea ciega y muda para ese cliente, sin error visible | El parser lo lee desde el día uno. Comprobación empírica en la §11. Métrica `standby_total` para detectar el día que empiece a llegar |
| Excepción en el parser tumba el cuerpo | Pérdida de todos los mensajes del lote, no solo del afectado | Subtransacción por efecto en el RPC, parser tolerante, prueba 12 |
| Tipo nuevo de adjunto de Meta | El parser deja de reconocer contenido | Fallback con payload crudo y métrica con alerta a la primera aparición. `raw` guardado permite reprocesar sin pedir nada a Meta, que además no lo daría: la Conversations API solo devuelve 20 mensajes |
| 30 de agosto de 2026: stickers solo como `sticker` | Los stickers dejan de verse en la bandeja | `sticker` es tipo de primera clase desde ahora. Prueba 10 |
| Descarga de media entrante por iniciativa de alguien | Rechazo del App Review, con precedente documentado | Solo URL, restricción `media_origen_coherente`, sin ruta de código que descargue, SafeFetch sin llamantes y regla de análisis estático |
| Rebobinado de `last_incoming_at` | Envío fuera de la ventana de 24 h, error 100 o violación de política | Avance monótono con `greatest`, prueba 2 |
| Echo re-disparando al agente | Bucle de respuestas y quema del número o de la Página del cliente | Ningún echo dispara al agente, con independencia del `app_id`. Pruebas 7 y 8 |
| Conversaciones duplicadas | Hilo partido en la bandeja, contexto perdido para el agente | Índice único parcial más función de resolución con relectura. Prueba 24 |
| Fusión errónea de contactos | Dos historiales comerciales mezclados. Incidencia de privacidad | Cero fusión automática entre canales de Meta. Fusión manual, auditada y reversible |
| `webhook_events` como fuga de contenido | Tabla multi-tenant, sin `organization_id`, con el cuerpo íntegro de todos los mensajes | RLS con cero políticas, solo rol de servicio, nunca expuesta por PostgREST, purga a 30 días |
| Coste de subtransacciones en cuerpos grandes | Degradación del RPC con lotes de cola grandes | `max_batch_size` conservador, medición en la prueba 11 antes de subirlo |
| Observabilidad partida entre dos proveedores | Un incidente se diagnostica mirando dos consolas | Coste reconocido por el `02` §5.3. Se mitiga con la tabla de métricas en base y alertas en los dos lados, no con disciplina |
| Forma real del payload de WhatsApp distinta de la supuesta | El adaptador C se reescribe entero | No se escribe hasta tener payload real capturado. La interfaz sí, para que el resto no dependa de ello |
| `messages` sin techo de crecimiento | Coste de Supabase y degradación de consultas | `raw` solo cuando hay algo que reprocesar. Sin particionado en v1; la salida es archivar conversaciones cerradas |

---

## 10. Definición de terminado

La fase está terminada cuando **todo** lo siguiente se cumple. No hay parciales: el criterio de
avance del `00` §9 es que no se pasa de fase con deuda de la anterior.

1. Los 28 casos de la §8 pasan en integración continua —unitarios, de base efímera y de cola con el
   simulador local— en cada `push`.
2. Mensajes reales de Instagram y de Messenger de la cuenta de Boosty entran por el Worker de
   ingesta, pasan por la cola y aparecen normalizados en `messages`, con su conversación, su
   contacto y su media, sin intervención manual.
3. Reproducir 24 horas de tráfico real capturado deja exactamente el mismo estado que procesarlo
   una vez.
4. Con Postgres inaccesible 20 minutos no se pierde ningún evento y la DLQ queda vacía.
5. Ninguna escritura sobre tablas de negocio ocurre fuera del RPC. El consumidor solo llama a RPC,
   verificado por análisis estático.
6. Ninguna llamada de red usa una URL procedente de un webhook. El contador de llamantes de
   SafeFetch es cero, y es intencionado.
7. Un cuerpo de 1000 updates se procesa dentro del presupuesto de latencia acordado, con p95 medido
   y registrado.
8. Las claves foráneas compuestas de la §6 están aplicadas y la prueba 27 falla si alguien las
   quita.
9. Las métricas de la tarea 14 se ven en el panel interno y en la consola de Cloudflare, y las
   alertas disparan en una prueba de humo.
10. La purga de `webhook_events` corre y se ha comprobado que borra. El consumidor de DLQ vacía a
    cuarentena y se ha comprobado con un mensaje real.
11. El `02` §7.6 recoge las cinco correcciones de la §7, o queda escrito por qué no.
12. Cada punto de la §11 está o resuelto con evidencia, o registrado como pendiente con responsable
    y fecha. Un incierto sin dueño es deuda.

---

## 11. Preguntas abiertas

Salen de la sección `inciertos` del `03` y de contradicciones detectadas al escribir este plan.
Ninguna se resuelve leyendo más documentación de Meta: requieren comprobación empírica.

**Bloquean la fase:**

1. **Límite de tamaño de mensaje de Cloudflare Queues frente al peor caso de Meta.** Un cuerpo con
   1000 updates puede superar el límite por mensaje de la cola. Si lo supera, la ingesta no puede
   encolar, devuelve error y Meta desuscribe a la hora. *Comprobación:* leer el límite vigente en la
   consola y medir el peor cuerpo real capturado. *Mitigación si queda corto:* el Worker de ingesta
   escribe el cuerpo en R2 y encola un puntero, dentro del mismo presupuesto de tiempo.
2. **Forma real del payload de WhatsApp.** Del `03` solo consta
   `object='whatsapp_business_account'` y la ruta `entry[].changes[].value.messages[]`. Todo lo
   demás —nombres de campo, dónde viene el identificador del remitente, si hay número de teléfono,
   cómo llegan los estados de entrega, si hay equivalente de echo— es desconocido. *Comprobación:*
   capturar payloads reales de un número de prueba antes de escribir el adaptador C.
3. **Enrutado de WhatsApp por `phone_number_id`.** La tarea 3 propone registrar filas de tipo `waba`
   y `phone_number` en `meta_asset_routes`. Falta confirmar que `entry[].id` es efectivamente la
   WABA y que `value.metadata.phone_number_id` llega siempre. *Comprobación:* un webhook real con
   dos números en la misma WABA.

**No bloquean, pero condicionan lo que se puede prometer:**

4. **Si `standby`, `message_echoes`, `message_reactions` y `messaging_handover` llegan de verdad en
   Instagram por la vía Facebook Login.** Dos páginas oficiales se contradicen. Sin `standby`, Kavea
   se queda ciega cuando Business Suite se apropia del hilo. *Comprobación:* suscribir, mover una
   conversación a Main en Business Suite y observar dónde llegan los eventos.
5. **Si `message_edit` existe realmente.** Aparece en el changelog del 10-sep-2025 pero no en la
   tabla viva de campos suscribibles. *Comprobación:* suscribir y editar un mensaje.
6. **Valor real de `object` en los webhooks de Instagram**, `page` o `instagram`. No cambia el
   diseño —se enruta por `entry[].id`— pero cierra un incierto. *Comprobación:* leer el campo de un
   webhook real.
7. **Nombres exactos de `subscribed_fields`:** `messaging_referral` frente a `messaging_referrals`,
   `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a
   `messaging_reactions`. Un valor fuera del enum hace fallar la suscripción entera.
   *Comprobación:* Graph API Explorer.
8. **Si el `mid` del echo coincide con el `message_id` que devuelve el Send API.** Si coinciden, la
   correlación la resuelve el `on conflict do nothing`. Si no, hace falta el camino por `metadata`.
   *Comprobación:* enviar y capturar el echo, en el bloque 4.
9. **Si Instagram admite el campo `metadata` en el envío y lo devuelve en el echo.** Los ejemplos
   oficiales de Instagram no lo muestran. Sin él, la correlación de salientes propios en Instagram
   no tiene segundo camino. *Comprobación:* envío real.
10. **App ID de la bandeja de Meta Business Suite:** `263902037430900` (15 dígitos) frente a
    `26390203743090` (14). La decisión de que ningún echo dispare al agente lo saca del camino
    crítico, pero sigue haciendo falta para atribuir correctamente. *Comprobación:* leer el `app_id`
    de un echo enviado desde Business Suite.
11. **TTL de las URLs de `lookaside.fbsbx.com`** y si requieren token. No está documentado. Determina
    qué se le puede prometer al cliente sobre ver una imagen de hace un mes. *Comprobación:* guardar
    una URL real y sondearla hasta que devuelva 403 o 404.
12. **Si el navegador del usuario puede renderizar directamente una URL de `lookaside`** sin proxy y
    sin credenciales. Si no puede, la bandeja del bloque 3 tiene un problema que no se resuelve con
    un proxy propio, porque proxear es cachear. *Comprobación:* abrir una URL real desde una sesión
    limpia.
13. **Si Meta permite la descarga efímera en memoria para visión.** La política prohíbe
    *storing/caching the media content* y no dice nada sobre procesamiento transitorio. Es una
    decisión de riesgo, no un hecho. *Comprobación:* consulta por escrito a Meta Developer Support
    antes del App Review, con la respuesta guardada.
14. **Si `pending` debe entrar en el predicado del índice único parcial de `conversations`.** Hoy es
    `where status = 'open'`, así que dos conversaciones en `pending` para el mismo contacto y canal
    son legales. *Decisión de producto:* depende de qué signifique `pending` en la bandeja del
    bloque 3.
15. **Retención de `webhook_events` y de `webhook_cuarentena`.** 30 días es una propuesta. El plazo
    definitivo lo fija lo que diga la política de privacidad publicada. *Decisión de Gabriel.*
16. **Presupuesto de latencia de ingesta.** Se propone p95 por debajo de 5 s de recepción a mensaje
    persistido, para dejar margen dentro de los 30 segundos que Meta exige a las respuestas
    automáticas. *Decisión de Gabriel.*

**Cerrada por el cambio de arquitectura:** si `pg_cron` admite intervalos sub-minuto. Ya no aplica.
El normalizador es un consumidor de cola, no un proceso planificado, y los crones de la fase
—barrido de cuarentena, reconciliación de KV— son Cron Triggers de Cloudflare, por la misma razón
del `02` §5.2 por la que la reconciliación de suscripciones no va en Supabase. El único uso restante
de `pg_cron` sería la purga de la bitácora, que es local a la base, no sale por HTTPS y no necesita
granularidad fina.
