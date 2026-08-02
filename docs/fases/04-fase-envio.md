# Kavea — Fase 4: envío y ventana de servicio

**Fecha:** 2 de agosto de 2026
**Estado:** plan, sin código escrito
**Depende de:** `00-documento-base.md`, `03-invariantes-meta.md` (normativo), `06-arquitectura-plataforma.md`

Esta fase corresponde al **bloque 4 del orden de construcción** de `06-arquitectura-plataforma.md`
(«Envío y ventana de 24 h»). No es la «Fase 4 — Comercial» de la numeración de `00-documento-base.md`:
ahí el envío proactivo aparece más tarde. Cuando en este documento se lee «fase», se habla del bloque
de construcción.

Todo lo que aquí se decide está subordinado a `03-invariantes-meta.md`. Donde este plan y ese
documento discrepen, manda el documento 03.

---

## 1. Objetivo

Kavea emite mensajes por Instagram Direct y Facebook Messenger desde la bandeja, con la ventana de
servicio calculada **por conversación** sobre `last_incoming_at`, con las colas particionadas por
cuenta, leyendo los límites de Meta en cada respuesta y parando cuando toca. El compositor de la
interfaz refleja el estado real de la ventana y bloquea lo que la API va a rechazar, en lugar de
encolarlo.

Para WhatsApp, la fase entrega el modelo de datos y el ciclo de vida de plantillas, no el envío. El
documento 03 marca WhatsApp como **sin investigar** fuera de cinco puntos, y no se implementa envío
sobre terreno no verificado.

Al terminar la fase, un agente humano responde una conversación real de Boosty desde `boosty.kavea.ai`
y el mensaje llega al teléfono del contacto por el canal correcto.

### 1.1 Fuera de alcance, de forma explícita

- **Tags muertos.** `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` y `POST_PURCHASE_UPDATE` devuelven
  error 100 desde el 27 de abril de 2026. No se implementan, y cualquier SDK o ejemplo de terceros que
  los use queda bajo sospecha: Chatwoot hardcodeaba `tag: 'ACCOUNT_UPDATE'` en todos los envíos y sus
  envíos de Messenger se rompieron ese día.
- **Reengagement por Instagram.** No existen One-Time Notifications, Sponsored Messages, News
  Messaging, Marketing Messages API ni Utility Templates en la Instagram Messaging API. Ninguna
  pantalla, plantilla comercial ni copy de esta fase puede prometer recuperación de carritos ni
  campañas por Instagram Direct. Las únicas palancas son `HUMAN_AGENT` (7 días, solo humanos), el
  private reply a un comentario (v1.1) y el enlace `ig.me` con `?ref=`.
- **Sponsored Messages y One-Time Notifications en Messenger.** Son la ruta que documenta Meta para
  contenido promocional fuera de ventana, pero tienen permisos y economía propios y no se han
  analizado. No entran en v1.
- **Utility Messages** (`page_utility_messaging`). Ver arriba: no están documentadas como reemplazo de
  los tags deprecados.
- **Envío proactivo por segmento y campañas.** Es capa comercial, no capa de transporte.
- **Envío de plantillas de WhatsApp.** Ver tarea 13.

---

## 2. Precondiciones

Ninguna tarea de esta fase arranca sin esto:

| # | Precondición | Cómo se comprueba |
|---|---|---|
| P1 | Bloques 0 a 3 de `06` terminados | Se ven conversaciones reales llegando en vivo en la bandeja, y `conversations.last_incoming_at` se puebla desde la ingesta |
| P2 | `GRAPH_API_VERSION=v26.0` en una única variable, leída por todos los clientes HTTP | Búsqueda en el repositorio de un literal de versión fuera del archivo de configuración: cero resultados |
| P3 | Page Access Token por organización, cifrado en `channels.credenciales`, derivado del BISU del portfolio del cliente | Consulta que devuelve, para cada organización activa, token y `page_id` en la misma fila |
| P4 | Estado conocido de la feature **Human Agent** en el App Review | Si no está aprobada, el tramo de 24 h a 7 días no existe todavía y la interfaz lo dice con otro motivo |
| P5 | Un tenant real (Boosty) con Página vinculada a la cuenta profesional de Instagram, el toggle *Allow Access to Messages* activo y **default application** de Conversation Routing configurada | `GET /me?fields=messaging_feature_status` devuelve `{hop_v2, msgr_multi_app, ig_multi_app}` y un mensaje de prueba llega a `messaging[]`, no a `standby[]` |
| P6 | Bucket de Cloudflare R2 creado, con credenciales y dominio de servicio | Subida y descarga de un objeto de prueba con clave no adivinable |
| P7 | Kill-switch por canal y por tenant del bloque 0 disponible | Activarlo detiene el envío sin tumbar la ingesta |

P4 es el que más probablemente falte cuando llegue el momento. La fase se puede completar sin él: el
tramo de 24 h a 7 días queda cerrado en la interfaz con el motivo «feature pendiente de aprobación», y
se abre después sin cambiar el modelo de decisión.

---

## 3. Entregables

1. **Puerto de envío único.** Una sola función de entrada,
   `enviar(organization_id, conversation_id, contenido, emisor)`, con adaptadores por canal detrás.
   Ninguna otra ruta del código habla con el Send API.
2. **Módulo de ventana de servicio**, puro y sin acceso a red ni a base de datos, con la tabla de
   decisión de §5 implementada como test parametrizado.
3. **Cliente HTTP de Graph** con versión desde variable única, lectura y persistencia de `X-App-Usage`
   y `X-Business-Use-Case-Usage` en cada respuesta, y circuit breaker por partición.
