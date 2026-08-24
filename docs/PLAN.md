# Kavea — Plan de ejecución

Lo pendiente, ordenado para hacerse. Complementa la bitácora: allí está **lo que pasó**, aquí
**lo que sigue**. Si un punto de aquí se ejecuta, se tacha aquí y se anota allí.

**Regla de orden:** primero lo que desbloquea a otras cosas, después lo que tiene fecha, después
lo que solo cuesta trabajo. Lo que depende de un tercero no ocupa sitio en las fases: vive al
final, en la lista de espera, porque no se puede planificar encima de ello.

Cada tarea lleva **cómo se sabe que está hecha**. Sin eso una tarea es una intención.

---

## Fase A — Cerrar el flujo de conexión

*El bloque B de la fase 5 completó su primer canje real el 24-ago, con la Página de Boosty. Lo que
queda es lo que separa «funciona una vez, conmigo» de «funciona siempre, con cualquiera».*

**A1. Primer canje real, con la Página de Boosty.** — ✅ **HECHO el 24-ago.**
`config_id 1721663745727123`, `tasks` con `MESSAGING`, PAT rotado, primer BISU de la base,
`subscription_ok: true` con los 9 campos, y V1–V7 en verde salvo V6.

**A2. Probar que el token nuevo sirve para lo que servía el viejo.** — 🟡 **Instagram sí,
Messenger pendiente.** El 24-ago salió un mensaje real por Instagram con el PAT del diálogo y
volvió el echo de Meta con su `mid`.
*Falta:* Messenger de extremo a extremo. Necesita un mensaje ENTRANTE de una persona a la Página
—no hay ninguna conversación en ventana— y eso no se puede hacer desde Kavea.

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

**B2. Declarar el modelo en el envío.**
Kavea es server-to-server con token de system user. Es el quinto punto de la propia lista de Meta
y explica por qué los vídeos no enseñaban el login. Con el flujo de la fase A ya en pie, además,
sí se puede enseñar.
*Hecho cuando:* el texto del envío lo dice antes de que el revisor lo pregunte.

**B3. Regrabar los ocho vídeos y volver a enviar.**
Con el botón **Request again**; no hay que rehacer el formulario.
*Hecho cuando:* los ocho permisos salen de «Rechazado».

**B4. Vigilar la bandeja de resultados.**
La respuesta del 7-ago estuvo dieciséis días sin leerse porque nada avisa.
*Hecho cuando:* existe una comprobación —cron o correo encaminado— que avisa de un cambio de
estado en el App Review.

---

## Fase C — Que un cliente ajeno se dé de alta solo

*Hoy el autoservicio llega hasta crear el espacio. Conectar canales todavía no lo ha hecho nadie
de fuera de Boosty.*

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

**C0. Decidir qué se le pide a un cliente para el autoservicio.** *(nuevo, 24-ago)*
El diálogo de Facebook Login for Business exige **Full access** sobre la Página. Las 26 Páginas de
clientes que Boosty tiene asignadas como socio están en *Partial access (business tools only)* —con
los siete interruptores puestos— y por eso NO salen en el selector. Subirlas es pedirle al cliente
el derecho a borrar su Página y a quitar acceso a cualquiera.
*Hecho cuando:* está decidido si el autoservicio pide Full access, si se ofrece la vía de system
user como alternativa asistida, o las dos según el tipo de cliente.

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

---

## En espera de terceros

No se planifica encima de esto. Se comprueba de vez en cuando.

- **Netlify** — habilitar el comodín `*.kavea.ai`. Todo lo nuestro está hecho: los seis
  requisitos cumplidos y el ticket #1097522 contestado el 24-ago. Cuando llegue, `/crear` deja de
  depender de una llamada por alta.
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
