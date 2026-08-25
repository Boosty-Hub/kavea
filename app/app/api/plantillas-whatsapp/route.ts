import { NextResponse } from 'next/server'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Plantillas de WhatsApp, contra la WABA del cliente.
 *
 * LA WABA NO LLEGA POR PARÁMETRO, misma regla que en `plantillas-utilidad` y por
 * el mismo motivo: la función de borde corre con el token del portafolio y no
 * mira RLS, así que aceptar un `waba_id` del cuerpo dejaría a cualquier miembro
 * leer y crear plantillas sobre la cuenta de otro cliente. Se resuelve desde la
 * organización de la sesión con el cliente del USUARIO, para que conteste RLS.
 *
 * CREAR Y BORRAR PIDEN `configurar`; LISTAR NO. Ver una plantilla aprobada es
 * parte de atender —el compositor las ofrece— y exigir permiso de configuración
 * para mirar sería la misma confusión que ya costó un camino muerto: la guarda
 * tiene que pesar lo que pesa la acción.
 */
export async function POST(req: Request) {
  if ((await superficieActual()) !== 'app') {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }

  const org = await organizacionActual()
  if (!org) return NextResponse.json({ error: 'sin organización' }, { status: 403 })

  const cuerpo = await req.json().catch(() => ({})) as Record<string, unknown>
  const accion = String(cuerpo.accion ?? 'listar')

  const supabase = await crearClienteServidor()

  if (accion === 'crear' || accion === 'editar' || accion === 'borrar') {
    const { data: puede } = await supabase.rpc('puede', { p_org: org.id, p_accion: 'configurar' })
    if (!puede) {
      return NextResponse.json(
        { error: 'No puedes crear, editar ni borrar plantillas en este espacio.' },
        { status: 403 },
      )
    }
  }

  const { data: conexion } = await supabase
    .from('meta_connections')
    .select('waba_id')
    .not('waba_id', 'is', null)
    .eq('estado', 'connected')
    .limit(1)
    .maybeSingle()

  if (!conexion?.waba_id) {
    return NextResponse.json(
      { error: 'Esta organización no tiene ninguna cuenta de WhatsApp conectada.' },
      { status: 409 },
    )
  }

  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) return NextResponse.json({ error: 'sin configurar' }, { status: 503 })

  try {
    const r = await fetch(`${base}/plantillas-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cuerpo, waba_id: conexion.waba_id }),
      signal: AbortSignal.timeout(30_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json({ error: 'Meta no contestó a tiempo.' }, { status: 504 })
  }
}
