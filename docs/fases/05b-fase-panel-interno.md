# Fase 5b — Panel interno

**Fecha:** 2 de agosto de 2026
**Posición:** después de la 5. Adelanta trabajo que estaba dentro de la 7.

---

## 1. Qué se pide

Que Boosty pueda operar Kavea sin abrir el editor de Supabase.

Concretamente, y en palabras del encargo: ver todas las cuentas del portafolio de
Meta y decidir a cuál se le crea su espacio de cliente; ver todos los espacios ya
creados; y tener un análisis de salud de las conexiones de cada espacio.

## 2. Por qué sale de la fase 7

La 7 es multi-tenant y está bloqueada por App Review: sin Tech Provider aprobado
no entra un cliente que no esté asignado al Business Manager de Boosty. Pero el
panel interno **no depende de App Review**. Los 28 activos ya asignados se pueden
listar y conectar hoy, y la salud de lo que ya existe se puede mirar hoy.

Dejar el panel dentro de la 7 significaba no tenerlo durante todo el mes de
dogfooding, que es justo el mes en el que más falta hace: es cuando se rompen
cosas que nadie ha visto romperse todavía.

Se mueven aquí los entregables 1 y 8 de la 7. Lo demás de la 7 se queda donde
está.

## 3. La decisión que ordena esta fase

**EL PANEL RESPONDE PREGUNTAS, NO ENSEÑA TABLAS.**

Un panel interno se degrada siempre igual: alguien añade una tabla por cada
entidad del esquema, y a los tres meses hay catorce pantallas que nadie mira
porque ninguna contesta nada. La prueba de si una pantalla merece existir es si
hay una pregunta concreta que hoy se responde entrando a la base.

Las preguntas que Boosty se hace de verdad:

| Pregunta | Hoy se responde | Pantalla |
|---|---|---|
| ¿Qué cliente está roto ahora mismo? | Mirando la bandeja de cada uno | Salud |
| ¿Por qué este cliente no recibe mensajes? | SQL sobre `webhook_events` | Salud → conexión |
| ¿Se están enviando las respuestas? | SQL sobre `outbound_messages` | Salud |
| ¿A qué Página le creo espacio? | Business Manager de Meta, en otra pestaña | Portafolio |
| ¿Quién ha mirado datos de un cliente? | SQL sobre los grants | Accesos |
| ¿Este cliente usa Kavea o se va a ir? | No se responde | Uso |

Y la contraria, igual de importante: **qué NO va en el panel.**

- **Leer conversaciones.** Para eso está el break-glass, con motivo escrito y
  caducidad. Un atajo desde el panel lo vacía de sentido: la protección no es la
  política de la base, es la fricción deliberada.
- **Editar la configuración de un cliente.** Si Boosty puede cambiarle un embudo
  sin dejar rastro en SU registro, el registro del cliente miente. Todo lo que
  Boosty haga dentro de un tenant pasa por break-glass o no pasa.
- **Interruptores por cliente sin caducidad.** Un flag temporal que nadie retira
  es deuda permanente. Si hace falta, lleva fecha de fin.

## 4. Lo que entra

### 4.1 Salud, en una sola pantalla

No una por espacio: **una para todos**, ordenada por lo que está peor. Con veinte
clientes, veinte pantallas de salud es cero pantallas de salud.

Cuatro señales, todas ya recogidas y ninguna leída por nadie hoy:

- **Conexiones**: las siete comprobaciones de la 5 (`verificaciones`), agregadas.
  Rojo bloqueante, aviso, y el caso que más duele: **V7 sin probar** — un canal
  que dice «conectado» y del que no ha entrado un solo mensaje.
- **Cola de salida**: `outbound_messages` en `bloqueado` o `fallido`, con su
  código. Un 190 o un límite paran las respuestas de un cliente en silencio.
- **Ingesta**: `webhook_events` atascados en `en_proceso` y el retraso entre lo
  que Meta selló y lo que procesamos. Ya hubo filas atascadas para siempre.
- **Límites**: `rate_limit_usage` por partición, con
  `estimated_time_to_regain_access`. Es lo único que predice una caída antes de
  que ocurra, y hoy no lo mira nadie.

### 4.2 Portafolio

Las cuentas del portafolio de Meta, con lo que hace falta para decidir: nombre,
si tiene Instagram profesional vinculado, si ya tiene espacio en Kavea y cuál.

De ahí sale la acción: **crear el espacio de cliente**. Nombre, subdominio,
huso, y la invitación al primer usuario. Sembrado con embudo por defecto, como
cualquier organización nueva.

**Esto necesita un token de portafolio**, que hoy no existe en ninguna parte:
`private.meta_credentials` guarda el token de la Página de Boosty y nada más, y
el proyecto **no tiene función de cifrado** — `cripto.ts` solo descifra. Ver §6.

### 4.3 Espacios

La lista de organizaciones con lo que las distingue de verdad: canales
conectados, personas en el equipo, conversaciones abiertas, último mensaje. No
`created_at` y poco más, que es lo que hay hoy.

### 4.4 Accesos

Los grants de break-glass: activos, con quién, sobre qué y con qué motivo, y el
histórico. Con botón de revocar. Una auditoría que nadie puede leer no audita.

### 4.5 Uso

Mensajes entrantes y salientes por mes y por cliente, conversaciones abiertas,
personas activas. No es vanidad: es lo que dice qué cliente está a punto de irse
—el uso cae semanas antes de que lo diga— y qué cliente va a chocar con un
límite.

