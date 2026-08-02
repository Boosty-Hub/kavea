'use client'

import { createBrowserClient } from '@supabase/ssr'

const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

/**
 * Cliente para componentes de navegador.
 *
 * La cookie se fija en el dominio padre para que la sesión valga en cualquier
 * subdominio: sin eso habría que iniciar sesión una vez por organización.
 *
 * En local se deja sin dominio porque `.localhost` no acepta cookie de dominio.
 */
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions:
        RAIZ === 'localhost' ? {} : { domain: `.${RAIZ}`, sameSite: 'lax', secure: true },
    },
  )
}
