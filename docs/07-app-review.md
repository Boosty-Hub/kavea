# Kavea — El envío del App Review

Fuente de la verdad de la solicitud a Meta: lo que Meta pide **con sus palabras**,
lo que Kavea responde **con las nuestras**, y qué vídeo sostiene cada permiso.

**Por qué existe.** El formulario del App Review vive dentro del panel de Meta,
detrás de una sesión que solo tiene Gabriel, repartido en trece modales que hay
que abrir de uno en uno. Si lo rechazan, si caduca, o si un día lo retoma otra
persona, sin esto habría que reconstruirlo desde cero abriendo trece ventanas.
Y las respuestas importan: son un compromiso ante Meta sobre qué hace el
producto, y tienen que seguir siendo verdad dentro de seis meses.

**Regla, la misma que la bitácora:** aquí solo entra lo que se ha visto. Las
citas de Meta son literales de sus modales; donde no se ha abierto el modal se
dice que falta, y no se rellena de memoria.

> Al día del **6 de agosto de 2026**.

---

## 1. Estado del envío

`app_status: dev_mode` · `is_live: false` · `submission_status: UNSUBMITTED` ·
`submitted_time: null`

Nunca se ha enviado nada. La pantalla de App Review dice «Not submitted» con la
lista de trece peticiones en borrador, cada una asociada a su use case.

**Aviso sobre la API:** `devtools_app_review status` devuelve
`cannot_submit_reason: "Cannot submit to App Review while a previous submission
is in review"`. Es engañoso. No hay ningún envío en revisión: el panel dice «Not
submitted» y `submitted_time` es null. Se perdió media hora buscando un envío
atascado que no existe.

### Las cinco secciones del formulario

| Sección | Estado el 6-ago |
|---|---|
| Verification | ✅ verde — es lo que dio el Tech Provider |
| App settings | ✅ verde |
| **Allowed usage** | ⚪ trece tarjetas, una por permiso |
| **Data handling** | ⚪ sin abrir |
| **Reviewer instructions** | ⚪ marcada *Needs your review* |

Abajo: *«You must complete all steps before you can submit for review»*, con el
botón **Submit for review** en gris.

### Los tres requisitos por permiso

Los enseña el globo de **Requirements** de cada fila, en *Customize use case*:

| Requisito | Estado |
|---|---|
| Business Verification | 🟢 verde en todos |
| App Review | ⚪ |
| Data handling questions | ⚪ |

**Dónde NO está el Data Use Checkup.** No está en «Required actions» —esa
pantalla dice literalmente *«You don't currently have any required actions»*— ni
en `developers.facebook.com/apps/{id}/data-use-checkup/`, que no carga. El
checkup anual solo existe cuando Meta abre la ventana, y no la tiene abierta. Lo
que sí está pendiente son las **Data handling questions**, que viven dentro del
formulario del envío.

### Lo que pide cada tarjeta de *Allowed usage*

Verbatim del modal:

> Please provide a detailed description of how your app uses the permission or
> feature requested, how it adds value for a person using your app, and why it's
> necessary for app functionality.

> Upload a screen recording that demonstrates how your app will use this
> permission or feature so we can confirm it is used correctly and does not
> violate our policies.

> Make sure you've completed required API test calls for added permissions.
> **Completed test calls can take up to 24 hours to show for your app.**

Y una casilla: *«If approved, I agree that any data I receive through {permiso}
will be used in accordance with the allowed usage.»*

Esas 24 horas explican por qué un contador en cero no significa que la llamada no
se hizo.

---

## 2. Los trece permisos

| Permiso | Llamada API | Vídeo | Texto | Notas |
|---|---|---|---|---|
| `whatsapp_business_messaging` | ⏳ 0 de 1, en las 24 h | ✅ | ✅ | Dos envíos correctos el 6-ago |
| `pages_show_list` | — no la pide | ✅ | ✅ | |
| `pages_manage_metadata` | ✅ Completed | ✅ | ✅ | |
| `pages_utility_messaging` | ✅ hecha el 6-ago | ✅ | ✅ | Construido el 6-ago. Ver §3 |
| `instagram_manage_comments` | ✅ Completed | ✅ | ✅ | Pantalla construida el 6-ago |
| `pages_messaging` | ✅ Completed | ✅ | ✅ | Además pide Página de prueba e instrucciones |
| `business_management` | ✅ Completed | ✅ | ✅ | |
| `instagram_manage_messages` | — no la pide | ✅ | ✅ | |
| `pages_read_engagement` | ✅ Completed | ✅ | ✅ | |
| `public_profile` | — | — no lo pide | ✅ | Solo la casilla de conformidad |
| `whatsapp_business_management` | ✅ Completed | ✅ | ✅ | |
| `instagram_basic` | ✅ Completed | ✅ | ✅ | |
| `Human Agent` | — no la pide | ✅ | ✅ | Ventana hasta el **11-ago 02:32 UTC** |

