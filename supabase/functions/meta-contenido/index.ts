/**
 * Lee contenido de una Página y de una cuenta de Instagram, para pintarlo.
 *
 * POR QUÉ EXISTE ESTA FUNCIÓN Y NO UNA RUTA DE NEXT: el Page Access Token está
 * cifrado en `private.meta_credentials` y la clave vive en el almacén del borde.
 * Descifrarlo es lo único que hay que hacer aquí; el resto son llamadas a Graph.
 *
 * QUÉ PIDE META, VERBATIM, y por qué la pantalla está hecha así:
 *
 *   `instagram_basic` — «(1) the selected Instagram professional account with its
 *   handle or ID visible, (2) a sample of profile fields (name, bio, followers,
 *   etc.), and (3) a media list displayed in your app UI labeled for that
 *   account»
 *
 *   `pages_read_engagement` — «(1) Page selection, (2) the retrieval of Page
 *   content such as posts, photos, events (…), and (3) the rendered results in
 *   your app's UI with the Page identity visibly displayed»
 *
 * Los dos piden lo mismo en forma distinta: ELEGIR un activo y luego VER su
 * contenido con su identidad delante. Por eso las dos pantallas comparten el
 * patrón lista → detalle, y por eso el nombre y el handle van en la cabecera del
 * detalle y no solo en la lista de la que se viene.
 *
 * NO SE CACHEA NADA. Es contenido de un tercero que puede borrarse en cualquier
 * momento, y una foto que ya no existe en Instagram no puede seguir viéndose en
 * Kavea. El coste es una llamada por visita, que en una pantalla de consulta es
 * exactamente lo correcto.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

function limpiar(s: string) {
  return s.replace(/access_token=[^&\s"']+/gi, 'access_token=[oculto]').slice(0, 250)
}

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-contenido/0.1',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${limpiar(t)}`)
  return t ? JSON.parse(t) : null
}

async function graph(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    const t = await r.text()
    let d: any
    try { d = JSON.parse(t) } catch { return { ok: false as const, error: `respuesta no JSON (${r.status})` } }
    if (!r.ok || d?.error) {
      const e = d?.error ?? {}
      return {
        ok: false as const,
        error: limpiar([e.message, e.code && `code ${e.code}`].filter(Boolean).join(' · ') || `HTTP ${r.status}`),
      }
    }
    return { ok: true as const, datos: d }
  } catch (err) {
    return { ok: false as const, error: limpiar(String(err)) }
  }
}

/** El Page Access Token de una conexión, descifrado. */
async function tokenDe(conexion: string): Promise<string | null> {
  const filas = await rpc('credencial_de_conexion', { p_conexion: conexion })
  const c = Array.isArray(filas) ? filas[0] : filas
  if (!c?.page_access_token_cipher) return null
  return await descifrar(
    desdeHexPg(c.page_access_token_cipher),
    desdeHexPg(c.page_access_token_nonce),
    c.page_access_token_kid,
  )
}

Deno.serve(async (req) => {
  try {
    if (!SUPABASE_URL || !SECRETO) return json({ error: 'sin configurar' }, 503)
    if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
      return json({ error: 'no autorizado' }, 401)
    }

    const { accion, conexion } = (await req.json().catch(() => ({}))) as {
      accion?: string
      conexion?: string
    }
    if (!conexion) return json({ error: 'falta la conexión' }, 400)

    // La conexión trae qué activos tiene. Se lee de la base y no del parámetro:
    // así no se puede pedir contenido de una Página que no es de este espacio.
    const filas = (await fetch(
      `${SUPABASE_URL}/rest/v1/meta_connections?id=eq.${conexion}` +
      `&select=page_id,page_name,ig_business_account_id,ig_username,estado`,
      {
        headers: { apikey: SECRETO, Authorization: `Bearer ${SECRETO}`, 'User-Agent': 'kavea-contenido/0.1' },
        signal: AbortSignal.timeout(15_000),
      },
    ).then((r) => r.json()).catch(() => [])) as Array<Record<string, string | null>>

    const cx = filas[0]
    if (!cx) return json({ error: 'no existe esa conexión' }, 404)

    const token = await tokenDe(conexion)
    if (!token) return json({ error: 'Esa conexión no tiene credencial guardada.' }, 409)

    // -----------------------------------------------------------------------
    // INSTAGRAM: perfil + medios
    // -----------------------------------------------------------------------
    if (accion === 'instagram') {
      const ig = cx.ig_business_account_id
      if (!ig) return json({ error: 'Esta conexión no tiene Instagram vinculado.' }, 409)

      const perfil = await graph(
        `https://graph.facebook.com/${V}/${ig}` +
        `?fields=id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url` +
        `&access_token=${encodeURIComponent(token)}`,
      )
      if (!perfil.ok) return json({ error: perfil.error }, 502)

      const medios = await graph(
        `https://graph.facebook.com/${V}/${ig}/media` +
        `?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count` +
        `&limit=12&access_token=${encodeURIComponent(token)}`,
      )

      return json({
        ok: true,
        perfil: perfil.datos,
        // Que falle la lista no tumba el perfil: son dos preguntas distintas y
        // media respuesta vale más que un error.
        medios: medios.ok ? (medios.datos?.data ?? []) : [],
        aviso_medios: medios.ok ? null : medios.error,
      })
    }

    // -----------------------------------------------------------------------
    // PÁGINA: identidad + publicaciones + fotos + eventos
    // -----------------------------------------------------------------------
    if (accion === 'pagina') {
      const pid = cx.page_id
      if (!pid) return json({ error: 'Esta conexión no es de una Página.' }, 409)

      const pagina = await graph(
        `https://graph.facebook.com/${V}/${pid}` +
        `?fields=id,name,username,about,category,link,fan_count,followers_count,picture{url}` +
        `&access_token=${encodeURIComponent(token)}`,
      )
      if (!pagina.ok) return json({ error: pagina.error }, 502)

      // En paralelo: las tres son independientes y ninguna bloquea a las otras.
      const [posts, fotos, eventos] = await Promise.all([
        graph(`https://graph.facebook.com/${V}/${pid}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=10&access_token=${encodeURIComponent(token)}`),
        graph(`https://graph.facebook.com/${V}/${pid}/photos?type=uploaded&fields=id,name,created_time,images,link&limit=10&access_token=${encodeURIComponent(token)}`),
        graph(`https://graph.facebook.com/${V}/${pid}/events?fields=id,name,start_time,place,cover&limit=10&access_token=${encodeURIComponent(token)}`),
      ])

      return json({
        ok: true,
        pagina: pagina.datos,
        publicaciones: posts.ok ? (posts.datos?.data ?? []) : [],
        fotos: fotos.ok ? (fotos.datos?.data ?? []) : [],
        eventos: eventos.ok ? (eventos.datos?.data ?? []) : [],
        // Los avisos se devuelven en vez de tragarse: una Página sin eventos y
        // una Página cuyo permiso de eventos falló se ven igual en pantalla si
        // nadie lo dice, y son cosas muy distintas.
        avisos: {
          publicaciones: posts.ok ? null : posts.error,
          fotos: fotos.ok ? null : fotos.error,
          eventos: eventos.ok ? null : eventos.error,
        },
      })
    }

    return json({ error: 'acción desconocida' }, 400)
  } catch (err) {
    return json({ error: limpiar(String(err)) }, 500)
  }
})
