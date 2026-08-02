# Fase 5 — Módulo de configuración y conexión de canales

**Fecha:** 2 de agosto de 2026
**Estado:** plan, sin código escrito
**Depende de:** `00-documento-base.md`, `03-invariantes-meta.md` (normativo),
`04-configuracion-app-meta.md`, `05-checklist-tech-provider.md`,
`06-arquitectura-plataforma.md`
**Corresponde al bloque 5 del orden de construcción de `06-arquitectura-plataforma.md` §8.**

---

## 1. Objetivo

Que un canal se conecte desde la interfaz, sin tocar la base de datos, y que la
conexión quede verificada contra la realidad y no contra la esperanza.

Durante el dogfooding la configuración de canales de Boosty se sembró a mano. Esta
fase construye la interfaz que generaliza eso y, sobre todo, el asistente que impide
el fallo que domina las estadísticas: **el 80 % de los fallos de conexión son
configuración del cliente, no código**. Un OAuth que devuelve 200 y una Página de la
que no llega un solo mensaje son el mismo estado desde el punto de vista del código y
estados opuestos desde el punto de vista del negocio. El módulo de configuración
existe para distinguirlos.

### Lo que entra

- Configuraciones de Facebook Login for Business separadas por canal, con `config_id`.
- Flujo OAuth completo, obtención del token BISU del portafolio del cliente, derivación
  del Page Access Token, cifrado en reposo y rotación.
- Suscripción de la app a los webhooks de la Página.
- Asistente de onboarding con validación por API y guía con capturas.
- Estados de conexión por canal en la interfaz, detección de caída y ruta de
  recuperación.
- Pantalla de configuración general de la organización: datos, miembros, roles.
- Pantalla de expectativas de WhatsApp, con la asimetría de trámites dicha por escrito.

### Lo que no entra

- **Embedded Signup de WhatsApp.** Bloqueado hasta que Meta apruebe Tech Provider, y
  con WhatsApp sin investigar fuera de los cinco puntos verificados de
  `03-invariantes-meta.md`. Esta fase entrega la pantalla que fija expectativas y
  registra el estado del trámite del cliente, no el alta técnica del número.
- **Registro self-service.** El alta la conduce Boosty. La regla de dogfooding impide
  clientes durante el primer mes.
- **Facturación por uso.**
- **Comentarios de Instagram.** Otro modelo de datos y otra ronda de App Review.
- **Modo autónomo de agentes.** El asistente configura canales, no comportamiento de IA.

---

## 2. Precondiciones

Sin esto, la fase no arranca.

| # | Precondición | Fuente | Estado hoy |
|---|---|---|---|
| P1 | Bloques 0 a 4 de `06` §8 terminados: esquema, RLS, auth, middleware de subdominio, receptor, normalizador, bandeja y envío | `06` §8 | Pendiente |
| P2 | Receptor de webhooks desplegado con HTTPS público y handshake válido | `06` §2 | Pendiente |
| P3 | Access Verification (Tech Provider) enviada | `05-checklist` §5 | Ajustes pendientes, sin envío |
| P4 | Ajustes básicos de la app completos y congelados: icono, categoría, las tres URLs, email de contacto verificado | `05-checklist` §2 | Todos los campos en `null` |
| P5 | `support@kavea.ai` recibiendo correo | `05-checklist` §3 | Pendiente de DNS |
| P6 | Use cases depurados: exactamente los ocho permisos de `04` §D4 y ningún `instagram_business_*` | `04` §D3–D5 | Pendiente |
| P7 | Al menos un tenant real operando por la vía de activo asignado, para tener contra qué comparar | `04` §2 | 28 Páginas disponibles |

**P3 y P6 no bloquean el desarrollo, bloquean la activación de clientes que no estén
asignados al Business Manager de Boosty.** El módulo se construye y se prueba contra
los 28 activos ya asignados, que no necesitan el diálogo de OAuth. Ver tarea T21.

Precondición de conocimiento: las comprobaciones empíricas C1 a C8 de la sección 10 se
ejecutan **antes** de escribir el código de cada tarea que dependa de ellas, no después.
Cada una cuesta minutos y cierra una contradicción documental que si no se resuelve se
convierte en una rama muerta en el código.

---

## 3. Entregables

**Configuración en Meta**

1. Dos configuraciones de Facebook Login for Business en el App Dashboard, una por canal,
   con sus `config_id` en variables de entorno.
2. La URL literal del diálogo de autorización con `config_id`, copiada del dashboard y
   documentada. Hoy está marcada *sin confirmar* en `03` §`hostsApi`.

**Código**

3. `GET /api/meta/oauth/start` — route handler que emite el 302 al diálogo con `state`
   firmado.
4. `GET /api/meta/oauth/callback` — route handler que intercambia el código, deriva el
   Page Access Token, descubre los activos, valida y persiste.
5. Módulo de cifrado y descifrado de tokens con `kid`, y el almacén en el esquema
   `private`.
6. Cliente de suscripción a webhooks y su reconciliador periódico.
7. Motor de validaciones de conexión, con un resultado por comprobación y no un booleano
   global.
8. Enlace de conexión firmado y caducable, para que el admin del cliente complete solo el
   paso de OAuth.

**Interfaz**

9. Asistente de conexión de canales, ocho pasos, con capturas y diagnóstico.
10. Panel de canales con estado por canal y ruta de recuperación.
11. Pantalla de expectativas de WhatsApp.
12. Pantalla de configuración de la organización: datos, miembros, roles.

**Documentación**

13. Capturas de pantalla del lado del cliente, en español, para los tres pasos manuales:
    cuenta profesional, toggle de mensajes y default application.
14. Actualización de `03-invariantes-meta.md` con lo que las comprobaciones C1 a C8
    devuelvan. Los `inciertos` que se cierren se mueven a `invariantes` con la fecha y el
    método de medición.

---

## 4. Tareas

Cada tarea lleva criterio de aceptación verificable. Una tarea sin criterio comprobable
no está terminada, está abandonada.

### Bloque A — Configuraciones de Facebook Login for Business

**T1. Crear dos configuraciones separadas, una por canal.**

`03` §`invariantes` es explícito: pedir scopes de más rompe el App Review. Chatwoot pedía
`instagram_basic` e `instagram_manage_messages` dentro de un flujo solo-Messenger y
obtenía *"Invalid Scopes"*, lo que bloqueaba la revisión.

Se crean `kavea-messenger` y `kavea-instagram`. **No se crea una tercera configuración
combinada.** Un cliente que quiere los dos canales pasa por dos diálogos consecutivos.
Es fricción real y hay que decirlo en el asistente: el segundo diálogo suele ser más
rápido porque el portafolio ya está seleccionado.

El conjunto de permisos de cada configuración es un subconjunto del conjunto que se envía
a App Review. **Son dos cosas distintas y confundirlas es un rechazo:** el App Review pide
la unión de los ocho permisos de `04` §D4; cada configuración pide el mínimo de su canal.
Una configuración no puede incluir un permiso que la app no tenga aprobado en Advanced
Access, o el cliente sin rol en la app recibirá un error de scopes.

*Aceptación:* existen dos `config_id` distintos en variables de entorno, el diálogo de
cada uno muestra en pantalla solo los permisos de su tabla en la sección 7, y ninguno
muestra un permiso del otro canal.

**T2. Copiar la URL literal del diálogo con `config_id`.**

`03` §`hostsApi` la marca *sin confirmar*. Lo único confirmado es que `config_id`
sustituye al parámetro `scope`. No se infiere: se copia del App Dashboard y se pega en
este documento y en `03`.

*Aceptación:* la URL está transcrita literal en `03` con fecha, y un `curl` contra ella
con el `config_id` de pruebas devuelve el diálogo y no un error de parámetros.

**T3. Registrar el Authorize callback URL y cerrar el `state`.**

El `state` es un token firmado con secreto de servidor que lleva `organization_id`, canal,
`config_id`, nonce y caducidad de 10 minutos. Se valida en el callback antes de cualquier
otra cosa. Un callback que acepta un `state` no firmado es un CSRF que conecta la Página
de un cliente al tenant de otro.