Dependencias, todas ya en verde: `pages_show_list` → `pages_manage_metadata` y
`pages_read_engagement`; `instagram_basic` → `instagram_manage_comments` y
`instagram_manage_messages`; `instagram_business_manage_messages` → `Human Agent`.

---

## 3. Permiso a permiso

### `whatsapp_business_messaging`

**Meta:** *«allows an app to send WhatsApp messages to a specific phone number,
upload and retrieve media from messages, manage and get WhatsApp business profile
information, and to register those phone numbers with Meta. The allowed usage for
this permission is to create messaging experiences initiated by a customer or a
business.»*

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the WhatsApp Business Account and phone number; Kavea is their technology provider and is verified as such by Meta.

We use whatsapp_business_messaging to receive the WhatsApp messages that customers send to our user's business number, and to send the replies our user's staff writes.

End-to-end flow: a customer sends a WhatsApp message to the business number. Kavea receives the messages webhook through the Cloud API and shows the conversation in that business's inbox, where several staff members can see it, assign it and answer. When a staff member writes a reply, Kavea calls the Cloud API on behalf of that phone number, inside the 24-hour customer service window. We also process the statuses webhook so staff can see whether their reply was delivered and read.

Value for the person using the app: these businesses answer WhatsApp from a single phone that only one person can hold at a time. Kavea lets a team share that number, see the full history of each customer across WhatsApp, Instagram and Messenger, and stop losing messages.

Without this permission Kavea cannot receive or send WhatsApp messages, which is the core of the product for this use case.
```

**Vídeo:** `whatsapp_business_messaging`. Bandeja, hilo con entrantes y salientes
reales, píldora de la ventana de 24 h, y un envío de verdad desde el compositor.

### `pages_show_list`

**Meta:** *«allows your app to access the list of Pages a person manages. The
allowed usage for this permission is to show a person the list of Pages they
manage and verify that a person manages a Page.»*

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Facebook Page; Kavea is their technology provider and is verified as such by Meta.

We use pages_show_list to read the list of Pages that the person authorizing Kavea manages. It is the first thing we need: a business cannot connect a Page to Kavea if we cannot see which Pages that person administers.

The screen recording shows the portfolio view, where Kavea lists the Pages available to the authorized user together with their connection state. From this list the business selects the Page whose conversations will arrive in its inbox, and our support staff can tell whether a Page is already connected to another workspace.

With this permission we only read the Page id, its name, and the fact that the person manages it. We do not read Page content, posts or insights.

Without pages_show_list Kavea cannot offer the person any Page to connect, so no part of the messaging product can be set up.
```

**Vídeo:** `pages_show_list`. Pantalla de portafolio recorriendo las Páginas.

**Ojo:** el texto describe lo que se ve en el vídeo, no el flujo ideal. No promete
un diálogo de selección de Página, porque Facebook Login for Business todavía no
está configurado y el revisor no lo encontraría. Cuando exista, se amplía.

### `pages_manage_metadata`

**Meta:** *«allows your app to subscribe and receive webhooks about activity on
the Page, and to update settings on the Page. The allowed usage for this
permission is to help a Page Admin administer and manage a Page.»*

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Facebook Page; Kavea is their technology provider and is verified as such by Meta.

We use pages_manage_metadata for one purpose: to subscribe our app to the Page's webhooks so that the messages customers send actually reach the business inbox. Without that subscription no message ever arrives and the product does nothing at all.

We subscribe only to the messaging fields we need: messages, message_echoes, message_reads, message_reactions, messaging_postbacks, messaging_referrals, messaging_optins, messaging_handovers and feed.

