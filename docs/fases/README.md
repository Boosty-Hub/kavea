# Kavea — Plan de construcción por fases

**Fecha:** 2 de agosto de 2026
**Estado:** ocho fases planificadas, ninguna ejecutada

Ocho documentos, 8.000 líneas. Cada uno trae objetivo, precondiciones, entregables, tareas
numeradas con criterio de aceptación verificable, riesgos, definición de terminado y
preguntas abiertas.

---

## 1. Precedencia entre documentos

Antes de leer una fase conviene saber qué manda sobre qué. Se descubrió tarde, corrigiendo
el `06`, y es la causa de casi todas las erratas que llevan estos documentos anotadas.

| Materia | Documento que manda |
|---|---|
| Invariantes de Meta | `03-invariantes-meta.md` — normativo, por encima de todo |
| Conexión con Meta: flujo, receptor, cola, credenciales, envío, límites | `02-conexion-instagram-facebook.md` |
| Modelo de datos, RLS, cifrado | `02` §7 |
| Identidad visual y voz | `01-identidad-de-marca.md` |
| Superficies, dominios, multi-tenant por subdominio, panel interno | `06-arquitectura-plataforma.md` |
| Qué es el producto, alcance, riesgos | `00-documento-base.md` |

**El `06` cede ante el `02`.** Su primera versión se escribió sin haber leído el `02` y lo
contradijo en seis puntos; lleva tabla de erratas en su sección 0.

---

## 2. Las ocho fases

| # | Fase | Líneas | Termina cuando |
|---|---|---|---|
| 0 | [Cimientos](00-fase-cimientos.md) | 1777 | `boosty.kavea.ai` abre sesión y no ve datos de otra organización |
| 1 | [Ingesta](01-fase-ingesta.md) | 1077 | Meta entrega, se valida la firma y se encola con 200 en menos de 5 s |
| 2 | [Normalización](02-fase-normalizacion.md) | 1043 | El mismo evento entregado tres veces produce una sola fila |
| 3 | [Bandeja](03-fase-bandeja.md) | 1204 | Se ven conversaciones reales llegando en vivo |
| 3b | [Tarjetas](03b-fase-tarjetas.md) | 250 | Una persona con dos canales se lee en un solo hilo |
| 3c | [Embudos](03c-fase-embudos.md) | 200 | Las tarjetas se ven en columnas por etapa, con su suma |
| 4 | [Envío](04-fase-envio.md) | 511 | Se responde y el compositor se bloquea fuera de ventana |
| 5 | [Configuración](05-fase-configuracion.md) | 975 | Un canal se conecta desde la interfaz, sin tocar la base |
| 6 | [Agentes](06-fase-agentes.md) | 730 | El agente propone, una persona aprueba, queda en `agent_runs` |
| 7 | [Multi-tenant](07-fase-multitenant.md) | 689 | Entra el primer cliente, un mes después del dogfooding |

### Dependencias

```
0 ──► 1 ──► 2 ──► 3 ──► 3b ──► 3c ──► 4 ──► 6
                  │                    │
                  └──► 5 ──────────────┘
                                       └──► 7  (+ Tech Provider + App Review)
```

- **1 y 2 antes que 3, sin excepción.** No hay bandeja sin ingesta.
- **3b antes que 4, y esto no es negociable.** La 4 construye el compositor, y si la unidad de
  trabajo es la tarjeta el compositor tiene que preguntar por qué canal se responde y mirar la
  ventana de ese canal. Escribirlo contra la conversación y rehacerlo después cuesta más que
  decidirlo antes. La 3b se añadió el 2 de agosto de 2026: era un hueco del plan, no un
  aplazamiento.
- **3c recupera alcance perdido, no lo añade.** El `00-documento-base.md` §9 lista desde el
  principio una «Fase 4 — Comercial: contactos unificados, pipelines, campos personalizados».
  Este plan de ocho fases nunca la recogió. La 3b devolvió los contactos y los campos; la 3c
  devuelve los embudos. Va después de la 3b porque las etapas cuelgan de la tarjeta, y antes
  de la 4 porque toca las mismas pantallas: hacerlo después significaría abrir dos veces los
  mismos archivos.
- **5 puede solaparse con 3 y 4.** Durante el dogfooding la conexión de Boosty se siembra a
  mano; la fase 5 construye la interfaz que generaliza eso.
- **6 exige 4**, porque un agente que propone sin poder enviar no cierra el ciclo.
- **7 está bloqueada por trámite**, no por código: Tech Provider y App Review.

### Atajo para acortar la realimentación

