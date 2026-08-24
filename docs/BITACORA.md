# Kavea — Bitácora

Registro comprimido de lo ejecutado y lo pendiente. Una entrada por hito real, sin narrativa:
si algo no cambia una fila de la tabla de estado o una línea de pendientes, no entra aquí. El
detalle largo de cómo se investigó cada cosa, si hace falta reconstruirlo, está en el historial
de git de este mismo archivo.

**Regla:** solo entra lo comprobado, con la evidencia al lado. Lo planificado vive en
`docs/fases/`, lo pendiente en la sección 2.

---

## 1. Estado actual — al 24-ago-2026

| Pieza | Estado | Evidencia |
|---|---|---|
| Sitio público `kavea.ai` | ✅ Producción, con `/demo` | Formulario probado de extremo a extremo |
| Páginas legales | ✅ Publicadas | Rastreables por Meta |
| App de Meta | ✅ Creada, dev mode | `compliant`, cero violaciones |
| DNS en Netlify | ✅ Delegada | SOA `dns1.p01.nsone.net` en 7 resolvedores |
| Esquema de base de datos | ✅ **88** migraciones aplicadas y registradas | Contado en `public.schema_migrations` el 24-ago |
| Bandeja de correo interna | ✅ `/admin/correos` | RPC y bucket verificados |
| Aislamiento entre tenants | ✅ 61/61 comprobaciones · 10/10 canarios | C8, C9 y C10 añadidos el 23-ago |
| Ingesta y normalización | ✅ Producción | **9** crones vivos (contados en `cron.job` el 24-ago), mensajes reales entrando |
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
| Callback de borrado de datos | ✅ Guardado | Recarga del panel a las 20:59 del 23-ago: el campo persiste. No hay forma de verificarlo por API (`data_deletion_url` no es campo de Graph), a diferencia de `deauth_callback_url`, que sí |
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
| Página de Boosty (`1790677317841377`) | ✅ **Reconectada por OAuth el 24-ago** | `config_id 1721663745727123`, `tasks` con `MESSAGING`, PAT rotado y **primer BISU de la base**. V1–V7 en verde salvo V6 |
| Facebook Login for Business | ✅ **Estrenado el 24-ago** | Un canje real completo de extremo a extremo: diálogo, código, BISU cifrado, webhooks suscritos y rediagnóstico. Falta hacerlo desde un portafolio que no sea el de Boosty |
| Permisos de la app, por API | ✅ 5 `live` | `business_management`, `pages_show_list`, `public_profile`, `whatsapp_business_management`, `whatsapp_business_messaging` |
| Embedded Signup de WhatsApp | 🟡 Desbloqueado, sin construir | Tech Provider (4-ago), permisos de WhatsApp (7-ago) y negocio `verified`. El token tiene `manage_app_solution`; `/{app}/whatsapp_business_solutions` existe y devuelve `[]` |
| Agentes (fase 6) | ⏸ Aparcada | Sin `ANTHROPIC_API_KEY` |
| CI de GitHub Actions | 🟡 Restaurada abriendo el repositorio | Se agotaron los 3.000 minutos del plan; Gabriel puso `Boosty-Hub/kavea` en **público** el 24-ago para recuperar minutos gratis |
| Repositorio | 🟡 `Boosty-Hub/kavea`, **público desde el 24-ago** | Se abrió para recuperar minutos de Actions; el plan es volver a cerrarlo. Historial auditado: cero credenciales en los 150 commits. Sí quedan expuestos nombres de clientes reales y 27 identificadores de activos de Meta, y Gabriel decidió dejarlos |
| Comodín `*.kavea.ai` | 🟡 **Todo hecho por nuestra parte, esperando a Netlify** | `CNAME *.kavea.ai → kavea-app.netlify.app` creado el 24-ago y resuelve; los otros cinco requisitos ya se cumplían; respondido el ticket #1097522 el 24-ago. Falta que lo habiliten del lado del sitio: hoy un host desconocido recibe el 404 de Netlify, no llega a Kavea |

