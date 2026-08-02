# Kavea — Conexión con Instagram y Facebook

**1 de agosto de 2026 · Gabriel Montiel Toro — Boosty Digital**

> **Método.** Todo dato de Meta caduca. Las versiones de Graph API, los nombres de scope, los campos de webhook y las fechas de deprecación cambian sin aviso previo útil. Cada cifra, endpoint y nombre literal de este documento se verificó contra documentación oficial de Meta abierta el 1 de agosto de 2026, y donde dos páginas oficiales se contradicen se dice cuál dice qué. Antes de escribir código, reconfirmar en el App Dashboard y en el Graph API Explorer. Lo que aquí aparece marcado como *sin confirmar* no es un hueco de redacción: es un dato que no existe en fuente oficial y que hay que medir en consola.

---

## 1. Resumen ejecutivo

**Lo decidido.**

1. Instagram va por **Instagram API con Facebook Login**, autorizada con Facebook Login for Business. La mensajería la sirve la Instagram Messaging API del Messenger Platform sobre `graph.facebook.com`. Queda descartado `graph.instagram.com`.
2. **Una sola app de Meta, de tipo Business**, propiedad de un business portfolio de Boosty verificado. Una app no puede usar Facebook Login e Instagram Login a la vez, y el tipo de app no se cambia después.
3. **Versión fijada en `v26.0`**, en una única variable `GRAPH_API_VERSION` leída por todos los clientes HTTP. Nunca en un path, nunca una llamada sin versión.
4. **Requisito de onboarding no negociable en v1**: cada cliente debe tener una Página de Facebook vinculada a su cuenta profesional de Instagram. No se soportan clientes solo-Instagram.
5. Token por tenant: **Business Integration System User (BISU)** ligado al business portfolio del cliente, no a una persona. De él se deriva el Page Access Token.
6. **WhatsApp está pendiente.** Fuera de cinco puntos verificados, nada de WhatsApp puede darse por cierto en este documento.

**Qué hacer esta semana.**

7. Decidir el **domicilio legal de la entidad que hace la Business Verification**. Es una decisión societaria bloqueante y va antes de crear la app, no después.
8. Crear el business portfolio de Boosty y arrancar la Business Verification. No hay SLA publicado: los reportes van de 12 días a más de dos meses.
9. Crear la app de tipo Business y reclamarla desde el portfolio. Una app Business sin negocio conectado ya falla el verification check.
10. Abrir a mano en navegador el changelog de Messenger Platform y guardar copia. Devuelve HTTP 500 a los fetchers y es la fuente de verdad de los plazos.
11. Consultar por escrito a Meta Developer Support si se permite la descarga efímera de media entrante para análisis con visión, y guardar la respuesta. Va antes del App Review.
12. Poner el **27 de octubre de 2026** en el calendario del proyecto. Ese día las retiradas de protocolo de v26.0 aplican a todas las versiones soportadas.

---

## 2. La decisión de fondo: qué vía se usa para Instagram

**La decisión: Instagram API con Facebook Login, autorizada mediante Facebook Login for Business.** Toda llamada va a `graph.facebook.com` con el Page Access Token del tenant. Quedan prohibidos en este proyecto `graph.instagram.com`, `api.instagram.com`, `www.instagram.com/oauth/authorize` y los scopes `instagram_business_*`.

### 2.1 Las dos vías, con hechos verificados

| | **Facebook Login (elegida)** | **Instagram Login (descartada)** |
|---|---|---|
| Host de API | `graph.facebook.com` | `graph.instagram.com` |
| Diálogo de autorización | Facebook Login for Business, con `config_id` en lugar del parámetro `scope` — *URL exacta sin confirmar, verificar en consola* | `https://www.instagram.com/oauth/authorize` con `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `enable_fb_login`, `force_reauth` |
| Intercambio de código | — | `POST https://api.instagram.com/oauth/access_token` |
| Tipo de token | Page Access Token derivado de un BISU ligado al business portfolio del cliente | Instagram User access token |
| Caducidad | BISU: *"Defaults to never expire for the common offline server-to-server communication"* | 60 días. *"Tokens that have not been refreshed in 60 days will expire."* Refresco: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`, exige token de al menos 24 h de antigüedad |
| Scopes de mensajería | `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, más `pages_show_list`, `pages_read_engagement` y `pages_read_user_content` como dependencias | `instagram_business_basic`, `instagram_business_manage_messages` |
| Facebook Messenger en la misma app | Sí | No. `graph.instagram.com` no sirve Messenger |
| Página de Facebook del cliente | Requerida | No requerida: *"This API setup does not require a Facebook Page to be linked to the Instagram professional account"* |
| Endpoint de envío | `POST https://graph.facebook.com/v26.0/me/messages` | `POST https://graph.instagram.com/<version>/<IG_ID>/messages` (los ejemplos oficiales usan `v25.0`) |
| Ventana de 24 h y feature Human Agent | Igual en ambas. Human Agent es una feature con App Review propio | Igual en ambas |
| Anuncios Click-to-Instagram-Direct | `page_id` obligatorio en `promoted_object` y `object_story_spec` | Sin Página no existe ese camino |
| Hashtag search, product tagging, Partnership Ads | Disponibles | No disponibles |
| Fricción de onboarding declarada por Meta | Mayor: exige Página vinculada | *"going from an average of 12 steps to just two"* |
| Convivencia | *"Your app can either use Facebook Login or Instagram Login but not both"* | Misma restricción |

Nota sobre versiones: la documentación de Instagram sigue mostrando ejemplos con `v25.0`. Es retraso documental, no falta de soporte. La vía elegida va toda contra `graph.facebook.com`, donde `v26.0` es la versión vigente desde el 29 de julio de 2026.

### 2.2 Por qué esta vía y no la otra

**Primera: la elección es por app y es irreversible.** La página de App Review dice literal que una app usa Facebook Login o Instagram Login, no las dos. Soportar ambas significa dos App Reviews, dos Access Verifications, dos App Secrets, dos endpoints de webhook y dos flujos de onboarding en el producto.

**Segunda: Kavea incluye Messenger.** `graph.instagram.com` no habla Facebook Messenger. Elegir Instagram Login obligaría a una segunda app de todas formas. Con Facebook Login, un solo Page Access Token por cliente cubre Instagram Direct y Messenger a la vez.

**Tercera: Meta define Facebook Login for Business como** *"the preferred authentication and authorization solution for tech providers building integrations with Meta's business tools"*. Ese es exactamente el rol de Boosty. Aporta configuraciones con `config_id` y tokens de system user de integración ligados al business portfolio del cliente en vez de a una persona física.

**Cuarta: los relojes de 60 días.** Los tokens de Instagram Login mueren a los 60 días si no se refrescan, y el criterio es la falta de refresco, no la falta de uso. Con treinta cuentas de clientes son treinta relojes independientes y una llamada incómoda al cliente cada vez que uno vence. Los BISU por defecto no expiran en comunicación server-to-server offline.

**Quinta: la atribución a pauta.** Los anuncios Click-to-Instagram-Direct exigen `page_id` en `promoted_object` y `object_story_spec`. Atribuir conversaciones a campañas es un caso de uso central para una agencia que corre publicidad para sus clientes.

### 2.3 Lo que se paga, dicho sin adornos

Se pierden hashtag search, product tagging y Partnership Ads. Ninguna de las tres importa para una bandeja de mensajería. Y cada cliente debe tener una Página de Facebook vinculada a su cuenta profesional de Instagram, lo que es un paso más de onboarding en mercados donde muchos negocios pequeños tienen la Página abandonada. Meta afirma que la otra vía baja el onboarding de doce pasos a dos. Ese número está a favor de la opción descartada y hay que reconocerlo: la vía elegida cuesta más fricción de alta a cambio de una sola app y tokens que no vencen.

### 2.4 Riesgo de migración forzada

A 1 de agosto de 2026 **no existe ningún anuncio de deprecación, sunset ni fecha límite** para la vía Facebook Login. Verificado por tres caminos independientes: el changelog de Instagram Platform, cuya entrada más reciente es del 22 de junio de 2026 y cuyas entradas de 2026 son features nuevas; el changelog de `v26.0`; y la propia guía de migración de Meta, que va de Facebook Login hacia Instagram Login y no declara ninguna fecha obligatoria.

Lo que sí existe es presión de producto: Meta reduce la fricción de la otra vía y lanza allí funcionalidad nueva. Eso no es una deprecación, pero es la señal que suele precederla.

**Coste si Meta fuerza la migración estando en Facebook Login.** App nueva —el tipo de app no se cambia y una app no puede usar los dos logins—, App Review nuevo, Access Verification nueva, App Secret nuevo, endpoint de webhook nuevo, y re-autorización de todos los clientes uno por uno. Lo más caro no es el trámite: los identificadores scoped no son portables entre apps. Los IGSID cambian y la correlación con el histórico de conversaciones se rompe. Por eso la tabla de contactos lleva `(organization_id, canal, scoped_id)` como clave única y una columna separada `app_scoped_id` desde el día uno.

**Coste de haber elegido Instagram Login.** Se paga desde el día uno y sin condición: dos apps de Meta desde el principio, porque Messenger no se sirve desde `graph.instagram.com`. Dos App Reviews, dos Access Verifications, dos App Secrets, dos endpoints, dos flujos de onboarding, más los treinta relojes de 60 días.

La asimetría es esa. El coste de la vía elegida es condicional y sin fecha anunciada. El coste de la descartada es cierto e inmediato.

---

## 3. La decisión de fondo: modelo multi-tenant

**La decisión: una sola app de Meta, de tipo Business, propiedad de un business portfolio de Boosty Digital verificado, con Facebook Login for Business y configuraciones (`config_id`) en lugar del parámetro `scope` suelto.** Cada cliente autoriza desde su propio business portfolio y delega activos explícitos. Confirmado verbatim: *"Access is explicitly delegated at the time of authorization"*.

### 3.1 Qué activos pide Kavea

Dos, y solo dos, por cliente: **su Página de Facebook** y **la cuenta profesional de Instagram vinculada a esa Página**. De ahí salen los dos identificadores que Kavea guarda por organización: `page_id` e `ig_business_account_id`. Ambos, porque el enrutado multi-tenant de webhooks se resuelve contra `entry[].id`, que puede ser cualquiera de los dos.

Se piden configuraciones de Facebook Login for Business **separadas y con el conjunto mínimo de permisos por canal**. Pedir scopes de más rompe el App Review: Chatwoot pedía `instagram_basic` e `instagram_manage_messages` dentro de un flujo solo-Messenger y obtenía *"Invalid Scopes"*, lo que bloqueaba la revisión y creaba un bloqueo circular con el tag `human_agent`. Hay que auditar y quitar los permisos que el use case preselecciona y Kavea no usa.

### 3.2 Qué ve el cliente en pantalla, paso a paso

El 80% de los fallos de conexión son configuración del cliente, no código. El asistente valida y guía con capturas en cada paso.

**Paso 0 — Requisitos previos, en el teléfono del cliente y en su Página.**
- Cuenta de Instagram convertida a profesional.
- Página de Facebook vinculada a esa cuenta profesional. No negociable en v1.
- Toggle **"Allow Access to Messages"** activado en Instagram → Configuración → Mensajes y respuestas a historias → Controles de mensajes → Herramientas conectadas. Sin esto, el OAuth "funciona" y no llega ni un solo mensaje. Es el fallo silencioso más común de toda la integración.
- La persona que autoriza necesita la tarea correcta sobre la Página. **Cuál exactamente está sin confirmar**: el get-started de Messenger para Instagram exige `MODERATE`, la página de send-message exige `MESSAGE`, y la tarea `MESSAGING` no aparece en ninguna de las dos. Kavea valida aceptando `MODERATE` y `MESSAGE`, y no rechaza por ausencia de `MESSAGING`: rechazar por eso descartaría clientes válidos. Confirmar empíricamente qué valores devuelve `GET /me/accounts` en `tasks`.

**Paso 1 — El cliente pulsa "Conectar Instagram y Messenger" en Kavea.** Se abre el diálogo de Facebook Login for Business con el `config_id` de la configuración correspondiente. La URL exacta del diálogo con `config_id` no está transcrita en el material verificado: **sin confirmar — verificar en consola**. Lo que sí está confirmado es que `config_id` sustituye al parámetro `scope`.

**Paso 2 — El cliente elige el business portfolio desde el que autoriza y selecciona los activos.** Su Página y su cuenta de Instagram. Aquí es donde ocurre la delegación explícita.

**Paso 3 — Kavea recibe un BISU access token** ligado al portfolio del cliente. De él deriva el Page Access Token con el que envía mensajes y suscribe webhooks. Pendiente de verificar: la doc de Facebook Login for Business lista *"automated messaging responses"* entre los casos de uso de los BISU, pero **no está confirmado explícitamente que funcionen para enviar DMs de Instagram en concreto**. Comprobar con `/debug_token` y un envío real antes de fijar la estrategia de refresco definitiva.

**Paso 4 — Kavea suscribe la app a los webhooks de la Página** con `POST /{page-id}/subscribed_apps`. Los nombres exactos de `subscribed_fields` tienen discrepancia de nomenclatura entre páginas oficiales: `messaging_referral` frente a `messaging_referrals`, `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a `messaging_reactions`. **Confirmar en consola qué valores acepta el enum antes de escribir esta llamada.**

**Paso 5 — El asistente comprueba la default application de Conversation Routing.** Se valida por API con `GET /me?fields=messaging_feature_status`, que devuelve `{hop_v2, msgr_multi_app, ig_multi_app}`. Si el cliente no ha designado una default application, la Página opera en modo Default Behavior: todas las apps conectadas reciben los webhooks y pueden responder al mismo mensaje, y además *"The Take Thread Control API is blocked unless a default application is set"*. Es una acción manual del cliente en los ajustes de su Página que Kavea no puede ejecutar por API. Va como paso obligatorio y verificable del asistente, con captura.

**Paso 6 — Prueba de extremo a extremo.** El cliente manda un DM desde una cuenta personal y lo ve aparecer en Kavea. Hasta que esa prueba pasa, la conexión no se marca como activa en el panel.

### 3.3 Qué verificación necesita Boosty y cuál necesita el cliente

**Para Instagram y Messenger, los trámites son de Boosty. El cliente no verifica nada.** Confirmado: la app debe estar conectada a un negocio verificado, y ese negocio es el de Boosty.

El orden es estricto y no se salta ningún paso:

1. **Crear el business portfolio de Boosty.**
2. **Completar su Business Verification.** No hay lista oficial pública de países no soportados; los documentos exigidos varían por país y solo son visibles dentro del flujo autenticado; no hay SLA publicado. Los snippets mencionan 48 h de revisión documental y los hilos del foro reportan de 12 días a más de dos meses. Por eso el domicilio legal de la entidad se decide antes de empezar.
3. **Crear la app de tipo Business.** El tipo no se puede cambiar después.
4. **Reclamar la app desde el portfolio.** Una app Business sin negocio conectado ya falla el verification check.
5. **Pasar Access Verification**, que es la designación formal de Tech Provider. Decisión en unos 5 días. *"Access verification is independent of App Review."*
6. **App Review, permiso a permiso, con Advanced Access.**

Sobre por qué Kavea cae en Access Verification aunque parezca que no: `pages_messaging`, `instagram_manage_messages` y `pages_manage_metadata` **no** están en la lista de permisos restringidos. Pero `instagram_basic`, `pages_show_list`, `pages_read_engagement` y `business_management` **sí**, y son dependencias obligatorias. No hay atajo.

Un dato que hay que tratar con cuidado: el overview de Messenger Platform dice verbatim que *"The business_management permission is a dependency for pages_messaging, pages_show_list, and instagram_manage_messages"*, y la Permissions Reference lo niega y documenta la relación inversa. **Son dos páginas oficiales de Meta en contradicción.** Se incluye el permiso en el submission por prudencia, pero no se presenta como dependencia establecida.

### 3.4 WhatsApp es al revés, y hay que decirlo en cada conversación comercial

El documento base de mercado mezcla los tres canales. Es un error caro. **La verificación de Boosty no cubre WhatsApp.**

Lo verificado, y nada más que esto:

- **Cada cliente tiene su propio business portfolio**, y su verificación condiciona sus **límites de mensajería**: 250 → 2.000 → 10.000 → 100.000 → ilimitado.
- **Plantillas**: 250 por WABA si el portfolio padre está sin verificar; 6.000 si está verificado **y además** al menos un número tiene display name aprobado.
- **Partner-led Business Verification** existe, pero es exclusiva de WhatsApp y solo para Solution Partners de nivel Select Solution y Premier, con tope de 3 envíos por cliente. Si los tres se rechazan, el cliente completa la verificación por su cuenta. Boosty no califica de entrada.
- **Embedded Signup** limita a 10 clientes nuevos por ventana móvil de 7 días; sube a 200 solo si se completan Business Verification, App Review y Access Verification.
- **Permisos**: `whatsapp_business_messaging` y `whatsapp_business_management`.

Todo lo demás de WhatsApp está **sin investigar**: forma del webhook, categorías de plantilla y su aprobación, precio por mensaje, quality rating y bloqueo por baja calidad, verificación de número y aprobación de display name. Ninguna sección de este documento debe afirmar nada de WhatsApp fuera de esos cinco puntos.

Consecuencia comercial directa: **vender WhatsApp llave en mano sin que el cliente haga nada es una promesa que Meta no permite cumplir.**

### 3.5 El puente antes del App Review

Con Standard Access, los administradores de los clientes piloto se añaden como **Testers**, que *"can grant the app any permission while it is in development"*. Tope: 50 testers, o 500 combinados testers más analytics users si la app está conectada a un Business Manager con Business Verification completada. El verificador resolvió esa duda: "Business Manager-verified" significa Business Verification completada.

Es un puente con fricción alta —cada admin de cliente debe aceptar una invitación de rol en la app de Boosty— y no es un modelo de negocio. Sirve para tener tenants reales funcionando mientras corre el trámite, y para grabar los screencasts del App Review.

### 3.6 El riesgo que se asume, y cómo se mitiga

Una sola app concentra el riesgo. Una restricción de Meta tumba a todos los tenants a la vez: le pasó a Chatwoot Cloud durante días en julio de 2026 y tuvieron que deshabilitar por código la creación de inboxes y las respuestas. La alternativa —una app por cliente— multiplica por N las rondas de App Review y de Access Verification, y no es viable.

**Se mitiga con producto, no con arquitectura**: kill-switch por canal y por tenant, banner de estado en la UI, y modo degradado que encola en vez de fallar. El contrato con los clientes de Boosty no puede prometer SLA sobre algo que controla Meta.

Hay además un riesgo de pérdida retroactiva. Access Verification se cae si la Business Verification caduca, si la app se desconecta del negocio o si la cuenta de negocio queda restringida. Cuando eso pasa, los clientes dejan de poder otorgar permisos. El estado de verificación se monitoriza como si fuera uptime.

**Disponibilidad regional: sin confirmar.** Meta despliega funciones por país de forma irregular y no publica listas. La única exclusión geográfica publicada es la de WhatsApp Business Platform —Cuba, Irán, Corea del Norte, Siria y Crimea/Donetsk/Lugansk— y ni Venezuela, ni República Dominicana, ni México están en ella. Ausencia de prohibición no es confirmación de disponibilidad. La feature Human Agent, private replies, Conversation Routing, Utility Messages y Marketing Messages hay que probarlas con una cuenta profesional real de cada mercado antes de comprometer fechas con clientes.

---

## 4. Permisos y scopes exactos

Todo lo que sigue es la vía **Facebook Login for Business** contra `graph.facebook.com`. Los scopes `instagram_business_*` no aparecen en la tabla porque pertenecen a la vía Instagram Login, que está descartada por app y de forma irreversible.

Antes de la tabla, la distinción que más confusión genera:

- **Standard Access** se concede solo con crear la app, para todos los permisos disponibles a su tipo. Texto literal: *"Permissions with Standard Access can only be requested from app users who have a role on the requesting app"*. Sirve para desarrollo y para un piloto con los admins de los clientes añadidos como Testers. Tope 50 testers, o 500 testers más analytics users combinados si la app está conectada a un negocio con Business Verification completada.
- **Advanced Access** es lo que permite que un cliente sin rol en la app conceda permisos. Exige App Review permiso a permiso. Texto literal de Access Levels: *"Business Verification is required to get Advanced Access"*.

Kavea opera cuentas de terceros. Por tanto **todos** los permisos de la tabla necesitan Advanced Access. No hay ninguno que se pueda dejar en Standard.

| Permiso o feature | Canal | Para qué sirve en Kavea | Nivel que necesita Kavea | ¿App Review? |
|---|---|---|---|---|
| `pages_show_list` | Messenger + IG | Lista las Páginas del usuario en `GET /me/accounts`. Raíz del grafo de dependencias: sin él no se concede casi nada. | Advanced | Sí |
| `pages_read_engagement` | Messenger + IG | Lectura de contenido y metadatos de la Página. Dependencia declarada de `instagram_manage_messages` y de `business_management`. | Advanced | Sí |
| `pages_read_user_content` | IG | Dependencia declarada de `instagram_basic`. Kavea no lo invoca directamente. | Advanced | Sí, sin confirmar si lleva submission propio o se concede por dependencia — verificar en el panel |
| `pages_manage_metadata` | Messenger + IG | Suscribir la app a los webhooks de la Página: `POST /{page-id}/subscribed_apps`. Sin él, el paso de suscripción del onboarding falla y no llega un solo evento. | Advanced | Sí |
| `pages_messaging` | Messenger | Enviar y recibir en Messenger: Send API, Conversations API, endpoints de Conversation Routing. Descripción oficial vigente: *"allows your app to manage and access Page conversations and calling in Messenger"*. | Advanced | Sí. El screencast admite demostrar llamadas o demostrar envío de mensaje con recepción visible en el cliente de Messenger |
| `instagram_basic` | IG | Lectura básica de la cuenta profesional de Instagram vinculada a la Página. | Advanced | Sí |
| `instagram_manage_messages` | IG | *"allows business users to read and respond to Instagram Direct messages"*. Es el permiso que habilita la bandeja de Instagram. | Advanced | Sí |
| `business_management` | Messenger + IG | Gestión de activos vía business portfolio. Se incluye por prudencia: el overview de Messenger Platform lo declara dependencia de `pages_messaging`, `pages_show_list` e `instagram_manage_messages`; la Permissions Reference lo niega y documenta la relación inversa. Contradicción entre dos páginas oficiales. Además viene preseleccionado por el use case de Instagram. | Advanced | Sí |
| Feature **Human Agent** | Messenger + IG | Responder entre las 24 h y los 7 días con `messaging_type: MESSAGE_TAG` y `tag: HUMAN_AGENT`. **No es un permiso, es una feature.** | Advanced | Sí, submission **aparte**, con su propio screencast y verificación de negocio |

### Dependencias, en forma de grafo

Verificado permiso a permiso contra la Permissions Reference por dos verificadores independientes.

```
pages_show_list                          (raíz, sin dependencias propias)
├── pages_read_engagement
│   └── business_management              (+ pages_show_list)
├── pages_read_user_content
│   └── instagram_basic                  (+ pages_show_list)
│       └── instagram_manage_messages    (+ pages_read_engagement + pages_show_list)
└── pages_manage_metadata
    └── pages_messaging                  (+ pages_show_list)
