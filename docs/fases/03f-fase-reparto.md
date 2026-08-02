# Fase 3f — Reparto de conversaciones

**Fecha:** 2 de agosto de 2026
**Posición:** después de la 3e.

---

## 1. Qué se pide

Cuando un cliente tiene varias personas atendiendo, que las conversaciones que
entran se repartan por turnos. Con tres condiciones:

1. Se puede **encender y apagar** por organización.
2. Se elige **quién entra** en el turno, y se puede sacar a alguien en cualquier
   momento.
3. **Toda conversación tiene responsable.** Si el reparto está apagado y nadie
   la ha reclamado, el responsable está vacío: la tiene el sistema, hasta que
   una persona la tome.

---

## 2. La decisión que evita el fallo clásico

> **No hay puntero. Se elige a quien lleva más tiempo sin recibir una.**

Un round robin de manual guarda un cursor —«el último fue el tercero, ahora toca
el cuarto»— y ese cursor se rompe en cuanto la lista cambia: alguien se va de
vacaciones y se le saca del turno, entra una persona nueva, se despide otra. El
cursor apunta a una posición que ya no significa lo mismo, y el reparto se queda
atascado en una persona o salta a otra sin motivo.

En su lugar, cada miembro guarda **cuándo recibió la última conversación**, y al
entrar una nueva se le da a quien lleva más tiempo sin recibir. Es equivalente a
un turno cuando la lista es estable, y se arregla solo cuando no lo es: quien
entra hoy tiene `null` y por tanto pasa el primero; a quien se saca del turno
simplemente deja de considerarse.

**Las asignaciones a mano también cuentan.** Si alguien le pasa cinco
conversaciones a Ana, el reparto automático la salta hasta que le toque de
nuevo. Lo contrario —contar solo las automáticas— repartiría «por turnos» sobre
una carga que ya está desequilibrada, que es justo lo que se quería evitar.

---

## 3. Vacío significa el sistema, no «nadie»

`asignado_a is null` no es un hueco por rellenar: es un estado con nombre. La
conversación está en la bandeja, visible para todos, y **la tiene el sistema**
hasta que alguien la reclame.

Eso cambia dos cosas en la interfaz:

- Donde ponía «Sin asignar» pone **«El sistema»**, porque es lo que es.
- Aparece un botón de **Tomarla**, de un clic. Buscarse a uno mismo en un
  desplegable de doce nombres para reclamar una conversación es fricción que
  acaba en que nadie reclama nada.

---

## 4. Cuándo se reparte

Al **crear la tarjeta**, que es cuando entra la conversación. Lo hace
`tarjeta_de_contacto`, que ya es el único sitio donde nacen.

No se reparte:

- Si el reparto está apagado.
- Si no hay nadie en el turno. La tarjeta nace del sistema y se dice en la
  pantalla; **nunca** se asigna a alguien que no está en el turno solo por
  rellenar el hueco.
- Si la tarjeta ya tiene responsable, que ocurre al reabrir una.

---

## 5. Modelo

```
organizations.reparto_automatico   boolean, por defecto false
organization_members.en_rotacion   boolean, por defecto true
organization_members.ultima_asignacion  timestamptz
```

Nace **apagado**. Encender un reparto automático sin que el cliente lo haya
decidido reparte trabajo real entre personas que no lo esperaban.

`en_rotacion` por defecto **cierto**: quien entra al equipo entra al turno, y se
saca si hace falta. Al revés —entrar fuera y tener que añadirse— hace que el
reparto parezca roto el día que se contrata a alguien.

---

## 6. Tareas

| # | Tarea | Terminada cuando |
|---|---|---|
| T1 | Columnas y RPC de configuración | Se enciende y se saca a alguien del turno desde Equipo |
| T2 | Elección por «quien lleva más sin recibir» | Con tres personas, tres conversaciones seguidas van a tres personas distintas |
| T3 | Reparto al crear la tarjeta | Una conversación nueva entra ya asignada |
| T4 | `ultima_asignacion` la mueve cualquier asignación | Asignar a mano cinco veces a alguien lo saca del turno hasta que le toque |
| T5 | «El sistema» y botón de tomarla | Sin responsable dice El sistema y se reclama de un clic |
| T6 | Aislamiento | No se puede reclamar una tarjeta de otra organización |

---

## 7. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| Repartir a alguien que no está | Conversaciones muertas en la bandeja de quien está de baja | Se saca del turno con un interruptor, y el reparto solo mira a quien está dentro |
| Encenderlo sin querer | Reparte trabajo real entre gente que no lo espera | Nace apagado |
| Que el reparto tape el desequilibrio | Un turno perfecto sobre una carga torcida sigue torcido | Las asignaciones a mano cuentan |
| Sin nadie en el turno | Sería fácil asignar «a cualquiera» por no dejarlo vacío | No se asigna. Se queda del sistema y la pantalla lo dice |

---

## 8. Preguntas abiertas

| # | Qué | Por qué no se decide aquí |
|---|---|---|
| 1 | ¿Reparto por horario o por presencia? | Exige un concepto de disponibilidad que hoy no existe. Con el interruptor se cubre el caso real |
| 2 | ¿Reparto por canal o por embudo? | Solo tiene sentido con equipos especializados. Se ve cuando Boosty tenga más de tres personas |
| 3 | ¿Tope de conversaciones abiertas por persona? | Es otra regla —capacidad, no turno— y se mide antes de inventarla |
| 4 | ¿Reasignar sola una conversación que nadie atiende en X tiempo? | Suena bien y castiga a quien está reunido. Con datos de tiempo de respuesta se decide |
