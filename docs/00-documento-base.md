# Kavea — Documento base

**Estado:** borrador fundacional v0.1
**Responsable:** Gabriel Montiel Toro — Boosty Digital
**Última actualización:** 1 de agosto de 2026

Este documento es la base del proyecto. Sirve para tres cosas: fijar la identidad de marca, definir qué se construye y qué no, y dejar por escrito las decisiones de arquitectura y los riesgos antes de escribir código. Es también el contexto que se le entrega a los agentes de desarrollo.

---

## 1. El nombre

**Kavea.**

Viene de *cavea*, latín para "recinto": la grada semicircular y escalonada de los teatros y anfiteatros romanos, tallada en forma cóncava alrededor de la orquesta. El nombre deriva de *cavus* — hueco, excavado — porque los primeros teatros no eran edificios exentos sino que se construían dentro de las laderas.

Lo importante no es la forma. Es la función: Vitruvio, en *De Architectura*, codificó las proporciones geométricas de la cavea específicamente para optimizar las líneas de visión y la acústica. La cavea es una pieza de ingeniería cuyo único propósito es que cada voz llegue a todos y nada se pierda.

### La analogía

> La IA es el actor en escena. Cualquiera puede contratar un buen actor.
> Lo que decide si el público oye o no es la arquitectura.
> Kavea es la arquitectura.

Esto es la tesis de "usar vs. operar IA" traducida a una imagen. Usar IA es tener un buen actor: un prompt, una respuesta, una conversación a la vez. Operar IA es construir la cavea: la estructura donde todos los canales convergen, donde nada se cae, donde el sistema trabaja solo.

### Línea de posicionamiento

**Kavea, de *cavea*: la grada del teatro romano, diseñada para que ninguna voz se pierda.**

Variantes cortas para producto:

- Todas tus conversaciones convergen en un punto.
- Nada se pierde. Todo llega al centro.
- Donde tus canales se escuchan.

### Nomenclatura interna

Los romanos ya nombraron las partes. Se puede usar para módulos, con criterio comercial:

| Término | Significado original | Uso propuesto |
|---|---|---|
| **Orchestra** | El espacio central, frente al escenario | La bandeja unificada: donde ocurre la conversación |
| **Cunei** | Las cuñas que dividen las gradas en sectores | Segmentación y ruteo de conversaciones |
| **Cavea** | El conjunto de la estructura | El producto completo |

No usar *vomitoria* (los accesos), aunque sea el término correcto. No sobrevende: si la nomenclatura latina empieza a estorbar la comprensión, se abandona. La analogía es un activo de contenido, no una camisa de fuerza para la UI.

### Flancos conocidos del nombre

Tres, y conviene tenerlos resueltos antes de que los saque un cliente o un comentario:

1. **El nombre no se explica solo.** Nadie sabe qué es una cavea. Hay que contarlo cada vez hasta que se pegue. Con el volumen de contenido de GMT es factible, pero es trabajo real y recurrente, no un atajo.

2. **"Kavea" es jerga de kVA.** En el mundo eléctrico hispano, los kilovoltiamperios se pronuncian coloquialmente "kaveas". Parte de la red de Gabriel viene de ingeniería industrial y lo va a leer así. No es grave; hay que anticipar el comentario.

3. **La cavea estaba dividida por clase social.** La *ima cavea*, la más cercana a la arena, se reservaba a senadores y magistrados; la *media cavea* era para el público general, mayormente hombres; la *summa cavea*, la más alta, quedaba para mujeres y niños. Alguien lo va a sacar. La respuesta preparada: los romanos usaron la arquitectura para separar; Kavea la usa para que todos lleguen al mismo lugar. Es un post, no un problema.

### Estado de marca y dominios

Investigación realizada el 1 de agosto de 2026.

**Conflictos de marca:** ninguno en software. Lo único registrado con ese nombre fue Kavea Instalaciones Eléctricas de Galicia SL, constituida en 1991 en Culleredo, A Coruña, extinguida judicialmente en 2015 al concluir su liquidación concursal. Otra clase, otro continente, entidad muerta.

**Dominios:**

