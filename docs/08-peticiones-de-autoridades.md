# Peticiones de autoridades públicas

Qué hace Boosty Digital LLC cuando una autoridad pide datos personales de los
usuarios o de las conversaciones que Kavea custodia.

**Por qué existe.** El App Review de Meta pregunta por escrito qué procesos hay
para esto, y un compromiso que no existe no se marca en un formulario. Pero el
motivo de fondo es otro: cuando llega una petición, llega con prisa y con un
sello, y la peor forma de decidir es improvisando delante de alguien que espera.
Esto es la decisión tomada de antemano, en frío.

**Alcance.** Cualquier requerimiento de un cuerpo policial, fiscalía, juzgado,
organismo regulador o autoridad administrativa —de cualquier país— que pida datos
personales, contenido de conversaciones, metadatos o registros de acceso.

**Esto no es asesoría legal.** Es el procedimiento interno. Un requerimiento con
consecuencias penales se consulta con abogado antes de contestar.

> Vigente desde el 6 de agosto de 2026.

---

## 1. Quién decide

**Gabriel Andres Montiel Toro, CEO**, es el único responsable de atender estas
peticiones. Nadie más del equipo entrega datos a una autoridad, ni confirma que
existan, ni orienta sobre cómo pedirlos.

En una empresa de este tamaño repartir esta responsabilidad no la reparte: la
diluye. Quien reciba un requerimiento por cualquier vía —correo, teléfono, en
persona— lo traslada íntegro y sin contestar nada.

## 2. Revisión de legalidad

Antes de entregar nada se comprueba, y queda escrito, que:

- **Viene de quien dice venir.** Se verifica por un canal independiente del que
  llegó la petición. Un correo con membrete no acredita nada.
- **Tiene forma legal válida** en su jurisdicción: orden judicial, requerimiento
  fiscal o la figura que corresponda, con firma y referencia de expediente.
- **La autoridad tiene competencia** sobre Boosty Digital LLC o sobre los datos
  pedidos. Una autoridad de un país donde la sociedad no opera ni tiene datos no
  la tiene por el hecho de que un usuario resida allí.
- **Está acotada.** Se identifica qué datos concretos, de quién y de qué periodo.

Si algo de esto falla, no se entrega: se pide por escrito que se subsane.

## 3. Impugnación

Se recurre, con abogado, cuando la petición:

- carece de base legal, es genéricamente amplia o pide datos sin relación con lo
  investigado;
- exige entregar contenido de conversaciones cuando bastarían metadatos;
- prohíbe avisar al afectado sin fundamento legal para esa prohibición;
- o obliga a construir datos que no se tienen — Kavea no tiene por qué crear
  registros nuevos para satisfacer un requerimiento.

**Cumplir mientras se recurre solo si la ley lo obliga.** Si el recurso suspende
la obligación, se espera.

## 4. Minimización

Se entrega **lo mínimo que la petición exige y nada más**, y esto tiene
consecuencias concretas:

- Nunca un volcado de base de datos, ni el espacio completo de un cliente, ni
  «todas las conversaciones de» nadie.
- Si piden metadatos, no se manda contenido. Si piden un periodo, no se manda
  fuera de él.
- Se **redacta** lo de terceros: en una conversación aparecen dos personas, y la
  que no es objeto de la petición tiene los mismos derechos.
- Se entrega en un formato que permita ver exactamente qué se entregó, y se
  conserva copia de ello.

## 5. Documentación

De cada petición queda registro, exista respuesta o no:

| Qué se anota |
|---|
| Fecha de recepción y vía por la que llegó |
| Autoridad, país, expediente y persona firmante |
| Qué se pidió, textualmente |
| Resultado de la revisión de legalidad, con el razonamiento |
| Qué se entregó, o por qué no se entregó |
| Si se recurrió, y con qué resultado |
| Si se avisó al afectado y al cliente, o por qué no |
| Quién lo tramitó |

El registro lo custodia el CEO, **fuera del producto**: es un asunto de la
sociedad y no del espacio de ningún cliente, y meterlo en la base de datos lo
pondría al alcance de una petición futura.

Se conserva mientras la sociedad exista. Una petición de hace tres años sigue
siendo la que explica por qué se entregó algo.

## 6. Avisar al afectado y al cliente

**Por defecto se avisa**, y solo se calla cuando una orden válida lo prohíbe
expresamente y esa prohibición tiene fundamento legal.

Hay que avisar a dos, no a uno:

- **La persona** cuyos datos se piden.
- **El cliente de Kavea** en cuyo espacio viven esos datos. Las conversaciones
  son de su negocio; que Boosty las custodie no las convierte en suyas. Si la
  petición se refiere a datos de un cliente concreto, lo primero que se valora es
  si la autoridad debe dirigirse a ese cliente y no a Boosty.

Cuando la prohibición de avisar caduque, se avisa entonces.

## 7. Lo que nunca se hace

- Entregar por teléfono, por chat, o a quien no acredite identidad y competencia.
- Dar acceso directo a los sistemas. Se entregan copias de lo pedido, nunca
  credenciales ni una sesión.
- Confirmar o negar la existencia de una cuenta antes de completar la revisión:
  confirmarlo ya es entregar un dato.
- Conceder acceso continuado o automatizado. Cada petición es una petición.

---

## Sobre el App Review de Meta

Este documento es lo que sostiene las cuatro casillas de `requests-4`:

| Casilla del formulario | Sección |
|---|---|
| Required review of the legality of these requests | §2 |
| Provisions for challenging these requests if unlawful | §3 |
| Data minimization policy | §4 |
| Documentation of these requests | §5 |

Si alguna de estas secciones deja de cumplirse en la práctica, la casilla
correspondiente deja de ser verdad y hay que corregir el envío. Un proceso escrito
que nadie sigue es peor que no tenerlo: ante Meta es una declaración falsa, y
ante una autoridad es la prueba de que se sabía qué hacer y no se hizo.