4. **Colas de salida particionadas por cuenta**, con carril de texto separado del de media.
5. **Tablas nuevas:** `outbound_messages`, `rate_limit_usage`, `media_saliente`, `templates`,
   `template_events`.
6. **Compositor de la bandeja** con tres estados visibles y contador de bytes para Instagram.
7. **Correlación envío ↔ echo**, con el resultado empírico documentado.
8. **Media saliente a R2**, con validación de tamaño y formato previa a la llamada.
9. **Mapa código de error → acción**, en un solo lugar del código, con la política del 190 incluida.
10. **Banco de sondas empíricas** con petición y respuesta crudas guardadas, que cierra o mantiene
    abiertos los inciertos de §9.

### 3.1 Esquema nuevo

Sigue el estilo de `06`: nombres de tabla en inglés, columnas en español, `uuid` como clave, marcas de
tiempo `timestamptz`, `organization_id` y RLS en toda tabla de negocio.

```sql
create table public.outbound_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  canal           text not null,
  particion       text not null,       -- page_id o ig_business_account_id: la cola va por aquí
  carril          text not null default 'texto',    -- texto | media
  emisor          text not null,       -- humano | agente
  messaging_type  text,                -- TEXTO LIBRE a propósito. Ver §9, incierto de enums
  tag             text,                -- hoy el único valor vivo es 'HUMAN_AGENT'
  cuerpo          jsonb not null,      -- ya serializado por el adaptador de canal
  metadata        text,                -- se envía y vuelve en el echo: correlación secundaria
  estado          text not null default 'encolado',  -- encolado|enviando|enviado|fallido|bloqueado
  intentos        int  not null default 0,
  mid_devuelto    text,                -- message_id de la respuesta del Send API
  echo_mid        text,                -- mid del echo, cuando y si llega
  error_codigo    int,
  error_payload   jsonb,
  no_antes_de     timestamptz not null default now(),   -- respeto del bloqueo de Meta
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index outbound_pendientes_idx
  on public.outbound_messages (particion, carril, no_antes_de)
  where estado in ('encolado','bloqueado');

create unique index outbound_mid_idx
  on public.outbound_messages (organization_id, canal, mid_devuelto)
  where mid_devuelto is not null;
```

`messaging_type` y `tag` son `text` sin `check` y sin enum. No es descuido: el documento 03 marca los
strings literales `RESPONSE` / `UPDATE` / `MESSAGE_TAG` como **no confirmados en fuente oficial**,
corroborados solo en SDKs de terceros. Una restricción de base de datos sobre un enum no verificado
convierte una duda documental en una migración.

```sql
create table public.rate_limit_usage (
  id                bigserial primary key,
  organization_id   uuid references public.organizations(id) on delete cascade,
  particion         text,
  tipo              text,   -- 'app' o el valor de `type`: instagram | messenger | pages | …
  call_count        int,
  total_cputime     int,
  total_time        int,
  regain_access_min int,    -- estimated_time_to_regain_access, en minutos
  http_status       int,
  error_codigo      int,
  observed_at       timestamptz not null default now()
);

create index rate_limit_usage_particion_idx
  on public.rate_limit_usage (particion, observed_at desc);

create table public.media_saliente (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  r2_key          text not null,      -- clave no adivinable, sin listado de bucket
  mime            text not null,
  bytes           bigint not null,
  origen          text not null,      -- humano | agente
  created_at      timestamptz not null default now()
);
```

El nombre `media_saliente` es deliberado y hereda la nomenclatura del documento 02: la separación entre
media entrante y media saliente tiene que ser visible en el esquema, porque es un invariante y es causa
documentada de rechazo de App Review. **La media entrante de Meta nunca se descarga ni se copia a R2.**
Solo se persiste la URL del CDN. R2 es exclusivamente para media que Kavea genera o que el agente
envía.

```sql
create table public.templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  canal            text not null default 'whatsapp',
  nombre           text not null,
  idioma           text not null,
  estado_meta      text,        -- TEXTO LIBRE. Sin enum, sin check. Ver tarea 13
  categoria_meta   text,        -- TEXTO LIBRE
  cuerpo           jsonb,
  ultimo_evento_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (organization_id, canal, nombre, idioma)
);

create table public.template_events (
  id          bigserial primary key,
  template_id uuid references public.templates(id) on delete cascade,
  payload     jsonb not null,     -- crudo, sin interpretar
  received_at timestamptz not null default now()
);
```

---

## 4. Tareas

Cada tarea lleva su criterio de aceptación. Un criterio que no se pueda comprobar ejecutando algo no
es un criterio.

### T1 — Cliente HTTP de Graph, único

Un solo módulo construye toda URL contra `graph.facebook.com`, a partir de `GRAPH_API_VERSION`. Lee y
persiste `X-App-Usage` y `X-Business-Use-Case-Usage` en **todas** las respuestas, incluidas las de
error. No cachea por `ETag` ni usa `If-None-Match`, y no usa el patrón `GET /?ids=` para lookups en
lote: ambos se retiran en v26.0 y, desde el **27 de octubre de 2026**, en todas las versiones
soportadas. Esa fecha es un corte duro del calendario, y fijar una versión antigua no protege.

**Aceptación.** Búsqueda en el repositorio de un literal de versión (`v26`, `v25`, …) fuera del
archivo de configuración: cero resultados. Test automatizado que falla cuando la versión configurada
está a menos de seis meses de su fecha de expiración publicada. Una respuesta 200 y una 400 dejan cada
una su fila en `rate_limit_usage` con el `type` que devolvió la cabecera.

### T2 — Selección de token por organización

Es la frontera de seguridad de esta fase. `/me` resuelve a la Página vinculada, así que **el tenant lo
determina qué token se usa**. La función de envío recibe `organization_id`, resuelve `channels` y
obtiene token y `page_id` de la misma fila. No existe token por defecto, ni variable de entorno global
con un token, ni parámetro de token que suba desde la capa HTTP o desde la interfaz.

