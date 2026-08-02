# Kavea — Bitácora

Registro de lo que está hecho, verificado y en producción. Una entrada por hito real.

**Regla:** aquí solo entra lo que se ha comprobado, con la evidencia al lado. Lo planificado
vive en `docs/fases/`, lo pendiente en la sección 3 de este documento. Si algo no se ha
verificado, no se escribe como hecho.

---

## 1. Estado actual

| Pieza | Estado | Verificado |
|---|---|---|
| Sitio público `kavea.ai` | ✅ En producción | HTTP 200, contenido comprobado |
| Páginas legales | ✅ Publicadas | Rastreables por Meta, sin bloqueo de bots |
| Correo `support@kavea.ai` | ✅ Recibe y envía | Prueba de extremo a extremo |
| Repositorio | ✅ `Boosty-Hub/kavea`, privado | Monorepo, despliegue automático |
| App de Meta | ✅ Creada, en modo desarrollo | `compliant`, sin violaciones |
| Plan de construcción | ✅ 8 fases, 8.000 líneas | `docs/fases/` |
| Zona DNS en Netlify | ⏳ Creada, sin delegar | Nameservers aún en GoDaddy |
| Certificado comodín | ⬜ Bloqueado por lo anterior | — |
| Aplicación | ⬜ No empezada | Fase 0 |

---

## 2. Entradas

### 2026-08-02 · Cuatro decisiones de Gabriel

**1. La ingesta se queda en Netlify.** Anula el `02` §5.3, que argumentaba a favor de
Cloudflare Workers y Queues. Se cambia superficie operativa por riesgo: dos proveedores en
lugar de cuatro, a cambio de que el receptor dependa de Postgres para responder 200.

El riesgo está mitigado con **Netlify Blobs** como amortiguador: si la escritura a Postgres
falla, el receptor vuelca el cuerpo crudo a Blobs y devuelve 200 igual; una Scheduled
Function lo drena cuando la base vuelve. Meta nunca ve un error y no hay desuscripción.
Netlify describe Blobs como almacén de alta disponibilidad, escribible desde Functions y con
consistencia fuerte opcional.

Lo que se pierde y queda documentado en `06` §1.1: Blobs no es una cola —no hay entrega
garantizada, ni reintentos, ni DLQ—, la consistencia fuerte hay que pedirla explícitamente, y
sin Durable Objects el token bucket por `page_id` se implementa con `pg_advisory_xact_lock`.

Límites verificados: función sincrónica 10 s, background function 15 min, objeto de Blobs
hasta 5 GB. El presupuesto de 5 s de Meta cabe.

La ingesta va en un **sitio de Netlify aparte** con dominio `hooks.kavea.ai`, no como una
ruta más de la aplicación. Es lo único que queda del principio de separar dominios de fallo:
un despliegue roto de la interfaz no puede tumbar la recepción.

**2. Colores semánticos: dos tokens por estado.** El sólido de marca se conserva para el
punto y el borde; se añade una variante oscurecida solo para el texto. La paleta del libro no
cambia y el contraste cumple. Añadidas también las variantes de modo oscuro, que el `01` no
cubría. Cierra el primer pendiente de su sección 9: terracota 500 sobre arena da 4,52 y pasa.

**3. Cuatro estados de conversación:** `nueva`, `en_curso`, `esperando`, `cerrada`. Amplía el
CHECK de tres del `02` §7.4 y obliga a corregir el índice único parcial, que hoy usa
`where status='open'` y dejaría desprotegida una conversación en `esperando`.

**4. WhatsApp: cada cliente paga a Meta con su propio método de pago.** El coste de mensajes
no entra en la cuenta de Kavea, que solo cobra su tarifa. Simplifica la contabilidad y elimina
el riesgo de impago, a cambio de un paso más en el onboarding. Consecuencia para el modelo de
costes de la fase 7: `C_meta` sale de la fórmula de Kavea y pasa a ser información que se le
muestra al cliente, no un coste propio.

---

### 2026-08-02 · Plan de construcción por fases

Ocho documentos de fase con tareas numeradas y criterio de aceptación verificable, más
índice maestro en `docs/fases/README.md`.

Se corrigió un error de método propio: el `06-arquitectura-plataforma.md` se había escrito
sin leer el `02-conexion-instagram-facebook.md`, que es anterior y más detallado, y lo
contradecía en seis puntos. El `06` ahora cede ante el `02` y lleva tabla de erratas.

Tres fallos de seguridad detectados y corregidos sobre el diseño inicial:

- La política `for all` sobre membresías permitía a un `agente` ejecutar
  `update ... set rol='propietario' where user_id = auth.uid()` y escalar dentro de su tenant.
- El break-glass usaba un `exists` correlacionado, evaluado una vez por fila.
- Las claves foráneas simples permiten coser una fila de la organización A con una de la B:
  la integridad referencial de Postgres salta RLS igual que el rol de servicio.

**Evidencia:** commit `077b8e0`.

---

### 2026-08-02 · Zona DNS creada en Netlify

Zona `kavea.ai` creada (`6a6ee626cbdd2038473198ed`) con los siete registros replicados desde
GoDaddy y verificados consultando directamente a `dns1.p05.nsone.net` **antes** de tocar la
delegación. Incluye los cuatro registros que sostienen el correo.

Se descartó Cloudflare como proveedor de DNS pese a estar ya en la arquitectura: en modo
DNS-only no resuelve el problema —Netlify seguiría sin poder escribir el TXT del reto ACME—
y en modo proxy Netlify desaconseja por escrito poner su CDN detrás de otro. Además su
Universal SSL solo cubre el primer nivel de subdominio.

