# Kavea — Bitácora

Registro de lo que está hecho, verificado y en producción. Una entrada por hito real.

**Regla:** aquí solo entra lo que se ha comprobado, con la evidencia al lado. Lo planificado
vive en `docs/fases/`, lo pendiente en la sección 3 de este documento. Si algo no se ha
verificado, no se escribe como hecho.

---

## 1. Estado actual

> Al día del **4 de agosto de 2026**. Esta tabla es la única de todo el repositorio que se
> mantiene al día: los documentos de `docs/fases/` describen lo planeado y **no se actualizan al
> ejecutar**, así que contradicen a la realidad. Está anotado como deuda en §3.4.

| Pieza | Estado | Verificado |
|---|---|---|
| Sitio público `kavea.ai` | ✅ En producción, con `/demo` | Formulario probado de extremo a extremo |
| Páginas legales | ✅ Publicadas | Rastreables por Meta, sin bloqueo de bots |
| Repositorio | ✅ `Boosty-Hub/kavea`, privado | Monorepo, despliegue automático |
| App de Meta | ✅ Creada, en modo desarrollo | `compliant`, sin violaciones |
| Zona DNS en Netlify | ✅ Delegada y operativa | SOA `dns1.p01.nsone.net` en 7 resolvedores |
| Esquema de base de datos | ✅ 62 migraciones aplicadas y **registradas** | 0049–0060 estaban aplicadas sin fila de control; conciliado el 3-ago |
| Bandeja de correo interna | ✅ `/admin/correos`, leer y responder | RPC y bucket verificados; el viaje completo pide sesión de staff |
| Aislamiento entre tenants | ✅ 61 de 61 comprobaciones | Validado rompiendo una política a propósito |
| Ingesta y normalización | ✅ En producción | Mensajes reales entrando, 8 crones vivos |
| Bandeja, tarjetas y embudos | ✅ En producción | Un contacto con varios canales en un solo hilo |
| Ficha, agenda y reparto | ✅ En producción | Reparto por turnos verificado con dos personas |
| Envío por Instagram | ✅ Texto, imagen, GIF y corazón | Envíos reales, echo en ≤6 s, contacto confirmando |
| Diagnóstico de conexiones | ✅ V1–V7, cron diario | Primera pasada: 5 verde, 0 rojo, 2 sin saber |
| Panel interno | ✅ Cinco pantallas | Salud, espacios, portafolio, accesos y uso |
| Alta de cliente desde el panel | ⚠️ Construida, **sin ejecutar** | Falta el primer cliente real |
| Envío por Messenger | ⚠️ Construido, **sin probar** | No hay contacto vivo por esa vía |
| Correo saliente | ⚠️ **No funciona** | DNS de `kavea.ai` sin verificar en Resend |
| **Tech Provider** | ✅ **Verificado el 4-ago** | `Submitted → Reviewed → Verified`. Doce horas de trámite |
| App Review | ⛔ Sin enviar nunca | `submissions: []`. Falta Data Use Checkup en 13 de 13 y screencast en 12 |
| **WhatsApp entrante** | ✅ **En la bandeja** | 6 mensajes reales, con nombre y acuses de entrega y lectura |
| WhatsApp saliente | ✅ Ida y vuelta completa | Enviado, entregado, leído y contestado. Falso negativo del `mid` corregido |
| Plantillas de WhatsApp | ⛔ Sin cablear con Meta | El modelo existe; nada las envía a revisión y las 25 aprobadas no están en la tabla |
| Comentarios | ⚠️ Modelo con RLS, **sin ingesta ni pantalla** | `changes[]` se guarda crudo y no aplica nada |
| Navegación | ✅ Sidebar colapsable | 216/60 px, persiste, y colapsa solo bajo 860 px |
| Agentes | ⏸ Aparcada | Sin `ANTHROPIC_API_KEY` |
| Comodín `*.kavea.ai` | ⏸ Aplazado, no bloquea | Con un inquilino basta un alias |

**Las fases 0 a 4 están operativas y la 5 va por su tarea 12.** Lo que decide qué se hace
mañana no es el número de la fase: es la sección 3.

---

## 2. Entradas

### 2026-08-04 · Tech Provider aprobado, WhatsApp entra en la bandeja, y la navegación existe

**Boosty Digital LLC es Tech Provider.** Enviada el 3-ago a las 22:30, verificada el
4-ago sobre las 15:00 UTC: unas doce horas. Eso cierra el bloqueo que este documento
llamaba «camino crítico de todo lo demás» y **retira la amenaza del 3 de octubre** de que
Meta restringiera dos apps del portafolio. La fecha real que muestra Meta es el 3, no el 2
que decía el §3.1.

**El App Review sigue sin enviar, y ahora se sabe por qué de verdad.** El historial devuelve
`submissions: []` y `has_been_previously_reviewed: false`: no ha habido ni un envío. Eso
resuelve dos cosas que parecían malas y no lo son. El `grant_status: REJECTED` de los 20
permisos **no es una denegación** —no puede serlo sin revisión— sino el estado por defecto de
«no concedido». Y el `can_submit: false` con motivo *«a previous submission is in review»*
es definitivamente falso, como ya se sospechaba el 3-ago.

Lo que falta del envío, permiso a permiso: `data_use_checkup` en **13 de 13**, `screencast`
en 12, `use_case` en 12, `api_precheck` en 9, y `test_page` en `pages_messaging`. El **Data
Use Checkup no aparecía en ningún documento** y bloquea los trece.

**Y una conclusión que hay que retirar del 3-ago:** la columna «API Calls» del dashboard
**no es acumulativa**. `whatsapp_business_messaging` pasó de 5 a 0 en un día mientras los de
Messenger subían. Es una ventana de actividad reciente, así que no sirve como prueba del
requisito de «una llamada en los 30 días previos». Los contadores de Messenger e Instagram
sí están altos y en *Ready for testing*: `pages_manage_metadata` 337, `pages_read_engagement`
333, `pages_show_list` 279, `pages_messaging` 277.

**Los tres callbacks no bloquean el App Review**, contra lo que decía el §3.1. Tres pruebas:
la API de requisitos no lista ningún paso de callback para ninguno de los 13 permisos; el FAQ
de Meta dice que basta *«either a data deletion callback instruction URL or a callback URL»* y
`data_deletion_url` ya apunta a `kavea.ai/eliminacion-de-datos`; y el deauthorize está
documentado como opcional. Siguen siendo trabajo de la fase 7, pero no son lo que impide
enviar.

#### WhatsApp: de «ni una línea» a mensajes reales en la bandeja

El §3.1 decía «sin empezar, sin investigar». La infraestructura llevaba tiempo viva: WABA
`1415042803155441`, número **+1 829-954-3803** dominicano, `CONNECTED` en Cloud API, calidad
`GREEN`, y **25 plantillas de marketing aprobadas**. Todo operando por la app de **Kommo**,
que es justo lo que Kavea nace para reemplazar. Ninguna WABA estaba suscrita a Kavea, y eso
explicaba por sí solo el 0 de `whatsapp_business_messaging`.

**Kavea suscrita junto a Kommo, sin desconectar nada.** Cierra un incierto: **una WABA admite
varias apps suscritas a la vez** y las dos reciben los mismos webhooks. El corte de Kommo se
deja para cuando la ingesta esté probada, para no dejar una ventana ciega.

**La cuarta forma de payload, medida con tráfico real.** Cuatro diferencias que rompían
cualquier reutilización de la ruta de Messaging:

1. **`entry[].id` es la WABA, no el asset de mensajería.** El asset vive en
   `changes[].value.metadata.phone_number_id`, dos niveles más abajo. Enrutar por `entry.id`
   deja el mensaje sin tenant.
2. **El timestamp viene en SEGUNDOS.** Los otros dos canales mandan milisegundos y la columna
   se llama `meta_timestamp_ms`. Sin multiplicar, cada mensaje aterriza en enero de 1970 y la
   ventana lo da por caducado desde el primer segundo. No falla nada visiblemente.
3. **El nombre del contacto llega gratis** en `value.contacts[].profile.name`. En Instagram
   `contacts.nombre` está en null y rellenarlo cuesta una llamada por contacto.
4. **WhatsApp manda un ID de media, no una URL.** Encaja sin tocar el esquema en el caso
   `sin_servir` que el CHECK `media_origen_coherente` ya contemplaba desde la 0010.

Y dos regalos: **el precio por conversación llega en cada acuse** —`pricing` con `billable`,
modelo y categoría—, así que el §3.1 se equivocaba al listarlo como sin investigar: no hay
que estimarlo. Y **WhatsApp sí tiene echoes por `mid`**: el id del acuse es el mismo `wamid`
que devuelve el Send API, que es la salida que Instagram no tiene.

**WhatsApp es una integración propia** (0065), no un campo más de la conexión de la Página.
`page_id` deja de ser obligatorio y un CHECK hace las dos formas excluyentes, porque en la
fase 5 un cliente puede traer solo WhatsApp, solo Instagram, o los dos con semanas de
diferencia. El token va en `whatsapp_token_*`, ranura propia siguiendo el precedente de
`bisu_token_*`: guardarlo en una columna llamada «page access token» sería otra columna que
miente, y eso ya costó una investigación con `preview_texto`.

**El cifrado ocurre en la función de borde y el token no viaja en la petición**, porque ya
está en su entorno. Y **se comprueba contra Meta antes de guardar**: una credencial cifrada
que no sirve falla días después en el despachador y con forma de error de Meta.

**Evidencia:**

| Qué | Medición |
|---|---|
| Mensajes en la bandeja | 6 reales, con nombre de contacto y fecha en 2026 |
| Contactos | «Gabriel Montiel Toro» y «Super Cauchos Cia Ltda», un cliente real |
| Acuses | `delivery` 4, `read` 4, `wa_sent` 3 en `message_events` |
| Envío de ida y vuelta | encolado → despachador → Cloud API → `delivered` → `read` → respuesta |
| Adaptador | 26 comprobaciones en verde contra los payloads reales de `webhook_events` |

#### Tres fallos propios, y lo que enseñan

- **El despachador daba por fallido un envío que Meta aceptó.** WhatsApp devuelve el id en
  `messages[0].id`; Messenger e Instagram en `message_id`. El código solo miraba el segundo,
  así que un envío con HTTP 200 quedaba `fallido` con `error_mensaje: "HTTP 200"`. Costó un
  envío real: llegó, se entregó, el destinatario lo leyó, y la bandeja decía que había
  fallado. Es un **falso negativo**, la peor forma de fallar aquí: quien atiende reescribe un
  mensaje que el cliente ya está leyendo.
