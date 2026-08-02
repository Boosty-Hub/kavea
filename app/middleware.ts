import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Middleware de subdominio.
 *
 * Corre como Edge Function de Netlify, sobre Deno. Hace tres cosas y ninguna
 * más: borrar cabeceras falsificables, refrescar la sesión y etiquetar la
 * superficie.
 *
 * NO resuelve `organization_id`, y es deliberado. Corre en cada petición,
 * incluidas las que no necesitan la organización; una consulta a la base aquí
 * es latencia y coste sobre todo el tráfico. Y un `organization_id` obtenido
 * sin comprobar membresía no sirve de nada: la comprobación real la hace RLS al
 * leer. El middleware pasa el slug y un ayudante de servidor lo resuelve.
 */

// Variable, no constante: si los tenants acaban viviendo en `app.kavea.ai` en
// vez de `kavea.ai`, cambia la variable de entorno y el middleware no se entera.
const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

// Duplica la lista de la migración 0001. La base es la fuente de verdad y
// rechaza el alta; esto solo evita enrutar hacia una organización imposible.
const RESERVADOS = new Set(['www', 'admin', 'api', 'hooks', 'mail', 'send', 'status'])

function slugDesdeHost(host: string): string | null {
  const limpio = host.split(':')[0]!.toLowerCase()

  if (limpio.endsWith('.localhost')) {
    return limpio.slice(0, -'.localhost'.length) || null
  }

  const sufijo = `.${RAIZ}`
  if (!limpio.endsWith(sufijo)) return null

  const etiqueta = limpio.slice(0, -sufijo.length)
  // Nada de sub-sub-dominios: `a.b.kavea.ai` no resuelve organización.
  if (!etiqueta || etiqueta.includes('.')) return null

  return etiqueta
}

export async function middleware(request: NextRequest) {
  // 1. Nadie de fuera decide la organización. Se borran ANTES de leer nada.
  const cabeceras = new Headers(request.headers)
  cabeceras.delete('x-kavea-org-slug')
  cabeceras.delete('x-kavea-superficie')

  const slug = slugDesdeHost(request.headers.get('host') ?? '')

  let respuesta = NextResponse.next({ request: { headers: cabeceras } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions:
        RAIZ === 'localhost' ? {} : { domain: `.${RAIZ}`, sameSite: 'lax', secure: true },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request: { headers: cabeceras } })
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
        },
      },
    },
  )

  // 2. Refresco de sesión.
  //
  // El proyecto usa claves de firma asimétricas (ES256), así que getClaims()
  // verifica el JWT en local sin ida y vuelta al servidor de Auth. En el
  // middleware esa diferencia es una tasa de latencia sobre TODO el tráfico.
  // La llamada sigue siendo necesaria: sin ella el token caduca y el usuario
  // aparece deslogueado a mitad de sesión.
  const { data } = await supabase.auth.getClaims()
  const hayUsuario = Boolean(data?.claims?.sub)

  // 3. Enrutado por superficie.
  if (slug === 'admin') {
    if (!hayUsuario) {
      return NextResponse.redirect(new URL('/entrar', request.url))
    }
    cabeceras.set('x-kavea-superficie', 'admin')
    return respuesta
  }

  if (slug && !RESERVADOS.has(slug)) {
    cabeceras.set('x-kavea-org-slug', slug)
    cabeceras.set('x-kavea-superficie', 'app')
  }

  // IMPORTANTE: se devuelve `respuesta` tal cual.
  //
  // Construir un NextResponse nuevo aquí descartaría las cookies que setAll
  // acaba de escribir, y el síntoma sería una sesión que se pierde de forma
  // intermitente sin ningún error en los registros.
  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