Fases 0–4 operativas. Fase 5: **bloque B cerrado** el 24-ago (T3 `state` firmado, T5 `/start`, T6 `/callback` + `meta-canje`, T7 cifrado con `kid`). Sigue abierto el bloque de WhatsApp, que depende de Embedded Signup.

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
- **El comodín `*.kavea.ai`: hecho todo lo nuestro, pendiente de Netlify.** De los seis
  requisitos del ticket #1097522, cinco se cumplían; el sexto —`CNAME *.kavea.ai →
  kavea-app.netlify.app`, ttl 3600— se creó el 24-ago y resuelve, y el ticket quedó contestado
  ese mismo día. Falta que lo habiliten del lado del sitio: hasta entonces un subdominio no
  listado resuelve pero recibe el 404 propio de Netlify, porque el sitio no reclama ese host.
  Cuando esté, `/crear` deja de depender de una llamada a la API de Netlify por cada alta y
  desaparece el tope de alias por sitio.
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

### Trabajo sin bloqueo — fase 5 (autoservicio)
**Cerrado el 24-ago:** `/api/meta/oauth/start` y `/callback`, el `state` firmado, `meta-canje` con
los siete pasos, y el cifrado del BISU con `kid` (0088).

**Sigue abierto:** la segunda config de Facebook Login for Business, la de WhatsApp —depende de
Embedded Signup— · **cron diario de `debug_token`** por conexión, que es lo que detecta un token
muerto antes que el cliente · enlace de conexión firmado, un solo uso, 72 h, sin sesión de Kavea ·
máquina de estados por (organización, canal) · Conversation Routing (`primary_receiver`,
`thread_owner`, los seis endpoints) · árbol de diagnóstico diferencial · pantalla de expectativas
de WhatsApp · **selección de Página cuando el cliente autoriza más de una**: hoy `meta-canje`
rechaza el alta con un mensaje que lo explica, en vez de elegir por él.

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

### Pendiente que nació hoy
- **Falta probar un ENVÍO real con el token del diálogo.** El canje del 24-ago dejó `MESSAGING`
  entre las `tasks` y V4 dice que el token sirve, pero eso verifica que es válido, no que entregue.
  Hasta que salga un mensaje por Messenger y otro por Instagram con él, A2 está a medias.
- **Nadie ajeno a Boosty ha completado el diálogo.** El canje real se hizo desde el propio
  portafolio, con una cuenta que tiene rol en la app y en modo desarrollo. Es lo que exigen C1, C2,
  C4, C5, C7 y C8 de `docs/fases/05` §10, y no se puede simular desde dentro.
- **Volver el repositorio a privado** cuando la facturación de Actions esté resuelta.

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

### 2026-08-24 — El autoservicio conecta un canal por primera vez

**El flujo de OAuth completo, en producción.** Bloque B de la fase 5 (`b9a94c5`): `state` firmado
con HMAC + nonce en cookie de `.kavea.ai`, `/api/meta/oauth/start`, callback en
`conectar.kavea.ai` y la función de borde `meta-canje` con los siete pasos de T6. El App Secret no
sale del borde. Dos desvíos deliberados del documento de fase: la organización sale del Host bajo
RLS y no de un parámetro, y `puede(org,'conectar')` es **solo owner** —la 0040 manda sobre el
documento—.

**Producción:** `META_APP_ID`, `KAVEA_ESTADO_SECRETO` y `GRAPH_API_VERSION` en Netlify;
`META_APP_SECRET` NO está ahí, comprobado. `meta-canje` desplegada, y
`reconciliar-suscripciones` redesplegada porque su lista de campos pasó a `_compartido/campos.ts`
—dos copias que se separan hacen que el reconciliador corrija cada quince minutos algo que no
está roto—.

**Verificado en `boosty.kavea.ai`:** 302 con `config_id 1721663745727123`,
`redirect_uri` a `conectar.kavea.ai`, `state` de 262 caracteres, cookie `httpOnly`/`secure`/`Lax`
en `.kavea.ai` **y vista desde `conectar`** —lo único que en local no se podía probar—. El
callback rechaza `state` ausente, basura y manipulado.

**Dos fallos propios antes de estrenarlo:** el `kid` por defecto era `v1` y el secreto real es
`KAVEA_CRED_KEY_k1` (habría fallado al cifrar, con el código de OAuth ya gastado); y `.boton` no
existía en el CSS aunque `/registro`, `/crear` y canales la invocaban — las tres pintaban el botón
nativo del navegador. El segundo se vio en la captura, no compilando.

**El primer canje real falló, y el fallo era del 6-ago.** Meta autorizó y el flujo llegó al paso 6:

    registrar_conexion_oauth 400 {"code":"23514", ...
      Failing row contains (17841421294200897, instagram, ...)
      new row for relation "meta_asset_routes" violates check constraint

`meta_asset_routes.tipo` admite `page`, `ig_business_account` y `whatsapp_phone_number` desde la
0003. Las funciones de alta escriben `instagram`. **La línea es de la 0058**, la ruta del staff, y
la heredé al copiarme de ella: dar de alta a mano cualquier Página con Instagram llevaba dieciocho
días abortando sin que nadie la pisara. `on conflict do nothing` no cubría nada — resuelve
unicidad, no CHECK. La transacción revirtió entera y el token de producción no se tocó. Arreglado
en la **0089**, las dos funciones.

**Y al segundo intento, conectó.** Primer canje real del proyecto:

| | |
|---|---|
| `config_id` | `1721663745727123` |
| `tasks` | `CREATE_CONTENT, MODERATE, MESSAGING, ADVERTISE, ANALYZE, MANAGE` |
| BISU | **el primero que existe en esta base**, `kid k1` |
| PAT | rotado; el del 2-ago sustituido |
| Suscripción | los 9 campos, `subscription_ok: true` |
| Diagnóstico | V1–V7 en verde salvo V6, que nunca fue verificable |

`MESSAGING` estaba entre las tareas, así que el riesgo de que el token del diálogo concediera
menos que el de system user no se materializó.

**Un fallo de pantalla que el propio alta destapó:** al refrescar, canales seguía diciendo «esta
conexión se creó sin pasar por el diálogo». Era el diagnóstico cacheado del día anterior — V2 se
calcula sobre `tasks`, que hasta ese canje no existía. `meta-canje` gana un **paso 8** que
rediagnostica al terminar, no abortante.

**El repositorio es público.** Se agotaron los 3.000 minutos de Actions. Historial auditado antes
de nada: los patrones de credencial sobre los blobs de los **150 commits** dan cero, y los
**valores literales** de los seis secretos en uso no aparecen en ningún commit — esta última es la
prueba que cierra la pregunta, porque no depende de acertar el patrón. Ninguna clave privada. **No
hay rotación forzada.** Sí quedan expuestos nombres de clientes reales y 27 identificadores de
activos de Meta en `docs/04`, `docs/fases/05` y esta bitácora; Gabriel decidió dejarlos y volver el
repositorio a privado después.

**El comodín `*.kavea.ai` se puede activar.** El `422 invalid site` del 2-ago nunca significó «no
se permite», sino «por ese endpoint no». Netlify (#1097522) dio seis requisitos; cinco ya se
cumplían —plan Pro, DNS en Netlify con certificado `*.kavea.ai` ya `issued`, sin subdominios de
rama ni automáticos, y el dominio primario `admin.kavea.ai` **al mismo nivel** que el comodín, que
se había dado por incumplido de un vistazo—. El sexto se hizo: `CNAME *.kavea.ai →
kavea-app.netlify.app`, ttl 3600. Resuelve, y los registros explícitos siguen intactos. Ticket
contestado; falta que lo habiliten del lado del sitio.

**CI cayó por facturación, no por código.** «recent account payments have failed or your spending
limit needs to be increased»: cinco trabajos, cero pasos, 2 s. Lo delataba que también fallaba
*Sitio público* y que ya fallaba en dos commits que solo tocaban documentación. Cuatro commits
entraron sin verificar; se ejecutaron a mano `tsc`, `next build`, `deno check`, el canario C8 y la
guarda de secretos. Restaurada al abrir el repositorio.

**Repaso completo de la bitácora contra la realidad**, trece correcciones: 86 migraciones cuando
eran 88, ocho crones cuando eran nueve, y dos filas «Repositorio» contradiciéndose. Y
`aplicar-migraciones.ps1` decía que el CLI de Supabase no está instalado; está, 2.84.2.

**`docs/PLAN.md`**: lo pendiente en cinco fases con criterio de hecho por tarea, separando lo
nuestro de lo que espera a terceros.

### 2026-08-23 — Del token de system user al diálogo de Meta

**La decisión que ordena el resto.** Kavea no puede ser un producto por suscripción con token de
system user: ese token solo alcanza activos del portafolio de Boosty, y la Página de quien se
registra un martes por la noche no está ahí. La vía es **Facebook Login for Business**, y para
WhatsApp su Embedded Signup. Y montarlo **es a la vez el arreglo del App Review**: los ocho
permisos se rechazaron porque los vídeos no enseñaban «the complete Meta login flow» ni «a user
granting app access», y con el diálogo esas pantallas existen. Los cinco permisos aprobados el
7-ago son exactamente los que necesita Embedded Signup de WhatsApp, y `docs/fases/05` lo daba por
bloqueado «hasta que Meta apruebe Tech Provider» — que pasó el 4-ago.

Sin confirmar: si el revisor de Meta, sin rol en la app, puede completar un diálogo que pide
permisos aún no aprobados. Para GRABAR basta una cuenta con rol; para que él lo pruebe, no se sabe.

**El App Review llevaba dieciséis días contestado.** Fechado el 7-ago 08:18 GMT-4, mientras
`docs/07` decía «nunca se ha enviado nada». Cinco aprobados (`whatsapp_business_messaging`,
`whatsapp_business_management`, `pages_show_list`, `business_management`, `public_profile`) y ocho
rechazados, todos por «Screencast Not Aligned». Verificado luego por API: `GET
/{app-id}/permissions` devuelve exactamente esos cinco como `live`.

**Primera configuración de Facebook Login for Business:** `kavea-mensajeria`, `config_id`
**1721663745727123**. Login `General`, token de **system-user**, caducidad **Never**. Lo de
`Never` va contra la recomendación de 60 días de Meta y es a conciencia: no hay endpoint de
refresco del BISU, así que renovar significa que el cliente vuelva a pasar por el diálogo, y el
día que no lo haga su canal deja de entregar en silencio. La seguridad que Meta compraba con la
caducidad ya está construida: AES-256-GCM con la clave fuera de la base, `kid`, esquema `private`
sin exponer, y el cron de `debug_token` — **que falta ampliar a los BISU de clientes**.

Una sola configuración para Messenger e Instagram, no dos: hoy sus ocho permisos están rechazados
y se reenvían juntos, así que separarlas no protege de nada y duplica el diálogo. `Pages`
obligatorio; `Instagram accounts`, `Ad accounts`, `Catalogs` y `Pixels` opcionales y **sin pedir
sus permisos** — incluirlos ya porque añadir un permiso después obliga a que todos los clientes
vuelvan a consentir; no pedir sus scopes porque un permiso sin función que enseñar es el rechazo
número nueve. En `Ad accounts` se eligió **ANALYZE**; el valor por defecto era MANAGE, que incluye
las finanzas de la cuenta publicitaria del cliente.

Dos preguntas cerradas por medición: **`pages_read_user_content` no hace falta** (el selector no lo
ofrece y Meta no lo autoañade), y **WhatsApp no se conecta por Facebook Login for Business** — el
paso de activos no ofrece ninguna WABA, y la única plantilla de Embedded Signup entrega un token de
**60 días**, justo lo que no queremos.

**El panel de Login, campo a campo.** `https://conectar.kavea.ai/api/meta/oauth/callback` con
**Strict Mode en Yes** — que es lo que obliga a un host fijo y a meter el `organization_id` en el
`state`. El callback de desautorización **ya estaba pegado** desde antes (pendiente anotado que no
lo era); el de borrado de datos se pegó ese mismo día y se confirmó al recargar. `Login with the
JavaScript SDK` en No, a tener presente si Embedded Signup acaba necesitándolo.