We also read the subscription back, and this is why the permission matters beyond initial setup. When webhook deliveries fail for about an hour, Meta unsubscribes the Page silently and per customer, with no error and no notification. The business would simply stop receiving messages without knowing why. Kavea re-checks the subscription every day and shows its state on the channels screen, which is what the screen recording shows: each connected channel with the result of every individual check, so the operator can tell exactly which part is failing instead of only that something is wrong.

We do not change any other Page setting with this permission. We do not modify the Page name, description, profile picture or published content.
```

**Vídeo:** `pages_manage_metadata`. Pantalla de canales con las siete
comprobaciones.

### `Human Agent`

**Meta:** *«allows your app to have a human agent respond to user messages using
the human_agent tag within 7 days of a user's message. The allowed usage for this
feature is to provide human agent support in cases where a user's issue cannot be
resolved in the standard messaging window. Examples include when the business is
closed for the weekend, or if the issue requires more than 24 hours to resolve.»*

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Human Agent is what lets a person from the business answer a customer after the standard 24-hour messaging window has closed.

Why our users need it: a customer writes on Instagram or Messenger and the answer sometimes cannot be given within 24 hours. The business is closed for the weekend, the question needs a quote from a supplier, or a shipment has to be checked with a courier. In our markets most of what arrives on a Friday night is answered on Monday.

How it works in the product, as shown in the recording: Kavea displays the state of the messaging window on the conversation itself. Between 24 hours and 7 days the conversation header reads "solo intervención humana" (human intervention only), and the composer shows a notice explaining that the reply will be sent as a human agent intervention and is only valid up to 7 days. A staff member writes the reply and Kavea sends it with messaging_type=MESSAGE_TAG and tag=HUMAN_AGENT.

Two guarantees enforced in code, not by policy. First, the tag is only offered between 24 hours and 7 days: before that the standard window is used, and after that the composer is closed and tells the operator that the customer has to write again. Second, automated senders can never use it: our window function refuses the tag to any sender that is not a human, so an AI agent cannot emit HUMAN_AGENT under any circumstance.

Without this feature the business loses the conversation the moment 24 hours pass.
```

**Vídeo:** `human_agent`. Cabecera con «solo intervención humana», aviso del
compositor con la política escrita, y el envío saliendo bajo la etiqueta.

El último párrafo está puesto a propósito: el abuso de tags es causa documentada
de restricción de la mensajería de una Página, y al revisor le importa leer que el
límite está en el código.

### `pages_utility_messaging`

**Meta:** *«allows an app to access a Page's utility messaging templates. The
allowed usage for this permission is to manage a Page's utility messaging
templates and send a Page's utility messages through Messenger.»*

Ojo al alcance: **no es «mandar mensajes de utilidad» en general, es gestionar
las plantillas.** Se leyó mal al principio y por eso se creía que no había nada
que construir.

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Facebook Page; Kavea is their technology provider and is verified as such by Meta.

We use pages_utility_messaging to manage the utility message templates of our user's Page: order updates, appointment reminders and account notices that the business needs to send outside a normal conversation.

What the screen recording shows: the templates screen in Kavea has a section for Messenger utility templates. Kavea reads the Page's templates live from Meta every time the screen is opened and shows each one with the status Meta gave it, including rejected ones. The operator then creates a new template, writes its body with numbered placeholders, fills in an example value for each placeholder, and Kavea sends it to Meta with category UTILITY. The new template appears in the list with the status Meta returned.

One deliberate design decision the reviewer will notice: we do not store these templates in our own database. Their approval status belongs to Meta and can change after we read it, so a local copy would eventually show "approved" for a template Meta has already rejected. We read them live instead.