- **El reconciliador empezó a alertar cada quince minutos.** Recorría todas las conexiones
  exigiendo Page Access Token, y la de WhatsApp no tiene ninguno. La alerta traía
  `page_id: null` en el detalle, y eso permitió atribuirla en un minuto: un detalle con el
  dato que distingue vale más que tres severidades.
- **Tres verificaciones mías mal montadas dieron falsos negativos.** Un servidor de
  desarrollo que arrancó en el puerto 3002 mientras yo comprobaba el 3000; un selector con
  `Módulos` mal codificado por PowerShell; y un menú «ausente» que era la página de acceso
  haciendo lo correcto. La regla de que una prueba que no se ha visto fallar no es una prueba
  aplica también a la prueba: **hay que verificar la comprobación antes de creerle.**

#### La navegación no existía

`layout.tsx` eran catorce líneas sin menú, y los módulos principales no tenían forma de
llegar unos a otros: se llegaba escribiendo la URL. Sidebar colapsable, con la preferencia en
`localStorage` porque es del aparato y no de la cuenta.

**Un defecto que solo se vio mirando la captura:** en un viewport de 390 px el menú ocupaba
216, el 55 % del ancho. No había barra horizontal, así que ninguna comprobación automática lo
detectaba. Por debajo de 860 px arranca colapsado, con el mismo corte que ya usa el CSS de la
bandeja.

**Evidencia:** menú de 216 px expandido y 60 colapsado, la preferencia sobrevive al
recargado, el activo legible en oscuro (`rgb(237,234,227)`), y en móvil 60 px de 390.

#### La fuga que reabrí, y la puerta por la que entró

Al empezar a aplanar `changes[]` para los comentarios, un cuerpo que antes producía cero
updates pasó a producir uno. Y los dos caminos de descarte del normalizador —asset sin ruta,
canal sin encontrar— hacían `i++; continue`, y ese `continue` **salta por encima del bloque
de vaciado**. Con eso, si el último update de un cuerpo se descartaba, `ingerir_tramo` nunca
se llamaba con `p_final`: la fila se quedaba en `en_proceso`, el segador la devolvía a
pendiente cada cinco minutos y el normalizador la volvía a reclamar. Indefinidamente y sin
que nada se pusiera rojo.

Es **la misma fuga que este documento ya daba por cerrada** para `total === 0`, por otra
puerta: aquí `total` es mayor que cero y lo que queda vacío es el lote. Convertido en
`if/else` para que el vaciado siempre se alcance. Se vio reprocesando el Test del panel de
Meta, que manda `entry.id: "0"` y por tanto nunca resuelve tenant.

La lección no es la del `continue`: es que **cerrar una fuga en un caso no la cierra en los
demás**, y que el único motivo por el que esta se encontró es que se probó ejecutando en vez
de leer el diff.

#### Comentarios: el modelo, con RLS

Cero tablas de comentarios existían. Camino aparte de `messages` porque no tienen ventana ni
conversación, pero sobre todo **porque un comentario es público y un mensaje no**: responder
en público con datos dados en privado es una fuga. `autor_id` lleva escrito en un comentario
de columna que **no es el IGSID**, para que nadie los cruce y acabe enseñando la conversación
privada de alguien bajo el nombre de otro. RLS con FORCE, una política de lectura y **ninguna
de escritura**: la ingesta entra por el rol de servicio y lo que hace un operador irá por RPC.

#### Cuatro cosas medidas que contradicen a Meta o al repositorio

- **El aviso rojo del panel de webhooks es falso para WhatsApp.** Dice que con la app sin
  publicar no se entrega ningún dato de producción «ni de administradores ni de
  desarrolladores». Se envió un mensaje real desde un móvil y entró, con firma verificada.
- **El endpoint `/database/query` de la API de gestión es transaccional.** Una migración que
  falló en su último `insert` no dejó ni una columna aplicada. Una migración a medias no es un
  modo de fallo posible por esa vía, cosa que el comentario de `aplicar-migraciones.ps1` daba
  por incierta.
- **`aplicar-migraciones.ps1` exige `pwsh` de verdad, no por preferencia.** Bajo PowerShell
  5.1 falla de dos formas: `Get-Content -Raw` lee en ANSI y rompe los acentos, y
  `ConvertTo-Json` envuelve la cadena en `{"value":…,"Count":1}`.
- **Las Edge Functions no se typechequean en ninguna parte.** El job de tipos corre solo
  `pnpm --filter @kavea/app typecheck`. Todo `supabase/functions/` es Deno y no lo mira nadie:
  la regresión del reconciliador la habría cazado una guarda de diez líneas.

### 2026-08-03 · El trámite de Meta, la bandeja de correo y cinco cosas que este repositorio daba por ciertas

Sesión larga de verificación contra la API y el App Dashboard. Lo que sigue está medido,
no supuesto, y **buena parte contradice lo que los documentos afirmaban**.

**El bloqueo del App Review no era el que creíamos.** No es que no se pueda enviar: no se
puede ni AÑADIR un permiso sin ser Tech Provider. Al pulsar `+ Add to App Review` sale un
diálogo que lo dice y avisa de que la decisión es irreversible. El `can_submit: false` que
la API devolvía con motivo *"a previous submission is in review"* es un mensaje engañoso:
la pantalla de submissions dice **"Not submitted"** y no hay ninguna cola.

**Plazo duro que no estaba en ningún documento:** la Access Verification debe completarse
antes del **2 de octubre de 2026** o Meta restringe **dos** apps del portafolio.

**El requisito de llamadas está cumplido**, y era falso que no hubiera ninguna. El
contador por permiso del use case ya marcaba tráfico real —`pages_manage_metadata` 148,
`pages_read_engagement` 148, `pages_show_list` 104, `pages_messaging` 103,
`business_management` 58, `instagram_manage_messages` 53, `instagram_basic` 14,
`whatsapp_business_messaging` 5— y lo que faltaba se provocó a mano:
`instagram_manage_comments` con dos lecturas y una respuesta pública real,
`whatsapp_business_management` listando las tres WABAs, y Human Agent con un envío que
Meta aceptó. Cuidado con `devtools_api_usage call_volume`, que devuelve `total_calls: 0` a
30 días: ese es el volumen para límites de tasa, no el contador del App Review.

**Se limpió la vía descartada.** `instagram_business_basic` e
`instagram_business_manage_messages` estaban añadidos al use case de Instagram, prohibidos
por `03:190`, con 0 llamadas frente a las 53 de `instagram_manage_messages`. Fuera. Y se
añadió la feature Human Agent, que faltaba.

**En Instagram no existe `app_id`.** Dos envíos por el Send API con el token de la propia
app volvieron sin el campo, así que `adaptadores.ts` los clasifica como `humano` y lo que
Kavea manda es indistinguible de lo que el cliente escribe desde el móvil. No se arregla
suscribiéndose: el topic `instagram` **no tiene** `message_echoes` entre sus campos. La
alternativa está medida: el `mid` del echo es el `message_id` que devuelve el Send API,
comprobado carácter a carácter contra el acuse de lectura, y Kavea ya lo guarda en
`send_api_message_id`. Pendiente de implementar en el aplicador; afecta al bucle del agente.

**Tres incertidumbres cerradas.** `messaging_referral` es singular en el topic `instagram`
y plural en `page`: no era una discrepancia documental, son dos topics.
`pages_read_user_content` no se puede pedir —no aparece en ningún use case— y no hace
falta: `instagram_basic` lleva 14 llamadas sin él. Y la feature *Business Asset User
Profile Access* tampoco: `GET /{igsid}?fields=name,username,profile_pic` devuelve nombre,
usuario y foto con lo que ya se tiene. Eso deja una tarea: hoy `contacts.nombre` está en
`null` y la bandeja muestra tarjetas sin nombre pudiendo tenerlo.

**La bandeja de correo entra en producción.** `support@kavea.ai` estaba publicado en tres
páginas legales que Meta rastrea y nadie leía ese buzón. Ahora vive en `/admin/correos`,
sincronizando desde Resend al abrir el módulo, con adjuntos guardados en Supabase Storage
porque el `download_url` de Resend caduca a la hora. Migración 0061.

**El registro de migraciones estaba 12 por detrás.** `schema_migrations` se detuvo en
`0048_reparto` el 2 de agosto a las 21:15 y de la 0049 a la 0060 se aplicaron por otra vía
sin dejar fila. El script `aplicar-migraciones.ps1` habría fallado en la 0049 en el próximo
uso. Conciliado tras verificar **una por una** con un objeto distintivo de cada migración,
no por parecido. Las filas rellenadas llevan la fecha de la conciliación, no la de la
aplicación real, que se desconoce.

**CI estaba en rojo y no era un fallo, eran cuatro apilados.** El job de esquema llevaba desde
el 3 de agosto en rojo, y cada paso corre con `ON_ERROR_STOP`, así que aborta y **tapa lo que
viene detrás**. Al arreglar el primero apareció el segundo, y así hasta el cuarto:

1. **`Sitio público`** exigía cero JavaScript, y era falso desde el commit que arregló el
   formulario de demo: ese formulario necesita un script, y tuvo que ser un fichero porque la
   CSP es `script-src 'self'`. La excepción ahora está nombrada y es de una entrada, más la
   comprobación contraria de que `demo.js` exista.
2. **Canario C2** — `rate_limit_usage` y `notificaciones` sin índice que empiece por
   `organization_id`. Añadidos compuestos, que sirven además a consultas reales (0063).
3. **Canario C4** — cuatro tablas con RLS y cero políticas. Las cuatro deliberadas, con el
   motivo en su migración; la lista blanca del canario estaba incompleta desde la 0034.
4. **Canario C5** — `notificaciones_tarea_id_fkey` era de una sola columna, y **eso sí era un
   agujero**: la integridad referencial de Postgres salta RLS, así que una notificación de un
   cliente podía apuntar a la tarea de otro. Compuesta en 0064. Era un olvido, no una decisión:
   en la misma tabla `tarjeta_id` sí estaba compuesta y `tareas` ya tenía el UNIQUE que hace
   falta para apuntarla.
5. Y detrás de todo, **`aislamiento.sql` insertaba conversaciones sin `tarjeta_id`**, que es NOT
   NULL desde la 0027.

Los cinco jobs en verde. En los cuarenta runs anteriores no había ni uno.

