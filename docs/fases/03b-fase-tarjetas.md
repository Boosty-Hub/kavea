# Fase 3b — Tarjetas, ficha y campos propios

**Fecha:** 2 de agosto de 2026
**Posición:** entre la 3 y la 4. No es opcional y no puede ir después de la 4.

---

## 0. Por qué esta fase no estaba

Las ocho fases originales tratan `conversations` como la unidad de trabajo. La fase 3 excluye
explícitamente «pipeline comercial y unificación de contactos entre canales» y ninguna fase
posterior lo recoge: es un hueco del plan, no un aplazamiento deliberado.

El hueco se nota en cuanto se mira la operación real. Una persona escribe por Instagram, luego
por WhatsApp. Son dos hilos en Meta y son un solo asunto para quien atiende. Con la unidad de
trabajo puesta en la conversación, ese asunto no existe en ninguna parte: no se le puede
asignar un responsable, no se le puede poner un estado, y no hay dónde guardar lo que el
negocio sabe del caso.

**Por qué va antes de la fase 4 y no después.** La fase 4 construye el compositor. Si la
unidad es la tarjeta, el compositor tiene que preguntar *por qué canal* se responde y
comprobar la ventana *de ese canal*. Escribirlo contra la conversación y rehacerlo después
cuesta más que decidirlo ahora. El resto del sistema —agentes en la 6, multi-tenant en la 7—
hereda la misma unidad.

---

## 1. La decisión central

> **La tarjeta es la unidad de trabajo. La conversación es el transporte.**

Todo lo demás sale de ahí.

| | Vive en la **tarjeta** | Vive en la **conversación** |
|---|---|---|
| Qué es | El asunto: una persona y lo que hay que resolver con ella | Un hilo con Meta por un canal concreto |
| Estado del trabajo | `nueva`, `en_curso`, `esperando`, `cerrada` | — |
| Responsable | `asignado_a` | — |
| Campos propios del negocio | Sí | — |
| Título | Sí, editable | — |
| Canal | — | `instagram`, `messenger`, `whatsapp` |
| Ventana de 24 h | — | Sí, sobre `last_incoming_at` de **ese** canal |
| Token y endpoint de envío | — | Sí |
| Propiedad del hilo, `standby` | — | Sí |
| Espacio de `mid` | — | Sí |

Una tarjeta tiene de una a N conversaciones, como mucho una viva por canal. El hilo que se
lee es la unión de las líneas de tiempo de sus conversaciones, ordenada por tiempo real y con
cada mensaje marcado con su canal.

**Lo que NO cambia, y es la razón de que la conversación siga existiendo.** La ventana de 24 h
se cuenta por canal. El envío va con el token de ese canal a ese identificador. Meta puede
quitarnos la propiedad del hilo de Instagram y dejarnos el de Messenger. Fundir todo eso en un
único objeto obligaría a llevar dos relojes de ventana en la misma fila y el compositor no
podría decidir si se puede responder. La tarjeta une lo que es del negocio; no toca lo que es
de Meta.

### Cómo se une, y cuándo automáticamente

- **Automático y sin adivinar:** una conversación nueva de un contacto que ya tiene tarjeta
  viva entra en esa tarjeta. La regla es determinista —mismo `contact_id`— y no interpreta
  parecidos.
- **Manual:** unir dos tarjetas de dos contactos distintos. Es la operación que resuelve «esta
  persona de WhatsApp es la misma que la de Instagram». Exige motivo, queda en el hilo y se
  deshace.
- **Nunca por parecido de nombre.** La fase 2 ya lo fija y sigue vigente: «Maria Gonzalez» en
  Instagram y «María González» en Messenger pueden ser dos personas. Una unión errónea muestra
  la conversación de un cliente bajo el nombre de otro, y eso es una incidencia de privacidad,
  no un error de datos. El falso positivo se gestiona por reversibilidad, no por prevención.

---

## 2. Modelo de datos

### 2.1 `tarjetas`

```
id, organization_id, contact_id, titulo, estado, asignado_a,
last_message_at, preview_texto, preview_emisor, no_leidos,
cerrada_en, created_at, updated_at
```

Índice único parcial: `(organization_id, contact_id) where cerrada_en is null`. Una persona
con asunto abierto tiene exactamente una tarjeta. Es la misma técnica que protege hoy la
creación de conversaciones ante webhooks paralelos.

