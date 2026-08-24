# Kavea — Bitácora

Registro comprimido de lo ejecutado y lo pendiente. Una entrada por hito real, sin narrativa:
si algo no cambia una fila de la tabla de estado o una línea de pendientes, no entra aquí. El
detalle largo de cómo se investigó cada cosa, si hace falta reconstruirlo, está en el historial
de git de este mismo archivo.

**Regla:** solo entra lo comprobado, con la evidencia al lado. Lo planificado vive en
`docs/fases/`, lo pendiente en la sección 2.

---

## 1. Estado actual — al 23-ago-2026

| Pieza | Estado | Evidencia |
|---|---|---|
| Sitio público `kavea.ai` | ✅ Producción, con `/demo` | Formulario probado de extremo a extremo |
| Páginas legales | ✅ Publicadas | Rastreables por Meta |
| Repositorio | ✅ `Boosty-Hub/kavea`, privado | Monorepo, despliegue automático |
| App de Meta | ✅ Creada, dev mode | `compliant`, cero violaciones |
| DNS en Netlify | ✅ Delegada | SOA `dns1.p01.nsone.net` en 7 resolvedores |
| Esquema de base de datos | ✅ 86 migraciones aplicadas y registradas | En `public.schema_migrations` |
| Bandeja de correo interna | ✅ `/admin/correos` | RPC y bucket verificados |
| Aislamiento entre tenants | ✅ 61/61 comprobaciones · 10/10 canarios | C8, C9 y C10 añadidos el 23-ago |
| Ingesta y normalización | ✅ Producción | 8 crones vivos, mensajes reales entrando |
| Bandeja, tarjetas, embudos, ficha, agenda, reparto | ✅ Producción | Un contacto con varios canales en una tarjeta |
| Envío por Instagram | ✅ Texto, imagen, GIF, corazón | Echo en ≤6 s, contacto confirmando |
| Envío por Messenger | ✅ Probado el 6-ago | `messaging_type: RESPONSE`, id de Meta, sin error |
| WhatsApp — `+1 321-393-1397` | ✅ Cloud API directo, el 23-ago | Ciclo completo: entrante en la bandeja y saliente `enviado` con `wamid` de Meta |
| WhatsApp — `+1 829-954-3803` | ✅ Retirado el 23-ago | Conexión `disconnected`, canal apagado, webhooks dados de baja en Meta |
| Un hilo por número | ✅ Desde la 0082 | La tarjeta une los canales; el hilo ya no |
| Pausar y desconectar un canal | ✅ Desde Ajustes → Canales | 0079; el borde da de baja los webhooks en Meta |
| Plantillas de utilidad de Messenger | ✅ Leer y crear en vivo contra Meta | No se espejan en Postgres |
| Comentarios | ✅ Pestaña de la Bandeja, no módulo | Respuesta pública y lectura por API; el webhook sigue sin llegar |
| Callback de desautorización | ✅ Desplegado **y pegado** en el panel | Confirmado el 23-ago en Facebook Login for Business → Settings |
| Callback de borrado de datos | 🟡 Escrito en el formulario, guardado sin confirmar | Visto en pantalla el 23-ago con *Save Changes* todavía activo. `data_deletion_url` NO es legible por Graph, así que esto no se puede verificar por API — a diferencia de `deauth_callback_url`, que sí y devuelve la función correcta |
| Diagnóstico de conexiones | ✅ Dos baterías, V1–V7, cron diario | Página+Instagram y WABA+número no comparten un nodo del grafo |
| Panel interno | ✅ 5 pantallas | Salud, espacios, portafolio, accesos, uso |
| Alta de cliente desde el panel | ✅ Ejecutada el 6-ago | Primera vez desde que se construyó |
| Tiempo real de la bandeja | ✅ Desde la 0086 | Nunca funcionó antes: canal privado sin política y emisión por el tópico público. Lo tapaba el sondeo de 60 s |
| Registro self-service | ✅ Operativo | Alta real el 23-ago: correo de confirmación **entregado** por Resend |
| Subdominio del inquilino | 🟡 Automático, pero lento | La función `subdominio` da el alias por API; el DNS tarda y no siempre |
| Navegación | ✅ Sidebar por secciones, colapsable | Trabajo / Datos / Cuenta, con no leídos |
| Acceso en `kavea.ai` | ✅ Página de entrada por subdominio | Antes no había ningún enlace |
| Claves legacy de Supabase (JWT) | ✅ Deshabilitadas | `api-keys/legacy` responde `enabled:false`; la app usa `sb_publishable_*` y `sb_secret_*`, con guardián en CI |
| Privilegios de `anon` y `authenticated` | ✅ Auditados el 23-ago | RLS activo y forzado en las 33 tablas; TRUNCATE retirado en la 0085 |
| **Tech Provider** | ✅ Verificado el 4-ago | `Submitted → Reviewed → Verified` en 12 h |
| WABA de un tercero en el portafolio | ✅ Ya existe una, sin descubrir hasta el 23-ago | `755757354157392` «Platinium Insurance group corp», `ownership_type: CLIENT_OWNED`, negocio propio `24123447600679995` verificado y APPROVED. **`subscribed_apps` vacío**: nadie recibe sus webhooks |
| App Review | ⛔ **Enviado y contestado el 7-ago: 5 aprobados, 8 rechazados** | Los 8, por «Screencast Not Aligned». Ver `docs/07` §1 |
| WhatsApp para terceros | ✅ Aprobado por Meta | `whatsapp_business_messaging` y `whatsapp_business_management` |
| Instagram y Messenger para terceros | ⛔ Rechazados | 6 permisos; solo funcionan dentro del portafolio de Boosty |
| Correo saliente | ✅ Funciona | `kavea.ai` `verified` en Resend, y Supabase Auth manda por su SMTP |
| Nombre a mostrar de `+1 321-393-1397` | ⚠️ `PENDING_REVIEW` en Meta | No bloquea enviar; es lo que ve el contacto |
| Plantillas de WhatsApp | ⛔ Sin cablear con Meta | Modelo existe; las 25 aprobadas están en la WABA que se retira |
| Facebook Login for Business | 🟡 Configurado, sin código | `config_id 1721663745727123` · system-user · sin caducidad · URI de retorno puesta con Strict Mode. Falta el flujo |
| Permisos de la app, por API | ✅ 5 `live` | `business_management`, `pages_show_list`, `public_profile`, `whatsapp_business_management`, `whatsapp_business_messaging` |
| Embedded Signup de WhatsApp | 🟡 Desbloqueado, sin construir | Tech Provider (4-ago), permisos de WhatsApp (7-ago) y negocio `verified`. El token tiene `manage_app_solution`; `/{app}/whatsapp_business_solutions` existe y devuelve `[]` |
| Agentes (fase 6) | ⏸ Aparcada | Sin `ANTHROPIC_API_KEY` |
| Comodín `*.kavea.ai` | ⛔ Bloqueado por Netlify | `422 invalid site`, recomprobado el 23-ago. El certificado del sitio SÍ es comodín; lo que falta es el registro DNS |

Fases 0–4 operativas, fase 5 en su tarea 12.

---

## 2. Pendiente, por bloqueo

### Con fecha encima
- **Rehacer el App Review de los 8 permisos rechazados.** Antes de grabar nada, declarar en el
  envío que Kavea es server-to-server con token de system user: es el quinto punto de la propia
  lista de Meta y explica por qué los vídeos no pueden enseñar el login de Meta ni la pantalla de
  consentimiento —los dos primeros requisitos que se incumplieron en los ocho—. Con el botón
  **Request again**; no hay que rehacer el formulario.
- **Y antes de eso, construir tres cosas que los vídeos tienen que enseñar y no existen:** editar
  y borrar un comentario propio · leer y pintar contenido de la Página (posts, fotos, eventos)
  con la identidad de la Página visible · una pantalla de perfil de Instagram con sus campos y su
  lista de medios. Detalle verbatim en `docs/07` §1.
- **Las llamadas de prueba caducan el 5-sep-2026.** Se hicieron el 6-ago. Si el nuevo envío sale
  después, hay que repetirlas antes.

### El subdominio del inquilino, que es lo que queda cojo
- **El DNS de un alias nuevo no es inmediato y no es predecible.** `cuenta` y `conectar`
  respondieron en segundos; `demostracion` seguía sin existir para el autoritativo quince
  minutos después. Hasta entender por qué, `/crear` no redirige. Medir cuánto tarda de verdad
  con dos o tres altas más.