```

Que las dependencias se concedan de forma implícita al aprobar el permiso hijo es **sin confirmar**. Lo prudente es asumir un ítem de submission por cada fila de la tabla, cada uno con su descripción y su screencast, sin copiar y pegar entre ellos.

### Access Verification: qué permisos disparan el trámite de Tech Provider

Access Verification es un trámite distinto de App Review y de Business Verification. Se dispara por una lista cerrada de permisos restringidos. De la lista de Kavea:

- **Están en la lista restringida:** `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `business_management`.
- **No están:** `pages_messaging`, `instagram_manage_messages`, `pages_manage_metadata`.

Es contraintuitivo y hay que decirlo en voz alta: los permisos de mensajería no disparan Access Verification, pero sus dependencias obligatorias sí. No existe una combinación de scopes que evite el trámite. Kavea es Tech Provider por arrastre.

### Deprecados y renombrados

- **Ningún permiso de la tabla figura como deprecado** en la Permissions Reference. Comprobado uno por uno.
- Meta no depreca permisos por versión de Graph API, los depreca **por fecha**. Fijar `v26.0` no protege de una retirada de scope. La vigilancia de versión y la vigilancia de scopes son dos trabajos distintos.
- Renombrados con fecha, pero de la otra vía: `business_basic`, `business_content_publish`, `business_manage_comments` y `business_manage_messages` pasaron a `instagram_business_*` el **27-ene-2025**. No aplican aquí y no deben aparecer en ninguna configuración de Kavea.
- Cambio de alcance sin cambio de nombre: `pages_messaging` cubre ahora también llamadas de voz en Messenger. Mismo permiso, más superficie, mismo submission.
- Permiso nuevo que **no** se pide: `instagram_manage_engagement`, anunciado el 22-abr-2026 con la Like Media and Comments API.
- Lo que sí murió con fecha y no es un permiso: los message tags `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` y `POST_PURCHASE_UPDATE`, error code 100 desde el **27-abr-2026**.

### Lo que no se pide, y por qué

Pedir de más rompe el App Review. Texto oficial: *"If you request permissions or features that your app does not use... your submission will not be approved."* El use case de Instagram del App Dashboard preselecciona permisos por defecto: hay que auditar esa selección y quitar lo sobrante antes de enviar.

- **Prohibidos por la vía elegida:** `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `instagram_business_content_publish`.
- **Fuera de v1 por decisión:** `page_utility_messaging` (las Utility Messages no están confirmadas como ruta de migración de los tags muertos y su economía se desconoce), `ads_management` y `pages_manage_ads` (la atribución de conversaciones a pauta se resuelve leyendo el objeto `referral` del webhook, no la Marketing API), `instagram_manage_comments` y `instagram_manage_insights` (comentarios y analítica salen de v1), `instagram_content_publish` y la feature Instagram Public Content Access.
- **WhatsApp queda fuera de esta tabla.** Lo único verificado son los dos permisos que un Tech Provider somete a Advanced Access: `whatsapp_business_messaging` y `whatsapp_business_management`. No se piden en v1 y llevan un trámite invertido: ahí verifica el cliente, no Boosty.

### El requisito que no es un scope: la tarea sobre la Página

El Page Access Token debe pedirlo alguien con la tarea correcta sobre la Página del cliente. Aquí las fuentes oficiales no coinciden:

- El get-started de Messenger Platform para Instagram exige la tarea `MODERATE`.
- La página de send-message exige la tarea `MESSAGE`.
- Para `pages_manage_metadata`, la doc pide un token solicitado por alguien con rol `CREATE_CONTENT`, `MANAGE` o `MODERATE`.
- La tarea `MESSAGING` **no aparece en ninguna de las dos páginas**. No usarla como criterio.

> **RESUELTO EMPÍRICAMENTE — 1 de agosto de 2026.** Se llamó `GET /me/accounts?fields=tasks` con un
> token real de system user sobre las 28 Páginas de clientes de Boosty. El enum que devuelve la API es:
> `ADVERTISE`, `ANALYZE`, `CREATE_CONTENT`, `MESSAGING`, `MODERATE`, `MANAGE`, `MANAGE_LEADS`,
> `VIEW_MONETIZATION_INSIGHTS`.
>
> Es decir: **`MESSAGING` sí existe y es el valor real. `MESSAGE` no existe en el enum.** La página de
> send-message documenta un valor que la API no devuelve. La doc de Meta está equivocada, no el enum.

Regla de implementación, corregida contra datos reales: leer el array `tasks` de `GET /me/accounts` y exigir `MESSAGING`, aceptando `MODERATE` como alternativa. No buscar `MESSAGE`: no lo devuelve nunca. De las 28 Páginas medidas, 27 traen `MESSAGING` y `MODERATE`; una sola trae únicamente `ANALYZE` y `ADVERTISE`, y esa no puede ser tenant de Kavea hasta que se le amplíen los permisos de activo en el Business Manager.

---

## 5. Arquitectura de la conexión

### 5.1 El flujo completo

```
FASE 1 — ALTA DEL TENANT (una vez por cliente, a ritmo humano)

  admin del cliente
        │ abre el wizard en kavea.ai
        ▼
  Next.js App Router · GET /api/meta/oauth/start
        │ 302 con config_id + state firmado (CSRF)
        ▼
  diálogo de Facebook Login for Business          [URL exacta: sin confirmar — verificar
        │ 302 ?code=…&state=…                      en consola. Confirmado: config_id
        ▼                                          sustituye al parámetro scope]
  Next.js App Router · GET /api/meta/oauth/callback     (route handler, no Server Action)
        │
        ├─ POST /v26.0/oauth/access_token .......... code  →  token BISU del tenant
        ├─ GET  /v26.0/me/accounts ................. page_id, tasks[], page access token
        ├─ GET  /v26.0/{page_id}?fields=instagram_business_account
        └─ GET  /v26.0/me?fields=messaging_feature_status
                                    → {hop_v2, msgr_multi_app, ig_multi_app}
        │
        ▼
  Postgres · meta_connections
  (organization_id, page_id, ig_business_account_id, token cifrado, estado)
        │
        └─ POST /v26.0/{page_id}/subscribed_apps?subscribed_fields=…
                 │
                 ▼
           webhooks activos para esa Página


FASE 2 — OPERACIÓN (por evento, a ritmo de máquina)

  META
   │  POST https://webhooks.kavea.ai/meta
   │  X-Hub-Signature-256: sha256=…       cuerpo con hasta 1000 entry[]
   ▼
 ┌─ Cloudflare Worker · INGESTA ──────────────────────────────────────────────┐
 │ 1. request.arrayBuffer()  →  cuerpo CRUDO, sin parsear ni re-serializar    │
 │ 2. HMAC-SHA256(cuerpo, APP_SECRET), comparación en tiempo constante        │
 │ 3. push del cuerpo crudo a la cola                                         │
 │ 4. 200 OK              presupuesto: < 5 s · cero acceso a Postgres         │
 └────────────────────────────────────────────────────────────────────────────┘
   │
   ▼
  Cloudflare Queues · meta_raw
   │
   ▼
 ┌─ Cloudflare Worker · NORMALIZADOR (consumidor de la cola) ─────────────────┐
 │ itera entry[] → messaging[] | standby[] | changes[] | {field,value}        │
 │ resuelve entry[].id → organization_id      ◄── Workers KV (caché)          │
 │      sin correspondencia → cuarentena + alerta, NUNCA a un tenant          │
 │ discrimina message | reaction | read | delivery | postback | echo | edit   │
 │ tipo desconocido → 'fallback' con payload crudo en JSONB, sigue el lote    │
 │ media entrante → persiste SOLO la URL del CDN, nunca el binario           │
 └────────────────────────────────────────────────────────────────────────────┘
   │  INSERT … ON CONFLICT (organization_id, canal, mid) DO NOTHING
   ▼
  Supabase Postgres · RLS
   │  trigger AFTER INSERT/UPDATE → broadcast al canal org:{organization_id}
   ├───────────────────────────┬────────────────────────────┐
   ▼                           ▼                            ▼
  Supabase Realtime      cola del agente             carril de acuse
  canal org:{id}         (Claude API)                determinista < 30 s
   │                           └──────────┬─────────────────┘
   ▼                                      ▼
  Bandeja Next.js          ┌─ Cloudflare Worker · SALIDA ──────────────────┐
  (navegador del agente)   │ Durable Object por page_id:                   │
                           │   token bucket + serialización por hilo       │
                           │ resuelve messaging_type / tag por conversación│
                           │ lee X-App-Usage y X-Business-Use-Case-Usage   │
                           │ y PARA al llegar al límite (no reintenta)     │
                           └───────────────────────────────────────────────┘
                                      │
                                      ├─ POST /v26.0/{PAGE_ID}/messages   (Messenger)
                                      └─ POST /v26.0/me/messages          (Instagram)
                                                │
                                                ▼
                                              META  → vuelve como echo (is_echo:true)


FUERA DE BANDA (Cron Triggers de Cloudflare)

  cada 15 min · reconciliación: GET /v26.0/{page_id}/subscribed_apps por organización.
                Falta la app → re-suscribe y alerta. Meta desuscribe a la hora de fallos.
  cada 24 h   · salud de credenciales: GET /v26.0/debug_token por conexión.
  cada 24 h   · vigilancia de versión: falla si GRAPH_API_VERSION está a menos de
                6 meses de su fecha de expiración publicada.
```

### 5.2 Dónde vive cada pieza y por qué

**OAuth, inicio y callback → Next.js App Router, route handlers.**
El callback es un redirect de Meta: un `GET` con `code` y `state` en la query string. Eso es un route handler, no una Server Action. El intercambio de código por token expone el App Secret, así que va server-side sin excepción. Es un flujo de una petición por cliente y por conexión, con un humano esperando delante: no necesita otra infraestructura y sí necesita la sesión del usuario de Boosty que está conduciendo el alta.

**Suscripción a webhooks → el mismo route handler del onboarding.**
`POST /{page_id}/subscribed_apps` usa el Page Access Token que se acaba de derivar. Va en la misma transacción lógica que el alta, y su fallo debe abortar el alta con un mensaje concreto, no dejar un tenant a medio conectar.

**Reconciliación de suscripciones → Cron Trigger de Cloudflare.**
No va en Supabase. Este cron existe precisamente para recuperarse de una caída, y tiene que funcionar cuando el resto no funciona. Además hace llamadas HTTPS salientes, que en `pg_cron` requerirían `pg_net` y meterían la dependencia dentro de la base de datos.

**Ingesta de webhooks → Cloudflare Worker.**
Hace tres cosas y ninguna más: leer el cuerpo crudo, validar el HMAC, encolar. No parsea, no resuelve tenant, no toca Postgres. El trabajo es constante respecto al cuerpo, no lineal respecto al número de eventos, así que un lote de 1000 `entry[]` cuesta lo mismo que uno de 1.

**Cola → Cloudflare Queues.**
Mismo dominio de fallo que la ingesta, a propósito. Si la cola cae, cae la ingesta, y ambas están fuera del dominio de fallo de la base de datos.

**Normalizador → Worker consumidor de la cola.**
Escribe en Postgres por HTTPS (PostgREST), no por TCP, así que no hace falta pooler desde el borde. Escribe con service role: **RLS es la defensa del plano de lectura, no del de ingesta**. El límite entre tenants en el plano de escritura lo pone la resolución de `entry[].id` a `organization_id`, y por eso esa resolución ocurre antes de tocar la base de datos. Sin correspondencia no hay escritura por defecto: hay cuarentena y alerta.

**Caché del mapeo `entry[].id` → `organization_id` → Workers KV.**
Se lee en cada evento y cambia solo en alta y en baja. Se invalida al escribir en `meta_connections`. Un fallo de caché cae a Postgres. Un fallo total va a cuarentena.

**Postgres → Supabase.** Fuente de verdad. Idempotencia por constraint, no por comprobación previa.

**Realtime → canal por organización, emitido desde la base de datos con un trigger (Broadcast), no `postgres_changes` con filtro.**
`postgres_changes` evalúa las políticas RLS por suscriptor y por cambio, y una bandeja compartida multi-tenant con muchos agentes conectados es exactamente el patrón que lo castiga. El trigger emite al canal `org:{organization_id}` y la autorización del canal se resuelve una vez, al suscribirse.

**R2 → solo media saliente que Kavea genera o que el agente envía.**
El media entrante de Meta se persiste como URL del CDN y nada más. El modelo de datos separa las dos cosas desde el día uno. Cualquier fetch de una URL que venga de un webhook pasa por la allowlist de host, bloquea rangos privados y no sigue redirecciones fuera de la lista.

**Supabase Edge Functions → no se despliega ninguna en v1.**

### 5.3 Cloudflare Workers o Supabase Edge Functions: Workers, por dos razones

**Primera: separación del dominio de fallo, impuesta por la regla de la hora.**
Tras una hora de entregas fallidas, Meta manda "Webhooks Disabled" y **desuscribe la app de esa Página**, con resuscripción manual. No es degradación, es apagado por cliente y en silencio. La propiedad más cara del sistema es que el endpoint de ingesta devuelva 200 pase lo que pase.

Si la cola es una tabla de staging en Postgres y el handler es una Edge Function del mismo proyecto, entonces la capacidad de devolver 200 depende de que la base de datos esté disponible. Una migración larga, un pool agotado o una ventana de mantenimiento se convierten en una desuscripción masiva de todos los tenants a la vez, y el coste de recuperación es manual y proporcional al número de clientes. Con Workers más Queues, el camino de ingesta no comparte nada con Supabase: Postgres puede estar caído una hora y los eventos se acumulan en la cola en vez de perderse.

El handler no necesita la base de datos para hacer su trabajo. Solo necesita el App Secret, que es uno para toda la app porque solo hay una app de Meta. No hay ninguna razón para acoplarlo a Postgres, y sí una razón muy cara para no hacerlo.

**Segunda: los Durable Objects son la primitiva que piden los rate limits.**
Los límites son por `page_id` y por cuenta profesional de Instagram, no por app: 300/s por Página en Messenger, 100/s por cuenta de IG para texto, 10/s en el carril de media, 2/s en Conversations API, más cuotas diarias que escalan con las impresiones del cliente. Eso necesita un token bucket con exactamente una instancia por `page_id`, y necesita serializar el envío dentro de una conversación para no invertir el orden.

Un Durable Object da exactamente eso: una instancia única por identificador, con estado y sin coordinación externa. Supabase Edge Functions no tienen equivalente. Implementar el mismo bucket ahí obliga a un lock en Postgres o en Redis por cada envío, que es más piezas, más latencia y otra dependencia de la base de datos en el camino caliente.

**Lo que cuesta esta decisión, dicho sin adornos:** dos proveedores, dos almacenes de secretos, dos pipelines de despliegue y observabilidad partida. El valor de `GRAPH_API_VERSION` y el App Secret viven en dos sitios y pueden desincronizarse. Se mitiga con un test que compare ambos entornos, no con disciplina.

### 5.4 Ciclo de vida de las credenciales

**Inventario. Qué hay, dónde vive y qué caduca.**

| Credencial | Dónde vive | Caducidad | Renovación |
|---|---|---|---|
| App ID | Público | No caduca | — |
| App Secret | Secreto del Worker (HMAC de webhooks) **y** secreto del runtime de Next.js (`appsecret_proof`) | No caduca; se rota a mano | Rotación coordinada en los dos entornos en el mismo instante |
| `verify_token` del webhook | Secreto del Worker + App Dashboard | No caduca | Cambio manual en ambos lados |
| Token BISU del tenant | Postgres, cifrado | *"Defaults to never expire for the common offline server-to-server communication"* | No hay endpoint de refresco: se renueva reautorizando |
| Page Access Token derivado | Postgres, cifrado | **Sin confirmar** cuánto vive el derivado de un BISU | Se vuelve a derivar de `GET /me/accounts` |

Dos avisos sobre esta tabla. Primero: **no está confirmado que los tokens BISU sirvan para enviar DMs de Instagram en concreto.** La doc lista "automated messaging responses" entre sus casos de uso, pero no lo afirma para Instagram Direct. Hay que comprobarlo con `/debug_token` y con un envío real antes de fijar la estrategia definitiva. Si no funciona, la vía de repuesto documentada es un user token de larga duración del que se deriva un Page Access Token sin fecha de expiración, y eso reintroduce el problema que el BISU resuelve: el token queda atado a una persona que puede irse de la empresa del cliente.

Segundo: **"no expira" no significa "no se invalida".** Un token sin fecha de caducidad muere igual cuando el cliente revoca la app desde sus ajustes de negocio, cuando la persona que autorizó pierde su rol, con un cambio de contraseña, o cuando Meta restringe la app.

**Qué se comprueba, y cada cuánto.**
No hay refresco periódico que hacer, así que la estrategia es verificación proactiva. Un cron diario recorre todas las conexiones y llama a `GET /v26.0/debug_token?input_token=<token>&access_token=<APP_ID>|<APP_SECRET>`, leyendo el estado de validez, la caducidad y los scopes concedidos. Los nombres exactos de campo de esa respuesta hay que confirmarlos en el Graph API Explorer antes de codificar el parser.

Y una comprobación que no es de token pero detecta lo mismo: el cron de 15 minutos contra `GET /{page_id}/subscribed_apps`. Un token revocado, una desuscripción automática de Meta y un cliente que desactivó "Allow Access to Messages" producen todos el mismo síntoma —dejan de llegar eventos— y ninguno emite un error. Ese cron es el detector de referencia, por encima de cualquier callback.

**Revocación explícita.**
Se implementan los dos callbacks, que son cosas distintas. El **Data Deletion Request Callback** está especificado: recibe `signed_request` con formato `<sig>.<payload_base64url>`, se verifica con HMAC-SHA256 sobre la cadena base64 **sin decodificar** —mecanismo distinto al de `X-Hub-Signature-256`— y responde JSON con exactamente `{url, confirmation_code}`. Llega con un App-Scoped ID que no es el PSID ni el IGSID, y por eso la tabla de contactos lleva `app_scoped_id` en una columna separada desde el primer día. El **Deauthorize Callback** existe —*"You can enable a deauthorize callback through the App Dashboard"*— pero la ruta del menú, el nombre del campo y el formato del payload para este callback concreto **no están documentados oficialmente**: verificar en el App Dashboard antes de implementarlo, y no depender de él como único detector.

Las revocaciones parciales no tienen webhook conocido. El único síntoma es el error 190 en la siguiente llamada, o el silencio.

**Qué hace el sistema cuando un token muere en producción.**
Máquina de estados por `(organization_id, canal)`, persistida en `meta_connections`:

- **`conectado`.** Operación normal.
- **`degradado`.** Códigos 4, 17, 32, 613 a nivel de plataforma, u 80001 / 80002 / 80006 a nivel de caso de uso. Se detiene el envío hasta el `estimated_time_to_regain_access` que devuelve la propia respuesta. Se sigue ingiriendo. No se reintenta durante el bloqueo: *"Continuing API calls during throttling extends the wait period further"*. El código 230 no entra aquí: es consentimiento de perfil no otorgado, es normal, se ignora.
- **`desconectado`.** Error 190, o `/debug_token` devuelve inválido, o la app no aparece en `subscribed_apps`. Se **para** todo envío del tenant. Un solo reintento en la primera aparición para descartar un transitorio, y después nada: reintentar un 190 en bucle no lo arregla y quema cuota. La bandeja sigue en modo lectura, el compositor se deshabilita con el motivo escrito, y aparece un enlace de reconexión que rehace el flujo de Facebook Login for Business.
- **`suspendido`.** Kill-switch manual por canal y por tenant, o restricción de la app entera por parte de Meta. El envío encola en vez de fallar. Banner de estado en la UI.

La alerta va primero a Boosty, no al cliente. El cliente se entera por su agencia, no por un producto que dejó de responder. Y ninguna transición de estado borra mensajes: un token muerto degrada el envío, nunca la ingesta ni el histórico.

**El otro reloj, el que no es por tenant.**
Dos fechas de calendario cortan el acceso de todos los tenants a la vez y no dependen de ningún token. La primera es el **27 de octubre de 2026**, cuando las retiradas de protocolo de v26.0 se aplican a todas las versiones soportadas. La segunda es el **Data Access Renewal** anual, en el que Meta ha consolidado Data Use Checkup, App Review, Data Protection Assessment y las revisiones continuas; qué requisitos concretos aplican al perfil de Kavea y con qué periodicidad exacta está **sin determinar**, pero es un trámite recurrente con capacidad de cortar el acceso de toda la cartera y tiene que estar en el calendario del proyecto con dueño asignado.

---

## 6. Recepción de webhooks

Un único endpoint recibe los eventos de todos los clientes de Boosty. Es la superficie más crítica del sistema: si falla la firma, cualquiera inyecta mensajes en la bandeja de cualquier tenant; si falla el enrutado, los mensajes de un cliente acaban escritos en el tenant de otro; si falla la disponibilidad una hora, Meta desuscribe la app de esa Página y Kavea se queda muda sin ningún error visible.

### 6.1 Contrato del endpoint

| Requisito | Valor |
|---|---|
| Transporte | HTTPS con certificado TLS válido. Los autofirmados no se soportan |
| Verificación inicial | `GET` con `hub.mode`, `hub.challenge`, `hub.verify_token` |
| Entrega de eventos | `POST` con cuerpo JSON y cabecera `X-Hub-Signature-256` |
| Respuesta obligatoria | `200 OK` en 5 segundos o menos |
| Trabajo permitido en el handler | Validar firma y encolar. Nada más |
| Tamaño del lote | Hasta 1000 updates por petición. El batching no está garantizado |

Todo lo demás —normalización, clasificación con Claude, tratamiento de media, resolución de perfil— va asíncrono. El presupuesto de cómputo por evento en el peor caso (1000 updates en una invocación de Worker) es minúsculo, así que el handler no puede hacer nada por evento salvo escribirlo.

La app tiene que estar publicada para recibir webhooks. La cita literal de la referencia de webhooks es *"Your app must be set to Live in the App Dashboard for Meta to send webhook notifications"*. La documentación de tipos de app dice, a la vez, que las apps de tipo Business *"do not have app modes and instead rely exclusively on access levels"*. Las dos frases son oficiales y no se reconcilian. **Sin confirmar — verificar en consola** qué controla realmente la recepción en una app Business.

### 6.2 Handshake de verificación

```ts
// Next.js App Router / Cloudflare Worker
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;

  // Los nombres llevan punto. No se pueden desestructurar.
  const mode      = p.get('hub.mode');
  const challenge = p.get('hub.challenge');
  const token     = p.get('hub.verify_token');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    // El challenge se devuelve CRUDO, sin comillas y sin envolver en JSON.
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }
  return new Response('forbidden', { status: 403 });
}
```

`hub.mode` siempre vale la cadena `subscribe`. `hub.challenge` es un entero que hay que devolver tal cual. La comparación de `hub.verify_token` contra el valor configurado en el App Dashboard es obligatoria: sin ella, cualquiera registra su propio endpoint apuntando al vuestro.

### 6.3 Verificación de firma

Cabecera `X-Hub-Signature-256`, valor con formato literal `sha256=<hex>`, calculado como HMAC-SHA256 del cuerpo con el App Secret. Cita oficial: *"We sign all Event Notification payloads with a SHA256 signature and include the signature in the request's X-Hub-Signature-256 header, preceded with sha256="*.

`X-Hub-Signature` (SHA1) es legacy. Se valida solo con SHA256.

```ts
const APP_SECRET = env.META_APP_SECRET;

