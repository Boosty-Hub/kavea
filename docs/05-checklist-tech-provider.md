# Kavea — Checklist de Access Verification (Tech Provider)

**Fecha:** 2 de agosto de 2026
**App ID:** `1623464799201071`
**Portafolio de negocio:** `2167414613399354`
**Estado del trámite:** ajustes pendientes, sin envío

Este documento cubre **un solo trámite**: la Access Verification que designa a Boosty
Digital LLC como Tech Provider. El App Review permiso a permiso es un proceso distinto
y posterior, y en la sección 6 se explica por qué todavía no se puede enviar.

---

## 1. Dónde estamos

Orden de trámites fijado en `03-invariantes-meta.md`, sección `modeloMultitenant`:

| # | Paso | Estado |
|---|---|---|
| 1 | Crear el business portfolio de Boosty | ✅ `2167414613399354` |
| 2 | Completar su Business Verification | ✅ `business_verification_passes: true` |
| 3 | Crear la app de tipo Business | ✅ `kavea`, creada el 2-ago-2026 |
| 4 | Reclamarla desde el portfolio | ✅ visto en pantalla el 3-ago-2026: `Boosty Digital LLC ● Verified` |
| 5 | **Access Verification (Tech Provider)** | ⬜ **formulario abierto, sin enviar** |
| 6 | App Review permiso a permiso | ⬜ bloqueado por el 5 |

Reverificado el 3 de agosto de 2026, y **buena parte de lo que decía este documento
ya no era cierto**:

```
devtools_compliance      → compliant, 0 violaciones, 0 acciones requeridas
devtools_app             → dev_mode, is_live: false, business_verification_passes: true
devtools_app  basic      → privacidad, términos, eliminación de datos, ícono,
                           categoría MESSAGING y dominio kavea.ai: TODO relleno
Publish → App settings   → "All required app settings are complete"
devtools_webhook_list    → los TRES topics suscritos y activos contra Supabase:
                           page (9 campos), instagram (7), whatsapp_business_account (1)
```

**Los ajustes básicos ya no están en `null`**: la sección 2 de este documento
describe un estado que se resolvió entre el 2 y el 3 de agosto. Lo que sí sigue sin
confirmar es lo de siempre, y ahora con plazo: la Access Verification pide la web de
la empresa y Meta compara lo que ve con el portafolio verificado.

**Plazo duro descubierto el 3 de agosto**, y no estaba en ningún documento: la
pantalla de Access Verification dice *"To avoid restrictions to 2 apps, this must be
completed by 10/2/2026"*. El 2 de octubre de 2026, y afecta a **dos** apps del
portafolio, no solo a `kavea`.

**El bloqueo real no era el que este documento suponía.** No se puede ni AÑADIR un
permiso al App Review sin ser Tech Provider: al pulsar `+ Add to App Review` sale un
diálogo que lo dice y avisa de que *"this decision cannot be reversed"*. Y el
`can_submit: false` que la API devolvía con motivo *"a previous submission is in
review"* es un mensaje engañoso: la pantalla de submissions dice **"Not submitted"** y
no hay ninguna cola. El `submission_id` que parecía fantasma es el identificador del
borrador.

---

## 2. Ajustes básicos de la app

Ruta: **App Dashboard → App settings → Basic**

> ⚠ **Congelar después del envío.** El documento 03 marca como NO_VERIFICABLE que
> cambiar ajustes tras el envío obligue a repetir la revisión, pero la prudencia es
> dejar esto quieto una vez enviado. Rellenar bien ahora sale más barato que corregir
> después.

### 2.1 URLs

Usar las rutas canónicas en español, **no los alias en inglés**. Los alias existen y
funcionan, pero responden con un 301 y una redirección es un punto de fallo extra en
un rastreador que no controlamos. Menos saltos, menos formas de que falle.

| Campo del dashboard | Valor |
|---|---|
| Privacy Policy URL | `https://kavea.ai/privacidad` |
| Terms of Service URL | `https://kavea.ai/terminos` |
| User Data Deletion → *Data Deletion Instructions URL* | `https://kavea.ai/eliminacion-de-datos` |
| App Domains | `kavea.ai` |
| Website / Site URL | `https://kavea.ai` |

Sobre **User Data Deletion**: el campo ofrece dos modos, instrucciones o callback. Hoy
va en **instrucciones**, porque el callback todavía no existe. Cuando el sistema esté
en pie hay que cambiarlo al **Data Deletion Callback URL**, que debe responder JSON con
exactamente `{url, confirmation_code}`. Recordatorio del documento 03: el deauthorize
callback y el data deletion callback son dos cosas distintas y ambas se implementan.