Las fases 0 a 3 se validan con el número de prueba que Meta da gratis en modo desarrollo.
Mensajes reales entrando en días, no en semanas.

---

## 3. Decisiones que atraviesan todas las fases

**El stack se cierra en dos proveedores: Supabase y Netlify.** Cloudflare quedó fuera por
completo el 2 de agosto de 2026.

| Decisión | Elección |
|---|---|
| Sitio público | Netlify, desde `web/` |
| App y panel interno | Netlify, desde `app/`. Dos sitios, un repositorio |
| Base de datos | Supabase `sdazqohyjzzylwbkvovx` |
| Receptor y normalizador | **Supabase Edge Functions**, con `verify_jwt = false` |
| Cola | **Postgres `webhook_events`**, con `for update skip locked` |
| Amortiguador de emergencia | **Netlify Blobs**, escrito por API con `siteID` y token |
| Crones | **`pg_cron` + `pg_net`** |
| Media saliente | **Supabase Storage** |
| Media entrante | **No se almacena nunca**, solo su URL. Invariante del `03` |
| Correo | Resend. `support@kavea.ai` verificado y operativo |
| DNS | **Netlify DNS, delegado y verificado** |
| Aislamiento | Una base, RLS, más `meta_asset_routes` para la ingesta |
| Panel interno | Solo metadatos, break-glass auditado |

### Los dos límites que más condicionan el diseño

- **2 segundos de CPU por petición** en las Edge Functions de Supabase. Los 400 s que anuncia
  son de reloj, no de cómputo, y esperar no ayuda: hay que trocear. Es el eje del diseño de la
  fase 2.
- **El amortiguador solo actúa en caídas de más de una hora.** Por debajo, los reintentos de
  Meta hacen de colchón. Se mantiene por la promesa de que nada se pierda, no porque sea el
  caso frecuente.

---

## 4. Las cinco cosas que más fácil se rompen

Salieron repetidas en varias fases. Si algo se va a olvidar, que no sea esto.

1. **El receptor tiene que devolver 200 aunque Postgres no esté.** Meta desuscribe la Página
   tras una hora de entregas fallidas, en silencio y por cliente. Como la cola vive en
   Postgres, eso se sostiene con el amortiguador de Netlify Blobs: si el insert falla, el
   cuerpo crudo va a Blobs y el 200 sale igual. La prueba que lo demuestra —apagar Supabase,
   mandar tres mensajes, comprobar tres 200 y drenaje sin pérdidas— está en la definición de
   terminado
   de la fase 1 como ejecutable, no como supuesto.

2. **La firma se calcula sobre el cuerpo crudo.** Cualquier `JSON.parse` seguido de
   `stringify` la rompe de forma no determinista, y solo falla con tildes y emoji: es decir,
   siempre en Venezuela, República Dominicana y México, y nunca en las pruebas en inglés.

3. **RLS protege la lectura, no la ingesta.** El worker escribe con rol de servicio y salta
   RLS por diseño. Lo que impide escribir en el tenant equivocado es que `asset_id` sea clave
   primaria de `meta_asset_routes`. Y para que un mensaje de A no pueda apuntar a una
   conversación de B hacen falta claves foráneas compuestas sobre `(organization_id, id)`:
   la integridad referencial de Postgres también salta RLS.

4. **La ventana de 24 h se calcula por conversación sobre `last_incoming_at`, y se reevalúa
   al despachar, no al encolar.** Un mensaje aprobado a las 23:59 y enviado a las 00:01 es un
   fallo real. Los agentes de IA nunca emiten con `HUMAN_AGENT`.

5. **La media entrante no se almacena, solo su URL.** Es causa documentada de rechazo del App
   Review. Queda abierto si el navegador puede renderizar esas URLs sin proxy, porque proxear
   equivale a cachear.

---

## 5. Comprobaciones empíricas pendientes contra Meta

Ninguna se puede resolver leyendo documentación: o son contradicciones entre páginas
oficiales de Meta, o cosas que Meta no publica. Están repartidas por los ocho documentos y
aquí van juntas, en orden de a qué bloquean.

### Bloquean construcción

| # | Qué | Fase |
|---|---|---|
| 1 | Forma real del payload de WhatsApp. El adaptador se entrega como interfaz con una prueba que falla a propósito | 2 |
| 2 | Enrutado de WhatsApp: `entry[].id` es la WABA y no identifica canal; se enruta por `phone_number_id` | 1, 2 |
| 3 | Literales de `messaging_type`. Solo corroborados en SDKs de terceros, nunca en fuente oficial | 4 |
| 4 | Si `messaging_type` es obligatorio en Instagram. Los ejemplos oficiales no lo incluyen | 4 |
| 5 | Si el `message_id` que devuelve el Send API coincide con el `mid` del echo | 4 |
| 6 | Si Instagram entrega echoes en la vía Facebook Login. Dos páginas oficiales se contradicen | 2, 4 |
| 7 | Si el navegador puede renderizar URLs de `lookaside.fbsbx.com` sin proxy | 3 |

