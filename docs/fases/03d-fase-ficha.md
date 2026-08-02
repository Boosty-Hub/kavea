# Fase 3d — Ficha con pestañas: archivos y documentos comerciales

**Fecha:** 2 de agosto de 2026
**Posición:** después de la 3c, antes de la 4.

---

## 1. La decisión que hay que acertar primero

> **Los documentos comerciales cuelgan de la PERSONA, no de la tarjeta.**

Es la frase clave del encargo: *«un lead puede comprar varias veces y debería
tener ese registro de cosas que compró, deudas que tiene o presupuestos
enviados»*.

Un cliente que compra tres veces en un año tiene tres asuntos —tres tarjetas— y
un solo historial de compras. Si los documentos colgaran de la tarjeta, al abrir
la conversación de hoy no se vería lo que compró en marzo, que es justo el dato
que decide cómo se le atiende: si debe dinero, si es recurrente, cuánto vale.

Así que `documentos.contacto_id` es obligatorio y `documentos.tarjeta_id` es
**opcional y solo informativo**: dice de qué conversación salió, sin que el
documento pertenezca a ella. Una tarjeta que se cierra no se lleva el historial.

Con los **archivos** es al revés y también a propósito: un archivo puede ser de
la tarjeta (el plano que mandó este cliente para este pedido), de la persona (su
documento de identidad) o de la organización entera (el catálogo, la lista de
precios). Los tres casos son reales, así que las dos referencias son opcionales
y las tres combinaciones significan algo distinto.

---

## 2. Dónde está la frontera, para no acabar construyendo un ERP

El `00` dice que Kavea no es un CRM y ya se aclaró que eso es posicionamiento.
Aquí hace falta una frontera nueva, y esta sí es de alcance:

**Kavea REGISTRA documentos. No los GENERA.**

| Sí | No |
|---|---|
| Guardar que se envió el presupuesto 1042 por 500 USD el 12 de marzo | Componer el PDF del presupuesto |
| Adjuntar el PDF que se hizo en otra herramienta | Calcular impuestos o retenciones |
| Saber que hay 300 USD vencidos desde hace 20 días | Contabilidad, asientos, conciliación bancaria |
| Ver que este cliente ha comprado 4 veces | Inventario y control de existencias |

Por eso no hay líneas de detalle en esta fase: sin generación de PDF ni cálculo
de impuestos, las líneas solo servirían para volver a sumar a mano un total que
ya viene dado. Queda como pregunta abierta, no como olvido.

---

## 3. Modelo

### 3.1 `documentos`

```
id, organization_id, contacto_id, tarjeta_id,
tipo, numero, concepto, total, moneda,
estado, emitido_en, vence_en, pagado_en,
archivo_id, creado_por
```

- `tipo ∈ {presupuesto, pedido, factura}`
- `estado ∈ {borrador, enviado, aceptado, rechazado, pagado, anulado}`
- `vence_en` es lo que convierte «pendiente» en «vencido». Sin fecha no hay
  deuda que reclamar, solo un importe pendiente sin urgencia.
- `archivo_id` enlaza el PDF, si lo hay. Opcional: se puede registrar la venta
  sin tener el papel.

**Lo vencido no se guarda, se calcula.** Un `estado = 'vencido'` almacenado
obliga a un cron que lo actualice cada noche y a que alguien note el día que ese
cron deje de correr. `vence_en < now()` no se puede quedar desactualizado.

### 3.2 `archivos`

```
id, organization_id, contacto_id, tarjeta_id,
nombre, storage_bucket, storage_path, content_type, bytes,
enviable, motivo_no_enviable, subido_por
```

`enviable` se calcula al subir contra los límites de Meta del `03`: imágenes
png/jpeg hasta 8 MB, audio y vídeo hasta 25 MB, PDF hasta 25 MB. **Comprobarlo
al subir y no al enviar** es la diferencia entre avisar cuando se puede cambiar
el archivo y fallar delante del cliente cuatro días después.

### 3.3 Almacenamiento

Bucket privado `salientes` en Supabase Storage, con la organización como primer
segmento de la ruta: `{organization_id}/{ámbito}/{uuid}-{nombre}`. Las políticas
de `storage.objects` comprueban ese primer segmento contra `es_miembro`.