- **El comodín `*.kavea.ai`: ticket abierto y contestado, pendiente de responderle.** Netlify
  acusó recibo el 23-ago como **#1097522** y pide confirmar el encuadre antes de asignar agente.
  Su resumen se queda corto —dice «configurar registros DNS para kavea.ai en el sitio
  kavea-app»—, y contestar «yes» a secas manda al agente un ticket vago. Hay que confirmar Y
  precisar: lo que se pide es un registro **comodín** para los subdominios de inquilino, que la
  API rechaza con `422 invalid site` aunque el certificado del sitio ya sea `*.kavea.ai`. Con él
  sobran los alias por inquilino y el alta deja de depender de una llamada a Netlify.
- **Los plantillas de correo de Supabase están en inglés** («Confirm your email address») en un
  producto en español.
- Cuando haya varios inquilinos, mirar el tope de alias por sitio de Netlify antes de chocar
  con él.

### La decisión de arquitectura que ordena el resto
Kavea no puede ser un producto por suscripción con token de system user: ese token solo alcanza
activos del portafolio de Boosty. El camino es **Facebook Login for Business** (Embedded Signup
para WhatsApp), ya diseñado en `docs/fases/05`. Y montarlo es a la vez el arreglo del App Review,
porque hace grabables el login de Meta y la pantalla de consentimiento. Orden acordado el
23-ago: **WhatsApp autoservicio primero** —sus permisos ya están aprobados y Tech Provider
también, así que no depende de nadie— y Facebook Login for Business después, sirviendo al mismo
tiempo para el reenvío de Instagram y Messenger.

Sin confirmar, y hay que confirmarlo antes de planificar encima: si el revisor de Meta, con su
propia cuenta y sin rol en la app, puede completar el diálogo de una configuración que pide
permisos aún no aprobados. Para GRABAR el vídeo basta una cuenta con rol; para que él lo pruebe,
no se sabe.

### Bloqueado por Meta
- **Confirmar que la URL de borrado de datos quedó GUARDADA.** El 23-ago se vio escrita en
  Facebook Login for Business → Settings → *Data Deletion Request URL*
  (`https://sdazqohyjzzylwbkvovx.supabase.co/functions/v1/meta-borrado`), pero con la barra
  *Discard / Save Changes* todavía en pie: en ese panel eso significa cambio sin guardar. Y no
  hay forma de comprobarlo por API — `data_deletion_url` no existe como campo en Graph, mientras
  que `deauth_callback_url` sí y devuelve la función correcta. Aquí solo vale volver a abrir la
  pantalla y mirar.
- **Tech Provider onboarding no se puede leer: la página revienta en el servidor de Meta.** No
  está vacía. La consola del navegador enseña la petición del pagelet
  (`view: wa-dev-quickstart`, `tab: onboard`, `page: whatsapp-business`,
  `use_case_enum: WHATSAPP_BUSINESS_MESSAGING`) devolviendo **error 1007 «Something went wrong»**.
  Es un fallo de Meta, así que reintentar tiene sentido: otro navegador, sesión limpia, otro día.
  Todo lo demás de esa consola es ruido — el CSP del propio Facebook bloqueando sus propios
  píxeles de telemetría.
- Nadie vigila la bandeja de resultados del App Review. La respuesta del 7-ago estuvo dieciséis
  días sin leerse y no hay nada que avise: ni correo encaminado, ni comprobación en el cron de
  diagnóstico. Mientras no lo haya, se mira a mano.
- Cablear las plantillas de WhatsApp. Las 25 aprobadas viven en la WABA `1415042803155441`, que
  se retira: para el número nuevo hay que crearlas de cero en `2459716937850832`.
- Facebook Login for Business: crear `config_id`, decidir qué host fijo lleva el OAuth callback
  (Strict Mode exige coincidencia exacta; el `state` firmado ya lleva `organization_id`, así que
  un solo host basta). Bloquea la fase 5, no el App Review.
- Incertidumbres de Meta sin resolver: TTL de las URLs `lookaside.fbsbx.com` · límite real del
  Send API de Instagram (100 o 300/s) · suelo de `4800×impresiones` para cuentas nuevas ·
  disponibilidad regional (VE/RD/MX) de Human Agent, private replies y Conversation Routing ·
  `messaging_type=UPDATE` sin probar.
- C1, C2, C4, C5, C7, C8 de `docs/fases/05` §10 necesitan un portafolio de prueba ajeno a Boosty.

### Bloqueado por decisión de Gabriel
- Fase 6 (agentes IA): aparcada, y falta `ANTHROPIC_API_KEY`.
- Carril de acuse automático sub-30 s a todo entrante: decisión de producto pendiente.
- Límites de la cuenta gratuita pública (el Tech Provider que la condicionaba ya llegó).
- Facturación: se mide uso, no se cobra. Tarifas y márgenes sin empezar.
- Si se puede cambiar el subdominio de un cliente: sin decisión.
- Impersonación con registro, para soporte: sin construir.

### Trabajo sin bloqueo — fase 5 (autoservicio, 24/26 tareas)
Dos configs de Facebook Login for Business por canal · `/api/meta/oauth/start` + `/callback` ·
token BISU con rotación por `kid` y cron diario de `debug_token` · enlace de conexión firmado,
un solo uso, 72 h, sin sesión de Kavea · máquina de estados por (organización, canal) ·
Conversation Routing (`primary_receiver`, `thread_owner`, los seis endpoints) · árbol de
diagnóstico diferencial · pantalla de expectativas de WhatsApp.

### Trabajo sin bloqueo — resto
- Borrar del portafolio la WABA vacía «Gabriel Montiel Toro» (`1621952576167448`), sin números.
- Messenger nunca se probó de extremo a extremo con un contacto real (Instagram sí, varias veces).
- Circuit breaker de límites a `call_count > 80` (hoy se reacciona, no se previene).
- Corte de texto de Instagram por 1000 bytes respetando grafemas (hoy se rechaza, no se corta).
- Reconocer los envíos propios de Instagram por `mid` en vez de `app_id` (no existe en los
  echoes de IG). El `message_id` del Send API ya se guarda en `send_api_message_id`; falta
  compararlo en el aplicador.
- Enriquecer contacto con nombre/foto vía `GET /{igsid}?fields=name,username,profile_pic` — no
  pide permiso nuevo.
- Reintentar perfiles de Messenger cuando `pages_messaging` tenga acceso avanzado.
- Panel interno: pedir break-glass desde la pantalla (hoy solo por SQL) · superficie para
  `alertar()`, que hoy solo escribe · ficha por espacio, hoy todo son agregados.
- Fase 7: kill-switches (global / tenant / canal) · marcar caducados los mensajes que perdieron
  la ventana en vez de tirarlos en silencio · `GET /api/estado` con banner en <30 s · tenants
  canario · documento de límites que firma el cliente antes del alta.
- Login único por correo (la cookie de sesión ya se fija en `.kavea.ai`; falta resolver cuando un
  usuario esté en varias organizaciones).
- Guarda de tipos en CI para las Edge Functions (hoy Deno no se typechequea en ningún job).
- Reconciliar `docs/fases/` contra lo ya ejecutado — hoy varios documentos dicen «sin código»
  sobre partes que están en producción.

### Deuda que va a doler si se deja
- Rotar los tokens que pasaron por chat: el de portafolio primero (escribe en nombre de 39
  Páginas de clientes + 28 con rol de system user), después el PAT de Supabase, Resend, Netlify,
  la clave secreta y la contraseña de la app. **Sube de prioridad**: entre el 4 y el 23-ago el
  blob cifrado del token de WhatsApp era legible por `anon` (entrada del 23-ago).
- `private.avisar_bandeja` abre una subtransacción por mensaje; el lote está topado en 64 porque
  el caché de subtransacciones de Postgres también es 64. Sin medir su efecto real.
- `conversations.no_leidos` sigue marcada como sospechosa desde el 3-ago. El contador que de
  verdad se usa es el de `tarjetas`; el de `conversations` no lo mantiene nadie.

### Decisiones sin fecha límite
Retención de `webhook_events` · presupuesto de latencia p95 del normalizador · nivel de PITR en
producción · retención tras la baja de un cliente.

---

## 3. Entradas

### 2026-08-23 (noche) — La puerta que no abre, y el cliente que ya estaba dentro