export async function POST(request: Request) {
  // 1. Leer los BYTES una sola vez. Nunca request.json().
  const bytes = new Uint8Array(await request.arrayBuffer());

  // 2. Validar sobre los bytes exactos que llegaron.
  const firma = request.headers.get('x-hub-signature-256');
  if (!(await firmaValida(bytes, firma, APP_SECRET))) {
    // 401, no 200: una petición forjada no es una entrega de Meta y no
    // debe contar contra el reloj de desuscripción. Pero si el App Secret
    // está rotado o mal configurado, TODAS las entregas reales fallan aquí
    // y Meta desuscribe en una hora. Esta rama alerta al equipo, no solo loguea.
    await alertar('firma_invalida', { host: request.headers.get('host') });
    return new Response('signature mismatch', { status: 401 });
  }

  // 3. Encolar el cuerpo crudo. El parseo ocurre en el consumidor.
  const cuerpo = new TextDecoder().decode(bytes);
  await encolar({ recibido_en: Date.now(), cuerpo, bytes: bytes.byteLength });

  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function firmaValida(
  bytes: Uint8Array,
  cabecera: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!cabecera?.startsWith('sha256=')) return false;
  const esperado = cabecera.slice(7).toLowerCase();

  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', clave, bytes);
  const calculado = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return iguales(calculado, esperado);
}

// Comparación en tiempo constante. Un === temprano filtra el prefijo de la firma.
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

**Por qué los bytes crudos y no el JSON re-serializado.** Meta lo dice literal: *"we generate the signature using an escaped unicode version of the payload, with lowercase hex digits. If you just calculate against the decoded bytes, you will end up with a different signature."* Meta manda `äöå` como `\u00e4\u00f6\u00e5`, seis caracteres ASCII por letra. `JSON.parse` los convierte en un carácter real, y `JSON.stringify` de JavaScript no vuelve a escaparlos. También reordena claves y normaliza espaciado. El resultado es un cuerpo distinto y un HMAC distinto.

El fallo que produce esto es peor que un fallo limpio: solo aparece cuando el usuario escribe con tildes o emoji. Es decir, nunca en los tests en inglés y siempre en Venezuela, República Dominicana y México. Reglas duras:

- Leer con `request.arrayBuffer()` o `request.text()`, antes de cualquier otra cosa.
- Ningún middleware que consuma el stream antes del handler. En Express: `express.json({ verify: (req, res, buf) => { req.rawBody = buf } })`.
- Ningún proxy que reescriba el cuerpo entre Meta y el handler.
- Encolar el cuerpo crudo, no el objeto parseado. Si el consumidor necesita re-validar, necesita los mismos bytes.

### 6.4 Payloads reales

La estructura y los nombres de campo salen de la referencia oficial. Los identificadores están sustituidos por valores de ejemplo.

**Messenger — mensaje de texto entrante:**

```jsonc
{
  "object": "page",                       // objeto de Messenger
  "entry": [                              // SIEMPRE array. Iterar.
    {
      "id": "102938475610293",            // Page ID → resuelve el tenant
      "time": 1785312004871,              // epoch en MILISEGUNDOS
      "messaging": [                      // SIEMPRE array
        {
          "sender":    { "id": "7392015648120394" },   // PSID del usuario
          "recipient": { "id": "102938475610293" },    // Page ID
          "timestamp": 1785312004523,
          "message": {
            "mid": "m_AbC1dEf2GhI3jKl4MnO5pQ",         // clave de idempotencia
            "text": "¿Tienen disponible el modelo azul?"
          }
        }
      ]
    }
  ]
}
```

**Instagram — mensaje entrante que responde a una historia:**

```jsonc
{
  "object": "instagram",                  // ver 6.5: el valor NO es seguro
  "entry": [
    {
      "id": "17841400000000000",          // IG professional account ID → resuelve el tenant
      "time": 1785312191004,
      "messaging": [
        {
          "sender":    { "id": "6841100000000000" },   // IGSID, NO es un PSID
          "recipient": { "id": "17841400000000000" },
          "timestamp": 1785312190662,
          "message": {
            "mid": "aWdfZG1fMTc4NDEwMDAwMDAwMDAwMDA",
            "text": "Me interesa este",
            "reply_to": {                              // no existe en Messenger
              "story": {
                "url": "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=...&signature=...",
                "id": "17900000000000000"
              }
            }
          }
        }
      ]
    }
  ]
}
```

Esa `url` de `lookaside.fbsbx.com` se persiste. El binario no. Meta no documenta cuánto vive la URL ni si requiere token para descargarse; lo único documentado es que es *privacy-aware* y deja de servir el contenido cuando este se borra o expira. **Sin confirmar — medir empíricamente.** El fetch de esa URL pasa por allowlist de host antes de salir.

**Instagram — unsend. No es un evento aparte:**

```jsonc
{
  "object": "instagram",
  "entry": [{
    "id": "17841400000000000",
    "time": 1785312400000,
    "messaging": [{
      "sender":    { "id": "6841100000000000" },
      "recipient": { "id": "17841400000000000" },
      "timestamp": 1785312399100,
      "message": {
        "mid": "aWdfZG1fMTc4NDEwMDAwMDAwMDAwMDA",   // el MISMO mid de antes
        "is_deleted": true                           // sin text, sin attachments
      }
    }]
  }]
}
```

Es un `UPDATE` sobre la fila existente: marcar `deleted_at`, borrar adjuntos. Un `INSERT` ciego crea una fila fantasma vacía en la bandeja.

**Echo — mensaje saliente, con sender y recipient invertidos:**

```jsonc
{
  "object": "page",
  "entry": [{
    "id": "102938475610293",
    "time": 1785312500000,
    "messaging": [{
      "sender":    { "id": "102938475610293" },    // la PÁGINA, no el usuario
      "recipient": { "id": "7392015648120394" },   // el PSID
      "timestamp": 1785312499880,
      "message": {
        "mid": "m_ZyX9wVu8TsR7qPo6NmL5kJ",         // mid propio, entra por la misma clave
        "is_echo": true,
        "app_id": "1234567890",                    // quién lo envió
        "metadata": "kavea:msg:8f3a...",           // lo que Kavea pasó en el Send API
        "text": "Sí, nos queda en talla M."
      }
    }]
  }]
}
```

Un normalizador que asuma que `sender` es siempre el contacto atribuye los salientes al contacto equivocado y corrompe el hilo. `app_id` distingue lo que envió Kavea de lo que envió el cliente desde su móvil o desde Business Suite: sin esa distinción, el agente de IA se responde a sí mismo en bucle. Un echo **no** reabre la ventana de 24 h; la ventana se calcula sobre `last_incoming_at`.

Sobre el App ID de la bandeja de Meta Business Suite: la página de Conversation Routing indica `263902037430900` (15 dígitos) y la referencia de `message_echoes` muestra `26390203743090` (14 dígitos). Es casi con certeza una errata, pero **sin confirmar — verificar empíricamente** antes de hardcodearlo en la lógica anti-bucle.

### 6.5 Las diferencias que obligan a dos normalizadores

El objeto raíz de `messaging[]` no siempre es `message`. Puede ser `reaction`, `postback`, `read`, `delivery`, `message_edit`, `referral` u `optin`. Un `evt.message.mid` sin comprobar explota con la primera reacción. El despacho se hace por qué clave existe, no por suposición.

Además del array `messaging[]`, el parser lee `standby[]`. Cuando la bandeja de Meta Business Suite se apropia del hilo —al mover la conversación a Main o al responder un agente—, Kavea deja de recibir en `messaging[]` y pasa a `standby[]`. Los postbacks entregados por standby **no incluyen** el campo `payload`: cualquier lógica que dependa de `postback.payload` falla en silencio al perder la propiedad del hilo.

Existe una tercera forma, `entry[].changes[]` con `{field, value}`, para eventos de contenido (comentarios, menciones). Los comentarios están fuera de v1: el handler los registra y los descarta sin lanzar excepción, nunca los ignora reventando el lote.

| | Messenger | Instagram |
|---|---|---|
| Valor de `object` | `page` | `instagram` — **contradicción documental sin resolver** |
| `entry[].id` | Page ID | IG professional account ID |
| `sender.id` entrante | PSID | IGSID. Espacio de identificadores distinto, no intercambiable |
| Acuse de lectura | `message_reads` con `read.watermark` (marca temporal: "todo lo anterior leído") | `messaging_seen` con `read.mid` (un mensaje concreto) |
| Acuse de entrega | `message_deliveries` con `delivery.watermark` y `delivery.mids[]` | No existe |
| Respuesta a historia | No existe | `message.reply_to.story` con `url` e `id` |
| Mención en historia | No existe | attachment `story_mention` |
| Tipos de adjunto propios | `sticker`, `appointment_booking`, `fallback`, `template` | `story_mention`, `ig_reel`, `ephemeral`, `share`/`ig_post` |
| Reengagement fuera de 24 h | Sponsored Messages, One-Time Notifications | Nada. Solo `HUMAN_AGENT` y private reply |
| `messaging_type` en el envío | `RESPONSE` / `MESSAGE_TAG` | Los ejemplos oficiales no lo incluyen |

Los dos modelos de acuse no comparten columna: un watermark no identifica un mensaje y un mid no identifica un instante. Colapsarlos en un campo pierde semántica en ambos sentidos.

**Dos contradicciones oficiales que condicionan el diseño y que ninguna sección puede resolver:**

1. **El valor de `object`.** `/docs/messenger-platform/instagram/features/webhook` muestra todos los payloads de Instagram con `"object":"instagram"`. `/docs/instagram-platform/webhooks` describe el objeto de la vía Facebook Login como *"Represents the Facebook Page linked to your app user's Instagram professional account"*. El handler acepta ambos valores y **enruta por `entry[].id`**, nunca por `object`.
2. **Qué campos están disponibles en la vía Facebook Login.** La tabla de `/docs/instagram-platform/webhooks` declara que en esa configuración **no** están disponibles `message_reactions`, `standby`, `message_echoes`, `messaging_handover` ni `messaging_optins`. La página de `/docs/messenger-platform/instagram/features/webhook` sí lista `message_reactions` y `standby` como suscribibles. **No dar por hecho ninguno de los dos sin prueba empírica.** `message_edit` aparece en el changelog del 10-sep-2025 pero no en la tabla viva de campos.

Hay también discrepancia de nomenclatura entre páginas: `messaging_referral` vs `messaging_referrals`, `messaging_handover` vs `messaging_handovers`, `message_reactions` vs `messaging_reactions`. **Sin confirmar — verificar en consola** qué valores acepta el enum de `subscribed_fields` antes de escribir la llamada de suscripción del onboarding.

Deadline confirmado verbatim: después del **30 de agosto de 2026** los stickers de Messenger dejan de llegar duplicados como `image` y solo llegan como `sticker`. Un parser que dependa del tipo `image` para verlos deja de verlos ese día.

### 6.6 Entrega, reintentos y desuscripción automática

Hay dos políticas documentadas, ambas verificadas literalmente, en páginas distintas que Meta no reconcilia:

- **Graph API Webhooks:** *"If any update sent to your server fails, we will retry immediately, then try a few more times with decreasing frequency over the next 36 hours"* y *"Unacknowledged responses will be dropped after 36 hours"*.
- **Messenger Platform Webhooks:** a los 15 minutos de entregas fallidas se envía una alerta a la cuenta de desarrollador; tras **1 hora** de fallos continuados llega una alerta *"Webhooks Disabled"* y la app queda **desuscrita** de esa Página o cuenta de Instagram, con resuscripción manual.

Se asume la más agresiva. El backoff exacto dentro de esa primera hora no está documentado: **sin confirmar — medir en staging provocando 500 deliberados.**

La consecuencia operativa es que una caída de una hora no degrada Kavea, la apaga por cliente y en silencio. De ahí sale un requisito no negociable: un cron de reconciliación que consulte `GET /{id}/subscribed_apps` por cada organización conectada, compare los `subscribed_fields` devueltos contra los esperados, re-suscriba lo que falte y alerte internamente. Se ejecuta contra `page_id` y contra `ig_business_account_id`.

Sobre orden y duplicados, Meta es explícito: *"Event Notifications are aggregated and sent in a batch with a maximum of 1000 updates. However batching cannot be guaranteed"* y *"Your server should handle deduplication in these cases"*. No hay garantía de orden; hay que ordenar por el `timestamp` del evento, que viene en milisegundos. La bandeja con Supabase Realtime tiene que tolerar inserciones que van hacia atrás en el hilo.

### 6.7 Idempotencia

La clave canónica de mensajes es:

```sql
UNIQUE (organization_id, canal, mid)
```

con `INSERT ... ON CONFLICT DO NOTHING`. `mid` es `entry[].messaging[].message.mid`, y `entry[].standby[].message.mid`, que es el mismo espacio. `canal ∈ {messenger, instagram}`.

Lleva `organization_id` porque la referencia oficial del evento `messages` define `mid` únicamente como *"Message ID"*. No existe ninguna afirmación de Meta sobre el ámbito de unicidad de `mid` ni sobre su estabilidad temporal. Al no estar documentado el ámbito, la clave se acota por tenant. No se usa `UNIQUE(mid)` global.

**Eventos sin `mid` propio.** Reacciones, lecturas, entregas y postbacks no tienen identificador propio. Derivan la suya:

- Reacción: `(organization_id, canal, 'reaction', reaction.mid, sender.id, reaction.action, timestamp)`. Nótese que `reaction.mid` referencia el mensaje reaccionado, no la reacción.
- Lectura de Messenger: `read.watermark` es una marca temporal, no identifica un mensaje.
- Lectura de Instagram: `messaging_seen` usa `read.mid`.

**Borrados y ediciones** llegan con el mismo `mid` y son `UPDATE`, nunca `INSERT`.

**Echoes** traen su propio `mid` y entran por la misma clave. No se deduplican contra el mensaje que Kavea envió por el Send API: se correlacionan por el `message_id` que devuelve el Send API en la respuesta, o por el campo `metadata` que se pasa en el envío y vuelve en el echo.

