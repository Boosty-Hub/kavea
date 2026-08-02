# Fase 6 — Agentes en modo copiloto

**Fecha:** 2 de agosto de 2026
**Estado:** plan detallado, sin código escrito
**Depende de:** `00-documento-base.md`, `03-invariantes-meta.md` (normativo), `06-arquitectura-plataforma.md`
**Corresponde al bloque 6** del orden de construcción del documento 06.

---

## 1. Objetivo

Que cada mensaje entrante quede clasificado por intención, que exista un borrador de
respuesta redactado con el contexto de la conversación y del contacto, que una persona
apruebe o descarte ese borrador antes de que salga nada, y que todo lo anterior quede
en `agent_runs` con entrada, salida, modelo, decisión, coste y latencia.

Tres afirmaciones definen el alcance y ninguna es negociable:

**El agente no emite.** En esta fase el único emisor automático hacia el usuario final
es el carril de acuse determinista de la sección 6. El agente produce una propuesta;
la propuesta la envía un humano. El agente no tiene herramientas con efecto: no puede
llamar al Send API, no puede cambiar el estado de una conversación, no puede escribir
en la base. Devuelve un objeto JSON validado y nada más.

**El modo autónomo no se abre en esta fase.** Se abre después, con datos medidos sobre
conversaciones reales, por tipo de intención y por tenant, nunca de golpe. La sección 9
fija los umbrales y el procedimiento; esta fase los deja escritos y verificables, no
activados.

**El cumplimiento de los 30 segundos no depende de Claude.** Esto se desarrolla en la
sección 6 y es la consecuencia más útil del modo copiloto: si el agente nunca emite,
la latencia del modelo queda fuera de la ruta crítica de la política de Meta.

### Qué no entra

- Modo autónomo activo, en cualquier intención y en cualquier tenant.
- Visión: el agente no procesa imágenes ni audio. Un adjunto es un escalamiento
  automático mientras la sección 12 siga abierta.
- Seguimientos proactivos, plantillas de WhatsApp, envío por segmento. Eso es Fase 4
  y Fase 5.
- Herramientas de agente (consultar stock, crear un trato, agendar). Sin capa comercial
  no hay a qué llamar, y añadir herramientas multiplica la superficie de inyección.
- WhatsApp. El documento 03 lo marca sin investigar y ninguna sección puede afirmar
  nada de ese canal más allá de los cinco puntos verificados.

---

## 2. Precondiciones

No se empieza esta fase hasta que todo esto esté cerrado.

| # | Precondición | Cómo se comprueba |
|---|---|---|
| 1 | Bloques 0 a 5 del documento 06 terminados y sin deuda | La bandeja recibe en vivo, se responde desde ella y el compositor se bloquea fuera de ventana |
| 2 | `last_incoming_at` correcto por conversación | Un echo saliente no lo mueve; un entrante sí |
| 3 | Lógica anti-bucle por `app_id` funcionando | Un mensaje enviado desde Business Suite no vuelve a entrar como entrante |
| 4 | App ID real de la bandeja de Business Suite verificado empíricamente | Leído de un echo real, no del valor de la documentación, que tiene dos variantes de 14 y 15 dígitos |
| 5 | El parser lee `entry[].messaging[]` **y** `entry[].standby[]`, y los distingue | Un evento en `standby[]` queda marcado como tal en la cola |
| 6 | Clave de API de Anthropic en el gestor de secretos, nunca en el repositorio ni en el contenedor de una función pública | La variable no aparece en ningún despliegue del sitio público |
| 7 | Texto de acuse y texto de divulgación de IA aprobados por escrito por el tenant | Documento firmado en el expediente de onboarding |
| 8 | Kill-switch por canal y por tenant operativo | Se apaga un canal y la cola encola en vez de fallar |
| 9 | Consulta escrita a Meta sobre descarga efímera de media enviada | Número de caso guardado, aunque no haya respuesta todavía |

La precondición 9 no bloquea el arranque de la fase: bloquea cualquier diseño que
asuma que el agente puede ver imágenes. Ver sección 12.

---

## 3. Entregables

1. Migración que extiende `agent_runs`, con su política RLS, su política de break-glass
   y sus índices.
2. Tablas nuevas: `agent_config` (por organización), `intenciones` (catálogo sembrado),
   `acuse_plantillas` (por organización, canal e idioma).
3. Columnas nuevas en `webhook_events` para el carril de acuse, con su índice parcial.
4. Proceso del carril de acuse determinista, con su sondeo y su barrido de rescate.
5. Trabajador del agente: una llamada por mensaje, salida validada contra esquema,
   escritura en `agent_runs`.
6. Motor de escalamiento determinista, en código, con pruebas unitarias por regla.
7. Interfaz de copiloto en la bandeja: tarjeta de propuesta con aprobar, editar y
   enviar, o descartar con motivo.
8. Conjunto dorado de al menos 200 mensajes reales etiquetados a mano por tenant activo,
   y arnés de evaluación que lo ejecuta.
9. Panel de coste por conversación en el admin, con datos agregados y sin contenido.
10. Runbook: kill-switch del agente, modo degradado, y qué hacer ante un aviso de
    violación de Meta.
11. Documento de criterios de apertura de modo autónomo, con umbrales y procedimiento.
12. Consulta escrita a Meta sobre descarga efímera de media, con la respuesta archivada.

---

## 4. Modelos, por tarea

La información de esta sección viene de la referencia de la API de Claude cacheada el
**24 de junio de 2026**. Igual que el documento base exige para las tarifas de Meta:
**verificar la tabla vigente antes de fijar precio al cliente**, no modelar con cifras
de memoria.

| Modelo | Identificador exacto | Contexto | Entrada $/1M | Salida $/1M |
|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M | 5,00 | 25,00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 3,00 (2,00 introductorio hasta el 31-ago-2026) | 15,00 (10,00 introductorio) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 1,00 | 5,00 |

El precio introductorio de Sonnet 5 vence en 29 días. **Ninguna lista de precios al
cliente se construye sobre él.**

### Asignación

| Tarea | Modelo en el arranque | Parámetros | Nota |
|---|---|---|---|
| Clasificación + redacción del borrador | `claude-opus-5` | `output_config: {effort: "low"}` al principio, con barrido hasta `high`; pensamiento adaptativo (por defecto); `output_config.format` con esquema JSON | Una sola llamada, ver abajo |
| Decisión de escalamiento | Ninguno | — | Es código determinista sobre la salida estructurada. No se delega al modelo |
| Evaluación de calidad fuera de línea | `claude-opus-5` por la API de lotes | 50% de descuento; los resultados llegan en cualquier orden, se indexan por `custom_id` | Nunca en la ruta de la petición |

