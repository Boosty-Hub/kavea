# Fase 3 — Orchestra, la bandeja unificada

**Fecha:** 2 de agosto de 2026
**Estado:** plan cerrado, sin código escrito
**Depende de:** `02-conexion-instagram-facebook.md`, `03-invariantes-meta.md`, `01-identidad-de-marca.md`, `00-documento-base.md`

> **Fuente del modelo de datos.** El esquema, los nombres de tabla y la estrategia de tiempo
> real de este documento salen de `02-conexion-instagram-facebook.md` §5.2, §7, §8.2 y §10.4,
> que es el documento verificado contra fuente oficial. Donde `06-arquitectura-plataforma.md`
> difiere —nombres de tabla, función de RLS, receptor de webhooks— manda el 02. Las
> divergencias detectadas quedan listadas en §16 para que el 06 se corrija.

> **Sobre la numeración.** Esta es la bandeja de solo lectura: el bloque 3 del orden de
> construcción. El envío es el bloque 4. En `00-documento-base.md` §9 iban juntos como
> "Fase 2". Conviene dejar una sola numeración viva.

---

## 1. Objetivo

Que un operador de Boosty pueda **leer y organizar** todas las conversaciones de Instagram
Direct y Facebook Messenger en una sola pantalla, en tiempo real, y sepa en todo momento si
podrá responder o no cuando llegue la fase 4. Al terminar esta fase, Kavea sustituye a Kommo
en lectura, triaje y asignación.

El criterio que ordena todas las decisiones de abajo: **una bandeja se mira ocho horas al
día**. Lo que cansa la vista, lo que parpadea, lo que obliga a recargar y lo que miente sobre
el estado del sistema es un defecto, no un detalle.

---

## 2. Alcance

### Qué entra

- Lista de conversaciones con filtros por canal, estado, asignación y etiqueta.
- Paginación por cursor sobre el índice de bandeja.
- Vista de hilo con historial, adjuntos, eventos y metadatos.
- Tiempo real con Supabase Realtime, con reconciliación tras reconectar.
- Los cuatro estados de conversación, con color semántico y etiqueta de texto.
- Indicador de ventana de servicio de 24 h por conversación.
- Asignación a un agente humano.
- Búsqueda por contacto, contenido y etiqueta.
- Estados vacíos, de carga y de error.
- Accesibilidad: contraste, teclado, lectores de pantalla.

### Qué no entra

- **Cualquier llamada al Send API de Meta.** Ninguna acción de esta bandeja produce un
  mensaje saliente. El compositor no existe todavía.
- Plantillas, respuestas rápidas, notas internas, adjuntos salientes.
- Agentes de IA y `agent_runs`.
- Módulo de configuración de canales: la conexión de Boosty se siembra a mano.
- Pipeline comercial y unificación de contactos entre canales.
- Importación de histórico, de ningún tipo. Ver §5.5.
- **WhatsApp.** El dominio `canal_meta` del documento 02 §7.1 solo admite `messenger` e
  `instagram`, y WhatsApp está sin investigar. La bandeja se construye genérica respecto al
  canal, pero en esta fase no hay datos de WhatsApp que mostrar. Ver §5.4 y §16.

### Qué significa "solo lectura", con precisión

Solo lectura se refiere **a Meta**: la bandeja no emite. Las escrituras locales sí entran,
porque sin ellas la bandeja no se puede usar una jornada y no se puede validar contra la
operación real:

| Escritura | Entra | Motivo |
|---|---|---|
| `conversations.estado` | Sí | Sin triaje no hay bandeja, hay un registro |
| `conversations.asignado_a` | Sí | Está en el alcance de la fase |
| `conversations.etiquetas` | Sí | La búsqueda por etiqueta necesita que existan etiquetas |
| `conversations.no_leidos` | Sí | Se pone a cero al abrir el hilo |
| `messages`, `message_events`, `media` | No | Solo escribe el normalizador, con rol de servicio |

Estas escrituras van por políticas con `WITH CHECK`, no por rol de servicio, tal como fija el
documento 02 §7.7: un `organization_id` falsificado en el cuerpo de la petición se rechaza en
la base de datos.

---

## 3. Precondiciones

**Bloques anteriores terminados:**

1. Esquema del documento 02 §7 aplicado, con RLS activo en todas las tablas y
   `public.es_miembro()` en su sitio. `boosty.kavea.ai` abre sesión y no ve datos de otra
   organización.
2. Receptor de webhooks devolviendo 200 en menos de 5 s con firma validada sobre cuerpo crudo.
3. Normalizador con idempotencia probada: el mismo evento entregado tres veces produce una
   sola fila. `meta_asset_routes` resolviendo `entry[].id` antes de tocar nada.

**Datos reales corriendo.** Al menos una `meta_connection` de Boosty sembrada a mano, con
mensajes entrando desde una cuenta real. Esta fase no se construye contra fixtures: la bandeja
se rompe con datos reales, no con datos limpios. En particular hacen falta, capturados de
producción: un adjunto, un `unsend`, un echo enviado desde el móvil del cliente y un evento
que llegue por `standby[]`.

**Realtime habilitado** en el proyecto `sdazqohyjzzylwbkvovx`, con política sobre
`realtime.messages` (§10.2).

**Tokens de marca.** Se copia `kavea-web/src/styles/global.css` tal cual al proyecto de la
app. Neutros, terracota, rejilla de 4 px y radios ya están y no se rediscuten. Lo único que se
añade son los tokens de estado de §5.3.

**Tipografía.** Instrument Sans variable ya empaquetada. Falta elegir y verificar licencia de
la monoespaciada (JetBrains Mono o IBM Plex Mono): en esta fase se usa para `mid`,
`scoped_id`, host del CDN y marcas de tiempo del panel de datos del hilo.

**Decisión de producto pendiente antes de escribir la migración:** los cuatro estados de §5.1,
que amplían el `CHECK` de tres valores del documento 02 §7.4.

---

## 4. Entregables

| # | Entregable | Forma |
|---|---|---|
| E1 | Migración de esquema de la bandeja | Un archivo SQL idempotente |
| E2 | Tokens de estado y componente de píldora | CSS + componente, con contraste medido |
| E3 | Ruta `/bandeja` con tres paneles | Next.js App Router |
| E4 | Ruta `/bandeja/[id]` con el hilo | Next.js App Router |
| E5 | Capa de consultas | `lib/bandeja/consultas.ts`, con `EXPLAIN` guardado |
| E6 | Emisión de eventos desde la base | Funciones y triggers SQL |
| E7 | Cliente de tiempo real con reconciliación | `lib/bandeja/realtime.ts` |
| E8 | Estados vacíos, de carga y de error | Componentes + textos revisados contra el libro de marca §6 |
| E9 | Banco de datos sintéticos y presupuestos | Script de siembra + pruebas de rendimiento |
| E10 | Auditoría de accesibilidad | Contraste medido y recorrido de teclado |
| E11 | Sonda de caducidad de URLs de `lookaside` | Cron interno que mide el TTL real. Ver §5.6 |
| E12 | Actualización del libro de marca | Cierra el pendiente "diseñar la píldora de estado con su micro-copy definitivo" |

---

## 5. Decisiones que fija esta fase

### 5.1 Cuatro estados, no tres

El documento 02 §7.4 define `status text check (status in ('open','pending','closed'))`. El
documento base §4 y el encargo de producto piden cuatro: `nueva`, `en_curso`, `esperando`,
`cerrada`. Se amplía, y la migración renombra la columna a `estado`.

| Estado | Quién lo pone | Qué significa para el operador |
|---|---|---|
| `nueva` | El normalizador, al crear la conversación | Nadie de Boosty la ha tocado |
| `en_curso` | Un humano, al tomarla o al asignársela | Hay alguien encima |
| `esperando` | Un humano, manualmente en esta fase | Se hizo lo que tocaba, falta que responda el contacto |
| `cerrada` | Un humano, manualmente | Terminada |

Transiciones automáticas del normalizador que entran en esta fase:

- Entrante sobre una conversación en `esperando` → pasa a `en_curso`.
- Entrante sobre `nueva` o `en_curso` → no cambia el estado; incrementa `no_leidos` y toca
  `last_incoming_at` y `last_message_at`.

**Un defecto del índice del documento 02 que hay que corregir en esta migración.** El índice
parcial es `where status = 'open'`:

```sql
create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where status = 'open';
```

Con tres estados ya era estrecho; con cuatro es un agujero. Si una conversación está en
`esperando` y llegan tres fotos en webhooks paralelos, el patrón "buscar o crear" no encuentra
protección en ese índice y crea una conversación duplicada al lado de la que ya existía. El
predicado correcto es el complemento de cerrada:

```sql
create unique index conversations_abierta_unica
  on public.conversations (organization_id, canal, contact_id)
  where estado <> 'cerrada';
```

**Cerrar es definitivo.** Ese mismo índice hace que una conversación cerrada no se pueda
reabrir: si el contacto vuelve a escribir, el normalizador crea **una conversación nueva**. Es
correcto y es la única forma de que el "buscar o crear" sea seguro bajo webhooks paralelos,
pero tiene una consecuencia de interfaz que se resuelve aquí y no en soporte: el panel de
contacto muestra **Conversaciones anteriores** del mismo contacto, y desde ahí se salta a los
hilos cerrados. Sin eso, el operador cierra una conversación, el contacto responde a los diez
minutos, aparece una fila nueva y parece que se perdió el hilo.

### 5.2 Contactos que no tienen nombre

`contacts` no tiene columna de teléfono (documento 02 §7.3): tiene `nombre`, `username`,
`profile_pic_url` y `perfil_consentido`. El error 230, consentimiento de perfil no otorgado,
**es normal y se ignora** en la ingesta, lo que significa que una parte de los contactos llega
sin nombre y sin foto.

La bandeja tiene que ser legible en ese caso. Orden de resolución del rótulo:

1. `contacts.nombre`
2. `@` + `contacts.username`
3. `Contacto de Instagram` o `Contacto de Messenger`, con los últimos seis dígitos del
   `scoped_id` en monoespaciada como desempate visual

Nunca un identificador crudo de 17 dígitos como título, y nunca la palabra "desconocido".

### 5.3 El color de cada estado, y el hueco del libro de marca