**Segunda capa: creación de conversaciones.** La idempotencia de mensajes no protege de conversaciones duplicadas. Cuando alguien manda tres fotos seguidas llegan webhooks paralelos y un patrón "buscar o crear" crea tres conversaciones. Chatwoot necesitó un mutex distribuido en Redis con TTL de 3 s y admite que no garantiza orden. En Postgres se resuelve mejor, con la constraint única parcial de §7.4 más `ON CONFLICT DO NOTHING RETURNING`, o con `pg_advisory_xact_lock` sobre el hash de `(canal, contacto)`.

### 6.8 Callbacks de la app: deauthorize y data deletion

Son dos cosas distintas y ambas se implementan. Las dos reciben `signed_request` con formato `<sig>.<payload_base64url>`, y el HMAC-SHA256 se calcula **sobre la cadena base64 sin decodificar**. Es un mecanismo de verificación diferente al de `X-Hub-Signature-256`: son dos rutas de código separadas y no comparten helper.

```ts
function verificarSignedRequest(signed: string, appSecret: string) {
  const [sigB64, payloadB64] = signed.split('.');
  // El HMAC se calcula sobre payloadB64 TAL CUAL, antes de decodificar.
  // ...comparación en tiempo constante...
  // El payload decodificado trae: algorithm, expires, issued_at, user_id (app-scoped).
}
```

**Data Deletion Request Callback.** Responde JSON con exactamente `{ url, confirmation_code }`. El `user_id` que llega es un **App-Scoped ID**, que no es el PSID ni el IGSID que llegan en los webhooks de mensajería. Chatwoot tiene un issue abierto justamente por no poder resolver esa correspondencia. Por eso la tabla de identidades lleva `app_scoped_id` en una columna separada desde el día uno (§7.3).

**Deauthorize Callback.** Su existencia está confirmada por una línea de la guía de Manual Login Flow: *"You can enable a deauthorize callback through the App Dashboard"*. La ruta del menú, el nombre exacto del campo y el formato `signed_request` para **este** callback concreto no están documentados oficialmente. **Sin confirmar — verificar en el App Dashboard real antes de implementar.** Su función es que, cuando un cliente revoca el acceso, Kavea marque esa organización como desconectada en vez de acumular errores 190 en silencio.

Un detalle que rechaza App Reviews sin explicación: la política de privacidad tiene que devolver 200 al crawler de Meta. Si kavea.ai tiene protección de bots agresiva, el review se rechaza por enlace roto.

---

## 7. Modelo de datos

DDL para Postgres 15+ sobre Supabase. Convenciones: nombres en inglés salvo `canal`, que es la columna que fija la decisión de idempotencia. Vocabularios propios como `text` con `CHECK` o dominio, nunca `enum`: Meta añade valores sin avisar y un `enum` convierte un tipo desconocido en un `INSERT` fallido que tumba el lote entero. Los vocabularios de Meta (tipo de adjunto, valor de reacción) van en `text` sin restricción.

Todos los `timestamp` de Meta vienen en **milisegundos**. Se almacena el entero verbatim y la marca temporal se deriva. Así el error de segundos-vs-milisegundos no se puede cometer en silencio.

### 7.1 Base

```sql
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
  updated_at  timestamptz not null default now()
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

### 7.2 Conexiones de Meta y enrutado

```sql
create table public.meta_connections (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  page_id                 text not null,
  page_name               text,
  ig_business_account_id  text,          -- null si el cliente todavía no vinculó IG
  ig_username             text,

  business_id       text,                -- business portfolio del cliente
  config_id         text,                -- configuración de Facebook Login for Business usada
  graph_api_version text not null default 'v26.0',

  -- Estado de suscripción. Lo escribe el cron de reconciliación de §6.6.
  subscribed_fields_messenger  text[] not null default '{}',
  subscribed_fields_instagram  text[] not null default '{}',
  last_subscription_check_at   timestamptz,
  subscription_ok              boolean not null default false,

  -- GET /me?fields=messaging_feature_status → {hop_v2, msgr_multi_app, ig_multi_app}
  messaging_feature_status          jsonb,
  default_application_confirmed_at  timestamptz,

  -- Salud del token. Se marca al recibir error 190; el envío PARA, no reintenta en bucle.
  token_last_verified_at  timestamptz,
  token_invalid_since     timestamptz,

  estado      text not null default 'connected'
                check (estado in ('connected', 'degraded', 'disconnected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint meta_connections_page_unica unique (page_id)
);

-- Una cuenta de IG pertenece a una sola organización. Igual que la Página.
create unique index meta_connections_ig_unica
  on public.meta_connections (ig_business_account_id)
  where ig_business_account_id is not null;

create index meta_connections_org_idx
  on public.meta_connections (organization_id);
```

La tabla de enrutado aplana `page_id` e `ig_business_account_id` en una sola columna, para que resolver `entry[].id` sea un único acierto de índice antes de tocar nada más:

```sql
create table public.meta_asset_routes (
  asset_id            text primary key,   -- tal como llega en entry[].id
  tipo                text not null check (tipo in ('page', 'ig_business_account')),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id  uuid not null references public.meta_connections(id) on delete cascade,
  created_at          timestamptz not null default now()
);
```

`asset_id` es la primary key, no un índice cualquiera. Eso obliga a que la resolución sea una función: un `entry[].id` mapea a exactamente una organización o a ninguna. Si mapeara a dos, se escribirían mensajes de un cliente en el tenant de otro, que es el peor fallo posible bajo RLS. Un `entry[].id` que no resuelve se registra y se descarta; nunca se adivina.

```sql
create table public.channels (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  meta_connection_id  uuid not null references public.meta_connections(id) on delete cascade,
  canal               canal_meta not null,
  nombre              text not null,

  -- Kill-switch por canal y por tenant. Meta puede restringir la app sin aviso.
  activo          boolean not null default true,
  pausado_motivo  text,
  pausado_desde   timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint channels_unico unique (meta_connection_id, canal)
);

create index channels_org_idx on public.channels (organization_id, canal);
```

### 7.3 Contactos e identidades

```sql
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
  updated_at  timestamptz not null default now()
);

create index contacts_org_idx on public.contacts (organization_id);

create table public.contact_identities (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  canal            canal_meta not null,

  -- PSID en messenger, IGSID en instagram. Espacios distintos, no intercambiables,
  -- no portables entre apps.
  scoped_id  text not null,

  -- Columna SEPARADA. Las solicitudes de borrado de datos de Meta llegan con un
  -- App-Scoped ID que no es ninguno de los dos.
  app_scoped_id  text,

  created_at  timestamptz not null default now(),

  constraint contact_identities_unica unique (organization_id, canal, scoped_id)
);

create index contact_identities_contact_idx
  on public.contact_identities (contact_id);

create index contact_identities_app_scoped_idx
  on public.contact_identities (app_scoped_id)
  where app_scoped_id is not null;
```

### 7.4 Conversaciones

```sql
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  channel_id       uuid not null references public.channels(id) on delete cascade,
  canal            canal_meta not null,
  contact_id       uuid not null references public.contacts(id) on delete cascade,

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
  updated_at  timestamptz not null default now()
);

-- Segunda capa de idempotencia: impide que tres fotos seguidas creen tres conversaciones.
create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where status = 'open';

create index conversations_bandeja_idx
  on public.conversations (organization_id, channel_id, status, last_message_at desc);
```

### 7.5 Mensajes, eventos y media

```sql
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  canal            canal_meta not null,

  mid        text not null,
  direccion  text not null check (direccion in ('inbound', 'outbound')),

  is_echo  boolean not null default false,
  app_id   text,     -- distingue lo enviado por Kavea de lo enviado por el cliente por fuera
  metadata text,     -- el `metadata` pasado en el Send API, que vuelve en el echo

  -- message_id devuelto por el Send API. Correlaciona el envío con su echo.
  send_api_message_id  text,

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
  constraint messages_idempotencia unique (organization_id, canal, mid)
);

create index messages_hilo_idx
  on public.messages (conversation_id, meta_timestamp desc);

create index messages_send_api_idx
  on public.messages (organization_id, send_api_message_id)
  where send_api_message_id is not null;

create index messages_metadata_idx
  on public.messages (organization_id, metadata)
  where metadata is not null;
```

Eventos sin `mid` propio. Cada uno deriva su clave y la constraint la impone la base de datos, no el código de ingesta:

```sql
create table public.message_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  conversation_id  uuid references public.conversations(id) on delete cascade,
  canal            canal_meta not null,

  -- Sin CHECK cerrado a propósito: Meta añade sub-eventos sin aviso.
  tipo  text not null,   -- reaction | read | delivery | postback | edit | handover | referral | optin

  -- Reacción: target_mid referencia el mensaje REACCIONADO, no la reacción.
  target_mid        text,
  actor_scoped_id   text,
  accion            text,   -- reaction.action: react | unreact
  emoji             text,
  reaction          text,   -- valor crudo de Meta, sin validar

  -- Acuses. Modelos distintos por canal, columnas distintas a propósito.
  read_watermark_ms  bigint,   -- Messenger: "todo lo anterior leído". No identifica un mensaje.
  read_mid           text,     -- Instagram messaging_seen: un mid concreto.
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

  constraint message_events_dedupe unique (organization_id, canal, tipo, clave_dedupe)
);

create index message_events_conv_idx
  on public.message_events (conversation_id, meta_timestamp desc);
```

Media. La separación entre media entrante de Meta y media saliente propia la impone un `CHECK`, no la disciplina del equipo:

> **Enmienda del 2 de agosto de 2026.** El almacén saliente pasa de Cloudflare R2 a
> **Supabase Storage**, porque el stack se cerró en dos proveedores. Cambian solo los nombres:
> `origen = 'kavea_r2'` → `'kavea_storage'`, `r2_bucket` → `storage_bucket`, `r2_key` →
> `storage_path`, y el `CHECK` en consecuencia.
>
> **Lo que no cambia y es lo que importa de esta tabla:** la media entrante de Meta se
> persiste como URL y nada más, nunca el binario. Es invariante del `03` y almacenarla es
> causa documentada de rechazo del App Review. El `CHECK` que separa ambos orígenes sigue
> siendo la garantía, no la disciplina del equipo.
>
> La migración con los nombres nuevos la escribe la fase 0. Ver `06` §1.1.

```sql
create table public.media (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  message_id       uuid not null references public.messages(id) on delete cascade,

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
  )
);

create index media_message_idx on public.media (message_id);
```

Meta rechaza App Reviews por cachear el media entrante; es la causa documentada del rechazo a usuarios de Chatwoot. El `CHECK` es lo que impide que un `INSERT` distraído lo haga.

### 7.6 Bitácora de webhooks

```sql
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
```

Esta tabla **no lleva `organization_id`**. Un lote puede traer hasta 1000 updates de assets distintos y Meta no garantiza que sean todos del mismo tenant. La fila cruda es anterior al enrutado, así que es potencialmente multi-tenant: no puede quedar bajo RLS de organización y no se expone a la API. Solo la toca el rol de servicio.

### 7.7 RLS multi-tenant

RLS activado en todas las tablas, sin excepción. Una tabla sin RLS en Supabase es pública a través de PostgREST.

```sql
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.meta_connections     enable row level security;
alter table public.meta_asset_routes    enable row level security;
alter table public.channels             enable row level security;
alter table public.contacts             enable row level security;
alter table public.contact_identities   enable row level security;
alter table public.conversations        enable row level security;
alter table public.messages             enable row level security;
alter table public.message_events       enable row level security;
alter table public.media                enable row level security;
alter table public.webhook_events       enable row level security;  -- cero políticas: deniega todo

create or replace function public.es_miembro(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.es_miembro(uuid) from anon;

-- Patrón, repetido en cada tabla con organization_id.
create policy messages_select on public.messages
  for select to authenticated
  using (public.es_miembro(organization_id));

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.es_miembro(organization_id));

create policy conversations_update on public.conversations
  for update to authenticated
  using (public.es_miembro(organization_id))
  with check (public.es_miembro(organization_id));
```

Tres puntos que deciden si esto funciona:

1. **`(select auth.uid())`, no `auth.uid()`.** Envuelto en subconsulta, el planificador lo evalúa una vez como InitPlan en lugar de una vez por fila. En una bandeja con cientos de miles de mensajes la diferencia no es cosmética.
2. **Índice sobre `organization_id` en cada tabla.** La política es un predicado más; sin índice, cada lectura de bandeja es un escaneo secuencial filtrado.
3. **RLS protege la lectura, no la escritura de ingesta.** El worker de webhooks usa el rol de servicio y salta RLS por diseño: tiene que poder escribir en cualquier tenant. Lo que impide que escriba en el tenant equivocado no es RLS, es la primary key de `meta_asset_routes`. Confundir las dos cosas es cómo se llega a un incidente de cruce de datos con RLS "activado".

Las escrituras desde la UI (asignar conversación, enviar un mensaje, cerrar) no usan el rol de servicio: pasan por políticas con `WITH CHECK`, para que un `organization_id` falsificado en el cuerpo de la petición se rechace en la base de datos.

### 7.8 Cifrado de tokens en reposo

El Page Access Token de un cliente en texto plano es un incidente de seguridad, no una deuda técnica. Con ese token se leen y se envían todos los mensajes de esa Página y de esa cuenta de Instagram, y los tokens derivados de un user token de larga duración no expiran por tiempo.

Los tokens no viven en `public`, ni cifrados:

```sql
create schema if not exists private;
revoke all on schema private from anon, authenticated;

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
```

Decisiones y por qué:

- **Esquema `private`, no expuesto por la API.** Supabase publica solo los esquemas listados en la configuración de la API. `meta_connections` queda en `public` con el estado de la conexión —lo que la UI necesita mostrar— y el material criptográfico queda fuera de alcance. Así ninguna política mal escrita puede filtrar ni el ciphertext.
- **Cifrado en la aplicación, no en la base de datos.** AES-256-GCM con `crypto.subtle` en el Worker, con la clave en el almacén de secretos del Worker. Un volcado de la base de datos no contiene la clave. Supabase Vault es la alternativa gestionada dentro de la plataforma; **sin confirmar — verificar la API vigente** antes de apoyarse en ella, porque el mecanismo de cifrado transparente de Supabase ha cambiado más de una vez.
- **`kid` desde el primer día.** Sin identificador de clave, rotar significa descifrar y volver a cifrar todo a la vez, con ventana de indisponibilidad. Con `kid`, la rotación es perezosa.
- **El token nunca aparece en un log.** Los ejemplos de Meta pasan el token en la query string (`?access_token=...`). Si se envía por cabecera `Authorization: Bearer`, eso no está confirmado en el material verificado: **sin confirmar — comprobar en el Graph API Explorer.** Mientras tanto, el cliente HTTP no registra URLs completas y el manejador de errores recorta cualquier cadena que contenga `access_token=` antes de escribirla.
- **`token_invalid_since` en `meta_connections` es público a propósito.** Cuando llega un error 190, el tenant se marca como desconectado y el envío para. La UI necesita leer ese estado para mostrar el banner; no necesita leer el token.

---

## 8. Envío de mensajes

### 8.1 Endpoints exactos

Los dos canales van al mismo host y usan el mismo token: `graph.facebook.com` con el Page Access Token del tenant. La versión sale de la variable `GRAPH_API_VERSION=v26.0`, leída por todos los clientes HTTP. Nunca escrita a mano en un path.

**Facebook Messenger**

```http
POST https://graph.facebook.com/v26.0/{PAGE_ID}/messages?access_token=<PAGE_ACCESS_TOKEN>
Content-Type: application/json

{
  "recipient": { "id": "<PSID>" },
  "messaging_type": "RESPONSE",
  "message": { "text": "Hola, ya reviso tu pedido." }
}
```

Respuesta: `{"recipient_id":"<PSID>","message_id":"<MID>"}`

Se fija la forma con `{PAGE_ID}` explícito, que es la que documenta la página de Send Messages. El tenant destino queda escrito en la llamada, así que un fallo de selección de token falla en voz alta en vez de mandar desde la Página equivocada. `/me/messages` es equivalente con el mismo token, pero no se usa.

**Instagram Direct**

```http
POST https://graph.facebook.com/v26.0/me/messages?access_token=<PAGE_ACCESS_TOKEN>
Content-Type: application/x-www-form-urlencoded

recipient={"id":"<IGSID>"}&message={"text":"Hola, ya reviso tu pedido."}
```

Respuesta: `{"recipient_id":"<IGSID>","message_id":"<MID>"}`

Es la Instagram Messaging API del Messenger Platform, no Instagram Platform. `/me` resuelve a la Página vinculada, de modo que el tenant lo determina qué token se usa: la selección de token por organización es la frontera de seguridad, no el path. Se fija `/me/messages` porque es la forma que Meta documenta literalmente para Instagram vía Facebook Login. La forma `/{PAGE_ID}/messages` es plausible y coherente con Messenger, pero no está documentada literalmente para Instagram: no cambiar a esa forma sin comprobarlo en el Graph API Explorer.

**Dos detalles que muerden.**

El `message_id` de la respuesta es lo que correlaciona el envío con el echo que llegará después por webhook. Se persiste en la misma transacción del envío, o el echo entra como mensaje entrante duplicado.

El límite de texto está en bytes, verbatim: *"Message text must be UTF-8 and be 1,000 bytes or less"*. Con acentos y emojis el margen real es bastante menor. Las respuestas del agente de IA se truncan o se parten midiendo bytes, nunca `String.length`.

**Sobre `messaging_type`.** Los strings literales `RESPONSE`, `UPDATE` y `MESSAGE_TAG` no se pudieron confirmar en fuente oficial: la página de Send Messages renderiza las etiquetas humanas *Response*, *Updates* y *Tagged Message*, y la referencia de la Send API devuelve solo navegación. Solo están corroborados en SDKs de terceros. Además, los ejemplos oficiales de envío por Instagram no incluyen `messaging_type` y no está confirmado si es obligatorio en ese canal. No hardcodear validaciones estrictas del enum sin una llamada real — sin confirmar, verificar en consola.

### 8.2 Cómo sabe el sistema si la ventana está abierta

La ventana se calcula por conversación, nunca con un flag global. Chatwoot usa un flag global 24 h / 7 d y esa es la implementación incorrecta: activarlo hace que todos los mensajes salgan etiquetados incluso dentro de la ventana.

Cada conversación lleva una columna `last_incoming_at`. Se actualiza **solo** con eventos entrantes del usuario. Δ = `now() - last_incoming_at` es lo único que decide qué se puede enviar. Un echo saliente no toca esa columna.

Qué abre o reabre la ventana, según la lista de la página de Send Messages:

- La persona envía un mensaje a la Página o a la cuenta profesional de Instagram.
- Pulsa un botón call-to-action tipo Get Started.
- Interactúa con un anuncio Click-to-Messenger y arranca la conversación.
- Inicia conversación vía plugin (Send to Messenger, Checkbox).
- Pulsa un enlace `m.me` o `ig.me` con parámetro `ref` **hacia una conversación existente**.
- Reacciona a un mensaje.

Hay dos disparadores en disputa entre páginas oficiales de Meta: *comentar una publicación* y *publicar una entrada de visitante en la Página* aparecen en la página de Send Messages y no aparecen en la página de Policy. Dos verificadores abrieron cada uno su página. Como en v1 no se suscriben comentarios, el punto es discutible: la regla de diseño es no mover el reloj por nada que Kavea no reciba como evento en `messaging[]`.

**El enlace `ig.me` con `?ref=` resetea la ventana de Instagram.** Verbatim: *"This action resets the 24-hour window for standard messaging, allowing the app to reply after getting the webhook event with the ref parameter."* Formato `https://ig.me/m/<USERNAME>?ref=<REF_PARAM>`, máximo 2.083 caracteres, solo alfanuméricos y `-` `_` `=`. Llega con `"referral":{"ref":"...","source":"SHORTLINKS","type":"OPEN_THREAD"}` y exige suscripción al webhook de referral. Ojo con el nombre exacto del campo en `subscribed_fields`: hay discrepancia entre páginas (`messaging_referral` vs `messaging_referrals`) — sin confirmar, verificar en consola antes de escribir la llamada de suscripción.

### 8.3 Qué hace el sistema con la ventana cerrada

| Δ desde `last_incoming_at` | Messenger | Instagram |
|---|---|---|
| < 24 h | `messaging_type: RESPONSE`, sin tag | Envío normal. Ver la incertidumbre de `messaging_type` en 8.1 |
| 24 h – 7 días, emisor **humano real** | `messaging_type: MESSAGE_TAG` + `tag: HUMAN_AGENT` | `HUMAN_AGENT` |
| 24 h – 7 días, emisor **agente de IA** | Bloqueado por Kavea | Bloqueado por Kavea |
| > 7 días | Imposible | Imposible |