**Una llamada, no dos.** Clasificar y redactar en la misma petición cuesta la mitad,
tarda la mitad y comparte un único prefijo cacheado. El argumento habitual en contra
—que el borrador se desperdicia cuando la conversación escala— no aplica en copiloto:
en copiloto un humano interviene siempre, así que un borrador sugerido le sirve incluso
en un escalamiento. Se revisa esta decisión el día que se abra alguna intención a modo
autónomo.

**Por qué se arranca en Opus 5 y no en el modelo más barato.** Medir calidad en el
modelo caro y bajar después con datos es un camino reversible. Medir en el modelo barato
y no saber si el techo es del modelo o del prompt no lo es. El barrido de modelo es la
tarea T14 y su resultado es una decisión de Gabriel, no del plan.

### Detalles de la API que condicionan el diseño

- **`temperature`, `top_p` y `top_k` están retirados en Opus 5**: enviarlos devuelve 400.
  No hay perilla de variabilidad. La consistencia del borrador se consigue con el prompt
  y con `effort`, no con parámetros de muestreo.
- **`budget_tokens` está retirado en Opus 5**: devuelve 400. La profundidad se controla
  con `output_config.effort`, que admite `low`, `medium`, `high`, `xhigh` y `max`, y cuyo
  valor por defecto es `high`.
- **En Opus 5 el pensamiento está activo por defecto.** Omitir `thinking` ejecuta modo
  adaptativo. Consecuencia directa: `max_tokens` acota pensamiento **más** texto de
  respuesta juntos, así que un `max_tokens` ajustado al tamaño del borrador trunca la
  respuesta a mitad. Se dimensiona con holgura y se vigila `stop_reason == "max_tokens"`.
- **No se desactiva el pensamiento.** `thinking: {type: "disabled"}` en Opus 5 tiene dos
  modos de fallo documentados: el modelo puede escribir una llamada a herramienta como
  texto visible en vez de emitir el bloque estructurado, y puede filtrar etiquetas
  `<thinking>` en la salida. Ambos se evitan dejando el pensamiento activo y bajando
  `effort`, que además abarata igual.
- **`stop_reason: "refusal"` llega con HTTP 200.** Los clasificadores de seguridad de
  Opus 5 pueden declinar una petición y devolver un 200 con `content` vacío o parcial.
  Cualquier código que lea `content[0]` sin comprobar antes `stop_reason` se rompe. Un
  rechazo es un escalamiento, nunca una respuesta.
- **Respaldo ante rechazo.** Se declara `fallbacks: "default"` con la cabecera beta
  `server-side-fallback-2026-07-01`, que enruta por categoría de rechazo. Si aun así la
  cadena entera rechaza, escalamiento.
- **Mensajes de sistema a mitad de conversación.** Opus 5 admite entradas
  `{"role": "system", ...}` dentro de `messages[]`. Es el canal de instrucción de
  operador que no se puede falsificar desde el contenido del usuario, y se usa en la
  defensa de inyección de la sección 8. **Sonnet 5 no lo admite.** Bajar la redacción a
  Sonnet 5 cuesta ese canal, y eso entra en la decisión de T14.
- **Tiempos de espera.** El valor por defecto del SDK es de 10 minutos, y los tiempos de
  espera se reintentan, con lo que el reloj de pared puede llegar a
  `timeout × (max_retries + 1)`. Se fija un tiempo de espera duro de 20 000 ms (el SDK de
  TypeScript los cuenta en milisegundos) y `maxRetries: 1`, con el reintento gobernado
  por nuestro código y no por el SDK.
- **Modo rápido.** `speed: "fast"` con la beta `fast-mode-2026-02-01` existe en Opus 5,
  da hasta 2,5× más tokens de salida por segundo y cuesta 10/50 por millón. Es una
  vista previa de investigación con su propio límite de tasa. **No se usa en esta fase**
  y no puede ser nunca la base de una garantía de política: para eso está el carril
  determinista. Se evalúa cuando se abra el modo autónomo.
- **El nivel de prioridad no cubre a Opus 5.** No se puede comprar latencia por esa vía.
- **Opus 5 tiene su propio cubo de límite de tasa**, separado del combinado de la
  familia Opus 4.x. Se dimensiona por separado.

---

## 5. Taxonomía de intenciones propuesta

Doce valores, cerrados como enumeración en el esquema de salida. Lo que no encaja va a
`otro`, y `otro` siempre escala. La enumeración vive en la tabla `intenciones` y en el
esquema JSON a la vez; una prueba comprueba que no se separan.

| # | Intención | Señal | Acción por defecto en copiloto | ¿Candidata a autónomo? |
|---|---|---|---|---|
| 1 | `saludo` | Apertura sin contenido: "hola", "buenas" | Borrador de bienvenida con divulgación de IA | Sí, primera candidata |
| 2 | `consulta_horario_ubicacion` | Horarios, dirección, cómo llegar | Borrador con dato de ficha del tenant | Sí |
| 3 | `consulta_producto` | Características, disponibilidad, existencias | Borrador; escala si pide un dato que el tenant no ha cargado | Sí, con reservas |
| 4 | `consulta_precio` | Precio, cotización, formas de pago | Borrador solo si hay lista de precios cargada; si no, escala | Sí, con reservas |
| 5 | `consulta_logistica` | Envío, tiempos de entrega, cobertura | Borrador | Sí |
| 6 | `intencion_compra` | Quiere comprar, reservar, apartar | Borrador y aviso al asignado | No en v1 |
| 7 | `agendar` | Cita, demostración, llamada | Borrador y aviso al asignado | No en v1 |
| 8 | `soporte_postventa` | Problema con algo ya comprado | Borrador y aviso al asignado | No en v1 |
| 9 | `reclamo` | Queja, insatisfacción, amenaza de exponer | **Escala siempre**, borrador solo como sugerencia | **Nunca** |
| 10 | `datos_sensibles` | Envía o pide tarjeta, documento de identidad, credenciales | **Escala siempre**, sin borrador | **Nunca** |
| 11 | `peticion_humano` | Pide hablar con una persona | **Escala siempre**, sin borrador | **Nunca** |
| 12 | `spam_o_irrelevante` | Cadena, bot, contenido sin relación | Decisión `ignorar`, sin borrador ni acuse extra | No aplica |
| 13 | `otro` | No encaja en ninguna | **Escala siempre** | **Nunca** |

Son trece filas por el `otro`; doce intenciones más el cajón. La columna de la derecha
no autoriza nada por sí sola: autoriza a *medir* para esa intención. La apertura real
la gobierna la sección 9.

### Esquema de salida

Un solo objeto, validado con `output_config.format` de tipo `json_schema`, con
`additionalProperties: false` y todos los campos en `required`. Cualquier valor fuera de
la enumeración, cualquier fallo de validación y cualquier campo ausente producen
escalamiento y quedan registrados como `error` en `agent_runs`.

