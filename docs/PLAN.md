# Kavea — Plan de ejecución

Lo pendiente, ordenado para hacerse. Complementa la bitácora: allí está **lo que pasó**, aquí
**lo que sigue**. Si un punto de aquí se ejecuta, se tacha aquí y se anota allí.

**Regla de orden:** primero lo que desbloquea a otras cosas, después lo que tiene fecha, después
lo que solo cuesta trabajo. Lo que depende de un tercero no ocupa sitio en las fases: vive al
final, en la lista de espera, porque no se puede planificar encima de ello.

Cada tarea lleva **cómo se sabe que está hecha**. Sin eso una tarea es una intención.

---

## Fase A — Cerrar el flujo de conexión ✅ COMPLETA (24-ago)

*El bloque B de la fase 5 completó su primer canje real el 24-ago, con la Página de Boosty. Lo que
queda es lo que separa «funciona una vez, conmigo» de «funciona siempre, con cualquiera».*

**A1. Primer canje real, con la Página de Boosty.** — ✅ **HECHO el 24-ago.**
`config_id 1721663745727123`, `tasks` con `MESSAGING`, PAT rotado, primer BISU de la base,
`subscription_ok: true` con los 9 campos, y V1–V7 en verde salvo V6.

**A2. Probar que el token nuevo sirve para lo que servía el viejo.** — ✅ **HECHO el 24-ago.**
Instagram y Messenger, los dos con mensaje real desde la bandeja y echo de Meta de vuelta con su
`mid`. De paso queda probado Messenger de extremo a extremo con un contacto real, pendiente desde
el 6-ago.

**A3. Una autenticación, y elegir dentro de Kavea.** — ✅ **HECHO el 24-ago.**
El BISU pasó a la organización (0092), `meta-canje` solo autoriza, `meta-activos` descubre y
activa, y `/ajustes/canales/elegir` es la pantalla. Probado con la autorización real: lista las
dos Páginas con su estado y su Instagram.
*Queda:* activar Centromarca Mercedes es decisión de Gabriel — es de un cliente y sus DMs
empezarían a entrar en la bandeja de Boosty.

**A4. Botón «Reconectar» en Ajustes → Canales.** — ✅ **HECHO el 24-ago.**
Sale solo cuando `token_invalido_desde` no es nulo y la conexión es de Página. Verificado
simulando un token inválido en la conexión de Boosty y revirtiéndolo.

**A5. Vigilar los tokens.** — ✅ **HECHO el 24-ago.**
Los Page Access Tokens ya los vigilaban el despachador (error 190 al enviar) y el reconciliador
(cada 15 min). Lo que faltaba era el **BISU**, que no tenía a nadie: `verificar-autorizaciones`,
cron diario a las 04:41 contra `debug_token`, guarda validez, caducidad real, scopes y motivo. La
pantalla de canales avisa cuando muere.
*Queda por comprobar en vivo:* revocar la app desde una cuenta de prueba y ver que el aviso sale
en menos de 24 h. Necesita una cuenta que no sea la de Boosty.

**A6. El diagnóstico no puede quedarse viejo.** — ✅ **HECHO el 24-ago**, las dos mitades.
`meta-canje` rediagnostica al terminar (paso 8), y la pantalla avisa cuando el veredicto es
anterior al último cambio. La comparación NO es contra `updated_at`: el propio diagnóstico escribe
en la conexión, así que salía viejo siempre y por 45 ms. Un trigger (0091) pone `invalidado_en`
solo cuando cambia algo que describe el mundo —Página, permisos, suscripción, token— y no cuando
escribe el observador.

---

## Fase B — App Review

*Tiene fecha: las llamadas de prueba caducan el **5-sep-2026**. Si el envío sale después, hay que
repetirlas antes. Y el flujo de la fase A es lo que hace grabables el login de Meta y la pantalla
de consentimiento, que son los dos requisitos que incumplieron los ocho vídeos.*

