# Kavea — Bitácora

Registro comprimido de lo ejecutado y lo pendiente. Una entrada por hito real, sin narrativa:
si algo no cambia una fila de la tabla de estado o una línea de pendientes, no entra aquí. El
detalle largo de cómo se investigó cada cosa, si hace falta reconstruirlo, está en el historial
de git de este mismo archivo.

**Regla:** solo entra lo comprobado, con la evidencia al lado. Lo planificado vive en
`docs/fases/`, lo pendiente en la sección 2.

**Y se compacta.** El 24-ago este archivo llegó a **veintinueve entradas de un solo día** y 1.802
líneas: eso no es un registro comprimido, es un diario. Se fundieron en seis por tema y el archivo
bajó a la mitad. Cuando un día vuelva a dejar más de tres o cuatro entradas, toca fundirlas: lo que
se pierde al resumir está en el historial de git de este mismo archivo, y lo que se gana es que
alguien lo lea entero.

---

## 1. Estado actual — al 24-ago-2026

| Pieza | Estado | Evidencia |
|---|---|---|
| Sitio público `kavea.ai` | ✅ Producción, con `/demo` | Formulario probado de extremo a extremo |
| Páginas legales | ✅ Publicadas | Rastreables por Meta |
| App de Meta | ✅ Creada, dev mode | `compliant`, cero violaciones |
| DNS en Netlify | ✅ Delegada | SOA `dns1.p01.nsone.net` en 7 resolvedores |
| Esquema de base de datos | ✅ **108** migraciones aplicadas y registradas | Contado en `public.schema_migrations` el 24-ago |
| Bandeja de correo interna | ✅ `/admin/correos` | RPC y bucket verificados |
| Aislamiento entre tenants | ✅ 61/61 comprobaciones · 10/10 canarios | C8, C9 y C10 el 23-ago. C1 cazó `private.revision_permisos` sin RLS el 24-ago (0100) |
| Ingesta y normalización | ✅ Producción | **12** crones vivos (contados en `cron.job` el 24-ago), mensajes reales entrando |
| Bandeja, tarjetas, embudos, ficha, agenda, reparto | ✅ Producción | Un contacto con varios canales en una tarjeta |
| Envío por Instagram | ✅ Texto, imagen, GIF, corazón | Echo en ≤6 s, contacto confirmando |
| Envío por Messenger | ✅ Probado el 6-ago | `messaging_type: RESPONSE`, id de Meta, sin error |
| WhatsApp — `+1 321-393-1397` | ✅ Cloud API directo, el 23-ago | Ciclo completo: entrante en la bandeja y saliente `enviado` con `wamid` de Meta |
| WhatsApp — `+1 829-954-3803` | ✅ Retirado el 23-ago | Conexión `disconnected`, canal apagado, webhooks dados de baja en Meta |
| Un hilo por número | ✅ Desde la 0082 | La tarjeta une los canales; el hilo ya no |
| Pausar y desconectar un canal | ✅ Desde Ajustes → Canales | 0079; el borde da de baja los webhooks en Meta |
| Plantillas de utilidad de Messenger | ✅ Leer y crear en vivo contra Meta | No se espejan en Postgres |
| Comentarios | ✅ **Ciclo de moderación completo** | Publicar, editar, ocultar y borrar desde el hilo (0097/0098). Probado contra Instagram real el 24-ago: los dos ids consultados después en Graph dan «does not exist». El webhook de `comments` sigue sin llegar —modo desarrollo y permiso rechazado, no falta de suscripción—, así que la lectura por API corre **cada tres minutos** y difunde a la pantalla (0108) |
| Callback de desautorización | ✅ Desplegado **y pegado** en el panel | Confirmado el 23-ago en Facebook Login for Business → Settings |
| Callback de borrado de datos | ✅ Guardado | Recarga del panel a las 20:59 del 23-ago: el campo persiste. No hay forma de verificarlo por API (`data_deletion_url` no es campo de Graph), a diferencia de `deauth_callback_url`, que sí |
| Contenido de Página e Instagram | ✅ `/contenido`, desde el 24-ago | Lista → detalle con la identidad delante. Verificado contra producción: `@boosty.digital` 1625 seguidores / 327 publicaciones con 12 medios, y `Boosty.digital` 172 seguidores con 10 posts y 10 fotos |
| Token de una conexión | ✅ Se resuelve por su dueño | La credencial cifrada de la conexión primero, y solo si Meta la rechaza por permiso se deriva del portafolio, avisando. El ciclo de moderación salió `via: conexion`, así que un cliente de autoservicio también podrá moderar |
| Envío fuera de la ventana | ✅ Solo por plantilla, y solo WhatsApp | `ventana_de` cierra WhatsApp a las 24 h (0106): allí no existe HUMAN_AGENT. Messenger e Instagram conservan su prórroga de 7 días |
| Guarda de tipos en las funciones de borde | ✅ `deno check` en CI desde el 24-ago | `supabase functions deploy` no comprueba tipos. Las 23 funciones compilan |
| Vigilancia de trabajos periódicos | ✅ Latidos + aviso por correo | `private.latidos` (0108). Una función que deja de EJECUTARSE no puede avisar: solo se detecta echándola de menos |
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
| Plantillas de WhatsApp | ✅ **Leer, crear y ENVIAR**, contra la WABA | Categoría, idioma, cabecera —texto, imagen, vídeo o PDF—, cuerpo, pie y hasta diez botones. Envío probado el 24-ago: `hello_world` entregada con `wamid` fuera de la ventana de 24 h. Editar y categoría de autenticación, el 25-ago. La WABA nueva solo tiene `hello_world`: las 25 aprobadas se quedaron en la que se retiró |
| Página de Boosty (`1790677317841377`) | ✅ Conectada por el **portafolio**, no por el diálogo | `config_id 1721663745727123`, `tasks` con `MESSAGING`, PAT rotado y **primer BISU de la base**. V1–V7 en verde salvo V6 |
| Facebook Login for Business | ✅ **Estrenado el 24-ago** | Un canje real completo de extremo a extremo: diálogo, código, BISU cifrado, webhooks suscritos y rediagnóstico. Falta hacerlo desde un portafolio que no sea el de Boosty |
| Permisos de la app, por API | ✅ 5 `live` | `business_management`, `pages_show_list`, `public_profile`, `whatsapp_business_management`, `whatsapp_business_messaging` |
| Embedded Signup de WhatsApp | 🟡 Desbloqueado, sin construir | Tech Provider (4-ago), permisos de WhatsApp (7-ago) y negocio `verified`. El token tiene `manage_app_solution`; `/{app}/whatsapp_business_solutions` existe y devuelve `[]` |
| Agentes (fase 6) | ⏸ Aparcada | Sin `ANTHROPIC_API_KEY` |
| CI de GitHub Actions | 🟡 Restaurada abriendo el repositorio | Se agotaron los 3.000 minutos del plan; Gabriel puso `Boosty-Hub/kavea` en **público** el 24-ago para recuperar minutos gratis |
| Repositorio | 🟡 `Boosty-Hub/kavea`, **público desde el 24-ago** | Se abrió para recuperar minutos de Actions; el plan es volver a cerrarlo. Historial auditado: cero credenciales en los 150 commits. Sí quedan expuestos nombres de clientes reales y 27 identificadores de activos de Meta, y Gabriel decidió dejarlos |
| Comodín `*.kavea.ai` | ✅ **Activo desde el 24-ago** | Ticket #1097522 cerrado. Se borraron los cuatro alias y Netlify habilitó el comodín. `cualquiercosa.kavea.ai` responde, así que un inquilino nuevo ya no necesita una llamada a la API por alta ni esperar propagación. `www` sigue en el sitio público |

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
- **Rehacer las plantillas de WhatsApp aprobadas.** La WABA nueva `2459716937850832` solo tiene
  `hello_world`; las 25 se quedaron en la que se retiró. Ya se pueden crear desde Kavea.
