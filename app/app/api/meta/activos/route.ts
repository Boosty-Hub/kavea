import { NextResponse } from 'next/server'
import { organizacionActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Lo que la autorización de Facebook deja ver, y activarlo.
 *
 * `POST { accion: 'listar' | 'activar', page_id? }`, desde el subdominio del
 * cliente.
 *
 * LA ORGANIZACIÓN SALE DEL HOST, bajo RLS, no de un parámetro: el único espacio
 * cuyos canales se pueden tocar es aquel en cuyo subdominio estás. Y quién
 * puede lo decide `puede(org,'conectar')`, que es solo `owner` — la misma regla
 * que abre el diálogo, porque activar una Página tiene exactamente las mismas
 * consecuencias que conectarla: credenciales y webhooks.
 *
 * El BISU no pasa por aquí. Vive cifrado en `private` y solo lo descifra el
 * borde; esta ruta autoriza y encamina.
 */
export async function POST(req: Request) {
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }

  const org = await organizacionActual()
  if (!org) return NextResponse.json({ error: 'no encontrado' }, { status: 404 })

  const supabase = await crearClienteServidor()
  const { data: puede } = await supabase.rpc('puede', { org: org.id, accion: 'conectar' })
  if (puede !== true) {
    return NextResponse.json(
      { error: 'Solo el propietario del espacio puede conectar canales.' },
      { status: 403 },
    )
  }

  const { accion, page_id } = (await req.json().catch(() => ({}))) as {
    accion?: string
    page_id?: string
  }

  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) {
    return NextResponse.json({ error: 'sin configurar' }, { status: 503 })
  }

  try {
    const r = await fetch(`${base}/meta-activos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: accion === 'activar' ? 'activar' : 'listar',
        organizacion: org.id,
        page_id,
      }),
      // Activar son cinco llamadas a Graph encadenadas más el rediagnóstico.
      signal: AbortSignal.timeout(accion === 'activar' ? 75_000 : 30_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json(
      { error: 'Meta tardó demasiado en responder. Vuelve a intentarlo.' },
      { status: 504 },
    )
  }
}
