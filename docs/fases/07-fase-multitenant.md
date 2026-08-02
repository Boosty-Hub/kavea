# Fase 7 — Multi-tenant productivo y entrada de clientes

**Fecha:** 2 de agosto de 2026
**Estado:** plan, sin código escrito
**Depende de:** `00-documento-base.md`, `03-invariantes-meta.md` (normativo),
`05-checklist-tech-provider.md`, `06-arquitectura-plataforma.md`

Esta fase es la número 7 en la numeración de bloques de `06-arquitectura-plataforma.md`
sección 8, que va del 0 (cimientos) al 6 (agentes en modo copiloto). El documento base la
llama Fase 5; es la misma fase, con la numeración de construcción en vez de la de producto.

Es la fase donde entra el primer cliente que no es Boosty. Todo lo anterior se podía
arreglar en caliente porque el único afectado era uno mismo. A partir de aquí no.

---

## 1. Objetivo

Que Boosty pueda dar de alta un cliente en Kavea en una sesión de trabajo, con el
aislamiento verificado antes de entregarle acceso, el coste real por conversación medido y
por debajo del precio que se le cobra, y un interruptor que permita apagar un canal o un
tenant sin apagar la ingesta.

Tres cosas que esta fase **no** persigue:

- No persigue registro self-service. El alta la ejecuta Boosty. El cliente hace su parte
  del trámite de Meta, que no es delegable.
- No persigue cobro automático. Produce la liquidación mensual por organización; el cobro
  sigue por los canales actuales de Boosty.
- No persigue importar histórico. No es recuperable, y eso se explica antes de vender.

---

## 2. Precondiciones

Ninguna tarea de esta fase empieza antes de que estas ocho estén cerradas. Cinco son
trámite y tres son producto.

| # | Precondición | Fuente | Estado |
|---|---|---|---|
| 1 | Boosty lleva **un mes completo** operando sobre Kavea, con cero mensajes perdidos medidos | `00` §10 | pendiente |
| 2 | Access Verification aprobada: Boosty Digital LLC designada Tech Provider | `05` §5 | pendiente |
| 3 | App Review aprobado permiso a permiso con Advanced Access, más la feature Human Agent | `03` invariantes | pendiente |
| 4 | `contact_email` **verificado** en el App Dashboard | `05` §2.6 | pendiente |
| 5 | `support@kavea.ai` recibiendo, con MX, DKIM, SPF y DMARC propagados | `05` §3 | pendiente |
| 6 | Cron de reconciliación de `subscribed_apps` corriendo, con alerta interna | `03` invariantes | pendiente |
| 7 | Test automatizado que falla cuando `GRAPH_API_VERSION` está a menos de 6 meses de expirar | `03` graphApiVersion | pendiente |
| 8 | **Ronda de investigación propia sobre WhatsApp**, con el método del documento 02 | `02` §14 | pendiente |

Sobre la precondición 8: el documento 03 marca WhatsApp como no investigado y fija que
ninguna sección puede afirmar nada fuera de cinco puntos verificados (tiers de mensajería,
plantillas, partner-led BV, Embedded Signup y permisos). WhatsApp es probablemente el canal
de mayor volumen en Venezuela, República Dominicana y México. Escribir el Embedded Signup
sin esa ronda es escribir contra documentación que no se ha leído.

Recordatorio de calendario que atraviesa toda la fase: **27 de octubre de 2026** es la fecha
en la que las retiradas de protocolo de v26.0 (`pretty`, `debug`, `date_format`, `GET /?ids=`
en raíz, ETag / If-None-Match / 304) se aplican a todas las versiones soportadas. Fijar una
versión antigua no protege.

---

## 3. Entregables

1. Módulo de alta de organización en `admin.kavea.ai`: creación, semilla de datos e
   invitación del primer usuario.
2. Embedded Signup de WhatsApp integrado, con `config_id`, captura de código en servidor y
   reconciliación de activos contra la Graph API.
3. Suite de aislamiento automatizada, ejecutable en un comando, más dos organizaciones
   canario permanentes en producción.
4. Modelo de costes por conversación implementado: tabla de tarifas de Meta versionada,
   cálculo de coste por `agent_run`, vista de coste por conversación y panel de margen por
   organización.
5. Liquidación mensual por organización, en PDF y CSV, sin cobro automático.
6. Kill-switch por canal y por tenant, modo degradado con cola retenida, banner de estado en
   la interfaz y disparadores automáticos.
7. Deauthorize callback y data deletion callback en producción, campo del dashboard cambiado
   de instrucciones a callback, y página pública de estado de eliminación.
8. Plan operativo de Data Access Renewal y Data Protection Assessment: responsable nombrado,
   calendario con avisos y expediente de evidencias mantenido de forma continua.
9. Guion comercial de onboarding y documento de límites que el cliente firma antes del alta.
10. Registro de riesgo asumido —una sola app de Meta— firmado y fechado, con indicador de
    materialización y plan de respuesta.

---

## 4. Tareas

Cada tarea lleva un criterio de aceptación que se comprueba ejecutando algo, no leyendo algo.

### 4.1 Alta de organización

**Tarea 1 — Formulario de alta y semilla de datos.**

El alta es un `insert` en `organizations` más la semilla. El subdominio no requiere ninguna
acción: `*.kavea.ai` ya resuelve por comodín contra Netlify y el middleware traduce el `Host`
a `organization_id` (`06` §3). Crear un cliente no es un despliegue.

La semilla incluye, como mínimo:

- Etapas de pipeline por defecto y estados de conversación.
- El **acuse de recibo determinista sub-30 s**, en el tono del cliente y en su idioma. Es
  política de Meta, verbatim: *"Automated bots must respond to any and all input from the
  user... within 30 seconds"*. Es texto de marca: lo aprueba el cliente, no el instalador.
- Horario de atención y regla de escalamiento por defecto.
- Rol `propietario` para el primer usuario.

*Criterio de aceptación:* desde el formulario de `admin.kavea.ai`, una organización nueva
queda creada, sembrada y con invitación enviada en **menos de 3 minutos medidos con
cronómetro**, y `cliente.kavea.ai` abre sesión con el usuario invitado sin ninguna acción
manual sobre DNS ni sobre la base de datos.

**Tarea 2 — Invitación del primer usuario.**

Correo por Resend con enlace de un solo uso, caducidad de 72 horas y vínculo al
`organization_id`, no al subdominio. El propietario invita al resto desde dentro.

*Criterio de aceptación:* un enlace de invitación usado dos veces falla la segunda. Un enlace
caducado falla. Un enlace de la organización A abierto desde el subdominio de la organización
B no crea membresía en B.

