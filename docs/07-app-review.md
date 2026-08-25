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

> Al día del **23 de agosto de 2026**. La §1 se reescribió ese día: el envío SÍ se hizo y
> Meta ya contestó. Lo que sigue a partir de la §2 describe el envío del 6-ago tal y como
> se preparó, y hay que releerlo con el resultado de la §1 delante.

---

## 1. Estado del envío — enviado, y contestado

**Resultado del 7-ago-2026, 08:18 GMT-4. Cinco permisos aprobados, ocho rechazados.**

Esta sección decía hasta el 23-ago que «nunca se ha enviado nada» y que el panel mostraba
*Not submitted*. Era cierto al cierre del 6-ago y dejó de serlo esa misma noche: el envío salió
y Meta contestó al día siguiente. **La respuesta estuvo dieciséis días sin leerse.** No hay
excusa técnica: el resultado vive en el panel y nada lo empuja hacia fuera.

### Aprobados

`whatsapp_business_messaging` · `whatsapp_business_management` · `pages_show_list` ·
`business_management` · `public_profile`

Eso significa que **WhatsApp se puede ofrecer a un cliente ajeno a Boosty**: recibir, enviar y
gestionar la WABA. Es el canal completo.

### Rechazados

`Human Agent` · `pages_manage_metadata` · `pages_utility_messaging` ·
`instagram_manage_comments` · `pages_messaging` · `instagram_manage_messages` ·
`pages_read_engagement` · `instagram_basic`

Eso significa que **Instagram y Messenger no se pueden ofrecer a nadie fuera del portafolio de
Boosty**. Siguen funcionando donde ya funcionan, porque en modo desarrollo Meta entrega a quien
tiene rol en la app, pero la fase 5 —autoservicio— no puede vender esos dos canales.

### La causa es la misma en los ocho: «Screencast Not Aligned with Use Case Details»

Ninguno se rechazó por lo que el producto hace. Se rechazaron por lo que los vídeos no enseñan.
Meta lista cinco requisitos para cada grabación, y los dos primeros son:

> 1. The complete Meta login flow.
> 2. A user granting app access to the permission or feature.

**El 7 de agosto Kavea no tenía ninguno de los dos, y no era un olvido: era la arquitectura.**
Conectaba como Tech Provider con un token de system user, así que no existía una pantalla donde un
usuario iniciara sesión con Meta ni concediera permisos. Los vídeos no podían enseñar algo que el
producto no tenía.

**Eso cambió el 24 de agosto.** Facebook Login for Business está en producción y se estrenó con un
canje real de extremo a extremo: `conectar.kavea.ai` → diálogo de Meta → código → BISU cifrado →
elección de activos dentro de Kavea. Los dos requisitos que hundieron los ocho vídeos ya se pueden
grabar, porque ya existen.

Y siguen existiendo **dos caminos**, no uno, que es lo que hay que declarar sin que el revisor
tenga que deducirlo:

1. **Autoservicio** — Facebook Login for Business. El cliente inicia sesión con Meta, concede
   permisos en el diálogo y después elige, dentro de Kavea, cuáles de sus Páginas e Instagram
   quiere conectar. Aquí los requisitos 1 y 2 se ven completos.
2. **Clientes del portafolio de Boosty** — token de system user, servidor a servidor. Aquí NO hay
   login visible, y es el caso que el quinto punto de la propia lista de Meta contempla:

> 5. If your app is a server-to-server app OR your app is using system user token to access Meta
>    API, please indicate it in your next submission so that we're aware that frontend Meta login
>    authentication flow is not visible.

**Declarar los dos caminos es el arreglo sistémico.** Sin ello, volver a grabar los ocho vídeos
vuelve a chocar contra los mismos dos requisitos.

### El texto del envío, para pegar en «Request again»

En inglés y en primera persona del plural, que es como Meta lee estos formularios. Va aquí y no en
la cabeza de nadie: es lo único que no se puede reconstruir mirando el producto.