*Aceptación:* un callback con `state` alterado, caducado o reutilizado devuelve 400 y no
escribe una sola fila. Hay un test que lo prueba con los tres casos.

**T4. Auditar el mínimo real de cada configuración.**

Los use cases del App Dashboard preseleccionan permisos. `04` §D3 obliga a borrar lo
sobrante. Hay dos permisos cuya pertenencia al mínimo no está establecida y no se decide
por lectura de documentación: `business_management` (ver C2) y `pages_read_engagement` en
la configuración de Messenger, que el grafo de dependencias de `02` §4 no cuelga de
`pages_messaging` pero que `03` §`scopesMessenger` sí lista como permiso de canal.

*Aceptación:* por cada permiso de cada configuración existe una línea escrita que dice o
bien qué llamada de Kavea lo consume, o bien de qué permiso es dependencia declarada. No
queda ninguno sin justificar.

### Bloque B — OAuth, token BISU y custodia

**T5. Implementar `GET /api/meta/oauth/start`.**

Route handler de Next.js, no Server Action: el callback de Meta es un `GET` con `code` y
`state` en la query string. Recibe canal y `organization_id`, comprueba que el usuario de
la sesión tiene rol `propietario` o `admin` en esa organización, firma el `state` y emite
un 302.

*Aceptación:* un usuario con rol `agente` recibe 403. Un usuario sin membresía en esa
organización recibe 403 aunque acierte el `organization_id` en la URL.

**T6. Implementar `GET /api/meta/oauth/callback`.**

Secuencia, en este orden, abortando en el primer fallo con un mensaje concreto:

```
1. validar state                       → 400 si falla
2. POST /v26.0/oauth/access_token      → token BISU del portafolio del cliente
3. GET  /v26.0/me/accounts?fields=id,name,tasks,access_token
                                       → page_id, tasks[], Page Access Token
4. GET  /v26.0/{page_id}?fields=instagram_business_account,username
5. GET  /v26.0/me?fields=messaging_feature_status  (con Page Access Token)
6. cifrar y persistir
7. POST /v26.0/{page_id}/subscribed_apps
```

El intercambio de código expone el App Secret: server-side sin excepción. Todas las
llamadas leen `GRAPH_API_VERSION`, nunca una versión en el path ni una llamada sin
versión.

Un fallo en el paso 7 **aborta el alta**. No se deja un tenant a medio conectar: una
conexión persistida sin webhooks suscritos es exactamente el estado que produce el fallo
silencioso.

*Aceptación:* un alta completa deja la fila en `meta_connections` con
`subscription_ok = true`; un alta que falla en cualquier paso no deja ninguna fila en
estado `conectado` y muestra al operador el paso exacto que falló con el código de error
de Meta.

**T7. Cifrar los tokens en reposo, en el esquema `private`.**

El material criptográfico no vive en `public`. `02` §7.8 fija la tabla
`private.meta_credentials` con `cipher`, `nonce` y `kid` separados para el Page Access
Token y para el BISU. AES-256-GCM, cifrado en la aplicación, clave en el almacén de
secretos del runtime, no en la base de datos: un volcado de la base no contiene la clave.

`kid` desde el primer día. Sin identificador de clave, rotar significa descifrar y volver
a cifrar todo a la vez, con ventana de indisponibilidad.

**Divergencia a resolver antes de escribir la migración:** `06` §4 define un `channels`
con una columna `credenciales jsonb` "cifrado en columna"; `02` §7.8 define
`private.meta_credentials`. Son dos diseños distintos para el mismo dato. Esta fase
implementa el de `02` por ser el más restrictivo — el esquema `private` no lo publica la
API de Supabase, así que ninguna política mal escrita puede filtrar ni el ciphertext — y
`06` §4 se corrige en consecuencia. Queda anotado en preguntas abiertas por si Gabriel
prefiere lo contrario.

*Aceptación:* `select * from public.channels` y `select * from public.meta_connections`
ejecutados con el rol `authenticated` de un miembro de la organización no devuelven
ningún token ni ningún ciphertext. Un `pg_dump` del esquema `public` no contiene material
de token.

**T8. Nunca registrar un token en un log.**

Los ejemplos de Meta pasan el token en la query string. El cliente HTTP no registra URLs
completas, y el manejador de errores recorta cualquier cadena que contenga `access_token=`
antes de escribirla.

*Aceptación:* un test inyecta un error de Graph API con el token en la URL y comprueba
que la cadena del token no aparece en la salida de log.

**T9. Rotación y verificación de salud del token.**

No hay endpoint de refresco del BISU: se renueva reautorizando. La estrategia es
verificación proactiva, no refresco periódico.

- Cron diario: `GET /v26.0/debug_token?input_token=<token>&access_token=<APP_ID>|<APP_SECRET>`
  por conexión. Escribe `token_last_verified_at`.
- Rotación de la clave de cifrado: perezosa, por `kid`. Se cifra con la clave nueva al
  siguiente escritura de cada fila; un job de fondo recorre lo que quede.
- Botón "Reconectar" en la interfaz que rehace el flujo de Facebook Login for Business.

"No expira" no significa "no se invalida". Un token sin fecha de caducidad muere igual
cuando el cliente revoca la app, cuando la persona que autorizó pierde su rol, con un
cambio de contraseña, o cuando Meta restringe la app.

*Aceptación:* revocar la app desde los ajustes de negocio de una cuenta de prueba deja la
conexión en estado `desconectado` en menos de 24 horas sin intervención manual, y antes si
hubo un intento de envío.

### Bloque C — Suscripción a webhooks

**T10. Suscribir la app a los webhooks de la Página.**

`POST /v26.0/{page_id}/subscribed_apps` con `subscribed_fields`. Requiere
`pages_manage_metadata`.

Dos hechos medidos que hay que respetar en el código:

- **`/subscribed_apps` no acepta el token de system user.** Devuelve error 190 subcode
  2069032: *"En la nueva experiencia para páginas, se necesita un token de acceso a la
  página"*. Hay que derivar el Page Access Token primero (`04` §2.4).
- Sin `pages_manage_metadata` devuelve `(#200) Requires pages_manage_metadata permission
  to manage the object` (`04` §2.2). Ese error se traduce a un mensaje de interfaz que
  dice qué falta, no a un genérico.

Los nombres de `subscribed_fields` tienen discrepancia entre páginas oficiales de Meta:
`messaging_referral` frente a `messaging_referrals`, `messaging_handover` frente a
`messaging_handovers`, `message_reactions` frente a `messaging_reactions`. **No se
adivinan.** Ver C3.

*Aceptación:* tras el alta, `GET /v26.0/{page_id}/subscribed_apps` devuelve la app de
Kavea con el conjunto de campos esperado, y ese conjunto se persiste en
`subscribed_fields_messenger` y `subscribed_fields_instagram`.

**T11. Reconciliador de suscripciones cada 15 minutos.**

Meta desuscribe la app de una Página tras **una hora** de entregas fallidas, en silencio y
por cliente. Una caída de una hora no degrada Kavea: la apaga por cliente y sin avisar.

El job recorre las conexiones, llama a `GET /{page_id}/subscribed_apps`, re-suscribe lo
que falte y alerta a Boosty. Es el detector de referencia, por encima de cualquier
callback: un token revocado, una desuscripción automática y un cliente que apagó "Permitir
acceso a mensajes" producen los tres el mismo síntoma —dejan de llegar eventos— y ninguno
emite un error.

La implementación es **`pg_cron` con `pg_net`** para la llamada HTTPS saliente. El `02` §5.2
lo ponía en un Cron Trigger de Cloudflare para separar el dominio de fallo, pero Cloudflare
salió de la arquitectura: ver `06` §1.1.