### 4.2 Conexión de canales

**Tarea 3 — Asistente de conexión de Instagram y Messenger.**

El documento 03 fija que el 80% de los fallos de conexión son configuración del cliente. El
asistente valida y guía con capturas, y **no deja avanzar** sin comprobar:

1. Cuenta de Instagram profesional.
2. Página de Facebook vinculada a esa cuenta. Requisito no negociable en v1.
3. Toggle *"Allow Access to Messages"* activado en Instagram → Configuración → Mensajes y
   respuestas a historias → Controles de mensajes → Herramientas conectadas. Sin esto el
   OAuth "funciona" y no llega ni un mensaje. Es el fallo silencioso más común.
4. La persona que autoriza tiene la tarea correcta sobre la Página. Validar aceptando
   `MODERATE` **y** `MESSAGE`; no rechazar por ausencia de `MESSAGING`, que no existe.
5. Default application de Conversation Routing configurada. Es una acción manual del cliente
   que Kavea no puede ejecutar por API. Se valida con
   `GET /me?fields=messaging_feature_status`.
6. Suscripción de la app a los webhooks de la Página con
   `POST /{page-id}/subscribed_apps`, con los `subscribed_fields` confirmados en consola
   (hay discrepancia de nomenclatura entre páginas oficiales: `messaging_referral` frente a
   `messaging_referrals`, y equivalentes).

*Criterio de aceptación:* con una cuenta de prueba a la que se le desactiva a propósito cada
uno de los seis puntos, el asistente detecta y nombra el punto exacto que falta en los seis
casos. No basta con que falle: tiene que decir cuál.

**Tarea 4 — Embedded Signup de WhatsApp.**

Bloqueada por la precondición 8.

Lo verificado hoy sobre Embedded Signup, y nada más:

- Requiere ser Solution Partner o Tech Provider. Boosty lo es por la Access Verification.
- Limita a **10 clientes nuevos por ventana móvil de 7 días**; sube a 200 solo si están
  completas Business Verification, App Review y Access Verification.
- Los permisos son `whatsapp_business_messaging` y `whatsapp_business_management`.
- Partner-led Business Verification existe pero es exclusiva de WhatsApp y solo para
  Solution Partners de nivel Select y Premier, con tope de 3 envíos por cliente. **Boosty no
  califica de entrada**: cada cliente verifica su propio negocio.

Forma propuesta de la implementación. Todo lo que sigue está **sin confirmar** y se contrasta
contra la consola y la documentación viva antes de escribir la primera línea:

```
NAVEGADOR (sin secretos)
  el cliente pulsa "Conectar WhatsApp"
        │
        ├─ el front lanza el diálogo con config_id de la configuración de WhatsApp,
        │  response_type=code y override del tipo de respuesta por defecto
        │
        ├─ escucha window 'message' para recibir la información de sesión que el
        │  diálogo emite (waba_id, phone_number_id). SE VALIDA event.origin.
        │
        └─ el callback del diálogo devuelve un `code` de un solo uso
                │  POST al servidor: { code, state }
                ▼
SERVIDOR (Route Handler, nunca Server Action)
        ├─ verifica `state` firmado: CSRF + vínculo a organization_id + sesión del usuario
        ├─ POST /{GRAPH_API_VERSION}/oauth/access_token  ← code + client_id + client_secret
        │     → token de negocio del tenant
        ├─ RELEE LOS ACTIVOS CONTRA LA GRAPH API con ese token
        │     → waba_id y phone_number_id autoritativos
        ├─ suscribe la app a los webhooks de la WABA
        ├─ registra el número en Cloud API con su PIN
        └─ escribe channels: waba_id, phone_number_id, credenciales cifradas
```

Cuatro reglas que no dependen de que la forma del diálogo se confirme:

1. **El `code` se intercambia en el servidor.** El App Secret no toca el navegador nunca.
2. **`state` firmado y vinculado a la organización.** Sin él, un usuario de la organización A
   puede completar un flujo que engancha activos en la organización B.
3. **Se valida `event.origin` en el listener de `message`.** Cualquier página puede emitir un
   `postMessage`. Sin esa comprobación, la información de sesión es un campo de texto que
   escribe quien quiera.
4. **El navegador no es fuente de verdad.** Lo que llega por `postMessage` sirve para pintar
   la interfaz. Lo que se persiste es lo que devuelve la Graph API tras el intercambio del
   código. La diferencia entre ambos, si la hay, se registra como incidente.

Colisión de números: el índice único parcial `channels_waba_idx` sobre `phone_number_id`
(`06` §4) impide que un mismo número quede enganchado a dos organizaciones. Cuando ocurra, el
asistente falla en voz alta con el nombre de la organización que ya lo tiene, no con un error
genérico de base de datos.

Enrutado del webhook: WhatsApp trae una cuarta forma de payload
(`object='whatsapp_business_account'`, `entry[].changes[].value.messages[]`) incompatible con
las tres de Meta Messaging. El identificador de enrutado no es `entry[].id` sino
`value.metadata.phone_number_id`. La clave de idempotencia sigue siendo
`UNIQUE (organization_id, canal, mid)`, con `wamid` en la columna `mid` y `canal='whatsapp'`.

*Criterio de aceptación:* un número real de un negocio de prueba, distinto del de Boosty,
queda conectado desde la interfaz; entra un mensaje por webhook, se enruta a la organización
correcta, y una respuesta sale y vuelve como confirmación. Además: un segundo intento de
conectar el mismo número desde otra organización se rechaza con el mensaje correcto, y un
`state` manipulado se rechaza.

**Tarea 5 — Contador de la ventana de Embedded Signup.**

Registrar cada alta completada de WhatsApp con marca temporal y comprobar la ventana móvil de
7 días antes de iniciar un flujo nuevo.

*Criterio de aceptación:* con el contador en el límite, el asistente no lanza el diálogo,
explica el motivo y da la fecha en la que se libera un hueco.

### 4.3 Aislamiento

**Tarea 6 — Claves foráneas compuestas.**

El esquema del documento 06 usa referencias simples: `messages.conversation_id references
conversations(id)`. Eso permite, si la aplicación escribe mal, un mensaje con
`organization_id` de A colgando de una conversación de B. RLS no lo impide: cada fila cumple
su propia política.

Se añade `unique (organization_id, id)` en las tablas padre y se convierten las referencias
de las hijas en compuestas sobre `(organization_id, <padre>_id)`. Postgres pasa a rechazar el
cosido cruzado por sí mismo.