- **Editar una plantilla ya aprobada** y **el formulario propio de la categoría Autenticación**, que
  tiene componentes que el genérico no monta —botón de copiar código, caducidad—.
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

### 2026-08-25 — «Faltan datos: tarjeta.valor, contacto.nombre» señalaba a algo que no se podía tocar

Dos fallos en una sola frase, y el segundo era el grave.

**No había forma de poner el nombre de una persona.** La ficha edita los campos que la organización
define en Ajustes → Campos, pero `contacts.nombre` no es uno de ellos: es una columna que escribe
Meta cuando Meta la da, y Messenger no siempre la da. Cuando no la daba, la persona se quedaba
«Contacto sin nombre» **para siempre**, y cualquier plantilla que saludara por el nombre se negaba a
salir apuntando a un dato que no existía ninguna pantalla para escribir. Meses así, y nadie lo notó
hasta que una plantilla lo pidió.

La 0113 añade `renombrar_contacto` —guarda de miembro, no de administrador: poner el nombre de quien
escribe es trabajo de quien atiende— y la ficha estrena un bloque «La persona» con el campo Nombre,
encima de los canales. Guarda al salir del foco o con Enter, y la base no escribe si no cambió,
porque cada guardado deja una línea en el hilo. Vacío BORRA en vez de guardar cadena vacía: un
nombre en blanco haría que la ficha dijera que hay nombre y la plantilla siguiera sin poder
rellenarlo.

**Y el mensaje daba la clave interna.** «tarjeta.valor» no está escrito en ninguna parte de la
interfaz; lo que se lee en la ficha es «Valor (USD)». El operador tenía que adivinar la
correspondencia. Ahora el error se traduce con `variables_disponibles` —la misma lista que alimenta
el selector de campos al crear una plantilla, así que la traducción no hay que inventarla— y añade
**dónde** se rellena cada uno:

    Para mandar esta plantilla falta rellenar: Valor del asunto (en la ficha, bloque Embudo);
    Nombre de la persona (en la ficha, arriba, junto a los canales)

Saber que falta «Valor del asunto» sin saber en qué bloque vive es la mitad de la respuesta.

**Comprobado en pantalla:** el campo aparece vacío, el error nombra la etiqueta y el sitio, y
escribir el nombre lo guarda. El valor de prueba se revirtió: no se dejan datos inventados en
producción.

Lo que sigue **sin comprobar** es el envío real por Messenger de punta a punta. Requiere mandar un
mensaje de verdad a un contacto de verdad, y eso no se hace por probar sin pedirlo.

### 2026-08-25 — Un solo menú de plantillas, y la regla que sobraba

«Esta conversación se supone que es de Messenger y no salen las plantillas de Messenger». Era una
conversación de Messenger con la ventana **abierta**, 9 h, y mi regla decía que las de Meta solo se
ofrecen fuera de la ventana. La regla protegía de un cargo evitable —dentro de las 24 h el texto
normal hace lo mismo y es gratis— pero **escondía la función en vez de explicarla**, y el operador
se quedaba mirando una pantalla que no dice por qué no está lo que busca.

Se cambia por lo que debió ser desde el principio: **se ofrecen siempre, y dentro de la ventana se
pregunta con el coste escrito.** Esconder una opción obliga a adivinar; preguntar informa. El cargo
sigue sin poder salir de un solo clic.

**Y el manejo entero era el problema, no solo la regla.** Había DOS sitios para lo mismo: un
`<select>` en el pie del compositor para las internas y un bloque de cuatro filas para las de Meta
que solo aparecía fuera de la ventana. Dos sitios, dos reglas, y el de Meta nadie lo había visto
porque a una conversación cerrada no se llega por casualidad.

Ahora es **un menú**, con dos grupos y una cabecera que dice qué hace cada uno: «se insertan en la
caja» y «se envían enteras · Messenger». No es un matiz de redacción: una se puede corregir antes de
mandarla y la otra sale tal cual.

Se abre de dos maneras y las dos dan la misma lista: escribiendo `/` en la caja, o con un botón
—icono y número— en la línea que ya dice por dónde se responde, encima del campo. El `<select>` del
pie desapareció: **una fila entera del compositor** para una lista que se abre dos veces al día, en
la pantalla donde el sitio se le debe al hilo.

Detalles que no se ven y sin los cuales no funciona:

- La cabecera de grupo se pinta al cambiar de clase dentro de UNA lista, no con dos listas: con dos,
  el índice del teclado se parte en dos y las flechas dejan de recorrer el menú entero.
- Cerrar al pulsar fuera hizo falta al añadir el botón. El menú del comando se cierra con el `blur`
  de la caja; el del botón se abre sin tocarla, así que no hay `blur` que llegue. Y con la ventana
  cerrada la caja está **deshabilitada**: ni foco ni Escape, así que sin esto no había forma de
  cerrarlo.
- El oyente escucha `mousedown`, que es el mismo momento en que actúan los botones del menú. Con
  `click` el cierre llegaba antes de que se eligiera nada.
- La referencia del «dentro» va en el compositor entero: el botón y el menú son hermanos, y con la
  referencia en uno solo, pulsar el otro contaba como fuera.

Y el marcador de la caja hace de guía en los dos estados: «escribe / para una plantilla» cuando se
puede escribir, «usa Plantillas, arriba» cuando la ventana está cerrada y la caja no sirve.

**Comprobado con Playwright** en las dos situaciones: en la de Messenger abierta el botón dice
«Plantillas 2», el menú trae los dos grupos, y pulsar `pedido_devuelto` abre la confirmación con el
coste. En la de WhatsApp cerrada la caja sale deshabilitada, el botón sigue vivo, el menú ofrece
`hello_world`, y pulsar fuera lo cierra.

### 2026-08-25 — «No veo cómo poner las plantillas en la conversación»

Y era verdad: no había por dónde verlo. El bloque de plantilla de Meta solo aparece con la ventana
cerrada —que es correcto, dentro de las 24 h el texto libre es gratis y una plantilla se factura—,
así que en una conversación abierta no hay nada que sugiera que existe. Un botón que solo aparece
cuando hace falta es buen diseño; un botón que **nunca se ha visto** no se sabe que existe.

**Tres cosas, y ninguna cambia la regla de cuándo se puede enviar.**

**El comando `/`.** Se escribe una barra en la caja y se abre la lista de plantillas internas,
filtrando al teclear; flechas para moverse, Enter o Tab para insertar, Escape para cerrar. El texto
lo resuelve `renderizar_plantilla` en la base —la misma función que el desplegable— porque resolver
las variables en el cliente sería una segunda implementación de lo mismo.

Detalles que no se ven pero deciden si funciona:

- La barra cuenta como comando **solo al principio o tras un espacio**. En `http://algo/otro` hay
  tres barras y ninguna lo es; abrir el menú ahí sería pelearse con quien pega un enlace.
- Con el menú abierto **el teclado es del menú**. Sin eso, Enter enviaría el mensaje con el
  `/segui` a medias dentro, que es justo lo que el menú venía a evitar.
- Se recalcula también en `keyup` de las flechas: mover el cursor puede crear o deshacer un comando
  sin que haya ningún `change`.
- El clic va en `onMouseDown`, no en `onClick`: el `blur` de la caja llega antes que el `click` y
  cerraba el menú, así que el clic caía sobre un elemento que ya no existía.
- **Solo lista las internas.** Las de Meta no se insertan, se envían enteras y se facturan: ponerlas
  a un `/` y un Enter de distancia sería un cargo a un pulso de teclado.

**El marcador de la caja lo dice:** «Responder por Messenger · Boosty.digital · escribe / para una
plantilla». Es el único sitio donde se mira antes de escribir.