**B1. Las tres pantallas que los vídeos tienen que enseñar y no existen.**
Editar y borrar un comentario propio · leer y pintar contenido de la Página (posts, fotos,
eventos) con la identidad de la Página visible · un perfil de Instagram con sus campos y su lista
de medios. Detalle verbatim en `docs/07` §1.
*Hecho cuando:* las tres se pueden recorrer con un contacto real, sin datos de mentira.
**24-ago:** hechas las dos de lectura —`/contenido` (Página: identidad, posts, fotos, eventos) y su
pestaña de Instagram (perfil + medios)—, verificadas contra Boosty.digital. **24-ago:** hecha tambien la de comentarios —publicar, editar, ocultar y borrar desde el hilo,
probado contra Instagram de verdad—. B1 cerrada.

**B2. Declarar el modelo en el envío. HECHO el 24-ago.**
Y el encuadre cambió: `docs/07` afirmaba que Kavea «no tiene» el login de Meta, y eso dejó de ser
verdad con la fase A. Son DOS caminos —autoservicio con Facebook Login for Business, donde el
login y el consentimiento sí se ven, y clientes del portafolio con token de system user, donde no—
y hay que declarar los dos. El texto del envío, en inglés y listo para pegar en *Request again*,
está en `docs/07` §1.
*Falta:* pegarlo el día del envío.

**B3. Regrabar los ocho vídeos y volver a enviar.**
Con el botón **Request again**; no hay que rehacer el formulario.
**24-ago:** `scripts/grabar-screencasts.mjs` reescrito. Tres guiones grababan la pantalla
equivocada —`instagram_manage_comments` apuntaba a `/comentarios`, que no existe desde el 21-ago—
y ahora apuntan a lo que la nota de cada permiso pide.
**24-ago, segunda parte:** desplegado y grabado. **Once vídeos** contra producción, con los envíos
y el ciclo de moderación comprobados en la base, más nueve PNG de hitos para auditar la tirada sin
verlos.
*Falta:* `human_agent` —necesita una tarjeta con canal de Instagram cuyo último entrante tenga
entre 24 h y 7 días; hoy todos son de hace menos de 24 h—, el diálogo de Meta, que pide
credenciales de Facebook en el navegador, y el cliente nativo.
*Hecho cuando:* los ocho permisos salen de «Rechazado».

**B4. Vigilar la bandeja de resultados. HECHO el 24-ago.**
`vigilar-revision` pregunta cada día a `GET /{app-id}/permissions` con token de app, compara con
lo último visto (0099) y manda correo si algo cambió. Un permiso que aparece es una aprobación;
uno que desaparece es una revocación, y esa avisa de que un canal se quedó sin poder enviar. La
primera pasada siembra y calla. Probado de punta a punta: cambio detectado, alerta 112 escrita y
correo entregado.

---

## Fase F — La puerta de entrada, y el reenvío de Human Agent

**Se ejecuta antes de C, D y E**; la letra solo es su nombre. Tiene fecha —hay una revisión
abierta— y desbloquea la fase C, porque el autoservicio que C quiere vender empieza justo por
donde esta fase construye.

*El segundo envío se resolvió el 4-sep: siete de los ocho permisos nuevos **aprobados** y los
cinco de renovación **renovados**. Solo cayó **Human Agent**, y no por el screencast: «Unable to
Locate Facebook Login», Platform Term 7.a, plataforma Web.*

**La causa está comprobada, no supuesta** (5-sep): no hay ningún botón de Facebook en ninguna
superficie de autenticación —la página de login de cualquier subdominio tiene campo `password` y
**cero** apariciones de «facebook» en el HTML de producción—; el Web platform URL que Meta tiene
declarado es `https://kavea.ai/`, que es el sitio de marketing, y `kavea.ai/entrar` solo pregunta
el nombre del espacio y no enlaza a crear cuenta; el único botón de Facebook Login for Business
vive tres clics dentro, en `/ajustes/canales`; y es **solo del propietario**
(`0040_equipo.sql:43`), mientras la cuenta del revisor tiene rol `agente`. O sea: el revisor no
podía llegar al diálogo **ni con instrucciones perfectas**. Las instrucciones que se mandaron,
además, declaran que Facebook Login existe y nunca dicen dónde está.