El libro de marca §3 define cuatro colores semánticos: **En curso**, **Esperando**,
**Escalada** y **Resuelta**. No encajan uno a uno con los cuatro estados: falta color para
`nueva` y sobra `escalada`, que no es un estado. Se resuelve así, y hay que aprobarlo (§16):

- **`nueva` es neutral.** Píldora de fondo Arena, borde Cal, texto Tinta. La regla 3 del libro
  prohíbe usar terracota como estado, y añadir un quinto matiz sube el ruido de color de una
  pantalla que se mira ocho horas. "Nueva" es la ausencia de tratamiento, y el neutral lo dice
  bien. Además es la píldora de mayor contraste de las cinco, que es lo que quieres en la fila
  que exige acción.
- **`escalada` no es un estado, es el color de la urgencia.** Queda reservado al indicador de
  ventana crítica y a los errores de canal. Coincide con la definición del propio libro:
  *"Requiere humano ya, o ventana por vencer"*.

**Dos tokens por estado, no uno.** El color sólido del libro sirve para el punto, el filete
lateral y el borde, pero **no todos cumplen 4.5:1 como texto**. Medido:

| Combinación | Ratio | Veredicto |
|---|---|---|
| `#2D6CA8` sobre `#E6EEF6` (en curso) | 4,69 | Pasa, con poco margen |
| `#B8862B` sobre `#F7EFDD` (esperando) | **2,83** | **No pasa** |
| `#A83232` sobre `#F6E4E4` (escalada) | 5,41 | Pasa |
| `#3F7A4E` sobre `#E7EFE8` (resuelta) | **4,36** | **No pasa** |
| `#B04E2C` sobre `#F0EDE6` (terracota sobre arena) | 4,52 | Pasa, al límite. Cierra el pendiente del libro §9 |

El ámbar de "esperando" es el peor caso y es la píldora que más se ve. Se separa el color en
dos roles: el **sólido** conserva el matiz de marca y hace de punto y filete; el **texto** usa
una versión oscurecida del mismo matiz, medida a 5:1 o más. Visualmente el ámbar sigue siendo
ámbar; lo que cambia es el peso del texto de 11 px.

```css
/* Añadir a global.css — modo claro */
:root {
  --k-nueva-bg:         var(--k-arena);   /* #F0EDE6 */
  --k-nueva-texto:      var(--k-tinta);   /* #1A1917 — 15,03:1 */
  --k-nueva-solido:     var(--k-piedra);  /* #6E6A63 */

  --k-curso-bg:         #E6EEF6;
  --k-curso-texto:      #2B67A0;   /* 5,05 sobre su fondo · 5,58 sobre papel */
  --k-curso-solido:     #2D6CA8;

  --k-esperando-bg:     #F7EFDD;
  --k-esperando-texto:  #835F1F;   /* 5,07 sobre su fondo · 5,47 sobre papel */
  --k-esperando-solido: #B8862B;

  --k-escalada-bg:      #F6E4E4;
  --k-escalada-texto:   #A63232;   /* 5,49 sobre su fondo · 6,34 sobre papel */
  --k-escalada-solido:  #A83232;

  --k-cerrada-bg:       #E7EFE8;
  --k-cerrada-texto:    #396F47;   /* 5,06 sobre su fondo · 5,59 sobre papel */
  --k-cerrada-solido:   #3F7A4E;
}
```

**Modo oscuro: el libro no lo cubre y los cuatro sólidos fallan.** Sobre la superficie oscura
`#1C1A18`, `#2D6CA8` da 3,16, `#A83232` da 2,62 y `#3F7A4E` da 3,39. Los tres por debajo del
mínimo. Variantes propuestas, todas medidas a 5:1 o más sobre superficie:

```css
[data-theme="dark"] {
  --k-nueva-bg:     #26231F;  --k-nueva-texto:     #EDEAE3;  /* 13,02 */
  --k-curso-bg:     #16202A;  --k-curso-texto:     #4A8ECE;  /* 5,00 sup · 4,75 píldora */
  --k-esperando-bg: #2A2316;  --k-esperando-texto: #BA872B;  /* 5,44 sup · 4,88 píldora */
  --k-escalada-bg:  #2A1616;  --k-escalada-texto:  #D36B6B;  /* 5,03 sup · 4,97 píldora */
  --k-cerrada-bg:   #162A1B;  --k-cerrada-texto:   #55A169;  /* 5,53 sup · 4,84 píldora */
}
```

**El texto de la píldora no es opcional en ningún tamaño.** Regla 4 del libro: nunca comunicar
solo con color. Micro-copy definitivo, versalitas de 11 px con tracking 0.06em:

`Nueva` · `En curso` · `Esperando` · `Cerrada`

### 5.4 La ventana de servicio es un eje distinto del estado

Fuente: documento 02 §8.2 y §8.3. Se calcula por conversación sobre `last_incoming_at`, jamás
con un flag global —esa es la implementación de Chatwoot y es la incorrecta—. Sea
Δ = `now()` − `last_incoming_at`:

| Situación | Δ | Etiqueta de texto | Color |
|---|---|---|---|
| Abierta | < 22 h | `Ventana 24 h · quedan 7 h 20 min` | Neutral (Piedra) |
| Por vencer | 22 h a 24 h | `Ventana 24 h · quedan 48 min` | Escalada |
| Solo respuesta humana | 24 h a 7 d | `Fuera de ventana · solo humano · quedan 5 d` | Esperando |
| Cerrada | > 7 d | `Fuera de ventana · no se puede responder` | Neutral (Ceniza) |
| Sin entrante | `last_incoming_at is null` | `Sin mensaje entrante · ventana cerrada` | Neutral (Ceniza) |

Seis reglas que se derivan de las fuentes:

1. **La ventana abierta va en neutral, no en verde.** El verde es "resuelta" en el libro de
   marca y reutilizarlo rompe la correspondencia un color / un significado. Si el 80 % de las
   filas llevan color, el color deja de informar.
2. **La ventana se reabre con cosas que no son mensajes.** El documento 02 §8.2 lista, además
   del mensaje: pulsar un call-to-action, interactuar con un anuncio Click-to-Messenger,
   iniciar por plugin, pulsar un enlace `m.me` o `ig.me` con `ref` hacia una conversación
   existente, y **reaccionar a un mensaje**. Las reacciones viven en `message_events`, no en
   `messages`. Consecuencia directa para la bandeja: **el reloj puede reiniciarse sin que
   aparezca un mensaje nuevo en el hilo**. Si la interfaz no lo explica, el operador ve
   "quedan 23 h" con el último mensaje de ayer y concluye que el indicador está roto. Por eso
   la conversación guarda `ventana_reabierta_por` y `ventana_reabierta_en`, y el hilo lo dice:
   *"Reabierta por una reacción a las 11:52"*.
3. **Regla de diseño del documento 02, literal: no mover el reloj por nada que Kavea no reciba
   como evento en `messaging[]`.** Comentar una publicación y publicar en la Página aparecen
   como disparadores en una página oficial y no en otra. Los comentarios entran en v1 desde el
   3 de agosto de 2026, así que el punto deja de ser discutible y hay que medirlo. La regla se
   mantiene intacta: un comentario llega en `changes[]`, no en `messaging[]`, así que por sí
   solo no reabre la ventana.
4. **El tramo de 24 h a 7 días depende de una feature que aún no está aprobada.** HUMAN_AGENT
   se somete a App Review por separado, con su propio screencast, y exige verificación de
   negocio. Mientras no esté concedida, la etiqueta se muestra como informativa y con matiz:
   *"Fuera de ventana · requiere Human Agent, pendiente de aprobación"*. Prometer en la
   interfaz una capacidad que Meta todavía no ha concedido es la forma más rápida de que el
   operador tome una decisión comercial equivocada.
5. **Nunca se guarda un booleano de ventana.** Es una función del tiempo. La consulta devuelve
   `last_incoming_at` crudo y el cliente calcula. Filtrar por estado de ventana sí se hace en
   SQL, con predicados sobre `last_incoming_at`.
6. **El reloj del navegador no es de fiar.** La respuesta del servidor incluye su `now()`; el
   cliente mide el desfase una vez y calcula la cuenta atrás contra el reloj corregido. Un
   portátil con la hora mal puesta no puede decirle a un operador que le quedan 26 horas.

Granularidad de refresco: **un minuto**, con un solo temporizador compartido para toda la
lista y solo sobre filas visibles. Una cuenta atrás por segundo en 40 filas son 40 renders por
segundo para no aportar nada.

**WhatsApp.** No está en el dominio `canal_meta` y su modelo de ventana y plantillas está sin
investigar. La bandeja se construye genérica respecto al canal y el componente de ventana
recibe el canal como parámetro, pero en esta fase no se pinta ninguna etiqueta de WhatsApp.
Cuando entre, el tramo de 24 h a 7 días **no aplica**: HUMAN_AGENT es de Messenger e Instagram.

### 5.5 El arranque en vacío no se esconde

Invariante: *"La Conversations API está topada a 2 llamadas por segundo por cuenta y solo
devuelve los 20 mensajes más recientes por conversación; consultar uno más antiguo devuelve un
error engañoso que dice que el mensaje fue borrado. El histórico completo no es recuperable."*

**Decisión: en esta fase no hay importación de histórico, de ningún tipo.** Ni siquiera de los
20 últimos mensajes. Motivos, en orden: la arquitectura es webhook-first sin excepción; 2
llamadas por segundo hacen que sembrar mil conversaciones tarde más de ocho minutos de reloj y
consuma la cuota que necesita la operación; y el error de "mensaje borrado" al pedir más de 20
contaminaría la bandeja con datos que parecen ciertos y no lo son. Si se decide sembrar, es
una tarea del onboarding, no de la bandeja (§16).

Lo que sí hace esta fase es **decirlo en la interfaz, en tres sitios**:

1. **Línea de corte en la cabecera de cada hilo.** Siempre presente, con dos textos:
   - Conversación anterior a la conexión del canal:
     *"Kavea registra esta conversación desde el 4 de agosto de 2026, 09:14. Si el contacto
     escribió antes, ese histórico está en la aplicación de Meta y su API no lo devuelve."*
   - Conversación nacida después:
     *"Inicio de la conversación · 4 de agosto de 2026, 09:14."*

   El criterio es `conversations.created_at` contra `channels.conectado_at` con margen de 24 h.
2. **Aviso en la bandeja durante los primeros 14 días** de cada canal conectado, descartable
   por usuario, no por organización.