**Y dos columnas que mentían.** `conversations.preview_texto` decía «Mensaje eliminado»
mientras el último mensaje era «Prueba v2»: quedaron huérfanas cuando 0027 movió el
adelanto a `tarjetas`. Costaron una investigación y casi un informe de un fallo que no
existía. Quitadas en 0062. `conversations.no_leidos` huele igual y queda marcada como
sospechosa, sin tocar: quitar algo por parecido es cómo se rompe una lectura.

### 2026-08-02 · Reparto, adjuntos, diagnóstico de canales y panel interno

Una tanda larga. Lo que quedó construido y verificado en producción:

**Fase 3f — reparto por turnos.** Sin puntero: se elige a quien lleva más tiempo sin recibir
una. Un round robin con cursor se rompe en cuanto la lista cambia, y «quien lleva más sin
recibir» se arregla solo cuando eso pasa. Las asignaciones a mano también mueven el reloj, o el
reparto repartiría por igual sobre una carga ya torcida. Sin responsable, la conversación **la
tiene el sistema** y se reclama de un clic desde el hilo: buscarse a uno mismo en un desplegable
de doce nombres acaba en que nadie reclama nada.

**Fase 4, T11 — enviar adjuntos.** La URL que lee Meta se firma **en el despacho**, no al
encolar: entre pulsar y llamar pueden pasar quince minutos de bloqueo por límites y una firma
hecha antes llegaría caducada. Efecto secundario que importa: no queda ninguna URL firmada
escrita en una tabla que los miembros leen. Hay una comprobación que falla si algún día aparece
un `https://` en el cuerpo encolado.

Envío real el mismo día: PNG de 232 KB por Instagram, `message_id` devuelto, echo a los **seis
segundos**, y el contacto confirmando. Después un GIF y un corazón, los dos aceptados.

**Fase 5, T12 — diagnóstico de conexiones.** Siete comprobaciones, cada una con su resultado y
su causa escrita como acción. `no_verificable` es un resultado de primera clase y se pinta en
gris, no en rojo: el toggle de «permitir acceso a mensajes» no lo expone ninguna API, y fingir
un fallo manda a alguien a arreglar lo que no está roto. Primera pasada real: 5 en verde, 0 en
rojo, 2 sin saber.

**Fase 5b — panel interno.** Cinco pantallas, cinco preguntas: qué cliente está roto, qué
distingue a cada espacio, a qué Página crearle cuenta, quién ha mirado datos de quién, y qué
cliente se va a ir. Ninguna devuelve contenido: el break-glass sigue siendo el único camino a lo
que un cliente escribió, y esa protección no es la política de la base, es la fricción
deliberada.

**`kavea.ai/demo`.** Decisión de Gabriel: nada de cuenta gratuita hasta tener Tech Provider. Una
cuenta free hoy sería una bandeja vacía con un botón que no funciona, y eso no se lee como
«todavía no» sino como «esto está roto».

**Un solo reloj.** Había dos: los componentes de servidor pintaban en UTC —el hilo de una
conversación de Caracas enseñaba cada mensaje cuatro horas en el futuro— y los de cliente en el
huso del navegador. Ahora todo va por `organizations.zona_horaria`, que además por fin se puede
editar.

#### Nueve invariantes de Meta, medidos y no leídos

Todos del 2 de agosto, con método anotado en `docs/03-invariantes-meta.md`:

1. `subscribed_fields` literales: **plural** en `messaging_referrals` y `messaging_handovers`, y
   **`message_reactions`**. Cierra el incierto C3.
2. `messaging_feature_status` en una Página que funciona:
   `{hop_v2: true, ig_multi_app: false, msgr_multi_app: false}`. No establece cuál significa
   «default application designada»: eso exige el diff antes/después.
3. **`tasks` no existe en el nodo de la Página.** Pedirlo devuelve error 100.
4. **Un campo de más en una lista de `fields` ANULA la respuesta entera.** No la degrada.
5. El Page Access Token derivado **no caduca** (`expires_at: 0`).
6. **El GIF se puede enviar** como `image` — la restricción «solo PNG y JPEG» era nuestra,
   disfrazada de restricción de Meta.
7. Meta **transcodifica el GIF saliente**, al menos en el echo: el asset es un JPEG fijo.
8. El único sticker enviable es el corazón, y **su echo vuelve como texto** con `❤`.
9. **La media entrante no siempre viene de un CDN de Meta**: el selector de GIF de Instagram
   sirve desde `media4.giphy.com`.

#### Los fallos que costaron, y lo que enseñan

- **Tres decisiones razonables encadenadas pierden datos en silencio.** Los GIF que mandó el
  contacto no se guardaban: allowlist de hosts correcta en intención y corta en alcance, CHECK de
  coherencia correcto por separado, y un `exception when others` que protege el mensaje. Ninguna
  es el error; el error es que no quedaba rastro. El comentario decía que el adjunto «se pierde
  con métrica» y **no había métrica**.
- **Vacío y roto no pueden verse igual.** `panel_salud` fallaba por un `sum()` que devuelve
  `numeric` declarado `bigint`, y el cargador se tragaba el error: la pantalla decía «no hay
  espacios» teniendo uno. Un panel de salud que miente diciendo que todo está bien es peor que no
  tenerlo.
- **Un espacio sin dueño no está a medias: es inútil.** El alta creaba la organización y nadie
  podía entrar, porque el staff de Boosty no es miembro de las organizaciones de sus clientes y
  `invitar_miembro` exige pertenencia. Y el alta decía «hecho».
- **Dos bloqueos de CSP encadenados y los dos mudos.** El formulario de demo no hacía nada: el
  script inline descartado, y `connect-src` sin declarar habría matado el fetch igual. Arreglar
  solo el primero habría dado la sensación de haberlo arreglado.
- **El guardián tenía un punto ciego.** Una migración registraba actividad con un `insert`
  directo y `comprobar-actividades.mjs` solo mira las llamadas a `registrar_actividad`: el
  guardián que existe porque cuatro veces llegó a producción un identificador sin traducir se
  habría callado.
- **Dos nombres para el mismo secreto.** La ruta de alta pedía `CORREO_REMITENTE`, que no existe;
  la de invitar lo tiene escrito a mano. El correo del alta no se habría enviado nunca y nada
  habría fallado visiblemente.
- **Playwright diciendo «clicking the checkbox did not change its state» era un bug real**, no un
  problema de la prueba: el control no se movía hasta que contestaba el servidor.

#### Una propiedad que el sistema perdió, a conciencia

Hasta hoy Kavea **solo podía descifrar**. Un compromiso de la aplicación permitía leer
credenciales existentes pero no fabricar ninguna nueva. Añadir `cifrar` era necesario para dar de
alta clientes sin SQL, y el intercambio está escrito en `docs/fases/05b` §6. No ocurrió por
descuido.

### 2026-08-02 · Boosty conectada y el amortiguador probado con mensajes reales

**Canales conectados.** Página `1790677317841377` (Boosty.digital) con Instagram
`17841421294200897` (@boosty.digital) vinculado, que es el requisito no negociable de v1. App
suscrita con ocho campos. Token de Página cifrado con AES-256-GCM en `private.meta_credentials`,
`kid=k1`, con la clave en los secretos del proyecto y fuera de la base.

`messaging_feature_status` devuelve `hop_v2: true`, `msgr_multi_app: false`,
`ig_multi_app: false`: Conversation Routing activo y sin conflicto multi-app.

#### El primer mensaje real

Un DM de Instagram, 403 bytes, `firma_ok = true`, escrito en 1 ms. Enrutado resuelto:
`asset 17841421294200897 → boosty`.

Eso cierra lo único que quedaba sin verificar de la firma: **la implementación del HMAC cuadra
con la de Meta**, no solo con `openssl`.

**Resuelve una incertidumbre del `03`:** el objeto llega como `"instagram"`, no como `"page"`.
Las dos páginas oficiales de Meta se contradecían. El parser sigue aceptando ambos, pero ahora
se sabe cuál llega.

#### El amortiguador, probado con una caída provocada

Se rompió `KAVEA_SUPABASE_SECRET` a propósito para que las escrituras a Postgres fallaran, y se
enviaron mensajes reales durante la ventana:

```
14:29:47  ruta=directa   antes de romper
14:35:55  ruta=blobs     durante la caida
14:38:23  ruta=blobs     durante la caida
14:41:05  ruta=directa   tras restaurar
```

Los dos del medio se rescataron con el drenaje. `recibido_en` conserva el instante original de
la entrega y `drenado_en` marca el rescate: sin esa distinción, una caída larga falsearía toda
la latencia medida.

#### Tres hallazgos que costaron encontrar

**1. Los secretos de Supabase no son legibles por API: devuelve su SHA-256.** Se descubrió
comparando el verify token que se había puesto con lo que devolvía la API — no coincidían, y lo
devuelto tenía forma de hash. Es la protección correcta, pero significa que **no se pueden
firmar peticiones de prueba desde fuera** y toda verificación de firma necesita una entrega real
de Meta.

**2. `encodeURIComponent` sobre la clave completa rompía el amortiguador entero.** Convierte la
barra en `%2F` y Netlify guarda el objeto con ese nombre literal: `crudo%2F2026-...`. El objeto
se escribía bien, pero el filtro por prefijo `crudo/` no lo encontraba y **el drenaje no veía
nada**. Se descubrió porque dos mensajes reales estaban atrapados en el store mientras el
listado los daba por inexistentes. Corregido codificando segmento a segmento y conservando las
barras; el drenaje lista ambos prefijos para rescatar lo escrito por la versión con el fallo.

**3. Con Postgres caído, las alertas también se pierden.** `alertar()` escribe en Postgres, así
que durante el incidente que más importa no queda rastro. No es un fallo del diseño —el camino
primario de alertas siempre fue externo— pero confirma por qué el vigilante externo no es
opcional.

#### Crones activos

| Trabajo | Frecuencia | Para qué |
|---|---|---|
| `kavea-drenar-blobs` | cada minuto | Vacía el amortiguador cuando la base vuelve |
| `kavea-segar-cola` | cada 5 min | Devuelve a pendiente lo reclamado por un consumidor muerto |
| `kavea-detectar-silencio` | cada 15 min | La desuscripción de Meta es silenciosa: solo la detecta la ausencia de tráfico |

Verificado que `pg_cron` los ejecuta de verdad, no solo que están programados.

---

### 2026-08-02 · El middleware de Netlify no propaga cabeceras al servidor

Se cumplió el riesgo que el plan de la fase 0 marcaba como verificación empírica pendiente, y
conviene que quede escrito porque afecta a cualquier cosa que se construya encima.

**Síntoma:** entrar en `boosty.kavea.ai` devolvía el 404 de la aplicación.