### 2.2 Ícono

Archivo listo: `brand/kavea-app-icon-1024.png` — 1024 × 1024, isotipo sobre Papel
(`#FAF8F4`).

Se usó el isotipo y no el lockup vertical porque en los diálogos de OAuth el ícono se
muestra a unos 60 px, tamaño al que el wordmark sería ilegible. El nombre de la app ya
aparece como texto al lado del ícono en toda la interfaz de Meta.

### 2.3 Categoría

El valor actual es `ALL`, que es el marcador por defecto y no describe nada. Elegir en
el desplegable la opción de mensajería de negocio; si aparece *Messaging*, esa; si no,
*Business and Pages*.

### 2.4 Descripción corta

```
Bandeja unificada de WhatsApp, Instagram y Messenger, con agentes que clasifican,
responden y escalan a una persona del equipo.
```

### 2.5 Descripción larga

```
Kavea es un centro de operaciones conversacionales para empresas. Unifica en una sola
bandeja los mensajes que un negocio recibe por WhatsApp Business Platform, Instagram
Direct y Facebook Messenger, y permite a su equipo responderlos desde un mismo lugar,
con el historial completo de cada contacto y sin cambiar de aplicación por canal.

Sobre esas conversaciones operan agentes automáticos que clasifican la intención del
mensaje, redactan borradores de respuesta y aplican reglas de escalamiento a una
persona del equipo. Cada decisión automática queda registrada para poder auditarla.

Kavea es operado por Boosty Digital LLC y presta servicio a empresas en Venezuela,
República Dominicana, México y Estados Unidos. Cada negocio cliente conecta sus propias
cuentas mediante Facebook Login for Business y delega de forma explícita los activos
que autoriza: su Página de Facebook y la cuenta profesional de Instagram vinculada.
```

### 2.6 Correo de contacto

Actualmente `gmontiel@spatiumgroup.com`, con `contact_email_verified: false`.

Hay que **verificarlo** — Meta manda a esa dirección los avisos de restricción, que es
justo lo que no se puede perder. Si se prefiere una dirección del dominio propio, se
cambia antes de verificar, no después.

---

## 3. Correo del dominio kavea.ai

Toda la web publica una sola dirección: **`support@kavea.ai`**. Una dirección publicada
es una bandeja que vigilar; cuatro son tres que se quedan sin leer.

**Tiene que recibir antes del envío.** Una dirección publicada en una política de
privacidad que rebota es motivo de rechazo.

Se resuelve con **Resend inbound** sobre el dominio, sin escribir código: Resend acepta
el correo y lo almacena aunque no haya ningún webhook configurado. La dirección queda
operativa desde el momento en que se añaden los registros DNS, mucho antes de que exista
la aplicación.

Registros DNS que hay que añadir en el proveedor de `kavea.ai`:

- El **MX** de recepción que indique Resend.
- El **TXT de DKIM** que ya está emitido, con el valor `p=MIGfMA0GCSqGSIb3DQEB…`.
  Es una clave **pública** y va publicada en DNS por diseño.
- **SPF** y **DMARC**, recomendados para que el correo saliente no caiga en spam.

> La API key de Resend (`re_…`) no aparece en este documento ni en ningún repositorio.
> Va en variables de entorno del servidor cuando exista backend.

---

## 4. Datos societarios

Confirmados el 2 de agosto de 2026. Ya no hay campos `porConfirmar` en
`kavea-web/src/data/legal.ts`:

| Campo | Valor |
|---|---|
| Razón social | Boosty Digital LLC |
| Jurisdicción | Estado de Florida, Estados Unidos de América |
| Domicilio | 4702 Capri Place, Orlando, Florida 32811 |

Deben coincidir con lo que consta en el portafolio de negocio verificado: **Meta
contrasta ambos**.

---

## 5. Envío de la Access Verification

Ruta: **App Dashboard → banner "Become a Tech Provider"**, o
`developers.facebook.com/apps/1623464799201071/`

Requisitos que ya se cumplen:

- Business Verification del portafolio completada ✅
- App de tipo Business creada ✅
- App conectada al portafolio ⚠ confirmar en pantalla
- Estado de cumplimiento sin violaciones abiertas ✅

Plazo esperado según el documento 03: **unos 5 días** de decisión. Es un proceso
independiente del App Review, y es prerrequisito suyo.

---

## 6. Por qué el App Review todavía no se puede enviar

