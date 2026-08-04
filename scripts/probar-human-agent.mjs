// Prueba la feature Human Agent enviando dentro del tramo de 24 h a 7 días.
//
// PARA QUÉ EXISTE
//
// El App Review exige, por cada permiso y por cada feature, al menos una llamada
// exitosa en los 30 días previos al envío, más un screencast. Human Agent es la
// única que no se puede provocar a voluntad: solo es válida ENTRE las 24 horas y
// los 7 días desde el último mensaje entrante de la conversación. Antes de las
// 24 h no hace falta —la mensajería estándar funciona— y después de los 7 días
// ya no hay tag vivo.
//
// Así que hay que esperar. Este script es esa espera, automatizada.
//
// POR QUÉ NO LEE LA BASE DE DATOS
//
// Podría sacar `last_incoming_at` de `conversations`, pero eso exigiría la clave
// de servicio como secreto del repositorio. Una clave que salta RLS, en un runner
// de CI, para una comprobación puntual, es un intercambio malo: el radio de daño
// si se filtra es toda la base de todos los tenants. La marca del entrante se
// pasa por parámetro y se documenta.
//
// LA VENTANA DE 12 HORAS NO ES CAPRICHO
//
// El cron corre una vez al día. Si la condición fuera solo «han pasado más de
// 24 h», mandaría un mensaje cada día hasta que se cerraran los 7. Exigiendo
// entre 24 y 36 horas, solo UNA ejecución del cron cae dentro, y no hace falta
// guardar estado en ningún sitio para no repetirse.

import { appendFileSync } from 'node:fs'

const V = process.env.GRAPH_API_VERSION ?? 'v26.0'
const TOKEN = process.env.META_TOKEN_SISTEMA
const PAGE_ID = process.env.META_PAGE_ID ?? '1790677317841377'
const DESTINO = process.env.META_DESTINATARIO ?? '5459774160782937'
const ENTRANTE = process.env.META_ULTIMO_ENTRANTE ?? '2026-08-04T02:32:08.787Z'
const FORZAR = (process.env.FORZAR ?? '').toLowerCase() === 'true'

// SIMULAR existe porque su ausencia costó un mensaje real. Probando las cuatro
// ramas de la ventana con marcas de tiempo inventadas, la rama buena hizo lo que
// tenía que hacer: enviar. A una persona de verdad, a las once de la noche.
//
// Cualquier script que mande algo hacia fuera necesita una forma de ejercitarse
// sin mandarlo. No es comodidad, es que la alternativa es descubrir el camino
// feliz en producción.
const SIMULAR = (process.env.SIMULAR ?? '').toLowerCase() === 'true'
const TEXTO = process.env.META_TEXTO ?? 'Retomamos por aquí desde Kavea. Un agente humano sigue tu caso.'

const HORA = 3600_000

function resumen(lineas) {
  const salida = lineas.join('\n')
  console.log(salida)
  // El resumen del paso es lo que se lee sin abrir los registros. Un job verde
  // que no dice qué hizo obliga a entrar a mirar, y entonces nadie mira.
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, salida + '\n')
  }
}

function salir(codigo, lineas) {
  resumen(lineas)
  process.exit(codigo)
}

if (!TOKEN) {
  salir(1, ['## Human Agent', '', 'Falta el secreto `META_TOKEN_SISTEMA`.'])
}

const desde = new Date(ENTRANTE)
if (Number.isNaN(desde.getTime())) {
  salir(1, ['## Human Agent', '', `\`META_ULTIMO_ENTRANTE\` no es una fecha: ${ENTRANTE}`])
}

const horas = (Date.now() - desde.getTime()) / HORA

