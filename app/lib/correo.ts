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
 * PENDIENTE Y CONOCIDO: el DNS de `kavea.ai` en Resend no está verificado
 * todavía, así que hoy ninguno de los dos correos sale. Las dos rutas lo tratan
 * igual —la invitación EXISTE y se devuelve el enlace para pasarlo a mano— y eso
 * es lo correcto hasta que el dominio esté.
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
