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
| Esquema de base de datos | ✅ **98** migraciones aplicadas y registradas | Contado en `public.schema_migrations` el 24-ago |
| Bandeja de correo interna | ✅ `/admin/correos` | RPC y bucket verificados |
| Aislamiento entre tenants | ✅ 61/61 comprobaciones · 10/10 canarios | C8, C9 y C10 añadidos el 23-ago |
| Ingesta y normalización | ✅ Producción | **10** crones vivos (contados en `cron.job` el 24-ago), mensajes reales entrando |
| Bandeja, tarjetas, embudos, ficha, agenda, reparto | ✅ Producción | Un contacto con varios canales en una tarjeta |
| Envío por Instagram | ✅ Texto, imagen, GIF, corazón | Echo en ≤6 s, contacto confirmando |
| Envío por Messenger | ✅ Probado el 6-ago | `messaging_type: RESPONSE`, id de Meta, sin error |
| WhatsApp — `+1 321-393-1397` | ✅ Cloud API directo, el 23-ago | Ciclo completo: entrante en la bandeja y saliente `enviado` con `wamid` de Meta |
| WhatsApp — `+1 829-954-3803` | ✅ Retirado el 23-ago | Conexión `disconnected`, canal apagado, webhooks dados de baja en Meta |
| Un hilo por número | ✅ Desde la 0082 | La tarjeta une los canales; el hilo ya no |
| Pausar y desconectar un canal | ✅ Desde Ajustes → Canales | 0079; el borde da de baja los webhooks en Meta |
| Plantillas de utilidad de Messenger | ✅ Leer y crear en vivo contra Meta | No se espejan en Postgres |
| Comentarios | ✅ **Ciclo de moderación completo** | Publicar, editar, ocultar y borrar desde el hilo (0097/0098). Probado contra Instagram real el 24-ago: los dos ids consultados después en Graph dan «does not exist». El webhook de `comments` sigue sin llegar, pero **no por falta de suscripción** —está puesta, comprobado el 24-ago— sino por modo desarrollo y el permiso rechazado; la lectura por API lo suple |
| Callback de desautorización | ✅ Desplegado **y pegado** en el panel | Confirmado el 23-ago en Facebook Login for Business → Settings |
| Callback de borrado de datos | ✅ Guardado | Recarga del panel a las 20:59 del 23-ago: el campo persiste. No hay forma de verificarlo por API (`data_deletion_url` no es campo de Graph), a diferencia de `deauth_callback_url`, que sí |
| Contenido de Página e Instagram | ✅ `/contenido`, desde el 24-ago | Lista → detalle con la identidad delante. Verificado contra producción: `@boosty.digital` 1625 seguidores / 327 publicaciones con 12 medios, y `Boosty.digital` 172 seguidores con 10 posts y 10 fotos |
| Token de una conexión | ✅ Se resuelve por su dueño | La credencial cifrada de la conexión primero, y solo si Meta la rechaza por permiso se deriva del portafolio, avisando. El ciclo de moderación salió `via: conexion`, así que un cliente de autoservicio también podrá moderar |
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
| App Review | ⛔ **Enviado y contestado el 7-ago: 5 aprobados, 8 rechazados** | Los 8, por «Screencast Not Aligned». Ver `docs/07` §1. **B1 cerrada el 24-ago**: las tres pantallas que los vídeos tenían que enseñar ya existen y se recorren con datos reales |
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
| Comodín `*.kavea.ai` | 🟡 **Netlify puso condición: borrar los cuatro alias** | Ticket #1097522. Piden dejar solo el primario `admin.kavea.ai` y borrar `boosty`, `cuenta`, `conectar` y `demostracion`; luego habilitan el comodín y esos nombres vuelven solos. Comprobado que durante el hueco un host no reclamado da TLS válido y el 404 de Netlify —ni error de certificado ni pérdida de datos: los webhooks van a Supabase—. Preguntado si el comodín se lleva `www.kavea.ai`, que es del OTRO sitio (`kaveaai`) y hoy hace 301 al ápice. Correo enviado el 24-ago, esperando respuesta |

Fases 0–4 operativas. Fase 5: **bloque B cerrado** el 24-ago (T3 `state` firmado, T5 `/start`, T6 `/callback` + `meta-canje`, T7 cifrado con `kid`). Sigue abierto el bloque de WhatsApp, que depende de Embedded Signup.

---

## 2. Pendiente, por bloqueo

### Con fecha encima
- **Rehacer el App Review de los 8 permisos rechazados.** Antes de grabar nada, declarar en el
  envío que Kavea es server-to-server con token de system user: es el quinto punto de la propia
  lista de Meta y explica por qué los vídeos no pueden enseñar el login de Meta ni la pantalla de
  consentimiento —los dos primeros requisitos que se incumplieron en los ocho—. Con el botón
  **Request again**; no hay que rehacer el formulario.
- **Las tres pantallas que los vídeos tenían que enseñar: HECHAS el 24-ago.** Ciclo de
  moderación de un comentario (publicar, editar, ocultar, borrar) · contenido de la Página con su
  identidad delante · perfil de Instagram con sus campos y su lista de medios. Las tres se
  recorren con datos reales y sin datos de mentira. Queda **grabar**, que no lo puede hacer un
  runner.
- **Las llamadas de prueba caducan el 5-sep-2026.** Se hicieron el 6-ago. Si el nuevo envío sale
  después, hay que repetirlas antes.

### El subdominio del inquilino, que es lo que queda cojo
- **El DNS de un alias nuevo no es inmediato y no es predecible.** `cuenta` y `conectar`
  respondieron en segundos; `demostracion` seguía sin existir para el autoritativo quince
  minutos después. Hasta entender por qué, `/crear` no redirige. Medir cuánto tarda de verdad
  con dos o tres altas más.
- **El comodín `*.kavea.ai`: Netlify puso condición.** Del ticket #1097522: hay que borrar los
  cuatro alias (`boosty`, `cuenta`, `conectar`, `demostracion`) y dejar solo el primario
  `admin.kavea.ai`; después habilitan el comodín y esos nombres vuelven solos. El orden importa:
  entre el borrado y la habilitación esos cuatro hosts dan el 404 de Netlify —con TLS válido,
  porque el certificado `*.kavea.ai` ya está emitido—, y dos de ellos no son decorativos:
  `conectar.kavea.ai` es la redirect URI registrada en Meta con coincidencia estricta y
  `boosty.kavea.ai` es el espacio vivo. Los mensajes siguen entrando: los webhooks van a Supabase,
  no a `kavea.ai`. Preguntado además si el comodín de `kavea-app` se lleva `www.kavea.ai`, que
  pertenece al otro sitio (`kaveaai`) y hoy hace 301 al ápice. Cuando esté, `/crear` deja de
  depender de una llamada a la API de Netlify por cada alta y desaparece el tope de alias.
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
- Nadie vigila la bandeja de resultados del App Review (**B4** del plan). La respuesta del 7-ago
  estuvo dieciséis días sin leerse y no hay nada que avise: ni correo encaminado, ni comprobación
  en el cron de diagnóstico. Mientras no lo haya, se mira a mano.
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

**Cerrado también el 24-ago:** el cron diario de `debug_token` por autorización
(`kavea-verificar-autorizaciones`, 04:41) y la **selección de activos**: una autenticación con
Facebook y luego, dentro de Kavea, se eligen las Páginas y los Instagram (0092/0093 y
`meta-activos`). Ya no se rechaza un alta por tener más de una Página.

**Sigue abierto:** la segunda config de Facebook Login for Business, la de WhatsApp —depende de
Embedded Signup— · enlace de conexión firmado, un solo uso, 72 h, sin sesión de Kavea ·
máquina de estados por (organización, canal) · Conversation Routing (`primary_receiver`,
`thread_owner`, los seis endpoints) · árbol de diagnóstico diferencial · pantalla de expectativas
de WhatsApp.

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
- **Los `AbortSignal.timeout` de las rutas de API piden más de lo que Netlify concede.**
  `/api/contenido` declara 45 s y `sincronizar` 60 s; el techo de Netlify Pro son 26 s, con 10 s por
  defecto. Medido el 24-ago: 1,8 s, 2,0 s y 5,7 s, así que hoy hay margen — pero `sincronizar`
  escala con las cuentas conectadas y con ocho o diez cruza el techo. Bajar los plazos a lo que la
  plataforma concede, o partir el trabajo.
- **Decidir hosting: Netlify o Vercel.** Analizado el 24-ago con números medidos (entrada de ese
  día). A favor de Vercel: no hay adaptador de Next que emule mal el middleware, 300 s de plazo por
  defecto en vez de 10, y comodín multi-inquilino sin ticket. En contra: la zona DNS entera —con el
  correo de SES y Resend dentro— tiene que mudarse a sus nameservers. **Después del App Review**, no
  antes.
- Reconciliar `docs/fases/` contra lo ya ejecutado — hoy varios documentos dicen «sin código»
  sobre partes que están en producción.

### Pendiente que nació hoy
- ~~Probar un envío real con el token del diálogo~~ **hecho el 24-ago**: salieron mensajes por
  Instagram y por Messenger con el token del canje, con eco de Meta y `mid`. A2 cerrada.
- **Nadie ajeno a Boosty ha completado el diálogo.** El canje real se hizo desde el propio
  portafolio, con una cuenta que tiene rol en la app y en modo desarrollo. Es lo que exigen C1, C2,
  C4, C5, C7 y C8 de `docs/fases/05` §10, y no se puede simular desde dentro.