### Bloquean promesas comerciales

| # | Qué | Fase |
|---|---|---|
| 8 | Disponibilidad de `standby`, `message_reactions` y `message_edit` en Instagram vía Facebook Login | 2 |
| 9 | Suelo de la fórmula `4800 × impresiones`. Una cuenta nueva con cero impresiones daría cuota cero, lo que rompería el acuse sub-30 s y acabaría en restricción de la Página del cliente | 7 |
| 10 | Disponibilidad regional de Human Agent, private replies y Conversation Routing en VE, RD y MX | 4, 5 |
| 11 | Rate limit real del Send API de Instagram: 100/s frente a 300/s. Dos páginas oficiales en desacuerdo | 4 |
| 12 | TTL de las URLs de `lookaside.fbsbx.com`. Meta no lo documenta | 2, 3 |
| 13 | Si `business_management` es dependencia. La Permissions Reference contradice al overview | 5 |
| 14 | Nombre exacto de la tarea de Página: MODERATE frente a MESSAGE. MESSAGING no existe | 5 |

### Consulta por escrito a Meta

| # | Qué | Fase |
|---|---|---|
| 15 | **Si se permite la descarga efímera de media para procesamiento en memoria.** La política prohíbe almacenar y cachear, pero no dice nada del procesamiento transitorio. Se trata como **no permitido** hasta tener respuesta por escrito, y el número de caso es entregable de la fase | 6 |

---

## 6. Decisiones que necesitan a Gabriel

| # | Qué | Bloquea |
|---|---|---|
| 1 | Contraste de los colores semánticos. "Esperando" da 2,83 y "resuelta" 4,36, y el `01` exige 4,5 mínimo. Propuesta: dos tokens por estado más variantes de modo oscuro | Fase 3 |
| 2 | Cuatro estados de conversación frente a los tres del `02` §7.4 | Fases 2 y 3 |
| 3 | Quién paga a Meta el consumo de WhatsApp: el método de pago de la WABA del cliente, o una línea de crédito de Boosty. Decide si ese coste aparece siquiera en la cuenta de Kavea | Fase 7 |
| 4 | Retención de `webhook_events`. Hoy guarda el cuerpo íntegro de todos los tenants sin plazo | Fase 2 |
| 5 | Presupuesto de latencia p95 del normalizador | Fase 2 |
| 6 | Nivel de PITR del proyecto de producción de Supabase | Fase 0 |

---

## 7. Erratas encontradas en documentos previos

Los planes las señalan en vez de arrastrarlas. Van aquí para que se corrijan en origen.

**En el `06`, ya corregidas:** tokens en `channels.credenciales jsonb`; enrutado por índices
parciales; "la frontera de seguridad es RLS"; `messages_hilo_idx` ordenando por `created_at`
en vez de `meta_timestamp`; break-glass con `exists` correlacionado; política `for all` sobre
membresías que permitía a un agente ascenderse a propietario.

**En el `02`, pendientes de corregir en la fase 0 o la 2:**

- El índice único parcial de §7.4 usa `where status='open'`, y con cuatro estados una
  conversación en `esperando` queda desprotegida. El predicado correcto es
  `where estado <> 'cerrada'`. La migración la hace la fase 2, que es el primer escritor.
- Las claves foráneas de §7 son simples y permiten coser filas entre tenants. Van compuestas
  sobre `(organization_id, id)`.
- La tabla `media` de §7.5 nombra el almacén saliente como R2: `origen = 'kavea_r2'`,
  `r2_bucket`, `r2_key`. Ahora es Supabase Storage. Solo cambian los nombres; la separación
  entre media entrante —solo URL— y saliente sigue igual y es lo que importa.

**Sobre la plataforma de ingesta:** el `02` §5.2 y §5.3 argumentan a favor de Cloudflare. No
es una errata suya: es una decisión de Gabriel que los anula, con el riesgo aceptado y
documentado en `06` §1.1.

**En el `01`, pendiente de decisión:** dos de los cuatro colores semánticos no alcanzan el
contraste que el propio documento exige. En positivo: terracota 500 sobre arena da 4,52 y
pasa, lo que cierra un pendiente de su sección 9.