3. **Estado vacío de la bandeja** (§11), que explica el motivo y ofrece probar el canal.

Y una nota que condiciona el producto: esto se gestiona **comercialmente**. La conversación
con el cliente es "desde el día que conectas, nada se pierde", no "migramos tu histórico".

### 5.6 Adjuntos: el punto donde la intuición lleva a un rechazo de App Review

Fuente: documento 02 §10.4 y §7.5.

**Kavea no descarga el media entrante. Persiste solo la URL del CDN.** La tabla `media` lo
impone con un `CHECK`: `origen = 'meta_cdn'` obliga a `cdn_url is not null and r2_key is null`.
Meta rechazó el App Review de `instagram_manage_messages` a usuarios de Chatwoot por
exactamente esto, con el motivo *"proper handling of media CDN URLs by not storing/caching the
media content"*.

Esto deja **una pregunta abierta que esta fase no puede resolver por decreto**, y que hay que
comprobar empíricamente antes de escribir el componente de adjunto:

> ¿Puede el navegador del operador renderizar directamente una URL de `lookaside.fbsbx.com` en
> un `<img>`? No está confirmado. Puede exigir token, puede tener protección de enlace
> caliente, puede fallar por CORS o por política de referente. Y la salida natural cuando
> falla —proxear el archivo por un dominio de Kavea— **es equivalente a cachear**, que es
> justo lo que Meta prohíbe y lo que costó los rechazos.

Plan, en este orden:

1. **Medir.** Con una `meta_connection` real, guardar la URL de un adjunto entrante y
   comprobar: si un `<img src>` desde el navegador la renderiza; si responde con y sin
   cabecera de referente; qué código devuelve sin autenticación.
2. **Medir el TTL.** Meta no documenta cuánto duran esas URLs. E11 es una sonda: guarda URLs
   reales y las consulta cada hora hasta que devuelvan 403 o 404, y registra el tiempo. Es la
   única forma de saber cuánto dura un adjunto en la bandeja, y es un dato que el cliente va a
   preguntar.
3. **Diseñar para el peor caso desde el primer día.** El componente de adjunto asume que el
   archivo puede no estar, y lo dice con texto: *"El archivo ya no está disponible en Meta.
   Kavea guarda el enlace, nunca el archivo."* Nunca una imagen rota, nunca un icono de error
   sin explicación.
4. **No implementar proxy** hasta que exista una respuesta por escrito de Meta Developer
   Support. La consulta se manda en esta fase, porque la respuesta tarda y bloquea la 4.
5. **Historias.** Una historia caduca a las 24 horas y su URL deja de renderizar. Para
   respuestas a historias y menciones, la interfaz muestra *"Historia expirada"* y no intenta
   recuperar nada. El flujo se diseña asumiendo que ese contexto no estará.

Un requisito que sale del trámite y afecta a esta interfaz: **el screencast del App Review
tiene que mostrar la URL de `lookaside` dentro de la bandeja**. Por eso el panel de datos del
hilo incluye el host del CDN y la hora en que se recibió la URL. No es adorno: es la prueba
que Meta pide de que no se está cacheando.

### 5.7 Densidad

Una sola densidad, la baja. Fila de conversación de 72 px, cuatro líneas, separación por
espacio en blanco y no por filetes. Sin conmutador de densidad: un conmutador es una forma de
no decidir, y duplica el trabajo de accesibilidad y de pruebas visuales. Libro de marca §5:
*"Cuando dudes, quita densidad."*

---

## 6. Maquetas

### 6.1 Bandeja

