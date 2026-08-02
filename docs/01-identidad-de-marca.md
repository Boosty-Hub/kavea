# Kavea — Libro de identidad de marca

**Versión:** 0.1
**Fecha:** 1 de agosto de 2026
**Responsable:** Gabriel Montiel Toro — Boosty Digital

Documento vivo. Acompaña al documento base del proyecto. Todo lo que está aquí es normativo salvo que se marque como sugerencia.

---

## 1. Fundamento

Kavea viene de *cavea*: la grada semicircular del teatro romano, cuyas proporciones Vitruvio codificó en *De Architectura* con un solo objetivo — que cada voz llegara a todos y nada se perdiera.

La marca no habla de inteligencia artificial. Habla de arquitectura. Ese es el eje de toda la comunicación:

> La IA es el actor en escena. Cualquiera puede contratar un buen actor.
> Lo que decide si el público oye o no es la arquitectura.

Todo lo que sigue —el símbolo, el color, la tipografía— sale de ahí. Si una decisión de diseño no se puede justificar contra esa frase, está de más.

---

## 2. El símbolo

Tres arcos concéntricos y un núcleo sólido. Los arcos son las gradas; el núcleo es la orquesta, el punto donde converge todo lo que se dice.

Se eligió tres arcos y no cuatro por legibilidad: a 24 píxeles, cuatro arcos se cierran y el símbolo se convierte en una mancha. El favicon reduce a dos.

### Construcción

- Semicírculos concéntricos con radios en proporción decreciente constante
- Trazo uniforme, terminaciones redondeadas
- El núcleo es un semicírculo sólido, siempre en terracota
- El símbolo se apoya sobre una línea base implícita, nunca dibujada (excepto en la pieza de la cavea completa)

### Área de protección

Un margen igual al radio del núcleo por los cuatro lados. Nada entra ahí: ni texto, ni bordes, ni otros logos.

### Tamaños mínimos

| Aplicación | Mínimo |
|---|---|
| Isotipo | 24 px de alto |
| Lockup horizontal | 120 px de ancho |
| Lockup vertical | 90 px de ancho |
| Favicon (versión de dos arcos) | 16 px |

### Usos prohibidos

- Rotar el símbolo o voltearlo. Las gradas siempre abren hacia arriba.
- Rellenar el espacio entre arcos.
- Cambiar el número de arcos (salvo el favicon, que ya está definido).
- Poner el núcleo en un color que no sea terracota, o su variante clara sobre fondo oscuro.
- Sombras, degradados, biseles, contornos.
- Estirar en un solo eje.
- Encerrar el logo en un círculo o cuadrado de color.
- Poner el lockup sobre fotografía sin una capa sólida detrás.

---

## 3. Color

### Por qué terracota

Tres razones, en orden de peso:

**Coherencia.** La cavea era piedra y ladrillo. Un producto que se llama así y se pinta de azul cian está peleado consigo mismo.

**Diferenciación.** El vecindario del software conversacional está saturado en tres colores: azul (Intercom), verde (Zendesk, y sobre todo WhatsApp) y naranja brillante (Kommo, HubSpot). El terracota es un naranja desaturado y oscurecido: se lee como tierra, no como alerta.

**Evitar el verde.** Si la plataforma es verde, se lee como un accesorio de WhatsApp. Kavea no es un accesorio de WhatsApp; WhatsApp es uno de sus canales.

> **Riesgo asumido, hay que gestionarlo:** terracota y el naranja de Kommo comparten familia de matiz. Lo que los separa es saturación y luminosidad, no el tono. Si el terracota se usa en superficies grandes y saturadas, la distancia se pierde y el producto empieza a parecerse a lo que vino a reemplazar. **La regla que protege esto: terracota nunca es fondo de área grande.** Vive en acentos, en el núcleo del símbolo, en el botón primario y en los estados de foco.

### Neutros

La base es cálida, no gris azulada. Es lo que hace que el conjunto se sienta a piedra y no a dashboard genérico.