No es cautela. Son tres requisitos de Meta recogidos en `03-invariantes-meta.md` que
hoy es imposible cumplir porque el sistema no existe:

1. ~~**Al menos una llamada exitosa por cada permiso, dentro de los 30 días previos al
   envío.** Kavea no ha hecho ninguna llamada a la API todavía.~~ **CUMPLIDO el 3 de
   agosto de 2026.** Era falso que no hubiera llamadas: el contador por permiso del
   use case ya marcaba tráfico real, y lo que faltaba se provocó a mano.

   ```
   pages_manage_metadata       148    instagram_manage_messages    53
   pages_read_engagement       148    instagram_basic              14
   pages_show_list             104    whatsapp_business_messaging   5
   pages_messaging             103    instagram_manage_comments     3  (2 lecturas + 1 escritura)
   business_management          58    whatsapp_business_management   1
   Human Agent                   1
   ```

   Ojo con el contador que NO sirve para esto: `devtools_api_usage call_volume`
   devuelve `total_calls: 0` a 30 días. Ese es el volumen para límites de tasa, no el
   contador por permiso que mira el App Review. Confundirlos cuesta una tarde.

   La llamada de Human Agent salió con `messaging_type=MESSAGE_TAG&tag=HUMAN_AGENT` y
   Meta la aceptó, pero media hora después del entrante: demuestra que el tag se
   concede, no que funcione pasadas las 24 h. Para eso está
   `.github/workflows/human-agent.yml`.

2. **Un screencast por permiso, con descripción propia y sin copiar y pegar.** No hay
   producto que grabar. La feature Human Agent se somete aparte, con el suyo.

3. **Un tenant demo funcionando al que el revisor pueda entrar.** Cita literal de Meta:
   *"If we are unable to access your app to test it, your entire submission will be
   rejected."*

A eso se suma un cuarto motivo, este de estrategia: pedir permisos que la app no usa es
causa documentada de no aprobación, y un rechazo queda registrado en el historial de la
app. El coste de esperar es cero; el de un rechazo temprano, no.

**Cuándo se envía:** al terminar la Fase 2 del documento base —bandeja unificada
operativa sobre datos reales—, que es el primer momento en que existen las llamadas,
los screencasts y el tenant demo. La ventana de 30 días de las llamadas exitosas obliga
además a que el envío sea inmediatamente posterior, no meses después.

---

## 7. Qué queda pendiente después

- ~~Suscribir los webhooks de los tres canales.~~ **HECHO.** Verificado por API el
  3 de agosto de 2026: los tres topics activos contra
  `sdazqohyjzzylwbkvovx.supabase.co`.
- ~~Auditar y quitar `business_management`.~~ **NO PROCEDE.** La guía de Meta de
  «API setup with Facebook login» lo lista como **requerido en los dos bloques**, el
  de mensajería y el de contenido. No era contaminación del use case: es dependencia
  declarada de la vía elegida. Zanja también la contradicción que `03` dejaba abierta
  entre el overview de Messenger y la Permissions Reference, al menos a efectos de lo
  que el dashboard exige.
- Cambiar el campo de eliminación de datos de instrucciones a callback.
- Implementar el deauthorize callback, que es distinto del anterior.
- Configurar Facebook Login for Business y capturar el `config_id`. Sigue pendiente y
  ahora con un dato concreto: `devtools_app advanced_settings` devuelve
  `oauth_redirect_uris: null` y `deauth_callback_url: null`.
- **Quitar `pages_utility_messaging` del use case de Messenger.** Está en el borrador
  del App Review con **0 llamadas**, y `fases/05-fase-configuracion.md` lo declara
  fuera de v1. Se quita con `Remove` desde el use case, NO con la papelera de la
  página de submissions: el borrador se autopobla desde los use cases, así que lo que
  se quita solo del envío puede volver.
- **`public_profile` en el borrador.** Su propia descripción dice que se concede
  automáticamente a todas las apps. Pedirlo en revisión añade una fila en cero sin
  ganar nada, pero probablemente Meta lo reinyecte en cada sincronización del
  borrador. Vigilar, no pelear.
- **La feature «Business Asset User Profile Access» NO hace falta.** Se creía
  necesaria para el nombre y la foto del contacto. Medido el 3 de agosto de 2026:
  `GET /{igsid}?fields=name,username,profile_pic` devuelve las tres cosas con el Page
  Access Token y `instagram_manage_messages`, que ya se tiene. Un permiso menos que
  pedir, y una tarea nueva: hoy `contacts.nombre` está en `null` y la bandeja muestra
  tarjetas sin nombre pudiendo tenerlo.