- **Volver el repositorio a privado** cuando la facturación de Actions esté resuelta. Y antes de
  eso, **abaratar CI**: los cinco trabajos corren en cada push sin un solo filtro `paths:`, y ahí
  se fueron los 3.000 minutos. Poner filtros —el de base de datos solo cuando cambie
  `supabase/**`, el del sitio público solo con `web/**`— recorta la mayor parte sin mover nada.
  La alternativa de meter los guardianes en el `command` de Netlify tiene un agujero concreto:
  los dos sitios llevan `ignore = "git diff --quiet HEAD^ HEAD -- ."`, así que un commit que solo
  toque `supabase/` o `scripts/` no dispara ningún build y no se comprobaría nada. Y el trabajo de
  esquema necesita Docker, que Netlify no tiene: ese no se mueve.

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

### 2026-08-24 (cierre) — WhatsApp restaurado, y el camino de vuelta que no existía

**Reparado `+1 321-393-1397`**, que el botón de soltar Facebook se había llevado por delante. Los
tres pasos, comprobados uno a uno: la fila vuelve a `connected` con su ruta
`whatsapp_phone_number` y su canal encendido · la credencial la reemite el borde
(`credencial_whatsapp`) **verificándola contra Meta antes de guardar** —`+1 321-393-1397`,
«Boosty Admin», calidad GREEN, CLOUD_API— · y la WABA `2459716937850832` estaba con
`subscribed_apps: []`, lo que confirma que el corte la dio de baja; vuelta a suscribir.

Estado final: dos conexiones vivas, cada una con sus rutas, canales activos y credencial.

**Y salió una asimetría de fondo.** Desde la 0079 existe `desconectar_conexion` y **no existe nada
que lo deshaga**. Para una Página da igual: «Elegir qué conectar» la registra otra vez desde el
BISU. Para WhatsApp no hay equivalente —entra por el portafolio, con token de system user, desde una
pantalla de staff—, así que un número desconectado por error se quedaba así hasta que alguien
escribiera SQL a mano. Es la misma queja que motivó el botón de soltar, del revés: si hay puerta de
salida tiene que haber puerta de vuelta.

La 0103 añade `reconectar_conexion`, que rehace lo que la desconexión deshizo del lado de Postgres
—estado, rutas y canales— y **dice lo que no puede hacer**: devuelve `falta: ['credencial',
'suscripcion']`, porque esas dos viven fuera y prometer una reconexión completa sería mentir sobre
lo que la función puede saber. Dos detalles que decidieron su forma: las rutas se derivan de la fila
y no se reciben —aceptarlas sería ofrecer una forma de enrutar activos ajenos a este espacio—, y los
canales solo se reencienden si los apagó una desconexión: uno pausado a mano por otro motivo sigue
pausado, porque reconectar no es deshacer todas las decisiones tomadas mientras tanto.

**Y antes de aplicarla, la restricción.** La 0003 creó `meta_asset_routes.tipo` con solo
`page | ig_business_account`. Insertar `whatsapp_phone_number` habría reventado con 23514 — el mismo
fallo que costó la 0089. Comprobado contra la base viva antes de aplicar: una migración posterior ya
lo había ampliado.

### 2026-08-24 (cierre) — El botón se llevó un WhatsApp que no era suyo

La 0101 se desplegó y Gabriel la usó esa misma noche. La actividad lo cuenta entero: **01:52:41**
`conexion.desconectada` de Boosty.digital a mano, **02:13:48** `meta.desautorizada` con
`conexiones: 2` —el botón nuevo—, **02:17:37** una autorización nueva. El corte completo y la
reconexión desde cero quedan probados en producción sin que los ejecutara yo.

**Y con eso salió el fallo.** Esas dos conexiones eran la Página y el número de WhatsApp
`+1 321-393-1397`. La Página tenía que caer; el número no. **WhatsApp no cuelga de la autorización
de Facebook**: entra por el portafolio, con token de system user, por una superficie de staff.
`desautorizar_meta` desconectaba todo lo que hubiera en `meta_connections` sin mirar de dónde venía.

Un botón que apaga más de lo que su texto promete es peor que no tenerlo, y el precio se pagó
entero: el número quedó sin rutas, y volver a levantarlo **no es un clic** —«Elegir qué conectar»
solo activa Páginas e Instagram del BISU—, hay que rehacerlo desde el panel interno.

Arreglado en la 0102: cae lo que la autorización produjo, o sea las conexiones con `page_id`. La
confirmación dice ahora **las dos cifras** —cuántas caen y cuántas no— y la actividad también.
Cuando WhatsApp entre por Embedded Signup colgará de la misma autorización y habrá que volver aquí:
la regla no es «WhatsApp nunca», es «lo que vino de este permiso».

**El vídeo del login, revisado con ffmpeg.** 5 min 20 s, VP9 1920×1080 sin audio. Cubre de sobra:
incógnito → login de Kavea → «Conectar con Facebook» → login de Facebook con 2FA → «Trust this
device» → **«Select the business assets to share with kavea»** con portafolio, Página e Instagram →
código de confirmación → «Gabriel Montiel Toro has been connected to kavea» → vuelta a Kavea, «Qué
conectar» → **Activar**. Y después, un mensaje de Instagram entrando y la respuesta saliendo.

Partido en las dos tomas que el montador espera: `login.mp4` (0→178 s) e `instagram.mp4`
(262→fin). Entre medias había **45 segundos de bandeja vacía** que no aportan nada. Comprobado en la
base que la respuesta «ok» salió de Kavea —`enviado`, 02:20:10, con id de Instagram—; el «cool» que
también se ve lo escribió él en Instagram. Con eso, **cinco de los ocho vídeos quedan montados**.

### 2026-08-24 (cierre) — La puerta de salida, y Boosty.digital quedó desconectada

**Ya se puede soltar la cuenta de Facebook entera** (0101 + `meta-soltar` + el botón en Canales).
Antes se podía desconectar un canal pero no la autorización de la que cuelgan todos: la fila seguía
con su BISU cifrado, la pantalla seguía diciendo «ya autorizaste», y Kavea seguía apareciendo en los
ajustes de Facebook del cliente como una app con acceso. Un producto que deja entrar tiene que dejar
salir por la misma puerta.

**Soltar son tres cosas y el orden no es negociable.** Lo local —desconectar todas las conexiones,
borrar credenciales y enrutado, apagar canales— ocurre sí o sí, porque el cliente pidió irse. Luego,
en el borde: primero las bajas de webhooks, que necesitan un token de Página y los tokens de Página
se piden CON el BISU; y después `DELETE /me/permissions`, que lo mata. Al revés, Meta se queda
mandando eventos a una ruta que ya no existe. Por eso la fila se marca `revocada_en` en vez de
borrarse: para la aplicación deja de existir en el mismo instante y el borde todavía puede leerla.

La confirmación lleva escrito **cuántas conexiones se apagan** y dice que las conversaciones no se
borran — la misma distinción que hace el callback de desautorización de Meta: retirar el acceso es
«dejad de escribir en mi nombre», no «olvidad lo que pasó».

**Un `div` dentro de un `p`.** El bloque de la autorización era un párrafo y el botón nuevo es un
`div`: HTML inválido, el navegador cierra el párrafo antes de tiempo y salta el error de hidratación
**418** de React. Compilaba, el typecheck pasaba y la pantalla se veía bien. Lo dijo la consola en la
primera pasada con Playwright, que es exactamente para lo que esa pasada existe.

**Y al comprobar el número de la confirmación salió otra cosa.** La tarjeta decía «2 conexiones
activas» y las de canal sugerían tres; mirando la base, **`Boosty.digital` está `disconnected` desde
las 01:52:41**, con su actividad `conexion.desconectada` —a mano, desde la pantalla de canales; no
fue el botón nuevo, que registra `meta.desautorizada`—. Las rutas lo confirman: solo quedan las de
`gabrielmontieltoro` y el número de WhatsApp. Mientras siga así, **ni los DM ni los comentarios de
`@boosty.digital` entran**, y `/contenido` ya no la lista. La autorización sigue viva, así que
volver a conectarla es un clic en `Elegir qué conectar → Activar`, sin pasar por Meta.

### 2026-08-24 (cierre) — El montador, y el login se graba una vez

`ffmpeg` instalado (9.0.1 por scoop) y `scripts/montar-screencasts.mjs` escrito. Pega las tomas en
orden y saca los ocho vídeos del envío en `screencasts/entrega/`.

**Por qué existe.** Meta pide cinco cosas en CADA screencast y las dos primeras son el login de Meta
y la pantalla de consentimiento. Grabar eso ocho veces es absurdo: se graba **una vez** y el script
lo pega delante de los ocho. Cuatro de los ocho —`human_agent`, `pages_read_engagement`,
`instagram_basic`, `pages_manage_metadata`— quedan **completos con solo esa toma**, porque el resto
del metraje ya lo grabó el runner.

Los otros cuatro necesitan cliente nativo, que no lo puede grabar un runner: `pages_messaging`,
`instagram_manage_messages`, `pages_utility_messaging` y el cierre de
`instagram_manage_comments` —«Then, open the native client to confirm the final state»—.

**Se normaliza antes de pegar, y no es cosmético.** `concat` exige mismo códec, tamaño, fps y pista
de audio. Los vídeos de Playwright son VP8 1440x900 a 25 fps y **sin audio**; una grabación de
pantalla es H.264 a la resolución del monitor y con audio. Pegarlos en crudo da un fichero que unos
reproductores abren y otros no, y el del revisor de Meta es justo el que no se puede probar. Todo
pasa por 1440x900, 25 fps, H.264 y una pista silenciosa. Y se escala con `pad` en vez de estirar:
lo que el revisor tiene que hacer con este vídeo es LEER.

**No monta vídeos a medias.** Si a un permiso le falta una toma, no se genera y se dice cuál falta
por su nombre. Un fichero incompleto con el nombre correcto es lo que se sube sin mirar — ya pasó
hoy con los 930 KB de `human_agent`.