**Decidido el 5-sep:** se arregla con autenticación de verdad en la puerta —el proveedor
`facebook` de Supabase Auth—, **sin publicar la app**, y se reenvía solo Human Agent.

**F0. Encender el proveedor de Facebook en Supabase Auth.** — ✅ **HECHO el 5-sep.**
`external_facebook_enabled: true` con el App Secret, y comprobado contra el servicio real y no
solo contra la configuración: `/auth/v1/authorize?provider=facebook` devuelve 302 a
`facebook.com/dialog/oauth` con `client_id 1623464799201071`, `redirect_uri` de Supabase y
`scope=email`. Las Valid OAuth Redirect URIs quedaron con **dos** entradas —la de
`conectar.kavea.ai` intacta y la de Supabase añadida—, con Strict Mode en `Yes`. Y comprobado
además que la app acepta un `dialog/oauth` **sin** `config_id`: el diálogo de consumo existe, así
que la opción A es viable y no choca con Login for Business.
El `uri_allow_list` del proyecto ya cubría `https://*.kavea.ai/**`, así que el retorno a cualquier
espacio no hubo que tocarlo. El App Secret salió del panel de Meta, que es el único sitio donde se
lee en claro: no está en el entorno de Netlify —ahí solo vive `META_APP_ID`— y como secreto de Edge
Functions la API devuelve nombres pero no valores.
*Queda decidir, y no bloquea:* qué pasa cuando alguien que se registró con correo entra con el
Facebook del mismo correo. Supabase enlaza la identidad o da error según configuración, y el
primero que lo sufra será un cliente.

**F1. «Continuar con Facebook» en las tres superficies de entrada.** — 🟡 **ESCRITO el 5-sep, sin
probar en navegador.** `lib/supabase/cookies.ts` y `app/entrar-con-facebook.tsx` nuevos, y el botón
puesto en las tres. Typecheck y los dos builds en verde; el canje real necesita un navegador con
sesión de Facebook y no se ha hecho.
`app/app/entrar`, `app/app/registro` —ahí como botón primario— y `web/src/pages/entrar.astro`
como un `<a>` plano a `cuenta.kavea.ai/registro?con=facebook`, para que el sitio público siga sin
JavaScript, que es lo que defiende su propio comentario. Hoy `kavea.ai/entrar` no enlaza a crear
cuenta por ningún sitio: quien llega nuevo no encuentra la puerta.
*Hecho cuando:* el botón se ve en las tres y desde `kavea.ai` se llega a crear cuenta sin escribir
una URL a mano.

**F2. Enrutar al recién autenticado.** — 🟡 **ESCRITO el 5-sep, sin probar en navegador.**
`app/entrar/retorno/route.ts`: canjea el código y reparte. Route handler y no página porque
escribir cookies es lo que un componente de servidor no puede hacer, y con `opcionesDeCookie()`
para que la sesión quede en `.kavea.ai` y sobreviva el salto al subdominio del espacio.
Facebook devuelve el correo ya verificado, así que este camino se salta la ida y vuelta del correo
de confirmación —que es la única razón de que `/registro` y `/crear` sean dos pasos—. Sesión sin
organización va a `/crear`; sesión con organización, a su espacio.
*Hecho cuando:* una cuenta nueva por Facebook acaba en `/crear`, una que ya tiene espacio acaba en
su bandeja, y ninguna acaba en una pantalla muerta.

**F3. Que `/crear` redirija al espacio.** — 🟡 **ESCRITO el 5-sep, sin probar con un alta real.**
Redirige con `window.location.assign`, y de paso **se cayó la llamada a `/api/subdominio`**: era el
alias por inquilino que el comodín volvió innecesario, y era el único sitio del código que la
usaba. La pantalla final pasó de destino a pantalla de paso, con el enlace visible por si la
redirección se queda a medias.
La precaución de no redirigir (`crear/page.tsx:100-112`) quedó obsoleta: el comodín está vivo
—`cualquiercosa.kavea.ai` responde, verificado el 5-sep— y la cookie ya se fija en `.kavea.ai`, así
que la sesión sobrevive el salto de subdominio.
*Hecho cuando:* al crear el espacio se aterriza dentro, con sesión, sin copiar una dirección.

