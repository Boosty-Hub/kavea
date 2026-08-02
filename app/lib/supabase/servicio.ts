import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Cliente con la clave de servicio. SALTA RLS.
 *
 * `server-only` en la primera línea no es decorativo: si un componente de
 * cliente importa este módulo por descuido, el build falla. Es la única guarda
 * fiable contra que la clave de servicio acabe en el bundle del navegador.
 *
 * Cuándo se usa, y solo entonces:
 *   - El normalizador, que escribe en cualquier tenant y cuya frontera es la
 *     clave primaria de `meta_asset_routes`, no RLS.
 *   - El panel interno, para crear grants de break-glass tras comprobar `staff`.
 *   - El flujo de OAuth de conexión de canales.
 *
 * Nunca para servir una lectura de la interfaz de un cliente. Si te encuentras
 * usándolo ahí, la consulta está mal planteada: el filtro lo pone RLS.
 */
export function crearClienteServicio() {
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!clave) throw new Error('Falta SUPABASE_SECRET_KEY')

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