Probado de punta a punta con un clip de prueba: los cuatro que solo necesitan el login se montaron,
los otros cuatro se reportaron por su nombre, y el resultado sale en 1440x900 H.264 con audio y con
el segundo tramo en su sitio, comprobado extrayendo fotogramas.

**Y la duda del botón:** no hay que desconectar nada para grabar el login. Con la autorización ya
hecha, la pantalla de canales enseña «Elegir qué conectar» y debajo **«Autorizar otra cuenta»**, que
apunta al mismo `/api/meta/oauth/start` que el botón de la primera vez. Lo que sí hace falta es una
ventana sin sesión de Facebook —de incógnito— o el diálogo se salta el login, que es el requisito 1.

### 2026-08-24 (cierre) — El comodín entró, y los doce vídeos

**`*.kavea.ai` está vivo.** Netlify lo habilitó tras borrar los cuatro alias. Comprobado nombre por
nombre: `boosty`, `demostracion`, `admin` y **`cualquiercosa.kavea.ai`** dan 307 —el comodín sirve
cualquier subdominio nuevo sin registrarlo—, `www` sigue con su 301 al ápice y `kavea.ai` con su 200.
**La fase C queda desbloqueada**: un inquilino nuevo ya no necesita una llamada a la API de Netlify
por cada alta, ni depende de que el DNS propague.

**Y casi se reporta un fallo que no existía.** `conectar.kavea.ai` y `cuenta.kavea.ai` seguían dando
404 en la raíz mientras los otros funcionaban, con DNS idéntico —mismo destino, mismas IPs—. Lo
resolvió una cabecera: el 404 traía `Netlify-Vary: … x-nextjs-data …`, o sea que lo devolvía **la
aplicación**, no el CDN. Son superficies sin inquilino y su raíz no tiene página. Las rutas que sí
sirven responden como deben: `cuenta/registro` y `cuenta/crear` 200,
`conectar/api/meta/oauth/start` 401 —pide sesión— y `callback` 400 —falta el `state`—.

**Los doce vídeos, grabados.** Con `human_agent` cerrado usando la tarjeta `7ecc5529…`, cuyo entrante
de Instagram tenía 37 h: dentro del tramo de 24 h a 7 días. El hito enseña la píldora «Instagram
solo intervención humana» y el aviso literal —«Fuera de las 24 horas. Se enviará como intervención
humana, y solo vale hasta los 7 días»—, y el envío salió con `messaging_type = MESSAGE_TAG` y su id
de Instagram. Tres envíos en vivo comprobados en la cola en la misma tirada: WhatsApp, Instagram con
tag y Messenger con `RESPONSE`.

Falta de B3 solo lo que necesita manos: el diálogo de Meta y el cliente nativo.

### 2026-08-24 (cierre) — El DM de @eficienzia.ai no llegó, y no es un fallo de Kavea

Gabriel mandó un DM desde `@eficienzia.ai` y no apareció en la bandeja. Diagnóstico, en este orden:

1. **El último webhook de Instagram es de las 04:06.** Nada después. El mensaje no llegó a Kavea,
   así que no hay nada que arreglar en la ingesta.
2. **Las suscripciones están bien.** El objeto `instagram` tiene `messages`, `comments`,
   `message_reactions`, `messaging_postbacks`, `messaging_referral`, `messaging_seen` y `standby`, y
   la Página tiene sus nueve campos. La app entrega DM: 61 eventos de `instagram`, el último hoy.
3. **La app está en modo desarrollo y solo tiene DOS roles**, los dos administradores. Ningún
   tester. En modo desarrollo Meta entrega eventos únicamente de quien tiene rol en la app: por eso
   los DM de `@gabrielmontieltoro` entran y los de `@eficienzia.ai` no.

**Preguntarle a Graph no era una opción**, y eso también es un dato: `GET
/{ig-id}/conversations` responde `(#3) Application does not have the capability to make this API
call`, porque `instagram_manage_messages` está rechazado. El permiso que falta impide comprobar el
problema causado por el permiso que falta.

**Corrección de la bitácora.** Se venía diciendo que el webhook de comentarios no llega por «falta
la suscripción al campo `comments` del objeto `instagram`». **La suscripción está.** De 61 eventos de
`instagram`, ninguno es un comentario. La explicación que encaja es la misma que la del DM ajeno:
modo desarrollo y `instagram_manage_comments` rechazado. Se arregla con la aprobación, no tocando el
panel.

**Salida para el vídeo:** no pelearse con los roles. `@gabrielmontieltoro` ya entrega, tiene la
ventana de 24 h abierta (entrante de hace 8,7 h, tarjeta `da6c1b3e…`) y sirve igual como cliente
nativo. Si algún día hace falta `@eficienzia.ai`, hay que añadir su cuenta de Facebook como tester
de la app y aceptar la invitación.

### 2026-08-24 (cierre) — Los cuatro alias borrados, y el cliente nativo no lo puede tocar un runner

**Ejecutado el paso que Netlify pedía.** `kavea-app` se queda solo con el primario `admin.kavea.ai`;
`boosty`, `cuenta`, `conectar` y `demostracion` fuera. Comprobado inmediatamente después: los cuatro
dan **404**, y `admin` (307), `www` (301 al ápice) y `kavea.ai` (200) intactos, tal como Netlify
anticipó. **Mientras esto siga así no se puede grabar nada**: los guiones apuntan a
`boosty.kavea.ai`. Contestado a Romeo para que active el comodín.

**El cliente nativo no se puede automatizar desde aquí, y no por falta de ganas.** Gabriel dejó
abiertos WhatsApp Web del `+58 412 172 2767` e Instagram de `@eficienzia.ai` para que Kavea
escribiera y se viera llegar. No hay herramienta de navegador en esta sesión, y la vía técnica
—atacharse a su Chrome por CDP— está cerrada: el proceso corre sin `--remote-debugging-port` y desde
Chrome 136 ese flag está **bloqueado con el perfil por defecto**, que es justo el que tiene las
sesiones. Un perfil nuevo no está logueado, así que no hay atajo.

Y aunque lo hubiera, el vídeo saldría partido: Playwright graba UN contexto, y el cliente nativo vive
en otro navegador. Los cuatro «delivered message in the native client» son una grabación de pantalla
de una persona, con Kavea en una pestaña y el cliente en la otra.

**Lo que sí se pudo averiguar, y cambia el plan:**

- **`+58 412 172 2767` SÍ está en la bandeja** —tarjeta `202c9cae…`, entrante de hace 14,1 h— así que
  la ventana de 24 h está abierta. Es el número al que ya salió el envío de
  `whatsapp_business_messaging`: el `wamid.HBgMNTg0MTIxNzIyNzY3…` lleva `584121722767` dentro.
- **`@eficienzia.ai` NO está en la bandeja.** No hay conversación de Instagram con esa cuenta, y no
  puede haberla: la mensajería de Instagram solo permite responder dentro de la ventana que abre el
  usuario. **Tiene que escribir un DM a `@boosty.digital` primero.**
- **`human_agent` SÍ se puede grabar hoy.** La tarjeta `7ecc5529…` tiene un entrante de Instagram de
  hace **37,2 h**: dentro del tramo de 24 h a 7 días. Lo de ayer no falló por la ventana, falló por
  la tarjeta.

**Y el guion tenía un segundo fallo debajo del primero.** Buscaba `button.canal-chip` para elegir
Instagram, pero el compositor **solo pinta ese botón cuando la tarjeta tiene más de una
conversación**; con una sola pone una línea de texto. La tarjeta buena tiene exactamente un canal, así
que el arreglo de ayer habría vuelto a fallar por otro motivo. Ahora: variable propia
`TARJETA_HUMAN_AGENT` —el requisito no tiene nada que ver con el de WhatsApp—, el chip se clica solo
si existe, y **se comprueba que el compositor anuncia intervención humana antes de escribir**. Sin esa
comprobación, un entrante de menos de 24 h produce un vídeo que parece correcto y no enseña la feature.

### 2026-08-24 (cierre) — Netlify o Vercel, con los números medidos

Investigado a peticion de Gabriel. Lo que decide no es la comparativa de las webs de cada uno, es
lo que ya está escrito en este repositorio.

**El impuesto del adaptador está documentado en el propio código.** `app/middleware.ts` dice, de su
puño: `NextResponse.next({ request: { headers } })` **no propaga** en el Next Runtime de Netlify —se
comprobó en producción, el síntoma era un 404 en la raíz de cualquier subdominio— y hubo que rodearlo
leyendo el `Host` en `lib/dominio.ts`. Es una función estándar de Next.js que el adaptador emula mal.
Y `app/netlify.toml` fija `@netlify/plugin-nextjs` en `5.11.2` a propósito, porque una actualización
automática cambia cómo se sirven las rutas del App Router. Vercel mantiene Next.js: no hay adaptador
que emular ni versión que fijar.

**El techo de las funciones, medido.** Netlify Pro corta las funciones síncronas a **26 s**, con
**10 s por defecto** y hay que pedirle a soporte que lo suban. Vercel Pro: **300 s por defecto, 800 s
de máximo**. Y el código de Kavea ya pide más de lo que Netlify puede dar: `/api/contenido` declara
`AbortSignal.timeout(45_000)` y el `sincronizar` de `/api/comentarios`, 60_000.

Medido hoy en producción, desde el navegador y con sesión real:

| Ruta | Tiempo | Declarado en el código |
|---|---|---|
| `/api/contenido` · pagina | 1 792 ms | 45 s |
| `/api/contenido` · instagram | 1 956 ms | 45 s |
| `/api/comentarios` · sincronizar | 5 664 ms | 60 s |