Why the business needs it: today these businesses have no way to reach a customer once the conversation window has closed for anything routine, such as telling them an order shipped. Utility templates are the compliant way to do that, and managing them from the same place where the team answers messages is the point of the product.
```

**Vídeo:** `pages_utility_messaging`. La sección leyendo de Meta, la lista con dos
plantillas aprobadas y una rechazada, y la creación de una nueva de punta a
punta hasta verla aparecer aprobada.

### `business_management`

**Meta:** *«allows your app to read and write with the Business Manager API. The
allowed usage for this permission is to manage business assets such as an ad
account and to claim ad accounts.»*

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Kavea is a technology provider verified by Meta, and each of our users is a business that owns its own Facebook Page, Instagram professional account and WhatsApp Business Account.

We use business_management to read the messaging assets of the business portfolio a client connects: which Pages and WhatsApp Business Accounts exist in it, their names and identifiers. That is what lets a business pick the right asset when it connects Kavea, and what lets our support staff answer "which workspace is this Page connected to" without asking the customer to send screenshots.

The screen recording shows the two screens that use it: the portfolio view, which lists the messaging assets of the connected portfolio, and the workspaces view, which shows which asset belongs to which customer workspace.

We do not use this permission for advertising. We do not read, create or claim ad accounts, we do not read campaign or spend data, and we do not manage billing. Kavea has no advertising features at all. We read the messaging assets and nothing else.

Without business_management we cannot enumerate the assets of a business portfolio, so connecting a client requires copying identifiers by hand, which is both error-prone and a way to connect the wrong account.
```

**Vídeo:** `business_management`. Portafolio y espacios.

El párrafo que acota lo que **no** se hace está puesto a conciencia: este permiso
concede la Business Manager API entera, incluida publicidad, y un revisor que lee
«business_management» sin más piensa en anuncios.

### `instagram_manage_messages`

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Instagram professional account; they connect it to Kavea, and Kavea is their technology provider, verified as such by Meta.

We use instagram_manage_messages to receive the Instagram Direct messages people send to our user's business account, and to send the replies our user's staff writes.

End-to-end flow, which is what the screen recording shows: a customer sends a Direct message to the business account. Kavea receives the messages webhook and shows the conversation in that business's shared inbox, where several staff members can see it, assign it and answer, next to the same person's WhatsApp and Messenger threads when it is the same contact. When a staff member writes a reply, Kavea calls the Send API on behalf of that account inside the standard 24-hour window, and the thread shows the delivery and read receipts.

We also read the sender's username and profile picture so the person appears in the inbox with their real identity instead of a numeric ID.

Value for the person using the app: today these businesses answer Instagram from the app on one person's phone. Kavea turns that into a shared inbox with assignment and history, and one view of each customer across all three channels.

Without this permission Kavea cannot receive or answer Instagram Direct messages, which is the core of the product for this use case.
```

**Vídeo:** `instagram_manage_messages`. Bandeja y un hilo abierto.

### `pages_read_engagement`

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Facebook Page; Kavea is their technology provider and is verified as such by Meta.

We use pages_read_engagement together with pages_show_list to read what a Page IS, not what happens on it: its name, its identifier, and which tasks the person connecting it can perform on it. Reading the tasks is how we refuse a connection early: a person who cannot perform the MESSAGE task on a Page cannot have that Page's conversations delivered to Kavea, and telling them at connection time is better than letting them finish the setup and discover it when the first customer writes and nothing arrives.

The screen recording shows the portfolio view, where each Page is listed with its name and connection state.

We do not read posts, comments, reactions, insights or any engagement metric with this permission, and Kavea has no screen that would show them.

Without it we cannot show a person a recognisable name for the Pages they manage, only numeric identifiers, and they cannot tell which one to connect.
```

**Vídeo:** `pages_read_engagement`. Portafolio.

### `public_profile`

Es el único permiso cuya tarjeta pide **solo la casilla de conformidad**: ni
descripción ni vídeo. Se concede automáticamente a todas las apps.

Si en algún momento pidiera texto:

```
Kavea uses public_profile only to identify the person who authorizes the connection between a business and Kavea, so that the audit log of the workspace can record who connected an account and when. We do not build a profile of that person and we do not use it for anything else.
```

### `whatsapp_business_management`

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the WhatsApp Business Account; Kavea is their technology provider and is verified as such by Meta.

We use whatsapp_business_management to read the state of our user's WhatsApp Business Account: its phone numbers, the display name and its approval state, and the quality rating Meta assigns to the number. We also read and maintain the webhook subscription of the account, which is what makes messages arrive at all.

Why this matters beyond setup, and this is what the screen recording shows: the channels screen lists each connected channel with the result of every individual check, so the operator can tell exactly which part is failing instead of only that something is wrong. A WhatsApp number whose quality rating has dropped, or whose display name was rejected, keeps working for a while and then stops, and the business has no idea why. Kavea reads that state daily and shows it before it becomes an outage.

