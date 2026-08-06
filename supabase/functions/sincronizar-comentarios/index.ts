/**
 * Lee los comentarios de Instagram y los mete en la bandeja de comentarios.
 *
 * POR QUÉ EXISTE, SI YA HAY INGESTA POR WEBHOOK
 *
 * Porque el webhook no llega. Comprobado el 6 de agosto de 2026: se comentó una
 * publicación real de la cuenta conectada y no entró ni un evento. Falta la
 * suscripción al campo `comments` del objeto `instagram`, que se configura en el
 * panel de Meta.
 *
 * Y AUNQUE LLEGARA, ESTO SEGUIRÍA HACIENDO FALTA. Un webhook es una entrega, y
 * una entrega se pierde: tras una hora de fallos Meta desuscribe en silencio, y
 * lo que no llegó no vuelve solo. Esta lectura es la que reconcilia y descubre el
 * hueco, igual que el reconciliador de suscripciones.
 *
 * NO SE PAGINA HASTA EL FINAL, y es deliberado. Se leen las publicaciones más
 * recientes y sus comentarios. Recorrer el historial entero de una cuenta con
 * años de contenido en una función con presupuesto de CPU es cómo se construye
 * un trabajo que muere a mitad y deja la mitad aplicada. Los comentarios viejos,
 * si alguna vez hacen falta, son otro trabajo con su cursor.
 */

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

/** Publicaciones que se miran por pasada. Las nuevas primero, que es donde se comenta. */
const MEDIA = 12

type Comentario = { id?: string; username?: string; text?: string; timestamp?: string }
type Media = { id?: string; comments_count?: number; comments?: { data?: Comentario[] } }

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

async function tokenDePagina(pageId: string): Promise<string> {
  const r = await fetch(
    `https://graph.facebook.com/${V}/${encodeURIComponent(pageId)}?fields=access_token`,
    { headers: { Authorization: `Bearer ${tokenPortafolio()}` } },
  )
  const j = await r.json() as { access_token?: string; error?: { message?: string } }
  if (!j.access_token) throw new Error(j.error?.message ?? 'no se pudo derivar el token')
  return j.access_token
}

Deno.serve(async (): Promise<Response> => {
  const t0 = Date.now()
  // `nuevos` y `refrescados`, no «aplicados». El upsert siempre aplica: la
  // primera versión contaba eso y anunciaba tres traídos en una pasada que no
  // cambió una sola fila. Un resumen que miente es peor que no tenerlo, porque
  // se cree, y este es el que dirá si la lectura está supliendo al webhook.
  const resumen = { publicaciones: 0, comentarios: 0, nuevos: 0, refrescados: 0 }

  try {
    // La cuenta de Instagram y su Página se leen de las rutas de asset, que es la
    // misma tabla por la que el normalizador resuelve el tenant. Así el
    // comentario cae en la organización correcta sin adivinar nada.
    const rutas = await sql<Array<{ asset_id: string; tipo: string; organization_id: string }>>(
      'meta_asset_routes?select=asset_id,tipo,organization_id',
    )
    const ig = rutas.find((r) => r.tipo === 'ig_business_account')
    const page = rutas.find((r) => r.tipo === 'page')
    if (!ig || !page) {
      return new Response(JSON.stringify({ error: 'no hay cuenta de Instagram conectada' }),
        { status: 409 })
    }

    const token = await tokenDePagina(page.asset_id)

    const campos = 'id,comments_count,comments.limit(50){id,username,text,timestamp}'
    const r = await fetch(
      `https://graph.facebook.com/${V}/${encodeURIComponent(ig.asset_id)}` +
        `/media?fields=${encodeURIComponent(campos)}&limit=${MEDIA}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const j = await r.json() as { data?: Media[]; error?: { message?: string } }
    if (j.error) {
      return new Response(JSON.stringify({ error: j.error.message }), { status: 502 })
    }

    for (const m of j.data ?? []) {
      resumen.publicaciones++
      for (const c of m.comments?.data ?? []) {
        if (!c.id) continue
        resumen.comentarios++

        const efecto = {
          organization_id: ig.organization_id,
          canal: 'instagram',
          asset_id: ig.asset_id,
          comment_id: c.id,
          post_id: m.id ?? null,
          autor_username: c.username ?? null,
          texto: c.text ?? null,
          // `timestamp` viene ISO con desfase; la tabla guarda milisegundos.
          meta_timestamp_ms: c.timestamp ? Date.parse(c.timestamp) : null,
          // Se guarda lo que Meta devolvió, igual que hace la ingesta por webhook:
          // el día que la forma cambie, el crudo es lo único que lo explica.
          raw: c,
        }

        const res = await sql<{ estado?: string; nuevo?: boolean }>('rpc/ingerir_comentario', {
          method: 'POST',
          body: JSON.stringify({ p: efecto }),
        })
        if (res?.nuevo) resumen.nuevos++
        else resumen.refrescados++
      }
    }

    return new Response(JSON.stringify({ ...resumen, ms: Date.now() - t0 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300), ...resumen }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