El techo no se toca hoy. Pero `sincronizar` escala con las cuentas conectadas: 5,7 s para **dos**
cuentas, 24 publicaciones y 50 comentarios. Con ocho o diez cuentas cruza los 26 s, y entonces
Netlify mata la petición mientras el código cree que tiene un minuto. **Eso hay que arreglarlo
igual, en cualquier plataforma**: un `AbortSignal` más largo que el techo de la plataforma es una
promesa que no se puede cumplir.

**El comodín.** En Vercel los subdominios comodín son una función de primera clase para
multi-inquilino, en todos los planes y sin ticket, y los dominios concretos conviven con el comodín.
En Netlify costó el caso #1097522, seis requisitos, y ahora exige borrar los cuatro alias con una
ventana de caída. Con comodín, además, la función `subdominio` —que llama a la API de Netlify para
añadir un alias por inquilino, y cuya propagación de DNS era impredecible: `demostracion` no
resolvía quince minutos después— deja de hacer falta.

**Lo que cuesta mudarse, sin adornos.** El comodín de Vercel **exige sus nameservers**, así que la
zona de `kavea.ai` tiene que mudarse entera: MX del entrante de SES, MX y SPF de `send.kavea.ai`,
DKIM de Resend, DMARC. Ahí está el riesgo real —hay correo de por medio—, no en el hosting.
`Netlify Blobs` lo usan tres funciones de Supabase (`drenar-amortiguador`, `subdominio`,
`_compartido/almacen.ts`) como amortiguador de webhooks; hablan por token y seguirían funcionando
desde cualquier sitio, pero mantenerlas significa depender de dos plataformas. El sitio público es
Astro estático y da igual dónde viva. En precio es empate: Netlify Pro 19 $/miembro, Vercel Pro
20 $/asiento con 20 $ de crédito y 1 TB incluido.

**Y NO, las Actions no correrían en Vercel.** Vercel tiene *Native Deployment Checks*, pero solo
ejecutan dos guiones fijos de `package.json`: `lint` y `typecheck`. No guiones arbitrarios. Los
*Deployment Checks* generales **importan** el resultado de GitHub Actions —dependen de ellas, no las
sustituyen—. Y no hay Docker en el camino de construcción, así que «Esquema desde cero y
aislamiento» no se mueve a ninguna de las dos. De los cinco trabajos, Vercel cubriría de forma nativa
el typecheck y el lint; los cuatro guardianes de node y grep habría que meterlos en el `command`, y
el de esquema se queda en Actions. **La respuesta a lo de CI no cambia con la plataforma**: lo barato
sigue siendo poner filtros `paths:` al workflow que ya existe.

**Recomendación:** mudarse sí, pero **después de enviar el App Review**. La fase B tiene fecha —las
llamadas de prueba caducan el 5-sep— y los once vídeos están grabados contra producción. Mover el
hosting en medio del envío arriesga justo lo que tiene fecha. El comodín de Netlify, en cambio, sí
ahora: son minutos de caída con un ingeniero esperando al otro lado, no hay clientes externos que
puedan tropezar, y deja la fase C desbloqueada aunque la mudanza se retrase.

### 2026-08-24 (cierre) — El canario C1 cazó una tabla sin RLS

La 0099 creó `private.revision_permisos` y se dejó las dos líneas que llevan todas las demás
tablas. Lo dijo CI, no una persona: «C1: tablas sin RLS activo y forzado:
private.revision_permisos». Tres despliegues seguidos en rojo por eso, con los otros cuatro
trabajos en verde.

Estar en `private` —que PostgREST no expone— hace que no fuera alcanzable desde fuera, y por eso
el olvido no rompió nada visible. Es exactamente la razón por la que el canario existe: una tabla
que hoy nadie puede leer desde fuera es una tabla que mañana alguien expone sin saber que no tenía
red. Y `force` importa más que `enable` aquí, porque todo lo que la toca son funciones
`security definer`, que corren como el dueño y sin `force` se saltan sus propias políticas.

Arreglado en la 0100, y comprobado que el vigilante sigue funcionando con RLS forzado:
`relrowsecurity` y `relforcerowsecurity` en `true`, y la pasada siguiente devolvió
`cambios: 0` como debe.

### 2026-08-24 (cierre) — Once de los doce vídeos, grabados contra producción

Con las pantallas desplegadas, `scripts/grabar-screencasts.mjs` sacó **once vídeos**, y lo que
enseñan está comprobado en la base, no supuesto:

- **`instagram_manage_comments`** — el ciclo entero sobre una publicación real: `comentario.respondido`
  a las 10:59:00, `comentario.editado` a las 10:59:22, `comentario.borrado` a las 10:59:33.
- **`whatsapp_business_messaging`** — envío en vivo, `estado: enviado`, `wamid.HBgMNTg0MTIxNzIyNzY3…`.
- **`pages_messaging`** — envío en vivo, `estado: enviado`, `m_5VIxoSi2RdVRy0A8ynihT1rC9zij…`.
- **`instagram_basic`** — handle `@boosty.digital`, ID `17841421294200897`, campos de perfil y la
  lista etiquetada «Publicaciones de @boosty.digital».
- **`pages_read_engagement`** — elección de Página, contenido leído en vivo y la identidad delante.

**Hitos, para poder auditar sin ver doce vídeos.** Nueve PNG, uno por momento que justifica un
permiso. Existen porque `ffmpeg` no está instalado y sin él no hay forma de sacar un fotograma
después: tres guiones llevaban semanas grabando la pantalla equivocada y nadie lo vio porque el
fichero salía, con su tamaño razonable.

**Tres cosas del script que habrían producido un envío malo:**

1. **Dos ficheros por permiso.** Playwright nombra con hash y el script pone el permiso delante,
   así que tras dos tiradas convivían el `instagram_basic` del 6-ago —197 KB, la bandeja,
   rechazado— con el nuevo de 2 MB. Elegir bien dependía de mirar la fecha de doce ficheros. Ahora
   la carpeta anterior se aparta antes de grabar.
2. **`human_agent` se saltaba en silencio** dentro de un `if` sin `else`: la tirada sacó once
   vídeos y faltaba el duodécimo hasta contarlos.
3. **Y luego grabó uno inútil.** Con la tarjeta puesta, el recorrido no encontró el chip de
   Instagram, avisó y salió — y `grabar` guardó igual 930 KB de una pantalla sin Human Agent, con
   el nombre del permiso delante y listo para subir. Ahora un recorrido puede devolver `false` y el
   vídeo se tira.

**`human_agent` no se puede grabar hoy**, y por dos razones a la vez: la tarjeta de WhatsApp que se
usó es de un contacto que nunca escribió por Instagram, y el tag solo vale entre las 24 h y los
7 días desde el último entrante —los tres canales tienen entrantes de hace 7 y 13 horas—. Mañana
sí, si no entra nada nuevo que reinicie la ventana.

**Y el hilo se limpió para la cámara.** Cuatro comentarios de prueba tachados eran lo primero que
se veía. Van en un `details` nativo: se abre sin JavaScript, el rastro sigue ahí y no es lo primero.

Falta de B3 lo que un runner no puede hacer: el diálogo de Meta —completar el login pide
credenciales de Facebook en el navegador— y el cliente nativo, que son cuatro notas de rechazo.

### 2026-08-24 (cierre) — El despliegue que se canceló solo, y los rojos que no eran fallos

Se subieron los cinco commits del día de golpe. Netlify **canceló el build** de la aplicación y
`boosty.kavea.ai/contenido` siguió dando 404: las pantallas nuevas nunca se desplegaron.

La causa está en `app/netlify.toml`:

    ignore = "git diff --quiet HEAD^ HEAD -- ."

Eso mira **un solo commit**, el de la punta. El último de los cinco solo tocaba `docs/` y
`scripts/`, así que la comparación salió limpia y Netlify canceló «due to no content change» —
dejando sin construir los cambios de `app/` de los dos commits anteriores. El despliegue sale en
rojo, pero el motivo que da suena a que no había nada que hacer, que es lo que hace que no se mire.

Arreglado comparando contra `CACHED_COMMIT_REF`, el commit del último build con éxito: entre ese y
el actual está todo lo que falta por construir. **Con respaldo `${CACHED_COMMIT_REF:-HEAD^}`**,
porque una variable vacía ahí no falla: invierte el sentido. `git diff --quiet "" $COMMIT_REF -- .`
compara el árbol de trabajo contra ese commit, sale limpio y **cancela**. De los dos errores
posibles, ese es el peor, y la primera versión del arreglo lo tenía.

**Y NO ESTÁ COMPROBADO.** El commit que lo arregla toca `app/`, así que la regla vieja también
habría construido: el despliegue que salió bien no prueba nada sobre el arreglo. La prueba de
verdad es el siguiente empujón de varios commits cuyo último no toque `app/`.

**Corrección de una creencia anterior.** El sitio público lleva **al menos seis despliegues
seguidos** en rojo con ese mismo mensaje, y la bitácora del 24-ago lo apuntó como señal de que el
problema no era el código sino la facturación de Actions. La conclusión era correcta por accidente:
esos rojos son el `ignore` haciendo su trabajo —`web/` no cambia— reportado como error. **Un
despliegue rojo del sitio público no es un fallo**, y confundirlo cuesta buscar en el sitio
equivocado.

Y el 502 de `/contenido` justo después del despliegue era arranque en frío de la función: al tercer
intento, 307 a `/entrar`, que es lo correcto.

### 2026-08-24 (cierre) — Tres de los ocho vídeos grababan la pantalla equivocada

Al reescribir `scripts/grabar-screencasts.mjs` para B3 apareció algo que la nota de rechazo no
decía y que explica más que ella:

- **`instagram_manage_comments`** grababa `${BASE}/comentarios`. Esa ruta **dejó de existir el
  21-ago**, cuando los comentarios pasaron a ser una pestaña de la Bandeja. El vídeo enseñaba un
  404, con mucha calma y en buena resolución.
- **`pages_read_engagement`** grababa `/admin/portafolio` con scroll: una lista de nombres de
  Páginas. La nota pide elegir una Página, leer su contenido y pintarlo con su identidad delante.
  Una lista de nombres no es ninguna de las tres cosas.
- **`instagram_basic`** grababa `/bandeja`. Es mensajería: no tiene handle, ni campos de perfil,
  ni lista de medios. Nada de lo que la nota nombra.

Los tres se rechazaron. La causa que Meta puso —«Screencast Not Aligned with Use Case Details»—
era literal, y se leyó como si fuera solo el asunto del login. Era las dos cosas.

Reescritos contra las pantallas que ahora existen: el ciclo completo en el hilo del comentario,
`/contenido` para el contenido de la Página, y su pestaña de Instagram para el perfil. Y la
cabecera del script dice ahora **qué no puede grabar**: el login de Meta y la pantalla de
consentimiento —existen desde el 24-ago, pero completar el diálogo pide credenciales de Facebook
en el navegador— y el cliente nativo, que son cuatro notas de rechazo y un teléfono en la mano.

**No se ha grabado nada todavía**: el script apunta a producción y las pantallas nuevas están en
tres commits sin desplegar.

### 2026-08-24 (cierre) — Alguien mira el App Review, y el encuadre del envío estaba caduco

**B4.** La respuesta del App Review del 7-ago estuvo **dieciséis días** sin leerse. No fue
descuido: no hay webhook de esto, el correo de Meta cae donde nadie mira a diario y el panel hay
que abrirlo a propósito. Ahora `vigilar-revision` pregunta cada día a
`GET /{app-id}/permissions` con **token de app** —`{id}|{secreto}`, que no caduca y no depende de
ninguna persona—, compara contra lo último visto (0099) y manda correo si cambió algo.

Los rechazados no aparecen en esa lista, así que la comparación funciona en las dos direcciones:
un permiso que **aparece** es una aprobación y uno que **desaparece** es una revocación. La segunda
importa más — es la que avisaría de que Kavea se quedó sin poder mandar nada.

Tres decisiones que hacen que se le pueda hacer caso:
- **La primera pasada siembra y calla.** Con la tabla vacía todo parece un cambio; un vigilante
  que grita el día que lo instalas es un vigilante al que se deja de hacer caso.
- **Sin `data` no se anota nada.** Un error de red tratado como respuesta buena diría que se
  perdieron los trece permisos de golpe. Misma guarda que `verificar-autorizaciones`.
- **El correo se marca después de que Resend acepte.** Una alerta marcada como notificada sin
  correo enviado sale de la lista de pendientes y nadie vuelve a mirarla.

Probado de punta a punta, no solo el camino feliz: primera pasada `primera_vez: true` sin avisar ·
segunda `cambios: 0` · se falseó un estado guardado y la tercera detectó el cambio, escribió la
alerta 112 y **entregó el correo** (`avisado: true`) · la cuarta volvió al silencio. Hicieron falta
dos secretos nuevos en el proyecto: `RESEND_API_KEY` y `KAVEA_CORREO_ALERTAS`.

**B2, y aquí había un error de documento.** `docs/07` decía «Kavea no tiene ninguno de los dos, y
no es un olvido: es la arquitectura». Era verdad el 7-ago y dejó de serlo el 24, cuando Facebook
Login for Business entró en producción. Enviar con ese encuadre habría sido declarar que no
tenemos algo que sí tenemos, y renunciar al argumento más fuerte que hay. Son **dos caminos**:
autoservicio, donde el login de Meta y la pantalla de consentimiento se ven completos, y clientes
del portafolio con token de system user, donde no los hay —y ese es el caso que contempla el
quinto punto de la propia lista de Meta—. El texto del envío está escrito en inglés y listo para
pegar en *Request again*, con lo que enseña cada vídeo, permiso por permiso.

Lo que ese texto NO promete: que los vídeos de los permisos que solo se usan por el camino del
portafolio enseñen un login. Prometer de más en el formulario es cómo se consigue un segundo
rechazo con la misma nota.

### 2026-08-24 (cierre) — El ciclo de moderación, y la Página que se elegía sola

**Lo que Meta pidió, verbatim:** «a complete comment moderation loop… add a comment from your app,
edit that comment, and delete it. Then, open the native client to confirm the final state on that
post». Kavea sabía responder y nada más.

**Editar no existe en Instagram.** La arista de un comentario de IG acepta `hide` y `DELETE`; el
texto no se cambia. Así que editar es publicar el nuevo y borrar el viejo, EN ESE ORDEN: si falla
el segundo paso quedan dos comentarios —visibles, y se arreglan—, y al revés no quedaría ninguno.
De los dos fallos posibles se elige el que deja rastro. La pantalla lo dice con esas palabras
antes de pulsar, porque el resultado se ve en público y el enlace del comentario cambia.

Editar y borrar solo en lo que publicó Kavea (`propio`); ocultar y mostrar en lo demás. Un botón
de borrar sobre el comentario de un cliente, en una bandeja compartida y sin vuelta atrás, se
pulsa por error un día.

**Y LA PÁGINA SE ELEGÍA SOLA.** `sincronizar-comentarios` y `responder-comentario` resolvían la
cuenta con `meta_asset_routes?tipo=eq.page&limit=1`: la primera fila de la tabla ENTERA. Con una
Página conectada acierta siempre y parece correcto; desde ayer hay tres, de dos organizaciones.
Pulsar «Traer de Meta» en un espacio leía la cuenta que devolviera Postgres. No era un permiso mal
puesto —RLS seguía en pie— era una pregunta mal hecha con una respuesta plausible, que es lo que
la mantuvo invisible dieciocho días. Ahora la organización llega resuelta desde el servidor y se
recorren TODAS sus cuentas: la primera pasada arreglada trajo **49 comentarios que nunca habían
entrado**.

**De dónde sale el token, en orden:** la credencial cifrada de la conexión, y solo si Meta la
rechaza por permiso, la derivada del portafolio —y entonces AVISA—. Importa cuál gana: el ciclo
entero se probó y salió `via: "conexion"`, así que un cliente de autoservicio, que no está en el
portafolio de Boosty y del que no se puede derivar nada, también puede moderar.

**Probado contra Instagram de verdad**, no contra un ejemplo: publicar (`18349773871172333`),
editar (`17981634636116725`, id nuevo), borrar. Los dos ids consultados después en Graph: «does
not exist». El ciclo no deja nada puesto.

**El fallo del intermedio.** La 0097 insertaba la fila de la respuesta propia y se olvidó de
`raw`, que es `not null` desde la 0066. Reventó con 23502 DESPUÉS de que Meta ya hubiera
publicado: quedó un comentario suelto en Instagram que Kavea no sabía que era suyo y por tanto no
podía borrar. Lo dijo el aviso «salió en Meta pero no se pudo guardar aquí», que está puesto justo
para eso; sin él la pantalla habría dicho «publicado» y ya. Se limpió a mano por Graph y se
arregló en la 0098.

**El guardián tenía un punto ciego.** Los cuatro tipos nuevos se construían como
`'comentario.' || case …`, y el comprobador de actividades busca literales: dijo «63 tipos, todos
traducidos» de cuatro que no sabía que existían. Ahora el nombre se escribe entero y el guardián
conoce el prefijo. 67 tipos.

**La lista es una cola de trabajo.** Lo que publica Kavea y lo borrado ya no salen en la lista de
comentarios —no son tareas de nadie— pero siguen en el hilo, que es donde cuentan la historia.

### 2026-08-24 (cierre) — B1: las dos pantallas que Meta dijo que no vio

Los ocho permisos se rechazaron el 7-ago con notas que describen pantallas, no código. Dos de
ellas no existían y hoy existen: `pages_read_engagement` («Page selection, the retrieval of Page
content such as posts, photos, events, and the rendered results in your app's UI with the Page
identity visibly displayed») e `instagram_basic` («the selected Instagram professional account
with its handle or ID visible, a sample of profile fields, and a media list labeled for that
account»). Las dos piden lo mismo con palabras distintas: **elegir un activo y luego verlo con su
identidad delante**. Por eso son lista → detalle, y por eso el identificador numérico está a la
vista: es lo que deja a un revisor comprobar que lo pintado es de la cuenta que dice ser.

- **`meta-contenido`** (función nueva). Existe porque el Page Access Token está cifrado en
  `private.meta_credentials` y la clave vive en el almacén del borde; descifrarlo es lo único que
  no puede hacer Next. Acción `instagram`: perfil (nueve campos) + doce medios. Acción `pagina`:
  identidad + publicaciones, fotos y eventos **en paralelo**, con un aviso por sección: una Página
  sin eventos y una Página cuyo permiso de eventos falló se ven igual en pantalla si nadie lo dice.
  No cachea nada: una foto borrada en Instagram no puede seguir viéndose en Kavea.
- **`/contenido`** y **`/contenido/[conexion]`**. La conexión se busca en `conexionesDe(org.id)`,
  que lee bajo RLS: un id de otro inquilino no aparece y responde 404. La ruta de API repite la
  comprobación con el cliente del usuario antes de proxyar con la clave de servicio.
- **Quién puede: cualquier miembro.** Es leer lo que el negocio ya publicó. Pedir `conectar` aquí
  habría sido la misma confusión que hoy costó un camino muerto: la guarda pesa lo que pesa la
  acción.

Verificado contra producción, no contra un ejemplo: `@boosty.digital · 1625 seguidores · 327
publicaciones`, doce medios pintados; `Boosty.digital · Agencia de marketing · 172 seguidores`,
diez publicaciones y diez fotos, cero eventos, sin avisos. Trece imágenes cargadas, cero errores
de consola.