**F4. La bienvenida, como checklist atado al estado.** — 🟡 **ESCRITO el 5-sep, sin ver con un
espacio nuevo de verdad.** `app/bandeja/bienvenida.tsx` y `hayCanalVivo()` en `lib/conexiones.ts`.
Sale cuando el espacio no tiene **ninguna** tarjeta, ni abierta ni cerrada —no cuando la lista
filtrada está vacía, que en un espacio lleno también es cero—, y las dos consultas que necesita
solo se hacen en ese caso: la bandeja es la pantalla que más se recarga.
Hoy el estado vacío de la bandeja dice que las conversaciones «aparecerán en cuanto alguien escriba
por un canal conectado» (`bandeja/page.tsx:254`), que para un espacio con cero conexiones le manda
esperar cuando lo que tiene que hacer es conectar. Checklist, **no** splash que se descarta: el
flujo de conexión falla a medias a menudo —sin Página, permiso rechazado, token invalidado— y un
splash de una sola vez deja a la gente tirada en una bandeja vacía. Y el ramal del que no es
propietario: «pídele al propietario del espacio que conecte los canales», no un botón que da 403.
*Hecho cuando:* un espacio sin conexiones enseña el checklist con «Conectar canales» como acción
principal, y un `agente` ve el aviso en vez del botón.

**F5. Que conectar canales se encuentre.** — 🟡 **ESCRITO el 5-sep.** «Canales» ya es entrada de
primer nivel en el sidebar; el aviso del segundo diálogo quedó como texto junto al botón y no como
pantalla aparte, que es una ruta menos por el mismo efecto; y «Reconectar» ya solo lo ve quien
puede conectar —`puedeConectar` baja por prop a `Canales`, que se pinta fuera del guard—, y a los
demás se les dice a quién pedírselo en vez de esconderlo.
«Canales» al sidebar: hoy solo se llega por el sub-nav de Ajustes, dos niveles dentro, en un
producto cuyo valor entero es conectar canales. Una pantalla intermedia antes del segundo diálogo
de Facebook, porque el usuario lo pulsó hace treinta segundos y hay que decirle por qué lo pulsa
otra vez. Y cerrar el enlace «Reconectar», que está **fuera** del guard de rol
(`canales/panel.tsx:349-356`) y le ofrece a un `agente` un camino a un 403.
*Hecho cuando:* desde la bandeja se llega al diálogo de Meta en dos clics y ningún enlace visible
para un `agente` acaba en 403.

**F6. Un espacio de demostración con el revisor como propietario.**
Todo el rechazo es que el revisor no podía llegar al diálogo. `revisor@kavea.ai` se queda `agente`
en el espacio de Boosty —ahí están las conversaciones reales y ahí se prueba Human Agent— y una
segunda cuenta es propietaria de un espacio de demostración vacío, donde el journey de conexión se
puede recorrer sin poder romper nada: `SoltarCuenta` vive dentro del mismo guard que el botón de
conectar, así que dar `owner` en Boosty sería darle el botón de desconectar los canales vivos.
*Hecho cuando:* la cuenta de demostración completa el diálogo de Login for Business ella sola, y la
de Boosty sigue sin poder soltar nada.

**F7. Regrabar `human_agent.mp4` como una sola toma del journey entero.**
`kavea.ai` → Continuar con Facebook → nombre del espacio → bienvenida → Conectar mis canales →
diálogo de Login for Business → elegir Página e Instagram → bandeja → conversación pasada de la
ventana → respuesta con la etiqueta HUMAN_AGENT. La propia lista de remediación de Meta admite que
el screencast establezca dónde está el botón, y eso es lo que hace viable no publicar.
*Hecho cuando:* el vídeo enseña el botón, el diálogo y el envío con la etiqueta, sin cortes.