Tres cosas: una página de Meta que se cayó, un ticket de Netlify que contestó, y un hallazgo en
el propio portafolio que cambia el orden de lo que queda.

**Tech Provider onboarding no está vacío: está roto.** Salía en blanco, y la consola dice por
qué. La petición del pagelet del panel —`view: wa-dev-quickstart`, `tab: onboard`,
`page: whatsapp-business`, `use_case_enum: WHATSAPP_BUSINESS_MESSAGING`— devuelve
**`error 1007: Something went wrong`**. Eso es un fallo del servidor de Meta, no una sección sin
contenido, y la diferencia importa: una sección vacía sería una respuesta («no tienes esto»);
un 1007 no es respuesta ninguna. Se reintenta. Los cientos de líneas rojas que la acompañan son
ruido: el CSP de `developers.facebook.com` bloqueando los píxeles de telemetría del propio
Facebook contra `*.run.app` y `*.on.aws`. Ni una sola tiene que ver con Kavea.

**Y mientras la puerta no abría, resulta que ya habíamos entrado.** Preguntando por API en vez
de por pantalla:

    GET /2167414613399354/client_whatsapp_business_accounts
    → { "id": "755757354157392", "name": "Platinium Insurance group corp", ... }

`client_whatsapp_business_accounts` es la arista de WABAs que NO son del portafolio y que un
tercero ha compartido contigo. Tiene una. La WABA declara `ownership_type: CLIENT_OWNED`, su
negocio dueño es `24123447600679995` —distinto de Boosty—, y está `verified` y `APPROVED`. O
sea: la relación proveedor↔cliente que Embedded Signup construye **ya existe en esta cuenta**,
con un cliente real dentro, montada por otra vía y antes de que este proyecto la buscara.

Lo que falta es lo de siempre, el cable: **`GET /755757354157392/subscribed_apps` devuelve `[]`**.
Ninguna aplicación está suscrita a esa WABA, así que sus mensajes no llegan a ningún sitio.
El patrón del día repetido por tercera vez —la pieza construida y el enchufe suelto—, pero
esta vez con la pieza puesta por Meta y el cliente esperando al otro lado.

Alrededor, lo que sí se pudo verificar por API: Boosty Digital LLC (`2167414613399354`) está
`business_verification_status: verified`; la WABA propia `2459716937850832` está `APPROVED`; y
el token de system user lleva **`manage_app_solution`** entre sus dieciocho permisos y no caduca
(`expires_at: 0`). La arista `/{app-id}/whatsapp_business_solutions` **existe** y devuelve `[]`
—no da error, que es la diferencia entre «no puedes» y «no tienes»—, lo cual encaja con haber
descartado Partner Solutions ayer por otro motivo.

**El callback de desautorización, confirmado por API y no por captura:**

    GET /1623464799201071?fields=deauth_callback_url
    → "https://sdazqohyjzzylwbkvovx.supabase.co/functions/v1/meta-desautorizar"

El de borrado no se puede comprobar así: `data_deletion_url` no es un campo de Graph
(`(#100) Tried accessing nonexisting field`). En la captura está escrito, pero con la barra
*Discard / Save Changes* todavía en pie — que en ese panel significa cambio pendiente. Queda
como «escrito, guardado sin confirmar» hasta que alguien reabra la pantalla. Que un campo se vea
relleno no quiere decir que esté guardado, y aquí no hay segunda fuente que lo desmienta.

**Netlify contestó el ticket del comodín**, **#1097522**, en 28 minutos, con un mensaje de
encuadre: resume la petición como «configurar registros DNS para tu dominio kavea.ai con tu
sitio kavea-app» y pide un «yes» para asignar agente. El resumen no es falso, pero es más ancho
que el problema: lo que hace falta es el registro **comodín** para los subdominios de inquilino,
que es exactamente lo que la API rechaza con `422 invalid site`. Contestar «yes» a secas manda
al agente a mirar DNS en general. Se contesta confirmando y precisando en la misma frase.


### 2026-08-23 (tarde-noche) — El panel de Login, revisado campo a campo

Con la configuración creada, se repasó **Facebook Login for Business → Settings**. Tres cosas
que estaban bien, una que faltaba y una que descarta un camino.

**Puesto y confirmado:** `https://conectar.kavea.ai/api/meta/oauth/callback` en *Valid OAuth
Redirect URIs*, con **Use Strict Mode for redirect URIs en Yes** — que es lo que obliga a un host
fijo y lo que hace que el `state` firmado tenga que llevar el `organization_id`. También
`Client OAuth login`, `Web OAuth login` y `Enforce HTTPS` en Yes.

**El callback de desautorización YA estaba pegado.** La §2 llevaba desde el 6-ago pidiendo
«pegar `deauth_callback_url` en App settings»: hecho, apunta a la función de borde. Un pendiente
menos que en realidad no lo era.

**Y el de borrado de datos, NO.** *Data Deletion Request URL* está vacío, mientras
`meta-borrado` lleva desplegada desde el 6-ago, está ACTIVE y responde 200. La función existe,
la página de estado existe, y Meta no sabe a dónde llamar. Es el mismo patrón del día: la pieza
construida y el cable sin enchufar.

**`Login with the JavaScript SDK` está en No** y *Allowed Domains for the JavaScript SDK* vacío.
No estorba al flujo por redirección que vamos a construir, pero conviene tenerlo presente: si
Embedded Signup de WhatsApp acaba necesitando el SDK de JavaScript, hay que encenderlo y
declarar el dominio.

**Partner Solutions no es nuestro camino.** Lo dice su propia descripción: sirve para que **dos**
socios —Solution Partners, Tech Providers, Tech Partners— gestionen conjuntamente los activos de
WhatsApp de un cliente. Kavea onboarda a sus propios clientes, sin segundo socio. Queda
descartado, y con eso la única puerta sin abrir para Embedded Signup es **Tech Provider
onboarding**.

### 2026-08-23 (cierre) — La primera configuración de Facebook Login for Business

Creada `kavea-mensajeria`, `config_id` **1721663745727123**. Es la pieza que sustituye al token
de system user de Boosty por uno del portafolio de cada cliente.

**Lo irreversible, que el asistente avisa dos veces:** variación de login `General` —la única
que Meta ofrece—, token de **system-user** y caducidad **Never**.

Lo de `Never` va contra la recomendación de Meta, que propone 60 días, y es a conciencia: **no
hay endpoint de refresco del BISU**, así que renovar significa que el cliente vuelva a pasar por
el diálogo. Con 60 días eso es cada cliente cada dos meses, y el día que no lo haga su canal
deja de entregar sin decir nada. A cambio nos toca sostener la seguridad que Meta compraba con
la caducidad, y eso ya está construido: AES-256-GCM con la clave fuera de la base, `kid` desde
el primer día, el esquema `private` que PostgREST no expone, y el cron diario de `debug_token`.
**Queda pendiente** asegurarse de que ese cron mire también los tokens BISU de clientes.

**Nueve permisos y una desviación del diseño.** `docs/fases/05` pedía dos configuraciones, una
por canal, para no pedir scopes de más. Se hizo una sola para Messenger e Instagram: hoy los
ocho permisos de ambos están rechazados y se reenvían juntos, así que separarlos no protege de
nada y duplica el diálogo al cliente. Si la próxima ronda los aprueba por separado, hay que
partirla.

**Sobre los activos, un punto medio.** `Pages` obligatorio; `Instagram accounts`, `Ad accounts`,
`Catalogs` y `Pixels` opcionales y **sin pedir sus permisos**. La razón de incluirlos ya: añadir
un permiso después obliga a que TODOS los clientes vuelvan a consentir. La razón de no pedir sus
permisos: un permiso sin función que enseñar es el rechazo número nueve, con constancia en el
historial de la app. En `Ad accounts` se eligió **ANALYZE**; el valor por defecto era **MANAGE**,
que incluye los ajustes y las finanzas de la cuenta publicitaria del cliente.

**Dos cosas medidas que cierran preguntas abiertas:**

- **`pages_read_user_content` no hace falta.** El diseño lo daba como dependencia de
  `instagram_basic` con la nota «sin confirmar». El selector no lo ofrece y Meta no lo autoañade
  pese a decir que autoañade dependencias.
- **WhatsApp no se conecta por Facebook Login for Business.** El paso de activos no ofrece
  ninguna cuenta de WhatsApp, aunque el de permisos sí liste `whatsapp_business_*`. Permiso sin
  activo no sirve. Y la única plantilla de Embedded Signup que ofrece Meta entrega un **token de
  60 días**, que es justo lo que no queremos.