**Y el aviso de «lista para usar» dice ahora DÓNDE.** Decía «ya se puede elegir en el compositor»,
que es cierto y no ayuda. Ahora dice que aparece dentro de la conversación, encima de la caja,
cuando pasan 24 horas del último mensaje del contacto.

**Verificado con Playwright**, no leído: el menú abre con «Hola, /», ofrece `Seguimiento
/seguimiento`, y Enter deja en la caja el texto con las variables resueltas —«Hola Gabriel Montiel
Toro… El presupuesto sigue en 2400 USD y estamos en Interesado»— con `{{tarjeta.titulo}}` sin
rellenar y el aviso de hueco pendiente debajo, que es lo que debe pasar. En la de WhatsApp con la
ventana cerrada el bloque sale con `hello_world` y la caja deshabilitada.

Lo de Messenger no se puede ver todavía: su única conversación tiene la ventana abierta (14 h). Sí
está comprobado que `pedido_devuelto` viaja en la carga de esa página, así que lo único sin probar
es el booleano que decide pintarlo.

### 2026-08-25 — Una plantilla de la Página ya se puede mandar, y la fila dice por dónde va

`pages_utility_messaging` pide tres cosas y Kavea cubría dos: crear la plantilla de utilidad de la
Página y rellenar sus variables. Faltaba la tercera —mandarla y verla llegar— porque el carril de
plantilla vivía entero dentro de la rama de WhatsApp del despachador.

**Se sondeó la vía antes de escribir una línea.** `POST /{page-id}/messages` con `messaging_type`
en UTILITY y `message.template`, con un destinatario inválido a propósito: Meta se queja del
DESTINATARIO y no de la forma. Es cómo se comprueba que una forma se acepta sin mandarle nada a
nadie, y se repitió al final con el payload exacto que monta el código, parámetros con nombre
incluidos.

**Lo que se construyó, en la 0112:** vincular pasó a `private.vincular_plantilla_meta` con dos
envoltorios públicos —eran dos copias de cincuenta líneas a punto de nacer, y la segunda copia se
separa en el primer arreglo que se haga solo en una—; `plantillas_messenger_usables`;
`parametros_de_plantilla` y `texto_de_plantilla` aceptando los dos canales; y `encolar_plantilla`
generalizado. Lo único que cambia por canal son tres cosas: de qué columna sale la partición
—número o Página—, de qué identidad sale el destinatario, y si lleva `messaging_type`. En WhatsApp
no se manda; en Messenger es UTILITY.

Hubo que **relajar tres restricciones** de `plantillas`: `tipo_check` no admitía `messenger`, y
`estado_coherente` decía «solo las de WhatsApp pueden no estar en borrador», que era cierto cuando
WhatsApp era el único canal con aprobación de Meta.

En el despachador, la plantilla se monta ahora en **una sola función** para los dos canales. Eran
la misma forma por dentro y lo que cambia es dónde se cuelga: en WhatsApp en la raíz, en Messenger
dentro de `message`.

**Cuándo se ofrece, que no es igual en los dos.** WhatsApp: solo con la ventana cerrada, porque
dentro de las 24 h el texto libre es gratis y una plantilla se factura. Messenger: en cuanto la
ventana deja de estar abierta, porque ahí ya no hay texto libre gratis —entre las 24 h y los 7 días
existe la prórroga humana, pero exige que conteste una persona por un motivo real, y un aviso de
utilidad no es eso—.

**Lo que NO está verificado y hay que decirlo:** no se ha entregado un mensaje real. La única
conversación de Messenger tiene la ventana abierta (13 h), y mandar una plantilla no solicitada a
un contacto de verdad para probar no es algo que se haga sin pedirlo. Verificado: que la Página y
el PSID se resuelven, que la plantilla se vincula y aparece en `plantillas_messenger_usables`, y
que Meta acepta el payload. Lo que falta es pulsar el botón con la ventana cerrada.

### Y los logos de canal en la lista

La fila llevaba un punto de color más la etiqueta en texto. El color solo distingue si ya sabes qué
color es cada canal, y la etiqueta hay que leerla: en una lista de veinte filas nadie lee veinte
etiquetas.

Se dibujaron primero unos iconos genéricos —auricular, rayo, cámara— razonando que redibujar de
memoria una marca registrada sale mal. **Era la respuesta equivocada a la pregunta correcta:** las
marcas de verdad YA ESTABAN en el repositorio, en `ajustes/canales/logos.tsx`, usadas por Canales y
por Contenido desde hacía semanas. Dibujar unas segundas fue crear dos juegos de logos para los
mismos tres canales, y el nuevo peor. Lo dijo Gabriel en una frase: «así como está en canales».

El fichero se movió a `lib/logos-canal.tsx` —ya lo importaban tres pantallas por ruta relativa
subiendo dos carpetas, y con la bandeja son cuatro— y ahora las marcas salen en los cinco sitios
donde antes había un punto de color: la lista ancha, la lista estrecha, la píldora del hilo, el
selector de canal del compositor y los canales de la ficha. Heredan `currentColor`, así que basta
teñir el envoltorio con el token del canal.

**Donde más se nota es en la lista estrecha**, la que queda al abrir un hilo: ahí el canal se
pintaba como un punto pelado SIN etiqueta, que solo dice algo si te sabes los tres colores de
memoria. El logo ocupa lo mismo y se reconoce sin leer. La etiqueta sigue en el `title`.

Los puntos que se quedan son los de ESTADO —nueva, esperando, cerrada—, que no tienen marca que
poner y sí llevan su etiqueta al lado.

### 2026-08-25 — Los acentos llevaban días codificados dos veces y nadie lo había mirado

Buscando por qué no salían las plantillas en una conversación, la propia pantalla enseñaba otra
cosa: **«Pasaron 24 horas desde su Ãºltimo mensaje»**. En el compositor, en producción.

Los bytes guardados eran `ÃÂº` donde debía haber `Ãº`: cada byte del acento
se había codificado como UTF-8 otra vez. La causa está en una línea del script de migraciones:

    $sql = Get-Content $f.FullName -Raw        # sin -Encoding UTF8

Sin `-Encoding UTF8`, `Get-Content` usa el juego de caracteres del sistema cuando el script corre
con `powershell` (5.1) en vez de `pwsh` — **y en esta máquina no hay `pwsh`**. El fichero ya avisaba
de este riesgo en un comentario, pero el comentario cubría la conversión del *cuerpo* de la petición,
no la *lectura* del fichero. Se arregló la mitad del problema y se documentó como si fuera entero.

**Alcance, medido y no estimado:** trece funciones —`ventana_de`, `encolar_plantilla`,
`moderar_comentario`, `desautorizar_meta`, `reconectar_conexion`, `archivar_conexion`,
`avisar_bandeja`, `anotar_moderacion`, `anotar_respuesta`, `anotar_revision`,
`organizaciones_con_autorizacion`, `parametros_de_plantilla`, `vincular_plantilla_whatsapp`— y
**una sola fila de datos** en todo el esquema: `outbound_messages.error_mensaje`. Se barrieron
todas las columnas de texto y jsonb de `public` para saberlo.

**No se reparó con `convert_from(convert_to(x,'LATIN1'),'UTF8')`,** que es el arreglo de manual.
Se intentó y falló: `character with byte sequence 0xe2 0x80 0x9c has no equivalent in LATIN1`. La
corrupción era **parcial** —había comillas tipográficas sanas en las mismas funciones— y una
conversión global habría roto lo que estaba bien. Se reaplicó cada función desde su última
migración, que en el repositorio está correcta. El extractor de rangos costó tres intentos: se
comía el cuerpo de las que no tienen `grant` propio, y cortaba a la mitad un `grant` de dos líneas
—lo que producía «syntax error at or near create» en la función *siguiente*, señalando al sitio
equivocado.

### La misma pantalla enseñaba un segundo fallo: «Sin contenido»