**Diagnóstico.** El middleware inyectaba el slug con
`NextResponse.next({ request: { headers } })`. Ese mecanismo es una función de Next.js que el
Next Runtime de Netlify **emula**, y en la práctica no propaga: la cabecera nunca llega al
componente de servidor.

Lo que descartó las hipótesis fáciles fue una comparación: `admin.kavea.ai` devolvía **307
hacia /entrar** mientras `boosty.kavea.ai` devolvía **404**. Ambas pasan por el mismo
middleware. Si el middleware no corriera, la redirección de admin tampoco funcionaría. Luego el
middleware corre y lo que falla es la propagación.

**Salida.** Leer el `Host` directamente en el servidor, que es una cabecera real de la petición
y la misma que usa el CDN para enrutar. La lógica vive en `app/lib/dominio.ts` y la comparten
middleware y componentes.

**Por qué no abre un agujero:** el slug solo decide qué organización se *intenta* abrir. Quién
puede verla lo decide RLS contra `organization_members`. Un Host inventado resuelve a una
organización inexistente o ajena, y en ambos casos la consulta devuelve cero filas. El
middleware sigue borrando las cabeceras internas por si una futura ruta confiara en ellas.

**Lección transferible:** las funciones de Next.js que un proveedor *emula* hay que verificarlas
en producción, no darlas por buenas porque el build pase y el tipo exista.

---

### 2026-08-02 · Claves legacy de Supabase deshabilitadas

Las claves `anon` y `service_role` basadas en JWT quedaron deshabilitadas el 2 de agosto de
2026 a las 12:38 UTC. El proyecto usa exclusivamente `sb_publishable_*` y `sb_secret_*`.

**Comprobado antes de deshabilitar**, en cuatro capas y no en una:

| Capa | Resultado |
|---|---|
| Repositorio | Cero claves con forma de JWT, cero variables `ANON_KEY` o `SERVICE_ROLE_KEY` |
| Código de la app | Lee cuatro variables, todas del formato nuevo |
| Netlify | `sb_publishable` en todos los contextos, `sb_secret` solo en producción |
| Firma de tokens de usuario | **ES256 asimétrico**, no HS256 |

El cuarto punto es el que despejaba el riesgo real. Un token emitido en ese momento traía
`{"alg":"ES256","kid":"710ef748…"}`: las sesiones no dependían del secreto JWT antiguo, así que
deshabilitarlo no cerraba la sesión de nadie. El HS256 figuraba como `previously_used`, no
`in_use`. Por eso el middleware ya usaba `getClaims()` con verificación local en vez de
`getUser()`, que es una ida y vuelta por petición.

**Comprobado después**, con el servidor respondiendo:

- La clave `anon` antigua devuelve **401 con "Legacy API keys are disabled"** y la marca
  temporal del cambio. La `service_role` antigua, igual.
- Sesión real, lectura bajo RLS, `es_staff` y break-glass: todo sigue funcionando.
- Las tres superficies sirven 200.

**Guarda añadida en CI.** Rompe el build si alguien reintroduce las claves antiguas. Vive ahí y
no en una nota porque reintroducirlas rompería *en producción y no en local*: el CLI local las
sigue emitiendo, así que el fallo no aparecería hasta desplegar.

Detalle que costó un intento: la guarda falló la primera vez porque **se detectaba a sí
misma** —el patrón aparecía en su propio comentario—. Corregida excluyendo ese fichero;
cualquier otro workflow sí se revisa.

---

### 2026-08-02 · Integración continua en verde

Cinco trabajos en GitHub Actions, todos pasando: tipos y build, sitio público, esquema desde
cero con aislamiento, coherencia entre proveedores, y fuga de secretos.

**Los canarios lanzan excepción en lugar de imprimir.** Uno que solo imprime se ignora en
cuanto la salida del CI pasa de veinte líneas. Son siete y se generan desde `pg_catalog`, así
que cubren también las tablas que creen las fases futuras sin tener que actualizarlos.

**Validado provocando una regresión:** creando una tabla sin RLS dentro de una transacción, C1
la detecta por nombre y rompe el build. Igual que la batería de sesiones, que ya se validó
rompiendo una política. Una prueba que no se ha visto fallar no es una prueba.

Dos canarios que no estaban en el plan y se añadieron: función `security definer` sin
`search_path` fijado —vía de escalada por sombreado de objetos— y existencia del `CHECK` que
impide cachear media entrante de Meta, que es causa documentada de rechazo del App Review.

Comprobaciones del sitio público que van en CI: las tres páginas legales existen en el build y
**no se emite ni un byte de JavaScript**. Lo segundo es lo que garantiza que el rastreador de
Meta lea la página entera sin ejecutar nada.

#### Cuatro cosas que costaron y quedan anotadas

1. **`supabase start` ya aplica las migraciones.** El CLI sí reconoce el convenio `0001_`; el
   bucle manual las reaplicaba y fallaba con "type already exists". Se sustituyó por una
   comprobación de que el esquema existe: que `start` no dé error no significa que aplicara
   nada, y sin esa comprobación los canarios pasarían sobre una base vacía.
2. **El CLI 2.15.8 rechaza Postgres 17.** Se subió a 2.111.0. Probar contra 15 lo que corre en
   17.6 es la deriva entre entornos que ese trabajo existe para evitar.
3. **`npm ci` falla en Linux** con un lockfile generado en Windows: faltan las dependencias
   opcionales que arrastra sharp. Se usa `npm install`; las versiones las sigue fijando el
   lockfile.
4. **Un bloque `begin ... exception` de PL/pgSQL abre una subtransacción.** Al capturar el
   error revierte todo lo hecho dentro, incluidas las filas de preparación que las
   comprobaciones siguientes necesitan. El fichero de aislamiento falló por esto y lleva la
   nota.

---

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

### 2026-08-02 · Verificación visual, adjuntos y una persona con varios canales

Primera sesión en la que la interfaz se revisa **mirándola**, con Playwright iniciando sesión
de verdad contra `boosty.kavea.ai` y capturando. Compilar no dice nada sobre si la pantalla
se lee. Cuatro defectos aparecieron a la primera captura y ninguno habría salido de leer el
código.

**Adjuntos.** Antes solo se nombraban ("Imagen"), con la duda documentada de si el navegador
podía cargar `lookaside.fbsbx.com`. Se resolvió midiendo contra la URL real:

| Cabecera | Valor | Qué decide |
|---|---|---|
| Estado sin token | `200`, `image/jpeg`, 220 KB | No hace falta autenticación |
| `Cross-Origin-Resource-Policy` | `cross-origin` | Se puede incrustar |
| `Access-Control-Allow-Origin` | ausente | JS **no** puede leer los bytes |
| `Cache-Control` | `no-store, no-cache, private` | Meta misma pide que no se guarde |

El invariante "solo la URL, nunca el binario" queda intacto: quien pide la imagen es el
navegador del operador, igual que cuando abre Instagram. La ausencia de CORS es la que
descarta el botón de descarga con `fetch` + blob, y el atributo `download` lo ignoran los
navegadores entre orígenes distintos. Se abre el original en pestaña nueva en vez de fingir
una descarga. Un proxy con `Content-Disposition` exigiría que Kavea se bajara el binario, que
es justo el riesgo que el `03` deja abierto pendiente de respuesta escrita de Meta.

Las notas de voz se reproducen en el hilo. Cuando la URL caduque, el hueco se explica solo.

**Una persona, varios canales.** Se unifica el contacto, no la conversación. Un hilo sigue
siendo de un canal porque la ventana de 24 h, el token de envío y la propiedad del hilo lo
son; una conversación mixta tendría dos relojes de ventana y el compositor no podría decidir
si se puede responder. Entran `whatsapp` en el dominio, identidades manuales, fusión
reversible y auditada, y los otros hilos de la misma persona a un clic. Todo pasa por RPC
para que no exista ninguna ruta que escriba sin dejar actividad.

**`linea_tiempo` no tenía `security_invoker`.** Su comentario afirmaba que sí y que en
Supabase era el valor por defecto. Es falso: en Postgres las vistas son `security_definer`
salvo que se diga lo contrario, y `reloptions` estaba en `null`. No hubo fuga porque las tres
tablas base llevan `FORCE RLS` y las políticas resuelven por `auth.uid()`, que no depende del
rol. Pero el aislamiento dependía de dos condiciones que no estaban escritas en ninguna parte.

**Un falso positivo que llevaba semanas en verde.** La comprobación "el staff SIN grant no ve
contenido" exigía cero mensajes en total, y el usuario de prueba es owner de su propia
organización. Pasaba únicamente porque la suite nunca sembró un mensaje: afirmaba que el
break-glass funcionaba sin haberlo ejercido jamás. Ahora pregunta por el contenido **ajeno**,
y se añadió el lado positivo —con grant válido abre, al revocarlo cierra— que tampoco se
probaba nunca.

**Evidencia:**

| Qué | Medición |
|---|---|
| Filtro activo en modo oscuro | `@media` dentro de una lista de selectores: CSS inválido, regla descartada, terracota claro sobre texto claro |
| Lista en móvil | `matchesMax860: true` pero `displayHilo: flex` — la media query iba antes de la regla base y perdía por cascada |
| Apertura del hilo | `scrollTop 0` de `scrollHeight 1325` → aterrizaba en el mensaje más viejo |
| Anchos de burbuja | entrantes `560, 560, 560…` contra salientes `68, 155` — las entrantes heredaban `stretch` |
| Tras arreglar | `alFinal: true`, anchos `122, 146, 84, 79, 190, 68, 155` |
| Multicanal de extremo a extremo | WhatsApp añadido y quitado desde la interfaz, ambas cosas en el hilo |
| Suite de aislamiento | 27 comprobaciones, 27 en verde, ahora cubre `linea_tiempo`, `actividades`, `media` y la fusión |

---

### 2026-08-02 · Fase 3b: la tarjeta es la unidad de trabajo

Un hueco del plan, no un aplazamiento. Las ocho fases tratan `conversations`
como la unidad; la 3 excluye «pipeline comercial y unificación de contactos
entre canales» y ninguna posterior lo recoge. Se añade
`docs/fases/03b-fase-tarjetas.md` **entre la 3 y la 4**, porque la 4 construye el
compositor y si la unidad es la tarjeta el compositor tiene que preguntar por
qué canal se responde y mirar la ventana de ese canal.

**La decisión.** La tarjeta es el asunto; la conversación, el transporte.

