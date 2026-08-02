import { NextResponse } from 'next/server'
import { organizacionActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Volver a comprobar una conexión, a petición.
 *
 * El cron pasa una vez al día. Quien acaba de arreglar el toggle en Meta no
 * debería esperar hasta mañana para saber si funcionó: la utilidad del panel
 * está en poder repetir la comprobación en cuanto se toca algo.
 *
 * SE COMPRUEBA QUE LA CONEXIÓN ES DE SU ORGANIZACIÓN, y no basta con exigir
 * sesión. La función de diagnóstico corre con clave de servicio y no mira RLS:
 * si esta ruta aceptara cualquier uuid, un miembro de un tenant podría hacer
 * escribir verificaciones sobre la conexión de otro. La comprobación se hace
 * con el cliente del USUARIO, para que sea RLS quien responda y no una condición
 * escrita a mano que algún día se olvide.
 */
export async function POST(req: Request) {
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }
  const org = await organizacionActual()
  if (!org) return NextResponse.json({ error: 'sin organización' }, { status: 403 })

  const { conexion } = await req.json().catch(() => ({ conexion: '' })) as { conexion?: string }
  if (!conexion) return NextResponse.json({ error: 'falta la conexión' }, { status: 400 })

  const supabase = await crearClienteServidor()
  const { data: suya } = await supabase
    .from('meta_connections').select('id').eq('id', conexion).maybeSingle()
  if (!suya) return NextResponse.json({ error: 'esa conexión no existe' }, { status: 404 })

  const url = process.env.KAVEA_FUNCTIONS_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) {
    return NextResponse.json({ error: 'sin configurar' }, { status: 503 })
  }

  try {
    const r = await fetch(`${url}/diagnosticar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conexion, origen: 'panel' }),
      signal: AbortSignal.timeout(30_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.ok ? 200 : 502 })
  } catch {
    // Un timeout no es «la conexión está mal»: es que no pudimos preguntar. La
    // pantalla tiene que poder distinguirlo o dirá una mentira con confianza.
    return NextResponse.json({ error: 'no se pudo comprobar ahora mismo' }, { status: 504 })
  }
}