```
How users authenticate with Meta in our app
-------------------------------------------
Kavea supports two connection paths, and which requirements are visible in a
screencast depends on which one the customer uses.

1. Self-service customers connect through Facebook Login for Business. The
   customer signs in with Meta, grants the permissions in Meta's own dialog, and
   is returned to our app, where they choose which of their Pages and Instagram
   professional accounts to connect. The complete Meta login flow and the consent
   screen are both part of this path and are shown in the screencasts.

2. Customers whose assets are already in our Tech Provider portfolio are
   connected server to server with a system user token. There is no frontend
   login for this path, by design: the business grants us access on the Meta side
   and our backend uses the system user token. Per point 5 of your screencast
   requirements, we are indicating this explicitly so it is clear that a frontend
   Meta login flow is not visible in that case.

Our previous submission was rejected on all eight permissions for "Screencast Not
Aligned with Use Case Details". At that time path 1 did not exist and the
screencasts could not show a login that the product did not have. Path 1 is now
in production and the new recordings show it.

What each screencast shows
--------------------------
- instagram_manage_comments: a complete moderation loop on a real Instagram post
  of the connected professional account: we publish a comment from our app, edit
  it, and delete it. Instagram's Graph API does not allow editing the text of a
  comment, so our app publishes the replacement and deletes the previous one, and
  the UI states this before the user confirms. The final state is then confirmed
  in the native Instagram app.
- pages_read_engagement: Page selection, then the Page's posts, photos and events
  retrieved live from Graph and rendered in our UI with the Page name, category,
  followers and Page ID visible in the header.
- instagram_basic: the selected Instagram professional account with its handle
  and its numeric ID visible, its profile fields (name, biography, followers,
  following, media count, website), and its media list labelled for that account.
- pages_messaging and instagram_manage_messages: the connected asset is visible
  with its name and ID, a message is sent live from our app, and the delivered
  message is shown in the native client.
- pages_manage_metadata: the screen where our app subscribes the Page to webhook
  fields, followed by an event for that same Page arriving in our inbox.
- pages_utility_messaging: selecting a utility template, filling its placeholders,
  sending it, and the delivered template message in the native client.
- Human Agent: a conversation past the 24 hour window, where our UI marks it as
  human-agent only and the reply is sent with the HUMAN_AGENT tag.

Data handling has not changed since the approved submission.
```

**Lo que este texto NO dice, a propósito:** no promete que los vídeos enseñen el login en los
permisos que solo se usan por el camino del portafolio. Prometer de más en el formulario es cómo se
consigue un segundo rechazo con la misma nota.

### Y además, lo que pide cada revisor, con sus palabras

| Permiso | Qué hay que enseñar, verbatim |
|---|---|
| `pages_manage_metadata` | «(1) where your app subscribes to Page events or updates Page settings, and (2) a sample webhook event (for example, a new comment notification) arriving in your app, tied to the same Page shown during setup» |
| `pages_utility_messaging` | «(1) creation or selection of a utility or marketing message template, (2) how the template is populated with placeholders (name, order ID, etc.), and (3) sending the message to a test recipient and showing the delivered template message in the native client» |
| `instagram_manage_comments` | «a complete comment moderation loop… add a comment from your app, edit that comment, and delete it. Then, open the native client to confirm the final state on that post» |
| `pages_messaging` | «(1) asset selection (Page, account, or number visible), (2) a live send action from your app, and (3) the delivered message in the native client» |
| `instagram_manage_messages` | Idéntica a `pages_messaging` |
| `pages_read_engagement` | «(1) Page selection, (2) the retrieval of Page content such as posts, photos, events, and/or followers' profile pictures/names where permitted, and (3) the rendered results in your app's UI with the Page identity visibly displayed» |
| `instagram_basic` | «(1) the selected Instagram professional account with its handle or ID visible, (2) a sample of profile fields (name, bio, followers, etc.), and (3) a media list displayed in your app UI labeled for that account» |
| `Human Agent` | Sin nota específica: solo el rechazo genérico de screencast |