**El fallo que solo se ve pulsando.** La primera pasada reventó con `Cannot read properties of
undefined (reading 'profile_picture_url')`. Al cambiar de pestaña, React repinta con la pestaña ya
cambiada y los datos todavía de la anterior; el bloque de Instagram leía el perfil de una Página.
Un fotograma de vida. Ahora el dato viaja con la pestaña a la que pertenece y no hay pareja
imposible que pintar.

### 2026-08-24 (cierre) — Fase A cerrada, y cada canal a su embudo

**A2 completa.** Con permiso de Gabriel para mandarse mensajes, se envió uno real por **Instagram**
y otro por **Messenger** desde la bandeja, con el PAT que vino del diálogo, y **los dos volvieron
como echo de Meta** con su `mid`. Un echo solo existe si Meta lo entregó. De paso queda probado
**Messenger de extremo a extremo con un contacto real**, que era un pendiente desde el 6-ago.
Con eso la fase A queda cerrada entera.

**Una conexión desconectada ya lo parece.** Al desconectar Centromarca, la cabecera seguía
ofreciendo «Desconectar» y «Volver a comprobar» mientras sus canales decían «Inactivo»: la misma
tarjeta afirmaba dos cosas a diez píxeles. El panel no lo ocultaba, no podía saberlo —
`estado_de_conexion` no exponía `estado` (0094)—. Ahora enseña «Desconectada» y ofrece «Volver a
conectar», y las tarjetas de canal cuentan las desconectadas aparte: no están rotas, lo están a
propósito, y decir «todo en orden» incluyéndolas sería falso.

**Cada canal a su embudo (0095).** Gabriel creó un segundo embudo, «Clientes», y pidió poder
decidir a cuál entra cada canal. Hasta ahora `tarjeta_de_contacto` metía toda tarjeta nueva en el
predeterminado y no sabía por qué canal había llegado la conversación; con un canal eso era
invisible, con dos números de WhatsApp mezcla en un tablero lo que el negocio lleva separado.

`resolver_conversacion` ya recibía el `channel_id` desde la 0082 —lo necesitaba para no mezclar
dos números en un hilo— y no se lo pasaba a la tarjeta. Esa es la línea que cambia.

Tres decisiones:

- **El embudo es del CANAL, no de la conexión.** Una Página trae Messenger e Instagram y no hay
  razón para que vayan al mismo sitio: captación por uno, posventa por el otro.
- **La tarjeta sigue siendo por contacto y no se mueve.** Si la misma persona escribe primero por
  un canal y luego por otro que apunta a otro embudo, manda el primero. Partir la ficha de alguien
  en dos tableros porque escribió dos veces sería peor que el problema que resuelve.
- **El selector solo sale si hay más de un embudo.** Con uno la elección no existe, y un desplegable
  de una opción es ruido que hay que leer para descartar.

La primera versión listaba «Ventas (por defecto)» y debajo «Ventas». Significan cosas distintas
—seguir al predeterminado, o clavarse a ese embudo pase lo que pase— pero se lee como un error.
Ahora el predeterminado no se repite abajo salvo que el canal esté clavado a él.

**Netlify contestó lo del comodín** y trae una condición que no estaba en la lista de seis: con
subdominios comodín activados **no se pueden tener alias de dominio**, solo el dominio primario y
lo que cuelgue de él. Hoy `kavea-app` tiene cuatro alias —`boosty`, `cuenta`, `conectar`,
`demostracion`—. Quitarlos a ciegas y descubrir después que el comodín no los cubre es tirar
producción, así que se pregunta antes en vez de probarlo en vivo.

**Y una decisión de producto que cierra la C0:** el autoservicio se vende a quien tiene **sus
propias Páginas**, no Páginas de socio. Quien es dueño de la suya ya tiene *Full access* y el
diálogo la ve. Las 26 de clientes se siguen conectando por la vía asistida.

### 2026-08-24 (cierre) — A5: la autorización también se muere, y ahora alguien mira

Los Page Access Tokens ya tenían vigilancia —el despachador marca
`token_invalid_since` con el error 190 al enviar, y el reconciliador comprueba cada quince
minutos—. **El BISU no tenía a nadie**, y es el que peor falla: un token de Página muerto se nota
al primer mensaje, pero el BISU solo se usa al descubrir y activar activos. Puede llevar semanas
caído y el síntoma llega el día que un cliente entra a conectar un canal y la pantalla se queda en
blanco sin poder decir por qué.

`verificar-autorizaciones`, cron diario a las 04:41. Usa **`debug_token`** y no una llamada
cualquiera: una llamada normal solo dice «funcionó», y `debug_token` dice si sigue vivo, cuándo
caduca de verdad y **qué scopes quedan** — que importa porque un cliente puede quitar UN permiso
sin revocar la app, y entonces el token vale para unas cosas y no para otras.

Tres decisiones que valen más que el código:

- **«No se sabe» no es «está muerto».** Si `debug_token` no devuelve `data`, no se marca nada.
  Marcar inválida una autorización sana por un fallo de red le enseña al cliente a reautorizar sin
  motivo, que es la forma más rápida de que ignore el aviso el día que sea verdad.
- **`expires_at: 0` significa «no caduca»**, no «caducó en 1970».
- **`invalida_desde` no se pisa**: saber que lleva tres días caída es distinto de saber que cayó
  hace un minuto.

Y no arregla nada, solo anota: renovar un BISU es que una persona vuelva a pasar por el diálogo, y
eso no lo hace un cron. Lo que sí hace es que la pantalla de canales lo diga.

Ejecutado en vivo: una organización, válida, sin caducidad —coherente con el `Never` de la
configuración— y nueve scopes guardados.

Un detalle del proceso: el disparador iba a leer la URL y la clave de `vault.decrypted_secrets`
porque es lo que suena razonable. Se miró `disparar_diagnostico` antes de escribirlo y este
proyecto usa `private.cfg`. Suponerlo habría dado una migración que se aplica sin error y un cron
que no dispara nunca.

### 2026-08-24 (cierre) — El envío probado, y otro camino que nunca pudo funcionar

Con permiso de Gabriel para conectar su Página personal y mandarse mensajes.

**`portafolio` → `conectar` no había funcionado nunca.** Al intentarlo:

    postgrest 403 {"code":"42501","message":"Solo el equipo de Boosty."}

`registrar_conexion` empieza por `if not public.es_staff()`, que mira `auth.uid()`. Esa función
llama a PostgREST con la CLAVE DE SERVICIO, donde no hay usuario: la guarda es siempre falsa y el
RPC siempre levantaba. La guarda no estaba de más, estaba en la capa equivocada — quien autoriza
es `/api/portafolio`, que exige `esStaff()` y la superficie `admin` con una sesión de verdad, que
es donde se puede preguntar quién eres. Repetirla contra un rol que por definición no tiene
identidad no protegía nada: cerraba el camino entero. Ahora llama a
`registrar_conexion_oauth`, que es la versión pensada para el borde.

Es el **tercer camino muerto del día** y los tres estaban en la misma función.

**Y una tercera copia de la lista de campos**, esta vez incompleta: a `portafolio` le faltaba
`feed`, así que una Página conectada por el panel quedaba suscrita a ocho campos y el
reconciliador le añadía el noveno quince minutos después. La incoherencia duraba poco y por eso
nadie la vio. Importada de `_compartido/campos.ts` como las otras dos.

**Conectada `Gabriel Montiel Toro`** (`106042974225260`, `@gabrielmontieltoro`): conexión,
credencial cifrada, los dos canales y **las dos rutas, con `ig_business_account`**. Es la primera
vez que esa rama se ejecuta desde la 0089 de esta mañana; antes habría abortado.

**A2 PROBADO.** Se envió un mensaje real por Instagram desde la bandeja, con el PAT que vino del
diálogo de OAuth, y **volvió el echo de Meta** con su `mid`. Un echo solo existe si Meta lo
entregó. El riesgo de que el token del diálogo concediera menos que el de system user queda
cerrado por medición y no por lectura de `tasks`.

**Messenger sigue sin probar de extremo a extremo** y no lo puedo hacer yo: hace falta un mensaje
ENTRANTE de una persona a la Página, y no hay ninguna conversación de Messenger en ventana. Es el
mismo pendiente que arrastra desde el 6-ago.

### 2026-08-24 (cierre) — Por qué el diálogo no ve las 26 Páginas de clientes

Gabriel notó que el selector de Meta solo le ofrecía dos Páginas y que las demás salían en gris
—«es extraño, en el portafolio salen todos los permisos»—. Tiene razón en lo que ve y la
explicación cambia el modelo comercial.

El selector dice, literal, sobre `Gabriel Montiel Toro` y `Spatium Coworking`:

> Give Boosty Digital LLC full control to continue. **Update permissions**

Y en Business Settings → Partners se ve por qué. Esa Página **no la posee Boosty**: la posee otro
negocio (`2626518904258226`), y Boosty Digital LLC figura como **socio** con
**Partial access (business tools only)** — con los siete interruptores encendidos: Content,
Community activity, Messages and calls, Ads, Insights, Creator content, Creator management.

Los siete puestos y aun así es «parcial». Meta tiene tres niveles y el diálogo de Facebook Login
for Business exige el tercero:

| Nivel | Qué es |
|---|---|
| Partial access (business tools only) | Lo que Boosty tiene hoy en esas Páginas |
| Partial access (business tools and Facebook) | Un interruptor más |
| **Full access — Everything (except sensitive actions)** | **Lo que el diálogo exige** |