Tres paneles. Izquierda: vistas y filtros. Centro: lista. Derecha: hilo. El panel izquierdo
colapsa por debajo de 1100 px; por debajo de 700 px queda un panel a la vez.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  kavea      Bandeja      Contactos      Ajustes                             En vivo · GM · Boosty  │
├────────────────────┬────────────────────────────────────┬──────────────────────────────────────────┤
│                    │                                    │                                          │
│  VISTAS            │  Buscar contacto o texto      /    │ María González                           │
│                    │                                    │ INSTAGRAM · @mariagzz                    │
│  Sin asignar    12 │────────────────────────────────────│                                          │
│  Mías            4 │                                    │ ● Nueva      Sin asignar      Etiqueta   │
│  Abiertas       52 │▌ María González            11:52   │                                          │
│  Cerradas          │▌ INSTAGRAM   ● Nueva               │ Ventana 24 h · quedan 22 h 14 min        │
│                    │▌ Ventana 24 h · quedan 22 h        │ Reabierta por una reacción, 11:52        │
│  ESTADO            │▌ Buenas, quiero saber si tienen…   │                                          │
│                    │                                    │────────────────────────────────────────  │
│  Nueva          12 │                                    │                                          │
│  En curso       31 │  Carlos Pérez              10:58   │    Kavea registra desde el 4 de agosto   │
│  Esperando       9 │  MESSENGER   ● En curso            │    de 2026, 09:14. Lo anterior está en   │
│  Cerrada           │  Ventana 24 h · quedan 3 h         │    la aplicación de Meta: su API no lo   │
│                    │  Gracias, lo reviso y te digo      │    devuelve.                             │
│  CANAL             │                                    │                                          │
│                    │                                    │ lunes 4 de agosto                        │
│  Instagram      38 │  Contacto de Instagram     09:30   │                                          │
│  Messenger      14 │  INSTAGRAM   ● Esperando           │ María González · 11:40                   │
│                    │  Fuera de ventana · solo humano    │ ┌────────────────────────────────────┐   │
│  ETIQUETA          │  Adjunto: imagen                   │ │ Buenas, quiero saber si tienen     │   │
│                    │                                    │ │ disponible el modelo azul.         │   │
│  presupuesto     7 │                                    │ └────────────────────────────────────┘   │
│  soporte        11 │  Ana Ríos                     ayer │                                          │
│                    │  MESSENGER   ● Cerrada             │                     Boosty · 11:41       │
│                    │  Fuera de ventana                  │     ┌────────────────────────────────┐   │
│                    │  Perfecto, muchas gracias          │     │ Sí, nos queda uno. Te paso el  │   │
│                    │                                    │     │ precio por aquí.               │   │
│                    │                                    │     └────────────────────────────────┘   │
│                    │                                    │                                          │
│                    │                                    │ María González reaccionó con un          │
│                    │                                    │ corazón · 11:52                          │
│                    │                                    │                                          │
└────────────────────┴────────────────────────────────────┴──────────────────────────────────────────┘
```

Lo que la maqueta fija:

- **"Cerradas" y "Cerrada" no llevan número.** Contar la tabla entera es la consulta que tumba
  la lista cuando una organización acumula cientos de miles de conversaciones. Los contadores
  solo se calculan sobre el conjunto abierto, acotado por la realidad operativa. Ver §9.4.
- **La tercera fila es un contacto sin nombre**, que es un caso frecuente por el error 230.
  Rótulo resuelto según §5.2, nunca un identificador crudo.
- **El filete `▌` marca la selección**, acompañado de fondo Arena y `aria-current="page"`.
  Nunca solo el color.
- El canal en versalitas (`INSTAGRAM`), no con el icono de Meta. Meter marcas de Meta en la
  interfaz obliga a cumplir sus guías de uso y ensucia (libro de marca §7).
- La hora es relativa hasta ayer; a partir de ahí, fecha corta. Todas en `<time>`.
- Un solo elemento terracota por vista: el anillo de foco.

### 6.2 Hilo

```
┌──────────────────────────────────────────────────────────────┬──────────────────────────────────────┐
│                                                              │                                      │
│ < Bandeja                                                    │ CONTACTO                             │
│                                                              │                                      │
│ María González                                               │ María González                       │
│ INSTAGRAM · @mariagzz · conversación 3f8a…c1                 │ @mariagzz                            │
│                                                              │ Perfil no consentido                 │
│ ● Nueva  v        Sin asignar  v        Añadir etiqueta      │                                      │
│                                                              │ ETIQUETAS                            │
│ Ventana de 24 h abierta · quedan 22 h 14 min                 │                                      │
│ Reabierta por una reacción a las 11:52                       │ presupuesto   soporte                │
│                                                              │                                      │
│ ──────────────────────────────────────────────────────────── │ CONVERSACIONES ANTERIORES            │
│                                                              │                                      │
│      Kavea registra esta conversación desde el 4 de agosto   │ 12 jul · cerrada · Messenger         │
│      de 2026, 09:14. Lo anterior está en la aplicación de    │ 3 may  · cerrada · Instagram         │
│      Meta y su API no lo devuelve.                           │                                      │
│                                                              │ DATOS DEL HILO                       │
│  ── lunes 4 de agosto ──                                     │                                      │
│                                                              │ canal             instagram          │
│  María González · 11:40                                      │ scoped_id         17841400…          │
│  ┌──────────────────────────────────────────┐                │ dueño del hilo    Kavea              │
│  │ Buenas, quiero saber si tienen           │                │ primer mensaje    4 ago 09:14        │
│  │ disponible el modelo azul.               │                │ último entrante   4 ago 11:52        │
│  └──────────────────────────────────────────┘                │ reabierta por     reacción           │
│                                                              │                                      │
│                              Boosty · Gabriel M. · 11:41     │ ADJUNTOS                             │
│              ┌──────────────────────────────────────────┐    │                                      │
│              │ Sí, nos queda uno. Te paso el precio     │    │ lookaside.fbsbx.com                  │
│              │ por aquí.                                │    │ recibida 4 ago 11:42                 │
│              └──────────────────────────────────────────┘    │                                      │
│                                                              │ CANAL                                │
│  María González · 11:42                                      │                                      │
│  ┌──────────────────────────────────────────┐                │ Instagram conectado                  │
│  │ IMAGEN · lookaside.fbsbx.com             │                │ Último evento hace 12 s              │
│  │ El archivo ya no está disponible en      │                │                                      │
│  │ Meta. Kavea guarda el enlace, nunca      │                │                                      │
│  │ el archivo.                              │                │                                      │
│  └──────────────────────────────────────────┘                │                                      │
│                                                              │                                      │
│  María González · 11:44                                      │                                      │
│  ┌──────────────────────────────────────────┐                │                                      │
│  │ Mensaje eliminado por el contacto        │                │                                      │
│  └──────────────────────────────────────────┘                │                                      │
│                                                              │                                      │
│                     Enviado desde el móvil · 11:50           │                                      │
│              ┌──────────────────────────────────────────┐    │                                      │
│              │ Te llamo en 10 minutos.                  │    │                                      │
│              └──────────────────────────────────────────┘    │                                      │
│                                                              │                                      │
│  María González reaccionó con un corazón · 11:52             │                                      │
│  La ventana de 24 h se reabrió                               │                                      │
│                                                              │                                      │
│ ──────────────────────────────────────────────────────────── │                                      │
│  El compositor entra en la fase 4. Esta vista es de lectura. │                                      │
│                                                              │                                      │
└──────────────────────────────────────────────────────────────┴──────────────────────────────────────┘
```

La maqueta enseña a propósito los cinco casos que la implementación tiene que resolver desde
el primer día, porque los cinco salen de invariantes y todos aparecen la primera semana:

1. **Adjunto caducado** (`media.origen = 'meta_cdn'`, `cdn_url` que ya no sirve). El host y la
   hora de recepción quedan visibles en el panel: es lo que el screencast del App Review tiene
   que mostrar. Ver §5.6.
2. **Mensaje borrado por el contacto** (`messages.deleted_at`, unsend de Instagram). La fila se
   conserva con su hora y el texto sustituido. Si desaparece, el operador cree que se equivocó
   de conversación.
3. **Mensaje enviado por el cliente desde el móvil o desde Business Suite** (echo con `app_id`
   distinto del de Kavea). Se muestra como saliente pero con autoría distinta: *"Enviado desde
   el móvil"*. Sin esto, el operador cree que lo mandó Kavea.
4. **Reacción que reabre la ventana** (`message_events.tipo = 'reaction'`). Aparece en el hilo
   como un evento, no como una burbuja, y explica el salto del contador.
5. **Dueño del hilo** (`conversations.thread_owner_app_id`, `en_standby`). Si la conversación
   llegó por `standby[]`, la cabecera lo dice: *"El hilo lo tiene la bandeja de Meta. Kavea ve,
   pero no podrá responder."* En esta fase no se responde de todos modos, pero el dato explica
   el comportamiento de la fase 4 y evita un ticket de soporte por cada caso.

---

## 7. Tareas, con criterio de aceptación verificable

### T1 · Migración de esquema de la bandeja

Renombrar `status` a `estado` y ampliar el `CHECK` a los cuatro valores; corregir el predicado
del índice único parcial a `where estado <> 'cerrada'`; añadir `no_leidos`, `preview_texto`,
`preview_tipo`, `etiquetas`, `ventana_reabierta_por`, `ventana_reabierta_en`, la tabla `tags`,
`channels.conectado_at`, `contacts.nombre_norm` y `messages.texto_tsv`; crear los índices de
§9.8 y los triggers de emisión.

**Aceptación:** la migración corre dos veces seguidas sin error; `\d+ conversations` muestra
las columnas y los índices esperados; `select estado, count(*) from conversations group by 1`
solo devuelve los cuatro valores; una prueba concurrente que dispara tres inserciones
paralelas sobre una conversación en `esperando` produce cero duplicados.

### T2 · Tokens de estado, píldora e indicador de ventana

**Aceptación:** un script del repositorio recorre las combinaciones de §5.3 en claro y en
oscuro y falla si alguna baja de 4.5:1. Una prueba de instantánea falla si el nodo de texto de
la píldora está vacío.

### T3 · Layout de tres paneles y filtros en la URL

Todo el estado vive en `searchParams`:
`?estado=nueva,en_curso&canal=instagram&asignado=yo&etiqueta=presupuesto&q=`.

**Aceptación:** copiar la URL y abrirla en otra pestaña reproduce la vista exacta; el botón
atrás deshace un filtro; la primera página se renderiza en el servidor, comprobable
desactivando JavaScript.

### T4 · Consulta de lista con cursor y contadores

**Aceptación:** con el banco de T18, `EXPLAIN (ANALYZE, BUFFERS)` de la primera página y de la
página 200 muestran `Index Scan` sobre el índice esperado, sin `Sort` y sin `Seq Scan`, y la
página 200 no es peor que la primera en más de un 20 %. Ninguna consulta contiene `offset`.

### T5 · Filtros de canal, estado, asignación y etiqueta

**Aceptación:** las cuatro formas de §9.3 están escritas como consultas literales distintas,
no como una consulta genérica con `or` de guarda; una prueba por forma verifica el plan.

### T6 · Fila de conversación, con rótulo de contacto sin nombre

**Aceptación:** la fila se pinta solo con datos de la propia fila más el contacto. Una prueba
cuenta las consultas de una página de 40 filas: debe ser 2, nunca 41. Un contacto con
`nombre` y `username` nulos produce el rótulo de §5.2 y nunca un identificador crudo.

### T7 · Indicador de ventana de servicio

**Aceptación:** una prueba con reloj congelado recorre Δ = 1 h, 23 h 30 min, 25 h, 8 d y
`null` en los dos canales y comprueba la etiqueta exacta y el token de color. Una reacción
entrante mueve `last_incoming_at`, actualiza el indicador y deja constancia visible de qué lo
reabrió.

### T8 · Vista de hilo, eventos y paginación hacia atrás

Mezcla `messages` y `message_events` en una sola línea de tiempo ordenada por `meta_timestamp`.

**Aceptación:** un hilo de 5.000 mensajes abre en menos de 400 ms mostrando los 50 últimos;
subir carga bloques de 50 sin saltar la posición de lectura; un mensaje que llega con
`meta_timestamp` anterior al último se inserta en su sitio, no al final.

### T9 · Línea de corte del histórico y estado vacío de arranque

**Aceptación:** en una organización recién conectada, la bandeja vacía muestra el texto de §11
y no la palabra "error"; toda conversación anterior a `channels.conectado_at + 24 h` muestra la
línea de corte con la fecha correcta.

### T10 · Adjuntos, mensajes borrados, echoes y dueño del hilo

**Aceptación:** los cinco casos de §6.2 tienen prueba con payload real capturado del webhook, y
ninguno produce una imagen rota, una fila desaparecida ni una excepción. El panel muestra el
host del CDN y la hora de recepción de la URL.

### T11 · Sonda de caducidad de URLs de `lookaside`

**Aceptación:** la sonda lleva al menos 30 URLs reales bajo seguimiento y produce una cifra de
TTL observado. Todo fetch pasa por la allowlist de host (`lookaside.fbsbx.com`, `*.fbcdn.net`,
`scontent.*`), bloquea rangos privados y no sigue redirecciones fuera de la lista. Una prueba
con una URL a `127.0.0.1` y otra con una redirección a un host externo deben ser rechazadas.

### T12 · Emisión de eventos desde la base

**Aceptación:** un `insert` en `messages` produce exactamente un evento en el canal de la
conversación y uno en el de la organización; un fallo dentro del trigger de emisión **no**
aborta la escritura, comprobado revocando permisos sobre la función de envío, y queda registro
en la métrica.

### T13 · Cliente de tiempo real, canales y coalescencia

**Aceptación:** con 100 eventos por segundo durante 30 s, la lista no re-renderiza más de 4
veces por segundo y el navegador mantiene más de 50 fps.

### T14 · Reconciliación, reconexión e indicador de conexión

**Aceptación:** cortar la red 5 minutos con 200 mensajes entrando; al restaurarla, el recuento
del cliente coincide exactamente con `select count(*)` en la base, sin recargar. El indicador
pasa por "Reconectando" y vuelve a "En vivo" con texto, no solo con color.

### T15 · Asignación y cambio de estado

**Aceptación:** asignar desde una pestaña se ve en otra en menos de 2 s; asignar a un usuario
que no es miembro de la organización lo rechaza la política `WITH CHECK`, no la interfaz.

### T16 · Búsqueda por contacto, contenido y etiqueta

**Aceptación:** buscar "María" encuentra "Maria" y "MARÍA"; buscar "devolución" encuentra
"devoluciones"; sobre 2.000.000 de mensajes el p95 de la búsqueda de contenido en 180 días es
inferior a 300 ms; el plan usa el índice GIN.

### T17 · Estados vacíos, de carga y de error

**Aceptación:** los estados de §11 son alcanzables desde una pantalla de pruebas; una revisión
de textos comprueba que no aparecen "simplemente", "fácilmente", "potencia", "impulsa" ni
signos de exclamación.

### T18 · Banco de datos sintéticos y presupuestos

300.000 conversaciones (90 % cerradas), 2.000.000 de mensajes, 2 canales, 8 usuarios,
distribución realista de longitudes de texto en español con acentos y emojis.

**Aceptación:** los presupuestos de §13 se cumplen y quedan en el repositorio con su
`EXPLAIN (ANALYZE, BUFFERS)`.

### T19 · Accesibilidad

**Aceptación:** recorrido completo sin ratón; axe-core sin infracciones serias ni críticas en
las dos rutas; zoom al 200 % sin scroll horizontal; a 320 px la bandeja es usable.

### T20 · Prueba de aislamiento entre organizaciones

**Aceptación:** dos navegadores con dos organizaciones distintas, abiertos a la vez, con
tráfico en ambas. En el inspector de red del navegador A no aparece ni un identificador de la
organización B, ni en las respuestas HTTP ni en las tramas del WebSocket. La prueba se hace
sobre la trama, no sobre lo que se ve en pantalla.

---

## 8. Estructura de componentes

```
app/
  (app)/
    bandeja/
      layout.tsx                  paneles, resuelve organización desde el subdominio
      page.tsx                    lista + panel derecho vacío
      [conversationId]/
        page.tsx                  hilo

components/bandeja/
  panel-vistas.tsx                vistas guardadas y contadores
  panel-filtros.tsx               estado, canal, asignación, etiqueta
  buscador.tsx                    entrada única con modo contacto | contenido
  lista-conversaciones.tsx        cursor, coalescencia, foco por id
  fila-conversacion.tsx           4 líneas, sin consultas propias
  rotulo-contacto.tsx             nombre | @username | contacto sin nombre
  hilo.tsx                        mezcla mensajes y eventos, orden por meta_timestamp
  burbuja-mensaje.tsx             entrante | saliente | echo externo | borrado
  evento-hilo.tsx                 reacción, lectura, entrega, cambio de dueño
  adjunto.tsx                     imagen, audio, vídeo, documento, caducado, desconocido
  linea-de-corte.tsx              marcador de inicio del histórico
  panel-contacto.tsx              contacto, etiquetas, conversaciones anteriores, datos, CDN
  selector-estado.tsx
  selector-asignado.tsx
  selector-etiquetas.tsx