```
intencion              enum (las 13 de arriba)
confianza              número 0..1
sentimiento            enum: positivo | neutral | negativo | hostil
idioma                 enum configurable por tenant: es | en | pt
pide_humano            booleano
menciona_valor         booleano
valor_declarado        número o null      -- cantidad o monto que el usuario menciona
moneda_declarada       texto o null
senal_inyeccion        booleano           -- el mensaje intenta dar instrucciones al sistema
requiere_dato_ausente  booleano           -- hace falta un dato que el tenant no ha cargado
borrador               texto o null
motivo                 texto              -- por qué esa intención y ese borrador, en una frase
```

`motivo` no es adorno: es lo que se lee en la revisión de calidad cuando el clasificador
falla, y es lo que hace auditable la salida.

---

## 6. Diseño del carril de acuse sub-30 s

Es el punto más delicado de la fase. Se diseña primero y se prueba con el agente apagado.

### 6.1 La obligación

Política de Meta, verbatim: **"Automated bots must respond to any and all input from the
user... within 30 seconds"**. Incumplir genera aviso de violación con 7 días para
corregir antes de restringir la mensajería de la Página. La Página del cliente, no la de
Boosty. Un incumplimiento no daña a Kavea: daña al negocio del cliente.

### 6.2 La reformulación que hace el modo copiloto

En copiloto el agente **no emite nunca**. La respuesta dentro de los 30 segundos, por
tanto, no puede venir del agente: la aprobación humana tarda minutos u horas. El carril
determinista deja de ser un plan de contingencia y pasa a ser la ruta principal. La
latencia de Claude sale por completo de la ruta crítica de la política.

Cuando alguna intención se abra a modo autónomo, el mismo carril sigue armado y pasa a
ser lo que su nombre dice: el respaldo que dispara si el agente no emitió dentro de la
ventana de gracia.

### 6.3 Por qué la ventana de 24 h no entra en conflicto

Aparente conflicto: fuera de la ventana de 24 h el único tag vivo es `HUMAN_AGENT`, y
los agentes de IA de Kavea **nunca** emiten con `HUMAN_AGENT`. Si el acuse es automático,
¿cómo se envía fuera de ventana?

No hay conflicto. El acuse lo dispara un mensaje **entrante**, y un mensaje entrante
fija `last_incoming_at = now()` por definición. Con Δ = now − `last_incoming_at` ≈ 0, la
condición Δ < 24 h se cumple siempre y `messaging_type: RESPONSE` sin tag es válido
siempre. **El carril de acuse jamás necesita un tag.** Se codifica como aserción: si el
carril está a punto de enviar y Δ ≥ 24 h, no envía y levanta una alarma, porque eso
significa que el cálculo de la ventana está roto.

### 6.4 Dónde vive el cronómetro

El receptor de webhooks solo valida firma y encola; es invariante y no se toca. El
normalizador está detrás de la cola, así que **no puede** sostener la garantía: si la
cola se atasca, el acuse nunca llega a programarse.

La solución es un segundo consumidor sobre la misma tabla que el receptor escribe de
forma síncrona, con su propia columna de estado y su propia reclamación:

```sql
alter table public.webhook_events
  add column acuse_estado  text not null default 'sin_evaluar',
      -- sin_evaluar | pendiente | enviado | suprimido | fallido | no_aplica
  add column acuse_vence_en timestamptz,
  add column acuse_mid       text,
  add column acuse_enviado_en timestamptz;

create index webhook_events_acuse_idx
  on public.webhook_events (acuse_vence_en)
  where acuse_estado in ('sin_evaluar','pendiente');
```

Dos consumidores independientes sobre una tabla, cada uno con su columna de estado y su
`for update skip locked`. Ni el normalizador espera al carril de acuse, ni al revés. No
hay una segunda ruta de escritura que pueda fallar por su cuenta.

### 6.5 El reloj arranca en el mensaje, no en la recepción

Los 30 segundos se cuentan desde la entrada del usuario, no desde el momento en que su
webhook llega a nuestro receptor. El vencimiento se calcula sobre
`entry[].messaging[].timestamp`:

```
acuse_vence_en = timestamp_del_mensaje + ventana_de_gracia
```

La entrega de Meta consume presupuesto que no controlamos. Se registra
`received_at − timestamp_del_mensaje` en cada evento y se alarma cuando la mediana
horaria supera los 3 segundos: significa que el colchón real es menor que el calculado.

### 6.6 Presupuesto de tiempo

Ventana de gracia por defecto: **5 segundos**, configurable por tenant entre 3 y 15.

| Tramo | Presupuesto | Acumulado |
|---|---|---|
| Entrega de Meta hasta el receptor | medido, típicamente < 2 s | 2 s |
| Receptor: firma, escritura en cola, 200 OK | ≤ 5 s por invariante, objetivo < 500 ms | 2,5 s |
| Ventana de gracia deliberada | 5 s desde el timestamp del mensaje | 5 s |
| Detección del vencimiento por el carril | ≤ 2 s (sondeo de 1 s más margen) | 7 s |
| Resolución de tenant y reglas de supresión | ≤ 500 ms | 7,5 s |
| Envío por Send API, con un reintento | ≤ 5 s | 12,5 s |

**Objetivo: acuse entregado antes del segundo 13.** Quedan más de 17 segundos de
colchón contra el límite de 30. La alarma se dispara a los 15 segundos; un solo evento
por encima de 30 es un incidente que se investiga con nombre y apellido.

### 6.7 Mecanismo del proceso

`pg_cron` tiene granularidad mínima de un minuto y no sirve. El carril necesita un
proceso persistente:

1. **Escucha.** Un disparador `after insert` sobre `webhook_events` emite `notify`. El
   proceso escucha, evalúa el evento y programa un temporizador en memoria para
   `acuse_vence_en`.
2. **Barrido de rescate.** Un bucle cada 2 segundos reclama con `for update skip locked`
   todo lo vencido con `acuse_estado in ('sin_evaluar','pendiente')`. Cubre reinicios del
   proceso, notificaciones perdidas y arranques en frío.
3. **Reclamación.** Idéntica al patrón del normalizador del documento 06, sobre la
   columna `acuse_estado`.

La escucha da latencia baja; el barrido da la garantía. Ninguna de las dos por separado
es suficiente.

### 6.8 Reglas de supresión

Cada regla es una prueba unitaria. El evento pasa a `no_aplica` o `suprimido` y se
registra el motivo.