| Nombre | Hex | Uso |
|---|---|---|
| Tinta | `#1A1917` | Texto primario, símbolo en fondo claro |
| Grafito | `#3D3B37` | Texto sobre superficies oscuras claras |
| Piedra | `#6E6A63` | Texto secundario |
| Ceniza | `#A8A39A` | Texto terciario, placeholders, arcos decorativos |
| Cal | `#D9D5CC` | Bordes, separadores |
| Arena | `#F0EDE6` | Superficie elevada, fondo de tarjeta |
| Papel | `#FAF8F4` | Fondo de página |

### Terracota

| Nombre | Hex | Uso |
|---|---|---|
| Terracota 700 | `#6E2E18` | Texto sobre fondo terracota claro |
| Terracota 600 | `#8F3E22` | Estado activo, botón presionado |
| **Terracota 500** | `#B04E2C` | **Principal.** Núcleo del símbolo, botón primario, foco |
| Terracota 400 | `#C9714F` | Variante para fondo oscuro |
| Terracota 200 | `#E8C3B4` | Bordes de énfasis |
| Terracota 100 | `#F3E2DA` | Fondo de destacado sutil |

### Semánticos

El color significa estado. No decora. Cada estado de conversación tiene un color y solo uno.

| Estado | Sólido | Fondo | Significado |
|---|---|---|---|
| En curso | `#2D6CA8` | `#E6EEF6` | Conversación activa con humano o agente |
| Esperando | `#B8862B` | `#F7EFDD` | Sin respuesta del contacto, ventana abierta |
| Escalada | `#A83232` | `#F6E4E4` | Requiere humano ya, o ventana por vencer |
| Resuelta | `#3F7A4E` | `#E7EFE8` | Cerrada |

Nota: el ámbar de "esperando" es tostado, no amarillo. Un amarillo saturado en una bandeja que se mira ocho horas al día cansa la vista y devalúa la urgencia real.

### Modo oscuro

| Rol | Hex |
|---|---|
| Fondo página | `#131211` |
| Superficie | `#1C1A18` |
| Superficie elevada | `#26231F` |
| Borde | `#35322D` |
| Texto primario | `#EDEAE3` |
| Texto secundario | `#A8A39A` |
| Acento | `#C9714F` |

El fondo oscuro nunca es negro puro. `#000` sobre pantallas OLED produce bordes duros y hace que el terracota vibre.

### Tokens listos para copiar

```css
:root {
  --k-tinta:    #1A1917;
  --k-grafito:  #3D3B37;
  --k-piedra:   #6E6A63;
  --k-ceniza:   #A8A39A;
  --k-cal:      #D9D5CC;
  --k-arena:    #F0EDE6;
  --k-papel:    #FAF8F4;

  --k-terra-700: #6E2E18;
  --k-terra-600: #8F3E22;
  --k-terra-500: #B04E2C;
  --k-terra-400: #C9714F;
  --k-terra-200: #E8C3B4;
  --k-terra-100: #F3E2DA;

  --k-curso:     #2D6CA8;  --k-curso-bg:     #E6EEF6;
  --k-esperando: #B8862B;  --k-esperando-bg: #F7EFDD;
  --k-escalada:  #A83232;  --k-escalada-bg:  #F6E4E4;
  --k-resuelta:  #3F7A4E;  --k-resuelta-bg:  #E7EFE8;

  --k-bg:        var(--k-papel);
  --k-surface:   #FFFFFF;
  --k-surface-2: var(--k-arena);
  --k-border:    var(--k-cal);
  --k-text:      var(--k-tinta);
  --k-text-2:    var(--k-piedra);
  --k-accent:    var(--k-terra-500);
}

[data-theme="dark"] {
  --k-bg:        #131211;
  --k-surface:   #1C1A18;
  --k-surface-2: #26231F;
  --k-border:    #35322D;
  --k-text:      #EDEAE3;
  --k-text-2:    #A8A39A;
  --k-accent:    var(--k-terra-400);
}
```