*Criterio de aceptación:* un `insert` directo con el rol de servicio que cuelgue un mensaje de
la organización A de una conversación de la organización B falla con violación de clave
foránea.

**Tarea 7 — Suite de aislamiento.**

Un comando, `npm run test:aislamiento`, contra una base desechable. Siembra dos
organizaciones (`alfa`, `beta`), cada una con un usuario, un canal, un contacto, una
conversación, tres mensajes y un `agent_run`; más un usuario sin membresía y un token
anónimo. Ejecuta seis bloques y destruye la base.

**Bloque A — estructura.** Consultas al catálogo, no a los datos.

- A1: toda tabla de `public` con columna `organization_id` tiene `rowsecurity` y
  `forcerowsecurity` activos. Se mantiene una lista blanca explícita —hoy, solo
  `webhook_events`, que no lleva `organization_id` porque el evento llega antes de saber de
  quién es—. Una tabla nueva sin RLS y fuera de la lista rompe la suite.
- A2: toda tabla con `organization_id` tiene política para el rol `authenticated` con `using`
  y `with check`.
- A3: toda tabla con política tiene índice cuya primera columna es `organization_id`.
- A4: `private.org_ids_del_usuario()` no tiene `execute` para `public` ni `anon`.
- A5: ninguna tabla con `organization_id` concede permisos a `anon`.

**Bloque B — lectura cruzada, con sesión real.** Con la clave anónima y el JWT de cada
usuario, no con el rol de servicio.

- B1: con `alfa`, `select` sobre cada tabla devuelve solo filas de `alfa`.
- B2: con `alfa`, `select` filtrando por `organization_id` de `beta` devuelve 0 filas.
- B3: con `alfa`, `select` **por clave primaria conocida** de una fila de `beta` devuelve 0
  filas. Este es distinto de B2: atrapa políticas que filtran el listado pero dejan pasar el
  acceso directo por id.
- B4: usuario sin membresía y token anónimo devuelven 0 filas en todas las tablas.

**Bloque C — escritura cruzada.**

- C1: `alfa` inserta con `organization_id` de `beta` → error 42501.
- C2: `alfa` actualiza una fila propia cambiando `organization_id` a `beta` → error 42501.
- C3: `alfa` actualiza por id una fila de `beta` → 0 filas afectadas, y se relee con `beta`
  para confirmar que no cambió.
- C4: `alfa` borra por id una fila de `beta` → 0 filas afectadas.
- C5: `alfa` inserta un mensaje con `organization_id` propio y `conversation_id` de `beta` →
  error de clave foránea (tarea 6).

**Bloque D — realtime.** `alfa` se suscribe al canal de mensajes; con el rol de servicio se
inserta un mensaje en `beta`; se espera 10 segundos y se comprueba que `alfa` no recibió
nada. Realtime es una vía de autorización aparte y es un punto de fuga clásico.

**Bloque E — enrutado de webhooks.** El peor fallo posible bajo RLS es escribir mensajes de un
cliente en el tenant de otro, y ocurre antes de que RLS entre en juego.

- E1: se envía al receptor un payload firmado con `entry[].id` de `beta`; el mensaje aparece
  en `beta` y el recuento de `alfa` no cambia.
- E2: payload con un `entry[].id` desconocido → 0 filas nuevas en `messages`, una fila en
  `webhook_events` marcada como sin tenant, métrica de alerta incrementada, y el receptor
  devuelve **200** de todas formas.
- E3: se intenta sembrar dos canales con el mismo `page_id` → el índice único lo rechaza.
- E4: equivalente de E1 para WhatsApp, enrutando por `value.metadata.phone_number_id`.

**Bloque F — panel interno y break-glass.**

- F1: usuario de `staff` sin grant → 0 filas de contenido en `messages`, y las vistas
  agregadas siguen respondiendo.
- F2: grant caducado → 0 filas.
- F3: grant vigente → filas visibles, y existe la fila de auditoría con motivo.
- F4: `staff` no puede escribir en ninguna tabla de tenant.

**Bloque G — media.** Las claves de objeto en R2 llevan prefijo de `organization_id`, las URL
firmadas caducan, y una URL firmada de `beta` no se resuelve desde la sesión de `alfa`.

*Criterio de aceptación:* la suite corre en CI en cada pull request que toque migraciones o
políticas. Para demostrar que detecta agujeros y no solo que pasa, se ejecuta una vez con
cuatro sabotajes deliberados —quitar `force row level security` de una tabla, quitar el
`with check` de una política, romper la resolución de `entry[].id`, y publicar en Realtime sin
filtro— y la suite falla en los cuatro, señalando el bloque exacto.

**Tarea 8 — Tenants canario en producción.**

Dos organizaciones permanentes en producción, `canario-a` y `canario-b`, con datos
sintéticos y sin canales conectados. Un trabajo horario ejecuta los bloques B y C entre ellas
y publica el resultado en el panel interno. Los bloques destructivos nunca tocan un tenant
real.

*Criterio de aceptación:* el panel muestra la última ejecución con hora y resultado. Un fallo
genera alerta a `support@kavea.ai` y activa el banner interno.

### 4.4 Costes y facturación

**Tarea 9 — Tabla de tarifas de Meta versionada.**

El documento base es explícito: no modelar costes con cifras de memoria. Meta ha cambiado su
modelo de precios de WhatsApp más de una vez. Se crea una tabla con vigencias, cargada a mano
desde la tabla oficial, con la fecha de consulta y la URL de origen en cada fila.

```sql
create table public.tarifas_meta (
  id            uuid primary key default gen_random_uuid(),
  canal         text not null,          -- whatsapp | instagram | messenger
  pais          text not null,          -- VE | DO | MX | US
  categoria     text not null,          -- según el modelo vigente de Meta
  unidad        text not null,          -- conversacion | mensaje
  precio_usd    numeric(10,6) not null,
  vigente_desde date not null,
  vigente_hasta date,
  fuente_url    text not null,
  consultado_el date not null,
  unique (canal, pais, categoria, unidad, vigente_desde)
);
```

*Criterio de aceptación:* ningún cálculo de coste lee una constante del código. Un test falla
si existe una conversación facturable en un país o categoría sin fila vigente en la tabla.

**Tarea 10 — Coste de Claude por conversación.**

`agent_runs` ya guarda `costo_usd numeric(10,6)`, `modelo` y `latencia_ms`. Falta desglosar el
consumo de tokens para que el coste sea reconstruible y no un número opaco: tokens de entrada
sin caché, de escritura de caché, de lectura de caché, y de salida.