We do not use this permission to create accounts, register numbers on behalf of anyone, or change billing.

Without it Kavea cannot tell a business whether its own WhatsApp number is healthy, and cannot detect that Meta silently unsubscribed it.
```

**Vídeo:** `whatsapp_business_management`. Canales, con la marca y el estado de
cada uno.

### `instagram_basic`

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Instagram professional account, which they connect to Kavea through the Facebook Page it is linked to.

We use instagram_basic to read which Instagram professional account is linked to the connected Page, and its id and username. That identifier is what every other part of the integration is keyed on: it is the account whose messages and comments arrive at the inbox, and the one Kavea sends replies from. Without resolving it, an incoming message cannot be attributed to the right business.

The screen recording shows the inbox of a connected account, where the Instagram conversations of that specific account are the ones that appear.

With this permission we read the account id and username. We do not read media, followers, insights or any content of the account.

Without instagram_basic there is no way to know which Instagram account belongs to the Page being connected, so no Instagram feature of the product can work.
```

**Vídeo:** `instagram_basic`. Bandeja.

---

## 3.bis Data handling

Las cinco preguntas de la sección, con lo que se respondió y por qué. **Son
declaraciones legales ante Meta**, no descripciones de producto: el propio
formulario avisa de que una respuesta vaga puede costar el acceso a la
plataforma. Si algo de esto cambia, aquí es donde hay que venir a corregirlo.

### `processor-0` — ¿Hay procesadores con acceso a los datos de Meta? → **Sí**

Verificado sobre el código el 6 de agosto de 2026, no de memoria: fuera de
`graph.facebook.com` y del propio dominio, las funciones de borde solo hablan con
**dos** destinos externos.

| Procesador | Categoría | País | Qué procesa |
|---|---|---|---|
| **Supabase, Inc.** | IT solutions and services | United States | Base de datos, almacenamiento y funciones. Conversaciones, contactos y credenciales cifradas. AWS `us-east-1` |
| **Netlify, Inc.** | IT solutions and services | United States | Alojamiento de la aplicación y el amortiguador de objetos con los cuerpos crudos de webhook |

**El amortiguador de Netlify no es hipotético:** 2 de los 118 eventos recibidos
entraron por la ruta `blobs`. Netlify ha custodiado cuerpos de Meta de verdad, y
por eso se declara.

**Resend NO se declara.** Hoy solo transporta correo operativo de Kavea
—invitaciones y avisos internos— y no lleva datos recibidos de Meta. Si algún día
un correo incluye contenido de una conversación, pasa a ser procesador y hay que
añadirlo.

**Categorías que NO se marcan, y el motivo:** ni *Analytics* ni *Advertising*.
Marcar «Advertising» contradiría directamente la descripción de
`business_management`, que dice *«We do not use this permission for
advertising»*, y una contradicción entre dos respuestas del mismo envío es de las
que un revisor sí detecta.

### `responsible-1` — Quién responde por los datos

```
Boosty Digital LLC (EIN 37-2223053), a limited liability company registered in the United States, is the data controller for all Platform Data received from Meta. Gabriel Andres Montiel Toro, Chief Executive Officer, is the individual accountable for it within the company.
```

La sociedad es la controladora; la persona se nombra como responsable **dentro**
de ella. Redactado así a propósito: poner solo el nombre de una persona física en
un campo que pide el data controller la convierte en controladora a título
personal, que no es lo que se quiere declarar.

### `responsible-2` — País → **United States of America**

### `requests-3` — Peticiones de seguridad nacional en 12 meses → **No**

### `requests-4` — Procesos ante peticiones de autoridades

Son compromisos sobre procesos internos. **Solo se marca lo que sea verdad hoy**,
no lo que suene bien: Meta puede pedir que se demuestre.

## 3.ter Acceso del revisor

El revisor entra en **`boosty.kavea.ai`** con un usuario propio,
`revisor@kavea.ai`, rol `agente`. **La contraseña no está en este repositorio**
—ninguna clave entra— y vive solo en el formulario de Meta.

### Por qué el espacio de Boosty y no uno inventado