| Dominio | Estado | Acción |
|---|---|---|
| `kavea.ai` | Sin DNS — probable disponible | **Registrar ya** |
| `kavea.app` | Sin DNS — probable disponible | **Registrar ya** |
| `kavea.co`, `.io`, `.dev`, `.chat` | Sin DNS — probables disponibles | Defensivos, opcional |
| `kavea.com.ve`, `kavea.do`, `kavea.com.co` | Sin DNS — probables disponibles | Registrar si hay operación local |
| `kavea.com` | Registrado | Evaluar adquisición más adelante |
| `kavea.es` | Registrado (era de la gallega extinguida) | Ignorar |
| `kavea.mx`, `kavea.com.mx` | Registrados, sirven 404 | Sin negocio activo, pero **el dominio no está libre**. Si se necesita presencia .mx habrá que negociarlo o usar `kavea.ai` en México |

> **Nota de método:** la verificación se hizo por resolución DNS. Que un dominio resuelva confirma que está registrado; que no resuelva es buena señal pero no prueba disponibilidad. Confirmar en el registrador antes de dar nada por hecho. El 404 de `kavea.mx` confirma que no hay competidor operando, no que el dominio esté libre.

**Pendiente antes de invertir en identidad visual:**

- [ ] Registrar `kavea.ai` y `kavea.app`
- [ ] Handles: Instagram, LinkedIn, X, GitHub org
- [ ] Búsqueda de marca en SAPI (Venezuela)
- [ ] Búsqueda de marca en ONAPI (República Dominicana)
- [ ] Búsqueda de marca en IMPI (México)
- [ ] Búsqueda USPTO clases 9 y 42 (si Miami entra en el plan)
- [ ] Decidir titularidad: ¿Boosty Digital o entidad propia? Define si el producto se puede vender por separado después

---

## 2. Qué es Kavea

**Kavea es un centro de operaciones conversacionales con agentes de IA.**

Recibe todas las conversaciones que llegan por Instagram, Facebook Messenger y WhatsApp, las unifica en una sola bandeja, y opera sobre ellas con agentes que clasifican, responden, dan seguimiento y escalan a un humano cuando corresponde.

### Qué no es

**No es un CRM.** Un CRM es un archivador de contactos con un pipeline encima. Nombrarlo así lo mete a competir con Kommo, HubSpot y Zoho en su terreno, con su lógica de precio por usuario y su expectativa de features. Kavea se posiciona como categoría distinta: donde el CRM guarda, Kavea opera.

> **Aclaración del 2 de agosto de 2026, porque esta frase se leyó como alcance y no lo es.** Lo que se descarta es el POSICIONAMIENTO, no la funcionalidad. Kavea sí tiene embudo, etapas, campos propios y contactos unificados: están en la «Fase 4 — Comercial» de la §9 de este mismo documento desde el primer día, y la §"Contexto de origen" dice literalmente que se replica lo que se usa. El embudo se usa todos los días en Boosty.
>
> Lo que de verdad queda fuera: informes de previsión, cuotas por vendedor, puntuación automática de oportunidades y vistas de tabla tipo hoja de cálculo. Y una diferencia de diseño que sí separa a Kavea de Kommo: **el estado de atención y la etapa comercial son dos ejes distintos y ninguna acción sobre uno toca el otro.** Kommo los mezcla, y por eso o el embudo miente sobre el negocio o la bandeja miente sobre el trabajo pendiente. Ver `docs/fases/03c-fase-embudos.md` §1.

**No es un chatbot.** Un chatbot responde. Kavea atiende: entiende el contexto de la conversación, decide si responde o escala, deja registro y mueve el estado comercial.

**No es una herramienta de marketing.** No manda campañas masivas como propuesta central. El envío proactivo existe como capacidad, no como eje.

### Contexto de origen

Nace para reemplazar Kommo CRM en la operación propia y en la de clientes de Boosty. Eso define el estándar mínimo de paridad, pero **no perseguir paridad total con Kommo es una decisión explícita**: Kommo lleva años acumulando features y replicarlas todas es una trampa de alcance. Se replica lo que se usa, se descarta lo demás, y se apuesta la diferencia en la capa de agentes.

---

## 3. El problema

Las empresas que venden por conversación en Latinoamérica tienen el mismo cuadro:

- Los mensajes entran por tres o cuatro canales distintos y cada canal vive en su propia app.
- Nadie sabe cuántas conversaciones se quedaron sin responder.
- El seguimiento depende de que un humano se acuerde.
- El histórico está repartido entre el celular de un vendedor, un Excel y la memoria de alguien.
- Cuando contratan un SaaS genérico, pagan por asiento y por features que no usan, y siguen operando a mano dentro de la herramienta.

La IA no resuelve esto contestando mejor. Lo resuelve cuando está dentro del sistema, con acceso al contexto, con reglas de escalamiento y con registro verificable. Esa es la diferencia entre usar y operar.

---

## 4. Alcance v1

### Canales

| Canal | API | Prioridad |
|---|---|---|
| WhatsApp | WhatsApp Cloud API (Meta) | 1 — es el canal dominante en LATAM |
| Instagram | Instagram Messaging API (Meta) | 2 |
| Facebook Messenger | Messenger Platform (Meta) | 3 |
| Formulario web | Endpoint propio | 4 — trivial, entra gratis |

### Capacidades núcleo

**Ingesta**
- Webhooks de Meta con verificación de firma
- Normalización a un modelo de mensaje único, independiente del canal
- Idempotencia: el mismo mensaje puede llegar varias veces y debe procesarse una sola
- Descarga y persistencia de media antes de que expire en los servidores de Meta

**Bandeja**
- Vista unificada de conversaciones, en tiempo real
- Asignación a agente humano
- Estados: nueva, en curso, esperando, cerrada
- Búsqueda por contacto, contenido y etiqueta

**Agentes**
- Clasificación de intención al entrar el mensaje
- Respuesta automática con contexto de la conversación y del contacto
- Reglas de escalamiento a humano (por intención, por sentimiento, por valor, por petición explícita)
- Registro de qué decidió el agente y por qué

**Comercial**
- Contacto unificado: una persona con varios canales es un solo contacto
- Etapas de pipeline configurables
- Notas y campos personalizados

**Envío proactivo**
- Plantillas de WhatsApp aprobadas
- Envío individual y por segmento
- Control de ventana de servicio

### Fuera de alcance en v1

Llamadas de voz. Email. Telegram. Facturación. Firma electrónica. Reportería avanzada. Marketplace de integraciones. Todo eso puede venir después; meterlo en v1 mata el proyecto.

---

## 5. Arquitectura propuesta

### Stack

| Capa | Tecnología | Nota |
|---|---|---|
| Frontend | Next.js (App Router) | Stack estándar de la casa |
| Base de datos | Supabase / Postgres | RLS activo desde el día uno |
| Realtime | Supabase Realtime | Para la bandeja en vivo |
| Auth | Supabase Auth | Multi-tenant por organización |
| Webhooks | **Supabase Edge Functions** | Deben responder rápido y siempre 200 |
| Cola | **Tabla en Postgres**, con Netlify Blobs de amortiguador | Empezar simple |
| Media | ~~Cloudflare R2~~ → **Supabase Storage** | Ver enmienda abajo |
| IA | Claude API | Clasificación, redacción, decisión de escalamiento |
| Deploy | **Netlify** | Web pública y aplicación |

> **Enmienda del 2 de agosto de 2026.** El stack se cierra en **dos proveedores: Supabase
> para todo el backend y Netlify para todo el frontend.** Cloudflare sale por completo.
>
> Eso contradice la nota original de esta tabla, *"no guardar archivos en Supabase"*, que
> buscaba evitar el coste de egreso. Es un problema de escala, no de v1: la media saliente
> son los adjuntos que manda un agente humano, un goteo durante el dogfooding. Queda como
> decisión a revisar, con el egreso medido desde el principio para saber cuándo deja de
> compensar.
>
> Sin cambio: **la media entrante de Meta no se almacena nunca, solo su URL.** Es invariante
> del `03` y almacenarla es causa documentada de rechazo del App Review.
>
> El detalle y el riesgo aceptado están en `06-arquitectura-plataforma.md` §1.1.

### Componentes

```
Meta (WhatsApp / IG / Messenger)
        │  webhook
        ▼
  Receptor (edge)  ──► responde 200 inmediato
        │
        ▼
   Cola de eventos
        │
        ▼
  Normalizador ──► mensaje canónico ──► Postgres
        │
        ▼
  Orquestador de agentes (Claude API)
        │
        ├──► responde por el canal de origen
        └──► escala ──► Orchestra (bandeja humana)
```