Messenger lleva `{PAGE_ID}` explícito en la ruta a propósito: el destino queda escrito en la llamada y
un fallo de selección falla en voz alta en vez de enviar desde la Página equivocada.

**Aceptación.** Un test que intenta enviar con `conversation_id` de la organización A y credenciales de
la B falla antes de salir a la red, con error tipado y registro. Otro test comprueba que el `page_id`
de la ruta y el `page_id` de la fila de credenciales son el mismo valor, y que si no coinciden la
llamada no se emite. Revisión de firma: ninguna función pública del módulo de envío acepta un token
como argumento.

### T3 — Módulo de ventana de servicio

Función pura:

```
ventana(last_incoming_at, ahora, emisor, canal, human_agent_aprobada)
  → { permitido, messaging_type?, tag?, motivo }
```

Reglas, todas del documento 03:

- Δ = `ahora - last_incoming_at`, donde `last_incoming_at` es el último mensaje **entrante** del
  usuario. Un echo saliente **no** reabre la ventana.
- Se calcula por conversación. Está prohibido cualquier flag global 24 h/7 d a nivel de canal, de
  Página o de organización. Ese es el modelo de Chatwoot y es la implementación incorrecta.
- Solo mueve el reloj lo que Kavea recibe como evento entrante en `messaging[]`. Se incluye el
  `referral` del enlace `ig.me` con `?ref=`, que Meta documenta verbatim como reseteo de la ventana de
  24 h de Instagram, siempre que el webhook de referral esté suscrito. No mueven el reloj los sucesos
  que Kavea no recibe.
- Si `last_incoming_at` es nulo, el envío es imposible: el usuario nunca escribió.
- **La ventana se reevalúa en el instante del despacho, no en el del encolado.** Un mensaje puesto en
  cola con Δ = 23 h 59 min que sale con Δ = 24 h 01 min ya no es `RESPONSE`.

**Aceptación.** La tabla de §5 implementada como test parametrizado, con los bordes 23:59:59,
24:00:01, 6 d 23 h y 7 d 00:00:01. Emisor agente de IA con Δ entre 24 h y 7 días devuelve
`permitido: false`. Búsqueda en el repositorio de un booleano tipo `ventana_abierta` colgando de canal
u organización: cero resultados. Test de despacho: se encola con reloj en Δ = 23 h 59 min, se avanza el
reloj y el despachador detiene el envío y marca la fila para revisión.

### T4 — Adaptador de Messenger

```
POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PAGE_ID}/messages?access_token=<PAGE_ACCESS_TOKEN>

{"recipient":{"id":"<PSID>"},"messaging_type":"RESPONSE","message":{"text":"..."}}
```

Respuesta esperada: `{"recipient_id":"<PSID>","message_id":"<MID>"}`.

`messaging_type` y `tag` proceden siempre del módulo de ventana. Nunca se escriben literales en el
punto de llamada. La constante de tags permitidos contiene un solo valor: `HUMAN_AGENT`.

**Aceptación.** Envío real a una cuenta de tester que devuelve `recipient_id` y `message_id`, con la
respuesta cruda guardada. Búsqueda de `ACCOUNT_UPDATE`, `CONFIRMED_EVENT_UPDATE` y
`POST_PURCHASE_UPDATE` en el repositorio y en el árbol de dependencias instalado: cero resultados; si
aparecen dentro de un SDK de terceros, ese SDK no se usa para enviar.

### T5 — Adaptador de Instagram

```
POST https://graph.facebook.com/{GRAPH_API_VERSION}/me/messages?access_token=<PAGE_ACCESS_TOKEN>

form-data:  recipient={"id":"<IGSID>"}&message={"text":"..."}
```

Respuesta esperada: `{"recipient_id":"<IGSID>","message_id":"<MID>"}`.

Tres cosas que no se tocan:

- La forma es `/me/messages` porque es la que Meta documenta literalmente para Instagram vía Facebook
  Login. `/{PAGE_ID}/messages` es plausible y coherente con Messenger, pero **no** está documentada
  para Instagram: no se cambia sin comprobarlo antes en el Graph API Explorer.
- El cuerpo es form-data, no JSON. Es la forma en que Meta lo documenta.
- Va a `graph.facebook.com` con el Page Access Token del tenant, igual que Messenger. `graph.instagram.com`,
  `api.instagram.com` y `www.instagram.com/oauth/authorize` están prohibidos en el proyecto entero.

Por defecto, **Instagram se envía sin `messaging_type`**: los ejemplos oficiales de Instagram no lo
incluyen y no está confirmado si es obligatorio en ese canal. Existe una bandera por canal para
añadirlo, apagada, hasta que la sonda de T14 lo resuelva.

**Aceptación.** Envío real que devuelve `recipient_id` y `message_id`. Test que verifica que el cuerpo
se serializa como form-data y no como JSON. Búsqueda de los tres hosts prohibidos en el repositorio:
cero resultados.

### T6 — Texto de Instagram: 1000 BYTES

Cita verbatim del documento 03: *"Message text must be UTF-8 and be 1,000 bytes or less"*. Son bytes,
no caracteres. Con tildes y emoji el margen real es bastante menor: `á` son 2 bytes, un emoji corriente
4, una bandera regional 8, y un emoji compuesto con ZWJ puede pasar de 25.

- La medida se toma en UTF-8 (`Buffer.byteLength` / `TextEncoder`). Está prohibido `String.length`
  sobre texto saliente.
- El corte respeta límites de grafema: nunca dentro de una secuencia multibyte, ni entre pares
  suplentes, ni dentro de una secuencia ZWJ.
