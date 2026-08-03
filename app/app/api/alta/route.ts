import { NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { esStaff, superficieActual, usuarioActual } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

/**
 * Dar de alta el espacio de un cliente, con su invitación.
 *
 * PASA POR EL SERVIDOR POR LA MISMA RAZÓN QUE `/api/invitar`: el RPC devuelve el
 * token EN CLARO una sola vez para poder meterlo en el correo. Llamarlo desde el
 * navegador lo dejaría en la pestaña de red, en cualquier extensión instalada y
 * en el historial de la consola.
 *
 * Y aquí además el token abre una cuenta de PROPIETARIO en el espacio de un
 * cliente, que es bastante más que una invitación normal.
 */
export async function POST(req: Request) {
  if ((await superficieActual()) !== 'admin') {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }
  const usuario = await usuarioActual()
  if (!usuario) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  if (!(await esStaff())) return NextResponse.json({ error: 'no encontrado' }, { status: 404 })

  const { nombre, slug, huso, correo } = (await req.json()) as {
    nombre?: string; slug?: string; huso?: string; correo?: string
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('crear_espacio', {
    p_nombre: nombre, p_slug: slug, p_huso: huso, p_correo: correo || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const fila = (data as Array<{ organizacion_id: string; invitacion_id: string | null; token: string | null }>)?.[0]
  if (!fila) return NextResponse.json({ error: 'No se pudo crear el espacio.' }, { status: 500 })

  const raiz = process.env.NEXT_PUBLIC_DOMINIO_RAIZ
  const enlace = fila.token ? `https://${slug}.${raiz}/invitacion/${fila.token}` : null

  let correoEnviado = false
  let motivo: string | undefined
  if (correo && enlace) {
    const r = await mandarCorreo(correo, String(nombre), enlace)
    correoEnviado = r.ok
    motivo = r.motivo
  }

  // El espacio EXISTE aunque el correo no salga, y el enlace se devuelve para
  // pasarlo por otro medio. Callarlo dejaría a alguien esperando un correo que
  // no va a llegar, con el espacio ya creado y sin poder entrar.
  return NextResponse.json({
    organizacion: fila.organizacion_id,
    correoEnviado,
    motivo,
    enlace: correoEnviado ? undefined : enlace,
  })
}

async function mandarCorreo(
  destino: string, organizacion: string, enlace: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const clave = process.env.RESEND_API_KEY
  const remite = process.env.CORREO_REMITENTE
  if (!clave || !remite) return { ok: false, motivo: 'no hay correo configurado' }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remite,
        to: destino,
        subject: `Tu espacio de Kavea: ${organizacion}`,
        text:
          `Ya tienes tu espacio de Kavea listo.\n\n`
          + `Entra aquí para crear tu contraseña y empezar:\n${enlace}\n\n`
          + `El enlace vale siete días. Si caduca, pídenos otro.\n`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) return { ok: false, motivo: `el proveedor devolvió ${r.status}` }
    return { ok: true }
  } catch {
    return { ok: false, motivo: 'no hubo respuesta del proveedor de correo' }
  }
}