**F8. Reescribir las instrucciones del revisor.**
Dónde está el botón, en la primera línea. Las dos puertas y las dos cuentas, etiquetadas. Y bajar
a nota al pie el párrafo que explica que la vía asistida no tiene login de frontend: decírselo de
entrada a un revisor que está ejecutando una comprobación de «encuentra el botón» es enmarcarlo al
revés.
*Hecho cuando:* el cuadro nuevo nombra la URL, el texto exacto del botón y las dos cuentas.

**F9. Reenviar solo Human Agent.** Los otros doce ya están aprobados o renovados; no se tocan.
*Hecho cuando:* «Request again» enviado con el vídeo nuevo, y `kavea-vigilar-revision` vigilando el
cambio de estado.

**F10. Confirmar que Facebook devuelve el correo.**
`email` **no** aparece entre los doce permisos `live` de la app —`public_profile` sí, comprobado
con app access token el 5-sep— y el diálogo que abre Supabase pide `scope=email`. Con la app en
desarrollo y una cuenta con rol da igual; para un cliente real puede volver sin correo, y entonces
dos cosas se caen: el texto de `/registro` que promete «Meta ya lo da verificado» deja de ser
cierto, y `registrarse` se queda sin el dato. Si vuelve vacío hay dos salidas: pedir el correo en
`/crear`, o pedir `email` en el envío.
*Hecho cuando:* un canje real enseña si `user.email` viene lleno o vacío, y la pantalla dice la
verdad en los dos casos.

**Riesgo asumido el 5-sep.** Sin publicar la app, el diálogo de Facebook solo lo completa quien
tiene rol en la app: si el revisor prueba el botón con su propia cuenta verá «App not active». La
apuesta es que el botón visible, más el vídeo, más credenciales de propietario, cubren el 7.a. Si
vuelve rechazado por lo mismo, la siguiente palanca es publicar.

---

## Fase C — Que un cliente ajeno se dé de alta solo

*Hoy el autoservicio llega hasta crear el espacio. Conectar canales todavía no lo ha hecho nadie
de fuera de Boosty.*

**Decidido el 24-ago:** el autoservicio se vende a quien tiene **sus propias Páginas**, no Páginas
de socio como las 26 de clientes de Boosty. Eso cierra la duda de si había que pedirle a nadie
*Full access*: quien es dueño de su Página ya lo tiene. Las Páginas de socio se siguen conectando
por la vía asistida, con el token de system user.

**C1. Enlace de conexión firmado.**
Un solo uso, 72 h, sin sesión de Kavea: para que el dueño del portafolio del cliente pueda
autorizar sin ser usuario de Kavea.
*Hecho cuando:* alguien sin cuenta completa el diálogo desde el enlace y la conexión queda hecha.

**C2. Máquina de estados por (organización, canal).**
`sin_conectar → autorizado → suscrito → verificado`, con los caminos de vuelta. Hoy el estado es
un `text` con tres valores y la lógica está repartida.
*Hecho cuando:* la pantalla de canales pinta el estado desde la máquina, no desde columnas
sueltas.

**C3. Pantalla de expectativas de WhatsApp.**
Qué puede y qué no puede hacer, antes de conectar: ventana de 24 h, plantillas, calidad del
número. Evita el soporte que genera cada sorpresa.
*Hecho cuando:* aparece en el flujo de conexión de WhatsApp, antes del diálogo.

**C4. El alta completa con un portafolio ajeno a Boosty.**
Es lo que exigen C1, C2, C4, C5, C7 y C8 de `docs/fases/05` §10, y no se puede simular desde
dentro.
*Hecho cuando:* un negocio que no es Boosty tiene su espacio, su subdominio y su canal recibiendo
mensajes.

---

## Fase D — Cobro

*Sin esto Kavea es una herramienta, no un producto. Es lo único de la lista que no tiene ni una
línea escrita, y no depende de Meta ni de nadie.*