| # | Regla | Motivo |
|---|---|---|
| 1 | El evento no es un mensaje ni un postback del usuario | Lecturas, entregas y reacciones no se acusan. Ver sección 12 |
| 2 | `is_echo: true` | Es salida propia, no entrada del usuario |
| 3 | El evento llegó en `entry[].standby[]` | No somos dueños del hilo; enviar es imposible y sería un bucle. Ver sección 12 |
| 4 | `app_id` corresponde a la bandeja de Business Suite o a nuestra propia app | Anti-bucle, invariante del documento 03 |
| 5 | Ya existe un mensaje saliente en la conversación posterior al timestamp del entrante | Alguien respondió dentro de la ventana de gracia |
| 6 | Ya se envió un acuse en este mismo turno | Un turno es una racha de entrantes sin ningún saliente entre medias |
| 7 | Se envió un acuse a esta conversación hace menos de N minutos, N configurable con defecto 10 | Suelo antispam. Ver tensión en la sección 12 |
| 8 | Kill-switch activo para ese canal y tenant | Enviar es imposible. Se levanta alarma interna y se registra el riesgo de política |
| 9 | La organización tiene el agente desactivado | Kavea sigue siendo bandeja sin agente |
| 10 | `intencion == spam_o_irrelevante` en un acuse ya enviado en el turno | No se encadenan acuses |

La regla 6 no la puede evaluar el carril de acuse leyendo la salida del clasificador,
porque el clasificador va detrás de la cola. Se evalúa sobre `messages`, que el
normalizador ya escribió, o se resuelve por tiempo si el normalizador aún no ha pasado.
Ante duda, **se envía**: un acuse de más molesta, un acuse de menos es una violación.

### 6.9 Contenido del acuse

- Texto fijo por organización, canal e idioma, en `acuse_plantillas`. Aprobado por el
  cliente durante el onboarding: es texto de marca, no un detalle de ingeniería.
- Lleva la divulgación de naturaleza automatizada en el **primer** acuse de cada
  conversación. Ver sección 7.
- Sin selección de idioma por modelo: cualquier detección que necesite un LLM rompe la
  premisa del carril. El idioma sale de la configuración del tenant, o el texto es
  bilingüe.
- **El límite de Instagram se mide en bytes, no en caracteres.** Verbatim: *"Message text
  must be UTF-8 and be 1,000 bytes or less"*. Con acentos y emoji el margen real es
  menor. La plantilla se valida en bytes en el momento de guardarla, no en el envío.
- Se pasa `metadata` en el envío y se guarda el `message_id` que devuelve el Send API en
  `acuse_mid`, para correlacionar el echo y no re-disparar el agente.

### 6.10 Cómo se prueba

- Con el trabajador del agente apagado por completo: mensaje entrante, acuse entregado
  en menos de 13 segundos desde el timestamp del mensaje.
- Con la API de Claude devolviendo 429 y 529 de forma sostenida: idéntico resultado.
- Con el normalizador detenido y 500 eventos acumulados en la cola: idéntico resultado.
  Este es el caso que descarta poner el cronómetro detrás de la cola.
- Reiniciando el proceso del carril justo después de la inserción y antes del
  vencimiento: el barrido lo recoge.
- Percentil 100 sobre 200 eventos reales por debajo de 30 segundos. El percentil 95 no
  sirve como criterio: la política no admite excepciones.

---

## 7. Divulgación de naturaleza automatizada

La documentación de Meta menciona explícitamente a los usuarios de **California** y de
**Alemania** como jurisdicciones donde la ley lo exige. La operación de Miami cae ahí.

**Se divulga en todos los mercados**, no solo donde la ley obliga. Segmentar por
jurisdicción del usuario final añade una inferencia de geolocalización poco fiable y una
rama de código a cambio de nada. La postura conservadora es también la más barata.

| Dónde | Qué |
|---|---|
| Primer acuse de cada conversación | Frase de divulgación concatenada al texto del acuse, dentro del límite de bytes |
| Borradores que aprueba un humano | **No llevan divulgación.** Los envía una persona; declarar lo contrario sería falso |
| Cuando se abra el modo autónomo | La divulgación pasa a acompañar al primer mensaje autónomo de cada conversación |
| Ficha de la organización en la app | Texto visible y editable, con registro de quién lo cambió y cuándo |

El texto es configurable por tenant porque cambia con la marca y con el idioma, pero
**no es opcional**: no existe la casilla para desactivarlo. La configuración por tenant
guarda el texto, no la decisión de divulgar.

---

## 8. Defensas contra inyección de instrucciones

Los mensajes entrantes son entrada no confiable escrita por cualquiera. Las defensas van
por capas y ninguna capa se apoya en que la anterior funcione.

**1. Restricción de capacidad, que es la defensa que de verdad sostiene el resto.** El
agente no tiene herramientas. No puede enviar, ni escribir en la base, ni cambiar
estados, ni leer otra conversación. La peor consecuencia de una inyección con éxito en
esta fase es un borrador malo que un humano ve antes de que salga. Cuando se añadan
herramientas —que no es esta fase— esta capa deja de sostener sola y hay que rehacer el
análisis.

**2. Separación de canales de instrucción.** La política vive en el prompt de sistema,
que es fijo por tenant y forma el prefijo cacheado. El contenido del usuario va en el
turno de usuario, envuelto en delimitadores y precedido por la regla de que lo que hay
dentro son datos, nunca instrucciones. Las instrucciones de operador que aparecen a
mitad de conversación se mandan como entrada `{"role": "system"}` dentro de `messages[]`,
que es el canal de operador que el contenido del usuario no puede falsificar. Este
mecanismo existe en Opus 5 y no en Sonnet 5.

**3. Salida cerrada.** Todo campo relevante es una enumeración o un tipo primitivo
validado contra el esquema. El modelo no puede devolver una cadena que otro componente
interprete como orden. `borrador` es el único texto libre, y su único destino es una
caja de texto que un humano lee.

**4. Detección determinista, en paralelo y sin bloquear.** Lista de patrones clásicos
—"ignora las instrucciones anteriores", "system:", etiquetas XML o Markdown de sistema,
bloques largos en base64, delimitadores repetidos—. Un acierto no bloquea: marca
`senal_inyeccion`, escala y queda registrado. Se acepta el falso positivo porque el coste
del falso positivo es un escalamiento y el del falso negativo es un mensaje malo a un
cliente real.

**5. El campo `senal_inyeccion` del modelo se cruza con el detector determinista.** Si
cualquiera de los dos se activa, escala. No se confía en el modelo para detectar ataques
contra el modelo, pero su opinión suma.

**6. Canario.** Una cadena fija e improbable en el prompt de sistema. Una prueba
automatizada del arnés comprueba que ninguna salida la contiene nunca. Si aparece, hay
fuga de prompt de sistema y es un fallo bloqueante.