### Reglas de color en el aplicativo

1. **Los neutros hacen el 90% del trabajo.** Si una pantalla tiene color por todas partes, el color dejó de significar algo.
2. **Un solo elemento terracota por vista.** El botón primario, o el foco, no ambos compitiendo.
3. **Terracota es acción y marca. No es un estado.** Ninguna conversación se pinta de terracota.
4. **Nunca comunicar solo con color.** Todo estado lleva etiqueta de texto además del color. Hay gente daltónica en tu base de usuarios.
5. **Contraste mínimo 4.5:1 para texto.** Terracota 500 sobre papel pasa; sobre arena, verificar antes de usar en texto pequeño.

---

## 4. Tipografía

### Familia

**Instrument Sans** para todo: interfaz, wordmark y comunicación. Es una grotesca contemporánea, neutra sin ser anónima, con licencia SIL Open Font License. El archivo variable va incluido en el paquete de marca.

Dos pesos, no más:

- **Regular (400)** — cuerpo de texto, etiquetas, datos
- **Medium (500)** — títulos, wordmark, botones, énfasis

No usar 600 ni 700. Pesan demasiado y rompen la calma que sostiene toda la identidad.

**Monoespaciada:** para IDs de conversación, timestamps, payloads y registros de agente. Recomendación: JetBrains Mono o IBM Plex Mono, ambas OFL. Verificar licencia antes de empaquetar.

### Reglas

- **El wordmark siempre en minúsculas.** `kavea`, nunca `Kavea` ni `KAVEA` como marca gráfica. En texto corrido sí se capitaliza normalmente: "Kavea centraliza tus conversaciones".
- **Sentence case en toda la interfaz.** Botones, títulos, menús, pestañas. Nunca Title Case.
- **Versalitas solo para etiquetas de sistema.** Nombres de canal, estados en tablas densas. Con tracking abierto (0.06em).
- **Sin signos de exclamación en la UI.** El toast de éxito ya es el éxito.

### Escala

| Rol | Tamaño | Peso | Interlineado |
|---|---|---|---|
| Display | 40 px | 500 | 1.1 |
| Título 1 | 28 px | 500 | 1.2 |
| Título 2 | 20 px | 500 | 1.3 |
| Título 3 | 16 px | 500 | 1.4 |
| Cuerpo | 15 px | 400 | 1.6 |
| Secundario | 13 px | 400 | 1.5 |
| Etiqueta | 11 px | 500 | 1.3, tracking 0.06em, versalitas |

---

## 5. Espacio y forma

- **Rejilla base 4 px.** Todo espaciado es múltiplo de 4.
- **Radio de esquina:** 6 px en controles, 12 px en tarjetas, 999 px solo en píldoras de estado.
- **Bordes de 1 px** en color Cal. Nada de bordes gruesos.
- **Sin sombras** salvo en elementos flotantes reales (menús, modales), y ahí suaves.
- **El espacio en blanco es material de construcción.** Es lo que más va a diferenciar a Kavea de Kommo, que se ve apretado. Cuando dudes, quita densidad.

---

## 6. Voz

La voz del producto es la voz GMT aplicada: directa, didáctica, frontal, sin lenguaje de consultor y sin humo.

**Cómo suena:**

| En vez de | Escribe |
|---|---|
| "¡Tu mensaje fue enviado exitosamente!" | "Mensaje enviado" |
| "Por favor, ingrese un nombre" | "Escribe un nombre" |
| "Error: no se pudo conectar" | "No se pudo conectar con WhatsApp. Reintentar" |
| "Potencia tu operación con IA" | "El agente respondió 47 conversaciones esta semana" |
| "Solución omnicanal integral" | "Instagram, Facebook y WhatsApp en una sola bandeja" |

**Reglas:**

- Verbo primero en botones: "Crear plantilla", no "Nueva plantilla".
- Los errores dicen qué pasó y qué hacer. Nunca exponen la excepción cruda.
- Nada de "simplemente", "fácilmente", "potencia", "impulsa", "revoluciona".
- El producto habla como producto, no como Claude. No dice "yo".
- Los estados vacíos son una invitación, no una disculpa. "Conecta tu primer canal", no "No hay nada aquí todavía".