Porque un espacio sintético no puede recibir el mensaje del revisor. Las
instrucciones de `pages_messaging` le piden escribir a la Página desde su
Facebook, y ese mensaje aterriza donde está conectada la Página: en Boosty. Un
espacio vacío no tiene canal por el que llegue nada.

Se creó también un espacio `demostracion` con el flujo real de alta —primera vez
que se ejecuta, y funcionó— pero queda sin uso hasta que tenga una Página propia
conectada y su alias de DNS. Ver §5.

### Lo que se borró antes de dar acceso, y por qué

El espacio de Boosty tenía **cinco** conversaciones y dos eran de terceros
reales: `Super Cauchos Cia Ltda` negociando la hora de una reunión, y otra
persona escribiendo a «Paty». Enseñárselas a un revisor es enseñar datos de
clientes que no lo han consentido.

Se borraron **de Kavea**, y sin pérdida operativa: llegan por la doble
suscripción de la WABA y **quien las atiende es Kommo**, que las conserva. Kavea
no es el sistema de registro de esas conversaciones.

Comprobado antes de borrar, con `rollback`: 5 → 3 contactos, 52 → 40 mensajes.
Y comprobado después entrando como el revisor: ve dos conversaciones, las dos de
Gabriel, con los tres canales representados.

**Cerrarlas no habría bastado**: `listarTarjetas` sin filtro devuelve también las
cerradas, así que seguirían a la vista.

### Instrucciones para el formulario

```
Kavea is a shared team inbox. The workspace below belongs to Boosty Digital LLC and is used for testing: every conversation in it is with Boosty's own accounts, so no third-party customer data is exposed.

URL: https://boosty.kavea.ai
Email: revisor@kavea.ai
Password: (see the credentials field)

The workspace is connected to the Boosty.digital Facebook Page, its linked Instagram professional account, and Boosty's WhatsApp Business number, so all three channels can be tested against real accounts.

To test Messenger (pages_messaging):
1. Grant the Tester role in App Roles to a real Facebook account. Test users created in App Roles cannot receive messages from a Page.
2. From that account, send a message to the Boosty.digital Page (m.me/boosty.digital).
3. Sign in above. The conversation appears in Bandeja (Inbox) within seconds.
4. Open it, type a reply in the composer and press Enviar. The reply is delivered to the Facebook account from step 2.

To test Instagram (instagram_manage_messages, instagram_basic, Human Agent):
Open the conversation in Bandeja. The header shows the remaining messaging window per channel. When a conversation is older than 24 hours the header reads "solo intervención humana" and the composer states that the reply will be sent as a human agent intervention.

To test comments (instagram_manage_comments):
Open Comentarios in the left menu. Press "Traer de Meta" to read the comments of the connected Instagram account, then reply to one in public.

To test WhatsApp (whatsapp_business_messaging, whatsapp_business_management):
Open Ajustes > Canales to see each connected channel with its state. WhatsApp conversations appear in the same inbox.

To test utility templates (pages_utility_messaging):
Open Ajustes > Plantillas and scroll to "De utilidad, en Messenger". The list is read live from Meta and shows each template with the status Meta gave it. A new one can be created from there.
```

## 4. Los vídeos

Se graban con `scripts/grabar-screencasts.mjs`, que inicia sesión de verdad y
recorre la aplicación. Nueve de los doce, en una pasada:

```
$env:TARJETA_WHATSAPP='<tarjeta con ventana abierta>'
node scripts/grabar-screencasts.mjs <correo> <clave> screencasts
```

| Vídeo | Qué enseña |
|---|---|
| `whatsapp_business_messaging` | Envío real por la cola de Kavea, con la ventana visible |
| `human_agent` | La ventana de intervención humana y el envío bajo la etiqueta |
| `whatsapp_business_management` | Canales con su marca y estado: Kavea lee los activos de la WABA |
| `pages_show_list` | Portafolio con las Páginas del usuario |
| `business_management` | Portafolio y espacios |
| `pages_read_engagement` | Portafolio |
| `pages_manage_metadata` | Canales con las siete comprobaciones |
| `instagram_basic` | Bandeja |
| `instagram_manage_messages` | Bandeja y un hilo abierto |

**Salen en `.webm` (VP8).** Playwright graba con su propio ffmpeg y solo trae ese
códec. Si Meta los rechaza: `scoop install ffmpeg` y convertir.

**Dos reglas del guion que costaron una regrabación:**