Con la ventana cerrada, la UI deshabilita el compositor y explica por qué. No se encola un envío que la API va a rechazar.

**Tags muertos.** Desde el 27 de abril de 2026, `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` y `POST_PURCHASE_UPDATE` devuelven error code 100. No es una advertencia futura, es el estado actual. No implementarlos y desconfiar de cualquier SDK o ejemplo de terceros que los use: Chatwoot los hardcodeaba y sus envíos de Messenger se rompieron en junio de 2026.

**Ruta de migración para contenido promocional fuera de ventana, en Messenger.** La página de Send Messages dice literalmente que hay que usar Sponsored Messages o One-Time Notifications. No son Utility Templates: esa equivalencia se refutó. Las Utility Messages existen, con permiso `page_utility_messaging` y webhook `message_template_status_update`, pero no están documentadas como el reemplazo de los tags. Son productos distintos, con permisos y economía distintos, y no entran en v1.

**En Instagram no existe nada de esto.** No hay One-Time Notifications, Sponsored Messages, News Messaging, Marketing Messages API ni Utility Templates. Las únicas palancas reales son HUMAN_AGENT, el private reply a un comentario (7 días, un solo mensaje, v1.1) y el enlace `ig.me` con `?ref=`. Ninguna sección comercial puede prometer recuperación de carritos ni campañas de reengagement por Instagram Direct.

### 8.4 HUMAN_AGENT

No es un permiso: es una **feature**. Se somete a App Review por separado, con su propio screencast, y exige verificación de negocio. Verbatim de la referencia de features: *"requires successful completion of the App Review process before your app can access live data"* y *"only available with business verification"*.

Dura **7 días** desde el mensaje del usuario. El uso permitido que documenta Meta es dar soporte de agente humano cuando el problema no se resuelve en la ventana estándar: negocio cerrado el fin de semana, incidencia que tarda más de 24 horas.

Sintaxis en Messenger:

```json
{
  "recipient": { "id": "<PSID>" },
  "messaging_type": "MESSAGE_TAG",
  "tag": "HUMAN_AGENT",
  "message": { "text": "..." }
}
```

**¿Está disponible en Instagram?** Sí, pero la fuente es otra. La página `/docs/features-reference/human-agent` no menciona Instagram en ningún punto. Lo que sí está confirmado es que el overview de Instagram Platform lista la feature Human Agent como requisito de la vía Facebook Login. La misma feature cubre los dos canales y se somete una sola vez.

**Sobre la prohibición de usarlo con bots.** La regla operativa de Kavea es que los agentes de IA nunca emiten con `HUMAN_AGENT`. Conviene decir con precisión de dónde sale: la prohibición explícita de mensajes automatizados con este tag **no** aparece en las páginas de Meta que se abrieron; la formulación explícita procede de respond.io, que es fuente de terceros. La decisión se mantiene por prudencia y porque el uso documentado por Meta es intervención humana, no por una cita. El abuso de tags está documentado como causa de restricción de mensajería de la Página.

Existe un endpoint, `extend_thread_control`, que permite extender el control del hilo hasta 7 días. No es un sustituto de esta feature: ver 9.4.

### 8.5 Tipos de mensaje enviables por canal

| | Instagram Direct | Facebook Messenger |
|---|---|---|
| Texto | Sí, ≤ 1.000 bytes UTF-8 | Sí |
| Imagen | png, jpeg, ≤ 8 MB. Hasta 10 por petición desde el 6-may-2026 | image por URL |
| Audio | aac, m4a, wav, mp4, ≤ 25 MB | audio |
| Vídeo | mp4, ogg, avi, mov, webm, ≤ 25 MB | video |
| Documento | PDF ≤ 25 MB | file |
| Sticker | Solo corazón (`like_heart`) | Sticker API con `sticker_id`. Verbatim: *"Only public, free, first-party stickers can be sent"*. Pulgar arriba = `369239263222822`. Búsqueda: mínimo 2 caracteres y parámetro `locale` obligatorio para idiomas no ingleses |
| Reacción emoji | Sí | Sí |
| Compartir post | `MEDIA_SHARE`, solo contenido propio: *"Your app user must own any media or posts to be used in the message"* | Sin confirmar para esta vía |
| Quick replies | Máximo 13 por mensaje, título truncado a 20 caracteres. El límite de 1.000 caracteres del payload y el content_type `user_email` **no** están confirmados | Sin confirmar: la referencia de Messenger no se pudo extraer |
| Templates genéricos y botones | No aplica | **NO_VERIFICABLE**: la página de referencia de templates devuelve solo navegación. El límite de 3 botones, el carrusel y el flag `is_reusable` con `attachment_id` no están confirmados |
| Mensajería de grupo | No existe | No aplica en v1 |

Dos consecuencias de producto. Primera: la reutilización de media por `attachment_id` está sin confirmar para la vía elegida, así que el diseño no puede depender de ella para evitar re-subir binarios desde R2. Segunda: el carril de audio y vídeo tiene un límite de envío 30 veces menor que el de texto en Messenger — ver 10.1.

---

## 9. Handover Protocol

### 9.1 El nombre está muerto, el problema no

Verbatim de la documentación oficial: *"Meta no longer supports Handover Protocol for Messenger and all the businesses are migrated to Conversation Routing"*. Lo mismo para Instagram. El modelo mental ya no es primary receiver y secondary receiver: es **default application** y **thread owner**, con dos estados de hilo.

- **Idle**: no hay mensaje del usuario al negocio en las últimas 24 horas, o el dueño actual liberó el control. En Idle, solo la default application puede enviar.
- **Active**: hay conversación en curso con un dueño.

Pero el término viejo sigue llegando en vivo. El sub-evento `app_roles` del webhook de handovers emite payloads como `"app_roles":{"123456789":["primary_receiver"]}`. El parser de Kavea tiene que reconocer y persistir ese string aunque el modelo conceptual ya no lo use. Ignorarlo porque "eso está deprecado" pierde el evento que dice quién manda.

Esto no aparece en desarrollo. En desarrollo hay una sola app conectada, todo llega por `messaging[]` y todo funciona. Aparece el día que un cliente real abre Meta Business Suite.

### 9.2 Qué pasa cuando el cliente abre Meta Business Suite

La Bandeja de Meta Business Suite es una aplicación más conectada a la Página, con su propio App ID. Y se apropia del hilo sola: *"if you move a message to the Main folder or respond to a message in a conversation not controlled by the inbox, the inbox takes control of the conversation"*.

O sea: el cliente de Boosty contesta un DM desde el móvil o desde Business Suite y, sin avisar a nadie, Kavea deja de ser el dueño de ese hilo.

A partir de ese momento los eventos de esa conversación dejan de llegar en `entry[].messaging[]` y llegan en `entry[].standby[]`. No hay error. No hay código de estado. No hay log. Si el parser solo lee `messaging[]`, Kavea se queda ciega y muda para ese cliente y nadie se entera hasta que el cliente reclama.

Hay además una pérdida de datos dentro de standby, verbatim: *"messaging_postback events delivered via the Standby channel will not include the postback payload"*. Solo la app que envió originalmente el botón recibe el payload completo por el canal normal. Cualquier lógica que dependa de `postback.payload` falla en silencio justo cuando se pierde la propiedad del hilo.

**App IDs de la bandeja.** La página de Conversation Routing indica `263902037430900` para Facebook y `1217981644879628` para Instagram. La referencia de `message_echoes` muestra `26390203743090` — catorce dígitos frente a quince. La discrepancia está confirmada por el verificador. Casi con certeza es una errata en la página de echoes, pero hay que comprobarlo empíricamente antes de hardcodearlo en la lógica anti-bucle.

**Disponibilidad de standby en Instagram: sin confirmar.** La tabla de `/docs/instagram-platform/webhooks` declara que en la configuración Facebook Login **no** están disponibles `standby`, `message_reactions`, `message_echoes`, `messaging_handover` ni `messaging_optins`. La página de `/docs/messenger-platform/instagram/features/webhook` sí lista `standby` y `message_reactions` como suscribibles. Son dos páginas oficiales en contradicción. Kavea se suscribe a lo que el enum acepte y comprueba empíricamente qué llega en Instagram antes de dar por hecho que el mecanismo de standby existe en ese canal.

### 9.3 Echoes: la otra mitad del problema

Los echoes no son opcional. Los clientes de Boosty van a seguir respondiendo desde el móvil y desde Business Suite pase lo que pase, y sin echoes la bandeja muestra conversaciones a medias y el agente de IA responde cosas ya contestadas.

En un echo (`is_echo: true`) el `sender` y el `recipient` están **invertidos**: `sender.id` es la Página o el IGID, `recipient.id` es el PSID o IGSID del contacto. Un normalizador que asuma que `sender` es siempre el cliente atribuye los mensajes salientes al contacto equivocado y corrompe el hilo.

El campo `app_id` dice quién lo envió. Verbatim de la referencia: *"Starting Graph API v12.0+, app_id field will return Facebook Page inbox app id (26390203743090) whenever the message is sent via Facebook Page inbox"*.

Reglas de ingesta:

- `app_id` = app de Kavea → es un mensaje propio. No se deduplica contra el envío por `mid`: se correlaciona por el `message_id` que devolvió el Send API, o por el campo `metadata` que se pasó al enviar y vuelve en el echo. No re-dispara el agente.
- `app_id` = App ID de la bandeja de Business Suite → mensaje escrito por un humano del cliente fuera de Kavea. Se ingesta, se muestra en la bandeja, y **no** re-dispara el agente.
- `app_id` desconocido → hay una tercera herramienta conectada. Se ingesta, se registra métrica y se levanta alerta en el panel interno de Boosty.

Un echo no reabre la ventana de 24 horas. Nunca toca `last_incoming_at`.

### 9.4 Los seis endpoints y cómo se consulta el estado

No son tres, son seis:

| Endpoint | Para qué |
|---|---|
| `POST /{PAGE_ID}/pass_thread_control` | Entregar el hilo a otra app. Parámetros `recipient`, `target_app_id`, `metadata` |
| `POST /{PAGE_ID}/release_thread_control` | Soltar el hilo sin elegir destinatario. Vuelve a Idle o a la default application |
| `POST /{PAGE_ID}/take_thread_control` | Tomar el control. Bloqueado si no hay default application configurada |
| `POST /{PAGE_ID}/request_thread_control` | Pedir el control a la app que lo tiene |
| `POST /{PAGE_ID}/extend_thread_control` | `duration` en segundos. La doc dice *"extend the time up to 7 days"* |
| `GET /{PAGE_ID}/thread_owner?recipient=<PSID>` | Consulta puntual y barata de quién posee un hilo |

Sobre `extend_thread_control`: el endpoint existe y está documentado. Lo que **no** está establecido es si extender el control del hilo extiende también la ventana de mensajería a efectos de política, ni si evita el App Review de la feature Human Agent. Esa equivalencia es una inferencia, no un hecho. No presentarlo como sustituto de HUMAN_AGENT ni comprometer el roadmap sobre él.

Para saber si el tenant está bien configurado, sin gastar cuota de Conversations API:

```http
GET https://graph.facebook.com/v26.0/me?fields=messaging_feature_status&access_token=<PAGE_ACCESS_TOKEN>
```

Devuelve `{hop_v2, msgr_multi_app, ig_multi_app}`. Esta llamada es la validación automática del asistente de onboarding.

La Conversations API expone además un campo `is_owner`, que indica si la app que hace la petición es el thread owner actual, y solo se devuelve cuando Conversation Routing está habilitado. Sirve, pero cuesta: 2 llamadas por segundo y solo 20 mensajes por conversación. Para saber quién manda en un hilo concreto, `thread_owner` es la consulta correcta.

### 9.5 Recomendación operativa

**Uno.** El parser lee `entry[].messaging[]` y `entry[].standby[]` desde el día uno, con la misma normalización y el mismo camino de escritura. La diferencia se guarda en una columna `owned` de la conversación, no en dos pipelines.

**Dos.** Kavea persiste el estado de propiedad por conversación y lo actualiza con los sub-eventos de handover: `pass_thread_control`, `take_thread_control`, `request_thread_control` y `app_roles`. Cuando `owned = false`, el compositor de la UI se deshabilita con un mensaje explícito, no con un error genérico de envío.

**Tres.** El agente de IA no responde en conversaciones que Kavea no posee. Aunque el mensaje llegue por standby y se vea perfectamente en la bandeja, responder ahí produce respuestas duplicadas al cliente final, que es el peor resultado posible de cara al negocio del cliente.

**Cuatro.** Configurar la default application es una acción manual del cliente en los ajustes de su Página. Kavea no puede ejecutarla por API. Va en el asistente de onboarding como paso obligatorio y verificable con `messaging_feature_status`, y el tenant no se activa hasta que pasa.

**Cinco.** La ruta exacta del menú donde se configura no está confirmada: las fuentes consultadas dan tres rutas distintas — pestaña *Conversation Routing* en la configuración de la Página, *Page Setup > Instagram Conversation Routing*, y *Settings > Advanced Messaging > Handover Protocol*. Meta cambia esa UI. Antes de escribir el asistente hay que abrirla en una cuenta real, capturar pantallas y fijar la ruta vigente — sin confirmar, verificar en consola.

**Seis.** Si el cliente no configura nada, la Página opera en modo Default Behavior: todas las apps conectadas reciben los webhooks y pueden responder al mismo mensaje, y además *"The Take Thread Control API is blocked unless a default application is set"*. Ese modo no es soportado por Kavea.

### 9.6 Qué se le dice al cliente en el onboarding

Literalmente esto, en el paso correspondiente del asistente, con capturas:

> **Tu bandeja de Meta y Kavea no pueden mandar las dos a la vez.**
>
> Facebook e Instagram solo dejan que una herramienta sea la responsable de cada conversación. Si no eliges cuál, las dos responden al mismo mensaje y tu cliente recibe dos respuestas distintas.
>
> Necesitamos que designes a Kavea como aplicación por defecto en la configuración de tu Página. Es un ajuste que solo puedes hacer tú desde tu cuenta: nosotros no podemos activarlo por ti.
>
> Después de eso puedes seguir usando la bandeja de Meta cuando quieras. Si respondes desde ahí, Meta le pasa el control de esa conversación a la bandeja de Meta y Kavea deja de poder contestar en ese hilo hasta que lo devuelvas. Lo vas a ver marcado en Kavea: la conversación aparece como "gestionada fuera de Kavea" y el cuadro de respuesta queda desactivado. Los mensajes se siguen viendo, y el agente de IA no interviene ahí.
>
> Recomendación: elige un canal y quédate en él. Si vas a atender desde el móvil, dilo y configuramos Kavea en modo solo lectura para ese cliente.

Esa última frase importa comercialmente. Es preferible vender una bandeja de lectura honesta que una bandeja que a veces manda y a veces no.

---

## 10. Límites operativos

### 10.1 Rate limits vigentes

Son asimétricos y **por cuenta**, no por app. La cuota escala con las impresiones y los usuarios comprometidos **del cliente**, no con el negocio de Boosty.

| Límite | Instagram (por cuenta profesional) | Messenger (por Página) |
|---|---|---|
| Send API: texto, enlaces, reacciones, stickers | 100/s — ver conflicto abajo | 300/s |
| Send API: audio o vídeo | 10/s | 10/s |
| Conversations API | 2/s | 2/s |
| Private replies a comentarios de Live | 100/s | — |
| Private replies a comentarios de posts y reels | 750/hora | — |
| Cuota agregada 24 h | `4800 × impresiones en 24 h` | `200 × usuarios comprometidos` |

Además: para llamadas con token de Página o de System User, la fórmula de Pages es `4800 × usuarios comprometidos`. Y a nivel de plataforma existe un límite de app, `200 × número de usuarios` en una hora, que en un modelo de una sola app para todos los tenants merece vigilancia propia; este último procede de la misma página de rate limiting pero no fue destacado individualmente por los verificadores.

Consecuencias de diseño, directas:

- Colas de salida **particionadas por `page_id`**. Un tenant no puede consumir la cuota de otro.
- Carril de media separado del carril de texto. En Messenger la diferencia es de 30 veces.
- El backfill al conectar un cliente nuevo choca contra los 2 llamadas/segundo de Conversations API. Y no sirve de mucho: la Conversations API solo devuelve los 20 mensajes más recientes por conversación, y consultar uno más antiguo devuelve un error engañoso que dice que el mensaje fue borrado. El histórico completo no es recuperable. La bandeja de un cliente nuevo arranca prácticamente vacía y eso se gestiona comercialmente.
- Un cliente pequeño en Santo Domingo o Caracas con pocas impresiones diarias tiene una cuota diminuta. La arquitectura webhook-first no es una preferencia: es lo que hace viable a los tenants pequeños.

**Lo que no está confirmado en rate limits:**

- **100 vs 300 llamadas por segundo en el Send API de Instagram para texto.** El Instagram Platform Overview dice hoy 100. El changelog de Messenger Platform, vía snippet de búsqueda restringida al dominio oficial, dice *"300 (up from 100)"*. No es fuente oficial contra blog: son dos páginas oficiales en desacuerdo, y el changelog de Messenger devuelve HTTP 500 y no se pudo abrir. Diseñar para 100/s y leer las cabeceras en runtime. No comprometer throughput en un contrato.
- **Suelo de la fórmula `4800 × impresiones`.** Una cuenta recién creada con 0 impresiones en 24 horas daría cuota 0, lo que sería inoperante. La documentación no menciona ningún mínimo. Medirlo con una cuenta nueva antes de prometer onboarding a clientes pequeños.
- **Definición exacta de "usuario comprometido"** en la fórmula de Messenger, y **en qué cubo cae un envío por `/me/messages` con Page Access Token**: si el `type` que devuelve la cabecera es `messenger` o `pages`. No está documentado. Se resuelve leyendo el campo `type` en la primera respuesta real.
- **Umbral del throttling por hilo individual.** Verbatim: *"Your app may be rate limited if too many messages are sent to a single thread"*. Meta no publica la cifra. Una Página se considera de alto volumen cuando envía más de 40 mensajes por segundo.

### 10.2 Cabeceras y códigos de error

Se leen en **cada** respuesta y se guardan por tenant.

`X-App-Usage` — porcentajes sobre ventana móvil de una hora:
- `call_count`, `total_cputime`, `total_time`.

`X-Business-Use-Case-Usage` — objeto indexado por business-id:
- `call_count`, `total_cputime`, `total_time`
- `type`: uno de `ads_insights`, `ads_management`, `custom_audience`, `instagram`, `leadgen`, `messenger`, `pages`
- `estimated_time_to_regain_access`: minutos hasta que cese el throttling.

Regla que decide el comportamiento del cliente HTTP, verbatim: *"Continuing API calls during throttling extends the wait period further"*. Reintentar durante el bloqueo lo alarga. Circuit breaker por tenant cuando `call_count` supere 80, y espera del `estimated_time_to_regain_access` completo.

Códigos:

| Código | Significado | Qué hace Kavea |
|---|---|---|
| 4 | La app alcanzó su límite | Backoff global, alerta interna |
| 17 | El usuario alcanzó su límite | Backoff por tenant |
| 32 | Límite de Pages API | Backoff por `page_id` |
| 613 | Límite custom excedido | Backoff por `page_id` |
| 80002 | Business Use Case: Instagram | Pausa la cola de esa cuenta |
| 80006 | Business Use Case: Messenger | Pausa la cola de esa Página |
| 80001 | Business Use Case: Pages | Pausa la cola de esa Página |
| 100 | Parámetro inválido | Incluye los tags muertos. No reintentar |
| 190 | Token invalidado | Marca el tenant como desconectado y **para**. No reintenta en bucle |
| 230 | Consentimiento de perfil no otorgado | Normal. Se ignora. Ocurre con usuarios que nunca escribieron |

Un apunte de arte previo, con confianza media porque procede del código de Chatwoot y no de documentación: el error 9010 (*"No matching Instagram user"*) aparece cuando el bot de revisión de Meta prueba la app durante el App Review. Si el código falla ahí en vez de crear un contacto desconocido, el revisor concluye que la integración no funciona y rechaza. Chatwoot crea un contacto `Unknown (IG: <id>)`. Copiar ese comportamiento cuesta poco y evita un rechazo caro.