// El orden importa, y la primera versión lo tenía mal: el límite duro de los 7
// días se comprueba ANTES que la ventana de esta ejecución. Si no, un entrante de
// hace nueve días se reportaba como «no es esta ejecución» —que suena a «vuelve
// mañana»— cuando en realidad la conversación ya no admite el tag y hace falta un
// mensaje nuevo. Dos estados muy distintos con el mismo mensaje.
//
// TODAS LAS SALIDAS DE VENTANA SON VERDES. Que no toque enviar no es un fallo, y
// un job rojo cada día entrena a la gente a ignorarlo. Cuando la feature esté
// verificada, este workflow se borra: eso es el final, no un job en verde para
// siempre.
if (!FORZAR) {
  if (horas < 24) {
    salir(0, [
      '## Human Agent — todavía no',
      '',
      `Han pasado ${horas.toFixed(1)} h desde el último entrante (${ENTRANTE}).`,
      'El tag solo es válido a partir de las 24 h. No se envía nada.',
    ])
  }
  if (horas > 24 * 7) {
    salir(0, [
      '## Human Agent — ventana cerrada',
      '',
      `Han pasado ${horas.toFixed(1)} h, más de los 7 días: HUMAN_AGENT ya no es`,
      'válido en esta conversación.',
      '',
      'Para reintentar hace falta un mensaje entrante NUEVO. Manda un DM a',
      'Boosty.digital, espera 24 h y actualiza `META_ULTIMO_ENTRANTE`. Y si la',
      'feature ya está verificada, borra este workflow.',
    ])
  }
  if (horas >= 36) {
    salir(0, [
      '## Human Agent — no es esta ejecución',
      '',
      `Han pasado ${horas.toFixed(1)} h. El script solo envía entre las 24 y las 36 h`,
      'para no mandar un mensaje al día durante toda la semana. Si hay que',
      'reintentar dentro de la ventana, lanza el workflow a mano con `forzar: true`.',
    ])
  }
}

const pt = await fetch(`https://graph.facebook.com/${V}/${PAGE_ID}?fields=access_token`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json())

if (!pt.access_token) {
  salir(1, [
    '## Human Agent — sin Page Access Token',
    '',
    'No se pudo derivar el token de la Página. Lo más probable es que el token de',
    'sistema haya caducado: un user token vive semanas, y para esto hace falta uno',
    'de system user con caducidad `Never`.',
    '', '```json', JSON.stringify(pt).slice(0, 500), '```',
  ])
}

// La forma es la de `supabase/functions/despachar`: Instagram va a /me/messages
// con form-data. Comprobado el 3 de agosto de 2026 que /{ig-user-id}/messages
// devuelve error #3 «Application does not have the capability».
const cuerpo = new URLSearchParams()
cuerpo.set('recipient', JSON.stringify({ id: DESTINO }))
cuerpo.set('message', JSON.stringify({ text: TEXTO }))
cuerpo.set('messaging_type', 'MESSAGE_TAG')
cuerpo.set('tag', 'HUMAN_AGENT')

if (SIMULAR) {
  salir(0, [
    '## Human Agent — simulación',
    '',
    `Horas desde el entrante: **${horas.toFixed(1)}**. La ventana lo permite y el Page`,
    'Access Token se obtuvo bien, así que el envío habría salido.',
    '',
    `Destinatario: \`${DESTINO}\``,
    '', '```', [...cuerpo.entries()].map(([k, v]) => `${k}=${v}`).join('\n'), '```',
    '',
    'No se ha mandado nada. Quita `SIMULAR` para enviar de verdad.',
  ])
}

const r = await fetch(`https://graph.facebook.com/${V}/me/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${pt.access_token}` },
  body: cuerpo,
})
const j = await r.json()

if (!r.ok || j.error) {
  salir(1, [
    '## Human Agent — el envío falló',
    '',
    `Horas desde el entrante: ${horas.toFixed(1)}`,
    '', '```json', JSON.stringify(j, null, 2).slice(0, 1200), '```',
    '',
    'Si el código es 10 o 2018278, el tag no está concedido y hace falta el App',
    'Review de la feature. Cualquier otro código es un problema distinto.',
  ])
}

salir(0, [
  '## Human Agent — enviado',
  '',
  `Horas desde el entrante: **${horas.toFixed(1)}**, dentro del tramo de 24 h a 7 días.`,
  `Destinatario: \`${DESTINO}\``,
  `Message ID: \`${j.message_id ?? '(sin id)'}\``,
  '',
  'La llamada queda contada para el App Review de la feature. El screencast sigue',
  'siendo a mano: hay que grabar la pantalla de Kavea haciendo esto, no este job.',
])