Esto es media **saliente**, que es justo lo que el invariante del `03` permite
almacenar. La media entrante de Meta sigue siendo solo URL y no toca este
bucket. Que los dos caminos no se crucen lo garantiza el `CHECK` de `media`, que
ya existe desde 0010.

---

## 4. Pestañas

La ficha pasa a tener tres:

| Pestaña | Qué lleva |
|---|---|
| **Datos** | Canales, embudo y etapa, valor, campos del asunto y de la persona, unir |
| **Archivos** | Los de esta tarjeta, los de la persona y los de la organización, con subida |
| **Compras** | Historial comercial de la persona, con lo comprado, lo pendiente y lo vencido arriba |

La pestaña activa va en la URL. Sin eso, el refresco de tiempo real —que ocurre
solo cuando llega un mensaje— devolvería al operador a la primera pestaña
mientras rellena la tercera.

**El resumen va arriba y en tres números:** comprado, pendiente y vencido. Es lo
que hay que ver antes de escribir la respuesta, no después de leer una tabla.

---

## 5. Enviar un archivo: lo que esta fase NO hace

Guardar un archivo y marcarlo enviable no lo envía. El envío es la fase 4, con
su ventana de 24 h, su token por canal y sus límites de tamaño. Esta fase deja
el archivo listo y lo dice en la interfaz; el botón de enviar aparece con el
compositor.

Decirlo en la pantalla no es opcional: un botón que parece que envía y no envía
es peor que no tener botón.

---

## 6. Tareas

| # | Tarea | Terminada cuando |
|---|---|---|
| T1 | Bucket `salientes` con políticas por organización | Un miembro de A no lista ni descarga un objeto de B |
| T2 | Migración de `archivos` y `documentos`, con RPC | Registrar deja actividad con el importe |
| T3 | Vista de resumen comercial por persona | Comprado, pendiente y vencido en una consulta |
| T4 | Pestañas en la ficha, con la activa en la URL | Un refresco de tiempo real no cambia de pestaña |
| T5 | Subida con comprobación de límites de Meta | Un PDF de 30 MB se sube y avisa de que no se podrá enviar |
| T6 | Historial comercial con sus tres números | Se registra un presupuesto y aparece en la persona, no solo en la tarjeta |
| T7 | Aislamiento | La suite cubre `archivos`, `documentos` y el bucket |

---

## 7. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| Deriva hacia un ERP | Alcance infinito, y no es lo que Kavea hace | Registra, no genera. Sin líneas, sin impuestos, sin inventario |
| Objeto huérfano en Storage | La subida y el registro son dos pasos; si falla el segundo queda un blob sin fila | Se registra el fallo y se avisa. Barrido periódico como pendiente |
| Mezclar media entrante y saliente | Cachear media de Meta es causa documentada de rechazo del App Review | Bucket distinto, tabla distinta, y el `CHECK` de `media` de 0010 sigue vigilando |
| Documentos de una persona visibles desde otra | Es contenido comercial de un cliente | Clave foránea compuesta y RLS, como todo lo demás |
| Historial largo sin paginar | Un cliente de cinco años son cientos de documentos | Tope y orden por fecha. Paginación cuando haga falta, no antes |

---

## 8. Definición de terminado

- [ ] La ficha tiene tres pestañas y la activa sobrevive a un refresco.
- [ ] Un presupuesto registrado en una tarjeta se ve desde otra tarjeta de la
      misma persona.
- [ ] Los tres números de arriba cuadran con los documentos de la lista.
- [ ] Un archivo subido aparece con su tamaño y con si se podrá enviar o no.
- [ ] Un miembro de otra organización no alcanza ni el archivo ni el documento.
- [ ] La suite de aislamiento sigue en verde.

---

## 9. Preguntas abiertas

| # | Qué | Por qué no se decide aquí |
|---|---|---|
| 1 | ¿Hacen falta líneas de detalle en los documentos? | Solo si algún día Kavea genera el PDF. Hoy el total viene de fuera |
| 2 | ¿Pagos parciales? | Hoy un documento está pagado o no. Los abonos son otra tabla y hay que saber si Boosty los usa |
| 3 | ¿Barrido de objetos huérfanos en Storage? | Depende de cuánto pese. Se mide antes de programar un cron |
| 4 | ¿La biblioteca de la organización necesita carpetas? | Con veinte archivos no. Con doscientos sí, y entonces se sabrá cómo los agrupan |
