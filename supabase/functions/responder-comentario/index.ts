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
 *
 * LA PÁGINA SE RESUELVE POR EL COMENTARIO, y esto se arregló el 24-ago. Antes
 * era `meta_asset_routes?tipo=eq.page&limit=1`: la primera fila de la tabla
 * entera. Con una Página conectada acierta siempre; con tres, de dos
 * organizaciones, responde con la cuenta que devuelva Postgres. La pregunta
 * estaba mal hecha y la respuesta era plausible, que es lo que lo mantuvo
 * invisible.
 *
 * Y LO PUBLICADO SE GUARDA. Hasta hoy la respuesta salía en Instagram y aquí no
 * quedaba fila: no se veía sin volver a leer de Meta, y no se podía editar ni
 * borrar porque Kavea no sabía que era suya.
 */

import { conexionDeAsset, conToken } from '../_compartido/token-pagina.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const URL_SB = Deno.env.get('SUPABASE_URL') ?? ''

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function sql<T>(ruta: string, init?: RequestInit): Promise<T> {
  const clave = claveServicio()
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-comentarios/0.1',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  let cuerpo: { comentario?: string; comment_id?: string; texto?: string; actor?: string | null }
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
    // El activo por el que entró el comentario decide con qué cuenta se
    // responde. Se lee de la fila y no se recibe por parámetro: aceptarlo sería
    // ofrecer una forma de responder desde la Página de otro cliente.
    const filas = await sql<Array<{ id: string; asset_id: string }>>(
      `comentarios?select=id,asset_id&comment_id=eq.${encodeURIComponent(comentario)}&limit=1`,
    )
    const fila = filas?.[0]
    if (!fila) {
      return new Response(JSON.stringify({ error: 'no existe ese comentario' }), { status: 404 })
    }

    const cx = await conexionDeAsset(fila.asset_id)
    if (!cx) {
      return new Response(JSON.stringify({ error: 'Esa cuenta ya no está conectada.' }), { status: 409 })
    }

    const form = new URLSearchParams({ message: texto })
    const r = await conToken<{ id?: string }>(cx, async (token) => {
      const res = await fetch(
        `https://graph.facebook.com/${V}/${encodeURIComponent(comentario)}/replies`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(15_000),
        },
      )
      const j = await res.json().catch(() => ({})) as { id?: string; error?: Record<string, unknown> }
      if (!res.ok || j.error || !j.id) {
        return { ok: false, error: (j.error ?? { message: `HTTP ${res.status}` }) as never }
      }
      return { ok: true, datos: j }
    })

    if (!r.ok || !r.datos?.id) {
      return new Response(
        JSON.stringify({ error: r.error ?? 'Meta no aceptó la respuesta' }),
        { status: 502 },
      )
    }

    // Guardar lo publicado. Si esto falla, la respuesta YA está en Instagram:
    // se devuelve el éxito con un aviso, porque decir que no salió llevaría a
    // publicarla otra vez, y eso sí se ve en público.
    let guardado: string | null = null
    let aviso = r.aviso ?? null
    try {
      guardado = await sql<string>('rpc/anotar_respuesta', {
        method: 'POST',
        body: JSON.stringify({
          p_padre: fila.id,
          p_comment_id: r.datos.id,
          p_texto: texto,
          p_actor: cuerpo.actor ?? null,
          p_autor: cx.ig_username ?? cx.page_name ?? null,
        }),
      })
    } catch (e) {
      aviso = `La respuesta salió en Meta pero no se pudo guardar aquí (${String(e).slice(0, 120)}).`
    }

    return new Response(JSON.stringify({ id: r.datos.id, comentario: guardado, via: r.via, aviso }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), { status: 500 })
  }
})
