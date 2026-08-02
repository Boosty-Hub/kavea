import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase para componentes de servidor y route handlers.
 *
 * Usa la clave publicable, así que toda lectura pasa por RLS. Es el cliente por
 * defecto: si una operación necesita saltarse RLS, eso es una decisión explícita
 * que se toma importando `servicio.ts`, no algo que ocurre por descuido.
 */
export async function crearClienteServidor() {
  const almacen = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options))
          } catch {
            // Un componente de servidor no puede escribir cookies. No es un
            // error: el middleware ya refrescó la sesión antes de llegar aquí.
          }
        },
      },
    },
  )
}