Lo que se pierde con ese cambio, dicho sin adornos: el cron vive dentro de la base que puede
caerse. El contraargumento es que durante una caída no podría hacer su trabajo de todos modos,
porque necesita leer los tokens de esa misma base; lo que importa es que cure al recuperarse,
y para eso `pg_cron` sirve. Lo que sí queda sin cubrir es una caída del proyecto de Supabase
entero, y de eso avisa el vigilante externo en Netlify que define la fase 1.

*Aceptación:* desuscribir la app a mano desde el dashboard de una Página de prueba produce
re-suscripción automática y una alerta interna en menos de 20 minutos.

### Bloque D — Validación por API

**T12. Motor de validaciones con resultado por comprobación.**

Un booleano global no sirve para nada: lo que hace útil el asistente es decir cuál de las
siete comprobaciones falló. Cada una devuelve `ok | fallo | no_verificable` más el texto
de la causa.

| # | Comprobación | Llamada | Qué prueba | Si falla |
|---|---|---|---|---|
| V1 | La Página existe y el usuario tiene acceso | `GET /me/accounts?fields=id,name,tasks,access_token` | Que hay al menos una Página delegada | El cliente no seleccionó activos en el diálogo |
| V2 | Tarea correcta sobre la Página | array `tasks` de V1 | Que quien autorizó puede gestionar mensajes | Aviso, no bloqueo. Ver C1 |
| V3 | Cuenta profesional de Instagram vinculada | `GET /{page_id}?fields=instagram_business_account,username` | El requisito no negociable de v1 | **Bloqueo** si el canal pedido es Instagram |
| V4 | Page Access Token derivado y válido | `GET /debug_token` | Que el token sirve y con qué scopes | Bloqueo |
| V5 | Webhooks suscritos | `GET /{page_id}/subscribed_apps` | Que Meta entregará eventos | Bloqueo |
| V6 | Default application de Conversation Routing | `GET /me?fields=messaging_feature_status` → `{hop_v2, msgr_multi_app, ig_multi_app}` | Que la Página no está en modo Default Behavior | Bloqueo, con instrucciones |
| V7 | Llega un mensaje real | webhook entrante | Todo lo anterior junto, incluido el toggle | Bloqueo, con árbol de diagnóstico |

*Aceptación:* el resultado de las siete comprobaciones se persiste con marca de tiempo y
se puede volver a ejecutar desde la interfaz sin rehacer el OAuth.

**Hecho.** Migraciones 0050 a 0053, `functions/diagnosticar`, `/ajustes/canales`, cron diario.
Primera pasada real sobre la Página de Boosty el 2 de agosto de 2026: **5 en verde, 0 en rojo,
2 sin saber** (V2 y V6). De esa pasada salieron cuatro invariantes nuevos en `03`, entre ellos
el cierre de C3.

Dos correcciones que salieron de correrlo, no de leerlo:

- `tasks` no existe en el nodo de la Página. Pedirlo tumbaba la respuesta ENTERA, y con ella V1,
  V3 y V6. Ahora se guarda al conectar en `meta_connections.tasks`, y V2 lee de ahí. Para las
  conexiones sembradas a mano es `no_verificable`, que es la verdad.
- El diagnosticador buscaba `KAVEA_APP_ID` y `KAVEA_APP_SECRET`, que no existen: el receptor de
  webhooks ya usa `META_APP_ID` y `META_APP_SECRET` para verificar la firma. Dos variables con el
  mismo secreto dentro es una de ellas sin rotar el día que toque.

**T13. Requisito no negociable de v1: Página vinculada.**

Si `instagram_business_account` viene vacío y el cliente pide Instagram, el asistente
**bloquea**. No se soportan clientes solo-Instagram: soportarlos exigiría una segunda app
de Meta con su propio App Review y su propia Access Verification (`03` §`invariantes`).

El mensaje al cliente explica qué hay que hacer, no dice "error". La razón técnica no le
interesa; la acción sí.

*Aceptación:* una cuenta profesional de Instagram sin Página vinculada no puede completar
el asistente, y el mensaje que ve el operador nombra el paso que falta.

**T14. Validar la tarea sobre la Página sin rechazar clientes válidos.**

Se lee el array `tasks` de `GET /me/accounts`. La regla de implementación es **aceptar la
unión** `{MESSAGING, MODERATE, MANAGE}` y **no rechazar nunca por ausencia sola**: se
emite un aviso y se deja continuar hasta V7, que es el árbitro real. Rechazar por ausencia
de un valor concreto descartaría clientes válidos, y las fuentes no coinciden en cuál es
el valor concreto. Ver C1.

*Aceptación:* una Página cuyo array `tasks` no contiene ninguno de los tres valores
produce aviso visible y permite continuar; una Página con solo `ANALYZE` y `ADVERTISE`
—el caso real de Caracas Music Hall en `04` §2.3— llega hasta V7 y falla ahí con causa
identificada, no antes con causa inventada.

**T15. Árbol de diagnóstico diferencial del fallo silencioso.**

**El toggle "Permitir acceso a mensajes" no es verificable por API** en el material
disponible. No hay campo que lo exponga. El único detector es V7. Por eso la utilidad del
asistente no está en detectarlo directamente sino en **descartar todo lo demás**:

```
No llega ningún mensaje en la prueba de extremo a extremo
   │
   ├─ V5 falla (la app no aparece en subscribed_apps)
   │     → causa: suscripción. Re-suscribir. No es el toggle.
   │
   ├─ V4 falla (debug_token inválido, o error 190 en cualquier llamada)
   │     → causa: token. Reconectar. No es el toggle.
   │
   ├─ V6 falla (sin default application)
   │     → causa: Conversation Routing. Los eventos pueden estar yendo
   │       a otra app conectada. Configurar y repetir.
   │
   ├─ El mensaje aparece en entry[].standby[] y no en entry[].messaging[]
   │     → causa: otra app posee el hilo, típicamente la bandeja de
   │       Meta Business Suite. No es el toggle.
   │
   └─ V4, V5 y V6 pasan, y no llega absolutamente nada
         → CAUSA RESIDUAL: el toggle "Permitir acceso a mensajes"
           está apagado. Es el único estado compatible con todo lo
           anterior en verde y silencio total.
```

*Aceptación:* apagar el toggle en una cuenta de prueba con todo lo demás correcto lleva al
asistente a la hoja "causa residual" del árbol, con la captura de la ruta del ajuste, en
menos de dos minutos desde la prueba.

### Bloque E — Conversation Routing

**T16. Paso obligatorio de default application, verificable.**

**Conversation Routing, no Handover Protocol.** El nombre viejo está muerto: *"Meta no
longer supports Handover Protocol for Messenger and all the businesses are migrated to
Conversation Routing"*. El modelo es default application y thread owner con estados Idle
y Active.

Si el cliente no designa una default application, la Página opera en modo **Default
Behavior**: todas las apps conectadas reciben los webhooks y pueden responder al mismo
mensaje, y además *"The Take Thread Control API is blocked unless a default application
is set"*. Ese modo no es soportado por Kavea.

Es una acción manual del cliente en los ajustes de su Página. **Kavea no puede ejecutarla
por API.** Se valida con `GET /me?fields=messaging_feature_status`.

La ruta exacta del menú no está confirmada: las fuentes dan tres rutas distintas —pestaña
*Conversation Routing* en la configuración de la Página, *Page Setup > Instagram
Conversation Routing*, y *Settings > Advanced Messaging > Handover Protocol*— y Meta
cambia esa interfaz. Antes de escribir este paso hay que abrirla en una cuenta real y
capturar pantallas. Ver C5.

*Aceptación:* el tenant no pasa a `conectado` mientras V6 no dé verde, y la pantalla
muestra la captura de la ruta vigente con fecha de captura.

**T17. Reconocer `primary_receiver` en el parser.**

El modelo conceptual ya no usa primary receiver y secondary receiver, pero **el string
sigue llegando en vivo**: el sub-evento `app_roles` emite payloads como
`"app_roles":{"123456789":["primary_receiver"]}`. El parser lo reconoce y lo persiste.
Ignorarlo porque "eso está deprecado" pierde el evento que dice quién manda.