components/base/
  pildora-estado.tsx              color + texto, siempre los dos
  indicador-ventana.tsx           Δ contra reloj corregido, y qué la reabrió
  etiqueta-canal.tsx              versalitas, sin logos de Meta
  indicador-conexion.tsx          en vivo | reconectando | sin conexión
  estado-vacio.tsx                título, cuerpo, acción
  estado-error.tsx                qué pasó, qué hacer, código de correlación
  esqueleto-fila.tsx              misma altura que la fila real

lib/bandeja/
  consultas.ts                    las formas literales de §9
  filtros.ts                      searchParams <-> filtros, en los dos sentidos
  realtime.ts                     canales, coalescencia, reconciliación
  ventana.ts                      cálculo de Δ y etiqueta, función pura
  reloj.ts                        desfase con el servidor
  almacen.ts                      mapa id -> fila, orden, poda a 200 filas
```

Cinco decisiones de estructura:

1. **La URL es el estado.** Los filtros viven en `searchParams`. Compartir una vista es pegar
   un enlace, el botón atrás funciona y la primera página se renderiza en el servidor.
2. **La primera página en servidor; el resto en cliente.** El primer pintado viene de un Server
   Component; a partir de ahí un almacén en cliente recibe los parches de tiempo real y las
   páginas siguientes.
3. **Una sola fuente de verdad en cliente:** un mapa `conversation_id → fila` con índice de
   orden por `(last_message_at, id)`. Tiempo real hace parches; la reconciliación reemplaza.
   Nunca dos listas que haya que mantener sincronizadas.
4. **Sin virtualización por defecto.** El hilo se virtualiza solo por encima de 500 mensajes
   renderizados. Virtualizar rompe la búsqueda del navegador y confunde a los lectores de
   pantalla; a 50 mensajes por bloque no hace falta.
5. **`ventana.ts` es una función pura** de `(last_incoming_at, ahora, canal, human_agent_ok)`
   a `(nivel, etiqueta)`. Es la pieza que más se prueba y la que no puede tener un `Date.now()`
   dentro.

---

## 9. Consultas clave y su índice

Todas se ejecutan bajo RLS con el patrón del documento 02 §7.7:
`using (public.es_miembro(organization_id))`. La política es un predicado más, y por eso todos
los índices de abajo empiezan por `organization_id`.

### 9.1 Lista, primera página — vista por defecto "abiertas"

```sql
select c.id, c.canal, c.estado, c.asignado_a, c.etiquetas,
       c.last_message_at, c.last_incoming_at, c.no_leidos,
       c.preview_texto, c.preview_tipo, c.en_standby,
       ct.id as contact_id, ct.nombre, ct.username
  from public.conversations c
  join public.contacts ct on ct.id = c.contact_id
 where c.organization_id = $1
   and c.estado <> 'cerrada'
 order by c.last_message_at desc, c.id desc
 limit 40;
```

```sql
create index conversations_abiertas_idx
  on public.conversations (organization_id, last_message_at desc, id desc)
  include (estado, asignado_a, canal)
  where estado <> 'cerrada';
```

**Por qué el adelanto va denormalizado en la fila.** La alternativa natural es un
`left join lateral` que saque el último mensaje de cada conversación. Cuesta 40 sondeos de
índice extra por página y, peor, obliga a volver a la base cada vez que llega un mensaje por
tiempo real. Con `preview_texto` y `preview_tipo` mantenidos por el normalizador, la consulta
es un recorrido de rango puro y el evento de tiempo real trae todo lo necesario para repintar
la fila sin consultar nada.

**Por qué el índice es parcial.** El conjunto abierto está acotado por la realidad operativa:
una bandeja con cinco mil conversaciones abiertas es una operación rota, no un problema de
escala. El que crece sin techo es el cerrado, y solo se toca con un filtro explícito. El índice
parcial saca las cerradas del índice caliente.

### 9.2 Página siguiente — cursor, nunca `offset`

```sql
   and (c.last_message_at, c.id) < ($2, $3)
```

`offset 10000` lee y descarta diez mil entradas de índice antes de devolver la primera fila. El
cursor es O(límite) sea cual sea la profundidad.

**El `id` en el cursor no es decorativo.** `last_message_at` se repite: un lote de webhooks
escribe la misma marca en varias conversaciones, y el documento 02 §6.7 recuerda que un lote
trae hasta 1000 actualizaciones. Sin desempate, esas filas se duplican o se saltan al pasar de
página. El índice de bandeja del documento 06 —`(organization_id, estado, last_message_at
desc)`— se amplía con `id desc` por esto.

### 9.3 Filtros: cuatro formas literales, no una genérica

El idioma cómodo `and (cardinality($2::text[]) = 0 or canal = any($2))` **no es sargable**: el
`or` de guarda impide que el planificador use el índice y convierte la consulta en un
recorrido. La capa de consultas elige una de estas cuatro formas:

| Forma | Cuándo | Índice |
|---|---|---|
| A — abiertas | Vista por defecto, con o sin filtros secundarios | `conversations_abiertas_idx` |
| B — por estado | El filtro incluye `cerrada`, o un solo estado explícito | `conversations_estado_idx` |
| C — por asignación | "Mías" y "Sin asignar" | `conversations_asignado_idx` |
| D — por etiqueta | Etiqueta sobre el conjunto abierto | A, con filtro sobre `etiquetas` |

```sql
create index conversations_estado_idx
  on public.conversations (organization_id, estado, last_message_at desc, id desc);

create index conversations_asignado_idx
  on public.conversations (organization_id, asignado_a, last_message_at desc, id desc)
  where estado <> 'cerrada';
```

**Canal y etiqueta no llevan índice propio, a propósito.** Se aplican como filtro sobre un
conjunto que ya viene ordenado y acotado por el índice parcial de abiertas. Recorrer cinco mil
entradas de índice para quedarse con cuarenta cuesta decenas de microsegundos. Un índice por
combinación de filtros son ocho índices sobre la tabla más escrita del sistema, y cada uno se
paga en cada `insert` y en cada `update` de `last_message_at`, que es constante.

`etiquetas` va como `text[]` en la propia fila, con un catálogo `tags` aparte para el nombre y
el color. Una tabla puente obligaría a un `join` que rompe el orden del índice y fuerza un
`sort`.

### 9.4 Contadores de la barra lateral

```sql
select count(*)                                     as abiertas,
       count(*) filter (where estado = 'nueva')     as nuevas,
       count(*) filter (where estado = 'en_curso')  as en_curso,
       count(*) filter (where estado = 'esperando') as esperando,
       count(*) filter (where asignado_a is null)   as sin_asignar,
       count(*) filter (where asignado_a = $2)      as mias,
       count(*) filter (where canal = 'instagram')  as instagram,
       count(*) filter (where canal = 'messenger')  as messenger
  from public.conversations
 where organization_id = $1
   and estado <> 'cerrada';
```

El `include (estado, asignado_a, canal)` del índice parcial convierte esto en un recorrido solo
de índice. **No hay contador de cerradas**: contarlas es recorrer el histórico completo en cada
carga de página. En la interfaz aparece "Cerradas" sin número.

### 9.5 Hilo

Dos consultas que el cliente mezcla en una línea de tiempo. No se unen en SQL: un `union all`
sobre dos tablas con columnas distintas obliga a un `sort` sobre el conjunto combinado y a
rellenar columnas nulas, y no aporta nada frente a mezclar 50 y 20 filas en memoria.

```sql
-- Mensajes
select m.id, m.mid, m.direccion, m.is_echo, m.app_id, m.llego_por_standby,
       m.texto, m.deleted_at, m.is_unsupported, m.sender_scoped_id,
       m.meta_timestamp, m.created_at
  from public.messages m
 where m.conversation_id = $1
   and ($2::timestamptz is null or (m.meta_timestamp, m.id) < ($2, $3))
 order by m.meta_timestamp desc, m.id desc
 limit 50;

-- Adjuntos de esos mensajes, en una sola consulta
select id, message_id, origen, cdn_url, cdn_host, cdn_url_recibida_en, tipo
  from public.media
 where message_id = any($4);

-- Eventos del mismo tramo temporal
select id, tipo, target_mid, actor_scoped_id, emoji, accion, meta_timestamp
  from public.message_events
 where conversation_id = $1
   and meta_timestamp >= $5
 order by meta_timestamp desc;
```

```sql
create index messages_hilo_idx
  on public.messages (conversation_id, meta_timestamp desc, id desc);
-- media_message_idx y message_events_conv_idx ya existen en el documento 02 §7.5
```

Sustituye al `(conversation_id, created_at desc)` del documento 06. El operador tiene que ver
el orden del **evento**, que es lo que vivió el contacto, no el orden de ingesta. Los dos
relojes son distintos y esa distinción vuelve en §9.6.

La consulta trae los últimos primero y el cliente los invierte para pintar.

### 9.6 Reconciliación tras reconectar

```sql
-- Conversaciones que cambiaron desde la marca de agua del cliente
select ...
  from public.conversations
 where organization_id = $1
   and updated_at > $2 - interval '5 seconds'
 order by updated_at asc
 limit 200;

-- Mensajes del hilo abierto llegados desde la marca de agua
select ...
  from public.messages
 where conversation_id = $1
   and created_at > $2 - interval '5 seconds'
 order by created_at asc
 limit 200;