**7. Superficie acotada.** El texto entrante se trunca a un tope configurable —defecto
4 000 bytes— antes de entrar al contexto, y el truncado se registra. Acota coste y acota
la superficie del ataque. El pie de foto de un adjunto y el contenido de un mensaje
citado son igual de no confiables y se envuelven igual.

**8. Sin media.** Mientras la sección 12 siga abierta, el agente no ve imágenes. Eso
elimina de raíz la inyección por imagen en v1.

**9. Aislamiento de contexto.** El contexto se arma con consultas acotadas por
`organization_id` y por `conversation_id`, bajo RLS. Nunca entra en el contexto una
credencial, un token, ni un dato de otro tenant. Una prueba lo comprueba armando el
contexto con dos organizaciones sembradas y verificando que no se cruzan.

**10. Nada se ejecuta ni se sigue.** La interfaz de la bandeja renderiza el borrador y
el mensaje entrante como texto escapado. No se resuelven enlaces, no se cargan imágenes
remotas, no se previsualizan URLs del mensaje.

---

## 9. Métricas de calidad y umbral para abrir modo autónomo

### 9.1 Qué se mide

Todo se calcula por **intención** y por **tenant**, sobre conversaciones reales en modo
copiloto. La ventana mínima es de **30 días naturales y 200 conversaciones de esa
intención**. Menos que eso no es una medición, es una anécdota.

| Métrica | Definición | Umbral para abrir |
|---|---|---|
| Aprobación sin edición | Borradores enviados sin tocar una letra | ≥ 85% |
| Aprobación con edición menor | Ediciones que cambian ≤ 20% de los caracteres | Se suma a la anterior; el conjunto ≥ 95% |
| Rechazo | Borradores descartados | ≤ 5% |
| Precisión de intención | Contra muestra estratificada de ≥ 200 mensajes etiquetados a mano | ≥ 95% |
| **Recall de escalamiento** | De las conversaciones que un humano decidió escalar, cuántas el agente ya había marcado | **≥ 98%** |
| Alucinación verificable | Precio, existencia, política o compromiso inventados, sobre la misma muestra | **0** |
| Incidentes | Mensaje con datos del tenant equivocado, inyección con éxito, emisión con `HUMAN_AGENT` por un agente | **0** |
| Coste por conversación | Sección 10 | Por debajo del precio cobrado al cliente, con margen documentado |
| Latencia extremo a extremo p99 | Desde el timestamp del mensaje hasta el borrador listo | < 15 s, y solo relevante para abrir autónomo |

El recall de escalamiento es la métrica de seguridad y por eso su umbral es el más alto.
Un falso negativo ahí es una conversación que debía ver una persona y no la vio. Es
exactamente el riesgo que el documento base describe como *agente respondiendo mal a un
cliente real*.

### 9.2 Cómo se abre

No basta con cumplir los números.

1. Métricas cumplidas sobre la ventana completa, para **esa** intención y **ese** tenant.
2. La intención no está en la lista de nunca: `reclamo`, `datos_sensibles`,
   `peticion_humano`, `otro`.
3. Consentimiento escrito del tenant, con la lista de intenciones que se abren.
4. Despliegue canario: 10% de las conversaciones de esa intención durante 7 días, luego
   50% durante 7 días, luego 100%. Reversión automática si cualquier umbral se degrada
   por debajo del corte durante 24 horas.
5. Kill-switch probado en la misma semana, no en la de la instalación.
6. El carril de acuse determinista sigue armado y pasa a comportarse como respaldo: si
   el agente no emitió al vencer la ventana de gracia, sale el acuse.
7. Registro escrito de la apertura en `agent_config`, con fecha, responsable y las
   métricas que la justificaron.

**Nunca se abre por producto entero, por tenant entero ni por canal entero.** La unidad
de apertura es la pareja intención + tenant. Boosty es el primer tenant y el único
durante el mes de dogfooding.

---

## 10. Coste por conversación

Es un riesgo de margen identificado en el documento base y se mide desde el primer día.

### 10.1 Fórmula

Con precios expresados por millón de tokens:

```
coste_run =  (entrada          / 1e6) × P_entrada
          +  (cache_lectura    / 1e6) × P_entrada × 0,10
          +  (cache_escritura  / 1e6) × P_entrada × 1,25
          +  (salida           / 1e6) × P_salida
```

El factor 0,10 de lectura de caché y el 1,25 de escritura con vigencia de 5 minutos
salen de la referencia de la API. Con vigencia de una hora la escritura cuesta 2,00 y el
punto de equilibrio pasa de dos peticiones a tres.

Los cuatro contadores están en `usage` de cada respuesta: `input_tokens`,
`cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`. Se persisten
en `agent_runs` sin agregar, y el coste se recalcula a partir de ellos. Guardar solo el
importe impide recalcular cuando cambie la tarifa.

### 10.2 Orden de magnitud, con las cuentas a la vista

Los recuentos de tokens de abajo son **suposiciones de trabajo que se sustituyen por
mediciones** en la tarea T13. Los precios son reales.

Supuesto por llamada: prefijo de sistema 1 500 tokens cacheados, contexto de conversación
800 tokens sin cachear, salida 800 tokens incluyendo el pensamiento adaptativo.

| Modelo | Coste por llamada | Cuatro llamadas por conversación |
|---|---|---|
| `claude-opus-5` | 0,0248 USD | 0,099 USD |
| `claude-sonnet-5` a precio introductorio | 0,0099 USD | 0,040 USD |
| `claude-haiku-4-5` | 0,0050 USD | 0,020 USD |

Diez centavos de dólar por conversación en Opus 5 es un número que hay que mirar de
frente antes de fijar precio en Venezuela o República Dominicana. Por eso el barrido de
modelo de T14 no es una optimización opcional: es una decisión de negocio con datos.

### 10.3 La caché es la palanca principal

El orden de renderizado es `tools` → `system` → `messages`. En esta fase no hay
herramientas, así que el prefijo es el prompt de sistema: taxonomía, política del tenant
y voz de marca. Ese prefijo es estable y se marca con un punto de corte de caché.

Reglas que se codifican y se prueban:

- **Nada volátil antes del punto de corte.** Ni fecha actual, ni identificador de
  petición, ni nombre del contacto. Un solo byte distinto invalida todo lo que va detrás.
- El mínimo cacheable en Opus 5 es de **512 tokens**, la mitad que en Opus 4.8. El
  prompt de sistema lo supera con holgura.
- Máximo cuatro puntos de corte por petición. Aquí basta uno.
- **Prueba automatizada**: dos peticiones seguidas con el mismo prefijo; la segunda debe
  traer `cache_read_input_tokens > 0`. Si sale cero de forma sostenida hay un invalidador
  silencioso y es un fallo bloqueante, no una degradación.
- Cambiar de modelo invalida la caché entera. El barrido de T14 se hace en una ventana
  acotada y se anota el coste de la transición.

