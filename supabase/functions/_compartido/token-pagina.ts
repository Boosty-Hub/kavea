/**
 * El Page Access Token de un activo, resuelto por su dueño y no por el azar.
 *
 * POR QUÉ ESTE FICHERO EXISTE. `sincronizar-comentarios` y `responder-comentario`
 * resolvían la Página así:
 *
 *     meta_asset_routes?select=asset_id,tipo&tipo=eq.page&limit=1
 *
 * es decir, LA PRIMERA FILA DE LA TABLA ENTERA. Con una sola Página conectada
 * eso acierta siempre y parece correcto. Desde el 24-ago hay tres, de dos
 * organizaciones distintas, y «la primera» es la que devuelva Postgres: pulsar
 * «Traer de Meta» en un espacio podía leer la cuenta de otro. No es un permiso
 * mal puesto —RLS sigue en pie— es una pregunta mal hecha, y la respuesta era
 * plausible, que es lo que la hizo invisible durante dieciocho días.
 *
 * DE DÓNDE SALE EL TOKEN, en este orden y por este motivo:
 *
 *   1. La credencial cifrada de la conexión. Es la única que existe para un
 *      cliente de autoservicio, que no está en el portafolio de Boosty y del que
 *      por tanto no se puede derivar nada.
 *   2. Solo si Meta rechaza por permiso: derivarlo del token de portafolio. Las
 *      conexiones de agosto se emitieron antes de que el system user tuviera
 *      `instagram_manage_comments` en su ámbito, y reconectar una Página viva
 *      solo para ampliar un permiso es peor que tener este segundo camino.
 *
 * El respaldo AVISA. Un respaldo silencioso convierte «tu credencial no sirve»
 * en «todo va bien» hasta el día que el cliente no está en el portafolio, y ese
 * día el fallo aparece en producción sin historia previa.
 */

import { descifrar, desdeHexPg } from './cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

export type Conexion = {
  id: string
  page_id: string | null
  page_name: string | null
  ig_business_account_id: string | null
  ig_username: string | null
  organization_id: string
}

/** Los campos que identifican una conexión, en un solo sitio. */
const CAMPOS = 'id,page_id,page_name,ig_business_account_id,ig_username,organization_id'

function url() {
  return Deno.env.get('SUPABASE_URL') ?? ''
}

function clave() {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const k = clave()
  const r = await fetch(`${url()}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: k,
      Authorization: `Bearer ${k}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-token/0.1',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

/**
 * La conexión viva a la que pertenece un activo.
 *
 * El activo puede ser la Página o la cuenta de Instagram: los comentarios de IG
 * llegan con el id de la cuenta y las respuestas se publican con el token de la
 * Página, así que hay que poder entrar por cualquiera de los dos.
 */
export async function conexionDeAsset(assetId: string): Promise<Conexion | null> {
  const filas = await rest<Conexion[]>(
    `meta_connections?select=${CAMPOS}` +
    `&or=(page_id.eq.${encodeURIComponent(assetId)},ig_business_account_id.eq.${encodeURIComponent(assetId)})` +
    `&estado=eq.connected&limit=1`,
  )
  return filas?.[0] ?? null
}

/** Los activos vivos de UNA organización. */
export async function conexionesDeOrganizacion(org: string): Promise<Conexion[]> {
  return await rest<Conexion[]>(
    `meta_connections?select=${CAMPOS}` +
    `&organization_id=eq.${encodeURIComponent(org)}&estado=eq.connected`,
  )
}

/** El token guardado de una conexión, descifrado. `null` si no hay ninguno. */
export async function tokenGuardado(conexion: string): Promise<string | null> {
  const filas = await rest<any>('rpc/credencial_de_conexion', {
    method: 'POST',
    body: JSON.stringify({ p_conexion: conexion }),
  })
  const c = Array.isArray(filas) ? filas[0] : filas
  if (!c?.page_access_token_cipher) return null
  return await descifrar(
    desdeHexPg(c.page_access_token_cipher),
    desdeHexPg(c.page_access_token_nonce),
    c.page_access_token_kid,
  )
}

/** Derivar el token de la Página del token de portafolio. Solo para el respaldo. */
export async function tokenDerivado(pageId: string): Promise<string> {
  const t = Deno.env.get('META_PORTFOLIO_TOKEN')
  if (!t) throw new Error('No hay token de portafolio configurado.')
  const r = await fetch(
    `https://graph.facebook.com/${V}/${encodeURIComponent(pageId)}?fields=access_token`,
    { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15_000) },
  )
  const j = await r.json() as { access_token?: string; error?: { message?: string } }
  if (!j.access_token) throw new Error(j.error?.message ?? 'no se pudo derivar el token de la Página')
  return j.access_token
}

/** Un error de Meta que se arregla probando con otra credencial, y no otro. */
export function esFaltaDePermiso(e: { type?: string; code?: number } | undefined): boolean {
  if (!e) return false
  // 10 = permiso no concedido · 190 = token caducado o revocado
  // 200 = el token no tiene el permiso que la arista pide
  // 2635 = arista que exige otra credencial
  return e.type === 'OAuthException' || [10, 190, 200, 2635].includes(Number(e.code))
}

/**
 * Llamar a Graph con la credencial de la conexión y, si Meta la rechaza por
 * permiso, reintentar con la derivada del portafolio.
 *
 * Devuelve también CON CUÁL salió, para que quien llama pueda decirlo.
 */
export async function conToken<T>(
  cx: Conexion,
  llamada: (token: string) => Promise<{ ok: boolean; datos?: T; error?: { message?: string; type?: string; code?: number } }>,
): Promise<{ ok: boolean; datos?: T; error?: string; via: 'conexion' | 'portafolio'; aviso?: string }> {
  const guardado = await tokenGuardado(cx.id).catch(() => null)

  if (guardado) {
    const a = await llamada(guardado)
    if (a.ok) return { ok: true, datos: a.datos, via: 'conexion' }
    if (!esFaltaDePermiso(a.error) || !cx.page_id) {
      return { ok: false, error: a.error?.message ?? 'Meta rechazó la petición.', via: 'conexion' }
    }
    // Rechazo por permiso: se prueba el otro camino, y se cuenta.
    const b = await llamada(await tokenDerivado(cx.page_id))
    if (b.ok) {
      return {
        ok: true, datos: b.datos, via: 'portafolio',
        aviso: `La credencial guardada de esta conexión no tiene el permiso que hace falta (${a.error?.message ?? 'sin detalle'}). Se usó el token del portafolio.`,
      }
    }
    return { ok: false, error: b.error?.message ?? 'Meta rechazó la petición.', via: 'portafolio' }
  }

  if (!cx.page_id) return { ok: false, error: 'Esa conexión no tiene credencial guardada.', via: 'conexion' }
  const b = await llamada(await tokenDerivado(cx.page_id))
  return b.ok
    ? { ok: true, datos: b.datos, via: 'portafolio' }
    : { ok: false, error: b.error?.message ?? 'Meta rechazó la petición.', via: 'portafolio' }
}
