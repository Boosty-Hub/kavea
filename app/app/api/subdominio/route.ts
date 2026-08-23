import { NextResponse } from 'next/server'
import { usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Aprovisiona el subdominio de la organización recién creada.
 *
 * Lo llama `/crear` justo después de `registrarse`, antes de mandar al cliente
 * a su panel: sin alias en Netlify, `su-empresa.kavea.ai` no resuelve y el alta
 * habría dicho «hecho» dejando al cliente en un host muerto.
 *
 * QUIÉN PUEDE PEDIRLO. Solo alguien con sesión Y propietario de ESA
 * organización, y la comprobación se hace con el cliente del USUARIO para que
 * la lea RLS. Sin esto, cualquiera con sesión podría aprovisionar el subdominio
 * de otro — que no es grave por sí solo (el slug ya existe y el host apuntaría
 * al mismo sitio) pero es una llamada a la API de Netlify que se puede repetir
 * a voluntad, y los alias de un sitio no son infinitos.
 *
 * El token de Netlify no está aquí: vive en el borde. Esta ruta solo autoriza.
 */
export async function POST(req: Request) {
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }

  const { organizacion } = await req.json().catch(() => ({})) as { organizacion?: string }
  if (!organizacion) {
    return NextResponse.json({ error: 'falta la organización' }, { status: 400 })
  }

  const supabase = await crearClienteServidor()
  const { data: soyDuenio } = await supabase
    .from('organization_members')
    .select('rol')
    .eq('organization_id', organizacion)
    .eq('rol', 'owner')
    .maybeSingle()

  if (!soyDuenio) {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }

  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) {
    return NextResponse.json({ error: 'sin configurar' }, { status: 503 })
  }

  try {
    const r = await fetch(`${base}/subdominio`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizacion }),
      signal: AbortSignal.timeout(40_000),
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch {
    return NextResponse.json(
      { error: 'Netlify no contestó a tiempo. El espacio existe; el subdominio puede tardar.' },
      { status: 504 },
    )
  }
}