| Sube a la tarjeta | Se queda en la conversación |
|---|---|
| Estado del trabajo, responsable, título | Canal, ventana de 24 h, token, propiedad del hilo, espacio de `mid` |
| Campos propios del negocio | `cerrada_en`, que es su ciclo de vida propio |

Fundirlo todo obligaría a llevar dos relojes de ventana en la misma fila y el
compositor no podría decidir si se puede responder.

**Unión automática y determinista:** una conversación nueva de un contacto que
ya tiene tarjeta viva entra en esa tarjeta. Mismo `contact_id`, sin interpretar
parecidos. **Manual:** `unir_tarjetas`, que si además son dos personas distintas
unifica también el contacto. Una sola palabra para quien atiende aunque por
debajo toque tres tablas.

**Campos propios** con definiciones por organización, valor `jsonb` validado por
tipo en la frontera y pantalla en `/ajustes/campos`. Se archivan, no se borran:
borrar la definición se llevaría por delante el histórico de valores, que es
justo el dato que alguien quiso guardar.

**Varios canales sin convertir el hilo en un semáforo:** filete de 2 px en el
borde de la burbuja, separador solo cuando cambia el canal, y el canal también
en texto en el pie. Un hilo de un solo canal se ve exactamente igual que antes.

**Evidencia:**

| Qué | Medición |
|---|---|
| Relleno de tarjetas | Cero conversaciones sin tarjeta; estado y contador arrastrados |
| Unión desde la interfaz | Dos tarjetas → una. Cabecera con `Instagram 21 h` y `Messenger 23 h`, cada una con su ventana |
| Distinción de canal | Dos colores de filete distintos medidos: `rgb(168,68,122)` y `rgb(47,111,181)` |
| Campos | Tres definidos, rellenados y registrados con su valor en el hilo |
| Aislamiento | 34 comprobaciones, 34 en verde |

**Tres defectos que solo se vieron mirando la pantalla:**

1. El buscador de tarjetas devolvía **cero** con la tarjeta buscada delante.
   PostgREST no resuelve columnas de un recurso embebido dentro de `or=(...)`:
   `contacts.nombre.ilike` no filtra, devuelve vacío y **no da error**, que es la
   peor combinación posible. Se busca en dos pasos.
2. El separador de canal saltaba también con la actividad, que cuelga de una
   conversación y por tanto trae canal. Salía un separador «Instagram» seguido
   de ninguna burbuja de Instagram. Ahora solo lo disparan los mensajes.
3. «Unió otra tarjeta con esta» salía **dos veces**. Los RPC escribían la
   actividad recorriendo todas las conversaciones de la tarjeta. Con un canal
   daba una fila y parecía correcto; con dos, dos. El bucle era el síntoma: hay
   actividad que es del asunto y no de ninguna conversación. `actividades` lleva
   ahora `tarjeta_id`, con un `CHECK` de que las dos referencias son excluyentes.

Los datos sintéticos de la demostración se borraron, incluido revertir el nombre
que la unión copió al contacto real.

---

### 2026-08-02 · Fase 3c: embudos, y el eje que Kommo mezcla

Otra vez alcance **perdido**, no nuevo. El `00-documento-base.md` §9 lista desde
el primer día una «Fase 4 — Comercial: contactos unificados, pipelines, campos
personalizados». El plan de ocho fases nunca la recogió. La 3b devolvió los
contactos y los campos; la 3c devuelve los embudos.

**La frase «no es un CRM» del `00` se aclaró, no se contradijo.** Descarta el
posicionamiento, no la funcionalidad: el mismo documento dice que Kavea nace
para reemplazar Kommo y que «se replica lo que se usa». Lo que sigue fuera:
previsión, cuotas por vendedor, puntuación de oportunidades y vistas de tabla.

**La decisión de diseño que separa a Kavea de Kommo:**

| | `estado` | `etapa` |
|---|---|---|
| Responde | ¿Necesita a alguien **ahora**? | ¿Dónde está en el **proceso comercial**? |
| Se ve en | Bandeja | Embudo |

Una tarjeta puede estar **esperando** y a la vez en **Propuesta enviada**. Kommo
los mezcla: mover de etapa cambia el estado, y cerrar la conversación saca la
tarjeta del embudo. El resultado conocido es que o el embudo miente sobre el
negocio o la bandeja miente sobre el trabajo pendiente. Aquí van en dos columnas
y **ninguna acción sobre una toca la otra**, con una comprobación en la suite
que lo vigila. Mover a «Ganada» no cierra la conversación: si el cliente sigue
escribiendo, la conversación sigue viva.

Varios embudos por organización —ventas y cobros son procesos distintos—, etapas
con tipo `abierta`/`ganada`/`perdida`, valor y moneda de primera clase porque el
tablero suma por columna, y `etapa_desde` para el «lleva 9 días aquí», que es la
señal más útil de un embudo.

**Evidencia:**

| Qué | Medición |
|---|---|
| Tablero | Seis columnas, terminales con borde discontinuo, suma por cabecera |
| Valor y movimiento | 2400 USD guardado, tarjeta movida a Interesado, columna sumando `2400 US$` |
| Los dos ejes | Estado `En curso` **antes y después** de mover de etapa |
| Actividad | «movió la tarjeta de Nuevo a Interesado», una sola línea |
| Aislamiento | 42 comprobaciones, 42 en verde |

**Un hueco de producto que destapó la suite.** La semilla de embudos de 0031
recorrió las organizaciones existentes. Las que se crearan después —es decir,
**todos los clientes del onboarding de la fase 7**— nacían sin embudo, y
`tarjeta_de_contacto` les creaba las tarjetas **sin etapa, en silencio**: las
conversaciones entraban, se veían en la bandeja, y no estaban en ninguna parte
del tablero. Ahora hay trigger al crear la organización. Es la segunda vez en
dos días que la suite de aislamiento encuentra algo antes que la interfaz.

**Y un defecto de la propia suite.** Una corrida que aborta a mitad no llegaba a
su limpieza y dejaba las organizaciones de prueba, el usuario dentro de `staff` y
los campos creados. La siguiente fallaba en cosas que funcionaban: «A ve tres
organizaciones», «es_staff() no es falso», «A ve los adjuntos de B». Ahora limpia
al **empezar**, que es donde sí se ejecuta siempre.

---

### 2026-08-02 · Fase 3d: ficha con pestañas, archivos e historial comercial

**La decisión que había que acertar:** los documentos comerciales cuelgan de la
**persona**, no de la tarjeta. Un cliente que compra tres veces al año tiene
tres asuntos y un solo historial; si colgaran de la tarjeta, al abrir la
conversación de hoy no se vería lo que compró en marzo, que es justo el dato que
decide cómo se le atiende. `tarjeta_id` queda como referencia informativa: dice
de qué conversación salió, sin que el documento le pertenezca.

Con los **archivos** es al revés y también a propósito: uno puede ser de la
tarjeta, de la persona o de la organización entera —el catálogo, la lista de
precios—, y las tres combinaciones significan cosas distintas.

**La frontera, para no acabar construyendo un ERP:** Kavea **registra**
documentos, no los **genera**. Sin componer PDF, sin impuestos, sin inventario,
sin contabilidad. Por eso no hay líneas de detalle: sin generación ni cálculo
solo servirían para volver a sumar a mano un total que ya viene dado.

**Dos cosas que se calculan en vez de guardarse o de comprobarse tarde:**

- **Lo vencido** sale de `vence_en < current_date`, no de un `estado` almacenado.
  Un estado guardado exigiría un cron nocturno y que alguien notara el día que
  dejara de correr.
- **Los límites de Meta** se comprueban **al subir**, no al enviar. Es la
  diferencia entre avisar cuando todavía se puede cambiar el archivo y fallar
  delante del cliente cuatro días después.

**La pestaña activa va en la URL.** Con estado local, el refresco de tiempo real
—que llega cuando entra un mensaje, en cualquier momento— devolvería al operador
a «Datos» mientras rellena un presupuesto en «Compras».

**Evidencia:**

| Qué | Medición |
|---|---|
| Subida real a Storage | PDF y PNG de 9 MB subidos desde el navegador al bucket privado |
| Aviso de Meta | El PNG de 9 MB queda marcado «no se podrá enviar · las imágenes no pueden pasar de 8 MB» |
| Los tres números | Presupuesto de 1200 fuera del cómputo; factura de 800 vencida → `0 comprado / 800 pendiente / 800 vencido` |
| Vencido | La factura con `vence_en` en el pasado se marca sola, sin cron |
| Pestaña en la URL | `?f=compras` sobrevive a un recargado completo |
| Aislamiento | 48 comprobaciones, 48 en verde |

**Un error mío que conviene anotar:** hice commit y push del arreglo de las
etiquetas de actividad **antes** de mirar la salida de `npm run build`. El build
estaba roto y el despliegue quedó en error unos minutos. El orden correcto es
compilar, mirar, y solo entonces publicar; lo tenía y lo salté.

---

### 2026-08-02 · Fase 4: el compositor, la cola de salida y el despachador

Kavea ya puede emitir. La bandeja deja de ser de solo lectura.

**Una sola ruta habla con el Send API:** la Edge Function `despachar`. Si
apareciera un segundo camino, la ventana de 24 h y los límites se aplicarían en
uno y no en el otro, y el que falta es el que rompe la mensajería de la Página
del cliente.

**La ventana vive en un solo sitio.** `ventana_de()` en Postgres, y la usan
tres: el compositor para pintar, el RPC para encolar y el despachador para
despachar. Tenerla escrita dos veces es tenerla mal una vez. **Se reevalúa en el
despacho**, y con ella el tag: una conversación que cruzó las 24 h mientras
esperaba en cola necesita `HUMAN_AGENT`, y mandarla sin él devuelve 100.

**El contador de bytes no es decoración.** Instagram admite 1000 **bytes**, no
caracteres. Medido en vivo: `Buenos días, ¿cómo está? 🙂` son 27 caracteres y
**33 bytes**. En Venezuela, República Dominicana y México eso es todos los
mensajes. `octet_length` en la base, `TextEncoder` en el navegador.

**Lo enviado se ve desde el primer segundo.** No está confirmado que Instagram
entregue echoes por la vía Facebook Login —dos páginas oficiales se
contradicen—, así que la cola de salida entra en la línea de tiempo con su
estado y se retira sola cuando el echo trae el mismo `mid`. Si el hilo esperara
al echo, el operador escribiría, no vería nada y volvería a escribir.

**Probado contra Meta de verdad, sin escribirle a ninguna persona.** Se encoló
un envío con un destinatario inventado:

| Paso | Resultado |
|---|---|
| Reclamar de la cola | 1 fila, `estado = enviando` |
| Resolver y descifrar el token | Correcto, AES-256-GCM con `kid` |
| Llamada a Graph | `POST /v26.0/me/messages`, form-data |
| Respuesta de Meta | `(#100) Parameter error: You cannot send messages to this id` |
| Política aplicada | `fallido`, **cero reintentos**, que es lo correcto para un 100 |
| Uso anotado | `tipo=app`, `http_status=400`, `error_codigo=100` |

**Lo que falta y no puedo hacer yo:** el envío real a una persona. La
conversación viva de Boosty es con alguien de carne y hueso, y mandarle un
mensaje de prueba es una acción hacia fuera que decide Gabriel, no yo. Todo lo
demás está verificado.

**Dos errores míos en esta fase**, los dos por escribir SQL sin ejecutarlo:

1. `private.reclamar_envios` en el esquema privado, que PostgREST no expone. El
   despachador devolvía `PGRST202` y la fila se quedaba quieta. El patrón del
   envoltorio en `public` ya existía desde 0020 y no lo apliqué.
2. `distinct on (...) ... for update skip locked` es SQL inválido: Postgres
   responde «FOR UPDATE is not allowed with DISTINCT clause». Al arreglarlo salió
   además que una fila por partición y tanda era demasiado prudente: tres
   mensajes seguidos habrían tardado tres despachos. Ahora son hasta tres por
   partición, que es fluidez sin permitir que un cliente monopolice la cola.

---

### 2026-08-02 · Un mensaje real, y cuatro incertidumbres cerradas de golpe

Gabriel autorizó el envío. Se mandó desde la interfaz, por el camino completo que
usa un operador: compositor → `encolar_envio` → cola → despachador → Graph.

**Llegó.** `HTTP 200`, `message_id` real, y el echo de vuelta en menos de 15
segundos.

Lo interesante es lo que ese único mensaje resolvió. Cuatro cosas que llevaban
semanas marcadas como «bloquean construcción» porque **dos páginas oficiales de
Meta se contradicen** y no se pueden resolver leyendo:

| # | Duda | Respuesta empírica |
|---|---|---|
| 4 | ¿`messaging_type` es obligatorio en Instagram? | **No.** Se envió sin él y devolvió 200 |
| 5 | ¿El `message_id` del Send API coincide con el `mid` del echo? | **Sí.** El join casó a la primera |
| 6 | ¿Instagram entrega echoes por la vía Facebook Login? | **Sí**, en menos de 15 s |
| 7 (fase 4) | ¿En qué cubo de `X-Business-Use-Case-Usage` cae un envío por `/me/messages`? | **`messenger`**, no `instagram` |

La número 6 era la que más pesaba: el hilo muestra la cola de salida hasta que
llega el echo precisamente porque no se sabía si llegaría. Ahora se sabe que sí,
y la desduplicación funcionó: la línea de tiempo enseña **una** burbuja, no dos.

### 2026-08-02 · Operar la tarjeta: cerrar, asignar y anotar

Un hueco que solo se ve intentando usar el producto una jornada entera: la
bandeja **filtraba** por estado y no dejaba **cambiarlo**. Se podía recibir,
leer, clasificar en el embudo y responder, pero no cerrar una conversación ni
pasársela a un compañero.

**Cerrar una tarjeta cierra sus conversaciones**, y eso no es un detalle. Sin
ello: la tarjeta se cierra, la conversación sigue viva, y el siguiente mensaje
del contacto lo engancha `resolver_conversacion` a esa conversación… cuya tarjeta
está cerrada. El mensaje entra en la base, no sale en la bandeja de lo abierto y
**nadie lo ve**. Es exactamente el fallo que Kavea existe para evitar.

Reabrir comprueba que la persona no tenga ya otro asunto abierto, y lo explica en
vez de dejar que reviente el índice único con un error de constraint.

El estado y la asignación se escriben con un PATCH directo sobre columnas, no por
RPC. No es una excepción a «todo pasa por RPC para que quede actividad»: son
columnas, y el trigger las ve cambiar pase lo que pase. Que lo vigile la base es
más fuerte que confiar en que cada ruta se acuerde.

---

### 2026-08-02 · Buscar, y un índice que llevaba un mes sin servir a nadie

`messages_busqueda_idx` existe desde la fase 3. **Nada lo usaba.** Un GIN que se
paga en cada mensaje que entra y no servía ni una consulta. Con treinta
conversaciones no se nota; con trescientas, no encontrar una es no poder
trabajar.

Busca en el contenido, en el nombre de la persona y en el título, y devuelve
**tarjetas, no mensajes**: quien escribe «presupuesto» quiere el asunto donde se
habló de eso, no catorce líneas sueltas de cuatro conversaciones.

`websearch_to_tsquery` en vez de `plainto`: entiende comillas para la frase
exacta y el guion para excluir, que es lo que la gente ya escribe sin que nadie
se lo explique. Y trigramas para la mitad `ilike`, porque un nombre propio no se
lematiza y buscar «Gonzá» tiene que encontrar «González».

**El resaltado no puede ser HTML, y esto es lo importante de la entrada.**
`ts_headline` devuelve `<b>palabra</b>` por defecto. Ese texto lo escribió un
tercero: pintarlo con `dangerouslySetInnerHTML` para ver la negrita sería XSS
almacenado servido desde la bandeja del cliente. Un contacto escribe
`<img onerror=…>` y ejecuta en el navegador del operador que busque esa palabra.
Se delimita con `chr(1)` y `chr(2)` y se pinta con React, que escapa todo.

La función es `security invoker` a propósito: el filtro por organización lo pone
RLS sobre las tablas base. Una búsqueda `security definer` sería la forma más
fácil de que un tenant encontrara texto de otro.

**Comprobado en vivo:** «recibido» encuentra «Recibe» —lematizado español—, con
la coincidencia resaltada; un término inexistente da un vacío que explica dónde
se buscó.

---

### 2026-08-02 · Módulos de equipo, plantillas y agenda

Tres de los seis módulos que pidió Gabriel. Quedan actividad global y contactos.

**Equipo.** Invitaciones por correo con Resend, roles y una matriz de permisos.
Del token solo se guarda el `sha256`: un volcado de la base no da acceso a
ninguna organización. El token en claro sale una vez, del RPC al servidor y de
ahí al correo; **nunca pasa por el navegador**, donde quedaría en la pestaña de
red y en cualquier extensión instalada.

De paso salió un defecto: `es_owner()` comprueba `rol = 'owner'` literalmente, y
se había usado en 0028 y 0031 pensando «quien administra». Un **admin no podía
definir ni un campo**. Ahora la matriz vive en `puede(org, accion)`, un solo
sitio, y la interfaz llama a la misma función para decidir qué enseña: no puede
haber un botón que se pueda pulsar y falle.

**Plantillas.** Internas con variables con nombre; de WhatsApp con huecos
numerados, porque así funciona su API. Las variables sin resolver **se avisan,
no se maquillan**: un «Hola , ¿cómo estás?» que sale al cliente es peor que no
mandar nada, y el hueco vacío no se ve al releer.

Y el importe pierde el separador de millares. `to_char` con `lc_numeric` daba
`2,400.00`, que en España y Venezuela se lee *dos con cuarenta* y en México *dos
mil cuatrocientos*. **No hay formato correcto para los tres mercados**, así que
`2400`: se lee un poco peor y significa lo mismo en todas partes.

**Agenda.** Tareas con recordatorio, calendario mensual y centro de
notificaciones. Tres reglas comprobadas en vivo:

| Regla | Prueba |
|---|---|
| No se repite un recordatorio | Primera pasada del cron: 1 aviso. Segunda: 0 |
| Se agrupan | Tres mensajes seguidos → **una** notificación con el cuerpo del último |
| Nadie se notifica a sí mismo | El disparador compara con `auth.uid()` |

La segunda es la que salva el centro: sin ella, media hora sin mirar deja
cuarenta líneas de la misma conversación y la reacción de cualquiera es vaciarlo
a ciegas. Una bandeja que se vacía sin leerse no notifica nada.

**Y un aviso críptico de React que escondía un fallo de negocio.** Un error #418
de hidratación en el calendario. La causa: se colocaba cada tarea por su fecha
en **UTC**, así que una a las 22:00 de Caracas —02:00 UTC del día siguiente—
aparecía **un día tarde**. A Kavea le faltaba un dato: en qué huso trabaja el
negocio. Boosty opera en tres. Ahora `organizations.zona_horaria`, validada con
trigger porque un `CHECK` no admite subconsultas y la lista de husos cambia con
las actualizaciones del sistema.

**Cuatro tropiezos míos, tres de ellos repetidos:**

1. Tercer componente de cliente que arrastra `next/headers` al bundle por
   importar un valor de un módulo de datos. Los cuatro llevan ya `server-only`
   en la primera línea: no evita el fallo, pero convierte una traza confusa en
   un error que dice lo que pasa.
2. Segunda vez llamando a `.schema('private')` desde la aplicación, que
   PostgREST no expone. Peor que de costumbre: la página trataba «no puedo
   consultar» y «no existe» como lo mismo, así que un enlace válido decía «esta
   invitación ya no vale». Un fallo de infraestructura disfrazado de invitación
   caducada.
3. `renderizar_plantilla` era `security invoker` y necesita `auth.users`, sobre
   la que `authenticated` no tiene lectura. Daba 403 y el compositor insertaba
   texto vacío, sin error visible. Al pasarla a `definer` hubo que escribir a
   mano las dos comprobaciones que la RLS hacía sola.
4. La casilla de completar una tarea no se marcaba hasta que contestaba el
   servidor. Lo dijo Playwright antes que yo.

---

### 2026-08-02 · Actividad global y contactos. Los seis módulos, cerrados

**«Absolutamente todo» se verificó, no se supuso.** Se auditaron las 41
funciones públicas: las 30 que cambian algo registran actividad; las 11 restantes
son mecánica de colas, estado de lectura o funciones de extensiones.

Y apareció un hueco real: **`contacts` se edita con un PATCH directo**. Las
columnas `nombre`, `username` y `profile_pic_url` están concedidas desde 0026
para que la ficha funcione, así que la edición no pasaba por ninguna función y
**cambiar el nombre de un contacto no dejaba rastro**. Cerrado con trigger, no
obligando a un RPC, por lo mismo que el estado de la tarjeta: depender de que
cada ruta se acuerde de registrar es garantizar que alguna no lo haga.