**D1. Decidir tarifas y márgenes.** Decisión de Gabriel, no de código. Bloquea todo lo demás de
esta fase.
**D2. Pasarela y ciclo de suscripción.** Alta, cobro recurrente, fallo de pago, baja.
**D3. Límites por plan**, atados a lo que ya se mide en el panel de uso.
**D4. Qué pasa al dejar de pagar.** Hoy no está decidido: ni el periodo de gracia, ni si se
apagan los canales, ni la retención de datos tras la baja.

---

## Fase E — Operación y deuda

*Nada de esto bloquea a un cliente hoy. Todo va a doler si se deja.*

**E1. Rotar los tokens que pasaron por chat.** El de portafolio primero: escribe en nombre de 39
Páginas de clientes. Después el PAT de Supabase, Resend, Netlify, la clave secreta y la contraseña
de la app.
**E2. Plantillas de correo de Supabase en español.** Hoy dicen «Confirm your email address» en un
producto en español.
**E3. Rehacer las plantillas de WhatsApp** en la WABA `2459716937850832`. Las 25 aprobadas viven
en la que se retiró.
**E4. Guarda de tipos de Deno en CI.** Hoy ninguna función de borde se typechequea en ningún job;
se comprueba a mano y por costumbre.
**E5. Volver el repositorio a privado** cuando la facturación de Actions esté resuelta.
**E6. Kill-switches** (global / tenant / canal) y `GET /api/estado` con banner en menos de 30 s.
**E7. Marcar caducados** los mensajes que perdieron la ventana de 24 h, en vez de tirarlos en
silencio.
**E8. Circuit breaker** de límites a `call_count > 80`: hoy se reacciona, no se previene.
**E9. Reconciliar `docs/fases/`** contra lo ejecutado. Varios documentos dicen «sin código» sobre
cosas que están en producción, y ya provocó una vez dar por bloqueado algo que no lo estaba.
**E10. Un solo dominio para la cookie de sesión.** Solo el cliente de navegador fija
`domain: .kavea.ai`; `supabase/servidor.ts` y `middleware.ts` crean el suyo sin opciones, así que
un refresco hecho en el servidor escribe cookie **de host**. Una cookie de host con el mismo nombre
que una de dominio no la reemplaza: convive con ella, el navegador manda las dos y cuál gana
depende del orden. El síntoma sería una sesión que se pierde a veces y sin dejar rastro en los
registros —justo lo que avisa el comentario final del middleware—. `lib/supabase/cookies.ts`, que
nació con F1, ya es el sitio donde ponerlo; falta que lo usen los otros dos. No se hizo en la misma
pasada que F porque toca la autenticación de todo el producto y el reenvío del App Review no lo
necesita: la ruta de retorno sí fija el dominio, así que entrar con Facebook se comporta igual que
entrar con contraseña.

---

## En espera de terceros

No se planifica encima de esto. Se comprueba de vez en cuando.

- ~~**Netlify** — habilitar el comodín `*.kavea.ai`.~~ ✅ **Llegó el 24-ago**, ticket #1097522
  cerrado. Verificado otra vez el 5-sep: `cualquiercosa.kavea.ai` responde y redirige a `/entrar`.
  `/crear` ya no depende de una llamada por alta, y es lo que hace posible F3.
- **Meta** — Tech Provider onboarding. La página revienta con error 1007 desde su servidor. Es lo
  único que bloquea Embedded Signup de WhatsApp, y con él la segunda configuración de Facebook
  Login for Business.
- **GitHub** — facturación de Actions. Mientras, el repositorio público suple los minutos.
- **Meta** — el nombre a mostrar de `+1 321-393-1397`, en `PENDING_REVIEW`. No bloquea enviar; es
  lo que ve el contacto.

## Decisiones abiertas, sin fecha

Si un cliente puede cambiar su subdominio · suscribir la WABA de Platinium Insurance, que ya está
compartida y sin ninguna app escuchándola · impersonación con registro para soporte · carril de
acuse automático sub-30 s · retención de `webhook_events` · nivel de PITR en producción ·
retención tras la baja de un cliente.
