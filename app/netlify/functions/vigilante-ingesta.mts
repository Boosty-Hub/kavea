import type { Config } from '@netlify/functions'

/**
 * Vigilante externo de la ingesta.
 *
 * POR QUÉ VIVE FUERA DE SUPABASE, que es todo el sentido de esta función:
 *
 * Si el proyecto de Supabase cae entero, se apagan a la vez el receptor, la
 * base y los crones. Las alertas se escriben en Postgres, así que tampoco hay
 * alerta. Nadie se entera hasta que un cliente pregunta por qué no le llegan
 * mensajes — y para entonces Meta ya desuscribió las Páginas, porque lo hace
 * tras una hora de entregas fallidas.
 *
 * Este vigilante es lo único del sistema que puede avisar de eso, precisamente
 * porque no comparte nada con lo que vigila.
 *
 * Hace el handshake, que es la operación más barata del receptor y la única que
 * no toca ni Postgres ni el amortiguador. Si responde, la ingesta está viva.
 */

const URL_RECEPTOR = process.env.KAVEA_URL_RECEPTOR!
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN!
const RESEND_KEY = process.env.RESEND_API_KEY
const AVISAR_A = process.env.KAVEA_ALERTA_CORREO ?? 'support@kavea.ai'

/** Dos fallos seguidos antes de avisar: un timeout suelto no es una caída. */
const FALLOS_PARA_ALERTAR = 2

async function avisar(asunto: string, cuerpo: string): Promise<void> {
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Kavea <no-reply@kavea.ai>',
      to: [AVISAR_A],
      subject: asunto,
      text: cuerpo,
    }),
  }).catch(() => {
    // Si Resend tampoco responde no hay nada más que hacer desde aquí.
  })
}

export default async function vigilante(): Promise<Response> {
  const desafio = String(Math.floor(Math.random() * 1e9))
  const url =
    `${URL_RECEPTOR}?hub.mode=subscribe&hub.challenge=${desafio}` +
    `&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}`

  let fallos = 0
  let ultimoMotivo = ''

  for (let i = 0; i < FALLOS_PARA_ALERTAR; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8_000) })
      const cuerpo = (await r.text()).trim()

      // No basta con un 200: el receptor tiene que devolver EL desafío. Un 200
      // con otro cuerpo significa que algo se interpuso en el camino.
      if (r.ok && cuerpo === desafio) {
        return Response.json({ ok: true, intentos: i + 1 })
      }
      fallos++
      ultimoMotivo = `HTTP ${r.status}, cuerpo ${cuerpo.slice(0, 60)}`
    } catch (e) {
      fallos++
      ultimoMotivo = String(e).slice(0, 120)
    }
    if (i < FALLOS_PARA_ALERTAR - 1) await new Promise((r) => setTimeout(r, 3_000))
  }

  await avisar(
    'Kavea: la ingesta no responde',
    [
      'El vigilante externo no obtuvo respuesta del receptor de webhooks.',
      '',
      `Endpoint : ${URL_RECEPTOR}`,
      `Intentos : ${fallos}`,
      `Motivo   : ${ultimoMotivo}`,
      `Momento  : ${new Date().toISOString()}`,
      '',
      'Meta desuscribe las Paginas tras una hora de entregas fallidas, y lo hace',
      'en silencio y por cliente. El cron de reconciliacion las recupera cuando el',
      'servicio vuelva, pero los eventos de la ventana se pierden.',
    ].join('\n'),
  )

  return Response.json({ ok: false, fallos, motivo: ultimoMotivo }, { status: 503 })
}

export const config: Config = {
  // Cada minuto. Es la resolución que importa cuando el reloj de Meta corre a
  // una hora.
  schedule: '* * * * *',
}
