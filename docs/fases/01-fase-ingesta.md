# Kavea — Fase 1: Ingesta y receptor de eventos

**Fecha:** 2 de agosto de 2026
**Estado:** plan de ejecución, sin código escrito
**Depende de:** `02-conexion-instagram-facebook.md` §5 y §6 (autoritativo en plataforma),
`03-invariantes-meta.md` (normativo), `04-configuracion-app-meta.md`,
`06-arquitectura-plataforma.md` (cede ante el 02)
**Corresponde a:** fase 2 del flujo de `02` §5.1, bloque 1 del orden de construcción

> **Nota de revisión.** La primera versión de este plan situaba el receptor en una Supabase Edge
> Function con la cola en una tabla de Postgres. `02` §5.2 y §5.3 descartan explícitamente esa
> plataforma y cierran la decisión en Cloudflare Workers más Cloudflare Queues, con
> *"Supabase Edge Functions → no se despliega ninguna en v1"*. Este documento está reescrito sobre
> esa base. Lo que no dependía de la plataforma —tratamiento del cuerpo crudo, firma, alertas,
> observabilidad, mediciones— se conserva y se adapta. La sección 5 recoge qué se pierde en el
> cambio, sin adornos.

---

## 1. Objetivo

Que un evento emitido por Meta en cualquiera de los tres canales quede encolado en Cloudflare
Queues con la firma verificada y con un 200 devuelto en menos de cinco segundos, **sin que el
camino de ingesta toque Postgres**, y que Kavea se entere cuando Meta deje de entregar.

La fase termina con un endpoint público, una cola durable, un consumidor mínimo que deja bitácora
legible, un Cron Trigger de reconciliación de suscripciones y las métricas que permiten afirmar que
la ingesta está viva. No incluye normalización, ni resolución de tenant, ni escritura en `messages`:
eso es la fase 2.

### La propiedad que gobierna el diseño

Tras una hora de entregas fallidas Meta manda "Webhooks Disabled" y **desuscribe la app de esa
Página**, con resuscripción manual. No es degradación: es apagado por cliente y en silencio. De ahí
sale la propiedad más cara del sistema, que es que el endpoint devuelva 200 pase lo que pase, y de
ahí sale la separación de dominios de fallo: **Postgres puede estar caído una hora entera y los
eventos se acumulan en la cola en vez de perderse.** El handler no necesita la base de datos para
hacer su trabajo; solo necesita el App Secret, que es uno para toda la app porque solo hay una app
de Meta.

### Lo que el receptor no hace

Cada uno de estos añadidos ha aparecido en implementaciones reales y todos rompen la invariante de
los cinco segundos, la de la firma o la de la separación de dominios de fallo:

- No parsea el JSON. No lee `object`, ni `entry[]`, ni `messaging[]`.
- **No toca Postgres.** Ni para resolver tenant, ni para escribir, ni para leer configuración. Si el
  receptor abre una conexión a la base, la decisión de `02` §5.3 queda anulada de hecho.
- No resuelve `entry[].id` contra `meta_asset_routes`. El enrutado multi-tenant es fase 2.
- No deduplica. La idempotencia vive en `unique (organization_id, canal, mid)` de `messages`. Un
  reintento de Meta produce dos mensajes en la cola y una sola fila en `messages`. Eso es correcto.
- No descarga media, no llama a Graph API, no llama a Claude.
- **No responde 200 antes de que la cola haya aceptado el mensaje.** `ctx.waitUntil()` está prohibido
  para el encolado: confirmar a Meta un evento que todavía no está encolado lo pierde para siempre,
  porque Meta no reintenta un 200. `ctx.waitUntil()` sí es la forma correcta de mandar una alerta
  después de haber respondido; son dos usos distintos y la diferencia importa.

El coste del handler es constante respecto al número de eventos del lote y lineal respecto a los
bytes. Un lote de 1000 `entry[]` cuesta lo mismo que uno de 1.

---

## 2. Precondiciones

| # | Precondición | Origen | Cómo se verifica |
|---|---|---|---|
| P1 | App de Meta nueva, tipo Business, bajo el portfolio de Boosty Digital LLC | `04` A2 | El App Dashboard muestra el App ID y `Verified` en Review → Verification |
| P2 | App Secret y verify token en el almacén de secretos del Worker | `02` §5.4 | `wrangler secret list` los muestra en el Worker de ingesta |
| P3 | `GRAPH_API_VERSION=v26.0` como variable única leída por todos los clientes HTTP | `03` invariantes | Ninguna cadena `graph.facebook.com/v` con versión literal en el repositorio |
| P4 | Cuenta de Cloudflare con **Workers Paid**. Queues no está en el plan gratuito | esta fase | El panel permite crear una cola |
| P5 | Subdominio `workers.dev` de la cuenta elegido y nombre del Worker fijado | `06` §3 | Ver nota abajo |
| P6 | Tablas `organizations`, `meta_connections`, `meta_asset_routes` y `webhook_events` desplegadas según `02` §7 | `02` §7 | La migración corre limpia en un proyecto vacío |
| P7 | Al menos una Página de staging con tarea de mensajería concedida al system user de Kavea | `04` §2 | `GET /me/accounts` la lista con `MESSAGING` en `tasks` |
| P8 | Page Access Token derivable para esa Página | `04` §2.4 nº2 | `GET /{page-id}?fields=access_token` devuelve token |
| P9 | Resultado del test de `04` §5 anotado | `04` §5 | Se sabe si `POST /subscribed_apps` funciona con Standard Access o si el App Review es ruta crítica |

**Sobre P5. El receptor no puede vivir en `webhooks.kavea.ai`, y no importa.** `02` §5.1 escribía esa
URL, pero un Custom Domain o una Workers Route exigen que la zona esté en Cloudflare, y `06` §3 cerró
la decisión contraria: **la zona `kavea.ai` se delega a Netlify DNS**, porque Netlify solo emite y
renueva certificados comodín cuando controla la zona, y sin comodín no hay `cliente1.kavea.ai`.
Cloudflare se evaluó y se descartó: en modo DNS-only no resuelve el reto ACME, y en modo proxy
Netlify desaconseja por escrito poner su CDN detrás de otro.

La URL del receptor es, por tanto, `https://kavea-meta-webhook.<subdominio>.workers.dev/meta`, donde
`<subdominio>` es el subdominio de la cuenta de Cloudflare, que se elige una sola vez y no se cambia.

**Funcionalmente esto no cuesta nada.** Meta solo pide una URL HTTPS estable, alcanzable y con
certificado válido para hacer el handshake y entregar. `*.workers.dev` cumple las tres desde el primer
minuto, con certificado emitido y renovado por Cloudflare sin intervención. No hay ninguna capacidad
de Meta que dependa del dominio: ni la firma, ni el handshake, ni la suscripción por topic, ni los
reintentos. Lo único que se pierde es cosmético y está anotado en la sección 5.

**Lo que sí hay que fijar antes de registrar la URL en el App Dashboard** es el **nombre del Worker**,
porque el nombre es el hostname: renombrar `kavea-meta-webhook` cambia la URL, obliga a rehacer el
handshake y es un ajuste a nivel de app que afecta a los tres topics a la vez.

**Sobre P9.** Si el test de `04` §5 falla, esta fase se construye y se prueba igual contra la Página
de Boosty en modo desarrollo, pero suscribir Páginas de clientes queda bloqueado hasta el App Review.
Cambia el calendario, no el diseño.

**Consecuencia de `04` C2 (Require app secret).** Con ese ajuste activo, toda llamada a Graph API
necesita `appsecret_proof`. El Cron Trigger de reconciliación es la primera llamada saliente del
proyecto y falla con 400 si se olvida. Está contemplado en la tarea 8.

---

## 3. Entregables

| # | Entregable | Dónde |
|---|---|---|
| E1 | Worker de ingesta | `workers/meta-webhook/` |
| E2 | Cola `meta-raw` con su cola de mensajes muertos | Cloudflare Queues |
| E3 | Worker consumidor mínimo de bitácora | `workers/meta-bitacora/` |
| E4 | Worker de tareas fuera de banda, con Cron Triggers | `workers/meta-cron/` |
| E5 | Durable Object de alertas, con deduplicación y salida por Resend | dentro de E4 |
| E6 | Bucket R2 de desbordamiento para lotes que exceden el límite de mensaje | `kavea-webhook-overflow` |
| E7 | Migración: `webhook_events.cuerpo_crudo`, `r2_key`, `duracion_ms`, constraint de firma | `supabase/migrations/` |
| E8 | Migración: tabla `alertas` como espejo para el panel interno | `supabase/migrations/` |
| E9 | Migración: vistas de observabilidad sobre la bitácora | `supabase/migrations/` |
| E10 | Fixtures de payload firmables, incluida la de unicode escapado | `pruebas/fixtures/` |
| E11 | Script de firma y envío para pruebas manuales | `pruebas/firmar.ts` |
| E12 | Constante de `subscribed_fields` confirmada contra el enum real | secretos y variables + acta |
| E13 | Acta de mediciones empíricas de la fase | `docs/fases/01-mediciones.md` |

E13 no es documentación decorativa. Cierra varios de los `inciertos` de `03` y es la entrada de la
fase 2.

---

## 4. Tareas

### Tarea 1 — Worker de ingesta, ruta y despliegue

Tres Workers separados, no uno con tres responsabilidades. El motivo es el mismo que saca el
receptor del despliegue de la interfaz en `02` §5.3: un despliegue del cron no puede tumbar la
ingesta.