**Pendiente:** cambiar los nameservers en GoDaddy a `dns1` … `dns4.p05.nsone.net`.
Comprobado a las 07:30 UTC: tres resolvedores públicos siguen devolviendo los de GoDaddy.

---

### 2026-08-02 · Correo operativo

`support@kavea.ai` recibe y envía. Una sola dirección para todo: soporte, privacidad, legal
y seguridad.

DKIM, subdominio de envío y MX de entrada `inbound-smtp.us-east-1.amazonaws.com` verificados
en Resend y publicados en el DNS real.

**Evidencia:** correo enviado por la API (`2858a46c-f0e7-4b2d-a0ff-5895b0d4b50f`) y
localizado después en la bandeja de entrantes de Resend. Cierra el riesgo de rechazo del App
Review por dirección que rebota.

**Nota:** no hay SPF en la raíz del dominio. No bloquea nada porque Resend usa
`send.kavea.ai` como ruta de retorno y el DMARC está en `p=quarantine` con alineación
relajada. Los informes DMARC van a una dirección por defecto de GoDaddy que nadie lee.

---

### 2026-08-02 · Monorepo unificado

El sitio vivía en una carpeta `kavea-web` separada de `Kavea`, que ya contenía `docs/` y
`brand/`. Se unificaron: el repositorio `Boosty-Hub/kavea` tiene ahora `web/`, `docs/` y
`brand/` bajo la misma raíz, con Netlify construyendo solo `web/` mediante `base`.

Git registró los movimientos como renombres, así que el historial se conserva.

**Evidencia:** commits `2adbb68` y `092a709`. Despliegue `ready`.

---

### 2026-08-02 · Sitio público en producción

Landing y tres documentos legales en Astro, salida estática, **cero JavaScript en cliente**.

La restricción que manda sobre el diseño: el rastreador de Meta debe poder leer
`/privacidad` y `/eliminacion-de-datos` y recibir 200; un enlace que no responde es causa de
rechazo del App Review. De ahí que no haya SSR, ni analítica, ni cookies, ni protección de
bots, y que las fuentes vayan self-hosted.

Alias en inglés con redirección 301 hacia las rutas en español.

**Evidencia:** build sin archivos `.js` ni etiquetas `<script>`; `kavea.ai/privacidad`
comprobado desde fuera con 200 y contenido completo.

---

### 2026-08-02 · App de Meta creada

App `kavea`, ID `1623464799201071`, portafolio `2167414613399354`, tipo Business, con los
tres use cases de mensajería en una sola app: WhatsApp, Instagram y Messenger.

Facebook Login quedó incompatible con WhatsApp en el asistente, pero no hace falta: Embedded
Signup usa Facebook Login **for Business**, que se configura desde el panel.

**Verificado por API:**

- `business_verification_passes: true` — el portafolio ya está verificado, lo que ahorra el
  trámite más lento de Meta
- `overall_status: compliant`, cero violaciones
- Topics disponibles confirmados: `whatsapp_business_account`, `page`, `instagram`
- Los topics `whatsapp` y `whatsapp_account` vienen con lista de campos vacía: no usarlos

**Ícono generado:** `brand/kavea-app-icon-1024.png`.

---

## 3. Pendiente, por orden de urgencia

### Bloquea la fase 0

| Qué | Quién |
|---|---|
| Cambiar nameservers en GoDaddy. Comprobado a las 07:45 UTC: sin propagar | Gabriel |
| ~~Ingesta en Cloudflare o Netlify~~ — **decidido: Netlify** | ✅ |
| ~~Contraste de colores semánticos~~ — **decidido: dos tokens por estado** | ✅ |
| ~~Tres o cuatro estados~~ — **decidido: cuatro** | ✅ |
| Rehacer las fases 1 y 2 sobre Netlify. Están escritas contra Cloudflare | Claude |

### Bloquea el App Review

| Qué | Estado |
|---|---|
| Rellenar ajustes básicos de la app: URLs, ícono, categoría, descripciones | Contenido listo en `05-checklist-tech-provider.md` |
| Verificar el correo de contacto de la app | `contact_email_verified: false` |
| Confirmar que la app está reclamada por el portafolio | No visible por API |
| Enviar la Access Verification (Tech Provider) | Requisitos cumplidos |

El App Review propiamente dicho **no se puede enviar todavía**: exige al menos una llamada
exitosa por permiso en los 30 días previos, un screencast por permiso y un tenant demo
funcionando. Se envía al cerrar la fase 4.

### Decisiones sin fecha límite

Retención de `webhook_events` · presupuesto de latencia p95 del normalizador · nivel de PITR
del proyecto de producción.

~~Quién paga a Meta el consumo de WhatsApp~~ — **decidido: cada cliente con su propio método
de pago.**

### Verificaciones contra Meta

Quince, listadas en `docs/fases/README.md` §5. Siete bloquean construcción. Ninguna se
resuelve leyendo documentación: son contradicciones entre páginas oficiales de Meta o cosas
que Meta no publica.

---

## 4. Cosas que costaron y conviene no repetir

- **Leer todos los documentos antes de escribir arquitectura.** El `06` se escribió sin el
  `02` y hubo que corregirlo con cuatro planes de fase ya construidos encima.
- **Los límites de plataforma se verifican, no se recuerdan.** Cloudflare Queues: 128 KB por
  mensaje y retención de 24 h en el plan gratuito frente a 14 días en el de pago. El segundo
  dato convierte el plan de pago en requisito de la arquitectura, no en mejora opcional.
- **Netlify solo renueva certificados comodín si controla la zona.** Con DNS externo el
  certificado se emite la primera vez y falla al renovar a los tres meses, que es el peor
  modo de fallo posible.
- **Las credenciales pegadas en un chat quedan en el historial.** Rotar al cerrar la sesión.