Esto no aparece en desarrollo, donde hay una sola app conectada. Aparece el día que un
cliente real abre Meta Business Suite.

*Aceptación:* un payload de `app_roles` con `primary_receiver` se persiste y actualiza el
estado de propiedad de la conversación. Hay un test con el payload literal.

**T18. Los seis endpoints, no tres.**

En esta fase se implementa el cliente de los seis y se consume `thread_owner` en el
diagnóstico. Su uso desde la bandeja es de otra fase; el módulo de configuración necesita
poder responder "¿quién posee este hilo?" cuando el cliente reclama que Kavea no contesta.

| Endpoint | Para qué |
|---|---|
| `POST /{PAGE_ID}/pass_thread_control` | Entregar el hilo a otra app |
| `POST /{PAGE_ID}/release_thread_control` | Soltar el hilo. Vuelve a Idle o a la default application |
| `POST /{PAGE_ID}/take_thread_control` | Tomar el control. Bloqueado sin default application |
| `POST /{PAGE_ID}/request_thread_control` | Pedir el control a quien lo tiene |
| `POST /{PAGE_ID}/extend_thread_control` | `duration` en segundos, hasta 7 días |
| `GET /{PAGE_ID}/thread_owner?recipient=<PSID>` | Consulta puntual y barata de quién posee un hilo |

`extend_thread_control` **no se presenta como sustituto de la feature Human Agent.** Que
extender el control del hilo extienda también la ventana de mensajería a efectos de
política es una inferencia, no un hecho.

*Aceptación:* existe una función por endpoint, con firma tipada, y `thread_owner` está
cableado en la pantalla de detalle de canal.

### Bloque F — Estados de conexión y recuperación

**T19. Máquina de estados por `(organization_id, canal)`.**

```
  sin_conectar
       │ el operador abre el asistente
       ▼
  en_configuracion ──────┐  el asistente se abandona a medias
       │ OAuth ok         │  → vuelve a sin_conectar a las 24 h
       ▼                  │
  verificacion_pendiente ─┘  V1–V6 en verde, V7 sin pasar
       │ llega el primer mensaje real
       ▼
  conectado ◄──────────────────────────────┐
       │                                    │
       ├─► degradado    códigos 4, 17, 32, 613, 80001, 80002, 80006
       │                envío pausado hasta estimated_time_to_regain_access
       │                ingesta sigue. No se reintenta durante el bloqueo
       │                                    │
       ├─► desconectado error 190, o debug_token inválido, o la app no
       │                aparece en subscribed_apps
       │                envío PARADO. Un solo reintento y después nada
       │                bandeja en solo lectura, enlace de reconexión
       │                                    │
       └─► suspendido   kill-switch manual por canal y tenant, o
                        restricción de la app entera por parte de Meta
                        el envío encola en vez de fallar
```

El código 230 no entra en `degradado`: es consentimiento de perfil no otorgado, es normal,
se ignora.

**Ninguna transición borra mensajes.** Un token muerto degrada el envío, nunca la ingesta
ni el histórico.

**La alerta va primero a Boosty, no al cliente.** El cliente se entera por su agencia, no
por un producto que dejó de responder.

`02` §7.2 define el `check` de `estado` con solo `connected | degraded | disconnected`.
Esta fase lo amplía con los tres estados de alta y con `suspendido`, en una migración. Una
sola columna, una sola máquina de estados: un `onboarding_estado` separado se
desincroniza el primer día.

*Aceptación:* cada transición queda registrada con causa y marca de tiempo, y existe un
test por transición que la dispara con el código de error correspondiente.

**T20. Qué hace la interfaz en cada estado.**

- `degradado`: banner ámbar con la hora estimada de recuperación. El compositor sigue
  activo pero encola. La bandeja no cambia.
- `desconectado`: banner rojo, compositor deshabilitado **con el motivo escrito**, no con
  un error genérico de envío, y botón "Reconectar" que rehace el flujo de Facebook Login
  for Business con el mismo `config_id`.
- `suspendido`: banner con el texto de kill-switch. El envío encola. Si es una restricción
  de Meta sobre la app entera, el banner lo dice: no se puede prometer SLA sobre algo que
  controla Meta.

*Aceptación:* los tres estados se pueden forzar desde el panel interno y la interfaz del
tenant responde a los tres sin recargar la página.

### Bloque G — Vías de alta

**T21. Soportar las dos vías de alta.**

No todos los clientes pasan por el diálogo de OAuth.

- **Vía A, activo asignado.** Las 28 Páginas de clientes de Boosty ya están asignadas al
  Business Manager de Boosty, 27 con Instagram vinculado y con la tarea de mensajería
  concedida (`04` §2). Para ellas el alta es una selección de Página desde el panel
  interno, sin diálogo de cliente. La capa de acceso ya existe.
- **Vía B, OAuth con Facebook Login for Business.** Para clientes cuyo activo no está
  asignado a Boosty. Es la vía que exige Access Verification y App Review con Advanced
  Access.

Ambas convergen en el mismo estado final: mismas validaciones V1–V7, misma suscripción de
webhooks, misma máquina de estados. Lo que cambia es de dónde sale el token.

**Advertencia:** la hipótesis de `04` §5 —que los 28 clientes actuales podrían no necesitar
App Review por estar gestionados por Boosty— **no está confirmada** y no debe presentarse
como hecho. La vía A se construye porque el acceso al activo ya está probado; que además
evite el App Review es una apuesta a verificar, no un supuesto de diseño.

*Aceptación:* una Página dada de alta por la vía A y otra por la vía B terminan con filas
indistinguibles en `meta_connections` salvo por la columna que registra la vía.

**T22. Enlace de conexión firmado.**

El asistente lo conduce Boosty, pero el diálogo de Facebook lo tiene que completar una
persona con la tarea correcta sobre la Página del cliente. Obligar a que Gabriel y el
cliente estén en la misma pantalla a la misma hora es fricción evitable.

Se genera un enlace firmado, de un solo uso, con caducidad de 72 horas, que abre solo el
paso de OAuth para una organización y un canal concretos. Al completarse, el asistente de
Boosty avanza solo.

*Aceptación:* el enlace caducado, reutilizado o alterado devuelve 400. El enlace válido no
requiere sesión de Kavea y no expone ningún dato del tenant más allá del nombre de la
organización.

### Bloque H — WhatsApp

**T23. Pantalla de expectativas de WhatsApp, con la asimetría por escrito.**

Esta es la tarea que evita una promesa comercial que Meta no permite cumplir.

**Para Instagram y Messenger los trámites son de Boosty. El cliente no verifica nada.**
En WhatsApp es al revés: **cada cliente tiene su propio portafolio de negocio y su
verificación condiciona sus límites**, de mensajería (250 → 2.000 → 10.000 → 100.000 →
ilimitado) y de plantillas (250 sin verificar; 6.000 con el portafolio verificado **y
además** al menos un número con display name aprobado).

La pantalla dice esto en lenguaje de cliente, sin adornos, y registra en qué punto del
trámite propio está cada cliente. No promete fechas: no hay SLA publicado de Business
Verification y los reportes van de 12 días a más de dos meses.

Tampoco promete Partner-led Business Verification: existe, pero es exclusiva de WhatsApp,
solo para Solution Partners de nivel Select y Premier, con tope de 3 envíos por cliente, y
**Boosty no califica de entrada**.

*Aceptación:* la pantalla existe, está enlazada desde el panel de canales, y ningún texto
de la interfaz ni del material comercial afirma que Kavea conecta WhatsApp sin trabajo del
cliente. Hay una revisión explícita de copys con esa lista de comprobación.

### Bloque I — Configuración de la organización

**T24. Pantalla de datos de la organización.**

Nombre, `slug` —que determina el subdominio `slug.kavea.ai`—, zona horaria e idioma. El
`slug` es `citext unique`: cambiarlo rompe enlaces guardados, así que el cambio pide
confirmación explícita y registra el valor anterior.

