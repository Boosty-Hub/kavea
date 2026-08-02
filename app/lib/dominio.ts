/**
 * Resolución de superficie y organización a partir del Host.
 *
 * POR QUÉ SE LEE EL HOST Y NO UNA CABECERA DEL MIDDLEWARE
 *
 * El diseño original pasaba el slug en `x-kavea-org-slug`, inyectada con
 * `NextResponse.next({ request: { headers } })`. Ese mecanismo es una función
 * de Next.js que el Next Runtime de Netlify emula, y **no propaga**: el
 * middleware corre —se comprobó, porque su redirección de `admin` funciona—
 * pero la cabecera nunca llega al componente de servidor. El síntoma era un 404
 * en la raíz de cualquier subdominio de organización.
 *
 * El plan de la fase 0 ya marcaba esto como verificación empírica pendiente.
 * Se cumplió el riesgo y esta es la salida.
 *
 * `Host` es una cabecera real de la petición, la misma que usa el CDN para
 * enrutar, y está disponible en el servidor sin intermediarios.
 *
 * SOBRE FALSIFICAR EL HOST: no abre nada. El slug solo decide qué organización
 * se INTENTA abrir; quién puede verla lo decide RLS contra `organization_members`.
 * Un Host inventado resuelve a una organización que no existe, o a una de la que
 * el usuario no es miembro, y en ambos casos la consulta devuelve cero filas.
 */

const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

/** Nombres que nunca son una organización. Duplica la lista de la migración 0001. */
const RESERVADOS = new Set(['www', 'admin', 'api', 'hooks', 'mail', 'send', 'status'])

export type Superficie = 'app' | 'admin' | 'ninguna'

/** Extrae la etiqueta de subdominio, o null si el host no corresponde. */
export function etiquetaDesdeHost(host: string | null | undefined): string | null {
  if (!host) return null

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

export function superficieDesdeHost(host: string | null | undefined): Superficie {
  const etiqueta = etiquetaDesdeHost(host)
  if (etiqueta === 'admin') return 'admin'
  if (etiqueta && !RESERVADOS.has(etiqueta)) return 'app'
  return 'ninguna'
}

/** El slug de organización, solo cuando la superficie es de cliente. */
export function slugDesdeHost(host: string | null | undefined): string | null {
  return superficieDesdeHost(host) === 'app' ? etiquetaDesdeHost(host) : null
}