- Política por defecto: **partir** en varios mensajes conservando el orden, con margen de seguridad
  sobre el límite. Truncar solo cuando lo pida explícitamente quien envía.
- Las respuestas del agente de IA pasan por el mismo camino. No hay una ruta rápida sin medición.

**Aceptación.** Corpus de prueba con `ñ`, vocales acentuadas, emoji simples, banderas regionales y
emoji de familia con ZWJ. Toda parte producida mide ≤ 1000 bytes en UTF-8. La concatenación de las
partes reproduce la cadena original byte a byte. Cero apariciones de U+FFFD en la salida. Un test de
repositorio falla si aparece `.length` aplicado al texto de un envío.

### T7 — Cola de salida particionada

Colas particionadas por `page_id` (o `ig_business_account_id`), con carril de media separado del de
texto. La cuota escala con las impresiones y los usuarios comprometidos **del cliente**, no con el
negocio de Boosty: un tenant no puede consumir la cuota de otro.

- Un despachador por partición. Se diseña para 100/s de texto en Instagram —el valor conservador de
  las dos cifras oficiales en conflicto— y 10/s en el carril de media.
- FIFO por conversación: dos mensajes de la misma conversación no se adelantan entre sí.
- Con el kill-switch activo, o con Meta restringiendo la app, el modo es **degradado**: se encola, no
  se falla. La ingesta sigue.
- Esta cola es la que va a decidir, en el bloque 6, si Kavea cumple la política de los 30 segundos de
  respuesta automática. La latencia se mide desde ahora.

**Aceptación.** Prueba sintética con dos tenants: saturar la partición de A no retrasa la de B más allá
del umbral acordado. Cincuenta mensajes en una misma conversación llegan en orden. Con el kill-switch
activo, cero peticiones salientes y todas las filas en `encolado`. Métrica publicada de latencia
encolado → acuse de Meta, con p95.

### T8 — Cabeceras, freno y respeto del bloqueo

Se leen `X-App-Usage` (`call_count`, `total_cputime`, `total_time`) y `X-Business-Use-Case-Usage`
(los mismos, más `type` y `estimated_time_to_regain_access`) en cada respuesta y se guardan por tenant.

- Circuit breaker por partición cuando `call_count` supera 80.
- Al recibir un bloqueo, se para y se espera el `estimated_time_to_regain_access` completo. Verbatim:
  *"Continuing API calls during throttling extends the wait period further"*. **Reintentar durante el
  bloqueo lo alarga.** El campo `no_antes_de` de la cola es lo que materializa esa espera.
- El límite de app (`200 × número de usuarios` en una hora) merece vigilancia propia en un modelo de
  una sola app para todos los tenants: se grafica aparte.

**Aceptación.** Test con respuestas simuladas de códigos 4, 17, 32, 613, 80001, 80002 y 80006: la
partición correspondiente queda en pausa hasta la hora calculada y el contador de peticiones salientes
de esa partición es exactamente cero durante la pausa. Cada respuesta deja fila en `rate_limit_usage`
con el `type` devuelto por la cabecera.

### T9 — Política por código de error

El mapa de §6 vive en un único lugar del código. Lo crítico:

- **190** invalida el token: marca el canal como `desconectado`, para la partición, alerta interna y
  banner en la interfaz de ese tenant. **No reintenta en bucle.**
- **100** no se reintenta nunca. Es parámetro inválido, y ahí caen los tags muertos.
- **230** se ignora en silencio: es consentimiento de perfil no otorgado, ocurre con usuarios que nunca
  escribieron y es normal.
- **9010** en Instagram aparece cuando el bot revisor de Meta prueba la app durante el App Review. Si
  el código falla ahí en vez de crear un contacto desconocido, el revisor concluye que la integración
  no funciona. Confianza media: procede del código de Chatwoot, no de documentación. Se copia el
  comportamiento porque cuesta poco y evita un rechazo caro.

**Aceptación.** Test parametrizado sobre cada fila de §6. Simular tres respuestas 190 seguidas produce
exactamente un cambio de estado del canal y cero reintentos. El banner aparece en la interfaz del
tenant afectado y no en la de los demás.

### T10 — Correlación del envío con su echo

Los echoes traen su propio `mid` y entran por la clave de idempotencia normal. **No se deduplican
contra el mensaje que Kavea envió por el Send API**: hay que correlacionar de forma explícita.

Orden de intento:

1. Por `message_id` devuelto por el Send API, guardado en `outbound_messages.mid_devuelto`.
2. Por el campo `metadata` que se pasa en el envío y vuelve en el echo.
3. Último recurso, y marcado como tal en la métrica: misma conversación, mismo hash de texto y ventana
   temporal corta.

El `app_id` del echo distingue lo que envió Kavea de lo que envió el cliente desde el móvil o desde
Business Suite. Sin esa distinción, el agente de IA se responde a sí mismo en bucle.

Hay dos cosas que hay que medir antes de confiar en nada de esto. La primera: si el `message_id`
devuelto y el `mid` del echo son el mismo valor. La segunda: si en Instagram por la vía Facebook Login
llegan echoes, porque el documento 03 recoge una contradicción oficial sobre la disponibilidad de
`message_echoes` en esa configuración. Si no llegan, la fila de `outbound_messages` es el único
registro del envío, y como Instagram tampoco tiene acuse de entrega, la interfaz no puede prometer
confirmación.

**Aceptación.** Veinte envíos reales por cada canal con petición, respuesta y echo guardados en crudo.
Se registra en §9 si `message_id == mid del echo`, y ese resultado decide si las capas 2 y 3 se
mantienen. Cero mensajes duplicados en la bandeja tras la llegada del echo. Cero reactivaciones del
agente por un echo propio.