**Y por fin verificado por API en vez de por captura**, ahora que el App Secret está en el
entorno: `GET /{app-id}/permissions` devuelve **cinco** permisos `live`, exactamente los cinco
aprobados el 7-ago. Los ocho rechazados no están.

### 2026-08-23 (noche) — El registro se abre de verdad, y el subdominio no llega solo

Gabriel pasó las credenciales de Resend y Netlify, y con ellas se cerró lo que ayer bloqueaba el
autoservicio.

**El correo ya funcionaba y nadie lo sabía.** `kavea.ai` figura `verified` en Resend. La tabla de
la §1 llevaba semanas diciendo «correo saliente no funciona, DNS sin verificar»: otra afirmación
caducada, la tercera de esta jornada.

**Supabase Auth, conectado a Resend.** `smtp.resend.com:465`, remitente `support@kavea.ai`
—dirección con MX entrante hacia `/admin/correos`, así que una respuesta la ve alguien—,
`site_url` de `localhost:3000` a `https://cuenta.kavea.ai`, lista de redirecciones permitidas,
`password_min_length` de 6 a **8** para que el servidor deje de ser más flojo que la pantalla, y
el límite de correos de 2/hora a 100. Un detalle de la API: `smtp_port` se rechaza como número y
hay que mandarlo como cadena.

**Probado con un alta real**, no con la configuración: usuario creado en producción, y en el
registro de Resend aparece «Confirm your email address … delivered». Después se borró el usuario
de prueba.

**Los dos hosts sin inquilino existen**: `cuenta.kavea.ai` y `conectar.kavea.ai`, alias del sitio
`kavea-app`. Netlify creó sus registros y respondieron **200 en segundos**.

**Y ahí apareció el hueco de verdad.** La zona lleva un registro por host y no hay comodín, así
que cada inquilino necesita su alias. Con las altas conducidas por Boosty eso era tolerable; con
el registro abierto significa que alguien se registra y aterriza en un host muerto — la lección de
la 0059 repetida una capa más arriba. Se construyó la función de borde `subdominio`, que pide el
alias a Netlify leyendo el slug **de la base** y no del parámetro (si viniera de fuera, se podría
pedir un alias para `admin`), idempotente y con el token de Netlify solo en el borde.

**Con ella se descubrió que `demostracion.kavea.ai` nunca tuvo alias**: el espacio creado el
6-ago llevaba diecisiete días siendo inalcanzable, y el alta de aquel día dijo «hecho».

**Lo que NO se puede prometer, y por eso el código ya no lo promete.** Que Netlify acepte el
alias no significa que el host resuelva. `cuenta` y `conectar` fueron instantáneos;
`demostracion`, dado de alta igual y con su registro ya listado en la zona, seguía sin existir
**para el servidor autoritativo** quince minutos después. No sé explicar la diferencia, así que
`/crear` dejó de redirigir: enseña la dirección, dice que puede tardar, y no manda a nadie a un
error de DNS.

**Y el comodín, recomprobado en vez de recordado:** `POST` de un registro `*.kavea.ai` devuelve
`422 invalid site`. Sigue bloqueado. Curiosamente el certificado del sitio **sí** es `*.kavea.ai`,
así que TLS nunca fue el problema: lo que falta es el registro DNS.

### 2026-08-23 (construcción) — La puerta del autoservicio, y lo que la tiene cerrada

Primera rebanada del alta self-service. **El código está; el alta no funciona todavía**, y el
motivo no es código.

**Lo construido.** `registrarse` (migración 0087): un usuario con sesión y **correo confirmado**
crea su organización y queda propietario en la misma transacción. No se tocó `crear_espacio`
—la vía conducida por Boosty, que exige staff y deja invitación—: una función con dos amos
acaba autorizando al que no debe. Con ella, `subdominio_libre`, que devuelve un booleano y nada
más porque un `select` sobre `organizations` enumeraría la lista de clientes de Kavea.

Dos pantallas en la superficie **sin inquilino** (`cuenta.kavea.ai`, ya reservada en
`dominio.ts` y en el CHECK de la 0087): `/registro` crea la cuenta y manda el correo, `/crear`
recibe el enlace de confirmación y elige nombre y subdominio, con comprobación en vivo.

**Un tope de abuso, dicho como lo que es:** una organización por persona. No es regla de
producto — sin él, una cuenta confirmada se sienta encima de cien subdominios en un minuto.

**Y lo que impide abrirlo hoy**, medido en la configuración del proyecto:

- `smtp_host: None` y `rate_limit_email_sent: 2`. Supabase usa su remitente de cortesía:
  **dos correos por hora en todo el proyecto**. Con `mailer_autoconfirm: false` cada alta
  necesita uno. El registro público no puede funcionar así, y es el mismo pendiente de
  «correo saliente no funciona» que llevaba semanas como cosmético.
- `site_url: http://localhost:3000`. Los enlaces de confirmación apuntarían ahí.
- `uri_allow_list` vacía: `emailRedirectTo` se ignora y todo cae en `site_url`.
- `password_min_length: 6` mientras la pantalla pide 8. **El servidor es más flojo que la
  interfaz**, así que ocho es lo que Kavea pide y seis lo que acepta.

**Y un defecto que solo salió en la captura:** el sidebar entero —Bandeja, Embudo, Agenda— se
pintaba en la página de registro, a alguien que todavía no tiene cuenta ni organización.
`sinMenu()` no las conocía, y en esa función no hay nada que delate qué rutas existen.

### 2026-08-23 (decisión) — El token de system user no llega a un producto por suscripción

Pregunta de Gabriel: si Kavea va a ser público por suscripción, ¿puede seguir conectando con un
token de system user? **No.** Y la respuesta cambia el orden de todo lo demás.

**Por qué no.** Un token de system user alcanza los activos que viven en el portafolio de
Boosty: los propios y los que un cliente asignó a mano al Business Manager. La Página de alguien
que se registra en la web un martes por la noche no está ahí, y no hay forma de que lo esté sin
que una persona de Boosty y una del cliente se pongan de acuerdo. Eso es un alta B2B, no una
suscripción.

**La vía que sí llega es Facebook Login for Business**, y para WhatsApp su variante Embedded
Signup: el cliente pulsa un botón, ve el diálogo de Meta, concede acceso, y Kavea recibe un token
BISU acotado al portafolio de ESE cliente. `docs/fases/05` ya lo tiene diseñado entero —bloques A
a I, 26 tareas, 24 sin hacer— con las dos vías de alta conviviendo: la A por activo asignado,
que es la que se usa hoy con las 39 Páginas de clientes, y la B por OAuth, que es la del
autoservicio. Las dos terminan en la misma fila de `meta_connections`; lo que cambia es de dónde
sale el token.

**Y aquí está lo que nadie había atado: montar el login ES el arreglo del App Review.** Los ocho
permisos se rechazaron porque los vídeos no enseñaban «the complete Meta login flow» ni «a user
granting app access». Con Facebook Login for Business esas dos pantallas EXISTEN y se pueden
grabar. Los dos problemas —vender a público y pasar la revisión— tienen la misma solución, y
resolverlos por separado es hacer el trabajo dos veces.

**Lo que ya se puede vender hoy, sin esperar a nada.** Los cinco permisos aprobados el 7-ago
—`whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`,
`pages_show_list`, `public_profile`— son exactamente el conjunto que necesita Embedded Signup de
WhatsApp. Y `docs/fases/05` lo daba por bloqueado «hasta que Meta apruebe Tech Provider», que
pasó el 4-ago: ese bloqueo ya no existe y el documento no se enteró.

**El huevo y la gallina, dicho como es.** Una configuración de Facebook Login for Business no
puede pedir un permiso que la app no tenga en Advanced Access, o el cliente sin rol en la app
recibe un error de scopes. Para Instagram y Messenger eso significa que el diálogo real solo
funciona con cuentas que tengan rol en la app mientras siga en modo desarrollo —que es
suficiente para GRABAR el vídeo, pero hay que comprobar si le basta al revisor cuando lo pruebe
él—. Sin confirmar; se comprueba antes de planificar sobre ello.

**Decidido:** el orden pasa a ser WhatsApp autoservicio primero (desbloqueado hoy), y Facebook
Login for Business después, sirviendo a la vez para el reenvío de Instagram y Messenger.

