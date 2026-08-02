import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { superficieDesdeHost } from '@/lib/dominio'

/**
 * Middleware de subdominio.
 *
 * Corre como Edge Function de Netlify, sobre Deno. Hace tres cosas:
 *
 *   1. Borra las cabeceras internas que pudieran venir de fuera.
 *   2. Refresca la sesión de Supabase.
 *   3. Manda a /entrar a quien abra el panel interno sin sesión.
 *
 * Lo que YA NO hace, y conviene saber por qué: inyectar el slug de organización
 * en una cabecera. `NextResponse.next({ request: { headers } })` es una función
 * de Next.js que el Next Runtime de Netlify emula, y en la práctica **no
 * propaga**: la cabecera no llega al componente de servidor. Se comprobó en
 * producción —el middleware corre, porque su redirección funciona, pero la
 * cabecera no aparece— y el síntoma era un 404 en la raíz de cualquier
 * subdominio de organización.
 *
 * La resolución vive ahora en `lib/dominio.ts`, que lee el `Host` directamente.
 */

export async function middleware(request: NextRequest) {
  // Nadie de fuera decide la organización ni la superficie. Aunque el servidor
  // ya no las lea, borrarlas evita que una futura ruta confíe en ellas.
  const cabeceras = new Headers(request.headers)
  cabeceras.delete('x-kavea-org-slug')
  cabeceras.delete('x-kavea-superficie')

  let respuesta = NextResponse.next({ request: { headers: cabeceras } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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

  // Refresco de sesión.
  //
  // El proyecto usa claves de firma asimétricas (ES256), así que getClaims()
  // verifica el JWT en local sin ida y vuelta al servidor de Auth. En el
  // middleware esa diferencia es una tasa de latencia sobre TODO el tráfico.
  // La llamada sigue siendo necesaria: sin ella el token caduca y el usuario
  // aparece deslogueado a mitad de sesión.
  const { data } = await supabase.auth.getClaims()
  const hayUsuario = Boolean(data?.claims?.sub)

  // El panel interno no se muestra nunca sin sesión, ni siquiera para decir que
  // existe. La comprobación de `staff` la hace el servidor después.
  if (superficieDesdeHost(request.headers.get('host')) === 'admin' && !hayUsuario) {
    const destino = new URL('/entrar', request.url)
    if (request.nextUrl.pathname !== '/entrar') return NextResponse.redirect(destino)
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