## 5. Lo que no entra

- **Facturación.** Se mide el uso; cobrar es otra cosa y necesita decisiones de
  negocio que no están tomadas.
- **Alta self-service.** La conduce Boosty, por la regla de dogfooding.
- **Impersonación.** Entrar como un usuario del cliente para ver lo que ve. Es
  útil y es peligroso, y merece su propia discusión con su propio registro.

## 6. El riesgo que trae esta fase

**El token de portafolio es el secreto más valioso del sistema.** Deriva Page
Access Tokens de las 28 Páginas: quien lo tenga puede escribir en nombre de
cualquiera de ellas.

Reglas, todas obligatorias:

- Cifrado con el mismo esquema de `kid` que el resto, y **nunca** en una columna
  legible ni en el navegador. El formulario que lo captura lo manda al servidor y
  el servidor lo cifra; el cliente no lo vuelve a ver.
- Cada uso queda registrado: qué se listó, quién lo pidió y cuándo.
- El panel enseña los últimos cuatro caracteres y la fecha de alta, nunca el
  token.
- Añadir el cifrado al proyecto es, por sí solo, ampliar la superficie: hasta hoy
  Kavea solo podía **descifrar**, y eso significaba que un compromiso de la
  aplicación no permitía fabricar credenciales nuevas. Se pierde esa propiedad a
  cambio de poder dar de alta clientes sin SQL. Es un intercambio consciente.

## 7. Tareas

| # | Tarea | Terminada cuando |
|---|---|---|
| A1 | Vistas de salud para staff | El staff ve el agregado de las cuatro señales sin ver contenido |
| A2 | Pantalla de salud, ordenada por lo peor | Un canal con V7 sin probar sale arriba y dice qué hacer |
| A3 | Espacios con datos útiles | La lista dice canales, equipo, conversaciones abiertas y último mensaje |
| A4 | Accesos de break-glass, con revocar | Un grant activo se ve y se puede cortar desde el panel |
| A5 | Uso por cliente y mes | Entrantes, salientes y abiertas por organización |
| B1 | `cifrar` y el almacén del token de portafolio | Se guarda un token y no se puede volver a leer desde el cliente |
| B2 | Listado del portafolio | Las Páginas del portafolio salen con su Instagram y su espacio |
| B3 | Alta de espacio desde el panel | Organización creada, sembrada e invitación enviada, sin tocar la base |
| B4 | Conectar una Página a un espacio | El canal queda conectado, suscrito y diagnosticado |

A1–A5 no dependen de nada. B1–B4 dependen del token de portafolio.

## 8. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| El panel se convierte en catorce tablas | Nadie lo mira y la información deja de servir | Cada pantalla contesta una pregunta escrita en §3 |
| El staff acaba leyendo conversaciones desde aquí | Vacía el break-glass de sentido | Sin ninguna ruta a contenido; el break-glass sigue siendo el único camino |
| El token de portafolio se filtra | 28 Páginas escribibles por un tercero | §6, y rotación documentada |
| La salud se mira solo cuando algo falla | Un panel de salud que nadie abre no avisa | La señal grave sale por el mismo canal de alertas que ya existe |

## 8b. Añadido el 2 de agosto: la puerta de entrada

**Decisión: no hay cuenta gratuita todavía.** Un registro público no puede conectar
un canal —App Review sin enviar, y sin Tech Provider solo conectan las Páginas
asignadas al Business Manager de Boosty—. Una cuenta free hoy sería una bandeja
vacía con un botón de «conectar Instagram» que no funciona, y eso no se lee como
«todavía no»: se lee como «esto está roto».

En su lugar, `kavea.ai/demo` pide una demo, y lo dice en la misma página. La
cuenta gratuita se monta cuando llegue Tech Provider; entonces vuelve la
discusión de qué limita el plan.

Es la primera superficie de Kavea que **acepta escritura sin sesión**, y las
consecuencias se asumen contadas:

| | |
|---|---|
| Escribir | Sí, por un único RPC con permiso para `anon`, con validación y tope |
| Leer | **Nunca.** Cero políticas en la tabla: una lista de solicitudes es una lista de negocios con sus correos |
| Cambiar | Solo el staff, por RPC |

Tres frenos. El primero importa más de lo que parece: **la trampa para bots
devuelve éxito, no error.** Decirle a un bot que ha fallado es enseñarle a
arreglarlo. Los otros dos son un envío por correo cada diez minutos —pulsar dos
veces no puede crear dos negocios donde hay uno— y un tope global por hora, que
sin IP a mano dentro de la base es lo que evita que una tarde de bots deje la
tabla inservible.

**Lo que costó:** dos bloqueos de la CSP encadenados y los dos silenciosos. El
script inline lo descartaba el navegador, y `connect-src` sin declarar heredaba
`default-src 'self'` y habría matado el fetch igual. Se arreglan los dos sin
tocar `unsafe-inline`: el script se va a `public/demo.js` y `connect-src` nombra
exactamente el proyecto de Supabase.

## 9. Preguntas abiertas

| # | Qué | Por qué no se decide aquí |
|---|---|---|
| 1 | ¿Impersonación con registro? | Es la herramienta de soporte que de verdad hace falta y la que más puede doler. Merece su propia fase |
| 2 | ¿Umbral de «cliente en riesgo» por caída de uso? | Hace falta un histórico que todavía no existe |
| 3 | ¿El panel avisa por correo o solo por pantalla? | Depende de si Boosty va a tener a alguien mirándolo a diario |