### 2026-08-23 (repaso) — El App Review llevaba dieciséis días contestado

Gabriel abrió la pantalla de App Review y ahí estaba el resultado, fechado el **7-ago-2026 a las
08:18 GMT-4**. Este repositorio decía otra cosa: `docs/07` §1 afirmaba «nunca se ha enviado nada»
y la tabla de la §1 de aquí ponía «contenido listo, sin enviar». Las dos frases eran ciertas al
cierre del 6-ago y dejaron de serlo esa misma noche.

**Cinco aprobados** — `whatsapp_business_messaging`, `whatsapp_business_management`,
`pages_show_list`, `business_management`, `public_profile`. WhatsApp queda completo para
terceros: recibir, enviar y gestionar la WABA.

**Ocho rechazados** — Human Agent, `pages_manage_metadata`, `pages_utility_messaging`,
`instagram_manage_comments`, `pages_messaging`, `instagram_manage_messages`,
`pages_read_engagement`, `instagram_basic`. Instagram y Messenger no se pueden ofrecer fuera del
portafolio de Boosty, así que la fase 5 solo puede vender WhatsApp.

**Los ocho, por la misma causa, y no es el producto.** «Screencast Not Aligned with Use Case
Details». Los dos primeros requisitos que Meta exige de cada grabación son el login completo de
Meta y la pantalla donde un usuario concede permisos. **Kavea no tiene ninguno de los dos, y no
es un olvido: es la arquitectura.** Conecta como Tech Provider con token de system user; no hay
pantalla de login de Meta que grabar. La salida estaba en el quinto punto de la misma lista
—declarar que es server-to-server / system user token para que Meta sepa que ese flujo no es
visible— y no se aplicó.

Tres de las notas del revisor piden además funcionalidad **que no existe**: el bucle completo de
moderación de un comentario (crear, editar, borrar), leer y pintar contenido de la Página, y una
pantalla de perfil de Instagram. Eso no es volver a grabar, es construir y luego grabar.

**Lo que este día deja anotado no es el rechazo, es el silencio.** El resultado llevaba
dieciséis días en el panel y nada lo empuja hacia fuera: ni correo encaminado a la bandeja
interna, ni una comprobación en el cron de diagnóstico. Es el mismo patrón que las cuatro
ejecuciones de CI en rojo del 6-ago y que el tiempo real que nunca funcionó: **el fallo no fue
el fallo, fue que nadie se enteró.**

No se pudo verificar por API: `META_APP_SECRET` está vacío en el `.env.local` de esta máquina,
así que no hay token de app con el que llamar a `/{app-id}/permissions`. La fuente es el panel.

### 2026-08-23 (cierre) — Cuatro defectos que solo se vieron abriendo el navegador

Gabriel pidió que la interfaz se compruebe **siempre** con Playwright y capturas antes de darla
por hecha. La misma sesión demostró por qué: `pnpm typecheck` y `pnpm build` estaban en verde con
los cuatro defectos de abajo dentro, y uno de ellos era un arreglo que yo ya había dado por bueno.

- **El tiempo real seguía roto después de «arreglarlo».** La 0086 puso la política y cambió la
  emisión, pero el canal seguía devolviendo `CHANNEL_ERROR`. Los frames del websocket dieron el
  motivo exacto: el cliente lanza un `phx_join` **sin `access_token`** —se une antes de que la
  sesión esté puesta—, cobra `Unauthorized: You do not have permissions to read from this Channel
  topic`, y reintenta con el JWT recibiendo `status: ok`. O sea que la política era correcta y el
  error era transitorio. Probado que **entrega**: contando las peticiones RSC, una difusión llega
  en menos de 5 s, muy por debajo del sondeo de 15 s. El aviso de consola pasa a tener diez
  segundos de gracia para no gritar en cada carga.
- **Claves de React duplicadas.** `key={c.canal}` con dos conversaciones de WhatsApp en la misma
  tarjeta daba dos claves `whatsapp`. Regresión directa de la 0082, invisible al compilador.
- **Dos píldoras «WhatsApp» idénticas** en la fila, sin forma de saber por cuál número llegó
  cada hilo. Ahora dicen `WhatsApp ·1397` y `WhatsApp ·3803`; el número completo queda en el
  `title`, porque entero no cabe y la última píldora se salía de la columna. Y `white-space:
  nowrap`, que hasta ahora no hacía falta: ninguna etiqueta tenía guiones por donde romperse, y
  el número se pintaba en tres líneas.
- **La lista de la bandeja, recortada en móvil.** 564 px dentro de una ventana de 390, con los
  enlaces de cabecera y el último filtro inalcanzables —recortados, no desplazables—. La causa
  es `grid-template-columns: 1fr`, que es `minmax(auto, 1fr)`: ese `auto` no baja del min-content
  del contenido. Con `minmax(0, 1fr)` y `min-width: 0` en la lista, cero elementos desbordan.

**Y un error mío que conviene dejar escrito:** informé de una errata «Bandeia» en el título
leyendo una captura. No existía —el `innerText` dice «Bandeja»—, era el antialiasing de la `j`.
Para texto se lee el DOM; los píxeles sirven para el espacio, no para las letras.

`scripts/capturar.mjs` acepta ahora `KAVEA_BASE` y `KAVEA_ADMIN`: antes solo sabía mirar
producción, que es justo cuando ya no sirve.

### 2026-08-23 (noche) — El tiempo real de la bandeja no funcionó nunca

Sintoma reportado: entra un mensaje de fuera, la conversación nueva no aparece y hay que
recargar la página.

No era un fallo, eran **cuatro encadenados, y los cuatro mudos**. Lo que sostenía la pantalla
era el sondeo de seguridad de 60 s de `Refrescador`, escrito para cubrir un socket que deja de
entregar y que en realidad llevaba desde el principio siendo el único mecanismo vivo.

1. **`realtime.messages` tiene RLS activada y cero políticas.** Un canal privado se autoriza con
   una política sobre esa tabla; sin ninguna, la suscripción se deniega. `authenticated` ya
   tenía SELECT, INSERT y `USAGE` sobre el esquema: lo único que faltaba era la política. Es una
   ausencia que no se ve leyendo código — no falta una línea en ningún fichero, falta una fila
   en un catálogo.
2. **`avisar_bandeja` emitía con `private => false`** mientras el cliente se suscribe con
   `config: { private: true }`. Aunque lo anterior estuviera resuelto, los avisos salían por el
   tópico público y el cliente escuchaba el privado. Medido: las 5 difusiones del día, todas con
   `private = false`.
3. **`Refrescador` no miraba el estado de `subscribe()`.** Un `CHANNEL_ERROR` por autorización
   denegada no se distinguía de un canal sano.
4. **`avisar_bandeja` se tragaba toda excepción** con `when others then return null`. El fondo
   es correcto —un aviso que falla no puede tumbar la ingesta de un mensaje— pero mudo del todo
   convierte cualquier rotura futura en otro mes de bandeja quieta.

**Arreglado en la 0086** (política de SELECT sobre `realtime.messages` acotada a los miembros de
la organización del tópico, y emisión con `private => true`), más el cliente, que ahora degrada a
sondeo de 15 s y lo escribe en consola cuando el canal no entrega. El manejador de excepciones
sigue tragándose el error, a propósito, pero deja una fila en `alertas`.

La política se probó en tres casos: un miembro real ve 53 filas del tópico de su organización,
un `sub` que no es miembro ve 0, y un tópico que no es un uuid devuelve 0 sin lanzar 22P02 —el
`case` está ahí para eso, porque Postgres no garantiza el orden de evaluación de un `and` y el
cast reventaría la suscripción a cualquier otro canal—. Canario **C10** para que no vuelva.

**Y la pregunta del dev console, respondida:** el panel «API Setup» de la app no enseña el
+1 321-393-1397 porque está clavado a la WABA de PRUEBA de la app (`257026854152252`, que el
propio panel muestra). El número vive en `2459716937850832`, y la app lo alcanza por suscripción
y token de system user, no por ese selector. No hay nada que reconectar: el ciclo está probado
en los dos sentidos, con un saliente `enviado` y `wamid` de Meta.

### 2026-08-23 (tarde) — Auditoría de la base: qué protege RLS y qué no

Cerrado el número nuevo, se reviso a fondo lo que el agujero de la mañana dejo en duda.

