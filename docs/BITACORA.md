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
| Zona DNS en Netlify | ✅ Delegada y operativa | SOA `dns1.p01.nsone.net` en 7 resolvedores |
| Esquema de base de datos | ✅ 13 migraciones aplicadas | 15 tablas, 20 políticas, verificado en `pg_catalog` |
| Aislamiento entre tenants | ✅ 16 de 16 comprobaciones | Validado rompiendo una política a propósito |
| Aplicación Next.js | ✅ Desplegada | `admin.kavea.ai` sirviendo con certificado |
| Comodín `*.kavea.ai` | ⛔ **Bloqueado por Netlify** | Requiere ticket de soporte, no es autoservicio |

---

## 2. Entradas

### 2026-08-02 · Fase 0 — aplicación desplegada, comodín bloqueado por Netlify

Sitio `kavea-app` creado sobre el mismo repositorio con `base = "app"`, desplegado y sirviendo
en `admin.kavea.ai` con certificado válido.

**Verificado en producción, no en local:**

- Petición sin subdominio de organización → 404. No revela nada.
- `/entrar` sirve el formulario.
- **Cabecera `x-kavea-org-slug` falsificada → 404.** El middleware la borra antes de leer nada.
  Es la comprobación de seguridad que justifica el diseño del middleware.
- `admin.kavea.ai` → 200 con certificado emitido por Netlify.
- El sitio público sigue intacto.

**Variables de entorno con separación por contexto:** `SUPABASE_SECRET_KEY` existe únicamente
en el contexto `production`. Un Deploy Preview lo puede abrir cualquiera con acceso al
repositorio, y con esa clave se lee cualquier fila de cualquier tenant sin pasar por RLS.

#### Corrección sobre el comodín: el certificado ya lo cubre, lo que falta es el enrutado

**El certificado emitido por Netlify ya es comodín** —cubre `*.kavea.ai` y `kavea.ai`— porque
la zona está en Netlify DNS. Eso no era el problema.

Lo que falta es que Netlify **enrute** un hostname concreto al sitio. Y eso sí se puede hacer
hoy, cliente a cliente, con un alias de dominio: `boosty.kavea.ai` añadido como alias sirve
HTTP 200 sin ningún ticket.

Consecuencia práctica: **no hay bloqueo para el dogfooding.** Con un solo inquilino, un alias
basta. El comodín solo hace falta cuando entren clientes en volumen, que es un mes largo
después.

Techo de la vía de alias, medido: Netlify recomienda **no pasar de 50 alias por sitio**, con
límite duro en torno a 100. Suficiente para el primer año, insuficiente como modelo definitivo.

**Aviso de incompatibilidad:** la documentación del comodín exige que el sitio no tenga alias
de dominio. Si el ticket prospera, hay que retirar los alias antes de habilitarlo. Es
reversible y ninguna de las dos vías cierra la otra.

---

#### Las opciones de subdominio, con sus números

Ninguna implica un proyecto de Netlify por cliente. Hay **dos sitios y no van a crecer**: uno
por superficie, no por inquilino.

| Opción | Sitios | Techo | Disponible |
|---|---|---|---|
| Comodín en Netlify | 1 | ilimitado | ticket de soporte |
| Alias por cliente | 1 | ~50 rec., 100 duro | ✅ hoy |
| Ruta `app.kavea.ai/<slug>` | 1 | ilimitado | ✅ hoy |
| Mover la app a Vercel | 1 | ilimitado | autoservicio, pero exige sus nameservers |

Vercel ofrece comodín autoservicio en todos los planes, pero obliga a mover la zona a sus
nameservers: sería cambiar un trámite de soporte por una migración de DNS con el correo de por
medio, justo después de haber hecho una.

---

#### El comodín `*.kavea.ai` sigue pendiente de habilitación

La API de Netlify rechaza el comodín tanto en `custom_domain` como en `domain_aliases`, con
"has invalid characters". No es un fallo: **los dominios comodín no son autoservicio en
Netlify.** La respuesta oficial de su equipo termina con *"si eso te funciona, déjanos saber y
lo habilitaremos en tu sitio"*.

Requisitos, y cómo estamos:

| Requisito | Estado |
|---|---|
| Plan Pro o superior | ✅ la cuenta es Pro |
| DNS gestionado por Netlify | ✅ zona delegada y verificada |
| Registro comodín en la zona | ✅ `NETLIFY *.kavea.ai → kavea-app.netlify.app` |
| Sitio sin alias de dominio | ✅ ninguno |
| Habilitación por soporte de Netlify | ⬜ **pendiente, requiere ticket de Gabriel** |

Síntoma mientras tanto: un subdominio cualquiera resuelve por DNS y llega a Netlify, pero
Netlify devuelve **su propio 404** —`Server: Netlify`, texto plano con Request ID— porque no
sabe a qué sitio pertenece ese hostname. No es un 404 de la aplicación.

Salidas si el ticket no prospera, en orden de preferencia:

1. `app.kavea.ai/<slug>` por ruta en vez de subdominio. Funciona hoy, sin comodín. El
   middleware ya lee el slug de una variable, así que el cambio es contenido.