Una plantilla enviada aparecía en el hilo como una burbuja vacía. La actividad de al lado sí decía
«envió la plantilla hello_world», así que el dato existía: `linea_tiempo` pintaba
`o.cuerpo->>'texto'`, y una plantilla no guarda texto —guarda el nombre y los valores, porque la
frase la monta Meta—.

La 0111 lo recompone al leer con `private.texto_de_plantilla`, **no al encolar**: guardar la frase
ya montada crearía una segunda versión que envejece, porque la plantilla se puede editar en Meta y
lo que el cliente recibe cambia. Y la burbuja dice ahora de qué plantilla salió, que el operador
necesita saber: cada envío fuera de las 24 horas se factura y no todas dicen lo mismo.

### Y la respuesta a la pregunta de partida

Las plantillas no salían porque **no tenían por qué salir**. Son tres familias y el compositor las
trata distinto:

| | Dónde vive | Cuándo se ofrece |
|---|---|---|
| **Internas** | En Kavea, sin aprobación | Siempre; se insertan como texto en la caja |
| **WhatsApp** | En la WABA, las aprueba Meta | Solo con la ventana **cerrada**, y solo si se pulsó «Dejar lista para usar» |
| **Messenger** | En la Página, las aprueba Meta | **Nunca**: no hay carril de envío |

La conversación donde se buscaba era de Messenger y con la ventana abierta —11 h—, así que fallaban
dos de las tres condiciones. Y el desplegable que sí aparecía era el de respuestas rápidas
internas, que es otra cosa.

Lo de «solo con la ventana cerrada» es deliberado y está escrito en el propio compositor: ofrecer
una plantilla dentro de la ventana empuja a un envío facturado por conversación que se podía haber
hecho con texto normal y gratis.

### 2026-08-25 — Los ocho montajes, y el punto flojo que queda a la vista

`plantilla.mp4` era la última toma que faltaba, y llegó en dos piezas: las plantillas de la Página
en Messenger —lo que el permiso pide— y las de WhatsApp, grabadas antes.

Se unieron en ese orden, Messenger primero, porque el permiso que se revisa es de Página y lo
primero que ve el revisor debe ser aquello por lo que está mirando. Entre las dos mitades va un
**rótulo de dos segundos y medio**: sin él la superficie cambia de Messenger a WhatsApp Manager sin
que nada lo explique, y una pregunta sin contestar en un vídeo de App Review se contesta sola y
mal.

De aire muerto se fueron **126 s de 257** entre las dos tomas. La de Messenger se recortó con un
margen mayor —tres segundos por parada en vez de 1,6— porque sus paradas son justo las pantallas
que hay que leer: la lista con los estados y la plantilla recién creada. Recortar por recortar
habría tirado la prueba.

Con eso los **ocho montajes están hechos**. `pages_utility_messaging` sale de 318 s.

**Y el punto flojo, dicho en voz alta:** su nota pide tres cosas y el vídeo cubre dos. Falta
*«sending the message to a test recipient and showing the delivered template message in the native
client»*, porque el carril de plantilla de `despachar` está entero dentro de
`if (canal === 'whatsapp')`. La vía para Messenger existe y se sondeó
—`POST /{page-id}/messages` con `messaging_type: 'UTILITY'`— pero no está construida. Se manda
sabiendo esto, no por no haberlo mirado.

Tres cosas más que salieron de las grabaciones, sin buscarlas:

- El aviso nuevo del borde **quedó grabado funcionando**: se inserta la variable al final, salta
  «El cuerpo no puede TERMINAR en una variable», se sigue la frase y Meta la aprueba. Es mejor
  material que una pantalla sin errores: se ve el producto guiando.
- Las plantillas de la Página **admiten huecos con nombre**, no solo `{{1}}`. Confirmado con dos
  altas aprobadas.
- Los rótulos con `drawtext` no pueden llevar la letra de unidad en la ruta de la fuente: los dos
  puntos separan opciones del filtro. Se copia la fuente al lado y se nombra en relativo.

### 2026-08-25 — «Message Template Creation Failed» era Meta fallando, no Kavea

Al grabar la toma de Messenger, el alta de `numero_pedido` murió con **«Message Template Creation
Failed: An error occurred while creating message template»**. Ese texto ya venía de
`error_user_title` y `error_user_msg` —el arreglo de esta mañana funcionaba—; lo que pasa es que
esta vez Meta tampoco explicaba nada.

**Reproducido por capas, de fuera hacia dentro, y ninguna falla:**

| Capa | Resultado con el mismo nombre y el mismo cuerpo |
|---|---|
| `POST /{page-id}/message_templates` a pelo, con nombres | APPROVED |
| Igual pero numerada | APPROVED |
| La Edge Function, llamada directa | APPROVED |
| La pantalla entera con Playwright, sesión real | APPROVED |

Y el build que tenía delante era el nuevo: el aviso sale **dos veces** en su captura, arriba y
junto al botón, y lo segundo es código de esa misma mañana. Netlify lo publicó a las 13:15 UTC y la
captura es de las 15:09.

Así que el fallo fue de Meta y pasajero. Lo que se puede hacer es no dejar al operador adivinando:
`motivoDeMeta` ahora lee **`is_transient`** y añade «Meta lo marca como fallo pasajero: vuelve a
intentarlo con el mismo nombre». Sin esa línea, un error que no explica nada deja dos preguntas
abiertas —¿reintento? ¿cambio el nombre?— y ninguna se puede contestar desde la pantalla.

**Y de paso, dos cosas que no sabíamos y ahora sí, medidas:**

- **Un alta que falla NO ocupa el nombre.** Solo lo ocupa una plantilla que Meta llegó a crear y
  luego rechazó. Se comprobó borrando las de prueba: las que erraron no existían.
- **En una Página, un nombre borrado se reutiliza al momento** — recreado un minuto después, y
  aprobado. No hay bloqueo de cuatro semanas como en WhatsApp.

**Lo que este episodio deja pendiente y es más grande:** `pages_utility_messaging` es un permiso de
Página, y su nota pide tres cosas. Kavea cubre dos —crear la plantilla y rellenar sus variables— y
no la tercera: **enviarla y verla llegar en Messenger.** El carril de plantilla de `despachar` vive
entero dentro de `if (canal === 'whatsapp')`. Se verificó que la vía existe:
`POST /{page-id}/messages` con `messaging_type: 'UTILITY'` y `message.template`, sondeado con un
destinatario inválido a propósito —Meta se queja del destinatario, no de la forma—.

### 2026-08-25 — «Invalid parameter» lo explicaba Meta, y Kavea lo tiraba a la basura

Al crear `numero_presupuesto` con el cuerpo

    Hola {{contacto_nombre}}, tu monto presupuestado es {{campo_presupuesto_estimado}}

la pantalla decía **`Invalid parameter`** y nada más. Reproducido contra la WABA con curl, la
respuesta completa era:

    message:           Invalid parameter
    code:              100
    error_subcode:     2388299
    error_user_title:  No se permite incluir parámetros al principio ni al final
    error_user_msg:    Las variables no pueden estar al principio ni al final de la plantilla.

Meta lo explicaba, en castellano, en el mismo cuerpo de la respuesta. Kavea leía `error.message`
—que en las plantillas es casi siempre «Invalid parameter»— y descartaba `error_user_title` y
`error_user_msg`, que son los únicos campos con contenido. Cuatro llamadas en
`plantillas-whatsapp` y dos en `plantillas-utilidad` hacían lo mismo: crear, editar, borrar y
listar.

**Dos arreglos, uno por cada mitad del problema.**

`motivoDeMeta()` en las dos funciones prefiere `error_user_msg`, lo encabeza con
`error_user_title` cuando añade algo, y solo cae a `message` si no hay ninguno de los dos.
Comprobado en la pantalla con un rechazo que Kavea no puede prever —demasiadas variables para lo
corto que es el cuerpo, subcódigo `2388293`—: el aviso ahora dice *«La proporción entre parámetros
y palabras es superior al límite: esta plantilla tiene demasiadas variables en relación con su
longitud»*.

