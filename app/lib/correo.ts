import 'server-only'

/**
 * Quién manda los correos de Kavea, en un solo sitio.
 *
 * Estaba escrito a mano dentro de `/api/invitar`, y al añadir `/api/alta` puse
 * ahí una variable de entorno con otro nombre —`CORREO_REMITENTE`— que no existe
 * en Netlify. Resultado: el correo del alta no se habría enviado nunca, y como
 * la ruta degrada con elegancia y devuelve el enlace, no habría fallado nada
 * visible. Dos remitentes distintos para el mismo producto, uno de ellos roto y
 * callado.
 *
 * EL DNS YA ESTÁ. Comprobado por API el 3 de agosto de 2026: `kavea.ai` está
 * `verified` en Resend desde el 2 de agosto a las 05:39 UTC, con `sending` y
 * `receiving` habilitados, y la invitación a gmontiel+kavea@spatiumgroup.com se
 * entregó ese mismo día a las 19:55. Este comentario decía lo contrario y se
 * quedó desactualizado: si el correo falla hoy, la causa es otra.
 *
 * Aun así las dos rutas siguen degradando con elegancia —la invitación EXISTE y
 * se devuelve el enlace para pasarlo a mano—, y eso no se toca: Resend puede
 * fallar cualquier martes y una invitación creada en silencio es lo peor de los
 * dos mundos.
 */
export const REMITENTE = 'Kavea <support@kavea.ai>'

export async function mandarCorreo(
  destino: string,
  asunto: string,
  texto: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const clave = process.env.RESEND_API_KEY
  if (!clave) return { ok: false, motivo: 'no hay proveedor de correo configurado' }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE, to: [destino], subject: asunto, text: texto }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) {
      // El motivo se recorta y se guarda: «el proveedor devolvió 403» no dice
      // nada, y el 403 de Resend cuando el dominio no está verificado es
      // exactamente el caso que hay hoy.
      const detalle = (await r.text().catch(() => '')).slice(0, 160)
      return { ok: false, motivo: `el proveedor devolvió ${r.status}${detalle ? `: ${detalle}` : ''}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, motivo: 'no hubo respuesta del proveedor de correo' }
  }
}