```jsonc
// workers/meta-webhook/wrangler.jsonc
{
  "name": "kavea-meta-webhook",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-01",

  // Sin "routes" ni "custom_domain": la zona kavea.ai está en Netlify DNS (06 §3).
  // El hostname sale del nombre del Worker más el subdominio de la cuenta.
  "workers_dev": true,

  "queues": {
    "producers": [{ "queue": "meta-raw", "binding": "META_RAW" }]
  },
  "r2_buckets": [
    { "binding": "DESBORDE", "bucket_name": "kavea-webhook-overflow" }
  ],
  "analytics_engine_datasets": [
    { "binding": "METRICAS", "dataset": "kavea_ingesta" }
  ],
  "observability": { "enabled": true }
}
```

```bash
wrangler secret put META_APP_SECRET   --name kavea-meta-webhook
wrangler secret put META_VERIFY_TOKEN --name kavea-meta-webhook
wrangler deploy
```

#### Qué capas hay delante del código

**No hay `verify_jwt` que desactivar.** Ese ajuste era de Supabase Edge Functions y desaparece con la
plataforma.

Tampoco hay configuración de zona que revisar, y conviene decirlo con precisión para no perseguir un
fantasma: **Bot Fight Mode, las reglas de WAF gestionadas, las Rate Limiting Rules, las Redirect
Rules, las Transform Rules y Access son ajustes de una zona de Cloudflare.** `kavea.ai` no es una zona
de Cloudflare y `workers.dev` no es una zona de Kavea, así que ninguno de esos ajustes se aplica al
receptor y ninguno puede desconfigurarse por error. Es una lista de trampas que este despliegue no
tiene.

Lo que sí sigue habiendo delante del código, y por tanto sigue en el criterio de aceptación:

- **Que el subdominio `workers.dev` esté habilitado para este Worker.** Con `workers_dev: false`, o
  con el subdominio de la cuenta sin reclamar, el hostname no existe y la respuesta la da Cloudflare,
  no el Worker.
- **Despliegues graduales.** Si se usan versiones con reparto por porcentaje, una fracción del tráfico
  de Meta llega a una versión antigua. Para este Worker el despliegue es siempre al 100%: un receptor
  a medio desplegar es un receptor con dos comportamientos de firma distintos.
- **Los errores propios de la plataforma**, que se sirven sin llegar al código: 1101 cuando el Worker
  lanza, 1102 al agotar CPU, 1015 y 1027 por límites de cuenta.
- **Los límites del isolate.** El techo de memoria de un Worker es del orden de 128 MB. Con
  `MAX_BYTES` a 20 MB conviven en memoria el `ArrayBuffer`, el string decodificado y el mensaje
  serializado, que son tres copias con distinta representación. No es un problema con los tamaños
  reales esperados, pero es la razón por la que el punto 8 de la tarea 13 mide la distribución de
  tamaño antes de dar el guardarraíl por bueno.

**Criterio de aceptación.** `curl -i https://kavea-meta-webhook.<subdominio>.workers.dev/meta` sin
cabeceras devuelve **403 con cuerpo `forbidden`**, generado por el Worker. Cualquier otra cosa —un
error 1xxx de Cloudflare, un 404 porque el subdominio no está habilitado, un 522— significa que la
petición no llegó al Worker y que Meta tampoco llegaría. **La distinción entre "el Worker rechazó" y
"algo anterior al Worker rechazó" sigue siendo el criterio**, aunque la lista de cosas que pueden
rechazar antes sea ahora más corta.

**Criterio adicional.** `curl -sv` muestra certificado válido para `*.workers.dev` y ninguna
redirección previa.

---

### Tarea 2 — Cola, desbordamiento a R2 y migración de la bitácora

#### La cola

```jsonc
// wrangler queues create meta-raw
// wrangler queues create meta-raw-dlq
{
  "queues": {
    "consumers": [{
      "queue": "meta-raw",
      "max_batch_size": 25,
      "max_batch_timeout": 5,
      "max_retries": 5,
      "dead_letter_queue": "meta-raw-dlq"
    }]
  }
}
```

La cola de mensajes muertos existe desde el primer despliegue. Sin ella, un mensaje que el consumidor
no logra procesar se reintenta hasta agotarse y desaparece.

#### El límite de tamaño de mensaje: el riesgo nuevo

Verificado en la documentación de Cloudflare el 2 de agosto de 2026:

| Límite | Valor |
|---|---|
| Tamaño máximo de mensaje | **128 KB**, contando 1 KB como 1000 bytes, e incluyendo ~100 bytes de metadatos internos |
| Lote de envío | 100 mensajes o 256 KB en total |
| Lote del consumidor | 100 mensajes |
| Reintentos por mensaje | 100 |
| **Retención** | **Configurable hasta 14 días en plan de pago. 24 horas fijas y no configurables en el plan gratuito de Workers** |

`03` dice que los lotes traen hasta 1000 updates: mil eventos de mensaje a media de 500 bytes son
500 KB, muy por encima del tope. Un `send()` que falla por tamaño obliga al Worker a devolver 500,
Meta reintenta, vuelve a fallar, y a la hora hay desuscripción. El desborde a R2 no es una
precaución: es obligatorio desde el primer despliegue.

> **Consecuencia de presupuesto, no de ingeniería: el plan de pago de Workers es un requisito
> derivado de la arquitectura, no una mejora opcional.** Todo el argumento del `02` §5.3 es que
> Postgres puede caerse y los eventos se acumulan en la cola en vez de perderse. Eso es cierto
> *hasta el límite de retención*. Con 24 horas fijas del plan gratuito, una caída larga de fin de
> semana pierde mensajes de clientes en silencio, que es exactamente el fallo que esta arquitectura
> existe para evitar. Con 14 días configurables, el margen es real.

Este modo de fallo no existía con la cola en Postgres, donde una columna `text` absorbe megabytes sin
configuración. Se cierra con el patrón de resguardo: **si el mensaje serializado supera el umbral,
los bytes originales van a R2 y por la cola viaja un puntero.**

Dos detalles que deciden si el umbral es correcto:

- Se mide el **mensaje serializado**, no el cuerpo crudo. Meter una cadena dentro de un JSON duplica
  cada barra invertida, y un payload lleno de secuencias escapadas se acerca al doble de su tamaño.
  Un umbral puesto sobre el cuerpo crudo se queda corto justo con los payloads en español.
- A R2 van los **bytes originales**, no el texto decodificado. Es la representación más fiel posible
  y permite recalcular el HMAC meses después.

Los objetos de desborde contienen texto de mensajes de usuarios finales. No son media —no se guarda
ningún binario de `lookaside.fbsbx.com`, así que la invariante de `03` sobre media entrante queda
intacta— pero sí son contenido personal. Llevan **regla de ciclo de vida con borrado a los 7 días** y
no se exponen por ninguna URL pública.

#### La bitácora en Postgres

`02` §7.6 define `webhook_events` con `cuerpo jsonb not null`. La enmienda de la versión anterior de
este plan sigue siendo válida y aquí es igual de necesaria: **`jsonb` normaliza al almacenar,
reordena claves, elimina espaciado y desescapa las secuencias `\uXXXX`.** Un cuerpo guardado como
`jsonb` ya no permite recalcular el HMAC ni reproducir el incidente.

```sql
-- El cuerpo crudo va en text. Es la única representación con la que la firma cuadra.
alter table public.webhook_events add column cuerpo_crudo text;
alter table public.webhook_events add column r2_key       text;   -- resguardo de lotes grandes
alter table public.webhook_events add column duracion_ms  integer;
alter table public.webhook_events alter column cuerpo drop not null;

-- Nada sin firma verificada llega a la bitácora. Se enforcea en la base, no solo en el código.
alter table public.webhook_events
  add constraint webhook_events_firma_ok_chk check (firma_ok);

comment on column public.webhook_events.cuerpo_crudo is
  'Bytes del cuerpo decodificados como UTF-8, sin parsear. No convertir a jsonb: destruye el escapado unicode y con el la firma. Null cuando el lote desbordo a R2: ver r2_key.';
```

`cuerpo jsonb` se deja nullable y sin uso en fase 1. Si al final de la fase 2 sigue vacía, se
elimina; es una decisión que necesita visto bueno explícito porque toca el esquema de `02` §7.6.

#### Tabla de alertas

`02` no define una y la invariante de desuscripción exige "alerta interna". Entra aquí como **espejo
para el panel interno**, no como camino primario de alerta: el camino primario vive en Cloudflare y
no puede depender de Postgres.

```sql
create table public.alertas (
  id              bigserial primary key,
  tipo            text not null,   -- firma_invalida | encolado_fallido | desborde_fallido
                                   -- | desuscripcion | reconciliacion_fallida | token_invalido
                                   -- | dlq | backlog | silencio
  severidad       text not null check (severidad in ('p1','p2')),
  organization_id uuid references public.organizations(id) on delete set null,
  detalle         jsonb not null default '{}'::jsonb,
  notificada_en   timestamptz,
  created_at      timestamptz not null default now()
);

create index alertas_pendientes_idx on public.alertas (created_at) where notificada_en is null;
```

`detalle` **nunca** contiene el cuerpo del webhook ni texto de mensajes. Solo metadatos: tamaño,
cabeceras, identificadores. Es coherente con el modelo de acceso de `06` §6, donde el admin ve
metadatos y no contenido.

`webhook_events` y `alertas` quedan fuera del alcance de la API y solo las toca el rol de servicio,
por el motivo que da `02` §7.6: un lote puede traer assets de tenants distintos y la fila cruda es
anterior al enrutado.

**Criterio de aceptación.** La migración corre limpia sobre una base con `02` §7 aplicado.
`insert into webhook_events (firma_ok, cuerpo_crudo) values (false, '{}')` es rechazado por el
constraint. La cola y su DLQ existen y `wrangler queues list` las muestra.