### T11 — Media saliente ✅

> **R2 ya no existe en esta arquitectura.** Cloudflare salió del proyecto entero y el almacén es el
> bucket privado `salientes` de Supabase Storage, creado en 0033. Todo lo demás de esta tarea se
> mantiene igual: lo que cambia es quién guarda el objeto, no la regla.

- Solo media **saliente**. La entrante se queda en la URL del CDN de Meta, sin copia, sin caché y sin
  proxy por un dominio de Kavea. Es causa documentada de rechazo de App Review.
- Validación previa a la llamada: imágenes png/jpeg ≤ 8 MB, el resto ≤ 25 MB. Se comprueba **al subir**
  y se guarda en `archivos.enviable`, no al enviar: es la diferencia entre avisar cuando todavía se
  puede cambiar el archivo y fallar delante del cliente cuatro días después. El RPC lo vuelve a mirar,
  porque esconder el botón evita el error honesto y no el deliberado.
- **La URL se firma en el despacho, nunca al encolar.** Diez minutos de vida que empiezan a contar en
  el momento de la llamada: una firma hecha al encolar y consumida tras un bloqueo de quince minutos
  por límites llegaría caducada. La cola guarda la RUTA dentro del bucket, y por eso no hay ninguna
  URL escrita en una tabla que los miembros leen.
- **No se depende de `attachment_id` ni de `is_reusable`**: no están confirmados para esta vía, así que
  cada envío vuelve a exponer el objeto.
- El carril de media va a 10/s. En Messenger eso es 30 veces menos que el de texto, y por eso
  `outbound_messages.carril` los separa desde 0034.
- Instagram no acepta documentos: imagen, audio y vídeo, y nada más. Un PDF se rechaza en Kavea con un
  mensaje que dice por dónde mandarlo. **Asunción a verificar**: la lista no está confirmada verbatim
  en fuente oficial para esta vía. Bloquear de más cuesta un canal alternativo; dejar pasar de más
  cuesta un fallo delante del cliente.

**Aceptación.** Un jpeg de 9 MB se rechaza antes de salir a la red, con mensaje al usuario. Un envío
real con imagen llega al destinatario por cada canal. Búsqueda en el repositorio: ninguna ruta escribe
en el bucket desde el procesamiento de webhooks de media entrante.

**Hecho.** Migración 0049, `encolar_archivo`, firma en `functions/despachar`, botón en la pestaña de
archivos. Siete comprobaciones en la suite de aislamiento: 61 en total, 61 en verde. Queda pendiente
el envío real con imagen por cada canal, que exige un contacto de verdad.

### T12 — Compositor de la bandeja

Tres estados visibles, derivados del módulo de ventana y de nada más:

| Estado | Cuándo | Qué muestra |
|---|---|---|
| Abierto | Δ < 24 h | Compositor normal. Contador de bytes en Instagram |
| Restringido | 24 h ≤ Δ ≤ 7 d, sesión de un humano | Compositor activo con aviso: el mensaje sale bajo `HUMAN_AGENT`, es para intervención humana real, y el agente de IA no puede usar esta vía |
| Cerrado | Δ > 7 d, emisor agente fuera de 24 h, `last_incoming_at` nulo, o feature Human Agent sin aprobar | Compositor deshabilitado, con el motivo concreto y el tiempo transcurrido |

En estado cerrado **no se encola nada**. Un envío que la API va a rechazar no entra en la cola.

El contador de Instagram cuenta bytes, no caracteres. Un emoji suma 4.

**Aceptación.** Recorrido grabado sobre una conversación real con `last_incoming_at` forzado a cada
tramo. En el tramo cerrado el botón de enviar no se puede pulsar y el texto del motivo nombra el tramo
y el tiempo. Escribir un emoji mueve el contador en 4. Con la sesión de un agente de IA y Δ de 30
horas, el estado es cerrado, no restringido.

### T13 — Plantillas de WhatsApp: modelo y ciclo de vida, sin inventar

Esta tarea construye estructura sobre terreno que el documento 03 declara **sin investigar**. La
distinción es normativa, no una advertencia de cortesía.

**Lo que el documento 03 da por verificado de WhatsApp, y nada más:**

- Límites de mensajería por tiers: 250 → 2.000 → 10.000 → 100.000 → ilimitado.
- Límites de plantillas: 250 por WABA con el portfolio padre sin verificar; 6.000 si está verificado
  **y además** al menos un número tiene display name aprobado.
- Partner-led Business Verification existe, es exclusiva de WhatsApp y solo para Solution Partners de
  nivel Select y Premier. Boosty no califica de entrada.
- Embedded Signup limita a 10 clientes nuevos por ventana móvil de 7 días.
- Permisos: `whatsapp_business_messaging` y `whatsapp_business_management`.
- El trámite es **del cliente**, al revés que en Instagram y Messenger. Vender WhatsApp llave en mano
  sin que el cliente haga nada es una promesa que Meta no permite cumplir.

**Lo que está SIN INVESTIGAR y por tanto no se implementa:** forma del webhook
(`object = 'whatsapp_business_account'`, `entry[].changes[].value.messages[]`, una cuarta forma de
payload incompatible con las tres de Meta Messaging), categorías de plantilla y su proceso de
aprobación, precio por mensaje o por conversación, quality rating y bloqueo por baja calidad,
verificación de número y aprobación de display name.

**Lo que sí se construye en esta fase:**

- Tablas `templates` y `template_events` con `estado_meta` y `categoria_meta` como **texto libre**, sin
  `check` y sin enum. Kavea guarda verbatim lo que Meta manda y mantiene aparte su propio estado
  interno derivado. Ningún estado de aprobación se hardcodea a partir de memoria o de un SDK.