Tres de esas notas piden funcionalidad que **hay que construir antes de poder grabarla**:
editar y borrar un comentario propio (`instagram_manage_comments`), leer contenido de la Página
—posts, fotos, eventos— y pintarlo (`pages_read_engagement`), y una pantalla que enseñe el
perfil de Instagram con sus campos y su lista de medios (`instagram_basic`). No es volver a
grabar: es construir y luego grabar.

### Botón

En el panel hay un **Request again**. No hay que rehacer el formulario entero.

### Lo que sigue caducando

Las llamadas de prueba se hicieron el 6-ago y caducan a los 30 días: **5-sep-2026**. Si el nuevo
envío sale después, hay que repetirlas antes.

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

### `instagram_manage_comments`

**Meta:** *«allows your app to create, delete and hide comments on behalf of the
Instagram account linked to a Page.»*

**No tenía sección aquí hasta el 25-ago**, y por eso su texto declarado vivía
solo dentro del formulario de Meta. Se descubrió al releerlo para el segundo
envío: decía «a Comments screen, **separate from the message inbox**» —falso
desde el 21-ago, cuando Comentarios pasó a ser pestaña dentro de Bandeja— y no
mencionaba editar ni borrar, que es literalmente lo que la nota de rechazo pedía.
Un texto que solo vive en un formulario de un tercero no se puede releer contra
el producto.

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Instagram professional account; Kavea is their technology provider and is verified as such by Meta.

We use instagram_manage_comments to read the public comments people leave on our user's Instagram posts, to publish the business's replies, and to moderate them: hide, unhide, edit and delete.

What the screen recording shows: comments live in the same inbox as the messages, in their own tab, because the same team answers both. The operator refreshes the list directly from Meta, opens a comment and publishes a reply on behalf of the business account. The recording then shows the complete moderation loop the reviewer asked for: a comment published from our app, that same comment edited, and then deleted. Finally the Instagram app is opened on that post to confirm the final state.

How editing works, because the API does not allow it: Instagram's Graph API can create and delete a comment, but it cannot change the text of one. So editing in Kavea publishes the new text and deletes the previous comment, in that order, and the interface states this in plain language before the operator confirms. We do it in that order on purpose: if the second step fails there are two comments visible, which the operator can see and fix, instead of none.

Why comments are kept apart from direct messages, which the reviewer will see immediately: a direct message is private between two people and a comment is public. Answering a comment with something the customer said in private would expose it to everyone reading the post. So they do not share a table, they do not share a screen, and the reply box states in plain language that the answer will be public. This is a deliberate design decision, not a limitation.