```
costo_usd = ( t_entrada_fria      × P_in
            + t_escritura_cache   × P_in × 1.25
            + t_lectura_cache     × P_in × 0.10
            + t_salida            × P_out ) / 1 000 000
```

Tarifas publicadas por Anthropic, consultadas el 2 de agosto de 2026:

| Modelo | Identificador | Entrada $/MTok | Salida $/MTok |
|---|---|---:|---:|
| Claude Opus 5 | `claude-opus-5` | 5.00 | 25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 3.00 (2.00 promocional hasta 31-ago-2026) | 15.00 (10.00) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 1.00 | 5.00 |

Van en una tabla `tarifas_modelo` con la misma disciplina de vigencias que la de Meta.

**La caché de prompt es la palanca principal.** El prefijo estable por tenant —instrucciones
del agente, definición de herramientas y contexto del negocio— se cachea; el histórico de la
conversación va después. La caché es una coincidencia de prefijo: un solo byte distinto al
principio invalida todo lo que viene detrás. Interpolar la fecha actual, el identificador de
la conversación o el nombre del contacto en la cabecera de las instrucciones anula la caché
de forma silenciosa, sin error y sin aviso. El mínimo cacheable en Claude Opus 5 es de 512
tokens.

*Criterio de aceptación:* en una conversación con seis o más ejecuciones de agente,
`cache_read_input_tokens` es mayor que cero a partir de la segunda. Un test automatizado falla
si es cero, porque eso significa que algo volátil se coló en el prefijo.

**Tarea 11 — Vista de coste por conversación y panel de margen.**

```
C_conv = C_meta + C_claude + C_infra
```

- `C_meta`: suma de conversaciones o mensajes facturables del hilo, valorados con
  `tarifas_meta` según país y categoría. En Instagram y Messenger no hay coste por mensaje;
  el coste de esos canales es infraestructura.
- `C_claude`: suma de `agent_runs.costo_usd` del `conversation_id`.
- `C_infra`: coste mensual fijo —Supabase, Netlify, Cloudflare, Resend, Anthropic si hay
  mínimo— dividido entre las conversaciones del periodo. Baja con el volumen, y por eso se
  reporta aparte y no se mezcla con las otras dos.

Ejemplo de cálculo del componente de Claude, con **valores de ejemplo que se sustituyen por
medición real**: seis ejecuciones por conversación, prefijo estable de 3.500 tokens, entrada
variable de 900 tokens por ejecución, salida de 250 tokens, sobre Claude Opus 5.

| Concepto | Con caché | Sin caché |
|---|---:|---:|
| Ejecución 1 (escritura de caché) | $0,0326 | $0,0283 |
| Ejecuciones 2 a 6 (lectura de caché) | $0,0125 c/u | $0,0283 c/u |
| **Total por conversación** | **$0,095** | **$0,170** |

El orden de magnitud importa más que las cifras: la caché mueve el coste de Claude en un
factor cercano a dos, y ese factor se pierde entero por una interpolación descuidada. Los
valores reales salen de `agent_runs`, no de esta tabla.

Criterios de margen:

- **Bloqueante de fase:** p50 y p95 de `C_conv` conocidos por organización y por canal, con
  al menos 30 días de datos reales de Boosty y del primer cliente piloto.
- **Alarma:** margen p50 por debajo del 40% en una ventana de 7 días para cualquier
  organización.
- **Bloqueo de alta:** no se da de alta un cliente en una tarifa cuyo margen p50 sea negativo
  en las organizaciones existentes de perfil comparable.

*Criterio de aceptación:* el panel interno muestra, por organización y por mes, coste total
desglosado en los tres componentes, coste por conversación en p50 y p95, precio efectivo por
conversación y margen. Se contrasta a mano contra la factura real de Meta y contra el consumo
real de la consola de Anthropic de un mes cerrado, y la diferencia queda por debajo del 5%.

**Tarea 12 — Liquidación mensual.**

Un documento por organización y periodo: conversaciones por canal, mensajes salientes,
plantillas enviadas, ejecuciones de agente, almacenamiento, coste desglosado y precio
aplicado. PDF y CSV. Sin pasarela de pago.

*Criterio de aceptación:* la liquidación de un mes cerrado de Boosty cuadra con los datos de
la base y con la factura de Meta. Se regenera de forma idempotente: ejecutarla dos veces
produce el mismo documento.

### 4.5 Kill-switch y modo degradado

**Tarea 13 — Interruptores.**

Meta puede restringir la app entera sin aviso y dejar a todos los tenants sin servicio a la
vez. Le pasó a Chatwoot Cloud durante días en julio de 2026 y tuvieron que deshabilitar por
código la creación de bandejas y las respuestas. La mitigación es el interruptor, no la
arquitectura.

```sql
create table public.interruptores (
  id              uuid primary key default gen_random_uuid(),
  ambito          text not null,     -- global | canal | tenant | tenant_canal
  organization_id uuid references public.organizations(id) on delete cascade,
  canal           text,
  motivo          text not null,
  automatico      boolean not null default false,
  activado_por    uuid references auth.users(id),
  activado_en     timestamptz not null default now(),
  desactivado_en  timestamptz
);
```

Resolución: cualquier interruptor activo que aplique bloquea. No hay precedencia que permita
que un interruptor de menor alcance desactive uno mayor.

Matriz de efectos. La primera fila es la que no se negocia:

| Componente | Con interruptor activo |
|---|---|
| Receptor de webhooks | **Sigue igual.** Valida firma, encola y devuelve 200 en menos de 5 s |
| Normalización y persistencia | Continúa. Los mensajes entrantes se guardan |
| Orquestador de agentes | Se detiene, o queda en solo clasificación según configuración |
| Envío saliente | Se retiene en cola con estado `retenido`. No se descarta ni se devuelve error al usuario |
| Interfaz | Compositor deshabilitado, con motivo y hora de inicio. Banner persistente |

Un interruptor que dejara de responder 200 provocaría la desuscripción automática a la hora,
que es peor que la avería que se intenta contener: a los 15 minutos de entregas fallidas Meta
manda una alerta y tras 1 hora la app queda desuscrita de esa Página, con resuscripción
manual.

Disparadores automáticos:

- Código 190 —token invalidado— en un tenant: interruptor `tenant_canal` inmediato. No se
  reintenta en bucle.
- Códigos 4, 17, 32, 613, 80001, 80002 o 80006 sostenidos en un canal de un tenant:
  interruptor `tenant_canal` respetando `estimated_time_to_regain_access`. Reintentar durante
  el bloqueo alarga la espera.
- El mismo código de error apareciendo en tres o más organizaciones distintas en menos de
  diez minutos: interruptor `global` automático y aviso inmediato al responsable. Ese es el
  patrón de una restricción de app, no de una avería de cliente.

