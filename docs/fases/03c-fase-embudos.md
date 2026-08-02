# Fase 3c — Embudos y etapas

**Fecha:** 2 de agosto de 2026
**Posición:** después de la 3b, antes de la 4.

---

## 0. Esto no es alcance nuevo: es alcance perdido

El `00-documento-base.md` §9 lista, desde el primer día, una **«Fase 4 —
Comercial: contactos unificados, pipelines, campos personalizados, plantillas y
seguimiento proactivo»**. El plan de construcción de ocho fases nunca la recogió:
se quedó con la bandeja, el envío, la configuración, los agentes y el
multi-tenant. La 3b recuperó los contactos unificados y los campos. Esta
recupera los pipelines.

**Sobre el «no es un CRM» del `00`.** Esa frase sigue en pie y no la contradice
nada de aquí. Dice que Kavea no se *posiciona* como archivador con un pipeline
encima, para no competir con Kommo en su terreno de precio por usuario. El mismo
documento dice, cuatro párrafos después, que Kavea **nace para reemplazar Kommo
en la operación de Boosty** y que «se replica lo que se usa». El embudo se usa
todos los días. Es de lo que se replica.

Lo que se descarta sigue descartado: informes de previsión, cuotas por vendedor,
puntuación automática de oportunidades y vistas de tabla tipo hoja de cálculo.

---

## 1. La decisión que ordena todo lo demás

> **El estado y la etapa son dos ejes distintos y no se mezclan.**

| | `estado` | `etapa` |
|---|---|---|
| Pregunta que responde | ¿Esto necesita a alguien **ahora**? | ¿Dónde está esto en el **proceso comercial**? |
| Valores | nueva, en curso, esperando, cerrada | Los que defina cada negocio |
| Quién lo mueve | La atención del día | La conversación comercial |
| Dónde se ve | Bandeja | Embudo |

Una tarjeta puede estar **esperando** —la pelota está en el tejado del cliente— y
a la vez en **«Propuesta enviada»**. Son hechos independientes y los dos son
ciertos.

**Kommo los mezcla y por eso duele.** Al mover una tarjeta de etapa, cambia
también su estado de atención; y al cerrar una conversación, la saca del embudo.
El resultado conocido: o el embudo miente sobre el negocio, o la bandeja miente
sobre el trabajo pendiente. Kavea los separa a propósito, y ese es el motivo por
el que `tarjetas` lleva las dos columnas en vez de una.

**Consecuencia que hay que decir en voz alta:** mover una tarjeta a «Ganada» NO
cierra su conversación. Si el cliente sigue escribiendo, la conversación sigue
viva. Cerrarla automáticamente es lo que hace que un mensaje entrante después de
la venta se pierda de vista, que es exactamente lo que Kavea existe para evitar.

---

## 2. Modelo

### 2.1 `embudos`

```
id, organization_id, nombre, descripcion, orden,
es_predeterminado, archivado_en
```

Varios por organización: **ventas** y **cobros** son dos procesos distintos con
etapas distintas, y el mismo negocio los necesita a la vez. Uno predeterminado,
protegido por un índice único parcial: es donde caen las tarjetas nuevas.

### 2.2 `etapas`

```
id, organization_id, embudo_id, nombre, orden, color, tipo, archivado_en
```

`tipo ∈ {abierta, ganada, perdida}`. **No es decoración.** Sin marcar cuáles son
terminales y de qué signo, no se puede calcular ni una tasa de conversión ni
saber qué hay realmente en curso. Un embudo cuyas etapas son todas «abiertas» es
una lista, no un embudo.

`color` sale de una paleta cerrada. Un campo de color libre acaba en un tablero
de ocho colores saturados que contradice el libro de marca y cansa a la tercera
hora.

### 2.3 Lo que se añade a `tarjetas`

```
embudo_id, etapa_id, etapa_desde, valor, moneda
```

- `etapa_desde` da el «lleva 9 días aquí», que es la señal más útil de un
  embudo: no la etapa, sino cuánto lleva parada.
- `valor` y `moneda` son de primera clase, no un campo propio. Un embudo tiene
  que sumar por columna, y sumar un campo propio exigiría saber cuál de ellos es
  el importe. Sirve igual para ventas que para cobros.

### 2.4 Dónde entra una tarjeta nueva

En el embudo predeterminado, en su primera etapa abierta. Determinista, sin
adivinar. Si la organización no tiene embudos, la tarjeta se queda sin etapa y
el tablero lo dice; no se inventa uno.

---