`bordeDe()` en las dos pantallas avisa **mientras se escribe** de que el cuerpo empieza o acaba en
variable, y las dos funciones lo rechazan antes de llamar a Meta. La regla no está en ninguna guía
que hubiéramos leído y su error es un «Invalid parameter» pelado; llegar hasta Meta para
descubrirla cuesta el nombre de la plantilla, que **queda ocupado aunque el alta falle**.

Y una tercera cosa que salió al mirarlo: el aviso vivía solo arriba de la lista, a más de mil
píxeles del botón. Se pulsaba «Crear y enviar a Meta» al fondo del formulario, Meta contestaba, y
no se veía nada. Ahora el motivo se repite junto al botón que lo provocó.

**Lo que sí funciona**, verificado: `pedido_en_camino` con
`Hola {{contacto_nombre}}, su pedido va en camino` está APPROVED. La variable en medio, texto a
los dos lados. Las tres pruebas de rechazo no dejaron rastro en la WABA: sigue con dos plantillas.

### 2026-08-25 — «Application does not have permission» era una Página desconectada

`(#10) Application does not have permission for this action` en la pestaña de Messenger, con la
lista vacía debajo. Dos síntomas que no señalan a la causa: el primero suena a permiso de la app y
el segundo a que no hay nada creado.

**La causa era la elección de la Página.** `/api/plantillas-utilidad` la resolvía así:

    .not('page_id', 'is', null).limit(1)

sin filtro de estado y sin `order`: la primera fila que devolviera Postgres. Hoy devolvía
**«Centromarca Mercedes», desconectada** —de tres filas con `page_id`, dos lo estaban— y con su
token derivado no hay permiso sobre esa Página ni plantillas que listar.

**Es la tercera vez que aparece el mismo patrón.** La 0089 lo tuvo en `registrar_conexion`,
`sincronizar-comentarios` y `responder-comentario` lo tuvieron el 24-ago con
`meta_asset_routes?limit=1`, y esta ruta lo tenía desde que se escribió. «La primera fila de la
tabla» acierta mientras haya una fila; en cuanto hay tres, contesta con la de otro y **no da error**.

Arreglado: filtra por conectada y ordena. La de WhatsApp gana el `order` por lo mismo, para el día
que haya dos WABA.

**Y ahora la pantalla dice de qué Página lee** —«De utilidad, en Messenger · Boosty.digital»—. Eso
es lo que faltaba para que el fallo fuera visible: con varias conectadas se enseñaba una lista sin
decir de quién era, y cuando la elección salió mal no había forma de notarlo desde la interfaz.

Comprobado tras desplegar: sin `(#10)`, ocho plantillas listadas, los dos motivos de rechazo a la
vista, doce botones de campo en el formulario y cero errores de consola.

### 2026-08-25 — Los huecos con nombre: el campo real dentro del mensaje

**Lo que se pidió:** poner los campos del sistema en el cuerpo de la plantilla, tipo
`{{presupuesto}}`, en vez de un `{{1}}` que no dice nada. **Y resulta que Meta ya lo permite:**
`parameter_format: 'NAMED'` con `example.body_text_named_params`.

Comprobado contra **las dos** superficies antes de escribir código. Messenger aprobó una en
segundos. WhatsApp la rechazó la primera vez, pero no por el formato: *«La proporción entre
parámetros y palabras es superior al límite»* — otra regla suya, sobre cuántas variables caben en un
texto corto. Con el texto más largo, aceptada.

**Lo que eso cambia no es cosmético.** Con huecos numerados hacía falta un mapeo aparte —qué campo va
en cada posición— y ese mapeo **puede discrepar del texto**: reordena las variables en el cuerpo y el
mapeo sigue apuntando a las posiciones viejas, sin dar error, mandando el presupuesto donde iba el
nombre. **Con nombres el texto es el mapeo.** No hay dos sitios que puedan contradecirse.

El nombre en Meta se deriva de la clave con el punto convertido en guion bajo
—`campo.presupuesto_estimado` ↔ `campo_presupuesto_estimado`— y la vuelta es fiable porque el ámbito
es una lista cerrada: `contacto`, `tarjeta`, `campo`, `agente`, `org` (0110).

**Y los ejemplos dejan de pedirse.** Meta exige uno por hueco, y cada variable ya trae el suyo en
`variables_disponibles`. Pedirlos a mano cuando ya se conocen era trabajo inventado; ahora solo
aparecen para los huecos numerados, que son los que no se sabe qué contienen.

**Las dos formas no se mezclan.** Meta admite `{{1}}` o `{{nombre}}`, no ambas en el mismo cuerpo, y
el error que da para eso no se entiende. Se para antes, en castellano.

Probado desde la pantalla: pulsar «Nombre de la persona» y «Presupuesto estimado» escribió
`{{contacto_nombre}}` y `{{campo_presupuesto_estimado}}` **en la posición del cursor**, no al final;
no pidió ningún ejemplo; y Meta la guardó con `parameter_format: NAMED` y sus dos
`body_text_named_params`. Borrada después.

Lo posicional sigue funcionando: hay plantillas aprobadas con `{{1}}` que no se van a rehacer.

### 2026-08-25 — Dos fallos que solo se veían usándolo

**El propietario no podía crear plantillas.** La pantalla le decía «No puedes crear, editar ni
borrar plantillas en este espacio». La causa: llamé a `puede` con `{ p_org, p_accion }` y la función
es **`puede(org uuid, accion text)`**. Los otros seis sitios del código que la llaman usan los
nombres buenos; el mío era el único con el prefijo `p_`. Un nombre de parámetro equivocado en un RPC
**no da error de compilación ni de tipos**: la llamada falla, el valor vuelve nulo, y la guarda lo
lee como «no puede». Un permiso denegado que parece una decisión.

**Y la pestaña Internas seguía enseñando un bloque «De WhatsApp»** con las dos filas locales —el
registro a mano de la 0042—, con su selector de estado y su botón de añadir. Desde el 24-ago esas
filas ya no son un catálogo: son el **emparejamiento** de cada hueco con un dato de la ficha.
Enseñarlas ahí como plantillas editables duplicaba la pestaña de al lado y dejaba dos sitios para
cambiar lo mismo con resultados distintos. La sección se llama ahora «Respuestas rápidas» y solo
lista internas; las ramas de WhatsApp del editor, que el typecheck marcó como inalcanzables, fuera.

**Los dos se me escaparon por no usarlo.** Había comprobado que el formulario de autenticación
aparece y que la píldora cuenta, pero **nunca creé una plantilla de verdad** — que es lo único que
recorre la ruta de API y su guarda. Ahora sí: `prueba_kavea_395818` creada desde la pantalla, `200`,
`status: PENDING`, con su cuerpo y sus dos ejemplos, y borrada después para no dejar basura en la
WABA del cliente.

### 2026-08-25 — Editar plantillas, autenticación, y que un comentario se note

**Puntos 3 y 4 de plantillas, cerrados.**

*Editar* va **por id y no por nombre**: el nombre identifica a la familia entera de traducciones, y
editar por ahí cambiaría la versión inglesa al retocar la española. Al guardar, la plantilla vuelve
a revisión —Meta aprobó otra cosa— y la pantalla lo dice. Nombre e idioma se enseñan bloqueados en
vez de ocultarse: quien edita tiene que ver sobre qué trabaja.

*Autenticación* **no es una variante de utilidad**. Meta escribe el texto él, traducido a cada
idioma, y solo deja decidir tres cosas: la advertencia de seguridad, la caducidad —1 a 90 minutos— y
el botón OTP, de copiar o de autorrellenar. Un cuerpo propio ahí es rechazo seguro, así que el
formulario ni lo ofrece. Comprobado en producción: al elegir esa categoría **no hay campo de
cuerpo**.

