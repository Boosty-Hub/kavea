import { NextResponse } from 'next/server'
import { esStaff, superficieActual, usuarioActual } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

/**
 * La puerta del navegador al portafolio de Meta.
 *
 * Detrás hay una función de borde que usa el token con el que se puede escribir
 * en nombre de 28 Páginas. Esta ruta existe para que ese poder no dependa de una
 * sola comprobación: aquí se exige subdominio de admin, sesión y staff, ANTES de
 * que la clave de servicio salga de este proceso.
 *
 * `superficieActual() !== 'admin'` no es redundante con `esStaff()`. Una persona
 * de Boosty también es usuaria de su propio espacio de cliente: sin esta línea,
 * su sesión normal en `boosty.kavea.ai` podría llamar a esto desde cualquier
 * pestaña. La superficie separa los dos sombreros de la misma persona.
 */
export async function POST(req: Request) {
  if ((await superficieActual()) !== 'admin') {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }
  if (!(await esStaff())) {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }

  const url = process.env.KAVEA_FUNCTIONS_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) {
    return NextResponse.json({ error: 'sin configurar' }, { status: 503 })
  }

  const cuerpo = await req.json().catch(() => ({}))

  try {
    const r = await fetch(`${url}/portafolio`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      // Listar las 28 Páginas tarda: son varias llamadas al grafo con paginación.
      signal: AbortSignal.timeout(45_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json({ error: 'Meta no respondió a tiempo.' }, { status: 504 })
  }
}