```

```sql
create index conversations_sync_idx on public.conversations (organization_id, updated_at);
create index messages_sync_idx      on public.messages (conversation_id, created_at);
```

Tres cosas que hacen que esto funcione y que no son evidentes:

1. **La marca de agua usa `created_at`, no `meta_timestamp`.** `created_at` es el reloj de
   ingesta y avanza siempre; `meta_timestamp` es el reloj del evento y puede ir hacia atrás,
   porque Meta no garantiza orden —documento 02 §6.7, verbatim: *"batching cannot be
   guaranteed"*—. Usar el segundo como cursor de sincronización pierde mensajes en silencio.
2. **La marca de agua se retrasa cinco segundos y el cliente deduplica por `id`.** `created_at`
   toma el instante de inicio de la transacción, y dos transacciones concurrentes pueden
   confirmar en orden distinto al de sus marcas. Sin ese margen, un mensaje escrito por una
   transacción que confirma tarde queda para siempre por debajo de la marca de agua y el
   operador no lo ve nunca.
3. **`limit 200` con continuación.** Si vuelven 200 filas, se repite desde la última
   `updated_at`. Un corte de tres horas no puede intentar traerse todo de golpe.

`conversations` ya tiene `updated_at` con su trigger `tocar_updated_at()` en el documento 02
§7.1. `messages` no lo tiene y no lo necesita: sus filas se actualizan solo por `unsend` y
edición, que llegan como parche del canal de la conversación.

### 9.7 Búsqueda

Dos consultas distintas, nunca una. El buscador decide por la forma de lo escrito y ofrece las
dos secciones de resultados.

**Extensiones y configuración**

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists btree_gin;

-- unaccent() no es IMMUTABLE con búsqueda de diccionario implícita.
-- La forma de dos argumentos, con diccionario explícito, sí se puede envolver.
create or replace function public.unaccent_inmutable(t text)
returns text language sql immutable parallel safe strict
set search_path = ''
as $$ select public.unaccent('public.unaccent', t) $$;

create text search configuration public.espanol_sin_acentos (copy = spanish);
alter text search configuration public.espanol_sin_acentos
  alter mapping for hword, hword_part, word with unaccent, spanish_stem;
```

**a) Contacto** — sobre `nombre` y `username`, que es lo que hay: `contacts` no tiene teléfono.

```sql
alter table public.contacts
  add column busqueda_norm text
  generated always as (
    lower(public.unaccent_inmutable(coalesce(nombre, '') || ' ' || coalesce(username, '')))
  ) stored;

create index contacts_busqueda_trgm_idx
  on public.contacts using gin (organization_id, busqueda_norm gin_trgm_ops);
```

```sql
select id, nombre, username
  from public.contacts
 where organization_id = $1
   and busqueda_norm like '%' || lower(public.unaccent_inmutable($2)) || '%'
 limit 10;
```

`btree_gin` es lo que permite meter `organization_id` dentro del índice GIN. Sin él, el índice
se recorre para todas las organizaciones y RLS filtra después: correcto, pero paga el trabajo
de todos los inquilinos en cada búsqueda.

**b) Contenido**

```sql
alter table public.messages
  add column texto_tsv tsvector
  generated always as (to_tsvector('public.espanol_sin_acentos', coalesce(texto, ''))) stored;

create index messages_busqueda_idx
  on public.messages using gin (organization_id, texto_tsv);
```

```sql
select m.conversation_id, m.id, m.meta_timestamp,
       ts_headline('public.espanol_sin_acentos', m.texto,
                   websearch_to_tsquery('public.espanol_sin_acentos', $2)) as fragmento
  from public.messages m
 where m.organization_id = $1
   and m.texto_tsv @@ websearch_to_tsquery('public.espanol_sin_acentos', $2)
   and m.deleted_at is null
   and m.meta_timestamp > now() - interval '180 days'
 order by m.meta_timestamp desc
 limit 50;
```

Tres decisiones con su motivo:

- **Ventana de 180 días por defecto**, con una acción explícita "Buscar en todo el histórico"
  que avisa de que tarda más. Un GIN devuelve un mapa de bits sin orden; ordenar doscientas mil
  coincidencias por fecha es el coste real de esta consulta.
- **Orden por recencia, no por `ts_rank`.** Ranquear exige leer y puntuar todas las
  coincidencias. En una bandeja, lo reciente es casi siempre lo relevante.
- **`ts_headline` se aplica después del `limit`**, sobre 50 filas. Antes, se ejecuta sobre todo
  el conjunto y es lo más caro de la consulta.
- **`deleted_at is null`.** Un mensaje que el contacto borró no debe aparecer en resultados de
  búsqueda con su texto original, aunque la fila siga en la base.

Si el resultado se corta en 50: *"Se muestran los 50 más recientes. Afina la búsqueda o acota
la fecha."*

**c) Etiqueta**

```sql
select ...
  from public.conversations
 where organization_id = $1
   and estado <> 'cerrada'
   and etiquetas @> array[$2]
 order by last_message_at desc, id desc
 limit 40;
```

Sobre el índice parcial de abiertas, con `etiquetas` como filtro. Buscar por etiqueta dentro
del histórico cerrado queda fuera de esta fase.

### 9.8 Índices de la fase, y lo que cuestan

| Índice | Sirve a | Coste de escritura |
|---|---|---|
| `conversations_abiertas_idx` (parcial, con `include`) | Lista por defecto y contadores | Alto: se toca en cada mensaje. Justificado, es la consulta más frecuente |
| `conversations_estado_idx` | Filtro por estado, incluido `cerrada` | Medio |
| `conversations_asignado_idx` (parcial) | "Mías" y "Sin asignar" | Bajo: solo cambia al asignar |
| `conversations_sync_idx` | Reconciliación | Medio |
| `messages_hilo_idx` | Hilo | Alto, inevitable |
| `messages_sync_idx` | Reconciliación del hilo | Medio |
| `messages_busqueda_idx` (GIN) | Búsqueda de contenido | Alto en `insert`. Es el candidato a revisión si la ingesta se degrada |
| `contacts_busqueda_trgm_idx` (GIN) | Búsqueda de contacto | Bajo: `contacts` se escribe poco |

Se conservan los del documento 02 §7 que esta fase no toca, con la corrección del predicado del
índice único parcial descrita en §5.1.

---

## 10. Tiempo real

### 10.1 Qué se suscribe

**Broadcast emitido desde un trigger de la base de datos, no `postgres_changes` con filtro.**
Es la decisión del documento 02 §5.2 y el motivo es contraintuitivo: `postgres_changes` evalúa
las políticas RLS **por suscriptor y por cambio**, y una bandeja compartida multi-tenant con
muchos agentes conectados es exactamente el patrón que lo castiga. Con Broadcast, la
autorización del canal se resuelve **una vez, al suscribirse**.

Dos canales, los dos privados.

| Canal | Cuándo se suscribe | Qué lleva |
|---|---|---|
| `org:{organization_id}` | Al abrir la bandeja, uno por sesión | Cambios de fila: estado, asignación, `last_message_at`, `last_incoming_at`, `no_leidos`, adelanto, etiquetas |
| `conv:{conversation_id}` | Al abrir un hilo; se cancela al cerrarlo | El mensaje completo, los adjuntos y los eventos: reacciones, lecturas, borrados y ediciones |

**Por qué dos y no uno.** Con un solo canal por organización, cada navegador recibiría el
cuerpo de todos los mensajes de toda la organización aunque esté mirando otra conversación. Con
tres operadores y dos mil mensajes al día no se nota; con veinte sí, y además es una postura de
privacidad peor de lo necesario. El coste es una rama más en la política de autorización.

Emisión, con carga útil curada en vez de la fila entera:

```sql
create or replace function public.emitir_cambio_conversacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'id',                new.id,
        'estado',            new.estado,
        'canal',             new.canal,
        'asignado_a',        new.asignado_a,
        'etiquetas',         new.etiquetas,
        'no_leidos',         new.no_leidos,
        'en_standby',        new.en_standby,
        'last_message_at',   new.last_message_at,
        'last_incoming_at',  new.last_incoming_at,
        'ventana_reabierta_por', new.ventana_reabierta_por,
        'preview_texto',     left(coalesce(new.preview_texto, ''), 140),
        'preview_tipo',      new.preview_tipo,
        'updated_at',        new.updated_at
      ),
      'conversacion',
      'org:' || new.organization_id::text,
      true                                   -- canal privado
    );
  exception when others then
    -- La ingesta nunca puede caerse porque falle la emisión.
    perform public.registrar_metrica('realtime_emision_fallida', new.organization_id);
  end;
  return null;
end;
$$;

create trigger conversations_emitir
  after insert or update on public.conversations
  for each row execute function public.emitir_cambio_conversacion();
```

Dos notas. La primera: **la firma exacta de `realtime.send` y la alternativa
`realtime.broadcast_changes` hay que confirmarlas contra la versión de la extensión desplegada
en `sdazqohyjzzylwbkvovx`** antes de escribirlo (§16); `broadcast_changes` publica el registro
completo y aquí se quiere una carga útil recortada. La segunda: **tragarse la excepción es
deliberado y está acotado a la emisión**. Si Realtime falla, se pierde la actualización en vivo
y la reconciliación de §10.3 la recupera en menos de un minuto. Si el trigger aborta la
transacción, se pierde el mensaje, y si eso se generaliza Meta acaba desuscribiendo la Página
tras una hora de fallos. La métrica es lo que impide que ese fallo sea silencioso.

Triggers análogos en `messages`, `media` y `message_events`, publicando en
`conv:{conversation_id}` con eventos `mensaje`, `adjunto` y `evento`.

### 10.2 Cómo se evita que un navegador reciba filas de otra organización

Tres capas, y ninguna sustituye a las otras.

**Capa 1 — la emisión.** El trigger construye el nombre del canal a partir del
`organization_id` de la propia fila. Una fila de otra organización no se publica jamás en ese
canal. Es la única capa que impide que el dato salga de la base.

**Capa 2 — la autorización del canal.** Los canales son privados
(`{ config: { private: true } }`) y Realtime evalúa una política sobre `realtime.messages` al
suscribirse:

```sql
create policy bandeja_recibir_broadcast
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      -- org:{uuid}
      exists (
        select 1
          from public.organization_members m
         where m.user_id = (select auth.uid())
           and realtime.topic() = 'org:' || m.organization_id::text
      )
      or
      -- conv:{uuid}
      (
        realtime.topic() ~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1
            from public.conversations c
            join public.organization_members m
              on m.organization_id = c.organization_id
           where m.user_id = (select auth.uid())
             and c.id = substring(realtime.topic() from 6)::uuid
        )
      )
    )
  );
```

`(select auth.uid())` envuelto en subconsulta, por la misma razón que en el documento 02 §7.7:
así se evalúa una vez como InitPlan y no una vez por fila. La comprobación con expresión
regular antes del `::uuid` no es cosmética: sin ella, un nombre de canal mal formado provoca un
error de conversión en la política. No es una fuga, pero sí una denegación de servicio barata
sobre el plano de tiempo real.