**Partner Solutions descartado**: sirve para que **dos** socios gestionen conjuntamente los activos
de un cliente, y Kavea no tiene segundo socio. **Tech Provider onboarding sale en blanco porque
revienta**: el pagelet (`view: wa-dev-quickstart`, `use_case_enum: WHATSAPP_BUSINESS_MESSAGING`)
devuelve **error 1007** del servidor de Meta. No es una sección vacía —eso sería una respuesta—,
así que reintentar tiene sentido. El resto de esa consola es el CSP de Facebook bloqueando sus
propios píxeles.

**Ya había un cliente ajeno dentro y nadie lo sabía.**
`GET /2167414613399354/client_whatsapp_business_accounts` devuelve la WABA `755757354157392`,
«Platinium Insurance group corp», `ownership_type: CLIENT_OWNED`, negocio propio
`24123447600679995`, `verified` y `APPROVED`. La relación proveedor↔cliente que Embedded Signup
construye ya existe, montada por otra vía. Y `GET /755757354157392/subscribed_apps` devuelve `[]`:
nadie recibe sus webhooks. Alrededor: Boosty Digital LLC está `verified`, el token de system user
lleva **`manage_app_solution`** y no caduca, y `/{app-id}/whatsapp_business_solutions` **existe** y
devuelve `[]` — que es la diferencia entre «no puedes» y «no tienes».