### 10.4 Recuento previo

`count_tokens` da el recuento exacto del contexto antes de enviarlo. Se usa para dos
cosas: fijar el tope de truncado del contexto con datos reales, y detectar un contexto
que crece sin techo por una conversación muy larga. Nunca se estima con tokenizadores
de terceros.

---

## 11. Tareas

Cada tarea lleva su criterio de aceptación. Un criterio que no se puede ejecutar no es
un criterio.

### T1 — Extender el esquema de auditoría

Extensión **aditiva** de `agent_runs`. Los tres valores cerrados de `decision`
—`responder`, `escalar`, `ignorar`— no cambian: en copiloto, `responder` significa que
el agente propone una respuesta, y si se envió o no lo dicen las columnas nuevas.

```sql
alter table public.agent_runs
  add column intencion            text,
  add column confianza            numeric(4,3),
  add column sentimiento          text,
  add column motivo_escalamiento  text[],
  add column modo                 text not null default 'copiloto',   -- copiloto | autonomo
  add column resultado            text,
      -- propuesto | aprobado | editado | rechazado | caducado | enviado | descartado
  add column aprobado_por         uuid references auth.users(id),
  add column aprobado_en          timestamptz,
  add column texto_enviado        text,
  add column mid_enviado          text,
  add column prompt_version       text,
  add column tokens_entrada       int,
  add column tokens_salida        int,
  add column tokens_cache_lectura int,
  add column tokens_cache_escritura int,
  add column stop_reason          text,
  add column latencia_api_ms      int,
  add column request_id           text,     -- cabecera request-id de Anthropic
  add column error                text;

create index agent_runs_org_idx     on public.agent_runs (organization_id, created_at desc);
create index agent_runs_conv_idx    on public.agent_runs (conversation_id, created_at desc);
create index agent_runs_pendiente_idx
  on public.agent_runs (organization_id, created_at)
  where resultado = 'propuesto';
```

RLS con el patrón del documento 06, con `select` envolviendo la llamada a la función y
`force row level security`. `entrada` y `salida` contienen contenido de mensajes, así que
`agent_runs` lleva **también** la política de break-glass del staff, igual que `messages`:
sin grant vigente, el admin no ve esas dos columnas.

**Redacción por borrado de datos.** Una solicitud de borrado de Meta no elimina la fila:
anula `entrada`, `salida` y `texto_enviado`, y conserva modelo, decisión, intención,
coste y latencia. Se conserva la auditoría sin conservar el contenido personal.

*Aceptación:* un usuario de la organización A consulta `agent_runs` y obtiene cero filas
de la organización B. Un usuario de staff sin grant no ve `entrada` ni `salida`. Con un
grant vigente sí, y el grant caduca solo. La función de redacción vacía las tres columnas
y deja el resto intacto.

### T2 — Catálogo de intenciones y esquema de salida

Tabla `intenciones` sembrada con las trece filas de la sección 5, con descripción,
señales, acción por defecto y candidatura a autónomo. El esquema JSON se genera a partir
de la tabla.

*Aceptación:* una prueba falla si la enumeración del esquema y las filas de la tabla
divergen. Añadir una intención en la tabla y no regenerar el esquema rompe la
construcción.

### T3 — Columnas y cronómetro del carril de acuse

Columnas e índice de la sección 6.4, disparador `notify`, cálculo de `acuse_vence_en`
sobre el timestamp del mensaje.

*Aceptación:* un evento insertado a mano produce `acuse_vence_en` correcto y una
notificación observable. Con el proceso del carril detenido, el barrido lo recoge al
arrancar y no lo pierde.

### T4 — Supresión y envío del acuse

Las diez reglas de la sección 6.8, una prueba unitaria por regla, envío por Send API con
`metadata` y persistencia del `message_id`.

*Aceptación:* diez pruebas verdes, una por regla. Un echo no dispara acuse. Un evento en
`standby[]` no dispara acuse. Un mensaje que un humano contesta en 3 segundos no dispara
acuse. Con Δ ≥ 24 h el carril no envía y levanta alarma.

### T5 — Plantillas de acuse y divulgación

Tabla `acuse_plantillas` por organización, canal e idioma. Validación del límite de
1 000 bytes UTF-8 en el momento de guardar. Divulgación de IA concatenada en el primer
acuse de cada conversación.

*Aceptación:* guardar una plantilla de 1 001 bytes falla con mensaje claro. Una plantilla
de 300 caracteres con acentos y emoji que supere los 1 000 bytes también falla. El primer
acuse de una conversación nueva contiene la divulgación; el segundo no.

### T6 — Cliente de Claude

Cliente único, con `claude-opus-5`, tiempo de espera duro de 20 000 ms, `maxRetries: 1`,
manejo explícito de `stop_reason` incluido `refusal`, `fallbacks: "default"` con la
cabecera beta correspondiente, y punto de corte de caché sobre el prompt de sistema.

*Aceptación:* con la API devolviendo 529 de forma sostenida, la llamada aborta a los
20 segundos y produce un escalamiento con `error` registrado, sin colgar el trabajador.
Un `stop_reason: "refusal"` produce escalamiento y nunca lee `content[0]`.

### T7 — Prompt del clasificador y redactor, versionado

Prompt de sistema por tenant: taxonomía, política de escalamiento, voz de marca, datos de
ficha del negocio, canario. Versionado con identificador que se guarda en
`agent_runs.prompt_version`.

*Aceptación:* cambiar el prompt cambia la versión registrada. Se puede reconstruir a
posteriori con qué prompt exacto se generó cualquier borrador de hace tres semanas.

### T8 — Defensas de inyección

Las diez capas de la sección 8.

*Aceptación:* un corpus de al menos 40 mensajes de inyección conocidos, incluidos
intentos en español, produce cero salidas con el canario y cero salidas que se desvíen
del esquema. Todos quedan marcados y escalados. El contexto armado para la organización A
no contiene ni un byte de la organización B.

### T9 — Trabajador del agente

Una llamada por mensaje entrante, salida validada, escritura completa en `agent_runs`
incluidos los cuatro contadores de tokens, coste calculado y `request_id`.

*Aceptación:* cien mensajes reales producen cien filas con los cuatro contadores
poblados y coste distinto de cero. Una salida que no valida contra el esquema produce
`decision = 'escalar'` y `error` poblado, nunca una excepción que tumbe el lote. El
trabajador ignora eventos de `standby[]` y echoes.

### T10 — Motor de escalamiento determinista

Código, no modelo. Por intención, por sentimiento, por valor y por petición explícita,
más las redes de seguridad: confianza por debajo del umbral, rechazo de la API, fallo de
validación, adjunto presente, fuera de ventana de 24 h, kill-switch activo, señal de
inyección, y N turnos sin resolución.