---

## 7. La pieza de la cavea

La ilustración de los arcos con los tres canales convergiendo es la pieza narrativa central. No es el logo: es el argumento hecho imagen. Se usa en portadas, apertura de video, slides de venta y posts de LinkedIn.

Va en tres versiones: fondo claro, fondo oscuro y fondo transparente.

### Cómo animarla

Secuencia sugerida, alrededor de 4 segundos:

1. **0.0 – 1.0 s** — Los arcos se dibujan de afuera hacia adentro, uno por uno, con un trazo progresivo. Retardo de ~0.15 s entre arcos.
2. **1.0 – 1.4 s** — Aparece la línea base.
3. **1.4 – 2.4 s** — Las tres líneas de canal se trazan desde sus etiquetas hacia el centro, simultáneas pero con retardos ligeramente distintos para que no se sienta mecánico.
4. **2.4 – 2.8 s** — El núcleo se enciende: escala del 90% al 100% con la opacidad subiendo.
5. **2.8 – 4.0 s** — Entra el texto, y al final el lockup.

Curvas de aceleración suaves, nada de rebotes. La marca es piedra, no goma.

Los arcos animan bien con `stroke-dasharray` y `stroke-dashoffset` si lo haces en web. En After Effects, un Trim Paths sobre cada arco hace lo mismo.

### Qué no hacer con la pieza

- No añadir más de tres canales. Si hay que mostrar más, se hace otra pieza, no se aprietan más líneas.
- No poner logos de Meta sobre las etiquetas. Los nombres de los canales son propiedad de Meta y meter sus marcas en tu material te obliga a cumplir sus guías de uso, además de que ensucia.
- No convertir los arcos en un círculo completo. Deja de ser una cavea y se vuelve un target.

---

## 8. Archivos entregados

Carpeta `kavea-marca/`:

**Logo**
- `kavea-horizontal-color.svg` / `.png` — uso principal
- `kavea-horizontal-inverso.svg` / `.png` — fondo oscuro
- `kavea-horizontal-tinta.svg` — monocromo, un solo color
- `kavea-horizontal-papel.svg` — monocromo claro, para fondo oscuro o impresión a una tinta
- `kavea-vertical-color.svg` / `.png` — formatos cuadrados, avatares grandes
- `kavea-vertical-inverso.svg` / `.png`

**Isotipo**
- `kavea-isotipo-color.svg` / `.png`
- `kavea-isotipo-tinta.svg`, `kavea-isotipo-papel.svg`, `kavea-isotipo-terracota.svg`
- `kavea-favicon.svg`, `kavea-favicon-inverso.svg`, `kavea-favicon.png` — versión de dos arcos

**Pieza narrativa**
- `kavea-cavea-claro.svg` / `.png`
- `kavea-cavea-oscuro.svg` / `.png`
- `kavea-cavea-transparente.svg` / `.png`

**Tipografía**
- `InstrumentSans-Variable.ttf` — SIL Open Font License

Todos los SVG tienen el texto convertido a trazos, así que se abren igual en cualquier máquina sin la fuente instalada. Los PNG están a 2400–3000 px de ancho, suficiente para 4K.

---

## 9. Pendientes

- [ ] Verificar contraste de terracota 500 sobre arena en texto de 13 px
- [ ] Definir el set de iconos (recomendación: una sola familia de trazo, 1.5 px, sin rellenos)
- [ ] Diseñar la píldora de estado con su micro-copy definitivo
- [ ] Probar el favicon a 16 px en pestaña real de Chrome y Safari
- [ ] Registrar la marca gráfica junto con el nominativo en SAPI, ONAPI e IMPI
- [ ] Decidir si Kavea lleva firma de Boosty ("un producto de Boosty Digital") o se presenta sola desde el día uno
