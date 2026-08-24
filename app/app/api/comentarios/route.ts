import { NextResponse } from 'next/server'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Responder a un comentario y moderarlo.
 *
 * DOS PASOS Y EN ESTE ORDEN, que no es casual.
 *
 * 1. El RPC con el cliente del USUARIO. Comprueba sesión y pertenencia, y
 *    registra. Al ir con la sesión del usuario, quién puede hacer qué lo decide
 *    la base y no una condición escrita aquí que algún día se olvide.
 * 2. La función de borde habla con Meta, que es lo único que necesita el token.
 *
 * AL RESPONDER, SI EL PASO 2 FALLA, EL 1 YA OCURRIÓ: el comentario queda marcado
 * como respondido y en Meta no hay nada. Es el reparto menos malo de los dos: el
 * contrario —publicar primero y registrar después— deja respuestas publicadas
 * que Kavea no sabe que existen, y eso lleva a responder dos veces al mismo
 * cliente en público. Un estado adelantado se corrige a la vista; una respuesta
 * duplicada en Instagram, no.
 *
 * AL MODERAR es al revés y por el mismo criterio: `moderar_comentario` autoriza
 * pero no cambia nada, y la fila se anota cuando Meta ya dijo que sí. Ahí no hay
 * nada que se duplique por esperar, y decir «oculto» de algo que Meta rechazó
 * sería una pantalla que miente.
 */
export async function POST(req: Request) {
  if ((await superficieActual()) !== 'app') {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }
  const usuario = await usuarioActual()
  if (!usuario) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  const org = await organizacionActual()
  if (!org) return NextResponse.json({ error: 'sin organización' }, { status: 403 })

  const { comentario, texto, accion } = await req.json().catch(() => ({})) as
    { comentario?: string; texto?: string; accion?: string }

  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) return NextResponse.json({ error: 'sin configurar' }, { status: 503 })

  const supabase = await crearClienteServidor()

  /**
   * Traer de Meta lo que el webhook no trajo.
   *
   * La organización va por parámetro, pero NO viene del cuerpo de la petición:
   * la resuelve el servidor desde el Host y la sesión. Es la diferencia entre
   * decirle a la función de borde a quién sirve y dejar que lo diga el
   * navegador. Antes no iba ninguna y la función cogía la primera cuenta de la
   * tabla entera, que con tres conectadas es la de otro.
   */
  if (accion === 'sincronizar') {
    try {
      const s = await fetch(`${base}/sincronizar-comentarios`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizacion: org.id }),
        signal: AbortSignal.timeout(60_000),
      })
      return NextResponse.json(await s.json().catch(() => ({})), { status: s.ok ? 200 : 502 })
    } catch {
      return NextResponse.json({ error: 'Meta no contestó a tiempo.' }, { status: 504 })
    }
  }

  // ---------------------------------------------------------------------------
  // Ocultar, mostrar, editar, borrar.
  // ---------------------------------------------------------------------------
  if (accion === 'ocultar' || accion === 'mostrar' || accion === 'editar' || accion === 'borrar') {
    if (!comentario) return NextResponse.json({ error: 'falta el comentario' }, { status: 400 })

    const { data, error } = await supabase.rpc('moderar_comentario', {
      p_comentario: comentario,
      p_accion: accion,
      p_texto: texto ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 403 })

    const orden = data as Record<string, unknown> | null
    if (!orden?.comment_id) {
      return NextResponse.json({ error: 'no se pudo preparar la acción' }, { status: 500 })
    }

    try {
      const meta = await fetch(`${base}/moderar-comentario`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orden, actor: usuario.id }),
        signal: AbortSignal.timeout(30_000),
      })
      const j = await meta.json().catch(() => ({}))
      if (!meta.ok) {
        return NextResponse.json({ error: j.error ?? 'Meta no aceptó la acción.' }, { status: 502 })
      }
      return NextResponse.json(j)
    } catch {
      return NextResponse.json(
        { error: 'Meta no contestó a tiempo. No se cambió nada.' },
        { status: 504 },
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Responder en público.
  // ---------------------------------------------------------------------------
  if (!comentario || !texto?.trim()) {
    return NextResponse.json({ error: 'falta el comentario o el texto' }, { status: 400 })
  }

  const { data, error } = await supabase
    .rpc('responder_comentario', { p_comentario: comentario, p_texto: texto })

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })

  const r = data as { comment_id?: string; canal?: string; texto?: string } | null
  if (!r?.comment_id) {
    return NextResponse.json({ error: 'no se pudo preparar la respuesta' }, { status: 500 })
  }

  try {
    const meta = await fetch(`${base}/responder-comentario`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comentario, comment_id: r.comment_id, texto: r.texto, actor: usuario.id,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = await meta.json().catch(() => ({}))
    if (!meta.ok) {
      return NextResponse.json(
        { error: j.error ?? 'Meta no aceptó la respuesta.', publicado: false },
        { status: 502 },
      )
    }
    return NextResponse.json({ id: j.id, aviso: j.aviso ?? null, publicado: true })
  } catch {
    return NextResponse.json(
      { error: 'Meta no contestó a tiempo. El comentario quedó marcado como respondido.', publicado: false },
      { status: 504 },
    )
  }
}