Why the business needs it: a comment left unanswered on a post is visible to every future customer who reads it. Today these businesses either miss them or scroll the Instagram app looking for what is still unanswered.
```

**Vídeo:** `instagram_manage_comments`. El bucle completo desde la aplicación y
luego la publicación en Instagram para confirmar el estado final.

**El párrafo de la edición no se puede quitar.** La nota pide «edit that comment»
y la API de Instagram no sabe hacerlo: si no se explica que editar es publicar y
borrar, el revisor concluye que la edición no se enseñó.

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

**Vídeo:** `pages_utility_messaging`, montado el 25-ago y **cubre los tres puntos de la nota**.
397 s: login completo y luego tres tramos, cada uno con su rótulo.

1. **Messenger — crear la plantilla.** La pestaña con las plantillas de la Página leídas de Meta
   —cinco aprobadas y dos rechazadas, con su motivo— y la creación de `pedido_devuelto` de punta a
   punta hasta verla aprobada. Se ve incluso el aviso de Kavea cuando el cuerpo termina en variable,
   y cómo se corrige.
2. **Messenger — mandarla y verla llegar.** Se elige la plantilla en el compositor, sale el diálogo
   de vista previa con **el texto ya relleno** —«Hola Gabriel, hemos recibido su devolucion numero
   2,000…»— y los datos que lleva con su etiqueta; se envía; aparece en el hilo; y **se abre
   Messenger en facebook.com y se ve el mensaje recibido**, con la respuesta del contacto volviendo
   a Kavea.
3. **WhatsApp — la misma pantalla en el otro canal**, como contexto.

Eso es exactamente lo que pide la nota: *(1) creation or selection of a utility template*,
*(2) how the template is populated with placeholders*, *(3) sending the message to a test recipient
and showing the delivered template message in the native client*.

Y el envío es real, no una maqueta: en la cola quedó `messenger / enviado` con `messaging_type`
UTILITY y el `mid` que devolvió Meta.

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

### `pages_messaging`

**Meta:** *«allows your app to manage and access Page conversations and calling in
Messenger.»*

**Tampoco tenía sección aquí hasta el 25-ago.** Capturado del formulario al
preparar el segundo envío, por lo mismo que el de comentarios: un texto que solo
vive en un formulario de un tercero no se puede releer contra el producto.

**Kavea responde:**

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Facebook Page; Kavea is their technology provider and is verified as such by Meta.

We use pages_messaging to receive the Messenger conversations that customers start with our user's Page, and to send the replies that our user's staff writes.

End-to-end flow, which is what the screen recording shows: a customer sends a message to the Page. Kavea receives the messages webhook and shows the conversation in that business's shared inbox, next to the same customer's WhatsApp and Instagram threads when it is the same person. Several staff members can see it, assign it and answer. When a staff member writes a reply, Kavea sends it through the Send API on behalf of the Page with messaging_type=RESPONSE, inside the standard 24-hour window, and shows the delivery and read receipts on the thread.

Value for the person using the app: these businesses answer Messenger from the Facebook app on someone's phone, which means one person holds the conversation and nobody else can see it. Kavea turns it into a shared inbox with assignment, history and a single view of each customer across all three channels.

Without this permission Kavea cannot receive or answer Messenger conversations, which is one of the three channels the product exists to unify.

What the recording shows, in the order you asked for: (1) the connected asset is visible — the Page name and its ID appear on the channels screen during setup, and the conversation header names the Page the reply goes out from; (2) a reply is written and sent live from our app, and the outgoing message appears in the thread with its delivery receipt; and (3) the Messenger app is then opened on the customer's side to show the delivered message.
```

**El último párrafo se añadió el 25-ago.** Los cinco primeros describían el
producto bien y no decían nada falso, pero no prometían las tres cosas que la
nota de rechazo enumera. Contestar con las mismas palabras de la lista es lo que
permite al revisor marcar sus casillas sin interpretar nada.

**Esta tarjeta tiene dos campos que las otras no**, y los dos son obligatorios:

- **`Select a Page`** — hay que elegir **Boosty.digital**. Es un desplegable
  pequeño encima del campo de instrucciones y se pasa por alto con facilidad.
- **Instrucciones paso a paso.** El propio formulario advierte de lo que ya
  sabíamos: *«create a real account on Facebook and grant this account the Tester
  role. Do not submit a test user created in App Roles. Test users created in App
  Roles are not able to receive bot messages.»*

```
1. Grant the Tester role in App Roles to a real Facebook account. Test users created in App Roles cannot receive messages from a Page.
2. From that account, send a message to the Boosty.digital Page (m.me/boosty.digital).
3. Sign in at https://boosty.kavea.ai with the credentials in the reviewer instructions. The conversation appears in Bandeja (Inbox) within seconds.
4. Open it, type a reply in the composer and press Enviar. The reply is delivered to the Facebook account from step 2.
```

**Vídeo:** `pages_messaging`. Activo visible, envío en vivo, y el mensaje
entregado en Messenger.

### `instagram_manage_messages`

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Instagram professional account; they connect it to Kavea, and Kavea is their technology provider, verified as such by Meta.

We use instagram_manage_messages to receive the Instagram Direct messages people send to our user's business account, and to send the replies our user's staff writes.

End-to-end flow, which is what the screen recording shows: a customer sends a Direct message to the business account. Kavea receives the messages webhook and shows the conversation in that business's shared inbox, where several staff members can see it, assign it and answer, next to the same person's WhatsApp and Messenger threads when it is the same contact. When a staff member writes a reply, Kavea calls the Send API on behalf of that account inside the standard 24-hour window, and the thread shows the delivery and read receipts.

We also read the sender's username and profile picture so the person appears in the inbox with their real identity instead of a numeric ID.

