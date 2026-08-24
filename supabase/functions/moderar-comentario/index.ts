/**
 * Ocultar, mostrar, editar y borrar un comentario en Meta.
 *
 * LA DECISIÓN LLEGA TOMADA. `public.moderar_comentario` comprobó la sesión, la
 * pertenencia y si el comentario se puede tocar, y devolvió el `comment_id`.
 * Aquí solo se habla con Graph y luego se anota lo que Meta aceptó. Es el mismo
 * reparto de todo el sistema: Postgres decide y registra, el borde habla con el
 * mundo. Si esta función también decidiera, habría dos sitios donde comprobar
 * quién puede borrar, y el que se olvide es el que abre el agujero.
 *
 * EDITAR NO EXISTE EN INSTAGRAM. La arista de un comentario de IG acepta `hide`
 * y `DELETE`; el texto no se cambia. Así que editar es publicar el nuevo y
 * borrar el viejo, EN ESE ORDEN: si falla el segundo paso quedan dos
 * comentarios —visibles, y se arreglan a mano—, y al revés no quedaría ninguno.
 * De los dos fallos posibles se elige el que deja rastro.
 *
 * SE ANOTA DESPUÉS Y NO ANTES, al revés que `responder-comentario`. Allí adelantar
 * el estado evita responder dos veces en público, que es lo caro. Aquí no hay
 * nada que se duplique por esperar, y decir «oculto» de algo que Meta rechazó
 * sería una pantalla que miente.
 */

import { conexionDeAsset, conToken, type Conexion } from '../_compartido/token-pagina.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const URL_SB = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-comentarios/0.1',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

type Respuesta = { ok: boolean; datos?: any; error?: { message?: string; type?: string; code?: number } }

/** Una llamada a Graph, con la forma que `conToken` sabe interpretar. */
async function graph(url: string, init: RequestInit, token: string): Promise<Respuesta> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    })
    const t = await r.text()
    let d: any
    try { d = t ? JSON.parse(t) : {} } catch { return { ok: false, error: { message: `respuesta no JSON (${r.status})` } } }
    if (!r.ok || d?.error) return { ok: false, error: d?.error ?? { message: `HTTP ${r.status}` } }
    return { ok: true, datos: d }
  } catch (e) {
    return { ok: false, error: { message: String(e).slice(0, 200) } }
  }
}

/** Publicar un comentario: como respuesta a otro, o suelto en la publicación. */
function publicar(cx: Conexion, padre: string | null, post: string | null, texto: string) {
  // Una respuesta cuelga de su comentario padre; un comentario suelto, de la
  // publicación. El id se codifica; la arista no, que es parte de la ruta.
  const id = padre ?? post
  const arista = padre ? 'replies' : 'comments'
  if (!id) return null
  const cuerpo = new URLSearchParams({ message: texto })
  return (token: string) =>
    graph(
      `https://graph.facebook.com/${V}/${encodeURIComponent(id)}/${arista}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo.toString() },
      token,
    )
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!URL_SB || !SECRETO) return json({ error: 'sin configurar' }, 503)
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
    return json({ error: 'no autorizado' }, 401)
  }

  let cuerpo: {
    comentario?: string; accion?: string; comment_id?: string
    parent_id?: string | null; post_id?: string | null
    asset_id?: string; texto?: string | null; actor?: string | null
  }
  try { cuerpo = await req.json() } catch { return json({ error: 'cuerpo no válido' }, 400) }

  const { comentario, accion, comment_id: cid, asset_id: asset } = cuerpo
  if (!comentario || !accion || !cid || !asset) return json({ error: 'faltan datos' }, 400)

  try {
    const cx = await conexionDeAsset(asset)
    if (!cx) return json({ error: 'Esa cuenta ya no está conectada.' }, 409)

    // -----------------------------------------------------------------------
    // OCULTAR y MOSTRAR — `hide` es lo único que la arista de un comentario de
    // Instagram deja cambiar.
    // -----------------------------------------------------------------------
    if (accion === 'ocultar' || accion === 'mostrar') {
      const hide = accion === 'ocultar'
      const r = await conToken(cx, (t) =>
        graph(
          `https://graph.facebook.com/${V}/${encodeURIComponent(cid)}?hide=${hide}`,
          { method: 'POST' },
          t,
        ))
      if (!r.ok) return json({ error: r.error }, 502)
      await rpc('anotar_moderacion', {
        p_comentario: comentario, p_accion: accion, p_actor: cuerpo.actor ?? null,
      })
      return json({ ok: true, via: r.via, aviso: r.aviso })
    }

    // -----------------------------------------------------------------------
    // BORRAR
    // -----------------------------------------------------------------------
    if (accion === 'borrar') {
      const r = await conToken(cx, (t) =>
        graph(`https://graph.facebook.com/${V}/${encodeURIComponent(cid)}`, { method: 'DELETE' }, t))
      if (!r.ok) return json({ error: r.error }, 502)
      await rpc('anotar_moderacion', {
        p_comentario: comentario, p_accion: 'borrar', p_actor: cuerpo.actor ?? null,
      })
      return json({ ok: true, via: r.via, aviso: r.aviso })
    }

    // -----------------------------------------------------------------------
    // EDITAR — publicar el nuevo, y solo entonces borrar el viejo.
    // -----------------------------------------------------------------------
    if (accion === 'editar') {
      const texto = (cuerpo.texto ?? '').trim()
      if (!texto) return json({ error: 'El texto nuevo está vacío.' }, 400)

      const llamada = publicar(cx, cuerpo.parent_id ?? null, cuerpo.post_id ?? null, texto)
      if (!llamada) return json({ error: 'No se sabe dónde republicarlo.' }, 409)

      const nuevo = await conToken<{ id?: string }>(cx, llamada)
      if (!nuevo.ok || !nuevo.datos?.id) {
        return json({ error: nuevo.error ?? 'Meta no aceptó el texto nuevo.' }, 502)
      }

      const viejo = await conToken(cx, (t) =>
        graph(`https://graph.facebook.com/${V}/${encodeURIComponent(cid)}`, { method: 'DELETE' }, t))

      await rpc('anotar_moderacion', {
        p_comentario: comentario, p_accion: 'editar', p_actor: cuerpo.actor ?? null,
        p_texto: texto, p_nuevo_id: nuevo.datos.id,
      })

      // Si el borrado del viejo falló, hay dos comentarios en la publicación y
      // hay que decirlo: es visible para cualquiera que pase por ahí.
      return json({
        ok: true, id: nuevo.datos.id, via: nuevo.via,
        aviso: viejo.ok
          ? nuevo.aviso
          : `Se publicó el texto nuevo, pero el anterior no se pudo borrar (${viejo.error}). Están los dos en la publicación.`,
      })
    }

    return json({ error: 'acción desconocida' }, 400)
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