**Capa 3 — el cliente no confía en la carga útil.** El evento sirve para pintar. Cualquier
lectura autoritativa —abrir el hilo, paginar, reconciliar— vuelve por PostgREST bajo RLS. Si
por un fallo de las capas 1 o 2 llegara un `conversation_id` ajeno, la lectura devuelve vacío y
la fila no se materializa.

T20 verifica esto **sobre la trama del WebSocket**, no sobre lo que se ve en pantalla. Una fuga
que no se pinta sigue siendo una fuga.

### 10.3 Qué pasa al reconectar

**Premisa: Broadcast es como mucho una entrega.** Lo que ocurre mientras el socket está caído
no se reenvía. Realtime nunca es la fuente de verdad; es una optimización sobre una consulta.

```
  conectando ──► en vivo ──► reconectando ──► sin conexión
       ▲            │             │                 │
       └────────────┴─────────────┴─────────────────┘
                 (reintento con espera creciente)
```

1. **En cada transición a "en vivo", incluida la primera, se reconcilia.** Se ejecutan las
   consultas de §9.6 con la marca de agua menos cinco segundos y se deduplica por `id`.
2. **Espera creciente con dispersión:** 1 s, 2 s, 4 s, 8 s, 16 s, tope de 30 s. Sin dispersión,
   veinte pestañas reconectan a la vez tras un corte y producen su propia avalancha.
3. **Sondeo de seguridad cada 60 s aunque el socket diga que está vivo.** Un socket que se cree
   conectado y no entrega nada es el fallo más caro de una bandeja, porque no emite ningún error
   y el operador concluye que no hay mensajes. Es la consulta de reconciliación, que devuelve
   cero filas casi siempre.
4. **`visibilitychange` fuerza reconciliación** al volver la pestaña a primer plano. Un portátil
   que estuvo dormido cuatro horas tiene un socket que parece vivo y no lo está.
5. **Tras tres reintentos fallidos, modo consulta.** La bandeja sigue funcionando refrescando
   cada 30 s, y lo dice con texto: *"Sin conexión en vivo. La bandeja se actualiza cada 30
   segundos. Reintentar"*.
6. **El indicador de conexión es visible siempre**, con texto: `En vivo` · `Reconectando` ·
   `Sin conexión`. Nunca solo un punto de color.
7. **La reconciliación no mueve el scroll.** Si el hilo abierto recibe mensajes y el operador no
   está al final, se muestra *"3 mensajes nuevos"* con un botón que baja. Si está al final,
   sigue pegado al final.

**Ráfagas.** Un lote de Meta trae hasta 1000 actualizaciones y el agrupamiento no está
garantizado. El cliente acumula los eventos en un búfer de 250 ms, se queda con el último por
`conversation_id` y repinta una vez. T13 es lo que verifica que funciona.

**Orden invertido.** El documento 02 §6.7 avisa de que no hay garantía de orden y de que la
bandeja tiene que tolerar inserciones que van hacia atrás en el hilo. El componente de hilo
inserta por `meta_timestamp`, no anexa al final.

---

## 11. Estados vacíos, de carga y de error

Textos definitivos. Voz del libro de marca §6: verbo primero, sin disculpas, sin exclamaciones,
y los errores dicen qué pasó y qué hacer.

| Situación | Qué se ve |
|---|---|
| Canal recién conectado, sin mensajes | **Todavía no ha entrado ningún mensaje.** Kavea registra desde que se conectó el canal, el 4 de agosto a las 09:14. El histórico anterior no se puede importar: la API de Meta devuelve solo los 20 mensajes más recientes de cada conversación y falla al pedir más. → *Ver cómo probar el canal* |
| Filtro sin resultados | **Ninguna conversación con estos filtros.** → *Quitar filtros* |
| Búsqueda sin resultados | **Sin resultados para «devolución».** La búsqueda cubre los últimos 180 días. → *Buscar en todo el histórico* |
| Sin conversación seleccionada | **Elige una conversación.** |
| Carga inicial | Seis esqueletos con la altura exacta de la fila real. No aparecen si la consulta responde antes de 150 ms |
| Carga de página siguiente | Un esqueleto al final, con `aria-busy="true"` |
| Error de consulta | **No se pudo cargar la bandeja.** → *Reintentar*. Debajo, en monoespaciada de 11 px, el código de correlación. Nunca la excepción |
| Realtime caído | Aviso discreto en la cabecera, no modal: **Sin conexión en vivo. La bandeja se actualiza cada 30 segundos.** → *Reintentar* |
| `meta_connections.estado = 'disconnected'` | Aviso persistente: **Instagram está desconectado desde el 3 de agosto, 14:20. No están entrando mensajes nuevos.** → *Reconectar* |
| `meta_connections.estado = 'degraded'` | **Instagram está limitado por Meta. Los mensajes siguen entrando; el envío se reanuda a las 15:40.** |
| `channels.activo = false` | **Instagram está pausado desde el panel interno.** Con `pausado_motivo` |
| `subscription_ok = false` | **Kavea no aparece suscrita a esta Página. Puede que no estén llegando mensajes.** → *Revisar conexión* |
| Mensaje borrado por el contacto | La burbuja se conserva con su hora: *Mensaje eliminado por el contacto* |
| Adjunto caducado | *El archivo ya no está disponible en Meta.* Con el tipo y la hora |
| Adjunto de tipo desconocido (`is_unsupported`) | *Adjunto no reconocido.* Con el tipo crudo visible para soporte |
| Respuesta a una historia caducada | *Historia expirada.* El texto de la respuesta sí se muestra |

Los avisos de canal tienen prioridad sobre todo lo demás en la cabecera. Salen de la máquina de
estados de `meta_connections` del documento 02 §5.4 y del cron de reconciliación de `§6.6`: una
bandeja tranquila puede ser una bandeja rota, y ese es el fallo que Meta produce en silencio a
la hora de entregas fallidas.

---

## 12. Accesibilidad

### Contraste

Medido, no estimado. Cifras en §5.3. Reglas que se derivan:

- Todo texto cumple 4.5:1, incluidas las versalitas de 11 px, que no son "texto grande".
- Ceniza (`#A8A39A`) sobre Papel da **2,37** y por tanto **no vale para texto**. Queda para
  bordes y separadores. Los marcadores de posición usan Piedra (`#6E6A63`, 5,07).
- Terracota 500 sobre Arena da **4,52**: pasa, con dos centésimas de margen. En esta fase el
  terracota solo aparece en el anillo de foco, sobre Papel o sobre superficie blanca.
- El punto de estado de 6 px y el filete lateral son decorativos y **nunca** son el único
  portador de la información.

### Nunca solo color

| Información | Además del color |
|---|---|
| Estado de la conversación | Texto en la píldora: `Nueva`, `En curso`, `Esperando`, `Cerrada` |
| Ventana de servicio | Texto con las horas restantes y, si aplica, qué la reabrió |
| Canal | Versalitas: `INSTAGRAM`, `MESSENGER` |
| No leídos | Número, no un punto |
| Fila seleccionada | Filete, fondo y `aria-current="page"` |
| Dirección del mensaje | Alineación, autoría escrita y etiqueta accesible: *"Entrante, María González, 11:42"* |
| Hilo en `standby` | Texto en la cabecera |
| Conexión en vivo | Texto en la cabecera |

### Teclado

- Orden de tabulación: saltar al contenido → filtros → buscador → lista → hilo.
- La lista es un `<ul>` de enlaces reales a `/bandeja/{id}`. Abrir en pestaña nueva funciona, el
  botón atrás funciona, y no hay que reimplementar nada del navegador.
- `tabindex` móvil dentro de la lista: `↑` y `↓` mueven, `Inicio` y `Fin` saltan, `Intro` abre.
  `j` y `k` como alternativa.
- **El foco se mantiene por identificador, no por índice.** Una fila puede subir de posición en
  cualquier momento porque llegó un mensaje. Si el foco se guarda por índice, salta solo, y eso
  es intolerable en una herramienta que se usa a teclado.
- `/` enfoca el buscador. `Esc` lo limpia y devuelve el foco a la lista. `?` abre el panel de
  atajos. Todo atajo de una tecla comprueba que el foco no está en un campo editable; en la fase
  4 aparece el compositor y esa comprobación deja de ser opcional.
- Anillo de foco: 2 px terracota con `outline-offset: 2px`, el que ya está en `global.css`.
  Nunca `outline: none` sin sustituto visible.

### Lectores de pantalla

- El hilo es un `<ol>` con `aria-label="Mensajes de la conversación con María González"`.
- **No hay `aria-live` sobre la lista de conversaciones ni sobre la de mensajes.** Una región en
  vivo sobre una bandeja activa produce un flujo continuo de anuncios que hace la herramienta
  inutilizable. En su lugar, una región `aria-live="polite"` compacta y aparte, que anuncia
  agregados: *"2 mensajes nuevos en esta conversación"*, *"3 conversaciones nuevas en la
  bandeja"*, con intervalo mínimo de 10 s entre anuncios.
- Todas las horas en `<time datetime="…">` con la fecha completa como texto accesible.
- Los cambios de estado y de asignación se confirman en la región compacta: *"Conversación
  asignada a Gabriel Montiel"*.
- Los eventos que no son mensajes —reacciones, cambios de dueño de hilo— se anuncian con su
  significado, no con su tipo técnico: *"María González reaccionó. La ventana de 24 horas se
  reabrió."*

### Otras

- Zoom al 200 % sin scroll horizontal. A 320 px, un panel a la vez con navegación real por URL.
- `prefers-reduced-motion`: los mensajes entrantes aparecen sin animación.
- Altura de fila de 72 px, muy por encima del mínimo de 44 px de objetivo táctil.

---

## 13. Rendimiento

### Presupuestos

Sobre el banco de T18: 300.000 conversaciones (90 % cerradas), 2.000.000 de mensajes.

| Medida | Presupuesto |
|---|---|
| p95 de la lista, primera página | < 30 ms |
| p95 de la lista, página 200 | < 35 ms |
| p95 de los contadores | < 40 ms |
| p95 del hilo (mensajes + adjuntos + eventos) | < 40 ms |
| p95 de la búsqueda de contenido, 180 días | < 300 ms |
| Primer pintado útil de `/bandeja` en 4G simulada | < 1,5 s |
| Repintados de la lista bajo 100 eventos/s | ≤ 4 por segundo |
| Memoria del cliente tras 8 h abierto | Estable: el almacén se poda a 200 filas |
| Latencia añadida al normalizador por el GIN de búsqueda | < 15 % |