**Tarea 14 — Drenaje de la cola retenida.**

Al desactivar un interruptor, la cola se drena por orden de llegada, a ritmo limitado por los
límites conocidos del canal, con carril de media separado del de texto.

El punto delicado: un mensaje retenido puede haber perdido su ventana. La ventana de 24 h se
calcula por conversación sobre `last_incoming_at`, y no la reabre un echo saliente. Un
mensaje retenido cuya ventana se cerró durante la retención **no se envía en silencio ni se
descarta en silencio**: se marca como caducado y se muestra al humano con la opción de
descartar o de reemplazarlo por una plantilla, donde el canal tenga plantillas. Instagram no
tiene plantillas ni reengagement; ahí la única salida es descartar o esperar a que el usuario
escriba.

*Criterio de aceptación:* se activa un interruptor de tenant, se encolan diez respuestas, se
avanza el reloj de forma que tres pierdan la ventana, se desactiva el interruptor. Siete
salen, tres quedan marcadas como caducadas y visibles en la bandeja, y ninguna se pierde.

**Tarea 15 — Banner de estado.**

Un endpoint `GET /api/estado` devuelve el estado global, el del tenant, el de cada canal, el
tamaño de la cola retenida y la hora de la última ingesta. Tres niveles: informativo,
degradado y detenido.

El texto del banner dice qué funciona y qué no, sin eufemismos: los mensajes que llegan se
siguen guardando, las respuestas quedan en cola, y se envían al restablecerse. El contrato con
los clientes de Boosty no puede prometer SLA sobre algo que controla Meta, y el banner es la
cara visible de esa cláusula.

*Criterio de aceptación:* con un interruptor activo, el banner aparece en menos de 30 segundos
en una sesión ya abierta, sin recargar; el compositor queda deshabilitado con el motivo; y la
cola retenida se muestra con su recuento.

### 4.6 Callbacks de Meta

**Tarea 16 — Verificación de `signed_request`.**

El deauthorize callback y el data deletion callback son **dos cosas distintas y ambas se
implementan**. Comparten el mecanismo de verificación y no comparten nada más.

Ambos reciben un `signed_request` con formato `<sig>.<payload_base64url>`. La firma es
HMAC-SHA256 con el App Secret **sobre la cadena base64 sin decodificar**, comparada contra la
firma decodificada de base64url. Es un mecanismo **diferente** al de `X-Hub-Signature-256`,
que firma el cuerpo crudo del webhook. Son dos funciones distintas y no se reutiliza una para
la otra.

```
partes = cuerpo.signed_request.split('.')          → [sig_b64url, payload_b64url]
esperado = HMAC_SHA256(app_secret, payload_b64url) ← la CADENA, no los bytes decodificados
recibido = base64url_decode(sig_b64url)
si no comparacion_tiempo_constante(esperado, recibido) → rechazar
payload = JSON.parse(base64url_decode(payload_b64url))
```

Ambos endpoints van como Supabase Edge Functions con verificación de JWT desactivada, con su
propio ciclo de despliegue, por la misma razón que el receptor de webhooks: Meta no manda
bearer token y un mal despliegue de la interfaz no puede tumbarlos.

El documento 03 marca como incierto el formato del `signed_request` para el deauthorize
callback en concreto —su existencia está confirmada, la ruta del menú y el nombre exacto del
campo no—. El handler registra el cuerpo crudo recibido y nunca devuelve 500, de forma que un
formato distinto del esperado sea diagnosticable en vez de invisible.

*Criterio de aceptación:* pruebas unitarias con un `signed_request` construido a mano que
pasa, uno con firma alterada que se rechaza, uno con payload alterado que se rechaza, y uno
con acentos y emoji en el payload que pasa. Ese último es el que atrapa la implementación que
decodifica antes de firmar.

**Tarea 17 — Deauthorize callback.**

Se dispara cuando el cliente retira el acceso de la app desde su portfolio. No es una
solicitud de borrado.

Efecto: marcar el canal como `desconectado`, activar interruptor `tenant_canal` con motivo
`revocado_por_cliente`, detener envíos y agentes, avisar a `support@kavea.ai` y mostrar en la
interfaz del cliente el estado con instrucciones de reconexión. **No se borran datos.**

Sin este callback, la desconexión de un cliente se detecta cuando empiezan a fallar los
envíos, es decir, tarde y con el número del cliente ya castigado.

*Criterio de aceptación:* se revoca el acceso desde el portfolio de una cuenta de prueba; en
menos de un minuto el canal figura como desconectado, hay interruptor activo y hay aviso por
correo.

**Tarea 18 — Data deletion callback y página de estado.**

Responde JSON con **exactamente** `{url, confirmation_code}`. Nada más, nada menos.

```json
{
  "url": "https://kavea.ai/eliminacion-de-datos/estado?codigo=KV-7F3A9C2E",
  "confirmation_code": "KV-7F3A9C2E"
}
```

El `user_id` del payload es un **App-Scoped ID**, que no es ni el PSID ni el IGSID. Se resuelve
contra la columna `contact_identities.app_scoped_id`, que existe separada desde el día uno
justamente por esto. Chatwoot tiene un issue abierto por no poder resolver esa
correspondencia.

Procedimiento:

1. Verificar firma. Si falla, rechazar.
2. Generar y persistir el código de confirmación con la solicitud completa, antes de
   responder. La respuesta se debe a Meta aunque el borrado tarde.
3. Resolver el App-Scoped ID. Si resuelve: borrar contacto, identidades, mensajes, punteros
   de media y contenido de `agent_runs` asociados. Se conservan los contadores agregados sin
   contenido personal y el propio registro de la solicitud, que es la prueba de haberla
   atendido.
4. Si no resuelve: dejar la solicitud en estado `sin_resolver`, alertar, y resolverla a mano
   dentro del plazo comprometido. La página de estado dice la verdad sobre el estado real.
5. La página `kavea.ai/eliminacion-de-datos/estado` debe devolver 200 al rastreador de Meta.
   Si `kavea.ai` tiene protección de bots agresiva, la revisión se rechaza por enlace roto sin
   más explicación.

**Cambio del campo del dashboard.** El campo *User Data Deletion* del App Dashboard tiene dos
modos, instrucciones o callback. Hoy está en instrucciones apuntando a
`https://kavea.ai/eliminacion-de-datos`, porque el callback no existía. El orden del cambio,
que no se altera:

1. Desplegar el callback y verificarlo con un `signed_request` construido a mano.
2. Cambiar el campo a **Data Deletion Callback URL** en el dashboard.
3. Volver a verificar desde el propio dashboard con la herramienta de prueba de Meta.
4. Dejar la página de instrucciones publicada. Sigue siendo la que enlaza la política de
   privacidad.

*Criterio de aceptación:* la herramienta de prueba de Meta obtiene una respuesta válida; la
página de estado carga con el código y muestra el estado real; y una solicitud cuyo
App-Scoped ID no resuelve queda registrada como `sin_resolver` y genera alerta, en vez de
responder que todo está borrado.

### 4.7 Trámite recurrente

**Tarea 19 — Plan operativo de Data Access Renewal y Data Protection Assessment.**

Meta consolidó Data Use Checkup, App Review, Data Protection Assessment y las revisiones
continuas en un proceso anual único. Que existe está confirmado. **Qué requisitos concretos
aplican al perfil de Kavea y con qué periodicidad exacta no está determinado.** Es un trámite
recurrente con capacidad de cortar el acceso de todos los tenants a la vez, así que va en el
calendario con un responsable, no en la carpeta de pendientes.

- **Responsable:** Gabriel Montiel Toro. **Suplente:** por designar. El suplente no es
  opcional: es un trámite anual con capacidad de apagar el negocio entero.
- **Descubrimiento de la fecha:** consultar el detalle en el App Dashboard una vez la app
  esté conectada al negocio y anotar la fecha de renovación en el calendario.
- **Avisos:** T-90, T-60, T-30 y T-7 días.
- **Expediente de evidencias, mantenido de forma continua y no montado el último día:**
  política de privacidad viva y accesible al rastreador; ambos callbacks respondiendo;
  screencasts vigentes por permiso; diagrama de flujo de datos; política de retención y
  borrado; lista de subencargados; control de acceso del panel interno y del break-glass;
  procedimiento de incidentes.
- **Ventana de congelación:** durante el trámite no se tocan icono, categoría, URLs ni
  configuraciones de Facebook Login. El documento 03 marca como no verificable que cambiar
  ajustes obligue a repetir la revisión, pero congelarlo es barato.
- **Contingencia:** si la renovación se retrasa o se rechaza, todos los tenants pierden acceso
  a la vez. La respuesta inmediata es el modo degradado; los clientes reciben aviso escrito
  dentro de las 4 horas siguientes; y el contrato debe recoger esta dependencia por escrito
  antes de la primera venta.

*Criterio de aceptación:* existe la entrada de calendario con fecha y avisos, existe el
expediente con todos los apartados poblados, y una revisión trimestral comprueba que sigue
vigente. La revisión deja registro.

### 4.8 Comercial

**Tarea 20 — Documento de límites que firma el cliente.**

Cinco cosas que se dicen antes de vender, no después:

1. **La bandeja arranca vacía.** La Conversations API está topada a 2 llamadas por segundo por
   cuenta y solo devuelve los 20 mensajes más recientes por conversación; pedir uno más
   antiguo devuelve un error engañoso que dice que el mensaje fue borrado. El histórico
   completo no es recuperable. Es un asunto comercial, no técnico: no hay solución de
   ingeniería que lo arregle, y presentarlo como una limitación temporal es mentir.
2. **En WhatsApp el cliente verifica su propio negocio.** Su verificación condiciona sus
   límites de mensajería —250, 2.000, 10.000, 100.000, ilimitado— y de plantillas —250 sin
   verificar, 6.000 verificado y con al menos un número con display name aprobado—. Vender
   WhatsApp llave en mano sin que el cliente haga nada es una promesa que Meta no permite
   cumplir.
3. **En Instagram y Messenger el cliente no verifica nada.** Basta la verificación de Boosty.
   Lo que sí tiene que hacer a mano: cuenta profesional, Página vinculada, el toggle de
   Herramientas conectadas y la default application de Conversation Routing.
4. **No hay SLA sobre lo que controla Meta.** Restricciones de app, cambios de política,
   desuscripciones y límites de cuota están fuera del control de Boosty. Lo que sí se
   compromete: que los mensajes entrantes no se pierden, y que hay banner de estado y aviso
   escrito.
5. **Instagram fuera de la ventana de 24 h no tiene reengagement.** No existen One-Time
   Notifications, Sponsored Messages, News Messaging, Marketing Messages API ni Utility
   Templates en la Instagram Messaging API. Las únicas palancas son HUMAN_AGENT hasta 7 días
   y solo para intervención humana real, el private reply a un comentario, y un enlace
   `ig.me` con `?ref=`. No se promete recuperación de carritos ni campañas por Instagram
   Direct.

*Criterio de aceptación:* el documento existe, cabe en dos páginas, y el primer cliente lo
firma antes de que se cree su organización.

**Tarea 21 — Suelo de cuota de Instagram para cuentas nuevas.**

El documento 03 marca como incierto el suelo de la fórmula de cuota diaria de Instagram:
`4800 × impresiones en 24 h`. Una cuenta recién creada con 0 impresiones daría cuota 0, lo que
sería inoperante. La documentación no menciona ningún mínimo.

Esto afecta directamente al onboarding de clientes pequeños en República Dominicana y
Venezuela, que es exactamente el perfil que Boosty va a vender. La cadena de fallo es la
siguiente: cuenta con poco alcance, cuota diaria cercana a cero, el agente no puede responder,
se incumple la política de los 30 segundos, la Página recibe aviso de violación con 7 días
para corregir, y después Meta restringe la mensajería. El acuse de recibo determinista no
salva de esto: si la cuota es cero, tampoco el acuse sale.

Trabajo:

- Medir con una cuenta profesional nueva y real de cada mercado, antes de prometer nada.
  Registrar la cuota observada y los encabezados `X-Business-Use-Case-Usage` de las primeras
  llamadas.
- Registrar por canal una `cuota_observada` durante el alta y en cada ejecución del cron de
  reconciliación.
- Política provisional mientras no haya medida: si la cuota observada está por debajo del
  umbral que se fije, el asistente de alta avisa por escrito y el canal de Instagram queda
  marcado como sujeto a cuota del cliente. En esos mercados se vende WhatsApp primero.

*Criterio de aceptación:* existe la medición con al menos una cuenta nueva por mercado; el
umbral está fijado por escrito; y el asistente de alta muestra el aviso cuando corresponde.

---

## 5. Procedimiento de alta de cliente, paso a paso

Tiempo de Boosty: por debajo de 20 minutos. El calendario total depende de la verificación de
negocio del cliente para WhatsApp, que no controla Boosty.

