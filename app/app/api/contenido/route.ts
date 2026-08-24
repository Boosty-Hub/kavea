import { NextResponse } from 'next/server'
import { organizacionActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Contenido de una Página o de una cuenta de Instagram conectada.
 *
 * QUIÉN PUEDE: cualquier miembro. Esto es LEER lo que el negocio ya publicó en
 * sus propias redes —no toca credenciales, no envía nada, no cambia nada—, así
 * que exigir `conectar` aquí sería la misma confusión que ya costó un camino
 * muerto hoy: la guarda tiene que pesar lo que pesa la acción.
 *
 * QUE LA CONEXIÓN SEA DE ESTE ESPACIO lo garantiza la comprobación de abajo, con
 * el cliente del USUARIO para que la lea RLS. Sin eso, un id de conexión ajeno
 * en el cuerpo sacaría contenido de la Página de otro cliente.
 */
export async function POST(req: Request) {
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }
  const org = await organizacionActual()
  if (!org) return NextResponse.json({ error: 'no encontrado' }, { status: 404 })

  const { accion, conexion } = (await req.json().catch(() => ({}))) as {
    accion?: string
    conexion?: string
  }
  if (!conexion) return NextResponse.json({ error: 'falta la conexión' }, { status: 400 })

  const supabase = await crearClienteServidor()
  const { data: suya } = await supabase
    .from('meta_connections')
    .select('id')
    .eq('id', conexion)
    .maybeSingle()
  if (!suya) return NextResponse.json({ error: 'no encontrado' }, { status: 404 })

  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) return NextResponse.json({ error: 'sin configurar' }, { status: 503 })

  try {
    const r = await fetch(`${base}/meta-contenido`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, conexion }),
      // Cuatro llamadas a Graph en paralelo del lado de la Página. Se le da aire.
      signal: AbortSignal.timeout(45_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json({ error: 'Meta tardó demasiado en responder.' }, { status: 504 })
  }
}
