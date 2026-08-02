/**
 * Canario del amortiguador.
 *
 * Ejercita el MISMO módulo que usa el receptor en su camino de emergencia. Es
 * lo único que demuestra que ese camino funciona sin esperar a una caída real
 * de Postgres, que es justo cuando no se puede depurar nada.
 *
 * El plan de la fase 1 lo pide como canario diario: el token de Netlify es una
 * credencial de larga vida en un camino que casi nunca se recorre, así que
 * puede caducar o revocarse y nadie se entera hasta el peor momento posible.
 *
 * Protegido por un secreto propio: no es un endpoint público.
 */

import { claveBlob, guardarEnAmortiguador } from '../_compartido/almacen.ts'
import { sha256Hex } from '../_compartido/firma.ts'

Deno.serve(async (req: Request): Promise<Response> => {
  const esperado = Deno.env.get('KAVEA_CANARIO_TOKEN') ?? ''
  const dado = new URL(req.url).searchParams.get('t') ?? ''
  if (!esperado || dado !== esperado) return new Response('forbidden', { status: 403 })

  const ingestaId = crypto.randomUUID()
  const recibidoEn = new Date().toISOString()
  const bytes = new TextEncoder().encode(
    JSON.stringify({ canario: true, ingesta_id: ingestaId, recibido_en: recibidoEn }),
  )

  const diagnostico: Record<string, unknown> = {
    site_id_presente: Boolean(Deno.env.get('NETLIFY_BLOBS_SITE_ID')),
    token_presente: Boolean(Deno.env.get('NETLIFY_BLOBS_TOKEN')),
    clave: claveBlob(recibidoEn, ingestaId),
  }

  try {
    await guardarEnAmortiguador(
      `canario/${recibidoEn.replace(/[:.]/g, '-')}_${ingestaId}`,
      bytes,
      { ingesta_id: ingestaId, recibido_en: recibidoEn, sha256: await sha256Hex(bytes) },
      5_000,
    )
    return new Response(JSON.stringify({ ok: true, ...diagnostico }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 400), ...diagnostico }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
})