2. Un alias explícito por cliente. Funciona, pero dar de alta deja de ser insertar una fila.
3. Mover la aplicación a un proveedor con comodín autoservicio, manteniendo el sitio público
   donde está.

**Nota de método:** la conclusión salió de mirar las cabeceras del 404, no de suponer. Un
`Server: Netlify` con cuerpo en texto plano dice que la petición nunca llegó a la aplicación,
y eso descarta de golpe middleware, build y variables de entorno.

---

### 2026-08-02 · Cuatro decisiones de Gabriel

**1. La ingesta va en Supabase Edge Functions.** Anula el `02` §5.3, que argumentaba a favor
de Cloudflare Workers y Queues. Consolidación: **todo el backend en Supabase, todo el frontend
en Netlify, y de Cloudflare solo queda R2 como almacén, sin cómputo.**

Se decidió en dos pasos el mismo día: primero pasar la ingesta a Netlify, y después
consolidarla en Supabase junto al resto del backend. Queda la segunda.

El riesgo aceptado es el que el `02` §5.3 describía: el receptor depende de Postgres para
responder 200, y Meta desuscribe cada Página tras una hora de fallos. Mitigado con **Netlify
Blobs** como amortiguador: si la escritura a Postgres falla, el receptor vuelca el cuerpo
crudo a Blobs y devuelve 200 igual; un cron lo drena al recuperarse. `@netlify/blobs`
funciona fuera del runtime de Netlify pasándole `siteID` y un token, así que una Edge Function
de Supabase puede escribir ahí.

**No puede ser Supabase Storage:** sus metadatos viven en `storage.buckets` y
`storage.objects`, dentro del propio Postgres, así que cae con la base. El amortiguador tiene
que estar en otro proveedor por definición.

**Precisión sobre cuándo sirve:** solo en caídas de más de una hora. Por debajo, los
reintentos de Meta hacen de colchón y el evento acaba entrando. Se mantiene porque la promesa
del producto es que nada se pierda, no porque sea el caso frecuente.

**Cloudflare sale por completo de la arquitectura.** La media saliente pasa a Supabase
Storage, lo que enmienda la nota del `00` §5 —*"no guardar archivos en Supabase"*—, que
buscaba evitar el coste de egreso. Es un problema de escala y no de v1; queda como decisión a
revisar con el egreso medido. La media entrante sigue sin almacenarse nunca, solo su URL.

Límites verificados de Supabase Edge Functions: 400 s de duración en plan de pago, **2 s de
CPU por petición**, 256 MB de memoria. Los 400 s son de reloj, no de cómputo: para el receptor
sobra, pero para el normalizador el límite de CPU obliga a acotar el tamaño de lote y trocear
el trabajo. Es la restricción que más condiciona la fase 2.

Trampa de configuración a no olvidar: **`verify_jwt = false` en `config.toml`.** Meta no manda
bearer token; con la verificación activa la función devuelve 401 y a la hora hay desuscripción
silenciosa.

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

**Delegación completada el 2-ago-2026, 07:12 UTC.** Nameservers cambiados en GoDaddy y
propagación confirmada.

Verificación posterior, toda con evidencia:

- SOA `dns1.p01.nsone.net` —NS1, el proveedor de Netlify— desde siete resolvedores públicos:
  Google, Cloudflare, Quad9, OpenDNS y Verisign.
- Los siete registros resuelven correctos a través de resolvedores públicos.
- Dominio en Resend sigue `verified`, con sus cuatro registros verificados.
- **Prueba de correo de extremo a extremo tras la migración:** enviado
  `cffcb8d0-5534-4065-9af7-f356ff882208` y localizado en la bandeja de entrantes. El correo
  no se cayó en ningún momento.
- Web sirviendo HTTP 200 con el contenido correcto.

Detalle que confundió durante la comprobación: los registros NS cacheados en los resolvedores
seguían devolviendo GoDaddy mientras el SOA ya era de NS1. **El SOA es la señal fiable de que
la delegación cambió**, no el NS, que sobrevive en caché hasta que vence su TTL.

**Lo que queda desbloqueado:** Netlify ya puede emitir y renovar el certificado comodín. No
se pide todavía porque el alias `*.kavea.ai` se añade al sitio de la aplicación, que aún no
existe. Añadirlo al sitio público haría que todos los subdominios sirvieran la landing.

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
| ~~Cambiar nameservers en GoDaddy~~ — **hecho y verificado** | ✅ |
| ~~Ingesta en Cloudflare o Netlify~~ — **decidido: Netlify** | ✅ |
| ~~Contraste de colores semánticos~~ — **decidido: dos tokens por estado** | ✅ |
| ~~Tres o cuatro estados~~ — **decidido: cuatro** | ✅ |
| Rehacer las fases 1 y 2 sobre Netlify. Están escritas contra Cloudflare | Claude |

**Nada bloquea ya la fase 0 por parte de Gabriel.** Lo único pendiente antes de arrancar es
rehacer los planes de las fases 1 y 2, que no bloquean el bloque 0.

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