*Aceptación:* cambiar el `slug` deja el subdominio anterior devolviendo una redirección al
nuevo durante al menos 30 días, o el cambio se bloquea. Una de las dos, decidida y
documentada, no ambas a medias.

**T25. Miembros y roles.**

Tres roles, ya definidos en `06` §4: `propietario`, `admin`, `agente`.

| Acción | propietario | admin | agente |
|---|---|---|---|
| Ver la bandeja y responder | Sí | Sí | Sí |
| Conectar y desconectar canales | Sí | Sí | No |
| Ejecutar el asistente de conexión | Sí | Sí | No |
| Invitar y expulsar miembros | Sí | Sí | No |
| Cambiar roles | Sí | No | No |
| Cambiar datos de la organización | Sí | Sí | No |
| Transferir la propiedad | Sí | No | No |

Reglas duras: siempre hay al menos un `propietario`; un `propietario` no puede degradarse
a sí mismo si es el único; expulsar a un miembro no borra sus mensajes ni sus asignaciones
históricas, las reasigna.

La invitación va por correo con `support@kavea.ai` vía Resend, con enlace firmado y
caducidad de 7 días.

*Aceptación:* las siete filas de la tabla tienen un test que comprueba que el rol inferior
recibe 403, tanto en la interfaz como en la ruta de API. Probar solo la interfaz no prueba
nada: la frontera real es RLS más la comprobación de rol en el servidor.

**T26. Acceso del panel interno de Boosty.**

El admin ve metadatos siempre y contenido nunca por defecto (`06` §6). Desde el panel
interno se ve el estado de conexión de todos los tenants, se fuerza una reconciliación, se
acciona el kill-switch por canal y tenant, y se abre un `access_grant` con motivo escrito
y caducidad.

*Aceptación:* un miembro de `staff` sin `access_grant` vigente que consulta `messages` de
una organización recibe cero filas. Hay un test de RLS que lo prueba directamente contra
la base, no a través de la interfaz.

---

## 5. Flujo del asistente, paso a paso

Ocho pasos. Los pasos 2, 4 y 6 son los que salvan el 80 %.

### Paso 0 — Requisitos previos

Kavea no hace nada todavía. Comprueba con el cliente, con capturas, que existen las cuatro
condiciones. Es una lista de verificación humana porque **ninguna de las cuatro es
consultable por API antes de tener un token**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Conectar Instagram y Messenger                          Paso 1 de 8     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Antes de empezar                                                        │
│                                                                          │
│  Cuatro cosas tienen que estar listas en las cuentas del cliente. Si     │
│  falta alguna, la conexión se completa y no llega ni un mensaje.         │
│                                                                          │
│  [ ] 1. La cuenta de Instagram es profesional                            │
│         Instagram > Configuración > Tipo de cuenta                       │
│                                          [ Ver captura ]                 │
│                                                                          │
│  [ ] 2. Hay una Página de Facebook vinculada a esa cuenta                │
│         Obligatorio. Sin Página no hay conexión en Kavea.                │
│                                          [ Ver captura ]  [ Por qué ]    │
│                                                                          │
│  [ ] 3. El toggle "Permitir acceso a mensajes" está activado             │
│         Instagram > Configuración > Mensajes y respuestas a              │
│         historias > Controles de mensajes > Herramientas conectadas      │
│                                          [ Ver captura ]                 │
│                                                                          │
│  [ ] 4. Quien va a autorizar administra la Página                        │
│         Necesita permiso de mensajes sobre la Página, no solo sobre      │
│         la cuenta de Instagram.                                          │
│                                          [ Ver captura ]                 │
│                                                                          │
│                                    [ Cancelar ]   [ Continuar ]          │
└──────────────────────────────────────────────────────────────────────────┘
```

El botón "Por qué" del punto 2 abre el texto que explica el requisito no negociable de v1
sin jerga: *"Instagram no permite gestionar mensajes de empresa sin una Página de Facebook
asociada. Es un requisito de Meta, no de Kavea."*

### Paso 1 — Elegir canales

El cliente elige Instagram, Messenger o los dos. La pantalla advierte de los dos diálogos.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Conectar Instagram y Messenger                          Paso 2 de 8     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ¿Qué canales conectamos?                                                │
│                                                                          │
│   [x]  Instagram Direct                                                  │
│   [x]  Facebook Messenger                                                │
│                                                                          │
│  Meta exige autorizar cada canal por separado, con los permisos          │
│  mínimos de cada uno. Vas a ver dos ventanas de Facebook seguidas.       │
│  La segunda es más rápida: el negocio ya queda seleccionado.             │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────   │
│  ¿WhatsApp? Va por otro camino y lo tramita tu empresa.                  │
│                                                    [ Ver requisitos ]    │
│                                                                          │
│                              [ Atrás ]   [ Autorizar en Facebook ]       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Paso 2 — Diálogo de Facebook Login for Business, canal 1

`GET /api/meta/oauth/start?canal=instagram&org=<id>` emite el 302 al diálogo con
`config_id`. El cliente elige el portafolio de negocio desde el que autoriza y selecciona
los activos: su Página y su cuenta de Instagram. Ahí ocurre la delegación explícita.

Si el operador de Boosty no está con el cliente, aquí se genera el enlace firmado de T22.

### Paso 3 — Diálogo de Facebook Login for Business, canal 2

Igual, con el otro `config_id`. Se omite si el cliente eligió un solo canal.

### Paso 4 — Validación automática

Kavea ejecuta V1 a V6 y muestra el resultado comprobación por comprobación. Nada de un
spinner con "verificando".

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Conectar Instagram y Messenger                          Paso 5 de 8     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Comprobaciones                                                          │
│                                                                          │
│  [✓]  Página encontrada                                                  │
│       Boosty.digital · 1790677317841377                                  │
│                                                                          │
│  [✓]  Cuenta de Instagram vinculada                                      │
│       @boosty.digital                                                    │
│                                                                          │
│  [~]  Permisos sobre la Página                                           │
│       Kavea no reconoce el permiso de mensajes en esta Página.           │
│       Seguimos: la prueba final del paso 8 lo confirma de verdad.        │
│                                                                          │
│  [✓]  Credenciales válidas                                               │
│                                                                          │
│  [✓]  Webhooks suscritos                                                 │
│       messages, message_echoes, messaging_postbacks, standby             │
│                                                                          │
│  [✗]  Aplicación por defecto sin configurar                              │
│       Tu Página está en modo abierto: cualquier herramienta              │
│       conectada puede responder al mismo mensaje.                        │
│                                          [ Cómo se arregla ]             │
│                                                                          │
│                              [ Reintentar ]   [ Continuar ]              │
└──────────────────────────────────────────────────────────────────────────┘
```

El aviso ámbar de permisos es deliberado: `03` §`inciertos` obliga a no rechazar por
ausencia del valor de tarea, porque las fuentes no coinciden y rechazar descartaría
clientes válidos.

### Paso 5 — Aplicación por defecto (Conversation Routing)