---

### Tarea 3 — Handshake de verificación

Meta valida el endpoint al guardarlo en el App Dashboard y en cada re-guardado. Es un GET con tres
parámetros de consulta. El challenge se devuelve **crudo**: sin comillas, sin envolver en JSON, sin
salto de línea final.

```ts
function handshake(request: Request, env: Env): Response {
  const p         = new URL(request.url).searchParams;
  const mode      = p.get('hub.mode');
  const token     = p.get('hub.verify_token');
  const challenge = p.get('hub.challenge');

  if (mode === 'subscribe' && token && challenge && iguales(token, env.META_VERIFY_TOKEN)) {
    return new Response(challenge, {
      status:  200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response('forbidden', { status: 403 });
}
```

Tres detalles que no son opcionales:

- La comparación de `hub.verify_token` contra el valor configurado es obligatoria. Sin ella cualquiera
  registra su propio endpoint apuntando al de Kavea.
- La comparación va en tiempo constante, con la misma función que la firma. El verify token es un
  secreto de longitud fija y una comparación con salida temprana lo filtra carácter a carácter.
- La URL de callback se registra **sin parámetros de consulta**. Meta añade los suyos.

**Criterio de aceptación.**

```bash
URL=https://kavea-meta-webhook.<subdominio>.workers.dev/meta
curl -s "$URL?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=$META_VERIFY_TOKEN" | xxd | tail -2
```

La salida es exactamente `1158201444` y diez bytes, sin `0a` final. Con un token equivocado devuelve
403. Con `hub.mode=unsubscribe` devuelve 403.

---

### Tarea 4 — Validación de firma sobre el cuerpo crudo

Esta es la tarea que decide si Kavea funciona en Venezuela, República Dominicana y México. **No
cambia con la plataforma**: la Fetch API es la misma en un Worker que en Deno, y el error posible es
idéntico.

Meta firma el cuerpo con HMAC-SHA256 usando el App Secret y lo entrega en `X-Hub-Signature-256` con
el prefijo literal `sha256=` y hex en minúscula. `X-Hub-Signature` (SHA1) es legacy y no se valida.

**Meta firma sobre una versión del payload con unicode escapado.** Cita oficial: *"we generate the
signature using an escaped unicode version of the payload, with lowercase hex digits. If you just
calculate against the decoded bytes, you will end up with a different signature."* Meta manda `café`
como `caf\u00e9`: seis caracteres ASCII para la `é`. `JSON.parse` los convierte en un carácter
real y `JSON.stringify` de JavaScript no vuelve a escaparlos; además reordena claves y normaliza
espaciado. El cuerpo resultante es otro y el HMAC es otro.

El fallo que produce esto es peor que un fallo limpio: solo aparece cuando el usuario escribe con
tildes, eñes o emoji. Nunca en las pruebas en inglés, siempre en los tres mercados de Kavea.

#### Cómo se obtiene el cuerpo crudo en un Worker

Un Worker de módulo recibe un `Request` estándar de la Fetch API. El cuerpo es un `ReadableStream`
que **solo se puede consumir una vez**:

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Primera y única lectura del stream. Los bytes exactos que llegaron por el socket.
    const bytes = new Uint8Array(await request.arrayBuffer());
    // A partir de aquí request.json(), request.text() y request.formData() lanzan.
  },
} satisfies ExportedHandler<Env>;
```

- `request.arrayBuffer()` entrega los bytes sin transformar. Es la única fuente admisible para el
  HMAC.
- `request.text()` también sirve, porque decodifica UTF-8 sin reinterpretar el contenido: las
  secuencias `\u00e9` son literales ASCII dentro del JSON y sobreviven al decodificado. Se
  prefiere `arrayBuffer()` porque el HMAC opera sobre bytes y evita una reconversión.
- `request.json()` está prohibido en este handler. No es una recomendación de estilo: es el bug.
- `request.clone()` no hace falta y duplica el cuerpo en memoria.
- Entre Meta y el Worker no hay parseador de cuerpo, así que el problema clásico de Express
  (`express.json()` consumiendo el stream antes del handler) no aplica. Sobre `workers.dev` tampoco
  hay Transform Rules de zona que puedan reescribir el cuerpo, porque no hay zona. **El riesgo vuelve
  el día que el receptor se ponga detrás de un dominio propio o de cualquier proxy**: ese día hay que
  verificar que los bytes llegan intactos antes de dar el cambio por hecho.
- Lo que se encola es el string decodificado dentro de un campo del mensaje, no el objeto.
  `JSON.stringify({cuerpo_crudo: texto})` escapa el **string** para transportarlo; las secuencias
  `\u00e9` que hay dentro del string se transportan como `\\u00e9` y vuelven a salir
  idénticas. Eso es un round-trip sin pérdida. Lo que rompe es `JSON.stringify(JSON.parse(texto))`,
  que es otra operación.

#### El código

```ts
// workers/meta-webhook/src/firma.ts

// La CryptoKey se importa una vez por isolate, no una vez por petición.
let claveHmac: Promise<CryptoKey> | null = null;
function clave(appSecret: string): Promise<CryptoKey> {
  claveHmac ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return claveHmac;
}

export async function firmaValida(
  bytes: Uint8Array,
  cabecera: string,
  appSecret: string,
): Promise<boolean> {
  const esperado = cabecera.slice('sha256='.length).trim().toLowerCase();
  if (esperado.length !== 64) return false;

  const mac = await crypto.subtle.sign('HMAC', await clave(appSecret), bytes);
  const calculado = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return iguales(calculado, esperado);
}

// Comparación en tiempo constante. Un === temprano filtra la firma byte a byte.
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

#### Qué se responde ante firma inválida

**401, no 200.** Una petición forjada no es una entrega de Meta y no debe contar como entregada. Pero
hay una consecuencia que obliga a alertar en el primer fallo: si el App Secret se rota, se copia mal
o se desincroniza entre los dos entornos donde vive —el Worker y el runtime de Next.js, según la
tabla de `02` §5.4—, **todas** las entregas reales fallan aquí y Meta desuscribe en una hora. No hay
umbral: la primera firma inválida genera alerta P1.

El cuerpo de una petición con firma inválida **no se encola ni se guarda**. Es contenido controlado
por un tercero no autenticado y meterlo en la cola lo convierte en entrada del normalizador de fase
2. Se registra una alerta con metadatos y nada más.

**Criterio de aceptación.** Los casos de la tarea 12 pasan, incluida la fixture con unicode escapado.
Y una prueba de regresión que falla a propósito: un commit que introduzca
`JSON.stringify(JSON.parse(cuerpo))` antes del HMAC debe hacer fallar la suite en la fixture de
unicode y pasar en la fixture ASCII. Si ambas fallan o ambas pasan, la suite no está probando lo que
cree.

---

### Tarea 5 — Encolado y respuesta 200

```ts
// workers/meta-webhook/src/index.ts
import { firmaValida, iguales } from './firma';

// Guarda contra floods. Muy por encima de cualquier lote real: un 413 a una entrega
// legítima cuenta como fallo de entrega y alimenta el reloj de desuscripción.
const MAX_BYTES = 20 * 1024 * 1024;

// Umbral de desborde a R2, medido sobre el MENSAJE SERIALIZADO. Se fija por debajo del
// tope real de Queues, que hay que verificar en la documentación vigente.
const UMBRAL_DESBORDE = 96 * 1024;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const t0 = Date.now();

    if (request.method === 'GET')  return handshake(request, env);
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    const declarado = Number(request.headers.get('content-length') ?? '0');
    if (declarado > MAX_BYTES) return new Response('payload too large', { status: 413 });

    // Se comprueba la forma de la cabecera antes de gastar CPU en el HMAC.
    const cabecera = request.headers.get('x-hub-signature-256');
    if (!cabecera?.startsWith('sha256=')) {
      ctx.waitUntil(alertar(env, 'firma_invalida', 'p1', { motivo: 'cabecera ausente o mal formada' }));
      return new Response('missing signature', { status: 401 });
    }

    // Los BYTES, una sola vez, antes de nada. Nunca request.json().
    const bytes = new Uint8Array(await request.arrayBuffer());

    if (!(await firmaValida(bytes, cabecera, env.META_APP_SECRET))) {
      ctx.waitUntil(alertar(env, 'firma_invalida', 'p1', { bytes: bytes.byteLength }));
      return new Response('signature mismatch', { status: 401 });
    }

    // Se decodifica SOLO para transportar. El HMAC ya se calculó sobre los bytes.
    const cuerpoCrudo = new TextDecoder('utf-8').decode(bytes);

    const base = {
      recibido_en: new Date().toISOString(),
      bytes:       bytes.byteLength,
    };

    try {
      // Se mide el mensaje YA SERIALIZADO: el escapado de la cadena infla el tamaño.
      const mensaje    = { ...base, cuerpo_crudo: cuerpoCrudo, duracion_ms: 0 };
      const serializado = new TextEncoder().encode(JSON.stringify(mensaje)).byteLength;

      if (serializado > UMBRAL_DESBORDE) {
        const r2Key = `crudo/${base.recibido_en}-${crypto.randomUUID()}.json`;
        await env.DESBORDE.put(r2Key, bytes);          // los BYTES originales, sin tocar
        await env.META_RAW.send(
          { ...base, r2_key: r2Key, duracion_ms: Date.now() - t0 },
          { contentType: 'json' },
        );
      } else {
        await env.META_RAW.send(
          { ...mensaje, duracion_ms: Date.now() - t0 },
          { contentType: 'json' },
        );
      }
    } catch (e) {
      // 500 a propósito. Meta reintenta un 500; un 200 pierde el evento para siempre.
      ctx.waitUntil(alertar(env, 'encolado_fallido', 'p1', { error: String(e), bytes: bytes.byteLength }));
      return new Response('queue write failed', { status: 500 });
    }

    // Métrica fuera del camino de respuesta. No toca Postgres.
    env.METRICAS.writeDataPoint({
      blobs:   ['ok'],
      doubles: [Date.now() - t0, bytes.byteLength],
      indexes: ['meta'],
    });

    return new Response('EVENT_RECEIVED', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
```