**El registro self-service, abierto.** Migración 0087: `registrarse` exige sesión y **correo
confirmado** y deja al usuario propietario en la misma transacción, sin tocar `crear_espacio` —una
función con dos amos acaba autorizando al que no debe—; con ella `subdominio_libre`, que devuelve
un booleano y nada más porque un `select` sobre `organizations` enumeraría la cartera de Kavea. Un
tope de una organización por persona, que es anti-abuso y no regla de producto. Dos pantallas en
`cuenta.kavea.ai`.

Lo que lo tenía cerrado no era código: `smtp_host: None` y **dos correos por hora** en todo el
proyecto, `site_url` en `localhost:3000`, `uri_allow_list` vacía y `password_min_length: 6`
mientras la pantalla pedía 8 — el servidor más flojo que la interfaz. Todo corregido: Supabase Auth
por `smtp.resend.com:465` desde `support@kavea.ai`, límite a 100/hora, y **probado con un alta real
entregada**. `kavea.ai` ya figuraba `verified` en Resend desde antes: otra afirmación caducada.

**El subdominio del inquilino, y lo que no se puede prometer.** La zona lleva un registro por host,
así que se construyó la función de borde `subdominio`, que lee el slug **de la base** y no del
parámetro (si viniera de fuera se podría pedir un alias para `admin`). Con ella se descubrió que
**`demostracion.kavea.ai` nunca tuvo alias**: diecisiete días inalcanzable, y su alta había dicho
«hecho». Y que Netlify acepte el alias no significa que resuelva: `cuenta` y `conectar` fueron
instantáneos, `demostracion` seguía sin existir para el autoritativo quince minutos después. Por
eso `/crear` dejó de redirigir.