**El ciclo de WhatsApp, completo.** Se retiro `+1 829-954-3803` desde el botón de Ajustes →
Canales —primera vez que se usa: conexión en `disconnected`, canal apagado con motivo, webhooks
dados de baja en Meta— y se probó el `+1 321-393-1397` de extremo a extremo: mensaje entrante en
la bandeja y respuesta recibida en el móvil. Hasta hoy solo estaba probada la entrada.

**Las claves legacy ya estaban apagadas.** `api-keys/legacy` responde `{"enabled":false}`, la app
usa `sb_publishable_*` y `sb_secret_*`, las funciones de borde leen `KAVEA_SUPABASE_SECRET` con
nombre propio, y CI ya tenía un guardián que tumba el build si aparece `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` o algo con forma de JWT en el árbol. La prueba de que
`KAVEA_SUPABASE_SECRET` no es un JWT viejo es que las funciones contestan: con legacy apagado, no
podrían.

**Lo que la auditoría encontró bien**, y conviene dejarlo escrito para no volver a mirarlo:
RLS activo **y forzado** en las 33 tablas de `public` · cero políticas sin acotar por
organización o usuario · las 7 vistas con `security_invoker = on` · los 3 buckets privados, con
políticas por pertenencia o por staff · `anon` sin `USAGE` sobre `private`, y PostgREST devuelve
`PGRST202` para cualquier función de ahí, incluso con el rol de servicio. Comprobado además por
HTTP con la clave publicable: `SELECT` sobre siete tablas sensibles devuelve `[]` y un `DELETE`
sin filtro no borra nada.

**Lo que encontró mal: TRUNCATE.** `anon` y `authenticated` tienen `arwdDxtm` —todo— sobre las 33
tablas. No es un descuido del repositorio: sale de un `ALTER DEFAULT PRIVILEGES` de la
plataforma, y es el modelo normal de Supabase, que confía en RLS para filtrar. Pero **RLS no se
aplica a TRUNCATE**: las políticas filtran filas y TRUNCATE no mira filas. De los ocho
privilegios, siete quedan contenidos y el octavo no lo contiene nada.

No es alcanzable hoy —PostgREST no tiene verbo TRUNCATE— y se dice para no exagerar. Lo que se
quita es la vía futura, que es concreta: una función SQL a la que se le olvide `security definer`
corre con los privilegios de quien llama. La 0085 lo revoca en las tablas que hay Y en el
`alter default privileges`, porque arreglar solo lo primero dura hasta el siguiente
`create table`. `service_role` lo conserva.

**Dos guardianes nuevos.** El canario **C9** vigila las dos mitades de lo anterior; se comprobó
que detecta cambiándole el privilegio por uno que sí está concedido. Y una guarda de CI que
falla si una migración de la 0080 en adelante escribe `revoke ... on function ... from anon` sin
`public`. Solo funciones, y no es un olvido: en una tabla el rol `public` no recibe nada por
defecto, así que ahí `from anon, authenticated` sí es completo — esa asimetría es justo lo que
hace tan fácil equivocarse. Las migraciones anteriores a la 0080 quedan indultadas porque este
repositorio no reescribe migraciones aplicadas: la 0077 y la 0084 corrigieron las suyas con
migraciones nuevas. Probada en los dos sentidos, sembrando una migración mala.

### 2026-08-23 — El número que no existía, y el hilo que salía por el número muerto

Objetivo: conectar el segundo número de WhatsApp. Acabó siendo una sesión de tres fallos, uno
de ellos un agujero de seguridad abierto desde el 4-ago.

**La conexión de la 0080 apuntaba a un fantasma.** La WABA `247528738447647` y el número
`266973946495042`, dados de alta el 21-ago por Coexistence, ya no existen: Graph devuelve
`code 100, subcode 33` para los dos. Existieron —`credencial_whatsapp` comprueba contra Meta
antes de guardar y guardó ese día—, y Meta los borró después. Lo que queda en el portafolio es
una WABA «Gabriel Montiel Toro» con CERO números: el alta creó la cuenta y nunca le colgó el
teléfono. El diagnóstico diario lo cazó a las 06:17 —V1 fallo, V5 no_verificable, V7
sin_probar— y lo cazó porque el 21 se partió en dos baterías; la versión anterior habría
reventado con un `TypeError`.

**Coexistence se abandona.** El número nuevo, **+1 321-393-1397**, se conecta directo a la
Cloud API bajo la WABA propia `2459716937850832`. Registrado (`POST /{phone}/register`, PIN
fijado), `CONNECTED`, `platform_type CLOUD_API`, `throughput STANDARD`. La contrapartida es la
que Coexistence evitaba: ese número ya no se puede usar desde la app del celular. Migración
0081, aplicada **después** de que Meta confirmara —que es lo que la 0080 no hizo.

**Un mensaje real entró y se fue al hilo equivocado.** El webhook llegó bien (firma verificada,
un intento) y el enrutado acertó la organización, pero el mensaje se pegó a la conversación que
ya existía con ese contacto desde el 4-ago, la del OTRO número.
`private.resolver_conversacion` buscaba por `(organization_id, canal, contact_id)` y devolvía la
abierta **sin mirar el `p_channel` que recibía**. Como `encolar_envio` saca la conexión de
`conversations.channel_id`, responder habría salido por el +1 829-954-3803, que está
`DISCONNECTED`. Y no se arreglaba retirando el viejo: tampoco mira si el canal está activo.
La 0082 hace que la identidad de un hilo sea `(organización, canal, contacto, canal concreto)`;
la tarjeta sigue siendo el punto de unión, así que los dos hilos de WhatsApp cuelgan de la
misma ficha. V7 pasó a verde con el mensaje ya en su sitio.

**El agujero.** Buscando lo anterior se vio que `credencial_whatsapp_de_conexion` respondía a
`anon`. Reproducido con la clave publicable —la que va dentro del bundle de JavaScript del
navegador—: devolvía el blob cifrado del token de WhatsApp, y `guardar_credencial_whatsapp`
aceptaba escrituras sin autenticar. Causa: la 0065 escribió `revoke ... from anon`, y eso **no
quita nada**, porque el permiso venía de `public`, de quien `anon` hereda. El par equivalente
de Página devolvía `42501`: esa asimetría fue la prueba de que era un descuido y no un diseño.
Cerrado en la 0084, verificado en las dos direcciones. No fuerza rotar el token —la clave de
cifrado vive en el entorno de las funciones de borde, nunca en la base— pero sube la prioridad
de la rotación pendiente. Diecinueve días abierto.

**Corregido además:**
- `fusionar_contactos` guardaba contra el índice que cambió la 0082, y citaba el índice viejo en
  su comentario: rechazaba fusiones legítimas. De paso, su guarda usaba `estado <> 'cerrada'`
  mientras el índice usa `cerrada_en is null`. Ahora usan el mismo predicado (0083).
- V3 del diagnóstico marcaba `fallo` sobre `UNKNOWN`, que es lo que Meta devuelve en TODO número
  recién registrado: rojo en el panel a los dos minutos de conectar un canal. Ahora es
  `sin_probar`.
- Un comentario de V6 afirmaba «medido el 21-ago con el número de Gabriel, que sí recibe». No se
  midió nada: por ese número no entró jamás un mensaje.
- Desconectar una conexión de WhatsApp pedía teclear su UUID —`page_name ?? ig_username ??
  meta_connection_id`, y las dos primeras son null por diseño—, y el título de la sección salía
  vacío por lo mismo. La única acción destructiva del panel era imposible de confirmar. Ahora el
  nombre sale de `canales[].nombre` y lo que se teclea es la palabra `DESCONECTAR`.

**Construido:** el compositor dice por qué número responde («Responder por WhatsApp · +1
321-393-1397»), como línea fija con un solo canal y en cada botón del selector con varios.
Canario **C8**: ninguna función SECURITY DEFINER de `public` ejecutable por `PUBLIC`, con cinco
excepciones documentadas. Su primera versión, escrita ese mismo día, filtraba por
`proacl is not null` y por eso se habría saltado el caso más probable: una función a la que
nadie tocó los permisos tiene `proacl` NULL, y eso no es «sin permisos», es «rigen los de por
defecto», que son PUBLIC. Corregido antes de darlo por bueno. Se comprobó que detecta por las
dos vías: quitándole la lista de excepciones (caza las cinco) y apuntándolo a `private`, donde
las 19 SECURITY DEFINER tienen `proacl` NULL (las caza). Se limita a `public` porque PostgREST
solo resuelve el esquema expuesto: una llamada a algo de `private` devuelve `PGRST202` incluso
con el rol de servicio, comprobado.

