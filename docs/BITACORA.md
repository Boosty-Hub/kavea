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
| Esquema de base de datos | ✅ 84 migraciones aplicadas y registradas | En `public.schema_migrations` |
| Bandeja de correo interna | ✅ `/admin/correos` | RPC y bucket verificados |
| Aislamiento entre tenants | ✅ 61/61 comprobaciones · 8/8 canarios | C8 añadido el 23-ago tras un agujero real |
| Ingesta y normalización | ✅ Producción | 8 crones vivos, mensajes reales entrando |
| Bandeja, tarjetas, embudos, ficha, agenda, reparto | ✅ Producción | Un contacto con varios canales en una tarjeta |
| Envío por Instagram | ✅ Texto, imagen, GIF, corazón | Echo en ≤6 s, contacto confirmando |
| Envío por Messenger | ✅ Probado el 6-ago | `messaging_type: RESPONSE`, id de Meta, sin error |
| WhatsApp — `+1 321-393-1397` | ✅ Cloud API directo, el 23-ago | `CONNECTED`, `throughput STANDARD`, V7 en verde con mensaje real |
| WhatsApp — `+1 829-954-3803` | ⛔ A retirar | Meta lo reporta `DISCONNECTED`; sin tráfico real desde el 7-ago |
| Un hilo por número | ✅ Desde la 0082 | La tarjeta une los canales; el hilo ya no |
| Pausar y desconectar un canal | ✅ Desde Ajustes → Canales | 0079; el borde da de baja los webhooks en Meta |
| Plantillas de utilidad de Messenger | ✅ Leer y crear en vivo contra Meta | No se espejan en Postgres |
| Comentarios | ✅ Pestaña de la Bandeja, no módulo | Respuesta pública y lectura por API; el webhook sigue sin llegar |
| Callbacks de Meta (deauth, borrado, `signed_request`) | ✅ Desplegados y probados | Falta pegar la URL en el panel de Meta — ver §2 |
| Diagnóstico de conexiones | ✅ Dos baterías, V1–V7, cron diario | Página+Instagram y WABA+número no comparten un nodo del grafo |
| Panel interno | ✅ 5 pantallas | Salud, espacios, portafolio, accesos, uso |
| Alta de cliente desde el panel | ✅ Ejecutada el 6-ago | Primera vez desde que se construyó |
| Navegación | ✅ Sidebar por secciones, colapsable | Trabajo / Datos / Cuenta, con no leídos |
| Acceso en `kavea.ai` | ✅ Página de entrada por subdominio | Antes no había ningún enlace |
| **Tech Provider** | ✅ Verificado el 4-ago | `Submitted → Reviewed → Verified` en 12 h |
| App Review | ⚠️ Contenido listo, sin enviar | **Las llamadas de prueba caducan el 5-sep** — ver §2 |
| Correo saliente | ⚠️ No funciona | DNS de `kavea.ai` sin verificar en Resend |
| Nombre a mostrar de `+1 321-393-1397` | ⚠️ `PENDING_REVIEW` en Meta | No bloquea enviar; es lo que ve el contacto |
| Plantillas de WhatsApp | ⛔ Sin cablear con Meta | Modelo existe; las 25 aprobadas están en la WABA que se retira |
| Facebook Login for Business | ⛔ Cero configuraciones, redirect URIs vacío | No bloquea el App Review; bloquea la fase 5 |
| Agentes (fase 6) | ⏸ Aparcada | Sin `ANTHROPIC_API_KEY` |
| Comodín `*.kavea.ai` | ⏸ Aplazado, no bloquea | Con un inquilino basta un alias |

Fases 0–4 operativas, fase 5 en su tarea 12.

---

## 2. Pendiente, por bloqueo

### Con fecha encima
- **Enviar el App Review antes del 5-sep-2026.** Las llamadas de prueba caducan a los 30 días y
  las que hay se hicieron el 6-ago. Pasada la fecha hay que rehacerlas antes de poder enviar.
  Contenido completo en `docs/07-app-review.md`.

### Bloqueado por Meta
- Pegar `deauth_callback_url` en App settings (el código ya funciona).
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
- Retirar `+1 829-954-3803`: botón Desconectar en Ajustes → Canales, que además da de baja los
  webhooks en Meta. Kommo no se entera: su suscripción sobre esa WABA es otra.
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
- Barrer las otras cinco migraciones que escribieron `revoke ... from anon`. La 0084 cerró lo que
  estaba abierto de verdad y C8 impide que vuelva, pero el texto equivocado sigue en el
  repositorio y el siguiente que lo copie repetirá el error.
- `private.avisar_bandeja` abre una subtransacción por mensaje; el lote está topado en 64 porque
  el caché de subtransacciones de Postgres también es 64. Sin medir su efecto real.
- `conversations.no_leidos` sigue marcada como sospechosa desde el 3-ago. El contador que de
  verdad se usa es el de `tarjetas`; el de `conversations` no lo mantiene nadie.

### Decisiones sin fecha límite
Retención de `webhook_events` · presupuesto de latencia p95 del normalizador · nivel de PITR en
producción · retención tras la baja de un cliente.

---

## 3. Entradas

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
Canario **C8**: ninguna función SECURITY DEFINER de `public`/`private` ejecutable por `PUBLIC`,
con cinco excepciones documentadas. Comprobado que detecta, quitándole la lista.

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
- Un objeto de un tercero que se verificó una vez puede dejar de existir; lo que se guarda de
  fuera se vuelve a comprobar, no se da por vivo.
- «Desconocido» no es «malo»: un indicador que confunde ausencia de dato con dato negativo pinta
  de rojo lo que está sano, y enseña a ignorar el panel.
- Cambiar un índice obliga a buscar quién guardaba contra él: la guarda que se queda atrás es
  más estricta o más laxa que la restricción que dice proteger.
- Una fricción de confirmación tiene que costar una decisión, no una transcripción. Si hay que
  copiar un identificador, la acción no existe.
- Un parámetro que se recibe y no se usa al buscar —solo al insertar— es una clave incompleta
  esperando a que aparezca el segundo caso.
