import { NextResponse } from 'next/server'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Plantillas de utilidad de Messenger, contra la Página del cliente.
 *
 * LA PÁGINA NO LLEGA POR PARÁMETRO, y no es un detalle de comodidad. Si esta
 * ruta aceptara un `page_id` del cuerpo, cualquier miembro de un tenant podría
 * leer y crear plantillas sobre la Página de otro cliente: la función de borde
 * corre con el token del portafolio y no mira RLS. Se resuelve desde la
 * organización de la sesión con el cliente del USUARIO, para que responda RLS y
 * no una condición escrita a mano que algún día se olvide.
 *
 * Es la misma regla que `api/diagnosticar` aplica a la conexión.
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

  /**
   * LA PÁGINA TIENE QUE ESTAR CONECTADA, y el orden tiene que ser el mismo cada vez.
   *
   * Esto era `.not('page_id','is',null).limit(1)` sin filtro de estado y sin
   * `order`: la primera fila que devolviera Postgres. El 25-ago devolvía
   * **Centromarca Mercedes, desconectada**, y el resultado era
   * `(#10) Application does not have permission for this action` más una lista
   * vacía — dos síntomas que no señalan a la causa por ninguna parte.
   *
   * Es el mismo fallo que la 0089 y `sincronizar-comentarios` ya habían tenido:
   * «la primera fila de la tabla» acierta mientras hay una fila. Aquí hubo tres.
   */
  const supabase = await crearClienteServidor()
  const { data: conexion } = await supabase
    .from('meta_connections')
    .select('page_id, page_name')
    .not('page_id', 'is', null)
    .eq('estado', 'connected')
    .order('page_name', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (!conexion?.page_id) {
    return NextResponse.json(
      { error: 'Esta organización no tiene ninguna Página de Facebook conectada.' },
      { status: 409 },
    )
  }

  const cuerpo = await req.json().catch(() => ({})) as {
    accion?: string; nombre?: string; idioma?: string; texto?: string; ejemplos?: string[]
  }

  const url = process.env.KAVEA_FUNCTIONS_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) return NextResponse.json({ error: 'sin configurar' }, { status: 503 })

  try {
    const r = await fetch(`${url}/plantillas-utilidad`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cuerpo, page_id: conexion.page_id }),
      signal: AbortSignal.timeout(30_000),
    })
    /**
     * SE DEVUELVE DE QUÉ PÁGINA SE LEYÓ. Con varias conectadas, la pantalla
     * enseñaba una lista sin decir de quién era. Y cuando la elección salió mal
     * —Centromarca en vez de Boosty— no había forma de notarlo desde la interfaz.
     */
    const j = await r.json().catch(() => ({}))
    return NextResponse.json(
      { ...j, pagina: conexion.page_name ?? conexion.page_id },
      { status: r.status },
    )
  } catch {
    // Un timeout no es «la plantilla no existe»: es que no pudimos preguntar.
    return NextResponse.json({ error: 'Meta no contestó a tiempo.' }, { status: 504 })
  }
}