Value for the person using the app: today these businesses answer Instagram from the app on one person's phone. Kavea turns that into a shared inbox with assignment and history, and one view of each customer across all three channels.

Without this permission Kavea cannot receive or answer Instagram Direct messages, which is the core of the product for this use case.
What the recording shows, in the order you asked for: (1) the connected asset is visible — the Instagram professional account's handle and its numeric ID appear on the channels screen during setup, and the conversation header names the account the reply goes out from; (2) a reply is written and sent live from our app, and the outgoing message appears in the thread with its delivery receipt; and (3) the Instagram app is then opened on the customer's side to show the delivered message.
Kavea is a custom inbox solution, not an automated experience: every reply is written by a person on the business's team, and the app never starts a conversation on its own. A conversation begins when the customer sends a Direct message to the business account, and the team answers it from the shared inbox.

Unsent messages: when a customer unsends a message, Meta sends the deletion event and Kavea applies it — the message is marked as deleted and its text is erased from our database, not merely hidden from the screen. The thread then shows "Mensaje eliminado" where the bubble was, so the operator knows something was removed instead of finding a gap.
```

**Vídeo:** `instagram_manage_messages`. Bandeja y un hilo abierto.

**El recuadro amarillo de esta tarjeta, que no sale en ninguna otra.** Meta avisa
de dos casos y pide información adicional en cada uno:

> *«…for the purpose of using and processing data **on behalf of other Instagram
> business accounts**»* — **este es el de Kavea**, y es lo que dice su propio
> texto declarado.
>
> *«…to use and process data for your **own** instagram business account»* — no
> aplica.

Hay que abrir el `View requirements` del primero y comprobar que no falte nada.
Es el tipo de requisito que bloquea la aprobación sin aparecer en la nota de
rechazo, así que no se da por cubierto: se mira.

**Los dos últimos párrafos salieron de la guía, no de la nota de rechazo.** El
recuadro amarillo de esta tarjeta lleva a
`instagram-messaging/app-review/apps-for-other-businesses`, que es el caso de
Kavea —procesar mensajes por cuenta de terceros— y pide dos cosas que el texto no
decía: **clasificar** la app como *custom inbox solution* o *automated
experience*, y **declarar el procesamiento de mensajes eliminados**.

Lo segundo el producto ya lo hacía: cuando llega el evento de borrado,
`aplicar_efecto_mensajeria` marca `deleted_at` **y pone el texto a null**. No lo
esconde de la pantalla: lo borra. Hay 2 eventos reales procesados en producción.

**Lo que esa guía pide y el vídeo NO enseña:** *«how to test unsent message
processing»*. La nota del revisor para este permiso pedía tres cosas y las tres
están; la guía general pide más. Queda declarado en texto y sin grabar, a
sabiendas. Si lo vuelven a pedir es una toma de treinta segundos: escribir desde
Instagram, eliminar el mensaje allí, y ver a Kavea poniendo «Mensaje eliminado».

### `pages_read_engagement`

```
Kavea is a shared team inbox for small and medium businesses in Latin America. Our users are the businesses that own the Facebook Page; Kavea is their technology provider and is verified as such by Meta.

We use pages_read_engagement for two things. First, together with pages_show_list, to read what a Page is — its name, category, picture and follower count — and which tasks the person connecting it can perform on it. Reading the tasks is how we refuse a connection early: someone who cannot perform the MESSAGE task on a Page cannot have that Page's conversations delivered to Kavea, and telling them at connection time is better than letting them finish the setup and discover it when the first customer writes and nothing arrives.

Second, to show the Page's own content next to its conversations. A business answering a comment or a message often needs to see the post it refers to. Kavea has a Content screen for that: the operator picks a connected Page and Kavea retrieves its posts, photos and events live from the Graph API and renders them with the Page identity in the header.

What the recording shows, in the order you asked for: (1) the Page is selected from the list of connected assets; (2) its posts, photos and events are retrieved live from Meta; and (3) the results are rendered in our UI with the Page name, category, follower count and Page ID visible in the header.

