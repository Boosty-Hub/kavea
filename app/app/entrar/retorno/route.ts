import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { opcionesDeCookie } from '@/lib/supabase/cookies'
import { slugDesdeHost } from '@/lib/dominio'

const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

/**
 * Retorno del Facebook Login de consumo, y el único sitio que decide adónde va
 * alguien que acaba de autenticarse.
 *
 * POR QUÉ UN ROUTE HANDLER Y NO UNA PÁGINA. El canje del código por sesión
 * escribe cookies, y un componente de servidor no puede escribirlas —lo dice el
 * `catch` de `supabase/servidor.ts`—. Un route handler sí, y por eso este cliente
 * se construye aquí a mano con `opcionesDeCookie()` en vez de reusar
 * `crearClienteServidor()`: la sesión tiene que quedar en `.kavea.ai` para que
 * valga en el subdominio del espacio, que es adonde se manda a continuación.
 *
 * EL VERIFICADOR DE PKCE lo dejó el navegador en una cookie al pulsar el botón, y
 * llega en esta petición porque también es de dominio. De ahí que el `redirectTo`
 * vuelva al mismo host desde el que se salió.
 *
 * DÓNDE ACABA CADA UNO. Bajo RLS, `organizations` solo devuelve los espacios de
 * los que el usuario es miembro, así que cero filas significa «todavía no tiene
 * ninguno» sin consultar la membresía ni saltarse RLS:
 *   - cero espacios  → `/crear`, que es el paso 2 del alta y ya existe;
 *   - un espacio     → dentro, a su subdominio;
 *   - varios         → al selector del sitio público, que ya pregunta cuál;
 *   - y si se pulsó el botón estando ya en el subdominio de un espacio, ahí se
 *     queda: quien entra por `acme.kavea.ai` quiere Acme, no que se le elija.
 */
export async function GET(peticion: NextRequest) {
  const parametros = peticion.nextUrl.searchParams
  const codigo = parametros.get('code')
  const fallo = parametros.get('error_description') ?? parametros.get('error')

  // Un rechazo en el diálogo de Facebook no es un error del producto: el usuario
  // dijo que no. Se vuelve a la entrada con aviso, no a una pantalla de fallo.
  if (fallo || !codigo) {
    return NextResponse.redirect(new URL('/entrar?fallo=facebook', peticion.url))
  }

  const almacen = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: opcionesDeCookie(),
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options))
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(codigo)
  if (error) {
    return NextResponse.redirect(new URL('/entrar?fallo=facebook', peticion.url))
  }

  // Se pulsó desde el subdominio de un espacio: se entra a ese y se acabó.
  if (slugDesdeHost(peticion.headers.get('host'))) {
    return NextResponse.redirect(new URL('/', peticion.url))
  }

  const { data: espacios } = await supabase.from('organizations').select('slug').limit(2)

  if (!espacios || espacios.length === 0) {
    return NextResponse.redirect(new URL('/crear', peticion.url))
  }

  if (espacios.length === 1) {
    const protocolo = peticion.nextUrl.protocol
    return NextResponse.redirect(`${protocolo}//${espacios[0]!.slug}.${RAIZ}/`)
  }

  return NextResponse.redirect(`${peticion.nextUrl.protocol}//${RAIZ}/entrar`)
}