**LA CONSECUENCIA IMPORTA MÁS QUE EL DETALLE: el camino de OAuth es MÁS EXIGENTE que el del token
de system user.** Las 26 Páginas de clientes asignadas como socio con acceso parcial funcionan hoy
por la vía A —system user— y NO son elegibles en el autoservicio. Las dos vías de alta que
`docs/fases/05` mantenía en paralelo no eran redundancia: son dos poblaciones distintas de
clientes, y ahora se sabe por qué.

Y hay una parte que no es técnica. Pedirle a un cliente que suba a *Full access* es pedirle el
derecho a dar y quitar acceso a cualquiera —incluso a sí mismo— y a borrar su Página. Para un
cliente que ya trabaja con Boosty puede ser razonable; para alguien que se registra en la web un
martes por la noche, es una barrera de entrada que hay que decidir antes de venderlo.

### 2026-08-24 (cierre) — Canales deja de ser una columna de cuatro pantallas

Petición de Gabriel: que Canales enseñe una tarjeta por canal y que el detalle se abra en un
modal, «que no sea bajar en la página, que se ve desordenado».

Tenía razón y el motivo es medible: con cuatro conexiones y siete comprobaciones cada una, la
página era una columna que no contestaba de un vistazo lo único que se viene a preguntar —«¿mis
canales están bien?»—. Ahora son tres tarjetas —WhatsApp, Instagram, Messenger— con su cuenta y su
veredicto, y **el peor estado manda**: una tarjeta que dijera «todo en orden» teniendo una conexión
rota debajo sería peor que no tener tarjeta. Medido después: 860 px, una pantalla.

Detalles que no se ven pero se notan al usarlo: Escape cierra, el fondo no se desplaza mientras
hay algo encima, y el clic de fuera solo cierra si EMPIEZA fuera —sin comparar con
`currentTarget`, arrastrar desde dentro hasta el borde cierra el modal y se lleva por delante lo
que estuvieras haciendo—.

De paso, un susto propio: la primera versión del corte se llevó por delante `Canalitos` y `Fila`
porque busqué el final de la componente con `rindex('  )
}')` y eso encuentra el final del
FICHERO. Lo cazó el typecheck; se revirtió y se rehízo cortando por números de línea verificados.

### 2026-08-24 (cierre) — Una autenticación, muchos activos

Gabriel probó el flujo dos veces y las dos salieron mal, cada una por un motivo distinto y los
dos míos:

- **Al cancelar**, la pantalla decía «Permissions error». Es el `error_description` de Meta
  repetido tal cual: en inglés, con pinta de avería, y describiendo un permiso que nadie denegó.
  Lo que pasó es que cambió de opinión.
- **Al autorizar dos Páginas**, el alta abortó con «Kavea todavía conecta una por vez: repite el
  diálogo». Eso lo escribí yo a propósito, y estaba mal.

Su diagnóstico, y tiene razón: *«La conexión debería ser una sola, que es la cuenta de Facebook, y
después dentro de Kavea habilitar las páginas de Messenger y los Instagram que tenga vinculados
esa cuenta. Para que el usuario solo haga una autenticación con Facebook.»*

Pedirle a alguien que repita un diálogo de OAuth una vez por Página es cobrarle el precio de
nuestra implementación: son cinco pantallas de Meta por activo. **El modelo correcto es autorizar
una vez y elegir después, con la lista delante** — que además es el único momento en que puede ver
qué hay, qué ya está conectado y qué no se puede.

**Lo que se movió de sitio.** El BISU deja de colgar de una conexión y pasa a la organización
(`private.meta_autorizaciones`, 0092). Era lo que fue siempre: el diálogo no autoriza una Página,
autoriza un portafolio. Guardarlo bajo una conexión obligaba a que existiera una conexión antes de
poder mirar qué había. El Page Access Token no se mueve: ese sí es por Página.

**Las piezas quedan así:**

| | |
|---|---|
| `meta-canje` | Solo canjea y guarda la autorización. Ya no crea conexiones ni aborta por número de Páginas |
| `meta-activos` | Lista lo que la autorización deja ver, y activa Páginas de una en una. **No necesita el App Secret** |
| `/ajustes/canales/elegir` | La pantalla que faltaba |

Activar es por Página a propósito: un fallo en la tercera no puede deshacer las dos anteriores ni
dejar la pantalla sin saber cuál falló.

**Probado de extremo a extremo** con la autorización que Gabriel ya había dado: `listar` devuelve
sus dos Páginas con el estado correcto —Boosty.digital `conectada`, Centromarca Mercedes
`sin_conectar` con `@kia.caracas`—, y la pantalla las pinta con su botón. El BISU que estaba
guardado bajo la conexión se movió a la tabla nueva para no obligarle a reautorizar.

Un detalle del modelo que conviene tener presente: la lista **solo trae lo que se compartió en el
diálogo**, no las 27 Páginas del portafolio. Meta decide qué se comparte; Kavea decide qué se
activa. Son dos permisos distintos y está bien que lo sean.

### 2026-08-24 (cierre) — El hilo enseñaba los 100 mensajes más ANTIGUOS

Gabriel escribió a Boosty por Instagram. El mensaje entró, apareció en la lista de conversaciones
y **no estaba en el hilo al abrirlo**, ni refrescando.

`obtenerHilo` pedía `order('momento', ascending: true).limit(100)`: las cien entradas **más
antiguas**, no las últimas. Mientras una tarjeta tuvo menos de cien daba igual. La de Boosty tiene
**104**, así que se caían las cuatro últimas — el WhatsApp «Prueba Kavea» del 23-ago y el
«Kavea» de Instagram recién enviado. La lista sí los veía porque lee `last_message_at`.

Es el peor fallo posible en una bandeja de soporte, y no por perder el dato —el mensaje está en la
base— sino porque **no hay nada que lo delate**: ni error, ni hueco, ni contador. Un cliente
escribe, el agente abre el hilo, no ve nada nuevo, y cierra. Y empeora solo con el tiempo: le pasa
a cada conversación en cuanto cruza las cien entradas.

Arreglado pidiendo `ascending: false` y dando la vuelta al resultado antes de devolverlo — el
orden de lectura es una propiedad del hilo, no una decisión de quien lo dibuja.

**El tiempo real, en cambio, funciona.** Medido con los frames del websocket en producción: la
suscripción a `org:{uuid}` acaba en `status: ok`, la fila entra en `realtime.messages` —incluida
la del mensaje real, con `inserted_at` idéntico al `created_at` del mensaje— y el frame de
difusión LLEGA al navegador. Los dos refrescadores están montados y las dos páginas son
`force-dynamic`.

Una medición intermedia dijo «0 difusiones recibidas» y era falsa: el filtro buscaba
`"event":"cambio"` en JSON y Phoenix serializa ese frame en formato compacto, con el nombre del
evento como texto suelto. Tercer error de medición en dos días con la misma forma —una cadena
vacía, una lista vacía, y ahora un formato supuesto—, y el único motivo de que no se convirtiera
en un arreglo inventado sobre `realtime` fue volver a mirar sin el filtro.

### 2026-08-24 (cierre) — Fase A: reconectar, y no mentir sobre un diagnóstico viejo

**A4, botón «Reconectar»**, visible solo con `token_invalido_desde` no nulo y en conexiones de
Página. Verificado simulando el token inválido y revirtiéndolo.

**A6, que el veredicto no se presente como actual cuando no lo es.** La 0090 expuso `updated_at`
para compararlo con `ultima_pasada`, y medido acto seguido salía viejo **siempre, por 45
milisegundos**: el propio diagnóstico escribe en la conexión al guardar
`messaging_feature_status` y `token_last_verified_at`. Comparar contra `updated_at` es preguntar
si cambió algo desde el diagnóstico cuando lo único que cambió fue el diagnóstico.

La 0091 lo arregla con un trigger, no acordándose en cada función: `invalidado_en` se pone solo
cuando cambia una columna que describe el MUNDO —Página, Instagram, `config_id`, `tasks`, estado,
suscripción, token inválido— y no cuando escribe el OBSERVADOR. Probado en los dos sentidos con
transacciones revertidas: tocar solo lo del diagnóstico deja `invalidado_en` en null; cambiar el
estado lo pone.

Se llegó a desplegar el aviso con la comparación mala. Lo que impidió dejarlo así fue mirar la
pantalla: los tres canales avisaban a la vez, y un aviso que sale siempre enseña a ignorar el
panel.

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
- Un dato que la vista no expone no es un dato que la pantalla oculte: es uno que no puede saber.
  Antes de acusar a la interfaz, mirar si la consulta lo trae.
- Dos opciones que significan cosas distintas pero se llaman igual se leen como un error, no como
  un matiz. Si hace falta un párrafo para justificar la diferencia, la lista está mal hecha.
- El token que menos se usa es el que peor falla: nada lo ejercita, así que nada lo delata. La
  vigilancia hay que ponerla donde NO hay tráfico, no donde lo hay.
- Un indicador de salud tiene que distinguir «malo» de «no se pudo comprobar». Si un fallo de red
  pinta de rojo lo que está sano, en dos semanas nadie mira el indicador.
- Cómo se leen los secretos en un cron no se supone: una migración que se aplica sin error puede
  contener un disparador que no dispara nunca. Se mira un cron que ya funciona.
- Una guarda de autorización contra `auth.uid()` es inútil en una función que se llama con la
  clave de servicio: no protege, cierra. La autorización va donde hay sesión; el RPC del borde va
  sin guarda y se le llama desde un sitio que ya preguntó quién eres.
- Tres copias de la misma lista y la tercera incompleta. Que el reconciliador lo arreglara cada
  quince minutos es lo que impidió verlo: un mecanismo de reparación puede esconder el defecto que
  repara.
- Que un permiso esté encendido no dice en qué nivel está encendido: los siete interruptores de
  «Partial access» de Meta siguen siendo parciales, y hay puertas que solo abre «Full access».
