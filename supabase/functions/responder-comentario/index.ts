/**
 * Publica la respuesta a un comentario.
 *
 * LA DECISIÓN YA ESTÁ TOMADA CUANDO LLEGA AQUÍ. `public.responder_comentario`
 * comprueba la sesión, la pertenencia y el estado, deja la actividad registrada
 * y devuelve el `comment_id`. Esta función solo pone el mensaje en Meta, que es
 * lo único que no se puede hacer desde Postgres porque hace falta el token.
 *
 * Esa separación es la misma de todo el sistema: Postgres decide y registra, el
 * borde habla con el mundo. Si esta función también decidiera, habría dos sitios
 * donde comprobar quién puede responder, y el que se olvide es el que abre el
 * agujero.
 *
 * `POST /{comment-id}/replies` con `message`. La respuesta cuelga del comentario
 * y es pública, igual que el comentario.
 */

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

function tokenPortafolio(): string {
  const t = Deno.env.get('META_PORTFOLIO_TOKEN')
  if (!t) throw new Error('No hay token de portafolio configurado.')
  return t
}

/**
 * El Page Access Token, derivado en cada invocación.
 *
 * Mismo motivo que en `plantillas-utilidad`: la credencial cifrada de la
 * conexión se emitió antes de que el system user tuviera `instagram_manage_comments`
 * en su ámbito, y derivar aquí evita reconectar una Página viva solo para
 * ampliar un permiso.
 */
async function tokenDePagina(pageId: string): Promise<string> {
  const r = await fetch(
    `https://graph.facebook.com/${V}/${encodeURIComponent(pageId)}?fields=access_token`,
    { headers: { Authorization: `Bearer ${tokenPortafolio()}` } },
  )
  const j = await r.json() as { access_token?: string; error?: { message?: string } }
  if (!j.access_token) {
    throw new Error(j.error?.message ?? 'no se pudo derivar el token de la Página')
  }
  return j.access_token
}

async function sql<T>(ruta: string, init?: RequestInit): Promise<T> {
  const clave = claveServicio()
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-comentarios/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  let cuerpo: { comment_id?: string; texto?: string; asset_id?: string }
  try {
    cuerpo = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'cuerpo no válido' }), { status: 400 })
  }

  const comentario = (cuerpo.comment_id ?? '').trim()
  const texto = (cuerpo.texto ?? '').trim()
  if (!comentario || !texto) {
    return new Response(JSON.stringify({ error: 'falta el comentario o el texto' }), { status: 400 })
  }

  try {
    // La Página se resuelve desde la ruta del asset por el que entró el
    // comentario, no se recibe: es lo mismo que hace el normalizador y es lo que
    // impide responder desde la Página de otro cliente.
    const rutas = await sql<Array<{ asset_id: string; tipo: string }>>(
      `meta_asset_routes?select=asset_id,tipo&tipo=eq.page&limit=1`,
    )
    const pageId = rutas?.[0]?.asset_id
    if (!pageId) {
      return new Response(JSON.stringify({ error: 'no hay Página conectada' }), { status: 409 })
    }

    const token = await tokenDePagina(pageId)

    const form = new URLSearchParams()
    form.set('message', texto)

    const r = await fetch(
      `https://graph.facebook.com/${V}/${encodeURIComponent(comentario)}/replies`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    )
    const j = await r.json() as { id?: string; error?: { message?: string; code?: number } }

    if (j.error || !j.id) {
      return new Response(
        JSON.stringify({ error: j.error?.message ?? 'Meta no aceptó la respuesta' }),
        { status: 502 },
      )
    }

    return new Response(JSON.stringify({ id: j.id }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), { status: 500 })
  }
})