Acción manual del cliente. Kavea no puede ejecutarla por API. El texto es el de `02` §9.6,
que ya está redactado para el cliente y no para un ingeniero.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Conectar Instagram y Messenger                          Paso 6 de 8     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Tu bandeja de Meta y Kavea no pueden mandar las dos a la vez            │
│                                                                          │
│  Facebook e Instagram solo dejan que una herramienta sea la              │
│  responsable de cada conversación. Si no eliges cuál, las dos            │
│  responden al mismo mensaje y tu cliente recibe dos respuestas.          │
│                                                                          │
│  Necesitamos que designes a Kavea como aplicación por defecto en la      │
│  configuración de tu Página. Es un ajuste que solo puedes hacer tú:      │
│  nosotros no podemos activarlo por ti.                                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  [ captura de la ruta del menú, con fecha de captura ]          │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Después puedes seguir usando la bandeja de Meta cuando quieras. Si      │
│  respondes desde ahí, Meta le pasa el control de esa conversación a      │
│  la bandeja de Meta y Kavea deja de poder contestar en ese hilo. Lo      │
│  vas a ver marcado: la conversación aparece como "gestionada fuera       │
│  de Kavea" y el cuadro de respuesta queda desactivado. Los mensajes      │
│  se siguen viendo y el agente de IA no interviene ahí.                   │
│                                                                          │
│                        [ Ya lo configuré — comprobar ]                   │
└──────────────────────────────────────────────────────────────────────────┘
```

"Ya lo configuré" vuelve a llamar a `GET /me?fields=messaging_feature_status`. No se
avanza por declaración del cliente: se avanza por respuesta de la API.

### Paso 6 — Prueba de extremo a extremo

Es el único paso que valida el toggle de mensajes. Hasta que pasa, la conexión no se marca
como activa.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Conectar Instagram y Messenger                          Paso 7 de 8     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Última prueba                                                           │
│                                                                          │
│  Manda un mensaje directo a @boosty.digital desde una cuenta             │
│  personal, no desde la cuenta de la empresa.                             │
│                                                                          │
│         ◌  Esperando el primer mensaje…                    01:47         │
│                                                                          │
│  Repite lo mismo en Messenger cuando termines con Instagram.             │
│                                                                          │
│                                            [ No llega nada ]             │
└──────────────────────────────────────────────────────────────────────────┘
```

"No llega nada" abre el árbol de diagnóstico de T15:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Diagnóstico                                                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Revisamos todo lo demás y está correcto:                                │
│                                                                          │
│    [✓] Credenciales válidas          [✓] Webhooks suscritos              │
│    [✓] Aplicación por defecto        [✓] Nada llegando por otra vía      │
│                                                                          │
│  Solo queda una causa posible.                                           │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  El toggle "Permitir acceso a mensajes" está apagado en         │     │
│  │  Instagram. Es el fallo más común de esta integración y no      │     │
│  │  produce ningún error: la conexión parece correcta y los        │     │
│  │  mensajes no salen del teléfono.                                │     │
│  │                                                                  │     │
│  │  Instagram > Configuración > Mensajes y respuestas a historias  │     │
│  │  > Controles de mensajes > Herramientas conectadas               │     │
│  │                                                                  │     │
│  │  [ captura ]                                                     │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│                          [ Ya lo activé — reintentar prueba ]            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Paso 7 — Activación

La conexión pasa a `conectado`. Se muestra qué queda fuera, en voz clara: la bandeja
arranca vacía.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Conectar Instagram y Messenger                          Paso 8 de 8     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ●  Instagram Direct     conectado      @boosty.digital                  │
│  ●  Facebook Messenger   conectado      Boosty.digital                   │
│                                                                          │
│  Dos cosas que conviene saber desde hoy                                  │
│                                                                          │
│  · Tu bandeja empieza vacía. Meta no permite descargar el histórico      │
│    de conversaciones anteriores. A partir de ahora se guarda todo.       │
│                                                                          │
│  · Si respondes desde la app de Meta, esa conversación pasa a estar      │
│    gestionada fuera de Kavea hasta que la sueltes.                       │
│                                                                          │
│                                              [ Ir a la bandeja ]         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Panel de canales, después del alta

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Canales                                          Organización: Boosty   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ●  Instagram Direct                                        Conectado    │
│     @boosty.digital · Página Boosty.digital                              │
│     Webhooks verificados hace 6 min · Último mensaje hace 12 min         │
│                                        [ Detalle ]  [ Reconectar ]       │
│                                                                          │
│  ◐  Facebook Messenger                                      Degradado    │
│     Página Boosty.digital                                                │
│     Límite de uso alcanzado (código 80006). El envío se reanuda a las    │
│     14:35. La recepción no está afectada.                                │
│                                        [ Detalle ]                       │
│                                                                          │
│  ✗  Instagram Direct — Cliente Ejemplo                   Desconectado    │
│     Meta invalidó las credenciales el 2 ago a las 09:14 (error 190).     │
│     El envío está detenido. Los mensajes entrantes se siguen             │
│     guardando y el histórico está completo.                              │
│                                        [ Detalle ]  [ Reconectar ]       │
│                                                                          │
│  ○  WhatsApp                                             Sin conectar    │
│     Requiere trámites a nombre de tu empresa.                            │
│                                        [ Ver requisitos ]                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Pantalla de WhatsApp

```
┌──────────────────────────────────────────────────────────────────────────┐
│  WhatsApp — qué hace falta                                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Instagram y Messenger los tramita Boosty. WhatsApp no.                  │
│                                                                          │
│  Meta exige que cada empresa tenga su propio portafolio de negocio       │
│  para WhatsApp y que lo verifique a su nombre. No es una preferencia     │
│  nuestra ni algo que podamos hacer por ti.                               │
│                                                                          │
│  Lo que depende de esa verificación:                                     │
│                                                                          │
│    Mensajes por día      250 → 2.000 → 10.000 → 100.000 → sin límite    │
│    Plantillas            250 sin verificar                               │
│                          6.000 con el portafolio verificado y al menos   │
│                          un número con nombre para mostrar aprobado      │
│                                                                          │
│  Pasos, en este orden:                                                   │
│                                                                          │
│    [ ] 1. Crear el portafolio de negocio de tu empresa                   │
│    [ ] 2. Completar la verificación de negocio                           │
│    [ ] 3. Registrar el número en WhatsApp Business Platform              │
│    [ ] 4. Aprobar el nombre para mostrar                                 │
│    [ ] 5. Darnos acceso desde Kavea                                      │
│                                                                          │
│  Los plazos de la verificación los fija Meta y no los controlamos.       │
│  Lo que sí hacemos es acompañarte en cada paso.                          │
│                                                                          │
│                                              [ Empezar el trámite ]      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Configuración de la organización

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Configuración                                                           │
│  [ Organización ]  [ Miembros ]  [ Canales ]                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Nombre         [ Boosty Digital                            ]            │
│  Subdominio     [ boosty          ] .kavea.ai                            │
│                 Cambiarlo rompe los enlaces guardados.                   │
│  Zona horaria   [ America/Caracas                        ▾ ]             │
│  Idioma         [ Español                                ▾ ]             │
│                                                                          │
│                                                    [ Guardar ]           │
├──────────────────────────────────────────────────────────────────────────┤
│  Miembros                                        [ + Invitar miembro ]   │
│                                                                          │
│   Gabriel Montiel      gmontiel@spatiumgroup.com   Propietario      ⋯    │
│   María Pérez          maria@boosty.digital        Admin            ⋯    │
│   Carlos Ruiz          carlos@boosty.digital       Agente           ⋯    │
│   pendiente            ana@boosty.digital          Agente · invit.  ⋯    │
│                                                                          │
│  Propietario  Todo, incluido cambiar roles y transferir la propiedad     │
│  Admin        Conecta canales, invita miembros, edita la organización    │
│  Agente       Ve la bandeja y responde                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Tabla de permisos por canal

Dos configuraciones de Facebook Login for Business. La columna "estado de la evidencia"
importa tanto como las otras: un permiso incluido por una dependencia en disputa no se
trata igual que uno que Kavea invoca directamente.

### Configuración `kavea-instagram`

| Permiso | Por qué está | Dependencia declarada de | Estado de la evidencia |
|---|---|---|---|
| `pages_show_list` | `GET /me/accounts`, raíz del grafo | — | Confirmado |
| `pages_read_user_content` | Dependencia de `instagram_basic`. Kavea no lo invoca | — | Confirmado como dependencia; sin confirmar si lleva submission propio |
| `instagram_basic` | Lectura de la cuenta profesional vinculada | `pages_read_user_content` + `pages_show_list` | Confirmado |
| `pages_read_engagement` | Dependencia de `instagram_manage_messages` | `pages_show_list` | Confirmado |
| `instagram_manage_messages` | Habilita la bandeja de Instagram | `instagram_basic` + `pages_read_engagement` + `pages_show_list` | Confirmado |
| `pages_manage_metadata` | `POST /{page-id}/subscribed_apps` | `pages_show_list` | Confirmado |
| `business_management` | Solo si C2 demuestra que el diálogo lo exige | **En disputa** | Dos páginas oficiales de Meta se contradicen. Ver C2 |

### Configuración `kavea-messenger`

| Permiso | Por qué está | Dependencia declarada de | Estado de la evidencia |
|---|---|---|---|
| `pages_show_list` | `GET /me/accounts`, raíz del grafo | — | Confirmado |
| `pages_manage_metadata` | `POST /{page-id}/subscribed_apps`. Requiere token pedido por alguien con `CREATE_CONTENT`, `MANAGE` o `MODERATE` | `pages_show_list` | Confirmado |
| `pages_messaging` | Send API, Conversations API, los seis endpoints de Conversation Routing. Su alcance se amplió en 2026 para incluir llamadas de voz | `pages_manage_metadata` + `pages_show_list` | Confirmado |
| `pages_read_engagement` | Candidato a eliminar de esta configuración: el grafo no lo cuelga de `pages_messaging` | `pages_show_list` | A decidir con C7 |
| `business_management` | Solo si C2 demuestra que el diálogo lo exige | **En disputa** | Ver C2 |

### Grafo de dependencias

```
pages_show_list                          (raíz, sin dependencias propias)
├── pages_read_engagement
│   └── business_management              (+ pages_show_list)   [en disputa]
├── pages_read_user_content
│   └── instagram_basic                  (+ pages_show_list)
│       └── instagram_manage_messages    (+ pages_read_engagement + pages_show_list)
└── pages_manage_metadata
    └── pages_messaging                  (+ pages_show_list)
