import { NextResponse } from 'next/server'
import { enviar, listar } from '@/lib/correos'

export const dynamic = 'force-dynamic'

/**
 * Responder un correo desde el panel.
 *
 * EL NAVEGADOR MANDA UN ID, NO UN DESTINATARIO
 *
 * La tentación es que el cliente mande `para`, `asunto` y las cabeceras de hilo
 * ya montadas, y aquí solo reenviar. Eso convertiría esta ruta en un relé que
 * manda correo desde `support@kavea.ai` a donde le digan: bastaría con engañar
 * al navegador de alguien del staff, o con que un día alguien pruebe la ruta a
 * mano. Solo llega el id del correo al que se responde, y el destinatario se
 * saca de la base.
 *
 * LOS PERMISOS NO SE COMPRUEBAN AQUÍ. Los comprueba cada RPC con la sesión de
 * quien llama, igual que en `/api/invitar`. Tener la regla en dos sitios es
 * acordarse de actualizar uno.
 */
export async function POST(req: Request) {
  const { correoId, texto } = (await req.json()) as { correoId?: string; texto?: string }

  if (!correoId || !texto?.trim()) {
    return NextResponse.json({ error: 'Faltan el correo o el texto.' }, { status: 400 })
  }

  // `listar` pasa por `panel_correos`, que exige staff: si quien llama no lo es,
  // esto revienta antes de mandar nada.
  let original
  try {
    original = (await listar()).find((c) => c.id === correoId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  if (!original) {
    return NextResponse.json({ error: 'Ese correo no está en la bandeja.' }, { status: 404 })
  }
  if (original.direccion !== 'entrante') {
    return NextResponse.json({ error: 'Eso ya es un correo enviado.' }, { status: 400 })
  }

  // Quien contesta es quien escribió, no la dirección a la que llegó. Si el
  // correo trae `Reply-To`, esa manda: es para lo que existe.
  const destino = original.responder_a[0] ?? original.de
  const asunto = original.asunto
    ? /^re:/i.test(original.asunto) ? original.asunto : `Re: ${original.asunto}`
    : 'Respuesta de Kavea'

  const r = await enviar({
    para: [destino],
    asunto,
    texto: texto.trim(),
    enRespuestaA: { messageId: original.message_id, referencias: original.referencias },
  })

  if (!r.ok) return NextResponse.json({ error: r.motivo ?? 'No se pudo enviar.' }, { status: 502 })

  return NextResponse.json({ ok: true, id: r.id, motivo: r.motivo })
}
