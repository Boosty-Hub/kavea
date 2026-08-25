/**
 * Receptor de webhooks de Meta.
 *
 * Hace tres cosas y ninguna más: leer los bytes, verificar la firma, escribir.
 * Toda normalización, resolución de tenant y tratamiento de media es fase 2.
 *
 * LA PROPIEDAD MÁS CARA DEL SISTEMA es que este endpoint devuelva 200 pase lo
 * que pase. Tras una hora de entregas fallidas Meta manda "Webhooks Disabled" y
 * DESUSCRIBE la app de esa Página, con resuscripción manual. No es degradación:
 * es apagado por cliente y en silencio.
 *
 * Se despliega con `verify_jwt = false`, fijado en config.toml y no en la
 * bandera de despliegue. Meta no manda bearer token: con la verificación activa
 * la plataforma responde 401 antes de llegar a este código.
 */

/**
 * `EdgeRuntime` lo inyecta la plataforma de Supabase y Deno no lo conoce: sin
 * esta declaración, `deno check` da cuatro «Cannot find name 'EdgeRuntime'»
 * sobre código que funciona perfectamente en producción.
 *
 * Se declara aquí y no se silencia el comprobador. Un `// @ts-ignore` habría
 * tapado también el día que `waitUntil` cambie de forma, y esta función es el
 * receptor de webhooks: lo último que conviene es que deje de comprobarse.
 */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

import { firmaValida, iguales, sha256Hex } from '../_compartido/firma.ts'
import {
  alertar,
  claveBlob,
  guardarEnAmortiguador,
  insertarEvento,
} from '../_compartido/almacen.ts'

// Guarda contra floods. Se fija POR DEBAJO de lo que midan los puntos del acta:
// un 413 a una entrega legítima cuenta como fallo de entrega ante Meta.
const MAX_BYTES = 5 * 1024 * 1024

// El timeout de Postgres es el DISPARADOR del camino de emergencia, no un error.
// Sin él, una base lenta cuelga la función y se come el presupuesto de Meta
// antes de haber intentado siquiera el amortiguador.
const MS_POSTGRES = 1_500
const MS_BLOBS = 1_500

/**
 * Handshake de verificación.
 *
 * No toca Postgres ni Blobs, y eso importa: si Meta revalida el endpoint
 * durante un incidente, no puede fallar por algo que no necesita. Es además lo
 * que usa el vigilante externo.
 */