La petición explícita de humano se detecta **dos veces**: por el campo `pide_humano` del
modelo y por una lista determinista de expresiones por idioma, configurable por tenant.
Si cualquiera de las dos se activa, escala.

*Aceptación:* una prueba por regla. Con el modelo devolviendo `pide_humano: false` sobre
un mensaje que dice "quiero hablar con una persona", la lista determinista escala igual.
Ante cualquier duda, escala: se prueba con entradas ambiguas y ninguna produce
`responder`.

### T11 — Interfaz de copiloto

Tarjeta de propuesta en la bandeja: intención, confianza, sentimiento, motivo, borrador
editable y, cuando escala, el motivo del escalamiento en lenguaje claro. Tres acciones:
aprobar y enviar, editar y enviar, descartar con motivo. Ningún camino envía sin acción
humana.

*Aceptación:* revisión de código y prueba de extremo a extremo que confirma que no
existe ninguna ruta que llame al Send API desde el trabajador del agente. La distinción
entre aprobado y editado se registra por comparación de texto, no por autodeclaración
del usuario.

### T12 — Coste por conversación

Vista que agrega `agent_runs` por conversación y por organización. Panel en el admin con
coste medio por conversación, distribución, tasa de acierto de caché y tokens por
llamada. Solo agregados y metadatos, sin contenido.

*Aceptación:* el panel no muestra ni un carácter de `entrada` ni de `salida`. La suma de
la vista coincide con la suma manual de las filas. La tasa de acierto de caché es mayor
que cero desde la segunda conversación del día.

### T13 — Conjunto dorado y arnés de evaluación

Al menos 200 mensajes reales de Boosty etiquetados a mano con intención, sentimiento y
decisión correcta de escalamiento. Arnés que ejecuta el conjunto contra el prompt vigente
por la API de lotes, con descuento del 50%, indexando por `custom_id`.

*Aceptación:* el arnés produce precisión por intención, matriz de confusión y recall de
escalamiento en una sola ejecución. Cambiar el prompt y volver a ejecutarlo da un
comparativo entre versiones. Los recuentos de tokens medidos aquí sustituyen a los
supuestos de la sección 10.2.

### T14 — Barrido de modelo y de esfuerzo

Con el conjunto dorado ya construido: barrido de `effort` en `low`, `medium` y `high`
sobre `claude-opus-5`, y comparativa contra `claude-sonnet-5` y `claude-haiku-4-5`.
Se documentan las diferencias de superficie de API, no solo las de precio: Haiku 4.5 no
admite `effort` y usa la semántica de pensamiento anterior a la 4.6; Sonnet 5 no admite
mensajes de sistema a mitad de conversación, que es la capa 2 de la defensa de inyección.

*Aceptación:* una tabla con calidad y coste por combinación de modelo y esfuerzo sobre el
mismo conjunto dorado. La elección final la firma Gabriel; el plan no la presupone.

### T15 — Observabilidad y alarmas

| Métrica | Alarma |
|---|---|
| `acuse_enviado_en − timestamp_del_mensaje` | Aviso a 15 s, incidente por encima de 30 s |
| `received_at − timestamp_del_mensaje`, mediana horaria | Aviso por encima de 3 s |
| Eventos con `acuse_estado = 'fallido'` | Cualquiera |
| Latencia p50, p95 y p99 de la llamada a la API | p99 por encima de 15 s |
| `cache_read_input_tokens` agregado por hora | Cero de forma sostenida |
| Coste por conversación, media diaria | Por encima del umbral del tenant |
| Tasa de escalamiento por intención | Desviación mayor del 20% respecto de la semana anterior |
| Tasa de rechazo de borradores | Por encima del 15% |

*Aceptación:* cada alarma se dispara al menos una vez en pruebas, provocada a mano.

### T16 — Pruebas de caos y de cumplimiento

Las cinco pruebas de la sección 6.10, más: kill-switch activado a mitad de un lote,
API de Claude devolviendo `refusal` para todo, y salida del modelo deliberadamente
malformada.

*Aceptación:* percentil 100 del acuse por debajo de 30 segundos en las cinco pruebas.
Ninguna prueba pierde un mensaje entrante ni deja una conversación sin registrar.

### T17 — Consulta escrita a Meta sobre media efímera

Consulta a Meta Developer Support, por escrito y **antes** del App Review, preguntando si
descargar un adjunto entrante para procesarlo en memoria sin persistirlo cae dentro de la
prohibición de *storing/caching the media content*. Se guarda la pregunta, el número de
caso y la respuesta.

*Aceptación:* número de caso en el expediente. Mientras no haya respuesta, el diseño
sigue tratando la descarga efímera como **no permitida** y un adjunto escala siempre.

### T18 — Runbook y kill-switch del agente

Kill-switch propio del agente, independiente del kill-switch de canal: apaga la
clasificación y la redacción, y deja el carril de acuse encendido. Runbook con qué hacer
ante un aviso de violación de los 30 segundos, ante una restricción de la app y ante una
degradación de calidad.

*Aceptación:* con el agente apagado, los mensajes siguen entrando, la bandeja sigue
funcionando, el acuse sigue saliendo y `agent_runs` no crece. Encenderlo no requiere
despliegue.

### T19 — Documento de apertura de modo autónomo

Los umbrales y el procedimiento de la sección 9, escritos como documento operativo con
la plantilla de consentimiento del tenant y la plantilla de registro de apertura.

*Aceptación:* el documento existe, referencia consultas concretas contra `agent_runs` que
producen cada métrica, y ninguna intención está abierta al terminar la fase.