**Paso 0 — Preventa.** El cliente firma el documento de límites de la tarea 20. Se registra la
tarifa, el país y la moneda. Se acuerda el texto del acuse de recibo sub-30 s. Si no hay
firma, no hay alta.

**Paso 1 — Crear la organización (2 min).** Formulario en `admin.kavea.ai`: slug, nombre,
país, tarifa. Se ejecuta la semilla.

**Paso 2 — Invitar al propietario (1 min).** Correo con enlace de un solo uso, 72 horas.

**Paso 3 — Comprobar el subdominio (1 min).** Abrir `cliente.kavea.ai`, iniciar sesión con el
propietario y comprobar que la bandeja carga vacía y que no se ve nada de otra organización.
No hay cambio de DNS ni despliegue: el comodín ya resuelve.

**Paso 4 — Conectar Instagram y Messenger (depende del cliente).** Asistente de la tarea 3.
Las seis validaciones tienen que pasar en verde. Aquí es donde el cliente hace clic; el tiempo
lo pone él.

**Paso 5 — Conectar WhatsApp (depende del cliente y de Meta).** Embedded Signup de la tarea 4.
Antes de lanzarlo, comprobar el contador de la ventana de 7 días. La verificación de negocio
del cliente puede tardar de días a semanas y no está en el camino crítico de Kavea, pero sí en
el del cliente: sus límites de mensajería dependen de ella.

**Paso 6 — Verificación de aislamiento (3 min).** Ejecutar los bloques B y C de la suite entre
la organización nueva y `canario-a`. **Verde es requisito para entregar acceso.** Si falla, no
se entrega, se investiga.

**Paso 7 — Prueba de extremo a extremo (5 min).** Desde un teléfono real, mandar un mensaje
por cada canal conectado. Comprobar: llega a la bandeja correcta, el enrutado por
`entry[].id` o `phone_number_id` es el esperado, la respuesta sale, el echo vuelve y no
re-dispara el agente, la ventana de 24 h se calcula bien sobre `last_incoming_at`, y el
`agent_run` queda registrado con su coste.

**Paso 8 — Activación (2 min).** Estado de la organización a `activa`, interruptores
desactivados, banner limpio, inicio del periodo de facturación registrado, y aviso al cliente
con el enlace a su subdominio.

**Paso 9 — Seguimiento a 7 días.** Revisar coste por conversación, cuota observada de cada
canal, calidad del número en WhatsApp y ejecuciones de agente escaladas. Es la primera lectura
real de margen de ese cliente.

---

## 6. Modelo de costes por conversación

El coste de Claude por conversación y el coste de WhatsApp por conversación de Meta son
independientes de la tarifa de Kavea. Los tres se miden por separado y el precio se fija
después, no antes.

```
C_conv = C_meta + C_claude + C_infra

margen_unitario = precio_efectivo_por_conversacion − C_conv
```

| Componente | Origen del dato | Frecuencia de actualización |
|---|---|---|
| `C_meta` | `tarifas_meta`, cargada a mano desde la tabla oficial por país y categoría | Al cambiar Meta el modelo, y revisión trimestral obligatoria |
| `C_claude` | Suma de `agent_runs.costo_usd` del hilo, con desglose de tokens | Continua, por ejecución |
| `C_infra` | Coste mensual fijo dividido entre conversaciones del periodo | Mensual |
| `precio_efectivo` | Tarifa mensual más excedentes, dividida entre conversaciones del periodo | Mensual |

Lo que hace este modelo verificable en vez de estimado:

- Ninguna cifra vive en el código. Las dos tablas de tarifas llevan vigencia, fuente y fecha
  de consulta.
- El coste de Claude se reconstruye desde los tokens, no se acepta como número dado. Si el
  desglose no cuadra con la tarifa, es un error detectable.
- El coste se contrasta contra la factura real de Meta y contra el consumo real de la consola
  de Anthropic de un mes cerrado. La diferencia aceptable es del 5%.
- La caché de prompt tiene su propio test, porque su fallo es silencioso y aproximadamente
  duplica el coste.

Lo que este modelo todavía no resuelve, y está en preguntas abiertas: quién paga a Meta.

---

## 7. Riesgos

### 7.1 Riesgo asumido y documentado: una sola app de Meta

Este apartado es el registro formal. Se firma y se fecha.

| Campo | Contenido |
|---|---|
| **Riesgo** | Una única app de Meta, de tipo Business, atiende a todos los tenants. Una restricción de Meta sobre la app tumba a todos los clientes a la vez |
| **Precedente** | Chatwoot Cloud, julio de 2026: días sin servicio, con deshabilitación por código de la creación de bandejas y de las respuestas |
| **Alternativa descartada** | Una app por cliente. Multiplica por N las rondas de App Review y de Access Verification. No es viable con el tamaño de Boosty |
| **Por qué se asume** | Sin la app única no hay Tech Provider, sin Tech Provider no hay Embedded Signup, y sin Embedded Signup el onboarding de WhatsApp deja de ser una operación de minutos |
| **Mitigación** | Kill-switch por canal y por tenant, modo degradado que encola en vez de fallar, banner de estado, y cláusula contractual que excluye SLA sobre lo que controla Meta. **Se mitiga con interruptor, no con arquitectura** |
| **Indicador de materialización** | El mismo código de error en tres o más organizaciones en menos de diez minutos, o correo de restricción de Meta a la dirección de contacto verificada |
| **Plan si se materializa** | Interruptor global automático, aviso escrito a todos los clientes dentro de 4 horas, ingesta y persistencia sin interrupción, cola retenida drenada al restablecerse con tratamiento explícito de los mensajes caducados |
| **Revisión** | Trimestral, junto con la revisión del expediente de Data Access Renewal |
| **Firmado por** | _(pendiente)_ |
| **Fecha** | _(pendiente)_ |