### 2026-08-21 — Comentarios entra en la Bandeja, y los canales se pueden apagar

- **Comentarios deja de ser un módulo** y pasa a pestaña de la Bandeja
  (`/bandeja?vista=comentarios`, detalle en `/bandeja/comentario/[id]` con forma de chat). Es el
  mismo trabajo —atender a alguien— aunque la respuesta sea pública y sin ventana de 24 h. La
  ruta vieja queda como redirect.
- **Sidebar por secciones** (Trabajo / Datos / Cuenta), colapsables y con la preferencia en el
  aparato, más una píldora de no leídos que se refresca cada 30 s.
- **`public.marcar_leido` existía desde la 0027 y nadie la llamaba**: `no_leidos` solo subía. Va
  en un efecto de cliente y no en el render del servidor porque Next.js prefetchea el enlace al
  pasar el cursor, y un prefetch no ejecuta efectos — marcarlo en el servidor habría vaciado el
  contador sin que nadie abriera nada.
- **Cabecera del hilo y ficha lateral, colapsables**, con el mismo patrón que el sidebar.
- **Pausar y desconectar canales** (0079). Son dos acciones distintas a propósito: pausar apaga
  un canal sin tocar token ni suscripción y se deshace en un clic; desconectar borra la
  credencial cifrada y el enrutado, y volver es dar de alta otra vez.
- **`diagnosticar` partido en dos baterías.** Página+Instagram y WABA+número no comparten un
  solo nodo del grafo: `/me` no significa nada para un número. Hasta ese día la función asumía
  siempre forma de Página y una conexión de WhatsApp reventaba en V4 con un `TypeError`.

### 2026-08-06 — El día del App Review: 7 fallos que salieron grabando

Objetivo: enviar la solicitud a Meta. Al grabar los vídeos, casi todo lo que había que
enseñarle al revisor estaba roto o no existía.

**Corregido el mismo día:**
- WhatsApp nunca se pudo enviar desde la interfaz: `encolar_envio` sacaba la partición de
  `page_id`, null por diseño en una conexión de WhatsApp. El único envío previo se había
  insertado a mano. Arreglado en la 0073 (el cálculo estaba triplicado en tres funciones).
- Human Agent en Instagram salía sin `messaging_type` — medido el 3-ago, nunca llevado al SQL.
- Responder un comentario llamaba a una firma de función que no existe, rota desde el 4-ago. El
  guardián de CI no la vio porque busca literales con punto y la 0067 usó guion bajo.
- Al enviar, el hilo no bajaba al fondo solo.
- El contador de comentarios sincronizados mentía (el upsert siempre "aplica").
- CI llevaba 4 ejecuciones en rojo sin que nadie lo notara — canario C3 tapando a C2. Arreglado
  en la 0068.
- El script de migraciones rompía los acentos bajo PowerShell 5.1 (Latin-1); usar `pwsh`.

**Construido:** enriquecimiento de perfil de IG (foto copiada, no enlazada) · canales con marca
y estado · los 3 callbacks de Meta · plantillas de utilidad de Messenger, leídas y creadas en
vivo · pantalla de comentarios · lectura de comentarios por API (el webhook no llega pese a
estar suscrito) · acceso de entrada en `kavea.ai`.

**Medido:** en dev mode Meta no entrega webhooks de IG/Messenger de quien no tiene rol en la app
· las llamadas de prueba del App Review caducan a 30 días, no solo tardan 24 h en aparecer
(válidas hasta el 5-sep) · el perfil de un PSID de Messenger no se puede leer sin acceso
avanzado · el portafolio real es 1 Página propia + 39 de clientes + 28 con rol de system user
· `/{page-id}/message_templates` necesita Page token derivado, el de system user directo falla
· una plantilla sin `example` nace RECHAZADA.

**Decidido:** `pages_utility_messaging` entra en v1. Se borraron 2 conversaciones de terceros
del espacio de Boosty antes de dar acceso al revisor (las sigue atendiendo Kommo, sin pérdida).

**Incidente propio:** `screencasts/` se coló en el repo por un `git add -A`; sacado y añadido al
`.gitignore`.

### 2026-08-04 — Tech Provider verificado, WhatsApp entra en la bandeja

- Boosty Digital LLC verificado como Tech Provider (enviado 3-ago 22:30, verificado 4-ago
  ~15:00 UTC). Retira la amenaza de restricción de 2 apps del portafolio que vencía el 3-oct.
- Los 3 callbacks de Meta no bloquean el App Review — queda como trabajo de fase 7.
- Data Use Checkup pendiente en 13/13 permisos, no documentado antes.
- WABA dominicana (+1 829-954-3803) operaba por Kommo con 25 plantillas aprobadas; suscrita
  también a Kavea (una WABA admite varias apps). Modelada como integración propia (migración
  0065), no como campo de la conexión de Página.
- Forma del payload de WhatsApp, distinta a Messenger/Instagram: el asset vive en
  `changes[].value.metadata.phone_number_id`, no en `entry[].id`; timestamp en segundos, no ms;
  nombre de contacto viene gratis; media llega como ID, no URL.
- Evidencia: 6 mensajes reales en bandeja, ciclo completo encolado→despachador→Meta→
  delivered→read→respuesta, 26 comprobaciones del adaptador en verde.
- Bug propio corregido: el despachador marcaba `fallido` un envío que Meta sí aceptó (WhatsApp
  devuelve el id en `messages[0].id`, no en `message_id`).
- Navegación: `layout.tsx` no tenía menú. Sidebar colapsable construida (216/60 px).

### 2026-08-03 — El trámite de Meta y la bandeja de correo

- El bloqueo real no era "no se puede enviar App Review": es "no se puede añadir un permiso sin
  ser Tech Provider".
- Access Verification: plazo duro 2-oct-2026 o Meta restringe 2 apps del portafolio.
- Requisito de llamadas por permiso ya cumplido en la mayoría; se completaron a mano
  `instagram_manage_comments`, `whatsapp_business_management` y Human Agent.
- Limpiada la vía descartada `instagram_business_*` (prohibida por política, 0 llamadas).
- Bandeja de correo (`/admin/correos`) en producción, sincronizando desde Resend (migración 0061).
- `schema_migrations` estaba 12 migraciones por detrás; conciliado a mano, migración por
  migración.
- CI en rojo por 4 fallos apilados: JS del sitio público, 2 canarios sin índice/política, y un FK
  simple que sí era un agujero real (`notificaciones_tarea_id_fkey`). Los 5 jobs, en verde.
- 2 columnas que mentían (`conversations.preview_texto` corregida en 0062; `no_leidos` queda
  marcada como sospechosa, sin tocar).

### 2026-08-02 — Sesión larga: fases 0 a 5b, DNS, CI, seguridad

- Canales conectados: Página Boosty.digital + Instagram vinculado, token cifrado
  AES-256-GCM. Primer mensaje real de IG recibido (403 bytes, firma verificada).
- Amortiguador (Netlify Blobs) probado con una caída de Postgres provocada a propósito: 2
  eventos reales rescatados por el drenaje.
- 3 crones activos: `drenar-blobs` (1 min), `segar-cola` (5 min), `detectar-silencio` (15 min).
- El middleware de Netlify no propaga cabeceras entre servidor y componente — se resolvió
  leyendo `Host` directo (`lib/dominio.ts`).
- Claves legacy de Supabase (JWT `anon`/`service_role`) deshabilitadas sin impacto: las sesiones
  de usuario ya usaban ES256.
- CI: 5 jobs en verde (tipos+build, sitio público, esquema+aislamiento, coherencia entre
  proveedores, fuga de secretos). 7 canarios que lanzan excepción en vez de solo imprimir.
- App desplegada en Netlify (`admin.kavea.ai`). Comodín `*.kavea.ai` bloqueado por Netlify (no
  es autoservicio, requiere ticket); alias por cliente funciona hoy.
- 4 decisiones de Gabriel: ingesta en Supabase Edge Functions, no Cloudflare Workers · 2 tokens
  de color por estado semántico · 4 estados de conversación · WhatsApp lo paga cada cliente con
  su propio método de pago.
- Plan de construcción en 8 documentos de fase (`docs/fases/`).
- 3 fallos de seguridad corregidos antes de construir encima: una política `for all` permitía
  autoescalar rol dentro del tenant; el break-glass evaluaba mal un `exists` correlacionado; las
  FK simples permitían coser una fila de un tenant con la de otro.