**Auditoría de la base.** RLS activo y forzado en las 33 tablas. Dos agujeros reales cerrados: el
blob cifrado del token de WhatsApp era legible por `anon` porque siete migraciones revocaban de
`anon` en vez de de `public` (0084), y `anon` conservaba TRUNCATE, que RLS no gobierna (0085).
Canarios C8, C9 y C10 añadidos; **la primera versión de C8 era mía y estaba mal** —filtraba
`proacl is not null`, que excluye justo lo que nadie ha tocado—.

**El tiempo real de la bandeja nunca había funcionado**: canal privado sin política en
`realtime.messages` y emisión por el tópico público. Lo tapaba el sondeo de 60 s. Arreglado en la
0086; medido, el refresco baja de 15 s a menos de 5.

**El número que no existía.** El WhatsApp «huérfano» estaba en una WABA de Coexistence borrada.
Se repuntó la conexión a la WABA `2459716937850832` / número `+1 321-393-1397` (0081), registrado
en Cloud API y probado en los dos sentidos con `wamid` de Meta. Y con dos números apareció el
fallo de identidad: el índice de conversación abierta no incluía `channel_id`, así que las
respuestas salían por el número equivocado. 0082 lo arregla y remueve los mensajes mal enrutados;
0083 alinea la guarda de `fusionar_contactos`, que seguía comparando contra el índice viejo.

