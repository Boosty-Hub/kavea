import { NextResponse } from 'next/server'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Responder a un comentario.
 *
 * DOS PASOS Y EN ESTE ORDEN, que no es casual.
 *
 * 1. `responder_comentario` con el cliente del USUARIO. Comprueba sesión y
 *    pertenencia, marca el comentario como respondido y registra la actividad.
 *    Al ir con la sesión del usuario, quién puede responder lo decide RLS y no
 *    una condición escrita aquí que algún día se olvide.
 * 2. La función de borde publica en Meta, que es lo único que necesita el token.
 *
 * SI EL PASO 2 FALLA, EL 1 YA OCURRIÓ: el comentario queda marcado como
 * respondido y en Meta no hay nada. Es el reparto menos malo de los dos: el
 * contrario —publicar primero y registrar después— deja respuestas publicadas
 * que Kavea no sabe que existen, y eso lleva a responder dos veces al mismo
 * cliente en público. Un estado adelantado se corrige a la vista; una respuesta
 * duplicada en Instagram, no.
 *
 * Por eso el error se devuelve tal cual y la pantalla lo enseña: quien respondió
 * tiene que saber que no salió.
 */
export async function POST(req: Request) {
  if ((await superficieActual()) !== 'app') {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }
  if (!(await organizacionActual())) {
    return NextResponse.json({ error: 'sin organización' }, { status: 403 })
  }

  const { comentario, texto } = await req.json().catch(() => ({})) as
    { comentario?: string; texto?: string }
  if (!comentario || !texto?.trim()) {
    return NextResponse.json({ error: 'falta el comentario o el texto' }, { status: 400 })
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .rpc('responder_comentario', { p_comentario: comentario, p_texto: texto })

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })

  const r = data as { comment_id?: string; canal?: string; texto?: string } | null
  if (!r?.comment_id) {
    return NextResponse.json({ error: 'no se pudo preparar la respuesta' }, { status: 500 })
  }

  const url = process.env.KAVEA_FUNCTIONS_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) return NextResponse.json({ error: 'sin configurar' }, { status: 503 })

  try {
    const meta = await fetch(`${url}/responder-comentario`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: r.comment_id, texto: r.texto }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = await meta.json().catch(() => ({}))
    if (!meta.ok) {
      return NextResponse.json(
        { error: j.error ?? 'Meta no aceptó la respuesta.', publicado: false },
        { status: 502 },
      )
    }
    return NextResponse.json({ id: j.id, publicado: true })
  } catch {
    return NextResponse.json(
      { error: 'Meta no contestó a tiempo. El comentario quedó marcado como respondido.', publicado: false },
      { status: 504 },
    )
  }
}