### 10.3 Tipos de mensaje: recibir vs enviar

**Instagram Direct**

| | Recibir | Enviar |
|---|---|---|
| Texto | Sí | Sí, ≤ 1.000 bytes |
| Imagen | `image` | Sí, hasta 10 por petición |
| Audio / vídeo | `audio`, `video` | Sí |
| Documento | `file` | PDF |
| Reel | `ig_reel`, `reel` | No |
| Post compartido | `share` y/o `ig_post` — contradicción sin resolver | Solo contenido propio (`MEDIA_SHARE`) |
| Mención en historia | `story_mention` | No |
| Respuesta a historia | `message.reply_to.story` con `url` e `id`, más `link_sticker_url` desde el 12-dic-2025 | No |
| Media efímera | Llega como `ephemeral` **sin URL**. Verbatim: *"Disappearing media (view once, allow replay) is not supported"* | No |
| GIF | **No llega webhook**. Verbatim: *"If a person sends a message with a gif or sticker a webhook will not be triggered"* | No |
| Sticker | **No llega webhook** (mismo texto) | Solo corazón |
| Reacción | `reaction` con `action: react\|unreact` | Sí |
| Borrado / unsend | `message` con solo `{mid, is_deleted:true}` | No |
| Acuse de lectura | `messaging_seen` con `read.mid` | `mark_seen` vía Sender Actions (23-sep-2025) |
| Acuse de entrega | **No existe** en Instagram | — |
| Grupo | No | No |

Huecos que hay que decirle al cliente de Boosty como límite de plataforma, no como bug: los GIF y los stickers entrantes no producen ningún evento; un cliente puede creer que respondió y Kavea nunca se entera. En un carrusel, la notificación incluye la primera imagen, que puede no ser aquella a la que el usuario reaccionó. En un `share` solo llega la URL. Las reacciones que **el negocio** pone a un mensaje del cliente no generan webhook. Y las menciones en historia solo llegan si la cuenta que menciona es pública, o es privada y sigue a la cuenta.

**Facebook Messenger**

| | Recibir | Enviar |
|---|---|---|
| Texto | Sí | Sí |
| Adjuntos | `image`, `audio`, `video`, `file` | Sí |
| Sticker | `sticker` con `sticker_id`. Hasta el **30 de agosto de 2026** llega duplicado también como `image`; después solo como `sticker` | Sticker API, solo públicos gratuitos de primera parte |
| Post / reel | `post`, `ig_post`, `reel`, `ig_reel` | Sin confirmar |
| Cita | `appointment_booking` | Sin confirmar |
| Desconocido | `fallback`, `template` | — |
| Quick reply pulsada | `quick_reply.payload` | Límites sin confirmar |
| Respuesta a mensaje | `reply_to.mid` con `is_self_reply` | Sin confirmar |
| Origen publicitario | Objeto `referral` | — |
| Acuse de entrega | `delivery.watermark` + `delivery.mids[]` | — |
| Acuse de lectura | `read.watermark` | — |

Los dos modelos de acuse son distintos y no comparten columna. Messenger usa marca de agua temporal: "todo lo anterior a este timestamp fue entregado o leído". Instagram usa `read.mid`: "este mensaje concreto". Modelarlos con la misma columna pierde semántica.

El parser de adjuntos es tolerante por diseño: un tipo desconocido va a `fallback` con el payload crudo en JSONB, se registra métrica y se sigue procesando. Nunca lanza excepción. En Chatwoot, cada tipo nuevo que Meta introdujo en 2026 —`sticker` en junio, `post` en junio— tumbó el job completo y perdió todos los mensajes del lote, no solo el afectado.

La contradicción `share` vs `ig_post` sigue abierta: se anunció que `share` se soportaba hasta el 1 de febrero de 2026 y luego se eliminaría en favor de `ig_post`, pero la página de referencia viva sigue listando `share`. El parser acepta los dos y no asume la desaparición de ninguno.

### 10.4 Media entrante: no hay descarga inmediata a R2

Esta es la parte donde la intuición de arquitectura lleva directamente a un rechazo de App Review, así que conviene decirla sin rodeos.

**Kavea no descarga el media entrante de Meta a Cloudflare R2. Persiste la URL del CDN y nada más.**

Verbatim de la documentación de mención en historia: *"You can store the CDN URL on your system to avoid repeated calls to conversation API. You must not store the media content on your server."* La URL es privacy-aware y deja de servir el contenido cuando este se borra o expira en origen.

No es teoría. Meta rechazó el App Review de `instagram_manage_messages` a usuarios de Chatwoot por exactamente esto, con el motivo *"proper handling of media CDN URLs by not storing/caching the media content"*. El número de política concreto que circulaba (`8.9.c`) y el guion paso a paso del revisor **no** son legibles hoy en el issue citado: no usarlos como referencia comprobada. El motivo del rechazo sí lo es.

Consecuencias en el modelo de datos:

- Tabla `media_entrante`: `url_cdn`, `tipo`, `payload_crudo` en JSONB. Sin binario. Sin copia. Sin proxy por dominio de Kavea.
- Tabla `media_saliente`: sí en R2. Es media que Kavea genera o que el agente envía, y es propiedad del tenant, no de Meta.
- El screencast del App Review muestra la URL de `lookaside` en la bandeja, y las notas del envío lo mencionan explícitamente. El rechazo de Chatwoot fue tanto por hacerlo mal como por no demostrarlo.

**Lo que no está confirmado, y hay que tratar como tal:**

- **TTL de las URLs de `lookaside.fbsbx.com`.** Meta no documenta cuánto duran ni si requieren token para descargarse. La afirmación de que existe una política documentada de persistencia de adjuntos resultó ser una fabricación: no está en la página que se citaba. Lo único documentado es que la URL es privacy-aware. Medirlo empíricamente: guardar una URL real y sondearla hasta que devuelva 403 o 404.
- **Si Meta permite la descarga efímera para visión.** La política prohíbe *storing/caching the media content* pero no dice nada explícito sobre procesamiento transitorio en memoria. Es una decisión de riesgo, no un hecho. Consultar por escrito a Meta Developer Support **antes** del App Review y guardar la respuesta. Ninguna sección puede presentar la descarga efímera como permitida.

**Lo que sí es obligatorio hoy:** todo fetch de una URL que venga de un webhook pasa por una allowlist de host — `lookaside.fbsbx.com`, `*.fbcdn.net`, `scontent.*` — bloquea rangos privados y no sigue redirecciones fuera de la lista. Es SSRF de manual y Chatwoot tuvo que cerrarlo con un SafeFetch.

**Caso especial, historias.** Una historia caduca a las 24 horas y su URL deja de renderizar. Para respuestas a historias y menciones en historia, el contexto visual se pierde y no hay forma legítima de conservarlo. La UI muestra "historia expirada" y el agente de IA trabaja solo con el texto del mensaje. Diseñar el flujo asumiendo que ese contexto no estará disponible pasadas 24 horas.

---

## 11. Trámite: la ruta crítica

El trámite no es un formulario. Son tres procesos distintos, encadenados, con dependencias duras entre ellos, y uno de los tres no tiene plazo publicado. La confirmación literal de que son independientes está en la documentación de Tech Providers: "Access verification is independent of App Review". Eso significa que aprobar uno no acelera el otro, y que un fallo en el primero invalida el trabajo hecho en los siguientes.

Orden estricto, sin saltos:

1. Decidir la entidad legal que verifica.
2. Crear el business portfolio de Boosty Digital.
3. Completar Business Verification de ese portfolio.
4. Crear la app de tipo Business.
5. Reclamar la app desde el portfolio.
6. Pasar Access Verification (designación de Tech Provider).
7. App Review, permiso a permiso, con Advanced Access.

### 11.1 Paso 0 — La decisión societaria. Bloquea todo lo demás

Esto se decide antes de crear nada. No es una pregunta abierta, es un paso con entregable.

Lo que está verificado sobre países:

- **No existe lista oficial pública de países donde Business Verification no esté disponible.** No está en `developers.facebook.com` y las páginas del Meta Business Help Center no son legibles por un fetcher automático, así que tampoco se puede auditar desde fuera.
- **La única exclusión geográfica que Meta publica es la de WhatsApp Business Platform**, verbatim: "Businesses in Cuba, Iran, North Korea, Syria, and three sanctioned regions in Ukraine (Crimea, Donetsk, Luhansk) are not eligible to use the WhatsApp Business Platform." Ni Venezuela, ni República Dominicana, ni México aparecen en esa lista.
- **Ausencia de prohibición no es confirmación de disponibilidad.** Que Venezuela no esté vetada explícitamente no dice nada sobre si el formulario acepta un Registro Mercantil venezolano, ni sobre cuánto tarda un revisor en procesarlo.

Lo que **no** está verificado y no debe presentarse como hecho:

- Los documentos exigidos varían por país y solo son visibles dentro del flujo autenticado. La correspondencia habitual — RIF de SENIAT más Registro Mercantil para Venezuela, RNC de DGII más Registro Mercantil para República Dominicana — proviene de snippets de búsqueda y de documentación de partners (Wati, 360dialog), no de una página de Meta abierta y leída. Confianza media-baja. **Sin confirmar — verificar en consola.**
- No hay SLA publicado. Los snippets del Help Center mencionan 48 horas de revisión documental. Los hilos del foro de desarrolladores reportan de 12 días a más de dos meses. La cifra real es desconocida.

Lo que sí se sabe de los requisitos documentales, con confianza media:

- Número de identificación fiscal de la empresa.
- Documento de identidad gubernamental con foto de **todos** los beneficial owners con 10% o más de participación. Si un socio de Boosty no quiere subir su pasaporte a Meta, el trámite se detiene ahí y no hay ruta alternativa.
- Documento de constitución de la sociedad.
- Documentos vencidos, alterados o editados se rechazan. Los formularios fiscales autocompletados sin sello de la autoridad tributaria también.
- El español figura entre los idiomas soportados; documentos en idiomas no soportados exigen traducción al inglés con sello de agencia oficial.

**Decisión: verificar con la entidad de domicilio más estable de las disponibles, priorizando México o Estados Unidos sobre Venezuela.** No porque exista una prohibición documentada — no la hay —, sino porque el trámite es opaco, sin SLA, sin lista pública de países, y un rechazo o una demora de dos meses bloquea el lanzamiento entero de Kavea. La asimetría de riesgo es total: si se verifica con una entidad mexicana o estadounidense y funciona, no se pierde nada; si se verifica con una venezolana y falla, se pierde el trimestre. Esa decisión se toma antes de crear la app porque el business portfolio que reclama la app es el que se verifica, y el tipo de app no se puede cambiar después.

Nota importante: el domicilio de Boosty no limita los mercados donde operan los clientes. La verificación es del negocio dueño de la app, no de las Páginas gestionadas.

### 11.2 La ruta, con lo que bloquea a qué

| # | Paso | Consola | Bloquea a | Tiempo |
|---|---|---|---|---|
| 0 | Decidir entidad legal | — | Todo | Interno |
| 1 | Crear business portfolio | Meta Business Suite | 2, 3 | Minutos |
| 2 | Business Verification | Business Settings > Security Center | 4, 5, límite de 500 testers | **Sin SLA publicado.** 48 h según snippets; 12 días a >2 meses según foros |
| 3 | Crear app tipo Business | App Dashboard | 4, 5, 6 | Minutos |
| 4 | Reclamar la app desde el portfolio | App Dashboard / Business Settings | 5 | Minutos |
| 5 | Access Verification (Tech Provider) | App Dashboard > Basics > Verifications | Que clientes sin rol otorguen permisos | ~5 días (oficial) |
| 6 | App Review, permiso a permiso | App Dashboard > App Review | Advanced Access | "less than one week... often only 2–3 days" (oficial) |

Detalles que muerden en cada paso:

**Paso 3 — tipo de app.** "App types cannot be changed", verbatim. Facebook Login for Business exige tipo Business. Si alguien crea la app como Consumer para probar, hay que tirarla y empezar de cero.

Los use cases del dashboard son "Manage messaging and content on Instagram" (con *and*, no `&`) y el equivalente de Páginas. El primero preselecciona por defecto, en el setup con Facebook Login: `business_management`, `instagram_basic`, `instagram_manage_messages`, `pages_read_engagement` y `pages_show_list`. Esto explica por qué `business_management` entra en el submission pese a la contradicción documental sobre si es dependencia: viene marcado de fábrica. Hay que auditar la preselección y **quitar lo que Kavea no usa**, porque la doc de App Review dice literal: "If you request permissions or features that your app does not use... your submission will not be approved."

**Paso 4 — reclamar la app.** No es cosmético. El verificador confirmó que el chequeo de Access Verification se dispara también cuando la llamada la hace "a business app that has yet to be connected to a business". Una app Business recién creada y sin negocio conectado ya falla esos endpoints. Reclamarla es parte del camino, no un ajuste posterior.

**Paso 5 — Access Verification.** La frase de entrada es literal: "Any business that has created or claimed an app that will be used by other businesses and requires any of the permissions listed below must be verified as a Tech Provider before other businesses can use the app". La lista son 34 permisos restringidos. `pages_messaging`, `instagram_manage_messages` y `pages_manage_metadata` **no** están en ella, lo que induce a pensar que Kavea se libra. No se libra: `instagram_basic`, `pages_show_list`, `pages_read_engagement` y `business_management` sí están, y son dependencias obligatorias. No hay atajo.

El formulario llega por email al admin del negocio y también está en App Dashboard > Basics > Verifications. Un admin debe categorizar y describir cómo el negocio usa datos de otros negocios para prestarles un servicio. Los negocios ya existentes que reclamen apps afectadas tienen 60 días de gracia antes de que los endpoints empiecen a validar.

El estatus se pierde retroactivamente si la Business Verification caduca, si la app se desconecta del negocio o si la cuenta queda restringida. Se restaura automáticamente al revertirse la condición. Hay que monitorizarlo como si fuera uptime: cuando se cae, todos los tenants dejan de poder otorgar permisos a la vez.

**Paso 6 — App Review.** Lo que hay que llevar:

- **Al menos 1 llamada exitosa por cada permiso solicitado, dentro de los 30 días previos al envío.** Esto se hace con Standard Access y cuentas con rol. Es la razón por la que el trabajo de la sección 12 no es opcional.
- **Un screencast por cada permiso**, con su propia descripción, sin copiar y pegar. Con la lista de v1 —`pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_messages`, `business_management`— eso son ocho grabaciones, más la novena de la feature **Human Agent**, que se somete aparte y exige verificación de negocio.
- Especificaciones de grabación, literales: "Record in high-resolution, ideally 1080 or better"; "Decrease your monitor's resolution to a width of 1440 or less when you record"; "Increase your mouse's cursor size"; "Omit audio; our reviewers will not listen to it". Hay que mostrar el flujo completo desde logged-out, incluyendo el diálogo de autorización y la selección de activos por el usuario.
- **Un tenant demo funcionando** con credenciales de prueba. Verbatim: "If we are unable to access your app to test it, your entire submission will be rejected." Y: "Do not include your personal Meta Technologies app account's credentials."

No se piden en v1: `page_utility_messaging`, `ads_management` ni `pages_manage_ads`. La atribución de conversaciones a pauta se resuelve leyendo el objeto `referral` del webhook.

### 11.3 Lo que la app necesita antes de poder pedir review

Dos listas distintas que se confunden. Los campos de Basic Settings marcados como requeridos **para pasar a Live** son: Display Name, Contact Email, Terms of Service URL, App Icon, Category y App Purpose. Privacy Policy URL y User Data Deletion URL aparecen como **no** requeridos para Live. Pero App Review sí exige Privacy Policy URL, icono de 1024x1024 sin marcas registradas de Meta, categoría y business email. Conclusión operativa: preparar los ocho desde el día uno y no fiarse de qué campo tiene asterisco.

Requisitos de la política de privacidad, verbatim: debe ser "active, publicly available, easily accessible (including by our crawlers), and non-geoblocked". Debe declarar qué información se recoge, cómo se procesa y "a clear way for users to request the deletion of their data". Y: "Broken privacy policy links are considered violations and are subject to enforcement".

Riesgo concreto para este proyecto: si `kavea.ai` está detrás de protección de bots agresiva, el crawler de Meta recibe un 403 y el review se rechaza por enlace roto sin más explicación. Hay que permitir el crawler de Meta explícitamente y comprobarlo con el Sharing Debugger antes de enviar.

Eliminación de datos: "Developers need to specify either a data deletion callback instruction URL or a callback URL found in Basic Settings for your app". Basta con uno de los dos, pero el callback se implementa igual porque es el mecanismo real. Requisitos: HTTPS, parsear el parámetro `signed_request` del POST para extraer el App-Scoped ID, iniciar el borrado, y responder JSON con exactamente `{url, confirmation_code}`. La documentación no diferencia por tipo de app.

El **Deauthorize Callback** es una cosa distinta y también se implementa. Su existencia está confirmada por una línea de la guía de Manual Login Flow: "You can enable a deauthorize callback through the App Dashboard". La ruta del menú, el nombre exacto del campo y el formato del `signed_request` para este callback en concreto **no están documentados oficialmente** — la fuente que circulaba era un hilo del foro de la comunidad. **Sin confirmar — verificar en el App Dashboard antes de implementar.**

Otro punto sin resolver: la doc de app types dice que las apps Business "do not have app modes and instead rely exclusively on access levels", mientras que la doc de webhooks dice "Your app must be set to Live in the App Dashboard for Meta to send webhook notifications". Las dos son oficiales y se contradicen. **Sin confirmar — comprobar visualmente en el dashboard qué controla la recepción de webhooks.** Es la causa silenciosa más frecuente de "el webhook no dispara".

Una advertencia frecuente que **no se pudo verificar**: que cambiar cualquier ajuste de la app después de enviar a App Review obligue a repetir la revisión. No aparece en ninguna página abierta. NO_VERIFICABLE. Aun así, congelar icono, categoría, URLs y configuraciones desde el envío es prudente y no cuesta nada.

### 11.4 Qué corre en paralelo

Business Verification es el único paso largo e impredecible. Todo lo demás se solapa con él:

- Redactar política de privacidad y términos, publicarlos, comprobar el crawler.
- Implementar los dos callbacks (deauthorize y data deletion).
- Diseñar icono y decidir categoría.
- Construir el producto entero con Standard Access (sección 12).
- Grabar los nueve screencasts, una vez el producto funcione.

Lo que **no** se puede adelantar: las llamadas de API que exige el review caducan a los 30 días. Si Gabriel las hace en agosto y Business Verification tarda dos meses, hay que repetirlas antes de enviar. Programarlas como un script reejecutable, no como un experimento manual.

### 11.5 Trámite recurrente

Meta consolidó Data Use Checkup, App Review, Data Protection Assessment y las revisiones continuas en un proceso anual único, "Data Access Renewal". Que existe está confirmado. **Qué requisitos concretos aplican al perfil de Kavea y con qué periodicidad exacta no está determinado.** Es un trámite recurrente con capacidad de cortar el acceso de todos los tenants a la vez, así que va en el calendario con un responsable, no en la carpeta de "ya veremos".

### 11.6 Lo que no depende de Boosty

Para Instagram y Messenger, el cliente **no** verifica su negocio. Basta la de Boosty. Lo que el cliente sí tiene que hacer a mano —cuenta profesional, Página vinculada, el toggle de Herramientas conectadas, la default application de Conversation Routing— es onboarding, no trámite, y se cubre en su propia sección.

En **WhatsApp la regla es la contraria** y conviene decirlo aquí porque afecta al calendario comercial: cada cliente tiene su propio business portfolio y su verificación condiciona sus límites de mensajería (250 → 2.000 → 10.000 → 100.000 → ilimitado) y de plantillas (250 sin verificar; 6.000 con el portfolio verificado **y** al menos un número con display name aprobado). Además, el Embedded Signup permite por defecto onboardear 10 clientes nuevos en una ventana móvil de 7 días, y sube a 200 solo si se completan los tres trámites (Business Verification, App Review y Access Verification). Fuera de estos puntos, WhatsApp no se investigó y nada más debe darse por verificado.

---

## 12. Qué se puede construir HOY sin App Review

### 12.1 Qué otorga Standard Access

Standard Access se concede automáticamente a todas las apps para todos los permisos y features disponibles para su tipo. No hay que pedirlo. La restricción es una sola frase, literal:

> "Permissions with Standard Access can only be requested from app users who have a role on the requesting app."

Y su gemela para features:

> "Features with Standard Access are only active for app users who have a role on the app."

Traducido: Kavea puede hacer **todo** lo que hará en producción —recibir webhooks, enviar mensajes, suscribir Páginas, leer perfiles, tomar control de hilos— siempre que la cuenta del otro lado pertenezca a alguien con rol en la app.

Roles que sirven, con su capacidad literal:

| Rol | Puede otorgar permisos | Techo |
|---|---|---|
| Administrator | Sí | 500 |
| Developer | "can grant the app any permission while it is in development" | — |
| Tester | "Testers can grant the app any permission while it is in development" | 50, o 500 combinados testers + analytics users si la app está conectada a un Business Manager con Business Verification completada |
| Analytics User | No | — |

El verificador cerró la duda sobre los 500: "Business Manager-verified" significa Business Verification completada. Es decir, hasta 500 cuentas piloto sin App Review, pero **después** de verificar el negocio, que es el paso lento. Antes de eso, el techo es 50.

Cada admin de cliente debe aceptar una invitación de rol en la app de Boosty. Es fricción alta y visible para el cliente. Sirve como puente para un piloto, no como modelo comercial.

### 12.2 El muro, con precisión

Standard Access se acaba exactamente aquí: **el primer cliente de Boosty que no vaya a aceptar una invitación de rol de desarrollador en la app de Kavea.** No es un límite técnico gradual, es binario. Con Standard Access, una cuenta sin rol no puede otorgar el permiso, y sin el permiso no llega ni un webhook ni sale un mensaje.

Consecuencias prácticas:

- Un piloto con 3-5 clientes cercanos, que toleren la invitación: viable hoy.
- Un onboarding self-service en `kavea.ai` donde cualquiera conecta su cuenta: imposible hasta Advanced Access.
- Un demo comercial con un prospecto que aún no es cliente: imposible, salvo que se le invite como tester.

### 12.3 Qué se puede probar de verdad

Esto es lo que hace que las dos semanas valgan la pena: **cada contradicción documental de este documento se cierra empíricamente con Standard Access.** No hay una sola que necesite App Review. Lista de lo que se resuelve:

1. **`object`: `page` vs `instagram`.** Dos páginas oficiales de Meta se contradicen. Se resuelve volcando el primer payload real crudo.
2. **Qué valores acepta el enum de `subscribed_fields`.** Hay discrepancia de nomenclatura entre páginas: `messaging_referral` vs `messaging_referrals`, `messaging_handover` vs `messaging_handovers`, `message_reactions` vs `messaging_reactions`. Se resuelve mandando la llamada y leyendo el error.
3. **Si `message_reactions` y `standby` existen realmente en la vía Facebook Login.** La tabla de `/docs/instagram-platform/webhooks` dice que no; la página de `/docs/messenger-platform/instagram/features/webhook` dice que sí. Se resuelve suscribiendo y reaccionando a un mensaje.
4. **Qué valores devuelve `GET /me/accounts` en `tasks`.** El get-started exige `MODERATE`; la página de send-message exige `MESSAGE`. La tarea `MESSAGING` no aparece en ninguna. Rechazar una conexión por ausencia de `MESSAGING` rechazaría clientes válidos.
5. **Los enums literales de `messaging_type`.** `RESPONSE` / `UPDATE` / `MESSAGE_TAG` solo están corroborados en SDKs de terceros; la página oficial renderiza las etiquetas humanas. Una llamada real lo cierra.
6. **Si Instagram exige `messaging_type`.** Los ejemplos oficiales de Instagram no lo incluyen.
7. **La forma `/{PAGE_ID}/messages` para Instagram.** Se fija `/me/messages` porque es lo que Meta documenta literalmente. La otra forma es plausible pero no documentada para Instagram. Se comprueba en el Graph API Explorer.
8. **El App ID de la bandeja de Meta Business Suite.** La página de Conversation Routing dice `263902037430900` (15 dígitos); la referencia de `message_echoes` muestra `26390203743090` (14). Casi con certeza es una errata, pero se hardcodea en la lógica anti-bucle y hay que verificarlo.
9. **El TTL de las URLs de `lookaside.fbsbx.com`.** Meta no lo documenta. Se mide sondeando una URL real cada hora hasta que devuelva 403 o 404.
10. **Si esas URLs requieren token para descargarse.** No está documentado. Un GET sin cabecera `Authorization` desde un Worker lo responde.
11. **El suelo de la fórmula `4800 × impresiones`.** Una cuenta nueva con 0 impresiones daría cuota 0. La documentación no menciona ningún mínimo. Se mide con una cuenta profesional recién creada.
12. **Si los tokens BISU sirven para enviar DMs de Instagram.** La doc lista "automated messaging responses" entre sus casos de uso, pero no confirma Instagram Direct en concreto. `/debug_token` más un envío real lo cierran.
13. **Si las apps Business tienen o no toggle Development/Live**, y qué controla realmente la recepción de webhooks.
14. **La ruta exacta del Deauthorize Callback** en el App Dashboard.
15. **`messaging_feature_status`.** `GET /me?fields=messaging_feature_status` devuelve `{hop_v2, msgr_multi_app, ig_multi_app}`. Es la validación automática del onboarding de cada tenant.

Y lo que hay que probar aunque no sea una contradicción: **la firma con tildes y emojis**. Meta firma sobre una versión con unicode escapado y hex en minúscula. Cualquier `JSON.parse` seguido de `JSON.stringify` rompe la firma de forma no determinista y solo falla cuando el usuario escribe con acentos. Los tests en inglés pasan siempre. Los mensajes de Venezuela, República Dominicana y México, nunca.

### 12.4 Lo que no se puede probar

- Cualquier cuenta sin rol en la app. Ese es todo el límite.
- **La feature Human Agent es dudosa.** La lógica de access levels dice que las features con Standard Access están activas para usuarios con rol, lo que sugiere que sí se puede probar con un tester. Pero la referencia de features dice que Human Agent "requires successful completion of the App Review process before your app can access live data" y "only available with business verification". Las dos afirmaciones son compatibles, pero la equivalencia no está escrita en ninguna parte. **Sin confirmar — probarlo empíricamente en el día 7 y anotar el resultado.**
- El comportamiento bajo carga real de cuentas con volumen. Depende de que alguna cuenta de Boosty tenga tráfico real.

### 12.5 Una trampa de secuencia antes de empezar

Dos cosas que condicionan cuándo se hace cada cosa:

**La app de trabajo debe ser la app definitiva.** Las llamadas que exige el App Review deben salir de la app que se somete a revisión. Si el domicilio legal no está decidido y se trabaja sobre una app desechable, todo el código sirve pero la evidencia no. Si la decisión societaria no está tomada el lunes, se puede empezar igual, pero hay que asumir que las llamadas se repiten después.

**La ventana de 30 días corre hacia atrás desde el envío, no hacia adelante desde hoy.** Las llamadas hechas en agosto no valen para un envío de octubre. El script que las genera se escribe una vez y se reejecuta la semana anterior al envío.

### 12.6 Secuencia de trabajo, dos semanas

Cada día tiene un entregable verificable. Ninguno depende de un trámite pendiente.

**Semana 1**

| Día | Trabajo | Evidencia de que está hecho |
|---|---|---|
| 1 | App tipo Business creada y reclamada. Página e Instagram de Boosty como banco de pruebas. Toggle "Allow Access to Messages" activado en la cuenta de Instagram de Boosty. Dos personas invitadas como Testers, invitación aceptada. `GRAPH_API_VERSION=v26.0` en una única variable leída por todos los clientes HTTP. Resolver la ambigüedad Development/Live. | Captura del dashboard con el toggle Live o su ausencia. Variable en el `.env` y ningún literal `v26.0` en ningún path. |
| 2 | Endpoint del webhook. Handshake `GET` con `hub.mode`, `hub.challenge`, `hub.verify_token`, devolviendo el challenge crudo. Validación de `X-Hub-Signature-256` con HMAC-SHA256 sobre el cuerpo **crudo**, comparación en tiempo constante. Respuesta 200 en menos de 5 segundos: validar y encolar, nada más. | Test que pasa con un payload que contiene `áéíóú` y un emoji. Un test que use el JSON reparseado debe **fallar**. |
| 3 | Suscripción con `POST /v26.0/{page-id}/subscribed_apps`. Descubrir el enum real de `subscribed_fields` probando cada nombre en disputa. Primer payload real volcado a JSONB sin tocar. | Fila en la tabla de staging con el `object` real y la lista de campos que Meta aceptó. Inciertos 1, 2 y 3 cerrados. |
| 4 | Parser tolerante. Enrutado multi-tenant por `entry[].id` resuelto **antes** de tocar la base de datos. Idempotencia con `UNIQUE (organization_id, canal, mid)` y `ON CONFLICT DO NOTHING`. Iteración de `entry[]`, `messaging[]`, `standby[]` y `changes[]` siempre como arrays. Tipo de adjunto desconocido a `fallback` con el crudo en JSONB, sin excepción. | Reenviar el mismo lote dos veces y que la tabla no crezca. Inyectar un tipo de adjunto inventado y que el lote entero siga procesándose. |
| 5 | Envío. `POST /v26.0/{PAGE_ID}/messages` para Messenger y `POST /v26.0/me/messages` para Instagram. Truncado por **bytes**, no por `String.length`. Correlación del `message_id` de la respuesta contra el echo. Enviar un mensaje entrante a las cuentas de prueba para arrancar el reloj de las 24 h. | Un mensaje con acentos y emojis cerca de 1.000 bytes que llega entero. Inciertos 5, 6 y 7 cerrados. |

**Semana 2**

| Día | Trabajo | Evidencia de que está hecho |
|---|---|---|
| 6 | Echoes y standby. Responder desde el móvil y desde Meta Business Suite. Mover la conversación a Main en Business Suite y observar dónde llegan los eventos. Configurar la default application de Conversation Routing en la Página de Boosty. Comprobar el App ID real de la bandeja. | Un echo con `sender` y `recipient` invertidos, correctamente atribuido. Un evento que aparece en `standby[]` y no en `messaging[]`. Incierto 8 cerrado. |
| 7 | Ventana de 24 h. Con el reloj arrancado el día 5, probar a las 25 horas: `messaging_type: RESPONSE` debe fallar. Probar `MESSAGE_TAG` con `tag: HUMAN_AGENT` y anotar si funciona con Standard Access. Probar el unsend de Instagram: comprobar que llega como `message` con solo `{mid, is_deleted:true}` y que el pipeline hace UPDATE, no INSERT. | Los dos códigos de error, literales. La duda de Human Agent resuelta o documentada como sigue abierta. |
| 8 | Media entrante. Guardar solo la URL, nunca el binario. Allowlist de host (`lookaside.fbsbx.com`, `*.fbcdn.net`, `scontent.*`), bloqueo de rangos privados, sin seguir redirecciones fuera de la lista. Arrancar el sondeo horario de una URL real para medir su TTL. | El SafeFetch rechazando `http://169.254.169.254/`. Un job de sondeo corriendo con su primer punto de datos. |
| 9 | Límites y latencia. Leer y persistir `X-App-Usage` y `X-Business-Use-Case-Usage` en cada respuesta. Colas particionadas por `page_id`, carril de media separado del de texto. Fallback determinista sub-30 segundos independiente de la latencia de Claude. Medir el suelo de la fórmula con una cuenta profesional nueva. | Una tabla con el histórico de `call_count` y `estimated_time_to_regain_access`. El fallback disparándose con el LLM apagado. Incierto 11 cerrado. |
| 10 | Reconciliación y evidencia. Cron que consulte `/{id}/subscribed_apps` por organización y re-suscriba lo que falte, con alerta interna. `GET /me?fields=messaging_feature_status` en el validador de onboarding. Script reejecutable que dispare una llamada por cada permiso del submission. Documento de inciertos cerrados. | El cron detectando una desuscripción provocada a mano. El script imprimiendo ocho respuestas 200, una por permiso. |

Al final del día 10, Kavea tiene un producto funcionando extremo a extremo sobre cuentas propias, quince inciertos documentales cerrados con evidencia real, y el script que produce el requisito de "1 llamada exitosa por permiso" a demanda. Lo único que falta para vender es el trámite, y el trámite ya lleva diez días corriendo en paralelo.

---

## 13. Deprecaciones con fecha

Todo lo que sigue tiene fecha publicada por Meta. Lo que ya pasó no es una advertencia, es el estado actual del sistema. La columna de confianza no es decorativa: donde pone media o baja, la fuente primaria no se pudo abrir y el dato se sostiene sobre snippets de búsqueda.

### 13.1 Ya en vigor

| Fecha | Cambio | Qué significa para Kavea | Confianza |
|---|---|---|---|
| 27-ene-2025 | Deprecados los scopes `business_basic`, `business_content_publish`, `business_manage_comments` y `business_manage_messages` de Instagram Login. | No aplica: Kavea usa Facebook Login for Business. Se anota porque explica por qué buena parte de los ejemplos de terceros que circulan ya no funcionan. | Alta |
| 26-ene-2026 | Expiró Graph API v18.0. | — | Alta |
| 1-feb-2026 | Retirada anunciada del tipo de adjunto `share` para posts de Instagram, sustituido por `ig_post`. | Contradicción sin resolver: la página de referencia viva sigue listando `share` entre los tipos. El parser acepta ambos y no asume la desaparición de ninguno. | Baja-media. La fuente es el changelog de Messenger Platform, que devuelve HTTP 500. |
| 18-feb-2026 | Publicada Graph API v25.0 (expira 29-jul-2028). | — | Alta |
| 31-mar-2026 | Meta cambia la Certificate Authority que firma los certificados mTLS de los webhooks. Root cert citado: `meta-outbound-api-ca-2025-12.pem`. | Si el Worker o la Edge Function valida mTLS contra un trust store fijo, hay que añadir ese root o las entregas fallan en el handshake. | Media-baja. Solo por snippets; el changelog no se pudo abrir. |
| 27-abr-2026 | Los Message Tags `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` y `POST_PURCHASE_UPDATE` devuelven error code 100. Verbatim: "Effective April 27th, 2026, all API requests containing the Message Tags... will receive error code 100." | No implementarlos. Desconfiar de cualquier SDK o ejemplo de terceros que los use: Chatwoot hardcodeaba `tag: 'ACCOUNT_UPDATE'` en todos los envíos y se le rompió Messenger ese día. | Alta, verbatim |
| 6-may-2026 | Envío múltiple de imágenes en Instagram sale de beta: hasta 10 por petición, png/jpeg, 8 MB cada una. | Amplía lo que el agente puede enviar. No rompe nada. | Alta |
| 6-may-2026 | Fecha de actualización de la página que subiría el Send API de Instagram de 100 a 300 llamadas/s para texto. | En disputa. El Instagram Platform Overview sigue diciendo 100/s hoy. Se diseña para 100/s. Ver 14.2. | Baja |
| 21-may-2026 | Expiró Graph API v19.0. | — | Alta |
| 29-jul-2026 | Publicada v26.0. Se retiran los parámetros `pretty`, `debug` y `date_format`, las peticiones raíz `GET /?ids=...` y el comportamiento ETag / `If-None-Match` / 304, para v26.0 y superiores. | Kavea nace en v26.0. No cachea respuestas de Graph API por ETag ni usa `GET /?ids=` para lookups en lote. | Alta, verbatim |
| 29-jul-2026 | Commerce Order Management API bloqueada en v26.0+. El valor `story` de `messenger_positions` se elimina silenciosamente en v26.0+. | No aplica: Kavea no toca Commerce ni Marketing API. | Alta |

### 13.2 Pendientes

| Fecha | Días desde hoy | Cambio | Qué significa para Kavea | Confianza |
|---|---|---|---|---|
| **30-ago-2026** | **29** | Termina el periodo de transición de 90 días de los stickers de Messenger. Verbatim: "After August 30, 2026, only the sticker attachment type will be sent." Hasta esa fecha llegan duplicados como `sticker` **y** `image`. | **Rompe el parser. Ver 13.3.** | Alta, verbatim |
| 24-sep-2026 | 54 | Expira Graph API v20.0. | — | Alta |
| **27-oct-2026** | **87** | Las retiradas de protocolo de v26.0 pasan a aplicarse "to all remaining supported Graph API versions". Commerce Order Management se elimina de todas las versiones. | Fecha de corte dura. Fijar una versión antigua no protege: solo retrasa la rotura hasta aquí. | Alta, verbatim |
| 21-ene-2027 | — | Expira v21.0. | — | Alta |
| 20-may-2027 | — | Expira v22.0. | — | Alta |
| 8-oct-2027 | — | Expira v23.0. | — | Alta |
| 18-feb-2028 | — | Expira v24.0. | — | Alta |
| 29-jul-2028 | — | Expira v25.0. | — | Alta |
| TBD | — | v26.0 no tiene fecha de expiración publicada. | El test automatizado de versión debe tolerar "TBD" sin fallar. | Alta |

### 13.3 El 30 de agosto rompe el parser. Quedan 29 días.

Hoy un sticker de Messenger llega dos veces en el mismo payload: como adjunto `sticker` y como adjunto `image`. El 30 de agosto deja de llegar el segundo. Hay dos formas de fallar y las dos están vivas ahora mismo:

- Si el parser procesa los dos tipos, hoy duplica cada sticker en la bandeja. El cliente ve el mismo pulgar arriba dos veces y abre un ticket.
- Si el parser depende del tipo `image` para renderizar stickers, el 30 de agosto los stickers dejan de aparecer. Sin error, sin log, sin nada.

Hay un tercer fallo, peor, y está documentado. Cuando Meta introdujo el tipo `sticker` en junio de 2026, el job de webhook de Chatwoot lanzó `ArgumentError: 'sticker' is not a valid file_type` y tumbó **el lote completo**, no solo el mensaje afectado. Lo mismo volvió a pasar días después con el tipo `post`. Un lote trae hasta 1000 updates. Eso son hasta 1000 mensajes de varios tenants perdidos por un tipo de adjunto que Meta añadió sin avisar.

La regla, que ya es invariante del proyecto: tipo desconocido va a `fallback` con el payload crudo en JSONB, se registra métrica y se sigue procesando. Nunca lanzar excepción. Y antes del 30 de agosto, colapsar el par `sticker` + `image` en una sola fila usando `sticker` como tipo canónico, para que la desaparición de `image` no cambie nada.

### 13.4 El 27 de octubre es la otra fecha dura

El changelog de v26.0 dice que las retiradas de protocolo aplican a v26.0 desde el 29 de julio "and to all remaining supported Graph API versions beginning October 27, 2026". Es la frase que invalida la mitigación intuitiva. Quedarse en v25.0 no evita nada: solo mueve la rotura 87 días. Va al calendario del proyecto como hito, no como nota.

### 13.5 Sin fecha, pero recurrente

Data Access Renewal existe y Meta ha consolidado en él Data Use Checkup, App Review, Data Protection Assessment y las ongoing reviews en un proceso anual único. Qué requisitos concretos aplican al perfil de Kavea y con qué periodicidad exacta está **sin confirmar — verificar en consola**. Es un trámite que puede cortar el acceso de todos los tenants a la vez, así que va en el plan aunque su fecha aún no se conozca.

---

## 14. Riesgos abiertos y decisiones que Gabriel tiene que tomar

Dos cosas distintas. Arriba, decisiones que requieren un humano y que no se resuelven con más investigación. Abajo, huecos que se cierran abriendo una consola y mirando.

### 14.1 Decisiones humanas

**1. ¿Dónde se domicilia la entidad que pasa la Business Verification?**
El negocio verificado es el dueño de la app y de él cuelgan todos los tenants. No existe lista oficial pública de países donde la verificación no esté disponible; la única exclusión geográfica publicada es la de WhatsApp Business Platform (Cuba, Irán, Corea del Norte, Siria, Crimea/Donetsk/Lugansk) y ni Venezuela, ni República Dominicana, ni México están en ella. Ausencia de prohibición no es confirmación de disponibilidad. Los documentos exigidos varían por país y solo son visibles dentro del flujo autenticado. No hay SLA publicado: los snippets mencionan 48 h de revisión documental, los hilos del foro reportan de 12 días a más de dos meses.
*Recomendación:* decidirlo antes de crear la app, no después. Usar la entidad con documentación mercantil y fiscal más estándar de las que tenga Boosty. Arrancar el trámite en paralelo al desarrollo, con colchón de dos meses. Es una decisión societaria bloqueante, no una pregunta abierta.