## 3. Registro de actividad

Se mantiene el requisito. Entran al vocabulario:

```
tarjeta.etapa      (de, a, embudo, dias_en_etapa_anterior)
tarjeta.embudo     (de, a)
tarjeta.valor      (de, a, moneda)
embudo.definido    embudo.archivado
etapa.definida     etapa.archivada    etapas.reordenadas
```

`tarjeta.etapa` guarda cuántos días llevaba en la anterior. Es el dato que
después responde «¿dónde se atascan?», y si no se captura al mover ya no se
puede reconstruir.

Todo pasa por RPC, como en la 3b: sin políticas de escritura sobre estas tablas.

---

## 4. El tablero

Columnas por etapa, tarjetas dentro, en `/embudo`.

- **Cabecera de columna:** nombre, número de tarjetas y suma del valor. La suma
  es la razón de ser de la vista.
- **Tarjeta:** título, valor, puntos de canal, sin leer, y cuánto lleva en la
  etapa. Nada más: una tarjeta de tablero que hay que leer entera no se escanea.
- **Mover:** arrastrando, y además con un selector dentro de la tarjeta. El
  arrastre nativo no funciona con teclado ni de forma fiable en táctil, así que
  no puede ser el único camino. Es la misma regla que «nunca solo color».
- **Etapas ganada y perdida** al final, visualmente distintas del cuerpo del
  embudo.

Sin límites WIP, sin automatizaciones por etapa y sin previsión en esta fase.

---

## 5. Tareas

| # | Tarea | Terminada cuando |
|---|---|---|
| T1 | Migración de `embudos`, `etapas` y columnas de `tarjetas` | Un embudo con etapas existe y las tarjetas nuevas caen en la primera |
| T2 | RPC de mover etapa, con actividad y días en la etapa anterior | Mover deja línea en el hilo con el «de» y el «a» |
| T3 | RPC de definición y reordenado, solo para quien administra | Un agente no puede reordenar el embudo de su organización |
| T4 | Vista de resumen por etapa | Cuenta y suma por columna en una sola consulta |
| T5 | Tablero en `/embudo` con arrastre y selector | Se mueve una tarjeta con el ratón y con el teclado |
| T6 | Etapa y valor en la ficha del hilo | Se cambia la etapa sin salir de la conversación |
| T7 | Pantalla de configuración de embudos | Se crea un embudo con etapas sin tocar la base |
| T8 | Aislamiento | La suite cubre `embudos`, `etapas` y que no se mueva una tarjeta a la etapa de otra organización |

---

## 6. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| Mezclar estado y etapa | Es el defecto de Kommo que más se nota a diario | Dos columnas, dos vistas, y ninguna acción que cambie una toca la otra |
| Mover a otra organización | Sería arrastrar el negocio de un cliente al tablero de otro | La etapa se valida contra la organización de la tarjeta dentro del RPC |
| El tablero se vuelve el producto | Kavea opera, no archiva | Sin informes ni previsión. El tablero es una vista de la bandeja, no su sustituto |
| Arrastre inaccesible | Deja fuera teclado y táctil | Selector en cada tarjeta desde el primer día, no como añadido |
| Etapas infinitas | Un embudo de quince columnas no se lee | No se limita por código, pero el tablero avisa a partir de ocho |

---

## 7. Definición de terminado

- [ ] Existen dos embudos —ventas y cobros— con etapas propias.
- [ ] Una conversación nueva aparece en la primera etapa del predeterminado.
- [ ] Se mueve una tarjeta arrastrando y con el selector, y las dos formas dejan
      la misma línea en el hilo.
- [ ] La cabecera de cada columna suma el valor de sus tarjetas.
- [ ] Cambiar la etapa no cambia el estado, y cerrar la conversación no saca la
      tarjeta del embudo.
- [ ] La suite de aislamiento cubre las tablas nuevas y sigue en verde.

---

## 8. Preguntas abiertas

| # | Qué | Por qué no se decide aquí |
|---|---|---|
| 1 | ¿Una tarjeta puede estar en dos embudos a la vez —vendida y pendiente de cobro—? | Hoy es una y se mueve de embudo. Si hace falta simultaneidad, es otra tabla |
| 2 | ¿La moneda es por organización o por tarjeta? | Hoy por tarjeta con un valor por defecto. Boosty opera en varios países y aún no está claro si conviven en el mismo embudo |
| 3 | ¿Los agentes de la fase 6 mueven etapas solos? | Depende de la calidad medida. El modelo ya lo permite; la política es de la fase 6 |