The content is read live each time the screen is opened. We do not copy the Page's posts, photos or events into our database, so what the operator sees is what the Page has at that moment. We do not use this permission for advertising.

Without this permission Kavea can only show numeric identifiers for the Pages a person manages, and cannot show a business its own posts next to the conversations they generate.
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

We use instagram_basic for two things. First, to read which Instagram professional account is linked to the connected Page, and its id and username. That identifier is what every other part of the integration is keyed on: it is the account whose messages and comments arrive at the inbox, and the one Kavea sends replies from. Without resolving it, an incoming message cannot be attributed to the right business.

Second, to show the account itself to the business. Kavea has a Content screen where the operator picks a connected Instagram professional account and Kavea retrieves its profile live from the Graph API — name, username, biography, website, follower count, following count and media count, with its profile picture — and the account's media list underneath, each item with its caption, type, date and permalink. Everything on that screen is labelled with the account it belongs to.

What the recording shows, in the order you asked for: (1) the selected Instagram professional account with its handle and its numeric ID visible; (2) its profile fields retrieved live from Meta; and (3) the account's media list displayed in our UI, labelled for that account.

The profile and the media list are read live each time the screen is opened. We do not copy them into our database, so what the operator sees is what the account has at that moment. We do not use this permission for advertising.

Without instagram_basic there is no way to know which Instagram account belongs to the Page being connected, so no Instagram feature of the product can work.
```

**Vídeo:** `instagram_basic`. Bandeja.

---

### Los dos textos que NEGABAN lo que el producto hace

`pages_read_engagement` decía *«We do not read posts, comments, reactions,
insights or any engagement metric with this permission, and Kavea has no screen
that would show them»*. `instagram_basic` decía *«We do not read media,
followers, insights or any content of the account»*.

**Las dos frases eran ciertas cuando se escribieron** —entonces Kavea solo
resolvía identificadores— y dejaron de serlo el día que se construyó la pantalla
de Contenido, que lee publicaciones, fotos y eventos de la Página, y el perfil y
los medios de la cuenta de Instagram. Nadie volvió a los textos.

Los otros seis permisos se rechazaron porque el vídeo no enseñaba bastante. Estos
dos se rechazaron **con el texto negando lo que el vídeo enseña**, que es peor: un
vídeo que hace más de lo declarado no parece una función, parece una función que
se cuela.

Los campos que se leen de verdad, comprobados en `meta-contenido` el 25-ago:

| Superficie | Campos |
|---|---|
| Página | `id,name,username,about,category,link,fan_count,followers_count,picture{url}` |
| Publicaciones | `id,message,created_time,permalink_url,full_picture` + fotos y eventos |
| Cuenta de Instagram | `id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url` |
| Medios | `id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count` |

Y no se guardan: el panel de contenido no escribe en ninguna tabla. La tabla
`media` es de adjuntos de mensajes, que es otra cosa y se declara aparte.

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
Open Bandeja (Inbox) and switch to the Comentarios tab at the top. Press "Traer de Meta" to read the comments of the connected Instagram account, then reply to one in public. You can also hide, edit or delete a comment from there; editing publishes a replacement and deletes the previous one, because Instagram's API does not allow editing a comment's text, and the UI says so before you confirm.

To test WhatsApp (whatsapp_business_messaging, whatsapp_business_management):
Open Ajustes > Canales to see each connected channel with its state. WhatsApp conversations appear in the same inbox.

To test utility templates (pages_utility_messaging):
Open Ajustes > Plantillas and select the Messenger tab. The list is read live from Meta every time the screen opens and shows each template with the status Meta gave it, including rejected ones with the reason.

To send one: open a Messenger conversation in Bandeja, press the "Plantillas" button just above the reply box, and pick a template from the "Se envían enteras" group. A dialog shows the exact text that will be delivered with the placeholders already filled from the contact's record, and any missing value can be typed in that same dialog. Press "Enviar la plantilla" and the message is delivered through Messenger.

Note on the reviewer account: it has the "agente" role, which can send templates but not create them, because creating one changes the workspace for everyone. If you need to create a template during the review, tell us and we will raise the role.
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