**Y los comentarios ya se notan.** Tres cosas faltaban, y ninguna era la que parecía:

- **El hilo de un comentario no se refrescaba solo.** El `Refrescador` estaba en la bandeja y en el
  hilo de mensajes; en ese no.
- **La píldora del menú contaba solo `tarjetas.no_leidos`, y un comentario no tiene tarjeta.**
  Llegaba uno nuevo y el menú no se movía. Ahora suman los comentarios en `nuevo` que no son
  propios ni borrados: la píldora pasó de contar mensajes a **49**, que es lo que de verdad está sin
  contestar.
- **Y se recargaba cada treinta segundos.** Ahora escucha la difusión, igual que la bandeja.

**El aviso del sistema** (`avisos-del-sistema.tsx`) notifica lo entrante y el clic abre esa
conversación. **No lleva el texto del mensaje**: el payload del canal solo trae identificadores
desde la 0023, y esto no se salta esa regla por un titular más bonito. La 0109 le añade lo que
faltaba para poder avisar sin filtrar nada — `entrante` y `tarjeta_id`—, y distingue el eco de Meta
de un mensaje de verdad: notificar el propio envío es la forma más rápida de que alguien apague los
avisos.

El permiso se pide **al pulsar un botón**, no al cargar: un «¿permites notificaciones?» en el primer
segundo recibe un «no» que es para siempre.

**Y una sola suscripción al canal.** La primera versión de los avisos abría la suya y, por escribir
mal el tópico, no recibía nada: difundía `org:{id}` y escuchaba `avisos:{id}`. Ahora el
`Refrescador` reemite lo que recibe como evento del DOM y quien quiera lo escucha.

**Vídeos: siete de los ocho montados.** Del `Comments.webm` se recortaron **82 segundos** de bandeja
esperando a que llegara el comentario, y del anterior se separó la parte de Messenger. **Solo falta
grabar el de plantillas.**

### 2026-08-24 — Fase A: una autenticación, muchos activos

**El autoservicio conectó su primer canal.** Facebook Login for Business en producción: diálogo,
código, BISU cifrado, webhooks suscritos y rediagnóstico, todo de extremo a extremo. Primer BISU de
la base.

**Y el modelo cambió a mitad de camino, con razón.** La primera versión conectaba una Página por
autorización y abortaba si el diálogo devolvía varias. Ahora es **una autorización por
organización** (0092) y dentro de Kavea se eligen las Páginas e Instagram que se quieran activar
(`meta-activos`). Una sola pasada por Meta.

**Lo que se cerró además:** reconectar sin volver a empezar · la autorización también se muere, y
un cron diario la comprueba con `debug_token` (0093, 04:41) · cada canal a su embudo (0095/0096) ·
selección de activos con estado por Página.

**Tres caminos muertos que llevaban semanas ahí:**

- `registrar_conexion` (0058) insertaba `'instagram'` donde el CHECK exige `'ig_business_account'`.
  Dieciocho días con una inserción imposible porque esa rama no se había pisado. Copiada tal cual en
  la 0088. Arreglado en la 0089.
- `portafolio conectar` **nunca pudo funcionar**: llamaba a `registrar_conexion`, que empieza por
  `if not public.es_staff()`, con la clave de servicio — donde `auth.uid()` es nulo y `es_staff()`
  siempre falso. La guarda estaba en el sitio equivocado; vive en `/api/portafolio`, que sí tiene
  sesión.
- Tercera copia de `CAMPOS_MESSENGER`, incompleta: a `portafolio` le faltaba `feed`, y el
  reconciliador lo parcheaba cada quince minutos. Por eso nadie lo vio.

**El hilo enseñaba los 100 mensajes más ANTIGUOS.** `obtenerHilo` ordenaba ascendente y cortaba a
100: con 104 entradas, los mensajes nuevos eran invisibles en la conversación y visibles en la
lista. Un `.order(ascending: false)` + `.reverse()`.

**Por qué el diálogo no ve las 26 Páginas de clientes.** El selector de Meta pide *«full control»* y
Boosty tiene **acceso parcial (herramientas de negocio)** sobre ellas, con los siete permisos
puestos. **El camino OAuth es más exigente que el de system user**, así que son dos poblaciones de
cliente distintas. Decidido: el autoservicio se vende a quien tiene **sus propias Páginas**.

**Y el portafolio dueño de la app no se puede elegir**, lo escribe Meta en gris: *«This Meta Business
Account owns the app»*. Las Páginas de Boosty entran por el portafolio, nunca por autoservicio.

---

### 2026-08-24 — Fase B: las tres pantallas, los doce vídeos y quien vigila el resultado

**B1 cerrada.** Las tres pantallas que los vídeos tenían que enseñar y no existían:

- **Ciclo de moderación** (0097/0098): publicar, editar, ocultar y borrar desde el hilo. *Editar no
  existe en Instagram* —Graph solo expone `hide` y `DELETE`— así que es publicar el nuevo y borrar
  el viejo, **en ese orden**: si falla el segundo paso quedan dos comentarios visibles, y al revés
  ninguno. Probado contra Instagram real; los ids consultados después dan «does not exist».
- **Contenido de Página** e **Instagram** (`/contenido`): lista → detalle con la identidad delante.
  `@boosty.digital`, 1625 seguidores, 12 medios; `Boosty.digital`, 172 seguidores, 10 posts.

**B2: el encuadre del envío estaba caduco.** `docs/07` decía «Kavea no tiene el login de Meta… es la
arquitectura». Verdad el 7-ago, falso desde la fase A. Ahora declara **dos caminos** —autoservicio
con login visible, y portafolio server-to-server— y trae el texto listo para *Request again*.

**B3: once vídeos grabados contra producción**, más el duodécimo con `human_agent`. Y tres guiones
llevaban semanas **grabando la pantalla equivocada**: `instagram_manage_comments` apuntaba a
`/comentarios`, ruta borrada el 21-ago —el vídeo era un 404—; `pages_read_engagement` grababa la
lista del portafolio; `instagram_basic`, la bandeja. Los tres se rechazaron.

Del arnés salieron tres fallos más: dos ficheros por permiso tras dos tiradas —convivía el
`instagram_basic` de 197 KB ya rechazado con el nuevo—; `human_agent` saltándose en silencio dentro
de un `if` sin `else`; y un vídeo de 930 KB que no enseñaba el permiso y se guardaba igual.

**El montador** (`montar-screencasts.mjs`) pega el login una vez delante de los ocho. Cuatro quedan
completos solo con esa toma. Normaliza antes de pegar: VP8 sin audio y H.264 con audio en crudo dan
un fichero que abre en el reproductor de quien lo montó, y el del revisor no se puede probar.

**B4: alguien mira el resultado.** La respuesta del 7-ago estuvo dieciséis días sin leerse.
`vigilar-revision` pregunta a diario por `GET /{app-id}/permissions` con token de app, compara
(0099) y manda correo. Sirve en las dos direcciones: aparecer es aprobación, desaparecer es
revocación. La primera pasada siembra y calla.

**Grabado el login por Gabriel**, 5:20 en incógnito, con 2FA y consentimiento completos; partido en
`login.mp4` e `instagram.mp4`. Falta el cliente nativo de Messenger, plantilla y comentarios.

---

### 2026-08-24 — El comodín, los alias y la plataforma

**`*.kavea.ai` está vivo.** Netlify lo habilitó tras borrar los cuatro alias. `cualquiercosa.kavea.ai`
responde: **la fase C queda desbloqueada**, un inquilino nuevo ya no necesita una llamada a la API
de Netlify por alta. Durante el hueco los cuatro dieron 404 con TLS válido, como se había medido.

Casi se reporta un fallo inexistente: `conectar` y `cuenta` seguían en 404 en la raíz. Lo resolvió
una cabecera —`Netlify-Vary` con campos de Next— que delata que contestaba **la aplicación**: son
superficies sin inquilino y su raíz no tiene página. Sus rutas reales dan 200, 401 y 400.

