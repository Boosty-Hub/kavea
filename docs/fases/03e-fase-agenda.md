# Fase 3e — Tareas, calendario y centro de notificaciones

**Fecha:** 2 de agosto de 2026
**Posición:** después de la 3d. No bloquea a la 4, ya terminada.

---

## 1. Dos cosas que se parecen y no son lo mismo

Kavea ya tiene un registro de actividad. Añadir notificaciones encima invita a
confundirlas, y confundirlas produce o un registro lleno de ruido o un centro de
notificaciones que nadie mira.

| | `actividades` | `notificaciones` |
|---|---|---|
| Qué es | Lo que **pasó** | Lo que **alguien tiene que saber** |
| De quién | De la organización | De una persona concreta |
| Se borra | Nunca. Es auditoría | Se marca leída y se archiva |
| Quién la escribe | Todo RPC que cambia algo | Solo unos pocos disparadores |
| Cuántas | Todas | Las menos posibles |

La regla que las separa: **una actividad se escribe siempre; una notificación
solo si hay alguien a quien le cambia el día.** Si de cada actividad saliera una
notificación, el centro sería una segunda copia del registro y quedaría
inservible en una semana.

**Y la regla que más protege el centro: nadie se notifica a sí mismo.** Si
cierro yo la conversación, no me llega un aviso de que se cerró. Parece obvio y
es lo primero que se rompe cuando el disparador vive en un trigger que no sabe
quién actuó.

---

## 2. Tareas

```
tareas(id, organization_id, tarjeta_id?, titulo, detalle,
       vence_en, recordar_en, asignado_a, completada_en, completada_por, creada_por)
```

- **`tarjeta_id` es opcional.** «Llamar al proveedor» no cuelga de ninguna
  conversación, y obligar a inventarse una para poder apuntarla es cómo se
  consigue que la gente use su móvil en vez del sistema.
- **`vence_en` con hora, no solo fecha.** «Llamar mañana» y «llamar mañana a las
  9» son recordatorios distintos, y el segundo es el que sirve.
- **`recordar_en` separado del vencimiento.** Avisar cuando ya venció es llegar
  tarde por diseño. Por defecto se pone antes; la interfaz ofrece atajos.
- **Sin repeticiones en esta fase.** Una tarea recurrente exige decidir qué pasa
  cuando se completa tarde, cuando se salta una y cuando se cambia la regla a
  mitad. Es una fase propia, no una columna.

**Vencida se calcula, no se guarda**, igual que en los documentos de la 3d:
`vence_en < now() and completada_en is null`. Un estado almacenado necesita un
cron que lo mantenga y alguien que note el día que deje de correr.

---

## 3. Calendario

Vista de mes en `/agenda`, con las tareas colocadas por `vence_en`.

- El día de hoy marcado, y los días con tareas vencidas en el color de escalada.
- Un clic en la tarea lleva a su conversación si la tiene.
- Filtro por responsable, con «solo las mías» por defecto: un calendario de todo
  el equipo es un calendario que nadie mira.

Sin vista de semana ni de día en esta fase, y sin arrastrar para cambiar la
fecha. El mes resuelve la pregunta que se hace de verdad —«¿qué tengo esta
semana?»— y lo demás se añade cuando alguien lo pida.

---

## 4. Notificaciones

```
notificaciones(id, organization_id, user_id, tipo, titulo, cuerpo,
               enlace, tarjeta_id?, leida_en, created_at)
```

### 4.1 Qué genera una

| Disparador | A quién |
|---|---|
| Te asignan una conversación | Al nuevo responsable |
| Entra un mensaje en una conversación tuya | Al responsable |
| Una tarea tuya llega a su `recordar_en` | Al responsable |
| Una tarea tuya vence sin completar | Al responsable |
| Un canal se desconecta o Meta lo restringe | A quien administra |

Y nada más. Cada disparador nuevo se añade con la pregunta delante: *¿esto le
cambia el día a alguien, o solo es que pasó?*

### 4.2 Se agrupan, no se acumulan

Diez mensajes seguidos en la misma conversación producen **una** notificación,
no diez. Índice único parcial sobre `(user_id, tarjeta_id, tipo)` mientras esté
sin leer; el disparador actualiza la que hay en vez de insertar otra.

Sin eso, media hora sin mirar la pantalla deja un centro con cuarenta líneas de
la misma conversación, y la reacción de cualquiera es marcar todo como leído sin
mirarlo. Una bandeja de notificaciones que se vacía a ciegas no notifica.

### 4.3 Cómo llegan

- **En la aplicación**, con contador en la cabecera y tiempo real por el mismo
  canal Broadcast que ya usa la bandeja.
- **Por correo**, solo lo que no se leyó en la aplicación pasado un rato, y
  agrupado. Un correo por notificación es la forma más rápida de que alguien
  cree un filtro y no vuelva a leer ninguno. Queda para la siguiente fase.

---

## 5. Tareas de la fase

| # | Tarea | Terminada cuando |
|---|---|---|
| T1 | Migración de `tareas` y `notificaciones` | Existen con RLS y sin escritura directa |
| T2 | RPC de crear, completar y reprogramar | Todo deja actividad |
| T3 | Disparadores de notificación, con la regla de no notificarse a uno mismo | Cerrar mi propia conversación no me notifica |
| T4 | Agrupación de notificaciones sin leer | Diez mensajes producen una |
| T5 | Cron de recordatorios y vencimientos | Una tarea con `recordar_en` pasado genera su aviso una sola vez |
| T6 | Tareas dentro de la conversación | Se crea desde el hilo y sale en la ficha |
| T7 | Calendario mensual | Se ve el mes y se filtra por responsable |
| T8 | Centro de notificaciones con contador | Se marca leída y el contador baja en vivo |
| T9 | Aislamiento | La suite cubre `tareas` y `notificaciones` |

---

## 6. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| El centro se convierte en una copia del registro | Deja de mirarse en una semana | Lista cerrada de disparadores, y la pregunta delante de cada uno nuevo |
| Notificarse a uno mismo | Ruido inmediato y evidente | El disparador compara con `auth.uid()`; hay una comprobación en la suite |
| El cron duplica recordatorios | Un aviso repetido cada minuto es peor que ninguno | `recordado_en` se marca en la misma transacción que crea la notificación |
| Calendario de todo el equipo | Nadie mira un calendario que no es suyo | «Solo las mías» por defecto |
| Tareas sin responsable | Nadie las hace y nadie lo nota | `asignado_a` obligatorio; por defecto, quien la crea |

---

## 7. Definición de terminado

- [ ] Se crea una tarea desde una conversación y aparece en el calendario.
- [ ] Su recordatorio genera una notificación una sola vez.
- [ ] Diez mensajes en la misma conversación producen una notificación, no diez.
- [ ] Cerrar mi propia conversación no me notifica nada.
- [ ] El contador de la cabecera baja al marcar leída, sin recargar.
- [ ] La suite de aislamiento sigue en verde.

---

## 8. Preguntas abiertas

| # | Qué | Por qué no se decide aquí |
|---|---|---|
| 1 | ¿Tareas recurrentes? | Exige decidir qué pasa al completar tarde, al saltarse una y al cambiar la regla. Fase propia |
| 2 | ¿Resumen por correo, con qué frecuencia? | Depende de cómo trabaje el equipo de Boosty. Se mide con el centro en uso |
| 3 | ¿Notificaciones del navegador? | Piden permiso al usuario y un service worker. Solo compensa si el centro se queda corto |
| 4 | ¿El calendario muestra también los vencimientos de documentos de la 3d? | Son fechas de cobro, no tareas de alguien. Se decide viendo si estorban |