**Cuatro defectos que solo se vieron en captura** —clave de React duplicada, píldora partida,
columna que no encogía, confirmación que pedía transcribir un UUID—, de ahí la instrucción
permanente de revisar con Playwright.

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
- Comprobar la PRESENCIA de una clave de error en vez de su contenido convierte un éxito en un
  fallo inventado: `"errors": []` viene siempre. Dos veces en dos días con la misma forma —una
  cadena vacía, una lista vacía—, así que la regla es mirar el valor, nunca la clave.
- El error de una API no es la política del proveedor. `422 invalid site` se leyó durante tres
  semanas como «Netlify no permite comodines»; lo que significaba era «por este endpoint no».
  Preguntar cuesta un ticket y ahorra un rodeo arquitectónico entero.
- Una lista de requisitos ajena se comprueba campo a campo contra la API, no se marca de un
  vistazo: de los seis, el que parecía el bloqueo de fondo ya estaba cumplido.
- Una guarda de fuga de secretos que mira el árbol de trabajo no dice nada sobre el historial. Son
  dos preguntas distintas, y la segunda solo se vuelve urgente el día que el repositorio se abre.
- La forma fiable de auditar secretos no es buscar patrones, es buscar los VALORES que están en
  uso: no depende de acertar la expresión regular.
- Una búsqueda con una variable vacía no encuentra nada, encuentra todo. `grep -F ""` casa con
  cualquier línea, y el informe sale diciendo «expuesto». Guarda de cadena vacía antes de creerse
  un hallazgo de seguridad.
- Abrir un repositorio no solo publica código: publica la cartera de clientes que uno fue
  documentando. Y eso no se deshace volviéndolo a cerrar.
- Un despliegue en rojo puede ser un «no había nada que hacer»: Netlify marca `error` cuando
  cancela por contenido idéntico. Se lee el mensaje antes de buscar la avería.
- Un comentario que justifica una decisión con un hecho del entorno («el CLI no está instalado»)
  caduca sin que nadie lo toque, y para entonces está defendiendo un rodeo que ya no hace falta.
- Una pantalla que presenta el último diagnóstico guardado miente en cuanto algo cambia debajo:
  la conexión del 24-ago se leyó como fallida porque el veredicto era del día anterior. Lo que
  invalida un diagnóstico tiene que rehacerlo, o decir que está viejo.
- Copiar una función que funciona no garantiza copiar código que funciona: puede que la parte
  copiada nunca se haya ejecutado. La 0058 llevaba dieciocho días con una inserción imposible
  porque esa rama no se había pisado.
- Cuando una tabla y un enum nombran la misma cosa distinto —`instagram` el canal,
  `ig_business_account` el activo—, el error no se ve leyendo: las dos inserciones están a seis
  líneas y cada una necesita una palabra diferente.
- `on conflict do nothing` solo cubre unicidad. Delante de una restricción CHECK no tolera nada, y
  leerlo por encima da una sensación de robustez que no existe.
- Una función que hace varias escrituras es una transacción, y eso es lo que convierte un fallo en
  el paso 6 en «no pasó nada» en vez de en «media conexión». Se nota el día que falla.
- Un valor por defecto inventado para un identificador de clave no falla al desplegar ni al
  arrancar: falla al cifrar, en el primer alta real, con el código de OAuth ya gastado. Los
  nombres de los secretos se leen del proyecto, no se deducen del patrón que uno usaría.
- Cuando fallan TODOS los trabajos de CI, incluido el que no toca nada de lo cambiado, el
  sospechoso no es el código. Y si ya fallaba en un commit que solo movía documentación, está
  demostrado.
- Una clase de CSS que tres pantallas invocan y nadie definió no da error en ninguna parte: da un
  botón nativo del navegador. Se ve mirando, no compilando.
- Antes de escribir por segunda vez una lista que ya existe en otro fichero, moverla. Dos copias
  que se separan no rompen nada de golpe: hacen que un reconciliador corrija cada quince minutos
  algo que no está roto.
- Decir «voy a comprobar CI» y no comprobarlo deja pasar cuatro commits sin red. Un compromiso de
  mirar un resultado ajeno vale lo mismo que el trámite en sí: nada, hasta que alguien mira.
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