### Principio de diseño

El receptor de webhooks **no hace trabajo**. Recibe, valida firma, encola, devuelve 200. Todo lo demás pasa asíncrono. Meta reintenta agresivamente cuando no recibe 200 a tiempo, y una función lenta se convierte en una tormenta de duplicados.

---

## 6. Modelo de datos inicial

Tablas mínimas. Todas con `organization_id` y RLS.

| Tabla | Propósito | Notas |
|---|---|---|
| `organizations` | Tenant | Raíz de todo el aislamiento |
| `channels` | Cada canal conectado | Guarda credenciales cifradas, WABA id, page id |
| `contacts` | Persona | Unificada, no por canal |
| `contact_identities` | Identidad por canal | `contact_id` + `channel` + `external_id` |
| `conversations` | Hilo | Estado, asignado a, canal, ventana de servicio |
| `messages` | Mensaje individual | `external_id` con índice único para idempotencia |
| `media` | Archivos | Puntero a R2, nunca el binario |
| `agent_runs` | Cada decisión de un agente | Entrada, salida, modelo, costo, latencia |
| `templates` | Plantillas de WhatsApp | Estado de aprobación en Meta |
| `pipelines` / `stages` / `deals` | Capa comercial | Puede esperar a v1.1 |

**Decisiones a tomar temprano:**

- `messages` crece sin techo. Definir estrategia de particionado o archivado antes de que sea un problema, no después.
- `agent_runs` es el registro de auditoría. Es lo que permite decir "el sistema decidió esto por esto". No es opcional; es lo que diferencia operar de improvisar.
- La unificación de contactos entre canales es un problema real: el mismo humano en WhatsApp e Instagram no trae un identificador común. Necesita reglas de matching (teléfono, email, confirmación manual) y una decisión sobre qué hacer con los falsos positivos.

---

## 7. Meta: lo que hay que resolver antes de escribir código

Esta es la parte que hunde proyectos como este, y es puro trámite. Va primero.

### Requisitos

- [ ] Cuenta de Meta Business con **verificación de negocio** completada (requiere documentos legales de la empresa)
- [ ] App de Meta creada y configurada
- [ ] **App Review** aprobado para los permisos necesarios: mensajería de WhatsApp, gestión de WhatsApp, mensajes de Instagram, mensajería de páginas
- [ ] Número de teléfono registrado en la WABA
- [ ] **Display name aprobado** — este es el paso donde más gente se traba. El nombre visible debe ser coherente con el negocio verificado. Si "Kavea" no coincide con la razón social ni con una marca registrada, se atasca
- [ ] Cuenta de Instagram profesional vinculada a una página de Facebook, con acceso a mensajes habilitado
- [ ] Endpoint de webhook público con HTTPS y verificación de firma

### Restricciones operativas que condicionan el producto

**Ventana de servicio de 24 horas.** Fuera de esa ventana solo se pueden enviar plantillas aprobadas. Esto no es un detalle: define cómo se diseñan los seguimientos, cuándo puede actuar un agente, y qué pasa si el sistema responde tarde. La arquitectura tiene que saber en todo momento si la ventana está abierta.

**Plantillas.** Requieren aprobación previa de Meta y pueden ser rechazadas. Hay que gestionar su ciclo de vida dentro del producto.

**Límites de mensajería.** Meta asigna tiers de volumen que escalan según calidad y uso. Una cuenta nueva empieza limitada.

**Calidad del número.** Si los usuarios bloquean o reportan, la calificación baja y con ella los límites. Un agente mal calibrado puede quemar el número de un cliente.

### Costos: verificar antes de modelar

Meta ha cambiado su modelo de precios de WhatsApp más de una vez en los últimos años. **No modelar costos con cifras de memoria.** Antes de fijar precio al cliente:

1. Consultar la tabla de tarifas vigente en la documentación oficial de Meta, por país (Venezuela, República Dominicana, México y Estados Unidos tienen tarifas distintas).
2. Confirmar qué categorías de mensaje se cobran y cuáles no.
3. Modelar el costo por conversación con volúmenes reales de un cliente existente, no estimados.