### Cómo se verifica

- `EXPLAIN (ANALYZE, BUFFERS)` de cada consulta de §9, guardado junto a la consulta. Cuando el
  plan cambie, el diff lo enseña.
- Una prueba que **falla si aparece `Seq Scan`** sobre `conversations` o `messages` en cualquier
  consulta de la bandeja.
- Una prueba que **falla si aparece `offset`** en la capa de consultas.
- Medición del `insert` del normalizador con y sin `messages_busqueda_idx`. El GIN es el único
  índice de esta fase que puede degradar la ingesta, y la ingesta es lo que Meta cronometra.

### Lo que tumba la lista, y qué se hace en su lugar

| Patrón | Por qué mata | Alternativa |
|---|---|---|
| `offset` profundo | Lee y descarta todo lo anterior | Cursor sobre `(last_message_at, id)` |
| `count(*)` del histórico | Recorrido completo en cada carga | Contadores solo sobre el conjunto abierto |
| Último mensaje por `join lateral` | 40 sondeos por página y una consulta por evento | `preview_texto` denormalizada |
| `ilike '%texto%'` sobre `messages` | Recorrido completo | GIN sobre `tsvector`, acotado por organización y por 180 días |
| GIN sin `organization_id` | Se paga el trabajo de todos los inquilinos | `btree_gin` con la organización dentro del índice |
| Un índice por combinación de filtros | Ocho índices en la tabla más escrita | Tres índices y filtro sobre conjunto acotado |
| Región en vivo sobre la lista | El lector de pantalla relee sin parar | Región compacta y agregada |
| Virtualizar desde el primer mensaje | Rompe la búsqueda del navegador | Virtualización solo por encima de 500 |
| Un temporizador por fila para la ventana | 40 renders por segundo | Un temporizador compartido, a un minuto, solo filas visibles |
| `union all` de mensajes y eventos en SQL | `sort` sobre el conjunto combinado | Mezcla en memoria de 50 + 20 filas |

---

## 14. Riesgos

| Riesgo | Impacto | Mitigación | Cómo se detecta |
|---|---|---|---|
| **Las URLs de `lookaside` pueden no renderizar en el navegador** y proxearlas equivale a cachear, que Meta prohíbe | Bandeja sin adjuntos visibles, o rechazo del App Review | Comprobación empírica antes de escribir el componente (§5.6); consulta por escrito a Meta Developer Support; nunca proxy por decreto | E11 y la prueba de renderizado de T10 |
| TTL desconocido de las URLs de adjunto | Los adjuntos desaparecen sin aviso y nadie sabe cuándo | Sonda de caducidad E11; texto explícito en la burbuja | La propia sonda |
| La bandeja de un cliente nuevo arranca vacía | Percepción de producto vacío; fricción comercial | Línea de corte, aviso de 14 días, guion de venta que no promete histórico | Es seguro, no hay que detectarlo |
| Socket vivo que no entrega | El operador concluye que no hay mensajes | Sondeo de 60 s, reconciliación en `visibilitychange`, indicador con texto | Diferencia entre el recuento del cliente y el de la base |
| Ráfaga de 1000 actualizaciones | Navegador congelado | Búfer de 250 ms y coalescencia por conversación | Presupuesto de T13 |
| Fuga entre organizaciones por un canal mal construido | El peor fallo posible bajo RLS | Tres capas de §10.2 | T20, sobre la trama, en cada despliegue |
| Índice único parcial con predicado `status='open'` | Conversaciones duplicadas cuando la original está en `esperando` | Predicado corregido a `estado <> 'cerrada'` | Prueba concurrente de T1 |
| `last_message_at` repetido en un lote | Filas duplicadas o saltadas al paginar | `id` en el índice y en el cursor | Prueba de paginación con marcas idénticas |
| La ventana se reabre sin mensaje nuevo | El indicador parece roto y se pierde la confianza en él | `ventana_reabierta_por` visible en hilo y lista | T7 |
| HUMAN_AGENT todavía no aprobada | La interfaz promete una capacidad que Meta no ha concedido | Etiqueta marcada como pendiente hasta que el App Review la conceda | Revisión al aprobarse la feature |
| Crecimiento de `messages` | Búsqueda y hilo degradados | Ventana de 180 días, GIN acotado, archivado de cerradas diferido | Tamaño del índice GIN |
| El GIN de búsqueda degrada la ingesta | El normalizador se acerca al presupuesto que Meta cronometra | Medir el `insert` con y sin el índice antes de darlo por bueno | Presupuesto de §13 |
| Contactos sin nombre por el error 230 | Bandeja llena de identificadores crudos | Rótulo resuelto de §5.2 | T6 |
| Cerrar crea una conversación nueva | El operador cree que perdió el hilo | Panel de "Conversaciones anteriores" | T10 |
| El trigger de emisión aborta la ingesta | Mensajes perdidos y desuscripción de Meta a la hora | Excepción tragada y acotada a la emisión, con métrica | T12 con permisos revocados |
| Contraste insuficiente del ámbar de marca | La píldora más usada es ilegible | Tokens de texto oscurecidos y medidos | Script de contraste en T2 |
| Dos modelos de datos vivos (docs 02 y 06) | Migración escrita contra el esquema equivocado | Manda el 02; corregir el 06 | §16 |

---

## 15. Definición de terminado

- [ ] Un operador de Boosty trabaja media jornada en la bandeja de Kavea sin abrir Kommo para
      leer.
- [ ] Un mensaje real entrante aparece en la lista en menos de 2 s, sin recargar.
- [ ] Cortar la red 5 minutos con 200 mensajes entrando y restaurarla: el recuento del cliente
      coincide exactamente con `select count(*)`, sin recargar.
- [ ] Dos organizaciones abiertas a la vez: en la trama del WebSocket de una no aparece ningún
      identificador de la otra.
- [ ] Los presupuestos de §13 se cumplen sobre el banco de 300.000 / 2.000.000 y sus `EXPLAIN`
      están en el repositorio.
- [ ] Ninguna consulta de la bandeja produce `Seq Scan` sobre `conversations` ni `messages`.
- [ ] El `insert` del normalizador no se degrada más de un 15 % con el GIN de búsqueda activo.
- [ ] Recorrido completo sin ratón: filtrar, buscar, abrir, cambiar estado, asignar, volver.
- [ ] Las combinaciones de contraste de §5.3 miden 4.5:1 o más, en claro y en oscuro.
- [ ] axe-core sin infracciones serias ni críticas en las dos rutas.
- [ ] La línea de corte aparece en toda conversación anterior a la conexión del canal, con la
      fecha correcta.
- [ ] Los cinco casos de §6.2 —adjunto caducado, mensaje borrado, echo externo, reacción que
      reabre la ventana, hilo en `standby`— tienen prueba con payload real y ninguno rompe la
      vista.
- [ ] El comportamiento de las URLs de `lookaside` en el navegador está **medido**, no supuesto,
      y la sonda de TTL lleva al menos 30 URLs bajo seguimiento.
- [ ] La consulta por escrito a Meta Developer Support sobre el tratamiento del media está
      enviada y su respuesta archivada, o consta que sigue pendiente.
- [ ] Todos los textos revisados contra el libro de marca §6: sin "simplemente", "fácilmente",
      "potencia", sin signos de exclamación, verbo primero en los botones.
- [ ] El documento 01 actualizado con los tokens de estado y el micro-copy de la píldora.
- [ ] Ningún camino de código de la bandeja llama al Send API de Meta. Verificado por búsqueda
      en el repositorio, no por confianza.

---

## 16. Preguntas abiertas

1. **Cuatro estados frente a tres.** El documento 02 §7.4 define `open | pending | closed`; el
   documento base y este plan piden `nueva | en_curso | esperando | cerrada`. Se propone
   ampliar. ¿Se confirma, y se corrige el 02?
2. **`nueva` sin color en el libro de marca.** La propuesta es neutral (Arena + Tinta). ¿Se
   aprueba, o se añade un quinto matiz semántico?
3. **`escalada` es un color sin estado.** La propuesta es reservarlo a la ventana crítica y a
   los errores de canal. ¿Se acepta?
4. **Modo oscuro.** Los cuatro semánticos del libro no cumplen contraste sobre superficie
   oscura. Las variantes de §5.3 están medidas. ¿Se aprueban y se incorporan al documento 01?
5. **Renderizado de las URLs de `lookaside` en el navegador.** Es la incógnita con más capacidad
   de cambiar el diseño de esta fase. Hay que medirla antes de escribir el componente de
   adjunto, y hay que preguntar a Meta por escrito antes de considerar cualquier proxy.
6. **Divergencias del documento 06** que conviene corregir para que no haya dos modelos vivos:
   `memberships` frente a `organization_members`; `private.org_ids_del_usuario()` frente a
   `public.es_miembro()`; receptor en Supabase Edge Function frente a Cloudflare Worker más
   Queues; `channels` con credenciales frente al modelo `meta_connections` +
   `meta_asset_routes` + `channels`; `messages.adjuntos jsonb` frente a la tabla `media`.
7. **`no_leidos`: por conversación o por usuario.** Por conversación es una cuenta compartida
   —lo que hace Kommo— y cuesta una columna. Por usuario exige una tabla más y una escritura por
   cada lectura. Se propone por conversación en v1.
8. **Semilla de los 20 últimos mensajes.** ¿Se descarta del todo, o entra en el onboarding
   asumiendo 2 llamadas por segundo y el error engañoso al pedir el mensaje 21?
9. **WhatsApp.** El dominio `canal_meta` no lo admite. ¿Se amplía el dominio en esta fase para
   dejar la bandeja preparada, o se espera a que cierre la investigación del canal?
10. **Hilos en `standby`.** ¿La cabecera dice "El hilo lo tiene la bandeja de Meta" desde esta
    fase, aunque todavía no se pueda responder? Se propone que sí.
11. **Retención y alcance de la búsqueda.** Se proponen 180 días por defecto. ¿Qué se le promete
    al cliente por contrato sobre el histórico consultable?
12. **Densidad.** Se propone una sola densidad, la baja, sin conmutador. ¿Se confirma?
13. **`realtime.send` frente a `realtime.broadcast_changes`.** Confirmar la firma exacta contra
    la versión de la extensión desplegada en `sdazqohyjzzylwbkvovx` antes de escribir los
    triggers.