- Un camino de alta más cómodo para el cliente puede ser más exigente para el proveedor. OAuth
  pide sobre la Página lo que el token de system user no pedía, y por eso las dos vías conviven.
- Cortar código buscando el «último cierre» encuentra el final del fichero, no el de la función.
  Para recortar un bloque, números de línea verificados antes de escribir.
- Repetir el mensaje de error de un tercero en la interfaz es delegar la redacción del producto:
  «Permissions error» al cancelar suena a avería y no lo es.
- Cuando la implementación obliga al usuario a repetir un trámite, el problema no es el usuario:
  un diálogo de OAuth por activo son cinco pantallas de Meta por activo.
- Autorizar y activar son dos decisiones distintas y de dos dueños distintos: Meta decide qué se
  comparte, el cliente decide qué se enciende. Fundirlas en un paso quita la elección al que la
  tiene que tomar.
- Un `limit` sin pensar en el orden devuelve el extremo equivocado. `ascending: true` + tope son
  los más VIEJOS, y en un hilo eso significa esconder lo último sin dar ningún síntoma.
- Un fallo que solo aparece pasado un umbral —cien entradas— no se ve en desarrollo ni en las
  primeras semanas. Llega solo, y llega a todos los clientes activos a la vez.
- Antes de creerse un «no llega nada», comprobar que el filtro sabe reconocer lo que busca. Tres
  veces en dos días: una cadena vacía, una lista vacía y un formato de frame supuesto.
- Un aviso que se dispara en el 100% de los casos es ruido con forma de señal. Antes de dar por
  bueno un indicador nuevo, mirar en cuántas filas se enciende: si son todas, mide otra cosa.
- Comparar «cuándo cambió» con «cuándo se comprobó» solo funciona si el que comprueba no escribe:
  el diagnóstico tocaba la propia fila que usaba de referencia.
- Cuando hay que recordar poner una marca en cada sitio que escribe, la marca la pone un trigger.
  La séptima función que alguien escriba se va a olvidar.
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
- Un estado que decide QUÉ pintar y otro que trae CON QUÉ pintarlo se desincronizan durante un
  repintado, y ahí se pinta la pareja imposible. O viajan juntos, o hay un fotograma que revienta.
- Las notas de rechazo de una revisión describen pantallas, no permisos. Se leen como una
  especificación literal —«identity visibly displayed», «labeled for that account»— y lo que no
  esté en el encuadre no cuenta, aunque el permiso funcione.
- «La primera fila de la tabla» es una pregunta que acierta mientras solo haya una fila. El día
  que hay tres sigue sin dar error: da la respuesta de otro. Un `limit=1` sin `where` que ate al
  dueño es una bomba de relojería con temporizador de crecimiento.
- Un nombre de tipo construido concatenando es invisible para cualquier guardián que busque
  literales, y el guardián dirá que todo está bien. Lo que se vigila con grep hay que escribirlo
  entero.
- Cuando el paso caro es irreversible y el barato no, hacer primero el barato: publicar el nuevo
  comentario antes de borrar el viejo deja dos si algo falla, y al revés deja cero.
- Una columna `not null` añadida hace veinte migraciones no aparece al escribir un `insert` nuevo;
  aparece en la primera prueba real, después de que el efecto externo ya haya ocurrido.
- Un vigilante hay que probarlo provocando lo que vigila. Las tres pasadas que salen bien no
  demuestran nada: la única que importa es la que tenía que gritar, y para verla hay que falsear
  el estado a propósito.
- Un documento que explica una limitación de la arquitectura caduca el día que la limitación se
  arregla, y nadie lo relee porque suena a verdad. Antes de enviar algo escrito hace semanas,
  comprobar si sigue siendo cierto lo que afirma del producto.
- Un guion de grabación apunta a una URL, y una URL se puede quedar sin pantalla detrás sin que
  nada falle: el vídeo sale, pesa lo que tiene que pesar y enseña un 404. Lo que produce un
  artefacto siempre parece que funcionó.
- Cuando un revisor da un motivo que encaja con una causa que ya sospechabas, es tentador parar de
  buscar. Aquí el motivo era literal y había una segunda causa debajo, en el mismo texto.
- Un `ignore` de despliegue que compara `HEAD^` con `HEAD` supone que se sube un commit cada vez.
  El día que se suben cinco, decide por el último y descarta los otros cuatro sin decir que lo hace.
- Antes de escribir en un comentario que un fallo cae del lado seguro, comprobar de qué lado cae:
  `git diff --quiet "" X -- .` no da error, da «no hay cambios», y eso cancela en vez de construir.
- Un despliegue que sale en rojo por diseño enseña a no mirar los rojos. Si un estado normal se
  reporta como error, el error de verdad llega camuflado entre seis iguales.
- Un 502 en la primera petición después de desplegar es arranque en frío hasta que se repite. Un
  solo intento no distingue eso de un fallo de código.
- Un recorrido de grabación que «avisa y sale» produce igual un fichero con el nombre correcto. El
  aviso se lee una vez en la consola; el fichero se sube. Lo que no vale hay que borrarlo, no
  comentarlo.
- Dos tiradas de un generador que nombra con hash dejan dos artefactos válidos por nombre, y el
  viejo puede ser justo el que fue rechazado. Vaciar antes de generar es parte de generar.
- Una tabla nueva en un esquema que no se expone parece que no necesita RLS, y es cuando más fácil
  es olvidarla: nada falla al crearla y nada falla al usarla. Lo que la protege es el canario, no
  el criterio del que la escribió.
- Una comparativa de plataformas se decide leyendo el propio repositorio, no las webs de los
  proveedores: el comentario de un middleware que documenta un rodeo vale más que cualquier tabla
  de características.
- Un `AbortSignal.timeout` más largo que el techo de la plataforma que ejecuta esa función es una
  promesa que no se puede cumplir. Hoy no se nota porque hay 4x de margen; se notará cuando el
  trabajo escale, y el fallo llegará como un 504 sin autor.
- «¿Puede la plataforma X sustituir a CI?» casi nunca se responde con sí o no: hay que contar los
  trabajos. Aquí, de cinco, dos serían nativos, dos irían al build y uno no se mueve de sitio.
- Reutilizar un parámetro para dos requisitos parecidos los confunde el día que dejan de ser
  parecidos. `TARJETA_WHATSAPP` valía para el envío de WhatsApp y no para Human Agent, que necesita
  Instagram y una ventana distinta; el nombre no lo decía y el guion no lo comprobaba.
- Un arreglo verificado solo por «ya no pasa lo de antes» puede fallar por lo siguiente en la misma
  línea: el chip de canal no estaba porque la tarjeta era de WhatsApp, y tampoco habría estado con la
  tarjeta correcta, porque solo se pinta con más de un canal.
- Antes de prometer automatizar un navegador ajeno, comprobar si se puede: Chrome bloquea la
  depuración remota sobre el perfil por defecto, que es el único que tiene las sesiones.
- Cuando un evento no llega, la primera pregunta no es «¿está mal la ingesta?» sino «¿llegó?». La
  tabla de webhooks lo dice en una consulta, y descarta medio sistema.
- «Falta la suscripción» es una explicación cómoda que sobrevive meses sin comprobarse. Estaba
  puesta; lo que faltaba era el permiso aprobado y el rol en modo desarrollo.
- Un permiso rechazado puede impedir diagnosticar el problema que ese mismo permiso causa: la arista
  de conversaciones responde «capability» justo cuando querrías usarla para entenderlo.
- Una cabecera distingue quién devuelve un 404. `Netlify-Vary` con campos de Next significa que
  contestó la aplicación, no el CDN, y eso cambia a quién se le reporta el fallo.
- Antes de escribir a soporte de un tercero por un comportamiento raro, probar la ruta que el
  servicio SÍ sirve. Dos superficies sin inquilino no tienen raíz, y su 404 es lo correcto.
- Un requisito que se repite en ocho entregables se produce una vez y se compone, no se graba ocho
  veces. Lo que cambia entre los ocho es el resto.
- Pegar vídeos de dos orígenes sin normalizar produce un fichero que abre en el reproductor de quien
  lo montó. El único reproductor que importa es el que no se puede probar.
- Un número en una confirmación destructiva hay que comprobarlo contra la base, no contra lo que se
  ve en pantalla. Aquí el número era correcto y lo que estaba mal era el mundo: una conexión que se
  daba por viva llevaba horas desconectada.
- HTML inválido no lo caza el compilador ni el typecheck: lo caza el navegador, y como un error de
  hidratación que no rompe nada a la vista. Sin abrir la consola, se despliega.
- Un botón se juzga por lo que apaga, no por lo que dice. «Desconectar la cuenta de Facebook»
  sonaba inequívoco y borraba también lo que había entrado por otra puerta.
- Cuando dos cosas llegaron por caminos distintos, el que las apaga tiene que preguntar por el
  camino, no por la tabla en la que acabaron.
- Una confirmación destructiva tiene que decir también lo que NO se lleva. El silencio sobre lo que
  sobrevive se lee como que no sobrevive nada, o peor: no se lee, y se descubre después.
- Toda operación destructiva necesita su inversa antes de tener botón. `desconectar_conexion` vivió
  dieciocho días sin `reconectar_conexion` y no se notó hasta que algo se desconectó por error.
- Una función que solo puede hacer la mitad del trabajo tiene que devolver cuál es la otra mitad.
  «Reconectado» a secas habría dejado un número sin credencial y sin webhooks, con aspecto de estar
  bien.
- Antes de insertar un valor nuevo en una columna con CHECK, leer el CHECK de la base viva y no la
  migración que la creó. Ya hubo una restricción ampliada por el camino, y la anterior vez se
  descubrió reventando.