- DNS de `kavea.ai` delegado a Netlify, verificado por SOA (no por NS cacheado).
- Correo operativo `support@kavea.ai` (DKIM, MX, verificado con envío real).
- Monorepo unificado (`web/`, `docs/`, `brand/` bajo la misma raíz).
- Sitio público en Astro, cero JS en cliente, 3 páginas legales.
- App de Meta creada; verificación de negocio a nivel de portafolio ya pasada
  (`business_verification_passes: true`).
- Primera revisión visual con Playwright: 4 defectos que ni el código ni el compilador
  muestran (filtro invisible en modo oscuro, lista a media pantalla en móvil, hilo abriendo por
  el mensaje más viejo, burbujas descuadradas). Corregidos.
- Fase 3b (la tarjeta como unidad de trabajo, separada del canal) · 3c (embudos, con `estado` y
  `etapa` en ejes distintos para no repetir el problema de Kommo) · 3d (ficha con archivos e
  historial comercial colgando de la persona, no de la tarjeta) · fase 4 (compositor, cola de
  salida, despachador, con envío real confirmado de extremo a extremo) · operar la tarjeta
  (cerrar, asignar) · búsqueda (`tsvector` + trigramas, resultado por tarjeta) · equipo,
  plantillas y agenda · actividad global y contactos con detección de duplicados. Cada fase
  cerró con su propia pasada de la suite de aislamiento, acumulando hasta 61/61 en verde.

---

## 4. Lecciones (cada una, una sola vez)

- Grabar el producto es la prueba más honesta: no se puede grabar una intención.
- Una medición que no vuelve al código no sirve de nada.
- Un camino solo probado por fuera del producto (a mano, saltándose la función) no está probado.
- Un guardián de CI solo caza lo que su patrón cubre explícitamente.
- Un contador que miente es peor que no tener contador.
- Lo que decide un tercero (Meta) no se espeja en una copia local: queda desfasado.
- `git add -A` versiona lo que no se mira.
- Los límites de una plataforma se verifican, no se recuerdan de memoria.
- Las credenciales que pasaron por un chat se rotan al cerrar la sesión.
- Toda aserción negativa en pruebas necesita que el caso positivo se haya sembrado alguna vez,
  o solo mide el vacío.
- La interfaz se revisa mirándola; ni el código ni el compilador dicen si se lee bien.
- Los valores por defecto de Postgres (p. ej. `security_invoker` en vistas) se comprueban, no
  se asumen por un comentario.
- Compilar, mirar el build, y solo entonces publicar.
- El SQL se ejecuta antes de darlo por escrito.
- Una variable de entorno nueva se compara contra las que ya existen antes de nombrarla.
- Una semilla de datos en una migración solo cubre lo que ya existe; necesita su trigger de
  creación o es una bomba con fecha en el primer registro nuevo.
- Un componente definido dentro del render se remonta en cada pasada — puede borrar lo que el
  usuario está escribiendo.
- `revoke ... from anon` no quita nada: el permiso viene de `public`, y `anon` hereda de ahí.
- Un `proacl` NULL no es «sin permisos», es «los de por defecto» — y el de por defecto en una
  función es EXECUTE para PUBLIC. Auditar permisos filtrando por `proacl is not null` deja fuera
  justo lo que nadie ha revisado nunca.
- RLS no se aplica a TRUNCATE. «La tabla tiene RLS» no quiere decir que todos los privilegios
  concedidos sobre ella estén contenidos.
- Un privilegio por defecto se arregla en dos sitios: los objetos que ya existen y el
  `alter default privileges` que gobierna los que vengan. Solo lo primero dura hasta el
  siguiente `create`.
- Un mecanismo de respaldo que funciona esconde que el principal nunca arrancó. Si hay un
  camino de reserva, algo tiene que decir en voz alta cuando se está usando.
- Lo que devuelve `subscribe()` se mira. Una suscripción denegada y una sana se parecen mucho
  desde fuera: en las dos no pasa nada.
- Una captura sirve para juzgar el espacio, no las letras: para texto se lee el DOM. Un
  antialiasing convirtió «Bandeja» en una errata que no existía.
- `1fr` en grid es `minmax(auto, 1fr)`, y ese `auto` no baja del min-content: la pista se
  planta en lo que mida su hijo más ancho y recorta, sin barra de desplazamiento que lo
  delate. Cuando debe poder encoger, `minmax(0, 1fr)`.
- Un dato nuevo dentro de un componente viejo trae consigo lo que el componente nunca tuvo que
  soportar: una clave que ya no es única, una etiqueta con guiones, un ancho que no cabía.
- Un trámite enviado necesita quién mire la respuesta. Lo que decide un tercero no llega solo:
  el App Review estuvo dieciséis días contestado sin que nadie lo supiera.
- Un documento con fecha de corte se vuelve mentira sin que nadie lo edite. Si dice «al día de»,
  hay que releerlo antes de decidir con él.
- Un bloqueo anotado en un documento de fase no se levanta solo el día que desaparece: `docs/fases/05`
  seguía dando Embedded Signup por bloqueado por Tech Provider tres semanas después de tenerlo.
- Dos problemas que parecen de áreas distintas —vender a público y pasar una revisión— pueden
  tener una sola solución. Conviene buscarla antes de resolverlos por separado.
- Una pantalla puede quedar «terminada» y no funcionar por un límite de la plataforma que no
  está en ningún fichero. La configuración del proyecto se lee antes de dar por hecho un alta.
- Cuando la interfaz valida más que el servidor, lo que manda es el servidor. Una regla que solo
  vive en el navegador no es una regla.
- Que una API acepte un cambio de infraestructura no significa que el cambio ya esté en pie.
  Entre el 201 y el servicio funcionando hay un tiempo que hay que medir, no suponer.
- Abrir una puerta nueva destapa lo que ya estaba roto detrás: el espacio de demostración
  llevaba diecisiete días sin subdominio y su alta había dicho «hecho».
- Un valor por defecto en un formulario ajeno puede ser el más peligroso de la lista: el de
  «asset task permissions» era MANAGE, o sea las finanzas de la cuenta publicitaria del cliente.
- Lo que se pide en el consentimiento se pide una vez: añadir un permiso después obliga a que
  todos los clientes vuelvan a pasar por el diálogo. Conviene decidirlo mirando doce meses, no uno.
- Una lista de pendientes también miente en la otra dirección: el callback de desautorización
  llevaba semanas anotado como pendiente y ya estaba hecho. Se repasa mirando, no recordando.
- Un objeto de un tercero que se verificó una vez puede dejar de existir; lo que se guarda de
  fuera se vuelve a comprobar, no se da por vivo.
- «Desconocido» no es «malo»: un indicador que confunde ausencia de dato con dato negativo pinta
  de rojo lo que está sano, y enseña a ignorar el panel.
- Cambiar un índice obliga a buscar quién guardaba contra él: la guarda que se queda atrás es
  más estricta o más laxa que la restricción que dice proteger.
- Una fricción de confirmación tiene que costar una decisión, no una transcripción. Si hay que
  copiar un identificador, la acción no existe.
- Una pantalla en blanco no dice nada por sí sola: puede ser «no tienes esto» o puede ser un
  error del servidor. La consola distingue las dos, y solo una de ellas se arregla reintentando.
- Cuando la interfaz de un tercero no carga, la API del mismo tercero sigue contestando. Preguntar
  por API respondió en un minuto lo que la pantalla llevaba días sin enseñar.
- Un campo relleno en un formulario no es un campo guardado. Si queda una barra de «guardar
  cambios» en pie, lo que se ve es un borrador; y si la API no expone ese campo, no hay segunda
  fuente que lo desmienta.
- Una arista de API que devuelve `[]` y otra que devuelve error no dicen lo mismo: la primera es
  «no tienes», la segunda «no puedes». Antes de dar una capacidad por cerrada, mirar cuál de las dos.
- El inventario de lo que uno ya tiene se consulta, no se recuerda: había una WABA de un cliente
  ajeno en el portafolio, compartida y verificada, que ningún documento del proyecto mencionaba.
- Un resumen ajeno que es casi correcto es más peligroso que uno equivocado: se firma con un «sí»
  y el trabajo se hace contra el encuadre que no era.
- Un parámetro que se recibe y no se usa al buscar —solo al insertar— es una clave incompleta
  esperando a que aparezca el segundo caso.