Notas de diseño:

- **Cero Postgres, cero PostgREST, cero pooler.** Desaparece el `AbortController` de tres segundos
  que la versión anterior necesitaba para no colgarse esperando a la base: ya no hay a qué esperar.
  El presupuesto de cinco segundos deja de competir con la disponibilidad de Supabase, que es
  exactamente el punto de `02` §5.3.
- `ctx.waitUntil()` para la alerta, nunca para el encolado. La alerta no puede retrasar la respuesta;
  el encolado no puede ocurrir después de ella.
- `alertar()` habla con un Durable Object que deduplica y decide si manda correo, y de ahí sale a
  Resend por HTTPS. Ese camino no pasa por Postgres, porque la alerta que más importa es la que se
  produce cuando Postgres no está. El espejo en la tabla `alertas` lo escribe el Worker de cron, y su
  fallo no es fatal.
- No hay cabeceras CORS ni manejador de `OPTIONS`. Meta no hace preflight.

**Criterio de aceptación.** Una entrega firmada devuelve 200 con
`curl -o /dev/null -s -w '%{http_code} %{time_total}'` por debajo de 0,5 s en caliente y por debajo
de 5,0 s en frío. Aparece exactamente un mensaje en la cola. Con la cola deshabilitada o el binding
mal configurado, la respuesta es 500 y llega la alerta. **Con Supabase apagado por completo, la
respuesta sigue siendo 200:** ese es el criterio que justifica toda la decisión de plataforma y hay
que ejecutarlo de verdad, no darlo por bueno.

---

### Tarea 6 — Consumidor mínimo de bitácora

Esta pieza no estaba en el plan anterior y la obliga el cambio de plataforma. Con la cola en Postgres,
todo lo ingerido era legible con un `select` desde el primer minuto. Con Cloudflare Queues el
contenido de la cola no se puede inspeccionar: el panel da profundidad y edad, no mensajes. Sin un
consumidor, la fase 1 no tiene forma de verificar sus propios criterios de aceptación.

El consumidor de fase 1 es deliberadamente corto. Escribe la bitácora de `02` §7.6 y nada más:

```ts
// workers/meta-bitacora/src/index.ts
export default {
  async queue(lote: MessageBatch<MensajeCrudo>, env: Env): Promise<void> {
    for (const m of lote.messages) {
      try {
        const crudo = m.body.r2_key
          ? await (await env.DESBORDE.get(m.body.r2_key))!.text()
          : m.body.cuerpo_crudo!;

        // Aquí SÍ se puede parsear: estamos fuera del camino de la firma y del de los 5 s.
        // Lo que se guarda es el crudo; el parseo solo alimenta columnas de traza.
        const j = JSON.parse(crudo);

        await insertar(env, {
          recibido_en:  m.body.recibido_en,
          firma_ok:     true,
          object:       typeof j?.object === 'string' ? j.object : null,
          cuerpo_crudo: crudo,
          r2_key:       m.body.r2_key ?? null,
          cuerpo_bytes: m.body.bytes,
          duracion_ms:  m.body.duracion_ms,
          entry_ids:    Array.isArray(j?.entry) ? j.entry.map((e: any) => String(e?.id)) : [],
        });

        m.ack();
      } catch (e) {
        // retry() con backoff. Tras max_retries el mensaje va a la DLQ y eso es una alerta P1.
        m.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
```

Fronteras explícitas, para que esto no se convierta en el normalizador por acumulación:

- **No resuelve `entry[].id` contra `meta_asset_routes`.** Guarda los identificadores en `entry_ids`
  para trazar, y nada más.
- No escribe en `messages`, ni en `conversations`, ni en `contacts`.
- No toca media.
- Un `JSON.parse` que falle no descarta el mensaje: reintenta y acaba en la DLQ, donde se investiga.
  Un payload que no parsea es una señal, no un evento a tirar.

Es también el esqueleto sobre el que crece el normalizador de la fase 2, así que conviene que el
límite quede escrito en el propio código.

**Criterio de aceptación.** Tras enviar la fixture de unicode con firma válida, hay exactamente una
fila en `webhook_events` y `cuerpo_crudo` coincide byte a byte con el fichero. Con Postgres caído, el
consumidor reintenta, la profundidad de la cola crece y el receptor sigue devolviendo 200. Al volver
Postgres, la cola se drena sola y no falta ningún evento.

---

### Tarea 7 — Suscripción de la app a los topics

Dos niveles distintos que se confunden con frecuencia:

1. **Nivel app**, una vez, en el App Dashboard → Webhooks: se registra la URL de callback y el verify
   token, y se suscribe la app a los topics `page`, `instagram` y `whatsapp_business_account`,
   marcando los campos de cada uno.
2. **Nivel objeto**, una vez por tenant: `POST /{page-id}/subscribed_apps` con `subscribed_fields`.
   Sin este paso la app está suscrita al topic pero no recibe nada de esa Página concreta. Según
   `02` §5.2 esta llamada vive en el route handler del onboarding en Next.js, y su fallo debe abortar
   el alta con un mensaje concreto en vez de dejar un tenant a medio conectar.

`04` §2.4 nº2 documenta el error que se encuentra quien salta el paso 2 con el token equivocado:
`/subscribed_apps` **no acepta el token de system user**, devuelve error 190 subcode 2069032 y exige
un Page Access Token derivado.

#### Campos por topic

Conjunto mínimo propuesto para v1. Cada campo extra multiplica el volumen de la cola, así que se pide
lo que la fase 2 va a consumir y nada más:

| Topic | Campos v1 | Motivo |
|---|---|---|
| `page` | `messages`, `messaging_postbacks`, `message_echoes`, `standby`, `message_reads`, `messaging_referrals` | Mensajes, botones, lo que el cliente responde desde el móvil o Business Suite, el canal standby cuando Business Suite se apropia del hilo, el acuse de lectura para la bandeja, y el objeto `referral` que resuelve la atribución a pauta sin permisos de anuncios |
| `instagram` | `messages`, `messaging_postbacks`, `messaging_seen`, `message_echoes`, `messaging_referral`, `message_reactions`, `standby` | Los tres últimos, condicionados: ver abajo |
| `whatsapp_business_account` | `messages` como mínimo; `message_template_status_update`, `account_update` y `phone_number_quality_update` a evaluar | Sin verificar. Ver abajo |

Fuera de v1 y con motivo: `message_deliveries` (un evento por entrega, volumen alto, sin consumidor en
el modelo de datos), `messaging_optins`, `messaging_handovers`, y todo lo de comentarios, que `03`
deja explícitamente fuera de v1.

#### Lo que aquí no se puede dar por hecho

`03` marca cuatro cosas como inciertas y esta tarea no las resuelve por decreto:

- **Los nombres exactos del enum.** `messaging_referral` frente a `messaging_referrals`,
  `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a
  `messaging_reactions`. Un valor fuera del enum hace fallar la llamada entera, no el campo suelto.
  Se resuelve en consola, una vez, antes de escribir la llamada, y el resultado se anota en E13.
- **Si `message_reactions`, `standby`, `message_echoes` y `message_edit` existen en la vía Facebook
  Login para Instagram.** Una tabla oficial dice que no, otra página lista los dos primeros como
  suscribibles. No se afirma ninguna: se suscribe, se provoca el evento y se observa qué llega.
- **Si la suscripción de Instagram se hace sobre la Página o sobre el `ig_business_account_id`.**
  `02` §6.6 indica que la reconciliación corre contra los dos. La hipótesis de trabajo es que
  suscribir la Página cubre Instagram, pero no está confirmada y la tarea 8 comprueba las dos rutas.
- **Todo lo de WhatsApp.** `03` es explícito: WhatsApp no se investigó y ninguna sección debe afirmar
  nada más allá de los cinco puntos verificados. La forma del webhook
  (`object='whatsapp_business_account'`, `entry[].changes[].value.messages[]`, una cuarta forma de
  payload incompatible con las tres de Meta Messaging) es hipótesis de trabajo, no hecho. **El
  receptor es indiferente a la forma del payload porque no lo parsea, así que puede ingerir WhatsApp
  desde el primer día**; lo que no se puede es diseñar la fase 2 sobre una forma supuesta. Ver la
  tarea 13 y la pregunta abierta 6.

Confirmado el enum, la lista vive en variables de entorno del Worker de cron y del route handler de
onboarding, con el mismo valor en los dos sitios:

```
SUBSCRIBED_FIELDS_PAGE=messages,messaging_postbacks,message_echoes,standby,message_reads,messaging_referrals
SUBSCRIBED_FIELDS_IG=messages,messaging_postbacks,messaging_seen,...
SUBSCRIBED_FIELDS_WABA=messages,...
```

Que ese valor viva en dos entornos distintos es una de las costuras que `02` §5.3 admite como precio
de la decisión. Se cierra con un test de paridad, no con disciplina.

**Criterio de aceptación.** `POST /{page-id}/subscribed_apps` con la lista confirmada devuelve
`{"success":true}` para la Página de Boosty y para la Página de un cliente real, no solo la propia.
Un DM enviado desde una cuenta personal produce fila en `webhook_events` en menos de 10 s. E13
contiene la lista literal de valores que el enum aceptó y los que rechazó.

---

### Tarea 8 — Cron Trigger de reconciliación de suscripciones

**Por qué existe.** Verbatim de `03`: a los 15 minutos de entregas fallidas Meta manda una alerta, y
tras 1 hora de fallos continuados la app queda **desuscrita** de esa Página o cuenta de Instagram,
con resuscripción manual. Una caída de una hora no degrada Kavea: la apaga por cliente y en silencio.
No hay error, no hay código de estado, no hay log. El cliente se entera cuando reclama.

**Por qué en Cloudflare y no en Supabase.** `02` §5.2 lo dice sin rodeos: este cron existe para
recuperarse de una caída y tiene que funcionar cuando el resto no funciona; además hace llamadas
HTTPS salientes, que en `pg_cron` obligarían a `pg_net` y meterían la dependencia dentro de la base
de datos. La versión anterior de este plan lo resolvía justamente con `pg_cron` más `pg_net`, y esa
solución queda descartada.

```jsonc
// workers/meta-cron/wrangler.jsonc
{
  "name": "kavea-meta-cron",
  "main": "src/index.ts",
  "triggers": { "crons": ["3,18,33,48 * * * *", "17 4 * * *"] },
  "durable_objects": {
    "bindings": [{ "name": "ALERTAS", "class_name": "Alertas" }]
  }
}
```

Los Cron Triggers de Cloudflare corren en **UTC**. El primero es la reconciliación cada 15 minutos,
desplazada para no coincidir con otros trabajos en punto. El segundo es la salud de credenciales
diaria (`GET /debug_token`) y la vigilancia de versión de `02` §5.1, que comparten el mismo Worker.

```ts
const V = env.GRAPH_API_VERSION;   // v26.0. Nunca literal en el path.