El registro se pagina por **cursor** sobre `created_at`, no por offset: con
offset, una actividad nueva desplaza todo y la página 2 repite lo que ya se vio
en la 1. Y se filtra por familia, no por tipo: cuarenta y ocho tipos no son un
menú.

**Duplicados: se proponen, nunca se unen solos.** Cada pareja lleva la fuerza de
la señal a la vista. Comprobado con datos sembrados:

| Fuerza | Pareja | Motivo |
|---|---|---|
| Fuerte | Pedro Ruiz ↔ P. Ruiz | Mismo teléfono |
| Débil | Maria Gonzalez ↔ María González | Mismo nombre |

El primero es el que justifica el módulo: por nombre esos dos **nunca** se
habrían cruzado. El segundo es literalmente el ejemplo que el documento 02 usa
para explicar por qué no se une automáticamente — pueden ser dos personas, y
una unión errónea muestra la conversación de un cliente bajo el nombre de otro.

Lo que directamente no puede ocurrir ya estaba prevenido: dos contactos con la
misma identidad de canal lo impide el índice único de `contact_identities` desde
0006. La prevención vale más que cualquier detección.

---

## 3. Pendiente, por orden de urgencia

> Revisado de arriba abajo el **3 de agosto de 2026**. Agrupado por **qué lo bloquea**, no por
> fase: lo que decide en qué se trabaja mañana no es el número de la fase, es si hace falta
> que alguien de fuera haga algo primero.

### 3.1 Bloqueado por Meta — el trámite YA no bloquea, desde el 4-ago

> Tech Provider quedó verificado el 4 de agosto de 2026. Lo que sigue bloqueado por Meta es
> solo el App Review, y su lista real, pantalla por pantalla, está en §3.7.

**Tech Provider y App Review.** Reverificado el 3 de agosto, y **casi todo lo que esta tabla
decía había dejado de ser cierto**. El bloqueo tampoco era el que se creía: no es que no se
pueda enviar el App Review, es que **no se puede ni añadir un permiso sin ser Tech Provider**.
Y hay plazo: la Access Verification debe completarse antes del **2 de octubre de 2026** o Meta
restringe **dos** apps del portafolio.

| Qué | Estado |
|---|---|
| Ajustes básicos: icono, categoría, las tres URLs | ✅ Completos. Meta dice *"All required app settings are complete"* |
| Correo de contacto de la app verificado | ✅ Verificado. La API devolvía `contact_email_verified: false`, y el dashboard dice lo contrario: manda el dashboard |
| DNS de `kavea.ai` en Resend | ✅ `verified` desde el 2-ago 05:39 UTC, con `sending` y `receiving`. La invitación del 2-ago se entregó a las 19:55. Este documento afirmaba que Kavea no podía enviar ni un correo |
| Al menos una llamada exitosa por permiso | ✅ Los diez con tráfico. Detalle en la entrada del 3-ago y en `05` §6 |
| Use cases sin `instagram_business_*` | ✅ Los dos que estaban, fuera. Queda quitar `pages_utility_messaging`, que tiene 0 llamadas y está fuera de v1 |
| Un screencast por cada permiso | ⬜ **Sin grabar. Es lo único que queda del requisito de evidencia**, y no lo puede hacer un cron |
| Un tenant demo al que el revisor entre | ⬜ Sin montar |
| **Access Verification (Tech Provider)** | ⬜ Formulario abierto y respondido sobre el papel, sin enviar. Ver `05` |

**Los tres callbacks que Meta exige y no existen.** Son código, no dependen de nadie, y sin
ellos no hay App Review:

- `deauthorize` — el cliente revoca desde Meta. Desconecta y avisa; **no borra datos**.
- `data deletion` — devolviendo exactamente `{url, confirmation_code}` y su página de estado.
- Verificación del `signed_request` (HMAC-SHA256 sobre la base64 **sin decodificar**).

**WhatsApp, entero.** Es un tercio del producto y probablemente el canal de más volumen en
Venezuela, República Dominicana y México, y **no hay ni una línea**. Sin investigar: la forma
del webhook —una cuarta forma de payload incompatible con las tres de Messaging—, categorías y
aprobación de plantillas, precio por conversación, quality rating, verificación de número,
Display Name approval y Embedded Signup.

### 3.2 Bloqueado por una decisión de Gabriel

| Qué | Por qué está parado |
|---|---|
| **Fase 6, agentes** | Aparcada por decisión, y además **no hay `ANTHROPIC_API_KEY`** en los secretos. Sin ella el trabajador no se puede escribir ni probar. Sí se puede avanzar en `agent_runs`, el catálogo de intenciones y el motor de escalamiento |
| Carril de acuse sub-30 s | Auto-responde a **todo** entrante. Es decisión de producto |
| ~~Comentarios de Instagram y Facebook~~ | **Desbloqueados el 3 de agosto de 2026.** Entran en v1 por decisión de Gabriel. Ya no es un bloqueo de decisión sino trabajo pendiente: modelo de datos propio con su RLS, ingesta de `changes[]`, y `instagram_manage_comments` en Advanced Access. El permiso no se envía antes de que la ingesta exista, porque Meta pide una llamada exitosa y un screencast por permiso |
| Cuenta gratuita pública | Decidida para cuando llegue Tech Provider. Los límites, sin decidir |
| Facturación | Se mide el uso, no se cobra. Tarifas, liquidación y márgenes sin empezar |
| ¿Se puede cambiar el subdominio de un cliente? | Hoy bloqueado, sin decisión explícita. Cambiarlo rompe los enlaces repartidos |
| Impersonación con registro | La herramienta de soporte que de verdad hace falta, y la que más puede doler |

### 3.3 Sin bloqueo: es trabajo

**Fase 5 — lo que queda del autoservicio (24 de 26 tareas).** El código se puede escribir hoy;
probarlo necesita los dos `config_id` que se crean en el App Dashboard.

- Las dos configuraciones de Facebook Login for Business, separadas por canal
- `GET /api/meta/oauth/start` y `/callback` con sus siete pasos en orden
- Token BISU, rotación perezosa por `kid`, cron diario de `debug_token`, botón de reconectar
- Enlace de conexión firmado, un solo uso, 72 h, sin sesión de Kavea
- Máquina de estados por `(organización, canal)` con `degradado`, `desconectado`, `suspendido`
- Conversation Routing: `primary_receiver`, los seis endpoints de thread control, `thread_owner`
- Árbol de diagnóstico diferencial hasta la hoja «causa residual»
- Pantalla de expectativas de WhatsApp

**Fase 4 — lo que quedó suelto:**

- **Messenger nunca se ha probado de extremo a extremo.** No hay contacto vivo por esa vía;
  Instagram sí, varias veces
- Circuit breaker de límites a `call_count > 80`. Hoy se reacciona al error, no se previene
- Corte de texto de Instagram por 1000 bytes **respetando grafemas**. Hoy se rechaza, no se corta
- Guardarraíles de repositorio en CI: tags muertos, hosts prohibidos, versión literal
- Del GIF saliente: confirmar en el aparato del destinatario si le llega animado

**Panel interno — lo que falta:**

- **Pedir** un break-glass desde el panel. Se puede cortar, no abrir: hoy sigue siendo SQL
- Las alertas no tienen superficie. `alertar()` escribe y nadie lo lee
- Ficha por espacio. Todo son agregados
- **El alta de cliente y la conexión de una Página están construidas y nunca ejecutadas contra
  un cliente real.** Es la prueba que falta

**Fase 7:** kill-switches (global, por tenant, por canal), drenaje de la cola marcando
**caducados** los mensajes que perdieron la ventana en vez de tirarlos en silencio,
`GET /api/estado` con banner en menos de 30 s, tenants canario en producción, y el documento de
límites que el cliente firma antes de que se le cree la organización.

**Dos trabajos nuevos que salieron de medir, el 3 de agosto.**

- **Reconocer lo propio por `mid` y no por `app_id`.** En Instagram los echoes no traen
  `app_id` y no hay forma de conseguirlo: el topic no tiene `message_echoes`. Hoy todo lo que
  Kavea envía por Instagram se clasifica como `humano` y es indistinguible de lo que el cliente
  escribe desde el móvil, lo que deja sin defensa el bucle del agente de IA. La alternativa está
  medida: el `mid` del echo es el `message_id` que devolvió el Send API, y ya se persiste en
  `send_api_message_id`. La comparación va en el aplicador, que consulta la base, no en los
  adaptadores, que son función pura.
- **Enriquecer el contacto con nombre y foto.** `contacts.nombre` está en `null` y la bandeja
  muestra tarjetas sin nombre. `GET /{igsid}?fields=name,username,profile_pic` devuelve las tres
  cosas con `instagram_manage_messages`, que ya se tiene: no hace falta pedir ningún permiso
  nuevo. Es una llamada por contacto nuevo.

### 3.4 Deuda que va a doler si se deja

- **Rotar todos los tokens que pasaron por el chat.** El **de portafolio va primero**: escribe
  en nombre de 28 Páginas. Después el PAT de Supabase, Resend, Netlify, la clave secreta y la
  contraseña.
- **Los documentos de fase mienten.** `04` dice «plan, sin código escrito» y hay envíos reales;
  el README dice «ninguna fase ejecutada». En todo `docs/fases/` hay **dos** marcas de «hecho».
  Una auditoría automática contra los documentos devuelve un inventario inservible justo por
  esto. Cuesta una tarde reconciliarlos y evita que dentro de un mes nadie sepa qué falta.
- **`private.avisar_bandeja` abre una subtransacción por mensaje.** El `exception when others`
  que protege la ingesta de un fallo de Realtime es, en PL/pgSQL, una subtransacción. El lote
  está topado en 64 justamente por el caché de subtransacciones de Postgres, que también es 64
  y que al desbordarse degrada el clúster entero. Sin medir. Se notará como lentitud general,
  que es lo más difícil de atribuir a su causa.

### 3.5 Inciertos de Meta que siguen abiertos

Sin resolver por lectura: son contradicciones entre páginas oficiales o cosas que Meta no
publica.

- ~~Si `RESPONSE` / `UPDATE` / `MESSAGE_TAG` son los literales correctos~~ — **cerrado el 3 de
  agosto** para dos de los tres: se envió con `messaging_type=RESPONSE` y con
  `messaging_type=MESSAGE_TAG` + `tag=HUMAN_AGENT`, y Meta devolvió `message_id` en ambos.
  `UPDATE` sigue sin probar.