```

### Fuera de las configuraciones, a propósito

- **Feature Human Agent.** No es un permiso. Se somete a App Review aparte, con su propio
  screencast. No se selecciona en una configuración de login.
- **`instagram_business_basic`, `instagram_business_manage_messages`,
  `instagram_business_manage_comments`, `instagram_business_content_publish`.**
  Prohibidos: son de la vía Instagram Login, descartada por app y de forma irreversible.
  Si aparecen en una configuración, esa configuración está mezclando las dos vías.
- **`page_utility_messaging`**, **`ads_management`**, **`pages_manage_ads`**,
  **`instagram_manage_comments`**, **`instagram_manage_insights`**,
  **`instagram_content_publish`**, **`instagram_manage_engagement`.** Fuera de v1.
- **`whatsapp_business_messaging`, `whatsapp_business_management`.** Otro trámite, otro
  sentido de la verificación. No se piden en v1.

### El requisito que no es un scope

El Page Access Token lo tiene que pedir alguien con la tarea correcta sobre la Página del
cliente. Las fuentes no coinciden y hay una medición empírica que las contradice. Ver C1.
Regla de implementación mientras tanto: **aceptar la unión, avisar por ausencia, no
bloquear nunca por ese motivo**. El árbitro es la prueba de extremo a extremo.

---

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El toggle de mensajes se apaga después del alta | La ingesta muere en silencio y el cliente culpa a Kavea | El reconciliador de 15 min no lo detecta —no hay campo de API—, así que hace falta una alarma por ausencia de tráfico: un canal `conectado` sin un solo evento entrante en N días levanta aviso interno. Calibrar N por cliente, no global |
| Pedir un permiso de más en una configuración | Rechazo del App Review con constancia en el historial de la app | T4 obliga a justificar por escrito cada permiso. C2 y C7 se ejecutan antes de crear las configuraciones definitivas |
| El cliente responde desde Meta Business Suite | Kavea pierde la propiedad del hilo y el compositor se apaga sin explicación | T17 y T18. Además el texto de `02` §9.6 se dice en el alta, no cuando ocurre |
| Access Verification rechazada o caída | Los clientes nuevos no pueden autorizar. Los ya conectados dejan de poder conceder permisos | La vía A de T21 no depende de ella para los 28 activos asignados. El estado de verificación se monitoriza como si fuera uptime |
| Meta restringe la app entera | Todos los tenants caen a la vez, como le pasó a Chatwoot Cloud en julio de 2026 | Kill-switch por canal y tenant, modo degradado que encola, banner. El contrato no promete SLA sobre lo que controla Meta |
| Los nombres de `subscribed_fields` se adivinan mal | Suscripción parcial: llegan unos eventos y otros no, sin error | C3 antes de escribir la llamada. La respuesta de `GET /subscribed_apps` se persiste y se compara contra lo pedido |
| El BISU no sirve para enviar DMs de Instagram | Se cae la estrategia de tokens completa y hay que volver a un token de persona | C4 antes de construir el flujo. La vía de repuesto documentada reintroduce el problema que el BISU resuelve: hay que saberlo antes, no después |
| Dos diálogos consecutivos hacen abandonar el alta | Conexiones a medias en estado `en_configuracion` | Caducidad de 24 h del estado intermedio y enlace firmado de T22 para retomar sin rehacer |
| El cliente cree que WhatsApp viene incluido | Promesa comercial que Meta no permite cumplir | T23, más revisión de copys de la web y del material de venta con esa lista de comprobación |
| El operador de Boosty conecta la Página del cliente A al tenant del cliente B | El peor fallo posible bajo RLS: mensajes de un cliente en la bandeja de otro | `page_id` e `ig_business_account_id` son únicos globales. La segunda conexión falla por constraint, no por validación de aplicación |
| Divergencia de esquema entre `02` §7.8 y `06` §4 | Dos migraciones incompatibles escritas por dos personas distintas | T7 lo cierra en una dirección y corrige el documento perdedor. No se deja "ambas opciones son válidas" |

---

## 8. Definición de terminado

La fase está terminada cuando se cumplen las once, verificadas contra cuentas reales y no
contra mocks.

1. Un canal se conecta de extremo a extremo desde la interfaz, sin ejecutar un solo
   `insert` a mano.
2. Existen dos `config_id` distintos y el diálogo de cada uno muestra en pantalla
   exactamente los permisos de su tabla de la sección 6.
3. La URL literal del diálogo con `config_id` está transcrita en `03-invariantes-meta.md`
   con fecha.
4. Ningún token aparece en texto plano en `public`, ni en un log, ni en un volcado del
   esquema público.
5. Tras el alta, `GET /{page_id}/subscribed_apps` devuelve la app de Kavea, y el
   reconciliador re-suscribe y alerta cuando se desuscribe a mano.
6. Las siete comprobaciones V1–V7 se ejecutan, se persisten y se pueden repetir desde la
   interfaz sin rehacer el OAuth.
7. Apagar el toggle "Permitir acceso a mensajes" en una cuenta de prueba lleva al
   asistente a la hoja "causa residual" del árbol de diagnóstico.
8. Un tenant sin default application no puede pasar a `conectado`, y `messaging_feature_status`
   es lo que lo decide, no una casilla que marca el cliente.
9. Las cuatro transiciones de estado —`degradado`, `desconectado`, `suspendido` y la
   vuelta a `conectado`— se pueden forzar desde el panel interno y la interfaz del tenant
   responde a las cuatro con el motivo escrito.
10. La matriz de roles de T25 tiene un test por fila que comprueba el 403 en la ruta de
    API, no solo en la interfaz.
11. Las comprobaciones C1 a C8 están ejecutadas y `03-invariantes-meta.md` está
    actualizado con sus resultados, fecha y método. Un `incierto` que se cierra se mueve a
    `invariantes`; uno que se confirma como contradicción real se queda donde está con la
    evidencia añadida.

Criterio de avance de `00-documento-base.md` §9: no se pasa de fase con deuda de la
anterior.

---

## 9. Preguntas abiertas

Las que dependen de una decisión de Gabriel, no de una medición.

**Q1. ¿Un canal por configuración o una configuración por combinación?**
Esta fase decide dos configuraciones y dos diálogos consecutivos, porque es la mitigación
documentada del fallo de Chatwoot. El coste es fricción de alta. La alternativa —una
tercera configuración con la unión de permisos para clientes que quieren los dos canales—
reduce a un diálogo y contradice el principio de mínimo por canal. No se implementa sin
una decisión explícita.

**Q2. ¿Dónde vive el material criptográfico?** — **Cerrada el 2-ago-2026.**
`private.meta_credentials` con cifrado en la aplicación y clave en el almacén de secretos
del Worker, tal como fija `02` §7.8. El `channels.credenciales jsonb` del `06` era un error
de ese documento y ya está corregido: el `06` ahora cede ante el `02` en materia de modelo
de datos y lleva tabla de erratas.

**Q3. ¿Dónde corre el reconciliador de 15 minutos?** — **Cerrada el 2-ago-2026.**
`pg_cron` con `pg_net`. El `02` §5.2 lo quería fuera del dominio de fallo de la base, pero
Cloudflare salió de la arquitectura al consolidar en dos proveedores. Se asume que el cron
vive dentro de lo que puede caerse, con el matiz de que durante una caída no podría hacer su
trabajo igualmente porque necesita leer los tokens. La caída del proyecto entero la cubre el
vigilante externo en Netlify de la fase 1.

**Q4. ¿Se cambia el `slug` o no se cambia?**
T24 pide elegir: redirección del subdominio anterior durante 30 días, o bloqueo del
cambio. Media solución es enlaces rotos silenciosos.

**Q5. ¿Qué se le vende al cliente que atiende desde el móvil?**
`02` §9.6 propone configurar Kavea en modo solo lectura para ese cliente. Es una decisión
comercial con consecuencias de producto: si existe un modo solo lectura hay que
construirlo y ponerle precio. Hoy no está en el alcance de esta fase.

**Q6. ¿Cuándo se activa el modo degradado por decisión de Boosty?**
El kill-switch es manual. Falta el criterio escrito de cuándo se acciona y quién lo
acciona: sin él, en una restricción de Meta a las 3 de la mañana nadie sabe si le toca.

---

## 10. Comprobaciones empíricas previas

Contradicciones reales marcadas en `03-invariantes-meta.md` §`inciertos`. **No se resuelven
leyendo más documentación de Meta: las dos páginas oficiales siguen diciendo cosas
distintas.** Se resuelven con una llamada. Cada una cuesta minutos y cada una tiene un
resultado que se escribe en `03` con fecha y método.

**C1. Nombre exacto de la tarea de Página.**
Tres afirmaciones en conflicto:
- `03` §`inciertos` y `02` §3.2: el get-started de Messenger para Instagram exige
  `MODERATE`, la página de send-message exige `MESSAGE`, `MESSAGING` no aparece en ninguna
  de las dos.
- `02` §4 y `04` §2.4: medición del 1 de agosto de 2026 con un token real de system user
  sobre las 28 Páginas de Boosty. El enum devuelto es `ADVERTISE`, `ANALYZE`,
  `CREATE_CONTENT`, `MESSAGING`, `MODERATE`, `MANAGE`, `MANAGE_LEADS`,
  `VIEW_MONETIZATION_INSIGHTS`. `MESSAGE` no existe; `MESSAGING` sí.

Lo que la medición **no** cubre: se hizo con un token de system user del Business Manager
de Boosty, no con un token BISU obtenido a través del diálogo de Facebook Login for
Business, que es la vía de los clientes nuevos. No está establecido que ambas rutas
devuelvan el mismo enum ni el mismo subconjunto.

*Comprobación:* completar el diálogo de Facebook Login for Business con un portafolio de
prueba ajeno a Boosty y llamar a `GET /me/accounts?fields=id,name,tasks` con el token BISU
resultante. Registrar el array `tasks` literal. *Hasta entonces:* aceptar la unión
`{MESSAGING, MODERATE, MANAGE}`, avisar por ausencia, no bloquear.

**C2. ¿`business_management` es dependencia?**
El overview de Messenger Platform dice verbatim *"The business_management permission is a
dependency for pages_messaging, pages_show_list, and instagram_manage_messages"*. La
Permissions Reference lo niega y documenta la relación inversa: `business_management`
depende de `pages_read_engagement` y `pages_show_list`. Dos verificadores abrieron cada
uno su página y ambas citas son literales. Además viene preseleccionado por el use case de
Instagram del App Dashboard.

*Comprobación:* crear dos configuraciones de prueba de Facebook Login for Business,
idénticas salvo por la presencia de `business_management`, y correr el diálogo con un
portafolio de prueba en las dos. Medir tres cosas: si el diálogo devuelve error de scopes,
si `GET /me/accounts` funciona, y si `POST /{page_id}/subscribed_apps` funciona. Si la
configuración sin `business_management` completa el circuito, se retira de las
configuraciones y se mantiene en el submission del App Review por prudencia, que son dos
decisiones separadas.

**C3. Valores que acepta el enum de `subscribed_fields`.**
Discrepancia de nomenclatura entre páginas oficiales: `messaging_referral` frente a
`messaging_referrals`, `messaging_handover` frente a `messaging_handovers`,
`message_reactions` frente a `messaging_reactions`.

*Comprobación:* leer el desplegable del App Dashboard en la sección de webhooks para los
objetos `page` e `instagram`, y contrastar con un `POST /{page_id}/subscribed_apps` con un
valor deliberadamente inválido, cuyo error suele enumerar los válidos. Anotar la lista
literal. Cierra de una sentada varias incógnitas de `02` §14.2.

**C4. ¿El token BISU sirve para enviar DMs de Instagram?**
La doc de Facebook Login for Business lista *"automated messaging responses"* entre los
casos de uso de los business integration system user tokens, y el valor por defecto es no
expirar en comunicación server-to-server offline. Lo que **no** está confirmado es que
funcionen para Instagram Direct en concreto.

*Comprobación:* `GET /debug_token` sobre el token derivado, más un envío real a
`POST /v26.0/me/messages`. De esto depende toda la estrategia de tokens: si falla, la vía
de repuesto es un user token de larga duración, que reintroduce el problema que el BISU
resuelve —el token queda atado a una persona que puede irse de la empresa del cliente.

**C5. Ruta vigente del menú de Conversation Routing.**
Tres rutas distintas en las fuentes: pestaña *Conversation Routing* en la configuración de
la Página, *Page Setup > Instagram Conversation Routing*, y *Settings > Advanced Messaging
> Handover Protocol*. Meta cambia esa interfaz.

*Comprobación:* abrirla en una cuenta real de cada mercado, capturar pantalla y fijar la
ruta con fecha. La captura caduca: se revisa cada trimestre.

**C6. Qué devuelve `messaging_feature_status` y cuál es el valor de "configurado".**
Está confirmado que `GET /me?fields=messaging_feature_status` devuelve
`{hop_v2, msgr_multi_app, ig_multi_app}`. No está establecido qué valores concretos toma
cada campo ni cuál corresponde a "hay default application designada".

*Comprobación:* llamar sobre la misma Página antes y después de designar la default
application, y registrar el diff. Sin esto, V6 no se puede implementar.

**C7. ¿`pages_read_engagement` hace falta en la configuración de Messenger?**
El grafo de dependencias de `02` §4 no lo cuelga de `pages_messaging`. `03`
§`scopesMessenger` lo lista como permiso del canal. Kavea no tiene identificada una
llamada de Messenger que lo consuma.

*Comprobación:* configuración de prueba sin él, diálogo completo, y ejecutar el circuito
de Messenger entero: `GET /me/accounts`, `POST /subscribed_apps`,
`POST /{PAGE_ID}/messages`. Si todo pasa, se retira.

**C8. ¿Qué pasa al autorizar dos configuraciones seguidas con el mismo portafolio?**
No está establecido si la segunda autorización devuelve el mismo token BISU, uno nuevo, o
invalida el primero. Determina si hay que guardar un token por canal o uno por conexión, y
qué pasa cuando el cliente reconecta un solo canal.

*Comprobación:* completar los dos diálogos con el mismo portafolio de prueba, comparar los
dos tokens con `GET /debug_token`, y después reconectar solo uno de los canales y volver a
comprobar si el otro sigue vivo.