**El `ignore` de despliegue miraba un solo commit.** `git diff --quiet HEAD^ HEAD -- .` con cinco
commits subidos de golpe y el último tocando solo `docs/` canceló el build y dejó `app/` sin
desplegar. Arreglado con `CACHED_COMMIT_REF` **y respaldo**: una variable vacía ahí no falla,
invierte el sentido y cancela. Sin comprobar todavía bajo la forma que falló.

**Corrección:** los despliegues rojos del sitio público no son fallos, son el `ignore` haciendo su
trabajo. Llevaban seis seguidos y una vez llevaron a buscar en el sitio equivocado.

**Netlify o Vercel, con números medidos.** Lo decide el repositorio, no los folletos:
`app/middleware.ts` documenta que `NextResponse.next({ request: { headers } })` **no propaga** en el
runtime de Netlify, y `netlify.toml` fija el plugin porque una actualización cambia el App Router.
Techos: Netlify Pro corta las funciones síncronas a **26 s** (10 s por defecto); Vercel Pro, **300 s
por defecto y 800 de máximo**. Kavea ya pide 45 s y 60 s. Medido: 1,8 s, 2,0 s y 5,7 s — hay margen,
pero `sincronizar` escala con las cuentas. **Las Actions no correrían en Vercel**: sus checks nativos
solo ejecutan `lint` y `typecheck`, y los generales *importan* el resultado de GitHub Actions.
Recomendación: mudarse **después** del App Review.

**El canario C1 cazó una tabla sin RLS**, `private.revision_permisos` (0100). Estar en `private` la
hacía inalcanzable desde fuera y por eso no rompió nada visible — que es para lo que está el canario.

---

### 2026-08-24 — Conectar y desconectar, por la misma puerta

**Se puede soltar la cuenta de Facebook entera** (0101 + `meta-soltar`). Antes solo se desconectaba
un canal: la autorización seguía con su BISU y Kavea seguía apareciendo en los ajustes de Facebook
del cliente. Tres pasos y el orden no es negociable: lo local ocurre sí o sí; luego las bajas de
webhooks, que necesitan un token que se pide **con** el BISU; y después `DELETE /me/permissions`,
que lo mata.

**El botón se llevó un WhatsApp que no era suyo.** Gabriel lo usó la misma noche y apagó dos
conexiones: la Página, que debía caer, y `+1 321-393-1397`, que no — WhatsApp entra por el
portafolio, no por esa autorización. La 0102 acota a las conexiones con `page_id` y la confirmación
dice **las dos cifras**. Probado por él: la vez siguiente, `conexiones: 1, intactas: 1`.

**Faltaba el camino de vuelta.** Existía `desconectar_conexion` desde la 0079 y nada que lo
deshiciera; para WhatsApp no hay «Elegir qué conectar». La 0103 añade `reconectar_conexion`, que
rehace estado, rutas y canales y **dice lo que no puede hacer**: devuelve `falta: ['credencial',
'suscripcion']`.

**Restaurado el número** con los tres pasos comprobados —credencial reemitida y verificada contra
Meta (GREEN, CLOUD_API), WABA con `subscribed_apps: []` vuelta a suscribir— y **Boosty.digital** por
el portafolio, con dos rutas y nueve campos suscritos.

**Retirar de la lista no es eliminar** (0104). Un `delete` arrastra `channels → conversations →
messages`: el historial entero del canal. Se archiva, con camino de vuelta, y solo sobre lo
desconectado. Probado: retirado `+1 829-954-3803`, sus **3 conversaciones y 9 mensajes intactos**.

**Y el menú por fin responde al ratón.** No faltaba por descuido: los enlaces se pintaban con
`style` en línea y `:hover` no se puede escribir ahí.

---

### 2026-08-24 — Plantillas: tres clases, y WhatsApp de punta a punta

**Por qué Meta rechazó.** El campo `rejected_reason` existía en la API y nadie lo pedía:
`codigo_ingreso` → **`INCORRECT_CATEGORY`** (un código de acceso es AUTHENTICATION, no UTILITY);
`aviso_de_pedido` → **`INVALID_FORMAT`** (sin ejemplos). La comparación lo decía antes que el
motivo: las cinco aprobadas llevan `example` y la única sin él está rechazada.

**La pantalla mezclaba tres cosas** con un cuadro arriba explicando en qué se diferencian — el
cuadro era el diagnóstico. Ahora son **tres pestañas**: Internas · WhatsApp · Messenger. Se pidieron
dos y son tres a propósito: Messenger usa plantillas de la **Página** y WhatsApp de la **cuenta de
WhatsApp**.

**Las de WhatsApp dejan de ser un registro a mano** y se leen de la WABA. Se crean con categoría
—explicada, que es lo que más rechazos causa—, idioma, cabecera, cuerpo, pie y hasta diez botones.
Y con **cabeceras de imagen, vídeo o PDF**: Meta no las acepta por URL, exige su API de subida
reanudable, y su segunda llamada pide `Authorization: OAuth`, no `Bearer`.

**Y ya se pueden mandar** (0105). Era el único canal sin salida: fuera de las 24 h WhatsApp no tenía
ni texto —lo prohíbe Meta— ni plantilla. Tres piezas, y solo una nueva: el mapeo existía desde la
0042, resolver contra la ficha también, faltaba encolar con la forma que Meta pide —los valores
**uno a uno y en orden**—. Probado: `hello_world` entregada con `wamid` a un número cuyo último
mensaje era de hace treinta horas.

**Dos fallos anteriores por el camino.** `ventana_de` devolvía `humana` con tag `HUMAN_AGENT` entre
24 h y 7 días **para cualquier canal**, y en WhatsApp ese tag no existe: un texto a las treinta horas
se encolaba y Meta lo rechazaba (0106). Y el despachador **mataba la plantilla con el motivo que la
plantilla venía a resolver** — ahora se salta la ventana pero no el freno duro.

**Sobre las variables: ya estaban.** Los campos personalizados existen desde la 0028 y
`variables_disponibles` ya los exponía —once, tres propias del espacio—. Lo que faltaba era
**emparejarlos con los huecos numerados**, y un campo nuevo aparece en el desplegable sin tocar nada.

---

### 2026-08-24 — Los comentarios, en vivo y vigilados

**El webhook de comentarios no llega**, y no por falta de suscripción —está puesta, comprobado— sino
por modo desarrollo con `instagram_manage_comments` rechazado: de 61 eventos de `instagram`, cero
comentarios. Lo mismo explica que un DM de `@eficienzia.ai` no entrara: en ese modo Meta solo
entrega eventos de quien **tiene rol en la app**, y la app solo tiene dos administradores.

Preguntarle a Graph tampoco era opción: la arista de conversaciones responde `(#3) capability`
porque falta ese mismo permiso. **El permiso que falta impide diagnosticar el problema que causa.**

**Tres piezas para que no vuelva a fallar** (0108):

1. **`comentarios` no tenía disparador de difusión.** `messages`, `actividades`, `conversations` y
   `tarjetas` lo tienen desde la 0023; esa tabla nunca. Aunque el cron los metiera, la bandeja
   abierta no se enteraba. Ahora difunde en `insert` **y** en `update`: moderar desde otra pestaña
   dejaba la primera mintiendo.
2. **La lectura baja de quince minutos a tres.**
3. **Un latido por pasada buena.** Una función que revienta puede avisar; una que deja de
   **ejecutarse** no puede avisar de nada, y ese es el fallo que ocurre —un cron desprogramado, un
   secreto caducado—. Lo único que lo detecta es echar de menos algo que debería estar. El vigilante
   diario, que ya manda correo, mira también los latidos.