### El costo oculto más grande: multi-tenant

Si Kavea va a operar los WhatsApp de **clientes de Boosty**, no solo el propio, hay una decisión de fondo que cambia la arquitectura, el modelo de negocio y el papeleo:

- **Opción A — cada cliente con su propia WABA.** El cliente hace su verificación, es dueño de su número, Kavea se conecta con permisos delegados. Menos fricción legal para Boosty, más fricción de onboarding para cada cliente.
- **Opción B — Boosty como Tech Provider / Solution Partner de Meta.** Permite onboarding embebido y gestionar cuentas de clientes bajo el paraguas de Boosty. Requiere calificar ante Meta y asumir responsabilidades de proveedor.
- **Opción C — apoyarse en un BSP existente.** Más rápido de arrancar, pero se paga margen y se hereda dependencia de un tercero.

**Esta decisión se toma ahora, no después.** Cambiarla con clientes en producción significa migrar números, y migrar un número de WhatsApp con historial es doloroso.

---

## 8. Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Trámite de Meta más lento de lo previsto | Bloquea todo el proyecto | Arrancar el papeleo antes que el código |
| Modelo multi-tenant mal elegido | Migración de números en producción | Decidir en fase 0, documentar |
| Costo de Claude API por conversación | Erosiona margen a volumen | Medir costo real por conversación desde el primer día; `agent_runs` guarda el costo |
| Crecimiento de `messages` | Costo de Supabase y degradación de consultas | Media a R2; plan de particionado antes de los primeros millones de filas |
| Agente respondiendo mal a un cliente real | Daño reputacional del cliente y del número | Modo copiloto antes que modo autónomo; escalamiento por defecto ante duda |
| Paridad con Kommo como objetivo implícito | Alcance infinito | Lista explícita de lo que no se replica |
| El nombre requiere explicación | Fricción comercial permanente | La analogía es contenido de GMT, no carga del vendedor |

---

## 9. Fases

**Fase 0 — Habilitación (antes de código)**
Verificación de negocio en Meta. App creada. Decisión de modelo multi-tenant. Registro de dominios y handles. Búsquedas de marca.

**Fase 1 — Ingesta**
Webhooks de los tres canales. Normalización. Persistencia. Media a R2. Idempotencia probada con reintentos reales.

**Fase 2 — Orchestra**
Bandeja unificada en tiempo real. Asignación. Estados. Envío manual. Control de ventana de 24 horas. En esta fase Kavea ya reemplaza a Kommo en lo básico.

**Fase 3 — Agentes**
Clasificación de intención. Respuesta asistida (copiloto: el agente propone, el humano aprueba). Registro en `agent_runs`. Solo después de medir calidad, pasar a modo autónomo por tipo de intención.

**Fase 4 — Comercial**
Contactos unificados. Pipelines. Campos personalizados. Plantillas y seguimiento proactivo.

**Fase 5 — Multi-tenant productivo**
Onboarding de clientes. Aislamiento verificado. Facturación por uso.

**Criterio de avance:** no se pasa de fase con deuda de la anterior. Cada fase se verifica contra datos reales antes de producción.

---

## 10. Definición de éxito para v1

Kavea v1 está listo cuando **la operación de Boosty corre completa sobre él y Kommo se puede cancelar**, con:

- Cero mensajes perdidos en un mes de operación
- Tiempo de primera respuesta medible y menor al de la operación actual
- Registro auditable de cada decisión automática
- Costo por conversación conocido y bajo el precio que se le cobra al cliente

Dogfooding primero. Ningún cliente entra a Kavea antes de que Boosty lleve un mes operando en él.

---

## Anexo — Fuentes de la investigación de marca

- Definición y función de la *cavea*: Wikipedia (Cavea; Roman amphitheatre), Merriam-Webster, Ancient Theatre Archive.
- Proporciones vitruvianas y acústica: De Architectura, vía Grokipedia.
- Estado registral de Kavea Instalaciones Eléctricas de Galicia SL: eInforma, Iberinform, BORME.
- "Kaveas" como jerga de kVA: Aprende Ciencia y Tecnología.
- Disponibilidad de dominios: resolución DNS directa, 1 de agosto de 2026. Requiere confirmación en registrador.