- Handler del webhook `message_template_status_update` que persiste el payload crudo en
  `template_events`, actualiza `templates.estado_meta` con el valor recibido tal cual, y no interpreta
  nada más.
- Advertencia que hay que resolver antes de acoplar: en el documento 03 el nombre
  `message_template_status_update` aparece **en el contexto de las Utility Messages de Messenger**
  (permiso `page_utility_messaging`). No está establecido que sea el mismo feed que el de plantillas de
  WhatsApp. Se confirma en la consola antes de escribir la suscripción.
- **No se implementa el envío de plantillas de WhatsApp.** Requiere la investigación pendiente.

**Aceptación.** El esquema acepta un valor de estado nunca visto sin migración ni excepción. Un payload
sintético con campos desconocidos se persiste completo y el handler devuelve 200. Ninguna pantalla de
la interfaz ofrece enviar una plantilla por Instagram. Búsqueda en el repositorio de una lista literal
de estados de plantilla usada como validación: cero resultados.

### T14 — Sonda empírica de incertidumbres

El documento 03 marca contradicciones reales entre páginas oficiales de Meta. No se resuelven leyendo
más documentación: se resuelven con una llamada real y la respuesta cruda guardada.

| # | Sonda | Qué se decide con el resultado | Bloqueante |
|---|---|---|---|
| S1 | Enviar con `messaging_type: "RESPONSE"` y con `"MESSAGE_TAG"` en Messenger | Si los strings literales son los correctos. Solo están corroborados en SDKs de terceros | Sí |
| S2 | Enviar por Instagram con y sin `messaging_type` | Si el campo es obligatorio, opcional o rechazado en ese canal | Sí |
| S3 | Enviar por Instagram con `tag: HUMAN_AGENT` a Δ > 24 h | La forma exacta del cuerpo para el tramo de 7 días en Instagram, que no está documentada literalmente | Sí |
| S4 | Comparar `message_id` devuelto con el `mid` del echo | Si la correlación de primer nivel basta, o hacen falta las capas 2 y 3 | Sí |
| S5 | Comprobar si llegan echoes en Instagram por la vía Facebook Login | Si Instagram tiene confirmación de envío o no la tiene | Sí |
| S6 | Leer `type` y cifras de `X-Business-Use-Case-Usage` bajo carga controlada | Si el Send API de Instagram es 100/s o 300/s, y en qué cubo cae `/me/messages`: `instagram`, `messenger` o `pages` | No |
| S7 | Medir la cuota diaria con una cuenta profesional nueva de 0 impresiones | Si la fórmula `4800 × impresiones` tiene suelo. Sin suelo, la cuota de un cliente nuevo es 0 y el onboarding no funciona | No |
| S8 | Probar `HUMAN_AGENT` con cuenta real de Venezuela, República Dominicana y México | Disponibilidad regional. Meta despliega por país de forma irregular y no publica listas | No |
| S9 | Abrir en navegador el changelog de Messenger Platform y guardar copia | Es la fuente de verdad de deadlines y devuelve HTTP 500 al fetcher | No |

**Aceptación.** Cada sonda deja petición y respuesta crudas, con fecha, en el repositorio de evidencias.
§9 de este documento se actualiza tachando lo cerrado. **La fase no se da por terminada con S1, S2, S3,
S4 o S5 abiertas.**

### T15 — Guardarraíles verificados por herramienta

Un test de repositorio que corre en CI y falla ante cualquiera de estos patrones:

- Los tres tags muertos, en código propio o en dependencias instaladas.
- `graph.instagram.com`, `api.instagram.com`, `www.instagram.com/oauth/authorize`, scopes
  `instagram_business_*`.
- Versión de Graph literal en una ruta, o llamada sin versión.
- `String.length` sobre texto saliente de Instagram.
- Escritura en R2 desde la ruta de media entrante.
- `check` o enum sobre `messaging_type`, `tag` o estado de plantilla.
- Un flag de ventana colgando de canal, Página u organización en vez de conversación.

**Aceptación.** El test existe, corre en CI y se demuestra que falla introduciendo cada patrón a
propósito una vez y revirtiéndolo.

---

## 5. Tabla de decisión de ventana y tag

Δ = `ahora - conversations.last_incoming_at`, donde `last_incoming_at` es el último mensaje **entrante**
del usuario en esa conversación. Se evalúa **por conversación**, nunca con un flag global, y se
reevalúa en el momento del despacho.

| Δ | Emisor | Messenger | Instagram | Interfaz |
|---|---|---|---|---|
| `last_incoming_at` nulo | Cualquiera | Imposible | Imposible | Cerrado: «este contacto nunca ha escrito» |
| Δ < 24 h | Humano o agente de IA | `messaging_type: RESPONSE`, sin tag | Sin `messaging_type` por defecto, sin tag. Ver S2 | Abierto |
| 24 h ≤ Δ ≤ 7 d | Humano real | `messaging_type: MESSAGE_TAG` + `tag: HUMAN_AGENT` | `tag: HUMAN_AGENT`. Forma exacta pendiente de S3 | Restringido, con aviso |
| 24 h ≤ Δ ≤ 7 d | Agente de IA | Bloqueado por Kavea | Bloqueado por Kavea | Cerrado: «fuera de ventana, requiere intervención humana» |
| Δ > 7 d | Cualquiera | Imposible | Imposible | Cerrado: «la conversación superó los 7 días; solo se reabre si el usuario escribe» |

Notas que forman parte de la regla:

