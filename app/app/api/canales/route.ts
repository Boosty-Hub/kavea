import { NextResponse } from 'next/server'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Desconectar un canal, o la cuenta de Facebook entera.
 *
 * DOS PASOS, EN ESTE ORDEN.
 *
 * 1. `desconectar_conexion` con el cliente del USUARIO: comprueba el permiso
 *    (`puede(org, 'conectar')`) y hace la limpieza local — borra la
 *    credencial, borra el enrutado, apaga los canales. Es lo único que tiene
 *    que pasar sin falta.
 * 2. La función de borde da de baja la suscripción en Meta. Best-effort: si
 *    falla, el paso 1 ya ocurrió y el canal ya está desconectado en Kavea. Se
 *    informa el aviso, no se deshace nada.
 *
 * Es el mismo reparto que `api/comentarios`: Postgres decide y registra, el
 * borde habla con Meta.
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

  const { conexion, motivo, accion } = await req.json().catch(() => ({})) as
    { conexion?: string; motivo?: string; accion?: string }

  const supabase = await crearClienteServidor()

  /**
   * Soltar la cuenta de Facebook entera, no un canal.
   *
   * Mismo reparto en dos pasos que el de abajo, y por la misma razón: el paso
   * local tiene que ocurrir sí o sí —el cliente pidió irse— y el de Meta es
   * best-effort con aviso. La diferencia es que aquí el orden dentro del borde
   * importa: primero las bajas de webhooks, que necesitan el token, y después la
   * revocación, que lo mata.
   */
  if (accion === 'desautorizar') {
    const org = await organizacionActual()
    if (!org) return NextResponse.json({ error: 'sin organización' }, { status: 403 })

    const { data, error } = await supabase
      .rpc('desautorizar_meta', { p_org: org.id, p_motivo: motivo ?? null })
    if (error) return NextResponse.json({ error: error.message }, { status: 403 })

    const r = (data ?? {}) as { habia_autorizacion?: boolean; conexiones?: number; activos?: unknown[] }

    const base0 = process.env.KAVEA_FUNCTIONS_URL
    const secreto0 = process.env.SUPABASE_SECRET_KEY
    if (!base0 || !secreto0) {
      return NextResponse.json({
        desconectada: true, conexiones: r.conexiones ?? 0,
        meta: { ok: false, avisos: ['Sin configurar el borde: no se pudo avisar a Meta.'] },
      })
    }

    try {
      const meta = await fetch(`${base0}/meta-soltar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secreto0}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizacion: org.id, activos: r.activos ?? [] }),
        // Una baja por activo más la revocación. Con varias Páginas suma.
        signal: AbortSignal.timeout(45_000),
      })
      return NextResponse.json({
        desconectada: true, conexiones: r.conexiones ?? 0,
        meta: await meta.json().catch(() => ({})),
      })
    } catch {
      return NextResponse.json({
        desconectada: true, conexiones: r.conexiones ?? 0,
        meta: { ok: false, avisos: ['Meta no contestó a tiempo. En Kavea ya está desconectada.'] },
      })
    }
  }

  if (!conexion) return NextResponse.json({ error: 'falta la conexión' }, { status: 400 })
  const { data, error } = await supabase
    .rpc('desconectar_conexion', { p_conexion: conexion, p_motivo: motivo ?? null })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })

  const r = data as { page_id: string | null; waba_id: string | null; phone_number_id: string | null; nombre: string | null }

  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) {
    // La conexión YA está desconectada en Kavea. Sin configurar el borde no
    // se puede avisar a Meta, pero eso no deshace el paso 1.
    return NextResponse.json({ desconectada: true, meta: { ok: false, aviso: 'sin configurar' } })
  }

  try {
    const meta = await fetch(`${base}/portafolio`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'desuscribir', page_id: r.page_id, waba_id: r.waba_id }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = await meta.json().catch(() => ({}))
    return NextResponse.json({ desconectada: true, nombre: r.nombre, meta: j })
  } catch {
    return NextResponse.json({
      desconectada: true,
      nombre: r.nombre,
      meta: { ok: false, aviso: 'Meta no contestó a tiempo.' },
    })
  }
}