### 2.2 Lo que se mueve desde `conversations`

`estado` y `asignado_a` suben a la tarjeta. Baja a la conversación un `cerrada_en` propio,
porque el índice que impide duplicados dependía de `estado <> 'cerrada'` y ese estado ya no
está ahí:

```
unique (organization_id, canal, contact_id) where cerrada_en is null
```

Esto además separa dos cosas que estaban mezcladas y que la fase 3 ya distinguía en la
interfaz sin distinguirlas en el modelo: **el estado del trabajo** y **el estado del hilo**.
Un asunto puede estar `esperando` con su hilo de Instagram perfectamente vivo.

### 2.3 `campos` — las definiciones

```
id, organization_id, clave, etiqueta, tipo, opciones, ayuda,
obligatorio, orden, ambito, archivado_en
```

- `ambito ∈ {tarjeta, contacto}`. Un presupuesto es del asunto; un RIF es de la persona.
- `tipo ∈ {texto, texto_largo, numero, moneda, fecha, booleano, seleccion, multiseleccion,
  telefono, correo, url}`.
- `clave` es estable y se usa en filtros y API; `etiqueta` es lo que se lee y se puede cambiar
  sin romper nada.
- Se **archiva**, no se borra. Borrar una definición borraría el histórico de valores, que es
  justo el dato que alguien quería guardar.

### 2.4 `campo_valores`

Un valor `jsonb` por (campo, tarjeta) o (campo, contacto), con `CHECK` de que exactamente uno
de los dos está puesto y dos índices únicos parciales.

**Por qué `jsonb` y no una columna por tipo.** La alternativa son once columnas anulables de
las que siempre hay diez vacías, y añadir un tipo nuevo es una migración. Con `jsonb` el tipo
lo impone la definición al escribir, en un RPC que valida, y Postgres puede indexar por
expresión los campos por los que de verdad se filtre.

**Por qué no una columna `jsonb` suelta en `tarjetas`.** Porque entonces no hay definiciones:
cada tarjeta llevaría claves inventadas, no habría dónde listarlas para el formulario, ni
forma de renombrar una etiqueta, ni de saber qué campos existen en la organización.

---

## 3. Registro de actividad

Se mantiene el requisito: **todo lo que hace una persona sale en la conversación.** Entran al
vocabulario:

```
tarjeta.creada        tarjeta.titulo        tarjeta.estado
tarjeta.asignada      tarjeta.desasignada   tarjeta.cerrada
tarjetas.unidas       tarjetas.separadas
campo.definido        campo.editado         campo.archivado
campo.valor           (con valor anterior y nuevo)
```

`campo.valor` guarda el antes y el después. Sin el antes, el registro dice que algo cambió
pero no de qué a qué, y para eso no hace falta registro.

Toda escritura pasa por RPC. No se abren políticas de `insert` sobre estas tablas: una
política de tabla es un camino que escribe sin dejar rastro, y el requisito no admite caminos
así.

---

## 4. Cómo se ven varios canales en un mismo hilo

El riesgo es convertir el hilo en un semáforo. La regla del libro de marca manda: terracota
nunca es fondo de área grande, un solo elemento de acento por vista, el espacio en blanco es
material de construcción.

**Lo que se hace:**

- **Separador de canal.** Cuando el canal cambia respecto al mensaje anterior, una línea
  discreta con el nombre del canal. En un hilo de un solo canal no aparece nunca, así que el
  caso normal no paga nada.
- **Marca en la burbuja, no color de fondo.** Un filete de 2 px en el borde de inicio de la
  burbuja, con el color del canal. Se distingue de un vistazo sin teñir la superficie.
- **El canal también en texto.** En el pie de la burbuja, junto a la hora. Nunca solo color:
  hay gente daltónica en cualquier equipo, y la fase 3 ya fija esa regla para los estados.

**Colores de canal**, fuera de la paleta semántica de estados para que no se confundan con
`en_curso` o `escalada`:

| Canal | Token | Nota |
|---|---|---|
| Instagram | `--k-canal-ig` | Magenta apagado |
| Messenger | `--k-canal-fb` | Azul apagado |
| WhatsApp | `--k-canal-wa` | Verde apagado |

Apagados a propósito: son etiquetas, no alertas.

---

## 5. La ficha

Panel lateral del hilo, plegable, con:

1. **La persona.** Nombre, usuario, foto si la hay.
2. **Sus canales.** Una fila por identidad, con el canal, el identificador legible y de dónde
   salió: la trajo Meta o la escribió alguien. Enlace al hilo de cada canal.
3. **Los campos de la tarjeta**, en el orden que fije la organización.
4. **Los campos del contacto.**
5. **Unir con otra tarjeta**, con buscador y motivo.

Es también la respuesta a «en esa ficha se ven los contactos dentro de esa conversación y de
qué canal son».

---

## 6. Tareas

| # | Tarea | Terminada cuando |
|---|---|---|
| T1 | Migración de `tarjetas`, traslado de `estado` y `asignado_a`, `cerrada_en` en conversaciones, relleno de las filas existentes | Cada conversación viva tiene tarjeta y la bandeja sigue mostrando lo mismo que antes |
| T2 | `aplicar_efecto` busca o crea tarjeta por contacto | Un mensaje nuevo de un contacto con tarjeta viva no crea una segunda |
| T3 | `unir_tarjetas` y `separar_tarjetas`, con motivo, actividad y reversibilidad | Unir dos tarjetas de dos contactos deja un hilo con los dos canales y se deshace dejando todo como estaba |
| T4 | Migración de `campos` y `campo_valores`, con RPC que valida por tipo | Un valor que no encaja con el tipo se rechaza con un mensaje que dice qué se esperaba |
| T5 | Pantalla de definición de campos | Se crea, se reordena y se archiva un campo sin tocar la base |
| T6 | Ficha en el hilo | Muestra persona, canales, campos de tarjeta y de contacto, y guarda |
| T7 | Hilo multicanal con separador, filete y canal en el pie | Un hilo de un canal se ve igual que antes; uno de dos se distingue sin leer |
| T8 | Bandeja sobre tarjetas | La lista, los filtros, los contadores y el tiempo real operan sobre tarjetas |
| T9 | Aislamiento | La suite cubre `tarjetas`, `campos` y `campo_valores`, y que unir tarjetas de dos organizaciones se rechaza |

---

## 7. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| Rehacer la bandeja de la fase 3 | Es trabajo ya entregado y verificado | Se hace ahora, con una conversación real en la base. Dentro de tres meses son miles |
| Unión errónea de dos personas | Muestra la conversación de alguien bajo el nombre de otro. Incidencia de privacidad | Motivo obligatorio, actividad en el hilo, reversible con la lista exacta de lo movido |
| Los campos propios se convierten en un CRM | El `00` dice literalmente que Kavea no es un CRM: «donde el CRM guarda, Kavea opera» | Los campos son del asunto abierto, no un archivador. Sin vistas de tabla ni informes en esta fase |
| El hilo multicanal se vuelve ilegible | Una bandeja se mira ocho horas al día | Filete y separador, nunca fondo de color. Un hilo de un canal no cambia en nada |
| Dos conversaciones vivas del mismo canal al unir | Choca con el índice único parcial | Se rechaza con explicación. Dos hilos vivos del mismo canal son dos cuentas distintas de ese canal |

---

## 8. Definición de terminado

- [ ] Una persona con Instagram y WhatsApp se ve en un solo hilo, con cada mensaje marcado con
      su canal.
- [ ] Unir dos tarjetas queda en el hilo y se deshace dejando la base como estaba.
- [ ] Se define un campo desde la interfaz, se rellena en una tarjeta y el cambio sale en el
      hilo con el valor anterior.
- [ ] La ficha muestra todos los canales de la persona y de dónde salió cada uno.
- [ ] La suite de aislamiento cubre las tablas nuevas y sigue en verde.
- [ ] Un hilo de un solo canal se ve exactamente igual que antes de esta fase.

---

## 9. Preguntas abiertas

| # | Qué | Por qué no se decide aquí |
|---|---|---|
| 1 | ¿La tarjeta se cierra sola cuando se cierran todas sus conversaciones, o al revés? | Es una decisión de operación de Boosty, no técnica |
| 2 | ¿Los campos obligatorios bloquean el cierre de la tarjeta? | Es política comercial; el modelo lo soporta en ambos casos |
| 3 | ¿Hace falta historial completo de valores o basta con el último más la actividad? | El historial completo es otra tabla y solo compensa si alguien lo va a consultar |
| 4 | ¿Los campos se filtran en la bandeja? | Cada campo filtrable pide su índice. Se decide con campos reales, no antes |