function handshake(req: Request): Response {
  const p = new URL(req.url).searchParams
  const mode = p.get('hub.mode')
  const token = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')
  const esperado = Deno.env.get('META_VERIFY_TOKEN') ?? ''

  // La comparación del verify token es obligatoria: sin ella cualquiera
  // registra su propio endpoint apuntando al de Kavea. Y va en tiempo
  // constante, porque es un secreto de longitud fija.
  if (mode === 'subscribe' && token && challenge && esperado && iguales(token, esperado)) {
    // El challenge se devuelve CRUDO: sin comillas, sin envolver en JSON y sin
    // salto de línea final. Meta compara byte a byte.
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response('forbidden', { status: 403 })
}

Deno.serve(async (req: Request): Promise<Response> => {
  const t0 = Date.now()

  if (req.method === 'GET') return handshake(req)
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const declarado = Number(req.headers.get('content-length') ?? '0')
  if (declarado > MAX_BYTES) return new Response('payload too large', { status: 413 })

  // Se comprueba la FORMA de la cabecera antes de gastar CPU en el HMAC.
  const cabecera = req.headers.get('x-hub-signature-256')
  if (!cabecera?.startsWith('sha256=')) {
    // Alerta P1 SIN UMBRAL desde el primer fallo: si el App Secret se rota o se
    // copia mal, TODAS las entregas reales fallan aquí y Meta desuscribe en una
    // hora. No hay margen para esperar a que se acumulen.
    EdgeRuntime.waitUntil(alertar('firma_invalida', 'p1', { motivo: 'cabecera ausente' }))
    return new Response('missing signature', { status: 401 })
  }

  // Los BYTES, una sola vez, antes de nada.
  //
  // A partir de aquí req.json(), req.text() y req.formData() lanzan, porque el
  // cuerpo es un stream que solo se consume una vez. req.json() está PROHIBIDO
  // en este handler: no es una preferencia de estilo, es el bug que rompe la
  // firma con tildes y emoji.
  const bytes = new Uint8Array(await req.arrayBuffer())

  if (bytes.byteLength > MAX_BYTES) return new Response('payload too large', { status: 413 })

  const appSecret = Deno.env.get('META_APP_SECRET') ?? ''
  if (!appSecret || !(await firmaValida(bytes, cabecera, appSecret))) {
    EdgeRuntime.waitUntil(
      alertar('firma_invalida', 'p1', {
        bytes: bytes.byteLength,
        secreto_configurado: Boolean(appSecret),
      }),
    )
    // 401, no 200. Una petición forjada no es una entrega de Meta y no debe
    // contar como entregada. El cuerpo NO se guarda en ningún sitio: es
    // contenido controlado por un tercero no autenticado, y meterlo en la cola
    // lo convertiría en entrada del normalizador.
    return new Response('signature mismatch', { status: 401 })
  }

  // Identidad de ingesta: se genera ANTES de intentar escribir y viaja por los
  // dos caminos. Es lo que cierra el duplicado cuando el insert se confirmó
  // pero su respuesta se perdió y el evento acabó también en el amortiguador.
  const ingestaId = crypto.randomUUID()
  const recibidoEn = new Date().toISOString()
  const cuerpoCrudo = new TextDecoder('utf-8').decode(bytes)

  // Metadatos baratos para trazar el enrutado sin parsear de verdad. Si el
  // cuerpo no es JSON válido, no se rompe nada: eso lo decide la fase 2.
  let objeto: string | null = null
  let entryIds: string[] | null = null
  try {
    const v = JSON.parse(cuerpoCrudo) as { object?: string; entry?: Array<{ id?: string }> }
    objeto = typeof v.object === 'string' ? v.object : null
    const ids = (v.entry ?? []).map((e) => e?.id).filter((x): x is string => typeof x === 'string')
    entryIds = ids.length ? ids : null
  } catch {
    // Cuerpo no parseable con firma válida. Se encola igual: la firma dice que
    // viene de Meta, y descartarlo sería perder un evento real.
  }

  // 1. Camino normal: Postgres.
  try {
    await insertarEvento(
      {
        ingesta_id: ingestaId,
        recibido_en: recibidoEn,
        firma_ok: true,
        cuerpo_crudo: cuerpoCrudo,
        cuerpo_bytes: bytes.byteLength,
        ruta: 'directa',
        duracion_ms: Date.now() - t0,
        object: objeto,
        entry_ids: entryIds,
      },
      MS_POSTGRES,
    )

    return new Response('EVENT_RECEIVED', { status: 200 })
  } catch (ePg) {
    // 2. Amortiguador: Netlify Blobs, que no depende de Supabase.
    try {
      await guardarEnAmortiguador(
        claveBlob(recibidoEn, ingestaId),
        bytes,
        {
          ingesta_id: ingestaId,
          recibido_en: recibidoEn,
          bytes: bytes.byteLength,
          sha256: await sha256Hex(bytes),
          motivo: String(ePg).slice(0, 200),
          intentos: 0,
        },
        MS_BLOBS,
      )

      EdgeRuntime.waitUntil(
        alertar('postgres_caido', 'p1', { ingesta_id: ingestaId, motivo: String(ePg).slice(0, 200) }),
      )
      return new Response('EVENT_RECEIVED', { status: 200 })
    } catch (eBlobs) {
      // 3. Los dos almacenes caídos. 500 A PROPÓSITO: Meta reintenta un 500;
      //    un 200 pierde el evento para siempre.
      EdgeRuntime.waitUntil(
        alertar('ingesta_caida_total', 'p1', {
          pg: String(ePg).slice(0, 200),
          blobs: String(eBlobs).slice(0, 200),
        }),
      )
      return new Response('storage unavailable', { status: 500 })
    }
  }
})