### 7.2 Resto de riesgos de la fase

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Data Access Renewal fallido o tardío | Corta el acceso de todos los tenants a la vez | Responsable nombrado con suplente, avisos T-90/60/30/7, expediente continuo, cláusula contractual |
| Fuga entre tenants por un agujero de RLS | El peor fallo posible. Daño reputacional irrecuperable | Suite de aislamiento en CI, canarios horarios en producción, claves foráneas compuestas, verificación obligatoria antes de entregar acceso |
| Fallo de enrutado por `entry[].id` o `phone_number_id` | Escribe mensajes de un cliente en el tenant de otro, sin error visible | Índices únicos globales, bloque E de la suite, tratamiento explícito del `entry[].id` desconocido |
| Cuota de Instagram cercana a cero en clientes pequeños de RD y Venezuela | El agente no responde, se incumple la política de 30 s, Meta restringe la Página del cliente | Medición previa con cuenta nueva por mercado, `cuota_observada` por canal, aviso en el alta, vender WhatsApp primero en esos mercados |
| Coste de Claude por conversación erosiona el margen a volumen | Rompe el criterio de éxito de v1 | Desglose de tokens en `agent_runs`, test de caché de prompt, panel de margen con alarma al 40%, bloqueo de altas en tarifas con margen negativo |
| Caché de prompt invalidada en silencio | Duplica el coste de Claude sin señal | Test que falla si `cache_read_input_tokens` es cero a partir de la segunda ejecución |
| El cliente descubre la bandeja vacía después de firmar | Conflicto comercial en la primera semana | Documento de límites firmado en el paso 0 del alta |
| Mensajes retenidos que pierden la ventana durante un interruptor | Envíos fuera de ventana que fallan, o mensajes descartados en silencio | Marcado explícito de caducados y decisión humana en la bandeja |
| Tope de 10 altas por ventana móvil de 7 días en Embedded Signup | Bloquea el ritmo comercial sin aviso | Contador con comprobación previa y fecha de liberación visible |
| Solicitud de borrado con App-Scoped ID que no resuelve | Incumplimiento de plazo y riesgo en la renovación anual | Estado `sin_resolver` explícito, alerta, resolución manual con plazo, página de estado honesta |

---

## 8. Definición de terminado

La fase está terminada cuando **todo** lo siguiente es cierto y demostrable:

1. Un cliente que no es Boosty opera sobre Kavea, con al menos un canal conectado por
   Embedded Signup u OAuth de Facebook Login for Business.
2. El alta de una organización nueva, medida con cronómetro, ocupa menos de 20 minutos de
   trabajo de Boosty, sin tocar DNS ni la base de datos a mano.
3. La suite de aislamiento pasa en CI, falla ante los cuatro sabotajes deliberados, y los dos
   canarios llevan 30 días de ejecuciones horarias sin incidencias.
4. El coste por conversación está medido con 30 días de datos reales, desglosado en los tres
   componentes, contrastado contra la factura de Meta y el consumo de Anthropic con menos del
   5% de diferencia, y **por debajo del precio cobrado** en p50 y en p95.
5. El kill-switch se ha probado en producción: activado, con cola retenida, banner visible,
   mensajes caducados tratados a mano, y desactivado con drenaje completo. Durante toda la
   prueba, la ingesta no se detuvo y el receptor devolvió 200 sin excepción.
6. Ambos callbacks responden en producción; el campo del dashboard está en modo callback; la
   página de estado devuelve 200 al rastreador; y hay al menos una solicitud de borrado real o
   simulada atendida de extremo a extremo con su registro.
7. El plan de Data Access Renewal tiene responsable, suplente, fecha en calendario, avisos
   configurados y expediente completo.
8. El registro de riesgo asumido está firmado y fechado.
9. El documento de límites está firmado por el primer cliente.
10. Existe la medición del suelo de cuota de Instagram con una cuenta nueva por mercado, o
    existe por escrito la decisión de no vender Instagram a ese perfil de cliente hasta
    tenerla.

El punto 4 es el criterio de éxito de v1 del documento base, aplicado a clientes en vez de a
Boosty. Sin él la fase no cierra, aunque todo lo demás funcione.

---

## 9. Preguntas abiertas

| # | Pregunta | Por qué bloquea | Cómo se resuelve |
|---|---|---|---|
| 1 | **¿Quién paga a Meta el consumo de WhatsApp: el método de pago de la WABA del cliente o una línea de crédito de Boosty?** | Cambia el P&L entero, el contrato y si `C_meta` aparece siquiera en la cuenta de Kavea | Verificar en la documentación de facturación de WhatsApp durante la ronda de investigación de la precondición 8, y decidir antes de fijar tarifa |
| 2 | ¿Se absorbe el coste de Meta dentro de la tarifa o se factura aparte a coste más margen? | Depende de la 1. Determina si el cliente ve una factura variable o una cuota | Decisión comercial, tras la 1 |
| 3 | Suelo de la fórmula `4800 × impresiones` de Instagram para cuentas nuevas con cero impresiones | Bloquea la promesa comercial a clientes pequeños de República Dominicana y Venezuela, que es el perfil objetivo | Medir con una cuenta profesional nueva y real de cada mercado (tarea 21) |
| 4 | Forma exacta del diálogo de Embedded Signup, de la información de sesión y del intercambio del código | Es la primera línea del onboarding de WhatsApp | Consola y documentación viva, durante la ronda de investigación |
| 5 | Ruta del menú, nombre del campo y formato del `signed_request` del deauthorize callback | Solo está confirmada su existencia; el resto venía de un hilo del foro | Abrir el App Dashboard y mirarlo |
| 6 | Requisitos concretos y periodicidad del Data Access Renewal y del Data Protection Assessment para el perfil de Kavea | Trámite recurrente con capacidad de cortar el acceso de todos los tenants | Pedir el detalle en el dashboard con la app ya conectada al negocio |
| 7 | ¿Está confirmado que Kavea opera en el tope de 200 altas por ventana de 7 días y no en el de 10? | Determina el ritmo comercial máximo | Verificar en consola tras la aprobación de App Review |
| 8 | ¿Se persigue el nivel Select o Premier de Solution Partner para acceder a partner-led Business Verification? | Es la única vía para que Boosty verifique en nombre del cliente en WhatsApp, con tope de 3 envíos | Evaluar coste y requisitos del programa frente al ahorro de fricción por cliente |
| 9 | Disponibilidad regional en Venezuela, República Dominicana y México de Human Agent, private replies y Conversation Routing | Meta despliega por país de forma irregular y no publica listas. Ausencia de prohibición no es confirmación | Probar con una cuenta profesional real de cada mercado |
| 10 | ¿Qué plazo se compromete para una solicitud de borrado cuyo App-Scoped ID no resuelve, y qué dice exactamente la página de estado mientras tanto? | Afecta al expediente de la renovación anual y a la política publicada | Decisión legal y de producto, antes de cambiar el campo del dashboard |
| 11 | Retención tras la baja de un cliente: cuánto tiempo se conservan los mensajes, quién puede exportarlos y en qué formato | Va en el contrato y en el expediente de evidencias | Decisión legal, antes de la primera venta |
| 12 | ¿Sostiene un modelo más barato la calidad en clasificación de intención, frente a Claude Opus 5 en redacción? | Es la palanca de coste más grande después de la caché de prompt | Medir sobre `agent_runs` con datos reales de un mes. Decisión humana tras medir, nunca por defecto |