- **Los agentes de IA de Kavea nunca emiten con `HUMAN_AGENT`.** La feature está documentada por Meta
  para intervención humana real, y el abuso de tags es causa documentada de restricción de mensajería
  de la Página. La prohibición explícita de usarlo con bots no aparece en las páginas oficiales
  abiertas —la formulación tajante procede de una fuente de terceros—, y la decisión se mantiene por
  prudencia, no por cita.
- **Un echo saliente no reabre la ventana.** Ni el de Kavea ni el del cliente respondiendo desde el
  móvil o desde Business Suite.
- **Lo que sí mueve el reloj** es un mensaje entrante del usuario en `messaging[]`, y en Instagram
  también el `referral` del enlace `ig.me` con `?ref=`, documentado verbatim como reseteo de la ventana
  de 24 h. Regla de diseño: nada que Kavea no reciba como evento mueve el reloj.
- **Si la feature Human Agent no está aprobada**, la fila del tramo 24 h – 7 d se comporta como cerrada,
  con motivo distinto y visible.
- **Fuera de la ventana, `HUMAN_AGENT` es el único tag vivo.** Los otros tres devuelven error 100.

---

## 6. Tabla de códigos de error

| Código | Significado | Acción de Kavea | Reintento |
|---|---|---|---|
| 4 | La app alcanzó su límite | Backoff global, alerta interna | No, hasta `estimated_time_to_regain_access` |
| 17 | El usuario alcanzó su límite | Backoff por tenant | No, hasta el tiempo indicado |
| 32 | Límite de Pages API | Backoff por `page_id` | No, hasta el tiempo indicado |
| 613 | Límite custom excedido | Backoff por `page_id` | No, hasta el tiempo indicado |
| 80001 | Business Use Case: Pages | Pausa la cola de esa Página | No, hasta el tiempo indicado |
| 80002 | Business Use Case: Instagram | Pausa la cola de esa cuenta | No, hasta el tiempo indicado |
| 80006 | Business Use Case: Messenger | Pausa la cola de esa Página | No, hasta el tiempo indicado |
| 100 | Parámetro inválido. Aquí caen los tags muertos y una ventana mal calculada | Marca la fila como `fallido`, guarda el payload crudo, alerta si se repite | **Nunca** |
| 190 | Token invalidado | Canal a `desconectado`, para la partición, alerta interna, banner en la interfaz del tenant | **Nunca.** No reintenta en bucle |
| 230 | Consentimiento de perfil no otorgado | Se ignora. Métrica, no error. Ocurre con usuarios que nunca escribieron | No aplica |
| 9010 | *No matching Instagram user* | Crea contacto desconocido en vez de fallar. Es lo que dispara el bot revisor durante el App Review | No |
| HTTP 5xx / timeout | Fallo transitorio de Graph | Backoff exponencial con tope y jitter, dentro del presupuesto de la partición | Sí, acotado |
| Cualquier otro | Desconocido | Guarda petición y respuesta crudas, marca `fallido`, alerta. Nunca lanza excepción que tumbe el lote | No, hasta clasificarlo |

Regla que atraviesa toda la tabla, verbatim: *"Continuing API calls during throttling extends the wait
period further"*. Durante un bloqueo no se llama, ni siquiera para «comprobar si ya pasó».

---

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Los enums de `messaging_type` no son los que dicen los SDKs de terceros | Todos los envíos de Messenger fallan con 100 | S1 antes de cerrar la fase. Columna sin enum, mapeo en un solo sitio |
| Reintentar durante un bloqueo de Meta | El bloqueo se alarga y el tenant queda mudo más tiempo | `no_antes_de` en la cola, circuit breaker, test que verifica cero peticiones durante la pausa |
| Fallo en la selección de token por organización | Un mensaje de un cliente sale desde la Página de otro. Es el peor fallo posible bajo RLS | `{PAGE_ID}` explícito en Messenger, comprobación de coherencia token↔página, test cruzado obligatorio |
| Truncar por caracteres en vez de por bytes | Mensajes rechazados o texto roto, y solo en español con tildes y emoji: no falla en pruebas en inglés | T6 con corpus real, guardarraíl de repositorio contra `.length` |
| Instagram no entrega echoes por esta vía | No hay confirmación de envío y la correlación se queda sin primer nivel | S5. Si se confirma, la interfaz no promete confirmación de entrega en Instagram |
| El 190 entra en bucle de reintento | Se queman llamadas y se alarga el bloqueo sin arreglar nada; el cliente no se entera de que hay que reconectar | Estado `desconectado` inmediato, banner y alerta. Reintento prohibido en el mapa de errores |
| Un flag global de ventana se cuela «para ir rápido» | Es el fallo de Chatwoot: envíos fuera de ventana en conversaciones que no tocaba | Guardarraíl de repositorio, módulo de ventana puro sin acceso a estado global |
| Cuota diaria de un cliente pequeño cercana a cero | Un cliente de Santo Domingo o Caracas con pocas impresiones no puede operar | S7 antes de prometer onboarding a clientes pequeños. Arquitectura webhook-first, que no consume cuota para leer |
| Meta restringe la app entera | Todos los tenants mudos a la vez, como le pasó a Chatwoot Cloud en julio de 2026 | Modo degradado que encola, kill-switch por canal y tenant, banner de estado. El contrato no promete SLA sobre esto |
| Copiar media entrante a R2 «para que se vea mejor» | Rechazo del App Review por almacenamiento de media | Separación en el esquema, guardarraíl de repositorio, URL de `lookaside` visible en el screencast |
| 27 de octubre de 2026 | Retiradas de protocolo de v26.0 aplicadas a todas las versiones soportadas | Nada de caché por ETag, nada de `GET /?ids=`, test de caducidad de versión |
| Alguien promete campañas por Instagram Direct | Promesa comercial imposible de cumplir | §1.1. Ninguna pantalla ni copy de esta fase la habilita |