**Y CI comprueba las funciones de borde.** `supabase functions deploy` **no comprueba tipos**: subió
el despachador con tres campos que no existían en su tipo. Al añadir `deno check` salieron dos cosas
más: se indexaba el cuerpo con una clave que podía ser `undefined` —una propiedad llamada
«undefined» que Meta ignora: un envío con media que llega sin media y sin error— y Deno **escribía**
un campo `workspaces` en el `package.json` del repositorio al ver el `pnpm-workspace.yaml`. Las 21
funciones compilan.

**Y el punto 2 de plantillas, cerrado el mismo día:** cabeceras de imagen, vídeo y PDF. Meta no las
acepta por URL —exige su API de subida reanudable, y su segunda llamada pide `Authorization: OAuth`
en vez de `Bearer`—, así que son tres llamadas donde parecía haber un campo de texto. El fichero
viaja en base64 dentro del JSON: un multipart tendría que cruzar la ruta de Next y la de Supabase
con dos límites distintos y el tope real sería el menor de los dos igualmente. El handle es de un
solo uso y no se guarda.


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

- Un error que señala a un dato que ninguna pantalla puede escribir es peor que no validar: manda
  al usuario a buscar una puerta que no existe.
- Un mensaje de error nombra las cosas como las nombra la interfaz. La clave interna obliga a
  traducir a mano lo que el programa ya sabe traducir.
- Esconder una opción para evitar un error obliga a adivinar por qué no está. Preguntar con el
  coste escrito informa y protege igual.
- Dos sitios para la misma acción con reglas distintas no es redundancia: es que una de las dos
  nunca se encuentra.
- Un control que solo aparece cuando hace falta es buen diseño; uno que nunca se ha visto no se
  sabe que existe. El marcador de la caja y el aviso de configuración son donde se cuenta.
- En un menú sobre un campo de texto, el clic va en `mousedown`: el `blur` del campo llega antes
  que el `click` y desmonta el elemento que se estaba pulsando.
- Antes de dibujar un icono, buscar si ya está en el repositorio: dos juegos de logos para lo
  mismo es peor que uno regular, y el segundo siempre sale peor.
- Una segunda copia de cincuenta líneas se separa en el primer arreglo que se haga solo en una:
  el momento de extraer el cuerpo común es antes de escribirla, no después.
- Una forma de API se comprueba con un destinatario inválido: Meta valida el cuerpo antes que el
  destino, así que el error dice si la forma vale sin mandarle nada a nadie.
- Un comentario que documenta media solución es peor que ninguno: cierra la pregunta sin cerrar
  el fallo.
- Antes de reparar datos corrompidos hay que medir si la corrupción es total o parcial: el arreglo
  de manual rompe lo sano.
- Buscar la causa de un fallo mirando la pantalla encuentra los otros dos que nadie había visto.
- Al recortar una grabación, la pausa larga suele SER la prueba: el margen se elige por lo que
  hay que leer, no por acortar.
- Cuando un vídeo cambia de superficie, un rótulo de dos segundos evita la pregunta que el
  revisor se contestaría solo.
- Antes de culpar al código, reproducir por capas: la de fuera puede fallar por algo que ya no
  falla, y un error de un tercero puede ser pasajero sin decirlo en el texto.
- `is_transient` contesta la única pregunta que el operador se hace ante un error opaco.
- Un error de un tercero se lee entero antes de mostrarlo: el campo que se enseña por costumbre
  (`message`) puede ser el único sin información, y el motivo estar al lado sin que nadie lo mire.
- Un aviso lejos del control que lo provocó es un aviso que no existe.
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
- Un desplegable en gris con su motivo escrito al lado es documentación: «This Meta Business Account
  owns the app» explicaba en siete palabras algo que no está en ninguna guía que hubiéramos leído.
- Que algo estuviera conectado antes no prueba que se pueda conectar por el camino que se está
  intentando ahora. Boosty.digital llevaba meses conectada — por la otra puerta.
- Antes de construir un botón de borrar, leer las claves ajenas. «Eliminar esta fila» y «eliminar
  esta fila y tres tablas encadenadas detrás» se escriben igual en el `delete` y se leen igual en la
  pantalla.
- La palabra del botón es parte del contrato. «Retirar de la lista» y «Eliminar» prometen cosas
  distintas, y quien pulsa solo tiene la palabra para saber cuál va a pasar.
- Un estilo en línea no admite pseudoclases. Si una superficie no responde al ratón y las demás sí,
  el motivo probable no es que a alguien se le olvidara: es que ahí no se podía escribir.
- Un campo que la API devuelve solo si lo nombras es un campo que no existe hasta que alguien lo
  echa de menos. `rejected_reason` llevaba semanas disponible mientras la pantalla decía
  «Rechazada» y nada más.
- Cuando una pantalla necesita un cuadro que explique en qué se diferencian sus partes, el cuadro no
  es la solución: es el diagnóstico.
- Antes de buscar el motivo en la documentación, comparar lo que funciona con lo que no. Cinco
  plantillas aprobadas con ejemplo y una rechazada sin él contestan la pregunta sin salir de la API.
- Una función que reevalúa una precondición antes de actuar tiene que preguntarse si la acción
  existe PARA saltarse esa precondición. La plantilla moría con el mensaje que ella misma resolvía.
- Un comentario que explica correctamente una regla dos líneas más arriba no impide que el código de
  al lado la incumpla: el despachador decía que en WhatsApp no hay HUMAN_AGENT mientras `ventana_de`
  se lo entregaba.
- Antes de construir lo que alguien pide, mirar si ya está. Los campos personalizados llevaban desde
  la 0028 y ya salían como variables; lo que faltaba era el emparejamiento, que es un tercio del
  trabajo y no el trabajo entero.
- Una píldora que cuenta una sola tabla miente en cuanto aparece una segunda cosa que espera
  respuesta. El comentario no tenía tarjeta, así que no existía para el menú.
- Dos suscripciones al mismo canal en el mismo cliente es un problema que se evita reemitiendo. Y un
  tópico mal escrito no da error: simplemente no llega nada, que es peor.
- Cuando una categoría de un tercero tiene forma propia, el formulario tiene que tener forma propia.
  Ofrecer un campo que el proveedor ignora —o por el que rechaza— es prometer un control que no hay.
- Un nombre de parámetro equivocado en un RPC no rompe nada visible: devuelve nulo, y una guarda
  que lee nulo como «no» convierte un error de tipeo en un permiso denegado creíble. Cuando una
  función se llama en siete sitios, copiar uno de esos siete es más seguro que escribirla de nuevo.
- Comprobar que un formulario se pinta no es comprobar que funciona. Lo único que recorre la ruta,
  su guarda y la llamada al tercero es pulsar el botón.
- Antes de construir un apaño para una limitación de un tercero, comprobar si sigue siendo una
  limitación. El mapeo posicional se construyó ayer y hoy sobraba: Meta admite nombres desde hace
  tiempo.
- Un rechazo de Meta hay que leerlo entero antes de concluir que la función no existe. «Demasiadas
  variables en relación con la longitud» no es «no admito nombres», y confundirlos habría cerrado el
  camino bueno.
- Dos sitios que describen lo mismo acaban discrepando. Un mapeo de posiciones aparte del texto se
  rompe en silencio al reordenar; el nombre dentro del texto no puede desalinearse consigo mismo.
- «La primera fila de la tabla» es el fallo que más veces ha aparecido en este proyecto: cuatro
  sitios distintos, todos correctos mientras hubo una fila. El patrón a buscar es un `limit(1)` sin
  `where` que ate al dueño y sin `order` que lo haga repetible.
- Un error de permiso de un tercero puede ser un error de selección propio. «Application does not
  have permission» era cierto: la app no tiene permiso sobre esa Página, que no era la que tocaba.
- Una pantalla que actúa sobre uno de varios activos tiene que decir sobre cuál. Sin eso, elegir mal
  produce síntomas que apuntan a cualquier otro sitio.