// Require app secret (04 C2) obliga a firmar cada llamada con el token como mensaje.
async function appsecretProof(token: string, appSecret: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function revisar(assetId: string, pageToken: string, esperados: string[], env: Env) {
  const u = new URL(`https://graph.facebook.com/${V}/${assetId}/subscribed_apps`);
  u.searchParams.set('access_token',    pageToken);   // NO el token de system user: 190/2069032
  u.searchParams.set('appsecret_proof', await appsecretProof(pageToken, env.META_APP_SECRET));

  const r = await fetch(u);
  const cuota = {
    app:   r.headers.get('x-app-usage'),
    bucds: r.headers.get('x-business-use-case-usage'),
  };
  const j = await r.json();

  if (!r.ok) {
    // 190 = token invalidado: se marca la conexión como desconectada y se PARA. No en bucle.
    // 4, 17, 32, 613, 80001/80002/80006 = throttling: respetar estimated_time_to_regain_access.
    return { estado: 'error', codigo: j?.error?.code, cuota };
  }

  const mia    = (j.data ?? []).find((a: any) => a.id === env.META_APP_ID);
  const tiene  = new Set<string>(mia?.subscribed_fields ?? []);
  const faltan = esperados.filter((f) => !tiene.has(f));

  return { estado: mia ? (faltan.length ? 'incompleta' : 'ok') : 'desuscrita', faltan, cuota };
}
```

Reacción por estado, escrita sobre `meta_connections` (`subscription_ok`,
`last_subscription_check_at`, `subscribed_fields_messenger`, `subscribed_fields_instagram`, `estado`),
que `02` §7.2 ya prevé para este cron:

| Estado | Acción | Alerta |
|---|---|---|
| `ok` | `subscription_ok = true`, `last_subscription_check_at = now()` | Ninguna |
| `incompleta` | `POST /subscribed_apps` con la lista completa | P2. Puede ser un despliegue de campos nuevos, no una desuscripción |
| `desuscrita` | `POST /subscribed_apps` con la lista completa | **P1.** Meta desuscribió. Registrar el intervalo desde la última entrega recibida de ese `entry[].id` |
| `error` código 190 | `estado = 'disconnected'`, `token_invalid_since = now()`, parar | P1 por tenant |
| `error` throttling | Parar el barrido, respetar `estimated_time_to_regain_access` | P2 |

**Dependencia que hay que decir en voz alta.** El cron necesita leer `meta_connections` y descifrar
tokens, así que **sí depende de Postgres**, a diferencia del receptor. Si Supabase está caído, el cron
no puede reconciliar. Eso no invalida la decisión de `02` —lo que hay que proteger a toda costa es el
200, no el cron— pero obliga a que la incapacidad de leer la base sea en sí misma una alerta P1 por
un camino que no pasa por la base. El Durable Object de alertas cumple ese papel.

**Cadencia.** Cada 15 minutos, más una ejecución forzada tras cada despliegue del receptor y tras
cualquier incidente. Con 28 Páginas y hasta tres comprobaciones por conexión son unas 84 llamadas por
ejecución. Se lee `X-App-Usage` en cada respuesta y se baja a 30 minutos si el consumo sube: `03` es
explícito en que seguir llamando durante un throttling alarga el bloqueo.

**Criterio de aceptación.** Se desuscribe la app a mano de la Página de staging
(`DELETE /{page-id}/subscribed_apps`), se espera al siguiente ciclo y sin intervención humana: la app
vuelve a estar suscrita, hay alerta P1 de tipo `desuscripcion` con correo entregado,
`meta_connections.subscription_ok` pasó por `false` y volvió a `true`, y un DM posterior vuelve a
producir fila en `webhook_events`.

---

### Tarea 9 — Alertas: Durable Object y salida por Resend

El camino de alerta no puede depender de Postgres, porque la alerta que más importa es la que se
produce cuando Postgres no está. Tampoco puede depender de Netlify.

```ts
// Un DO único, nombrado 'global'. Es el mismo primitivo que 02 §5.3 defiende para los
// rate limits: una instancia por identificador, con estado y sin coordinación externa.
export class Alertas implements DurableObject {
  async fetch(req: Request): Promise<Response> {
    const { tipo, severidad, detalle } = await req.json<Alerta>();
    const ahora  = Date.now();
    const ultima = (await this.state.storage.get<number>(`ultima:${tipo}`)) ?? 0;

    // Cortacircuitos: como mucho un correo por tipo cada 10 minutos.
    // Un flood de firmas inválidas no se convierte en un flood de correos.
    if (ahora - ultima > 10 * 60 * 1000) {
      await enviarPorResend(tipo, severidad, detalle);
      await this.state.storage.put(`ultima:${tipo}`, ahora);
    }
    await this.acumular(tipo, severidad, detalle);   // para el resumen y el espejo en Postgres
    return new Response('ok');
  }
}
```

Reglas:

- Las P1 salen en el primer ciclo. Las P2 se agrupan en un resumen cada 15 minutos, emitido por el
  mismo Cron Trigger.
- El correo lleva tipo, severidad, recuento, ventana temporal y el `organization_id` cuando se conoce.
  **Nunca contenido de mensajes.**
- El espejo en la tabla `alertas` de Postgres lo escribe el Worker de cron, en el mejor esfuerzo, para
  que el panel interno pueda mostrar el histórico. Que ese `insert` falle no impide el aviso.
- La alerta va primero a Boosty, no al cliente, según `02` §5.4.

**Criterio de aceptación.** Provocar una firma inválida produce correo en menos de 60 s. Provocar 500
firmas inválidas seguidas produce un correo, no 500, y el recuento agregado aparece en el resumen.
Con Supabase apagado, el correo sigue llegando.

---

### Tarea 10 — Observabilidad

Los logs del Worker tienen retención corta y no son el registro. El registro es `webhook_events`. En
los logs solo va lo que no es contenido: método, resultado, bytes, `duracion_ms`, presencia de la
cabecera de firma. **Nunca el cuerpo.**

Las métricas del camino caliente van a **Workers Analytics Engine**, no a Postgres, para no
reintroducir por la puerta de atrás la dependencia que la tarea 5 quita. La bitácora sigue siendo la
fuente para todo lo que necesite consulta ad hoc.

#### Qué se mide

| Métrica | Fuente | Para qué |
|---|---|---|
| Entregas por minuto | Analytics Engine + bitácora | Línea base de tráfico y detección de silencio |
| p50 / p95 / p99 de `duracion_ms` | Analytics Engine | El presupuesto de 5 s es un techo, no un objetivo |
| Distribución de `cuerpo_bytes` y máximo | bitácora | Mide el lote real frente al supuesto de 1000 updates |
| Tasa de desborde a R2 | Analytics Engine | Si es alta, el umbral está mal o el tope de Queues se queda corto |
| Recuento de 401 por firma inválida | Analytics Engine + `alertas` | Rotación de secreto, error de configuración o escaneo externo |
| Recuento de 500 por encolado fallido | Analytics Engine + `alertas` | Salud de Queues y de R2 |
| Profundidad de la cola y edad del mensaje más antiguo | métricas de Queues | Salud del consumidor. Umbral muy por debajo de la retención de la cola |
| Mensajes en la DLQ | métricas de Queues | Cualquier valor distinto de cero es una investigación |
| Última reconciliación correcta y conexiones re-suscritas | `meta_connections`, `alertas` | Estado real de las suscripciones |
| Silencio por objeto | bitácora, consultada por el cron | Desuscripción silenciosa, toggle del cliente desactivado, app restringida |

```sql
create or replace view public.v_receptor_salud as
select date_trunc('minute', recibido_en)                                   as minuto,
       count(*)                                                            as entregas,
       count(*) filter (where r2_key is not null)                          as desbordes,
       percentile_disc(0.50) within group (order by duracion_ms)           as p50_ms,
       percentile_disc(0.95) within group (order by duracion_ms)           as p95_ms,
       max(duracion_ms)                                                    as max_ms,
       max(cuerpo_bytes)                                                   as bytes_max
  from public.webhook_events
 where recibido_en > now() - interval '6 hours'
 group by 1
 order by 1 desc;

create or replace view public.v_ingesta_silencio as
select coalesce(object, 'desconocido') as objeto,
       max(recibido_en)                as ultima_entrega,
       now() - max(recibido_en)        as silencio
  from public.webhook_events
 group by 1;
```

#### Qué dispara alerta

| Condición | Severidad | Por qué |
|---|---|---|
| Una sola firma inválida | P1 | Si el App Secret está mal, fallan el 100% de las entregas y hay menos de una hora antes de la desuscripción |
| Cualquier 5xx del receptor | P1 | Alimenta directamente el reloj de una hora |
| Fallo de `send()` a la cola o de `put()` a R2 | P1 | Es la única causa de 5xx que queda tras quitar Postgres del camino |
| p95 de `duracion_ms` > 2000 ms durante 5 minutos | P2 | Margen antes del techo de 5 s |
| Cualquier mensaje en la DLQ | P1 | Un evento que el consumidor no supo procesar |
| Edad del mensaje más antiguo en la cola > 1 hora | P1 | Umbral muy por debajo de la retención de Queues, que hay que verificar |
| El cron re-suscribe cualquier conexión | P1 | Hubo desuscripción real y hubo pérdida |
| El cron no corre o falla dos ciclos seguidos | P1 | Se pierde la única vigilancia sobre la desuscripción |
| El cron no puede leer Postgres | P1 | La reconciliación está ciega |
| Error 190 en cualquier conexión | P1 por tenant | Token invalidado: para, no reintentes |
| Sin entregas durante 2 horas en horario laboral | P1 | El fallo silencioso. Umbral a calibrar tras una semana de línea base |
| `cuerpo_bytes` por encima de 5 MB en una entrega | P2 informativo | Aprender el techo real del lote, que Meta no documenta |

El umbral de silencio es el que más ajuste necesita: durante el dogfooding solo hay un tenant y el
tráfico nocturno es cero por razones legítimas. Se calibra con datos, no antes. La versión por
organización es de fase 3, cuando haya varios tenants con líneas base distintas.

**Criterio de aceptación.** Las dos vistas devuelven datos tras una hora de tráfico real. Cada
condición de la tabla se dispara al menos una vez en staging, provocada a mano, y produce la alerta
esperada. Una condición que no se ha visto disparar no está implementada.

---

### Tarea 11 — Endurecimiento del endpoint público

El endpoint no lleva autenticación de transporte por diseño, así que cualquiera puede llamarlo.
Medidas proporcionadas:

- Rechazo temprano: sin `X-Hub-Signature-256` bien formada no se lee el cuerpo ni se calcula HMAC.
- Guarda de `content-length` a 20 MB, muy por encima de cualquier lote real. Un 413 a una entrega
  legítima cuenta como fallo de entrega.
- Sin cabeceras CORS y sin manejador de `OPTIONS`.
- Métrica del volumen de 401. Un pico sostenido es consumo de invocaciones, no un riesgo de datos.
  **Sobre `workers.dev` no hay Rate Limiting Rules de zona a las que recurrir**, así que la única
  defensa configurable es el binding de Rate Limiting dentro del propio Worker, y solo si el coste lo
  justifica. Sea cual sea la forma, tiene que excluir el tráfico de Meta: una regla mal puesta aquí es
  una desuscripción.
- v1 **no** valida el certificado de cliente de Meta. La autenticidad se establece con el HMAC. `03`
  marca el cambio de CA de los certificados mTLS (31-mar-2026,
  `meta-outbound-api-ca-2025-12.pem`) como corroborado solo por snippets, porque el changelog de
  Messenger Platform devuelve HTTP 500. **Corrección respecto a la versión anterior de este plan:**
  ahí se decía que Cloudflare hacía este punto más viable, y con la zona en Netlify eso deja de ser
  cierto. El mTLS de cliente de Cloudflare es una función de zona o de hostname personalizado, y
  `workers.dev` no la ofrece. Si Meta llegara a exigirlo, la salida sería mover el receptor a un
  dominio propio en una zona de Cloudflare, con el coste de DNS que `06` §3 ya descartó por otras
  razones. Queda como riesgo abierto sin mitigación disponible hoy.

**Criterio de aceptación.** Un POST sin cabecera de firma devuelve 401 sin haber leído el cuerpo,
medido por una duración claramente menor que la de una entrega válida.

---

### Tarea 12 — Cómo se prueba

#### 12.1 Fixtures

Cuatro como mínimo, en `pruebas/fixtures/`:

| Fixture | Contenido | Qué prueba |
|---|---|---|
| `messenger-texto-ascii.json` | Mensaje de texto en inglés | Camino feliz. **Pasa aunque el código esté roto** |
| `messenger-texto-unicode.json` | `"text":"\u00f1and\u00fa caf\u00e9 \ud83c\udf7b"` tal cual, con las barras invertidas literales | El bug de tildes y emoji. Es la fixture que importa |
| `instagram-mensaje.json` | Payload con `"object":"instagram"` | Que el receptor no discrimina por `object` |
| `lote-grande.json` | 1000 `entry[]` sintéticos | El supuesto de tamaño de lote, el presupuesto de 5 s y **la ruta de desborde a R2** |

La fixture de unicode se genera **sin pasar por `JSON.stringify`**: se escribe a mano o se copia de
una entrega real capturada. Un generador que serialice un objeto de JavaScript produciría los
caracteres ya decodificados y la fixture dejaría de probar lo que debe.

`lote-grande.json` es ahora una prueba de dos cosas, no de una: que el receptor responde a tiempo y
que el camino de desborde funciona de punta a punta, desde el `put()` en R2 hasta el `get()` del
consumidor.

#### 12.2 Entrega con firma válida

```bash
URL=https://kavea-meta-webhook.<subdominio>.workers.dev/meta
F=pruebas/fixtures/messenger-texto-unicode.json

FIRMA=$(openssl dgst -sha256 -hmac "$META_APP_SECRET" -binary < "$F" | xxd -p -c 256)

curl -sS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "X-Hub-Signature-256: sha256=$FIRMA" \
  --data-binary @"$F" \
  -o /dev/null -w 'http=%{http_code} tiempo=%{time_total}'
```

`--data-binary` es obligatorio. `-d @archivo` elimina los saltos de línea del fichero, cambia los
bytes y produce una firma que no cuadra: se pierde media tarde buscando un bug en el handler que está
en el cliente de prueba.

Alternativa portable, sin `openssl` ni `xxd`, útil en Windows y reutilizable en la suite:

```ts
// pruebas/firmar.ts — deno run --allow-env --allow-read --allow-net pruebas/firmar.ts <fixture>
const secreto = Deno.env.get('META_APP_SECRET')!;
const url     = Deno.env.get('WEBHOOK_URL')!;
const bytes   = await Deno.readFile(Deno.args[0]);   // BYTES del fichero, sin decodificar

const k   = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(secreto),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const mac = await crypto.subtle.sign('HMAC', k, bytes);
const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');

const t0 = performance.now();
const r  = await fetch(url, {
  method:  'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${hex}` },
  body:    bytes,          // se envían los mismos bytes que se firmaron
});
console.log(r.status, await r.text(), `${Math.round(performance.now() - t0)} ms`);
```

Deno aquí es herramienta de pruebas, no plataforma de despliegue. La misma comprobación corre en
local contra `wrangler dev`, cambiando `WEBHOOK_URL`.

Resultado esperado: `200 EVENT_RECEIVED`, y una fila en `webhook_events` cuyo `cuerpo_crudo` coincide
byte a byte con el fichero.

#### 12.3 Entrega con firma inválida

Cinco casos, todos con 401, sin mensaje en la cola y sin fila en `webhook_events`:

1. Sin cabecera `X-Hub-Signature-256`.
2. Cabecera sin el prefijo `sha256=`.
3. Firma correcta con un solo carácter hex cambiado.
4. Firma calculada con un App Secret distinto.
5. Solo `X-Hub-Signature` (SHA1), correctamente calculada. Se rechaza: SHA1 es legacy.

Y el caso que descubre el bug de unicode: firmar `messenger-texto-unicode.json` correctamente y
comprobar que devuelve **200**. Si devuelve 401 con la firma bien calculada, alguien reintrodujo un
`JSON.parse` en el camino.

#### 12.4 Handshake

```bash
curl -s "$URL?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=$META_VERIFY_TOKEN"
# → 1158201444  (sin comillas, sin salto de línea, content-type text/plain)

curl -s -o /dev/null -w '%{http_code}' "$URL?hub.mode=subscribe&hub.challenge=1&hub.verify_token=incorrecto"
# → 403
```

Y la prueba real: guardar la URL en el App Dashboard. Meta hace el handshake al guardar y muestra el
error si no cuadra.

#### 12.5 Independencia de Postgres

Es el criterio que justifica toda la decisión de plataforma y hay que ejecutarlo, no suponerlo.

1. Pausar el proyecto de Supabase, o revocar la clave de servicio que usa el consumidor.
2. Mandar tres DMs reales a la Página de staging.
3. Comprobar que el receptor devuelve 200 a los tres, que la profundidad de la cola sube a 3 y que no
   hay ninguna alerta de tipo `encolado_fallido`.
4. Restaurar Supabase y comprobar que la cola se drena sola y que aparecen las tres filas, en orden de
   `recibido_en` y sin pérdidas.

Con la arquitectura anterior este escenario terminaba en tres respuestas 500 y en el reloj de la
desuscripción corriendo.

#### 12.6 Reintento y desuscripción

Solo en staging y sobre una Página de pruebas, porque el resultado esperado es que Meta desuscriba esa
Página. Es el objetivo del experimento.

1. Desplegar una variante del receptor que devuelva 500 a todo POST firmado. Vive en una rama y no se
   mezcla: nada de una variable de entorno que active 500 en producción.
2. Mandar un DM a la Página de staging desde una cuenta personal.
3. Registrar la marca temporal de cada reintento. `03` deja el backoff sin confirmar: Graph API
   Webhooks dice *"retry immediately, then a few more times with decreasing frequency over the next
   36 hours"*; Messenger Platform dice alerta a los 15 minutos y desuscripción a la hora. Son dos
   políticas oficiales que Meta no reconcilia. **Este experimento las mide.**
4. Comprobar si llega la alerta de desarrollador a los 15 minutos y la de "Webhooks Disabled" a la
   hora, y si `GET /{page-id}/subscribed_apps` deja de listar la app.
5. Restaurar el receptor correcto y comprobar que el Cron Trigger re-suscribe solo.

Anotar los intervalos reales en E13. Es la única forma de saber cuánto margen hay de verdad en un
incidente y de calibrar el umbral de silencio de la tarea 10.

Prueba corta, sin esperar una hora: devolver 500 durante dos minutos y confirmar que el mismo evento
llega más de una vez y produce dos filas en `webhook_events` con el mismo `mid` dentro del cuerpo. Dos
filas es lo correcto; la deduplicación es de la fase 2.

#### 12.7 El botón de prueba del App Dashboard

El Dashboard tiene un envío de payload de muestra por topic. Dos cosas que comprobar antes de usarlo
como prueba: si firma el payload con el App Secret, y qué identificadores lleva. Si no firma, el
receptor lo rechazará con 401 y ese es el comportamiento correcto, no un fallo. Sus identificadores
son ficticios y en la fase 2 caerán en cuarentena por no resolver contra `meta_asset_routes`.
**Sin confirmar: verificar en el Dashboard y anotar en E13.**

---

### Tarea 13 — Acta de mediciones

Documento `docs/fases/01-mediciones.md` con lo que esta fase mide y que cierra puntos abiertos de `03`
y del cambio de plataforma:

1. Valores del enum de `subscribed_fields` aceptados y rechazados, por topic.
2. Si `message_reactions`, `standby`, `message_echoes` y `message_edit` llegan de verdad en la vía
   Facebook Login para Instagram.
3. Si `object` llega como `page` o como `instagram` para eventos de Instagram, con payload real. No
   cambia el diseño del receptor, que no lo lee, pero cierra una contradicción documental.
4. Backoff real de reintentos de Meta y tiempo hasta la desuscripción.
5. Si `/{ig-business-account-id}/subscribed_apps` existe y responde, o si la suscripción de Instagram
   vive solo en la Página.
6. Forma real del primer webhook de WhatsApp: valor de `object`, estructura de `entry[]`, qué
   identificador lleva `entry[].id`, dónde vive `phone_number_id`, y si viene firmado con el mismo
   App Secret.
7. ~~Tope y retención de Cloudflare Queues.~~ Cerrado el 2-ago-2026: 128 KB por mensaje y retención
   de 14 días en plan de pago, 24 horas en el gratuito. `UMBRAL_DESBORDE` se fija contra los 128 KB
   medidos sobre el mensaje ya serializado.
8. Distribución de tamaño de lote y de `entry[]` por entrega, y porcentaje de entregas que desbordan a
   R2.
9. p50/p95/p99 del receptor en frío y en caliente.
10. Si el botón de prueba del Dashboard firma sus payloads.
11. Si Meta sigue redirecciones en la entrega de webhooks. Con el receptor en `workers.dev` no hay
    Redirect Rules de zona que puedan interponerse, así que este punto baja de prioridad; se anota
    igual porque es la pregunta que decide si algún día se puede mover el receptor a un dominio propio
    sin re-registrar la URL en el App Dashboard.

**Criterio de aceptación.** Los once puntos tienen respuesta o una razón explícita de por qué siguen
abiertos. Un punto sin respuesta y sin razón es deuda de fase, y la regla de `00` §9 dice que no se
pasa de fase con deuda de la anterior.

---

## 5. Qué se gana y qué se pierde con Cloudflare

La decisión de `02` §5.3 es correcta y el argumento que la sostiene —la regla de la hora— domina a
todo lo demás. Dicho eso, el cambio no es gratis, y tres cosas del diseño anterior eran mejores.
Quedan aquí escritas en vez de enterradas.

### Lo que se gana

1. **El 200 deja de depender de Postgres.** Es el motivo y es suficiente por sí solo. Una migración
   larga, un pool agotado o una ventana de mantenimiento dejan de ser una desuscripción masiva de
   todos los tenants a la vez.
2. **Menos latencia en el camino caliente.** Desaparece el salto a PostgREST y con él el
   `AbortController` de tres segundos que existía para no agotar el presupuesto esperando a la base.
3. **Durable Objects disponibles para la fase 4.** El token bucket por `page_id` que piden los rate
   limits asimétricos tiene primitivo nativo, en vez de un lock en Postgres por cada envío. En esta
   fase ya se usa para deduplicar alertas, que es el mismo patrón a escala pequeña.
4. **Ninguna configuración de zona que desconfigurar.** Bot Fight Mode, WAF, rate limiting,
   redirecciones y transformaciones son ajustes de zona, y el receptor no vive en una. Es una familia
   entera de fallos silenciosos que este despliegue no puede tener.

### Lo que se pierde

1. **El tope de tamaño de mensaje de Queues introduce un modo de fallo nuevo.** Una columna `text` en
   Postgres absorbe megabytes sin configuración; Queues tiene un tope del orden de 128 KB y `03` dice
   que los lotes traen hasta 1000 updates. Un `send()` que falla por tamaño es un 500, y un 500
   sostenido es una desuscripción. Se cierra con el desborde a R2, que son dos piezas más —un bucket,
   una regla de ciclo de vida— y dos modos de fallo más. **En este punto concreto el diseño anterior
   era estrictamente mejor**, y el precio se paga a cambio de la separación de dominios de fallo.
2. **La cola deja de ser inspeccionable.** Con la cola en Postgres, cualquier pregunta sobre lo
   pendiente se respondía con un `select`. Cloudflare Queues da profundidad y edad, no contenido. La
   consecuencia práctica es que la fase 1 necesita un consumidor de bitácora (tarea 6) que antes salía
   gratis. No es un coste grande, pero es trabajo que el cambio de plataforma añade a esta fase.
3. **El constraint `check (firma_ok)` sale del camino de ingesta.** Antes la base garantizaba que nada
   sin firma podía entrar en la cola, con independencia de lo que hiciera el código. Ahora esa
   garantía vuelve a ser "el código lo hace bien" más la suite de pruebas, y el constraint solo cubre
   la bitácora, un salto después. Es una degradación real de la garantía, aunque el efecto observable
   sea el mismo mientras el código sea correcto.
4. **Retención acotada de la cola.** Una tabla retiene lo que se quiera; Queues descarta pasado su
   plazo. Si el consumidor está roto más tiempo que la retención, hay pérdida de eventos que Meta ya
   dio por entregados con un 200. Antes ese reloj no existía. Se mitiga alarmando sobre la edad del
   mensaje más antiguo muy por debajo del plazo, y verificando cuál es el plazo vigente (punto 7 de la
   tarea 13).
5. **Dos proveedores, dos almacenes de secretos, observabilidad partida.** Lo admite `02` §5.3 y no
   hay que adornarlo: `GRAPH_API_VERSION`, el App Secret y la lista de `subscribed_fields` viven en
   dos sitios y pueden desincronizarse. Se mitiga con un test de paridad de entornos, no con
   disciplina. El coste concreto en esta fase es que la observabilidad del receptor vive en Analytics
   Engine y la de la bitácora en Postgres, y ninguna consulta las cruza.
6. **El cron sigue dependiendo de Postgres**, porque necesita los tokens. Sacarlo de Supabase resuelve
   que el planificador funcione cuando la base no responde, pero no que el trabajo pueda completarse.
   La mejora real es que ahora ese fallo es visible y alertable por un camino independiente, en vez de
   silencioso.
7. **Se pierde el dominio propio para el receptor.** `02` §5.1 escribía `webhooks.kavea.ai`, pero un
   dominio propio de Workers exige la zona en Cloudflare y `06` §3 la delegó a Netlify DNS para poder
   emitir el certificado comodín de `*.kavea.ai`. El receptor queda en
   `kavea-meta-webhook.<subdominio>.workers.dev`. Es **cosmético y reversible**: no afecta a la firma,
   al handshake, a la suscripción ni a los reintentos, y si algún día la zona vuelve a Cloudflare se
   recupera con un Custom Domain y un re-registro de la URL en el App Dashboard. La única capacidad
   real que se va con él es el mTLS de cliente en el borde, que era una opción y no una tarea.

Ninguno de estos siete puntos justifica revisar la decisión. El punto 1 sí justifica que el desborde a
R2 se construya desde el primer despliegue y no cuando aparezca el primer lote grande en producción,
porque descubrirlo en producción cuesta una desuscripción.

---

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Alguien reintroduce `JSON.parse` antes del HMAC | Fallo solo con tildes y emoji: invisible en pruebas, total en VE, RD y MX | Fixture de unicode escapado obligatoria en CI, con prueba de regresión que distingue la fixture ASCII de la unicode |
| El hostname `workers.dev` no responde: subdominio sin habilitar, Worker renombrado o despliegue gradual a medias | Entregas fallidas y desuscripción, sin que nadie lo note | `workers_dev: true`, nombre del Worker congelado desde el registro de la URL, despliegue siempre al 100%. Criterio de aceptación que distingue el 403 del Worker de cualquier rechazo anterior a él |
| Lote por encima del tope de Queues sin ruta de desborde | 500 sostenido y desuscripción | Desborde a R2 desde el primer despliegue, con umbral medido sobre el mensaje serializado, y `lote-grande.json` en la suite |
| App Secret desincronizado entre el Worker y el runtime de Next.js | 100% de firmas inválidas, una hora hasta la desuscripción | Alerta P1 en la primera firma inválida, sin umbral. Rotación coordinada en los dos entornos en el mismo instante, con prueba de humo después |
| Caída de Queues o de R2 | 500 sostenido | 500 explícito para que Meta reintente, alerta P1 inmediata, y el cron reconciliando después. No hay almacén secundario en v1: añadirlo añade un modo de fallo más |
| El consumidor se rompe y la cola llega a su retención | Pérdida de eventos ya confirmados a Meta con 200 | Alerta por edad del mensaje más antiguo muy por debajo del plazo, y DLQ configurada desde el primer día |
| El Cron Trigger no corre y nadie se entera | Se pierde la única vigilancia de la desuscripción silenciosa | Alerta por ausencia de ejecución, no solo por ejecución fallida |
| Un valor fuera del enum en `subscribed_fields` | La llamada de suscripción falla entera en el onboarding | Confirmar el enum en consola antes de escribir la llamada, y una sola lista compartida entre onboarding y cron, con test de paridad |
| Renombrar el Worker después de registrar la URL en Meta | Cambia el hostname, mueren las entregas de los tres topics a la vez | Nombre congelado desde F2 de `04`. Cambiarlo exige re-registrar la URL y rehacer el handshake, y se trata como un cambio con ventana, no como un refactor |
| mTLS obligatorio en webhooks de Meta | Sin mitigación disponible con el receptor en `workers.dev` | Riesgo abierto. El mTLS de cliente de Cloudflare es función de zona y la zona está en Netlify. La salida sería mover el receptor a un dominio propio en Cloudflare. El changelog de Messenger Platform devuelve HTTP 500 y no se puede confirmar; abrirlo en navegador y guardar copia |
| Meta restringe la app entera | Todos los tenants a la vez, sin aviso | Fuera del alcance de esta fase. `03` lo cubre con kill-switch por canal y tenant |

---

## 7. Definición de terminado

La fase 1 está cerrada cuando todo lo siguiente es cierto y verificable por otra persona:

- [ ] El endpoint `https://kavea-meta-webhook.<subdominio>.workers.dev/meta` está registrado en el App
      Dashboard y el handshake pasa al guardar.
- [ ] Un GET sin cabeceras devuelve 403 generado por el Worker, no una respuesta de la plataforma.
- [ ] El subdominio `workers.dev` está habilitado, el nombre del Worker está congelado y el despliegue
      va al 100%, sin reparto por versiones.
- [ ] Las cinco pruebas de firma inválida devuelven 401, sin mensaje en la cola y sin fila en la
      bitácora.
- [ ] La fixture con unicode escapado devuelve 200 y su `cuerpo_crudo` coincide byte a byte.
- [ ] `lote-grande.json` devuelve 200 dentro del presupuesto y recorre la ruta de desborde a R2 de
      punta a punta.
- [ ] Un DM real desde Instagram, uno desde Messenger y uno desde WhatsApp producen fila en
      `webhook_events` en menos de 10 s.
- [ ] **Con Supabase apagado, el receptor devuelve 200 y la cola acumula; al volver, drena sin
      pérdidas.** Ejecutado, no supuesto.
- [ ] p95 de `duracion_ms` por debajo de 500 ms sobre al menos 200 entregas reales, y ninguna entrega
      por encima de 5000 ms.
- [ ] El constraint `webhook_events_firma_ok_chk` está en la base y rechaza el insert de prueba.
- [ ] La DLQ existe, está enlazada a la cola y se ha probado que un mensaje irrecuperable llega a ella.
- [ ] El Cron Trigger corre cada 15 minutos, detecta una desuscripción provocada a mano, re-suscribe
      sin intervención y genera alerta P1 con correo entregado.
- [ ] Cada condición de la tabla de alertas de la tarea 10 se ha disparado al menos una vez en
      staging.
- [ ] La lista de `subscribed_fields` está confirmada contra el enum real y vive en un solo sitio
      lógico, con test de paridad entre los dos entornos.
- [ ] `GRAPH_API_VERSION` es la única fuente de la versión y no hay ninguna versión literal en un path
      del repositorio, en ninguno de los dos entornos.
- [ ] Ningún log contiene el cuerpo de un webhook. Los objetos de desborde en R2 tienen regla de ciclo
      de vida a 7 días.
- [ ] `docs/fases/01-mediciones.md` responde a los once puntos de la tarea 13 o explica por qué alguno
      sigue abierto.

Lo que **no** hace falta para cerrar la fase: normalización, resolución de tenant, `messages`, media,
bandeja. Todo eso es fase 2 y posteriores.

---

## 8. Preguntas abiertas

Las cinco primeras vienen de la sección `inciertos` de `03` y esta fase no las resuelve por decisión,
las resuelve por medición. Las cuatro últimas las abre esta fase.

1. **Nombres del enum de `subscribed_fields`.** `messaging_referral` frente a `messaging_referrals`,
   `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a
   `messaging_reactions`. Se cierra en Graph API Explorer antes de escribir la llamada de la tarea 7.
   Bloqueante para el onboarding, no para el receptor.

2. **Campos realmente disponibles en la vía Facebook Login para Instagram.** Dos páginas oficiales se
   contradicen sobre `message_reactions`, `standby`, `message_echoes`, `messaging_handover` y
   `messaging_optins`. `message_edit` aparece en el changelog pero no en la tabla viva. Consecuencia
   si `standby` no existe en Instagram: Kavea se queda ciega cuando Business Suite se apropia de un
   hilo de Instagram, y eso cambia el diseño de la fase 2.

3. **Dónde vive la suscripción de Instagram.** Sobre la Página o sobre el `ig_business_account_id`. El
   cron comprueba las dos rutas y anota cuál responde.

4. **Backoff real de reintentos y ventana hasta la desuscripción.** Dos políticas oficiales
   incompatibles, ninguna reconciliada por Meta. Se mide con 500 deliberados en staging.

5. **Todo lo de WhatsApp.** `03` es explícito: fuera de los cinco puntos verificados, no se afirma
   nada. El receptor puede ingerir WhatsApp desde el día uno porque no parsea, pero la forma del
   payload, el identificador de enrutado y si viene firmado con el mismo App Secret son hipótesis que
   hay que medir con la primera entrega real. La fase 2 no se diseña antes de esa medición.

6. **WhatsApp contra `meta_asset_routes`.** Esta pregunta sustituye a la que la versión anterior de
   este plan planteaba sobre los índices de `channels`, que ya no aplica: `02` §7.2 aplana el enrutado
   en `meta_asset_routes` con `asset_id` como primary key, que es un diseño mejor y absorbe un tercer
   espacio de identificadores sin cambio estructural. Lo que sí hay que tocar cuando llegue el primer
   webhook real de WhatsApp:

   - `tipo` tiene `check (tipo in ('page','ig_business_account'))` y rechazaría una fila de WhatsApp.
     Hace falta un tercer valor, y su nombre depende de qué identificador llegue de verdad en
     `entry[].id`: el WABA ID o el `phone_number_id`.
   - Si `entry[].id` es el WABA ID y el envío se hace por `phone_number_id`, hacen falta **dos** filas
     por conexión, o una fila de enrutado más una columna de envío en otra tabla. No se decide sin el
     payload delante.
   - `asset_id` como primary key sigue siendo correcto mientras el mapeo sea una función. Lo es
     mientras cada cliente tenga su propia WABA, que es lo que `03` establece para WhatsApp. Si algún
     día Boosty alojara números de varios clientes bajo una WABA propia, el mapeo dejaría de ser una
     función y habría que enrutar por `phone_number_id`. Conviene dejarlo escrito antes de que sea una
     sorpresa comercial.
   - `meta_connections.page_id` es `not null`, así que un tenant solo-WhatsApp no cabe en el esquema
     actual. En v1 no es un problema porque la invariante exige Página para IG y Messenger, pero un
     cliente que solo quiera WhatsApp sí lo es.

7. **`webhook_events.cuerpo jsonb`.** Esta fase lo deja nullable y sin uso, con `cuerpo_crudo text`
   como fuente de verdad. Hay que decidir al final de la fase 2 si se elimina la columna o si se
   convierte en generada. Enmienda un punto de `02` §7.6 y necesita visto bueno explícito.

8. ~~**Tope y retención reales de Cloudflare Queues.**~~ **Cerrada el 2-ago-2026.** 128 KB por
   mensaje, 100 mensajes por lote de consumidor, 100 reintentos, y retención configurable hasta 14
   días en plan de pago frente a 24 horas fijas en el gratuito. El desborde a R2 pasa de opcional a
   obligatorio, y el plan de pago de Workers pasa a ser requisito de la arquitectura. Queda como
   medición solo la distribución real de tamaños, que es la pregunta 8 siguiente.

9. **Umbral del detector de silencio.** Con un solo tenant en dogfooding y tráfico nocturno cero, las
   2 horas son una suposición. Se calibra con una semana de línea base. La versión por organización
   queda para cuando haya varios tenants.