**2. ¿Puede el agente de IA ver el media entrante?**
La política prohíbe "storing/caching the media content" y ese es el motivo documentado del rechazo de App Review a usuarios de Chatwoot. Lo que la política no dice es nada explícito sobre procesamiento transitorio en memoria. Es una decisión de riesgo, no un hecho técnico.
*Recomendación:* v1 sin visión sobre media entrante. Se persiste solo la URL de `lookaside.fbsbx.com` y el agente trabaja con texto. En paralelo, consultar por escrito a Meta Developer Support y guardar la respuesta. Si llega y es favorable, entra en v1.1. Ninguna sección del producto puede presentar la descarga efímera como permitida mientras tanto.

**3. ¿Entra la feature Human Agent en el primer envío de App Review?**
Sin ella no se puede responder entre las 24 h y los 7 días. Se somete aparte, con screencast propio, y exige verificación de negocio. Añade superficie de revisión y una posible causa más de rechazo.
*Recomendación:* sí, en el primer envío. La alternativa es lanzar una bandeja que se queda muda pasadas 24 horas, con el compositor deshabilitado y un cartel explicando por qué. Eso es la primera queja de cualquier cliente y no se arregla con producto.

**4. ¿Qué se promete de WhatsApp y cuándo?**
Es un tercio del producto y no se investigó. Fuera de cinco puntos verificados (tiers, plantillas, partner-led BV, Embedded Signup, permisos) todo lo demás es desconocido: forma del webhook, categorías de plantilla y su aprobación, precio, quality rating, verificación de número, Display Name approval. Y la regla se invierte respecto a IG y Messenger: cada cliente tiene su propio business portfolio y su verificación condiciona sus límites de mensajería y de plantillas.
*Recomendación:* WhatsApp no entra en v1 y no se vende llave en mano nunca. Antes de comprometer fecha, una ronda de investigación propia con el mismo método que se usó aquí.

**5. ¿Qué dice exactamente el fallback determinista sub-30 s?**
Política de Meta, verbatim: "Automated bots must respond to any and all input from the user... within 30 seconds". Incumplir genera aviso de violación con 7 días para corregir antes de restringir la mensajería de la Página. La Página del cliente, no la de Boosty.
*Recomendación:* un acuse de recibo fijo que sale a los 5 segundos si el agente no ha respondido, configurable por tenant e idioma, y aprobado por el cliente durante el onboarding. Es texto de marca, no un detalle de ingeniería, y por eso lo decide un humano.

**6. ¿Se divulga que responde una IA, y dónde?**
La documentación menciona explícitamente usuarios de California y de Alemania como jurisdicciones donde la ley lo exige. La operación de Miami/EEUU cae ahí.
*Recomendación:* divulgar en todos los mercados, en el primer mensaje de cada conversación, con texto configurable por tenant. Segmentar la divulgación por jurisdicción del usuario final añade complejidad y riesgo a cambio de nada.

**7. ¿Cómo se vende una bandeja que arranca vacía?**
La Conversations API está topada a 2 llamadas por segundo por cuenta y solo devuelve los 20 mensajes más recientes por conversación. Consultar uno más antiguo devuelve un error que dice que el mensaje fue borrado, lo cual es falso y confunde el debugging. El histórico completo no es recuperable.
*Recomendación:* decirlo en la propuesta comercial, no en el soporte del día 3. "Kavea guarda desde el momento de la conexión" es una frase de contrato. Es un problema comercial, no técnico, y no tiene solución de ingeniería.

**8. ¿Cuántos clientes piloto, y en qué orden respecto al App Review?**
Con Standard Access, los administradores de los clientes se añaden como Testers y pueden conceder cualquier permiso mientras la app está en development. Tope: 50 testers, o 500 combinados testers más analytics users si la app está conectada a un Business Manager con Business Verification completada. Cada admin debe aceptar una invitación de rol.
*Recomendación:* completar Business Verification primero, que desbloquea los 500 y además es prerequisito de Access Verification de todos modos. Limitar el piloto a 3-5 clientes de confianza. El puente sirve para validar el producto, no para facturar: la fricción de invitar por rol a cada admin no escala.

**9. ¿Qué se hace si un cliente pide reengagement en Messenger?**
La ruta de migración de los tags muertos no es Utility Templates. La página de Send Messages dice que quien quiera enviar contenido promocional fuera de la ventana debe usar Sponsored Messages o One-Time Notifications. Son productos con permisos y economía distintos, y no se han analizado. En Instagram no existe ninguna de las dos: ni One-Time Notifications, ni Sponsored Messages, ni News Messaging, ni Marketing Messages API.
*Recomendación:* v1 no ofrece reengagement en ningún canal. Si un cliente lo pide, entra como análisis económico separado. No prometer recuperación de carritos ni campañas por Instagram Direct: la API no lo permite.

**10. ¿Qué dice el contrato sobre disponibilidad?**
Meta puede restringir la app entera sin aviso y dejar a todos los tenants sin servicio a la vez. Le pasó a Chatwoot Cloud durante días en julio de 2026 y tuvieron que deshabilitar por código la creación de inboxes y las respuestas. Kavea usa una sola app y ese riesgo está asumido por decisión de arquitectura.
*Recomendación:* el contrato promete disponibilidad de la bandeja, no de la entrega de mensajes por parte de Meta. Kill-switch por canal y por tenant, banner de estado en la UI y modo degradado que encola en vez de fallar. La mitigación es operativa, no arquitectónica.

### 14.2 Verificaciones pendientes en consola

Nada de esto es una decisión. Son huecos que se cierran mirando. Hasta que se cierren, ninguna sección del documento puede presentarlos como hechos.

| Sin confirmar | Por qué importa | Cómo se cierra |
|---|---|---|
| Objeto del webhook: `page` vs `instagram`. Dos páginas oficiales se contradicen. | Enrutar por el nombre del objeto rompe uno de los dos canales. | El handler acepta ambos y enruta por `entry[].id`. Observar el campo `object` del primer payload real. |
| Si `message_reactions`, `standby` y `message_edit` están disponibles en la vía Facebook Login. Una tabla oficial los niega, otra lista los dos primeros. | Sin `standby`, Kavea se queda ciega y muda cuando Business Suite se apropia del hilo, sin error visible. | Suscribir y observar qué acepta el enum y qué llega. |
| Nombres exactos de `subscribed_fields`: `messaging_referral` vs `messaging_referrals`, `messaging_handover` vs `messaging_handovers`, `message_reactions` vs `messaging_reactions`. | Un valor fuera del enum hace fallar la llamada de suscripción entera en el onboarding. | Graph API Explorer, antes de escribir la llamada. |
| ~~Tarea de Página: `MODERATE` vs `MESSAGE` vs `MESSAGING`~~ | — | ✅ **CERRADO 1-ago-2026.** El enum real devuelve `MESSAGING` y `MODERATE`; `MESSAGE` no existe. Ver §4. |
| Enums de `messaging_type` (`RESPONSE`, `UPDATE`, `MESSAGE_TAG`) y si el campo es obligatorio en Instagram. Solo corroborados en SDKs de terceros. | Una validación estricta sobre strings no confirmados bloquea envíos legítimos. | Una llamada real resuelve las dos dudas. |
| Forma del endpoint de envío en Instagram: `/me/messages` (documentada) vs `/{PAGE_ID}/messages` (plausible, no documentada). | La forma explícita haría fallar en voz alta un error de selección de token. | Se fija `/me/messages`. Probar la otra en el Explorer antes de cambiar. |
| Rate limit del Send API de Instagram para texto: 100/s vs 300/s. Dos páginas oficiales en desacuerdo. | Dimensionar colas y prometer throughput. | Diseñar para 100/s y leer `X-Business-Use-Case-Usage` en runtime. No comprometerlo en contrato. |
| Suelo de la fórmula 4800 × impresiones. Una cuenta nueva con 0 impresiones daría cuota 0. | Un cliente pequeño de RD o Venezuela podría ser inoperante desde el día uno. | Medirlo con una cuenta profesional recién creada. |
| App ID de la bandeja de Meta Business Suite: 263902037430900 (15 dígitos) vs 26390203743090 (14). | Hardcodearlo mal rompe la lógica anti-bucle de los echoes. | Leer el `app_id` de un echo real enviado desde Business Suite. |
| TTL de las URLs de `lookaside.fbsbx.com` y si requieren token para descargarse. Meta no lo documenta. | Determina la ventana de cualquier procesamiento de media. | Sondear una URL real cada hora hasta que devuelva 403/404. Probar un GET sin `Authorization`. |
| Si los tokens BISU sirven para enviar DMs de Instagram en concreto. La doc lista "automated messaging responses" entre sus casos de uso y el default es no expirar, pero no lo confirma para IG. | De ello depende toda la estrategia de refresco de tokens. | `/debug_token` más un envío real. |
| Modo Development/Live en apps de tipo Business. Una página dice que no tienen modos, otra exige app en Live para recibir webhooks. | Es la causa silenciosa de "el webhook no dispara". | Comprobar visualmente en el dashboard qué controla la recepción. |
| Deauthorize callback: ruta del menú, nombre del campo y formato del `signed_request`. Solo está confirmada su existencia. | Sin él, un cliente que revoca el acceso se detecta cuando fallan los envíos, no antes. | Abrir el App Dashboard y mirarlo. |
| Si `extend_thread_control` extiende también la ventana de mensajería a efectos de política, y si evita el App Review de Human Agent. Es una inferencia. | Si fuera cierto cambiaría el plan de App Review. Por eso hay que probarlo, no asumirlo. | Probar con una conversación real pasadas 25 h. No presentarlo como sustituto de Human Agent. |
| Disponibilidad regional en VE, RD y MX de Human Agent, private replies, Conversation Routing, Utility Messages y Marketing Messages. | Meta despliega por país de forma irregular y no publica listas. | Probar con una cuenta profesional real de cada mercado. |
| URL exacta del diálogo OAuth de Facebook Login for Business con `config_id`. Confirmado que `config_id` sustituye a `scope`; la URL literal no está transcrita. | Es la primera línea del onboarding. | Copiarla del App Dashboard. |
| Límites de quick replies. Confirmados 13 por mensaje y título truncado a 20 caracteres; los 1000 caracteres de payload y el `content_type` `user_email` no. | Validaciones estrictas sobre números no confirmados. | Una llamada real, o no validar. |
| Re-review tras cambiar settings de la app. **NO_VERIFICABLE**: no se encontró en ninguna página abierta. | Determina si se puede tocar el dashboard durante la revisión. | Congelar icono, categoría, URLs y configuraciones desde el envío. Es prudencia, no requisito comprobado. |
| Data Access Renewal y Data Protection Assessment: qué requisitos aplican al perfil de Kavea y con qué periodicidad. | Trámite recurrente con capacidad de cortar el acceso de todos los tenants. | Pedir el detalle en el dashboard una vez la app esté conectada al negocio. |
| Changelog de Messenger Platform: HTTP 500 en las dos rutas, reproducido por tres verificadores. | Es la fuente de verdad de los deadlines de mensajería. Mientras siga caído, las fechas del 1-feb-2026 y del 31-mar-2026 quedan en confianza media-baja. | Abrirlo manualmente en un navegador y guardar copia local. |

---

## 15. Fuentes

Todas las URLs de `developers.facebook.com` que se abrieron durante la investigación y la verificación. Las marcas significan:

- **(roto)** — devuelve HTTP 500 o 404.
- **(no extraíble)** — la página existe pero devuelve solo navegación al fetcher; renderizado por JavaScript.
- **(cita refutada)** — la página existe pero no contiene el texto que se le atribuía. Está aquí para que nadie vuelva a citarla mal.
- **(vía descartada)** — documentación de Instagram Login, que Kavea no usa. Solo sirve para justificar el descarte.
- **(no oficial)** — foro, código de terceros o competidores. Confianza media o baja por definición.

### 15.1 Versiones y changelogs

- https://developers.facebook.com/docs/graph-api/changelog/
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://developers.facebook.com/docs/graph-api/changelog/version26.0/
- https://developers.facebook.com/docs/instagram-platform/changelog
- https://developers.facebook.com/docs/messenger-platform/changelog/ — **(roto)** HTTP 500, reproducido por tres verificadores
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog/ — **(roto)** HTTP 500

### 15.2 Instagram: elección de vía y comparación

- https://developers.facebook.com/docs/instagram-platform/overview/
- https://developers.facebook.com/documentation/instagram-platform/overview
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
- https://developers.facebook.com/docs/instagram-platform/app-review/
- https://developers.facebook.com/documentation/instagram-platform/app-review
- https://developers.facebook.com/docs/instagram-platform/webhooks
- https://developers.facebook.com/docs/instagram-platform/webhooks/examples/
- https://developers.facebook.com/docs/instagram-platform/reference/me/ — **(cita refutada)** existe, pero no lista campos ni valores de `account_type`; delega en la referencia del nodo User

**Vía descartada, solo referencia comparativa:**

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/ — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/ — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/ — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/migration-guide/ — **(vía descartada)**
- https://developers.facebook.com/docs/instagram-platform/reference/access_token/ — **(vía descartada)**
- https://developers.facebook.com/docs/permissions/reference/instagram_business_basic — **(vía descartada)**

### 15.3 Mensajería: Messenger Platform e Instagram Messaging API

- https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/utility-messages
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/sticker-api
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing
- https://developers.facebook.com/docs/messenger-platform/instagram/features/conversation-routing
- https://developers.facebook.com/docs/messenger-platform/instagram/get-started
- https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message
- https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/
- https://developers.facebook.com/docs/messenger-platform/instagram/features/moderate-conversations/ — mencionada por un verificador; su existencia no se corroboró en el changelog
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/ig-me-links
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/story-mention
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/quick-replies
- https://developers.facebook.com/docs/messenger-platform/discovery/private-replies
- https://developers.facebook.com/docs/messenger-platform/send-messages/saving-assets
- https://developers.facebook.com/docs/messenger-platform/reference/templates/generic — **(no extraíble)** devuelve solo navegación; nada de `is_reusable`, carrusel ni límite de tres botones quedó verificado
- https://developers.facebook.com/docs/messenger-platform/reference/send-api/ — **(no extraíble)**
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/message-tags — **(no extraíble)**

### 15.4 Webhooks: firma, payloads y entrega

- https://developers.facebook.com/docs/graph-api/webhooks/
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- https://developers.facebook.com/docs/graph-api/webhooks/sample-apps
- https://developers.facebook.com/docs/messenger-platform/webhooks
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
- https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages/ — **(cita refutada)** no contiene ninguna política de persistencia de adjuntos ni el TTL de `lookaside.fbsbx.com`; la frase que se le atribuía era una fabricación
- https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/standby/
- https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-reactions
- https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/message-echoes
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/reference/webhook-events/message-echoes
- https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messaging_handovers/
- https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/
- https://developers.facebook.com/docs/graph-api/securing-requests

### 15.5 Permisos, features y rate limits

- https://developers.facebook.com/docs/permissions/
- https://developers.facebook.com/docs/permissions/reference/pages_messaging
- https://developers.facebook.com/docs/permissions/reference/business_management
- https://developers.facebook.com/docs/features-reference/human-agent — **(cita refutada parcialmente)** confirma los 7 días, App Review y verificación de negocio, pero no contiene ninguna prohibición explícita de uso por bots ni menciona Instagram
- https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview/rate-limiting

### 15.6 Login, tokens y modelo multi-tenant

- https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business
- https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived
- https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
- https://developers.facebook.com/docs/business-management-apis/system-users/overview/
- https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/
- https://developers.facebook.com/community/threads/315935232634311/ — **(no oficial)** hilo del foro de la comunidad. Era la única fuente del deauthorize callback y no es documentación

### 15.7 Trámites: tipos de app, access levels, verificaciones y App Review

- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/app-types/
- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings/
- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
- https://developers.facebook.com/docs/development/build-and-test/app-roles/
- https://developers.facebook.com/docs/development/build-and-test/app-modes/
- https://developers.facebook.com/docs/graph-api/overview/access-levels
- https://developers.facebook.com/docs/development/release/business-verification/
- https://developers.facebook.com/docs/development/release/access-verification/
- https://developers.facebook.com/docs/development/release/tech-providers/
- https://developers.facebook.com/docs/development/terms-and-policies/privacy-policy/
- https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction
- https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review
- https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide
- https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/
- https://developers.facebook.com/documentation/resp-plat-initiatives/data-access-renewal
- https://developers.facebook.com/documentation/pages-api/create-an-app
- https://developers.facebook.com/documentation/development/create-an-app/instagram-use-case
- https://developers.facebook.com/blog/post/2019/09/23/live-mode-for-production-use/
- https://www.facebook.com/business/help/193400874040813 — **(no extraíble)** el Meta Business Help Center devuelve solo el título al fetcher
- https://www.facebook.com/business/help/159334372093366 — **(no extraíble)**
- https://www.facebook.com/business/marketing-partners/messaging — **(roto)** 404

### 15.8 Política de mensajería

- https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy
- https://developers.facebook.com/docs/messenger-platform/policy/policy-overview/

### 15.9 Anuncios

- https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/messaging-ads/click-to-instagram — confirma `page_id` obligatorio, tarea `ADVERTISE` y los permisos. **(cita refutada)** en cuanto a la estructura del webhook: no documenta el objeto `referral` ni `ads_context_data`

### 15.10 WhatsApp (pendiente de investigación propia)

Solo los cinco puntos verificados. Nada más de WhatsApp puede darse por confirmado.

- https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-led-business-verification/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview
- https://developers.facebook.com/docs/whatsapp/cloud-api/support/

### 15.11 Arte previo — no oficial

Todo lo siguiente es evidencia de terceros. Vale como señal de dónde muerde el problema, nunca como especificación.

**Chatwoot, código:**

- https://github.com/chatwoot/chatwoot/blob/develop/app/services/conversations/message_window_service.rb — el flag global 24h/7d que no hay que copiar
- https://github.com/chatwoot/chatwoot/blob/develop/app/jobs/webhooks/instagram_events_job.rb — mutex Redis de 3 s y comentarios sobre conversaciones duplicadas
- https://github.com/chatwoot/chatwoot/blob/develop/app/services/instagram/messenger/send_on_instagram_service.rb — `v11.0` hardcodeada en producción
- https://github.com/chatwoot/chatwoot/blob/develop/app/services/instagram/refresh_oauth_token_service.rb

**Chatwoot, issues y PRs:**

- issues/8583 — rechazo de App Review por cachear el media. El número de política "8.9.c" y el guion del revisor **no se pudieron confirmar** en el issue tal como se lee hoy
- issues/13860 — "Invalid Scopes" por pedir scopes de Instagram en un flujo solo-Messenger
- issues/14674 — `ACCOUNT_UPDATE` hardcodeado, error 100 el 27-abr-2026
- issues/14932 — restricción de Meta que tumbó Chatwoot Cloud en julio de 2026
- issues/13201 — **abierto** — App-Scoped ID de las solicitudes de borrado que no se puede resolver
- issues/13846 — migración de versión de API, abierto desde marzo de 2026
- pull/14793 y pull/14813 — `ArgumentError: 'sticker' is not a valid file_type` y lo mismo con `post`
- pull/14154 — SafeFetch, cierre del SSRF en la descarga de adjuntos
- issues/12935, issues/13275, issues/13033, issues/14584, issues/14058 — **no verificados por el verificador.** Fuente única comunitaria. Ninguno sostiene por sí solo una decisión de arquitectura

**Competidores:**

- https://respond.io/help/channels/instagram — **(no oficial)** checklist de onboarding y la única fuente de la prohibición de usar `human_agent` con bots
- https://help.manychat.com/hc/en-us/articles/14281290924444-How-to-connect-Instagram-to-Manychat — **(no oficial)** ruta exacta del toggle "Allow Access to Messages"
- https://community.manychat.com/product-updates/meta-s-deprecation-of-the-message-tags-feature-on-messenger-9010 — **(no oficial)** confirma que la deprecación de tags aplica a todos los países
- https://support.kommo.com/docs/connect-instagram-to-kommo — **(no oficial)**. La URL antigua `www.kommo.com/support/messenger-apps/instagram/` devuelve 301 y el contenido cambió: Kommo ya migró a Instagram Login