- ~~La forma exacta del cuerpo con `HUMAN_AGENT` en Instagram~~ — **cerrado el 3 de agosto**:
  `POST /me/messages` con el Page Access Token y cuerpo `application/x-www-form-urlencoded`
  con `recipient`, `message`, `messaging_type=MESSAGE_TAG` y `tag=HUMAN_AGENT`. Y el negativo,
  que vale igual: `POST /{ig-user-id}/messages` devuelve error #3 *"Application does not have
  the capability to make this API call"*. Solo `/me/messages`.
- TTL real de las URLs de `lookaside.fbsbx.com`
- 100/s o 300/s en el Send API de Instagram
- Suelo de la fórmula `4800 × impresiones` para cuentas nuevas
- Disponibilidad regional en VE, RD y MX de Human Agent, private replies y Conversation Routing
- **C1, C2, C4, C5, C7 y C8** de `docs/fases/05` §10: todas exigen un portafolio de prueba
  ajeno a Boosty y completar el diálogo de Facebook Login. **C3 y C6 se cerraron** el 2 de
  agosto con medición.

### 3.6 Decisiones sin fecha límite

Retención de `webhook_events` · presupuesto de latencia p95 del normalizador · nivel de PITR
del proyecto de producción · retención tras la baja de un cliente.

~~Quién paga a Meta el consumo de WhatsApp~~ — **decidido: cada cliente con su propio método de
pago.**

### 3.7 El panel de Meta, mirado pantalla por pantalla el 4 de agosto de 2026

Estado real del App Dashboard de la app `kavea` (`1623464799201071`), portafolio
`2167414613399354`. Esto es lo que hay que abrir para retomar.

| Fila del Dashboard | Estado |
|---|---|
| Use case *Connect with customers through WhatsApp* | ✅ verde |
| Use case *Manage messaging & content on Instagram* | ✅ verde |
| Use case *Engage with customers on Messenger* | ✅ verde |
| **Facebook Login for Business** | ⛔ **cero configuraciones creadas** |
| *Review and complete testing requirements* | ✅ verde |
| **Business and access verification** | ✅ **Tech Provider verificado** |
| **App Review** | ⛔ `submissions: []`, nunca enviado |
| **Publish** | ⛔ `app_status: dev_mode`, `is_live: false` |

**Facebook Login for Business es el bloqueo más caro y el menos visible.** La página de
*Configurations* está **vacía**: cero `config_id`. Y en *Settings*, `Use Strict Mode for
redirect URIs` está en **Yes** con la lista de **Valid OAuth Redirect URIs vacía**, así que
Meta rechaza cualquier callback. Los toggles de OAuth están bien puestos —`Client OAuth`,
`Web OAuth` y `Enforce HTTPS` en Yes, JS SDK y devices en No—, y eso es lo que hace que
*parezca* configurado. La API lo confirma: `oauth_redirect_uris: null`.

Decisión pendiente que no está en ningún documento: **qué host lleva el callback**. Con
Strict Mode la coincidencia es exacta, así que no puede variar por tenant —`boosty.kavea.ai`
obligaría a una entrada por cliente y Netlify recomienda no pasar de 50 alias—. El `state`
firmado ya lleva `organization_id`, así que un host fijo basta. Con la salvedad de que el
enlace de conexión es *sin sesión de Kavea* y `admin.kavea.ai` devuelve 404 a los no staff:
esa ruta tendría que quedar exenta.

**Lo que falta del App Review, permiso a permiso:** `data_use_checkup` en **13 de 13**,
`screencast` en 12, `use_case` en 12, `api_precheck` en 9, y `test_page` en `pages_messaging`.
Sigue dentro `pages_utility_messaging` con 0 llamadas y fuera de v1.

**Las alertas del panel eran las dos de la Access Verification** —enviada y verificada—, nada
más. `compliance` da `compliant`, cero violaciones, cero acciones requeridas. `v26.0` es la
última versión de plataforma y no hay deprecaciones.

**Y tres límites con fecha que no estaban escritos:** Embedded Signup v2 **se deprecia el 15
de octubre de 2026** y hay que ir a v4; el onboarding está topado en **10 clientes nuevos por
cada 7 días** y sube a 200 al completar Business Verification, App Review y Access
Verification; y sin ser Solution Partner **el cliente debe añadir método de pago antes de
poder enviar**, que coincide con la decisión ya tomada.

### 3.8 Por dónde empezar la próxima sesión

**Lo que no depende de nadie y desbloquea un vídeo:**

1. **La pantalla de comentarios.** El modelo (0066) y la ingesta (0067) están en producción;
   falta la interfaz para leer y responder. Sin ella no hay screencast de
   `instagram_manage_comments`, y ese permiso ya está en la solicitud con 20 llamadas.
2. **Confirmar la forma real del payload de comentario.** Lo implementado viene de la
   documentación de Meta, no de una medición: la sonda solo ha capturado el Test del panel,
   que es un `feed` con `item: "status"`. Hay que comparar en cuanto entre uno real.
3. **Cablear las plantillas de WhatsApp.** El modelo ya cubre el ciclo completo; falta
   enviarlas con `POST /{WABA_ID}/message_templates`, consumir
   `message_template_status_update` —ya suscrito—, un CHECK en `categoria`, e **importar las
   25 aprobadas** que Kavea no sabe que existen.
4. **Guarda de tipos en CI para las Edge Functions.** Nadie las typechequea, y habría cazado
   dos de las tres regresiones del 4 de agosto.

**Lo que necesita una acción de Gabriel:**

| Acción | Por qué no puede esperar |
|---|---|
| Screencast de **Human Agent** | La ventana cierra el **11 de agosto** y es el único que no se puede grabar cuando uno quiera |
| **Data Use Checkup** | Bloquea los trece permisos y no depende de nadie más |
| Crear las dos configuraciones de Facebook Login y rellenar los redirect URIs | Bloquea toda la fase 5 y el alta de clientes |
| Los dos vídeos de WhatsApp | Requieren su sesión de Facebook. Meta acepta el cURL de *API Setup* y WhatsApp Manager como alternativa oficial |
| **Rotar** contraseña, token de portafolio y PAT de Supabase | Pasaron por el chat del 4 de agosto |

**Y una cosa que hay que tener presente mientras:** Kavea recibe el tráfico real de WhatsApp
de Boosty por la doble suscripción, con conversaciones de clientes que hoy atiende Kommo. Es
correcto y deliberado, pero **hay gente escribiendo a una bandeja que nadie mira desde
Kavea**. El corte de Kommo se hace cuando la ingesta lleve tiempo probada, no antes.

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
- **Una comprobación que no puede fallar no es una comprobación.** "El staff sin grant no ve
  contenido" estuvo semanas en verde sin que existiera un solo mensaje que ver. El día que la
  suite sembró datos reales, falló. Toda aserción negativa necesita que el caso positivo
  exista, o solo mide el vacío.
- **La interfaz se revisa mirándola.** Cuatro defectos —filtro ilegible en oscuro, lista a
  media pantalla en móvil, hilo abierto por el mensaje más viejo, burbujas descuadradas— y
  ninguno se ve leyendo el código ni lo detiene el compilador. Iniciar sesión y capturar
  cuesta un minuto.
- **Los valores por defecto de Postgres se comprueban, no se recuerdan.** Un comentario en una
  migración afirmaba que las vistas son `security_invoker` por defecto en Supabase. No lo son.
  El comentario sobrevivió a varias revisiones porque sonaba plausible.
- **Un filtro que no filtra y no falla es peor que uno que falla.** PostgREST acepta
  `contacts.nombre.ilike` dentro de `or=(...)`, no lo aplica y devuelve cero filas sin error.
  El buscador parecía funcionar y decía «no hay nada» con el resultado delante.
- **Lo que se repite por conversación deja de ser correcto en cuanto hay dos.** La actividad
  del asunto se escribía en bucle sobre todas las conversaciones de la tarjeta. Con un canal
  daba una fila y nadie lo notó; con dos, duplicados. Un bucle sobre hijos para registrar un
  hecho del padre es casi siempre un modelo mal puesto.
- **Un `create or replace view` no puede insertar columnas en medio.** Solo añade al final.
  Recrear la vista dentro de la misma transacción no deja hueco visible.
- **Añadir una columna `not null` rompe las semillas de las pruebas.** `conversations.tarjeta_id`
  tumbó la suite de aislamiento antes que la aplicación. Fue una buena señal: la suite es el
  primer sitio donde se nota un cambio de esquema.
- **Una semilla en una migración solo cubre lo que ya existe.** El embudo de partida de 0031
  alcanzó a las organizaciones del momento; las futuras nacían sin él y con las tarjetas sin
  etapa, en silencio. Toda semilla de datos de partida necesita además su trigger de creación,
  o es una bomba con fecha en el primer cliente nuevo.
- **Una suite de pruebas limpia al empezar, no solo al terminar.** La limpieza final no se
  ejecuta cuando la corrida aborta, y el estado que queda produce fallos inventados en la
  siguiente. Perseguir un fallo de aislamiento que no existe cuesta más que la prueba entera.
- **Un módulo con dependencias de servidor no puede exportar ayudantes de presentación.** Pasó
  dos veces: `terminoSeguro` en `lib/bandeja.ts` y `colorEtapa` en `lib/embudo.ts`. Basta con
  que un componente de cliente importe un valor —no un tipo— para arrastrar `next/headers` al
  bundle del navegador y romper el build.
- **Cada RPC que registra algo necesita su línea en `describir()`.** Van tres veces que el hilo
  escupe el identificador técnico —«tarjeta valor», «archivo subido»— porque se añadió el tipo
  de actividad en la base y no en la interfaz. Añadir el tipo son dos sitios, siempre.
- **Compilar, mirar, y solo entonces publicar.** Se hizo commit y push de un arreglo antes de
  leer la salida del build. Estaba roto y el despliegue quedó en error. La regla ya existía.
- **Un componente definido dentro del render se remonta en cada pasada.** Convertir la ficha en
  pestañas tentaba a sacar cada una a su propia función anidada; eso habría borrado lo que el
  operador estuviera escribiendo cada vez que llegara un mensaje.
- **El SQL se ejecuta antes de darlo por escrito.** Dos fallos seguidos en la misma migración:
  una función en `private` que PostgREST no puede llamar, y un `for update skip locked` junto a
  `distinct on`, que Postgres rechaza. Los dos se habrían visto con una ejecución.
- **Una variable de entorno nueva se comprueba contra las que ya hay.** El código pedía
  `KAVEA_SUPABASE_SECRET` y en Netlify la clave se llama `SUPABASE_SECRET_KEY`. Dos nombres para
  el mismo secreto significan que el día de la rotación se cambia uno y no el otro.