- La sesión se abre **fuera** de la grabación. Grabando el login, cada vídeo
  empezaba con diecisiete segundos de pantalla en blanco y formulario.
- `mouse.wheel` desplaza lo que hay **bajo el cursor**, y el cursor arranca en
  (0,0), que es la barra lateral. Hay que posicionarlo sobre el hilo antes.

Y una que no es del guion: después de enviar **no se desplaza a mano**. Lo hace
la aplicación. Empujar con la rueda taparía el día que dejara de funcionar.

### Los tres que faltan

| Permiso | Qué falta de verdad |
|---|---|
| `instagram_manage_comments` | Construir la pantalla de comentarios. El modelo (0066) y la ingesta (0067) están en producción |
| `pages_messaging` | Una conversación viva de Messenger. Nunca se ha probado de extremo a extremo |

---

## 5. Lo que hunde la revisión y no sale en ninguna casilla

Ninguna de estas tres marca una casilla, pero el revisor abre la app y prueba.

**Facebook Login for Business no está configurado.** El Dashboard lo pinta en
verde y la API dice `oauth_redirect_uris: null` con Strict Mode activo. El tick
significa que la sección está montada, no configurada. El revisor intentará
conectar una cuenta, Meta rechazará el callback y no habrá explicación posible.

Decisión previa pendiente: **qué host lleva el callback**. Con Strict Mode la
coincidencia es exacta, así que no puede variar por cliente; el `state` firmado ya
lleva `organization_id`, de modo que un host fijo basta.

**No hay tenant de demostración.** El revisor necesita entrar en Kavea y ver la
bandeja funcionando. No hay usuario ni espacio preparado.

**Los tres callbacks existen pero no están pegados en el panel.** Construidos y
probados el 6-ago; `deauth_callback_url` sigue en null.

```
Deauthorize callback URL     https://sdazqohyjzzylwbkvovx.supabase.co/functions/v1/meta-desautorizar
Data deletion callback URL   https://sdazqohyjzzylwbkvovx.supabase.co/functions/v1/meta-borrado
```

---

## 6. Medido, para no volver a averiguarlo

- **En modo desarrollo Meta solo entrega webhooks de Instagram y Messenger de
  personas con rol en la app.** Un desconocido que escriba a la cuenta no genera
  ningún webhook. Es la razón de que haya una sola conversación de Instagram y
  sea la del propio administrador. WhatsApp **no** está sujeto a esto: entra
  tráfico de terceros con la WABA suscrita.
- **Los contadores de llamadas tardan hasta 24 horas.** Lo dice el propio modal.
- **`whatsapp_business_messaging` en Instagram no aplica**: el envío de WhatsApp
  va por Cloud API a `/{phone_number_id}/messages`.
- **Human Agent en Instagram necesita `messaging_type=MESSAGE_TAG` además del
  tag.** Medido el 3-ago y repetido el 6. La 0074 lo llevó al SQL, donde faltaba.
- **El id del envío está en un sitio distinto según el canal:** Messenger e
  Instagram devuelven `message_id` en la raíz; WhatsApp devuelve
  `messages[0].id` y no trae `message_id`.
- **Las llamadas de prueba CADUCAN a los 30 días.** Lo dice la pantalla de
  *Review → Testing*. No es solo que tarden en aparecer: si el envío se alarga,
  hay que repetirlas. Las de hoy valen hasta el **5 de septiembre de 2026**.
- **`/{page-id}/message_templates` necesita un PAGE token con el ámbito.** Con el
  token de system user directo devuelve *«User does not have sufficient
  administrative permission for this action on this page»*; con el Page token
  derivado de ese mismo system user, funciona.
- **Un ámbito nuevo se añade al system user, no al usuario personal.** En
  *Business Settings → System users → Generate New Token* se marcan los permisos.
  Comprobado que generar uno nuevo **no invalidó** el anterior: los crones
  siguieron en verde y las conexiones intactas.
- **Una plantilla con huecos y sin `example` nace REJECTED.** Meta devuelve id y
  `status: REJECTED` en la misma respuesta. Hay que mandar
  `example.body_text: [[...]]` con un valor por hueco.
- **El nombre de plantilla que admite Meta** es `^[a-z][a-z0-9_]{1,60}$`.