---

## 8. Definición de terminado

La fase está terminada cuando todo esto es cierto a la vez:

- [ ] Un humano responde desde `boosty.kavea.ai` una conversación real de Instagram y una de Messenger,
      y ambos mensajes llegan al dispositivo del contacto.
- [ ] El compositor está abierto, restringido o cerrado según la tabla de §5, con el motivo escrito, y
      el estado se calcula por conversación.
- [ ] Un mensaje encolado dentro de la ventana que se despacharía fuera de ella se detiene en el
      despacho.
- [ ] Un texto de Instagram con tildes y emoji se parte en trozos de 1000 bytes o menos y se
      reconstruye byte a byte sin caracteres de reemplazo.
- [ ] El envío queda correlacionado con su echo y la bandeja no muestra duplicados. El agente de IA no
      se re-dispara con un echo propio.
- [ ] `rate_limit_usage` tiene filas reales de los tres tipos de cabecera observados, y una pausa
      simulada produce cero peticiones salientes en esa partición.
- [ ] Un 190 simulado deja el canal en `desconectado`, con banner y alerta, y cero reintentos.
- [ ] Se envía una imagen desde R2 por cada canal; un archivo fuera de límite se rechaza antes de salir
      a la red; ninguna ruta escribe media entrante en R2.
- [ ] `templates` y `template_events` existen, aceptan estados desconocidos sin migración, y ninguna
      pantalla ofrece plantillas por Instagram.
- [ ] Los guardarraíles de T15 corren en CI y se ha demostrado que fallan ante cada patrón prohibido.
- [ ] Las sondas S1 a S5 están cerradas con respuesta cruda guardada, y §9 refleja el resultado.
- [ ] Latencia encolado → acuse de Meta medida y publicada, con p95, como base para la política de 30
      segundos del bloque 6.

---

## 9. Preguntas abiertas

| # | Pregunta | Por qué importa | Cómo se cierra | Estado |
|---|---|---|---|---|
| 1 | ¿Son `RESPONSE`, `UPDATE` y `MESSAGE_TAG` los strings literales correctos? La página de Send Messages renderiza etiquetas humanas y la referencia de la Send API devuelve solo navegación. Solo hay corroboración en SDKs de terceros | Si son otros, no sale ni un mensaje de Messenger | S1, llamada real | Abierta, bloqueante |
| 2 | ¿`messaging_type` es obligatorio, opcional o rechazado en Instagram? Los ejemplos oficiales de Instagram no lo incluyen | Decide el cuerpo del adaptador de Instagram | S2 | Abierta, bloqueante |
| 3 | ¿Cuál es la forma exacta del cuerpo con `HUMAN_AGENT` en Instagram? La página de la feature no menciona Instagram | Decide si el tramo de 7 días existe en Instagram tal como se ha planificado | S3 | Abierta, bloqueante |
| 4 | ¿El `message_id` que devuelve el Send API es el mismo valor que el `mid` del echo? | Decide si la correlación necesita una, dos o tres capas | S4 | Abierta, bloqueante |
| 5 | ¿Llegan echoes en Instagram por la vía Facebook Login? Dos páginas oficiales se contradicen sobre la disponibilidad de `message_echoes` en esa configuración | Sin echoes no hay confirmación de envío en Instagram, y tampoco hay acuse de entrega | S5 | Abierta, bloqueante |
| 6 | ¿100/s o 300/s en el Send API de Instagram para texto? Dos páginas oficiales en desacuerdo, y el changelog de Messenger devuelve HTTP 500 | Dimensiona colas. No se compromete throughput en contrato | S6, más lectura de cabeceras en producción | Abierta. Se diseña a 100/s |
| 7 | ¿En qué cubo de `X-Business-Use-Case-Usage` cae un envío por `/me/messages` con Page Access Token: `instagram`, `messenger` o `pages`? | Determina qué contador hay que vigilar por partición | S6, leyendo el campo `type` de la primera respuesta real | Abierta |
| 8 | ¿Tiene suelo la fórmula `4800 × impresiones`? Una cuenta nueva con 0 impresiones daría cuota 0 | Condiciona si se puede prometer onboarding a clientes pequeños de República Dominicana o Venezuela | S7, con cuenta profesional nueva | Abierta |
| 9 | ¿Está disponible la feature Human Agent en Venezuela, República Dominicana y México? Meta despliega por país de forma irregular y no publica listas | El tramo de 7 días puede no existir en algún mercado | S8, con cuenta real de cada mercado | Abierta |
| 10 | ¿Es `message_template_status_update` el mismo feed para plantillas de WhatsApp y para Utility Messages de Messenger? En el documento 03 aparece en el contexto de Messenger | Decide si el handler de plantillas se acopla a ese webhook o a otro | Consola de la app, antes de escribir la suscripción | Abierta |
| 11 | ¿Cuál es el TTL real de las URLs de `lookaside.fbsbx.com`? Meta no lo documenta | No afecta al envío, pero sí a qué muestra la bandeja junto al compositor cuando la URL caduca | Guardar una URL real y sondearla hasta el 403 o 404 | Abierta, no bloqueante para esta fase |
| 12 | ¿Sirve `/{PAGE_ID}/messages` para Instagram? Es plausible y coherente con Messenger, pero no está documentado literalmente | Haría el destino explícito también en Instagram, como en Messenger | Graph API Explorer. Mientras tanto, `/me/messages` | Abierta. No se cambia sin prueba |
| 13 | Todo el envío de WhatsApp | Es un tercio del producto y probablemente el canal de mayor volumen en los tres mercados | Investigación propia, con el mismo estándar de verificación que produjo el documento 03 | Abierta. Fuera de esta fase por decisión |