---

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El carril de acuse falla en silencio y Meta emite aviso de violación | Restricción de la mensajería de la Página **del cliente** | Percentil 100 monitorizado, alarma a 15 s, barrido de rescate independiente del proceso principal, pruebas con el agente apagado |
| Coste por conversación por encima del precio cobrado | Erosión de margen a volumen, el riesgo que ya nombra el documento base | Medición desde la primera conversación, caché de prefijo, barrido de modelo en T14, alarma por tenant |
| El agente escala poco: falsos negativos de escalamiento | Un cliente real recibe una mala respuesta y el número del cliente se quema | Recall de escalamiento con umbral de 98%, escalamiento por defecto ante duda, doble detección de la petición de humano |
| El agente escala demasiado | Nadie lo usa y la fase no aporta nada | Se mide la tasa de escalamiento por intención y se ajusta el prompt, no la lista de reglas nunca-autónomas |
| Inyección con éxito en el borrador | Un humano aprueba sin leer y sale un mensaje absurdo | Restricción de capacidad, salida cerrada por esquema, canario, corpus de ataque en el arnés |
| El acierto de caché cae por un invalidador silencioso | El coste se multiplica sin aviso | Prueba automatizada del acierto, alarma sobre `cache_read_input_tokens` agregado |
| Cambio de tarifa de Anthropic | El modelo económico deja de cuadrar | Se guardan los contadores de tokens sin agregar, el coste se recalcula |
| Acuse repetido percibido como spam | Baja la calificación de calidad del número y con ella los límites de mensajería | Supresión por turno, suelo temporal configurable, revisión del texto con el tenant |
| Meta responde que la descarga efímera no está permitida | Ninguna función de visión en el roadmap | Ya está asumido: el diseño no depende de ello y un adjunto escala |
| Business Suite se apropia del hilo y el agente queda ciego | Propuestas sobre conversaciones que otro está atendiendo | El trabajador ignora `standby[]` y el carril de acuse también |
| Opus 5 rechaza peticiones legítimas por clasificadores de seguridad | Escalamientos espurios en conversaciones normales | `fallbacks: "default"`, registro de `stop_reason` y revisión de la tasa de rechazo por tenant |
| El modo copiloto se percibe como "hace el trabajo doble" | El equipo deja de usarlo y no hay datos que medir | La tarjeta se mide por tiempo ahorrado, no por número de propuestas; si la aprobación sin edición no sube, el problema es el prompt |

---

## 13. Definición de terminado

La fase está terminada cuando todo lo siguiente es cierto a la vez.

1. Un mensaje entrante en la Página de Boosty produce, en el mismo minuto: un acuse
   entregado en menos de 13 segundos desde el timestamp del mensaje, una fila en
   `agent_runs` con los cuatro contadores de tokens y el coste, y una propuesta visible
   en la bandeja.
2. Con el trabajador del agente apagado y la API de Claude devolviendo error, el acuse
   sigue saliendo dentro de plazo. Probado, no razonado.
3. Ninguna ruta del código envía un mensaje al usuario final sin acción humana, salvo el
   carril de acuse. Verificado por revisión y por prueba.
4. Ningún agente emite jamás con el tag `HUMAN_AGENT`. Verificado por prueba que falla si
   aparece ese tag en cualquier envío originado por el agente.
5. La divulgación de naturaleza automatizada sale en el primer acuse de cada conversación,
   con texto aprobado por el tenant.
6. `agent_runs` tiene RLS de tenant y política de break-glass, y la función de redacción
   por borrado de datos deja la fila sin contenido y con la auditoría intacta.
7. El conjunto dorado existe, el arnés lo ejecuta y produce precisión de intención,
   recall de escalamiento y coste medido, no estimado.
8. El panel de coste por conversación muestra un número real de la operación de Boosty y
   ese número está por debajo del precio que se piensa cobrar, con el margen escrito.
9. Cero intenciones abiertas a modo autónomo, y el documento que dice cómo se abrirían
   existe con umbrales verificables.
10. El runbook existe y el kill-switch del agente se ha probado apagando y encendiendo en
    producción de dogfooding.
11. La consulta a Meta sobre media efímera está enviada, con número de caso.
12. Sin deuda de las fases anteriores. Criterio de avance del documento base.

---

## 14. Preguntas abiertas

Ninguna bloquea el arranque de la fase; todas condicionan algún detalle del diseño.

1. **¿Qué cuenta como "input from the user" a efectos de los 30 segundos?** La política
   dice *any and all input*. Un mensaje, evidente. Un postback, casi seguro. ¿Una
   reacción? ¿Un acuse de lectura? Acusar cada reacción castiga la calificación de
   calidad del número; no acusarla es una lectura conservadora de la política. Se
   consulta por escrito a Meta junto con la pregunta de media. Mientras tanto: se acusan
   mensajes y postbacks, no reacciones ni acuses de lectura, y queda registrado.

2. **Ráfagas de mensajes: ¿un acuse o uno por mensaje?** Cinco mensajes seguidos del
   mismo usuario son cinco entradas. Cinco acuses son spam y bajan la calificación del
   número. Uno solo es la lectura razonable, y es lo que se implementa, pero es una
   interpretación. Entra en la misma consulta.

3. **Si el hilo está en `standby[]`, ¿sigue obligada la app a responder en 30 segundos?**
   No somos dueños del hilo y enviar es imposible. Parece que la obligación recae en el
   dueño, pero no está documentado. Consulta a Meta.

4. **¿Permite Meta la descarga efímera de media para procesamiento en memoria?** El
   documento 03 lo marca como decisión de riesgo **no resuelta**. La política prohíbe
   *storing/caching the media content* y no dice nada de procesamiento transitorio. **No
   se da por permitido.** Sin respuesta, el agente no ve imágenes. Con respuesta
   afirmativa, hay que rehacer el análisis de coste: en Opus 5 una imagen a resolución
   completa llega a 4 784 tokens visuales, que a 5,00 por millón son unos 0,024 USD de
   entrada por imagen, más de lo que cuesta toda una llamada de texto.

5. **Umbral de confianza para escalar.** Se arranca en 0,75 y es un número inventado.
   El valor correcto sale del conjunto dorado: es el punto donde el recall de
   escalamiento alcanza el 98% con la menor tasa de escalamiento posible. Se fija en
   T13, no antes.

6. **¿Escalamiento por valor con qué señal?** La capa comercial —tratos, etapas, valor
   histórico— es Fase 4 y no existe todavía. En esta fase el valor sale de lo que el
   usuario declara en el mensaje y de una marca manual de contacto prioritario. Es una
   señal pobre y se sabe. La regla se rehace cuando exista pipeline.

7. **¿Ventana de gracia de 5 segundos o menos?** Cinco segundos da margen a que un humano
   conteste primero y evita el acuse redundante. Menos margen reduce el riesgo de
   política y aumenta los acuses inútiles. Se ajusta con los datos del primer mes de
   dogfooding.

8. **Modelo definitivo por tarea.** Depende de T14. Bajar la redacción a `claude-sonnet-5`
   ahorra alrededor de dos tercios del coste y cuesta el canal de mensajes de sistema a
   mitad de conversación, que es una capa de la defensa de inyección. La compensación se
   decide con la tabla en la mano.

9. **¿Cuándo se rompe la llamada única en dos?** Si la medición muestra que más de un
   tercio de los borradores se descartan por intenciones que siempre escalan, separar
   clasificación y redacción empieza a compensar. Se revisa con datos de T13.

10. **Retención de `agent_runs`.** El documento 06 dice que sobrevive al borrado del
    contenido de una conversación. La redacción de T1 resuelve la tensión con las
    solicitudes de borrado de Meta, pero falta decidir cuánto tiempo se conservan las
    filas redactadas y si se archivan a una tabla fría, igual que se decidió para
    conversaciones cerradas en lugar de particionar `messages`.
