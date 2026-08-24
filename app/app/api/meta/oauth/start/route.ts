import { NextResponse } from 'next/server'
import { organizacionActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import {
  COOKIE_NONCE,
  configDe,
  firmarEstado,
  nuevoNonce,
  uriDeRetorno,
} from '@/lib/meta-oauth'

export const dynamic = 'force-dynamic'

/**
 * Arranca el diálogo de Facebook Login for Business.
 *
 * `GET /api/meta/oauth/start?canal=mensajeria`, desde el subdominio del cliente.
 *
 * ES UN ROUTE HANDLER Y NO UNA SERVER ACTION, y no es estilo: el retorno de Meta
 * es un `GET` con `code` y `state` en la query, así que la ida y la vuelta tienen
 * que ser rutas HTTP de verdad.
 *
 * DE DÓNDE SALE LA ORGANIZACIÓN. Del Host, vía `organizacionActual()`, que la
 * resuelve bajo RLS. No de un parámetro. La fase 5 §T5 lo diseñó recibiendo
 * `organization_id` en la URL y exigía devolver 403 a quien acertara el id sin
 * ser miembro; esto es más estricto que aquello, porque el id de la URL no se
 * lee nunca: el único espacio que se puede conectar es aquel en cuyo subdominio
 * estás, y RLS ya decidió si te deja verlo.
 *
 * QUIÉN PUEDE. `puede(org, 'conectar')`, que en la 0040 es SOLO `owner`. El
 * documento de fase decía «propietario o admin»; manda la base, que es la única
 * matriz de permisos del producto. Conectar un canal toca credenciales y el
 * kill-switch, así que la versión estricta es además la correcta.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const canal = url.searchParams.get('canal') ?? 'mensajeria'

  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }

  const org = await organizacionActual()
  if (!org) {
    // Igual que el resto de la app: no se confirma que el espacio exista.
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
  }

  const supabase = await crearClienteServidor()
  const { data: puede } = await supabase.rpc('puede', { org: org.id, accion: 'conectar' })
  if (puede !== true) {
    return NextResponse.json(
      { error: 'Solo el propietario del espacio puede conectar canales.' },
      { status: 403 },
    )
  }

  const cfg = configDe(canal)
  if (!cfg) {
    // Mejor un 400 que decir cuál falta que un diálogo con `config_id` vacío:
    // Meta lo rechaza con un error genérico que no señala nada.
    return NextResponse.json(
      { error: `No hay configuración de Meta para el canal "${canal}".` },
      { status: 400 },
    )
  }

  const appId = process.env.META_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'sin configurar' }, { status: 503 })
  }

  const nonce = nuevoNonce()
  const state = firmarEstado({ org: org.id, slug: org.slug, canal, cfg, nonce })
  const version = process.env.GRAPH_API_VERSION ?? 'v26.0'

  const dialogo = new URL(`https://www.facebook.com/${version}/dialog/oauth`)
  dialogo.searchParams.set('client_id', appId)
  dialogo.searchParams.set('config_id', cfg)
  dialogo.searchParams.set('redirect_uri', uriDeRetorno())
  dialogo.searchParams.set('state', state)
  // Con `config_id` los permisos los fija la configuración, no un `scope` en la
  // URL. Estas dos son las que hacen que Meta devuelva un código canjeable en
  // vez de un token de cliente en el fragmento.
  dialogo.searchParams.set('response_type', 'code')
  dialogo.searchParams.set('override_default_response_type', 'true')

  const r = NextResponse.redirect(dialogo.toString(), 302)

  // La otra mitad de la defensa contra CSRF. `SameSite=Lax` es correcto aquí y
  // no una concesión: el retorno de Meta es una navegación de primer nivel por
  // GET, el único caso entre sitios en que Lax sí manda la cookie. Con `Strict`
  // no llegaría y el flujo fallaría siempre.
  const raiz = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'
  r.cookies.set(COOKIE_NONCE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    // En `.kavea.ai` para que la vea `conectar`, que es donde vuelve Meta.
    domain: raiz === 'localhost' ? undefined : `.${raiz}`,
    path: '/',
    maxAge: 600,
  })

  return r
}
