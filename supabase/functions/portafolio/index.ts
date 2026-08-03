/**
 * El portafolio de Meta de Boosty, y la conexión de una de sus Páginas.
 *
 * Fuente: docs/fases/05b-fase-panel-interno.md, bloque B.
 *
 * POR QUÉ ESTO ES UNA FUNCIÓN DE BORDE Y NO UNA RUTA DE NEXT
 *
 * Aquí vive el uso del token de portafolio y el ÚNICO cifrado del sistema. Las
 * dos cosas quieren estar lo más lejos posible del navegador y lo más cerca
 * posible de los secretos. Una ruta de Next también corre en servidor, pero
 * comparte proceso con todo lo demás de la aplicación; esto corre aislado y solo
 * lo alcanza quien tiene la clave de servicio.
 *
 * EL TOKEN DE PORTAFOLIO NO SALE DE AQUÍ. Ni en una respuesta, ni en un log, ni
 * en un mensaje de error. Deriva Page Access Tokens de las 28 Páginas: quien lo
 * tenga puede escribir en nombre de cualquiera de ellas.
 */

import { cifrar, aHexPg } from '../_compartido/cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const KID = 'k1'

/**
 * Los campos que Meta ENTREGA para cada Página.
 *
 * `access_token` viene incluido: medido el 2 de agosto de 2026 sobre las 28
 * Páginas del portafolio, las 28 lo traen. No hace falta una segunda llamada por
 * Página para derivarlo.
 */
const CAMPOS = 'id,name,tasks,access_token,instagram_business_account{id,username}'

const CAMPOS_MESSENGER = [
  'messages', 'messaging_postbacks', 'message_echoes', 'message_reads',
  'message_reactions', 'messaging_referrals', 'messaging_optins', 'messaging_handovers',
]

type Pagina = {
  id: string
  name: string
  tasks?: string[]
  access_token?: string
  instagram_business_account?: { id: string; username: string }
}

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function sql<T>(ruta: string, init?: RequestInit): Promise<T> {
  const clave = claveServicio()
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-portafolio/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 300)}`)
  if (r.status === 204) return undefined as T
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

function tokenPortafolio(): string {
  const t = Deno.env.get('META_PORTFOLIO_TOKEN')
  if (!t) throw new Error('No hay token de portafolio configurado.')
  return t
}

/** Todas las Páginas, paginando. Veintiocho hoy; no se asume que sigan siendo 28. */
async function listarPaginas(): Promise<Pagina[]> {
  const out: Pagina[] = []
  let url = `https://graph.facebook.com/${V}/me/accounts?fields=${CAMPOS}&limit=100`
  for (let i = 0; i < 10 && url; i++) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenPortafolio()}` },
      signal: AbortSignal.timeout(20_000),
    })
    const j = await r.json().catch(() => ({})) as {
      data?: Pagina[]
      paging?: { next?: string }
      error?: { message?: string }
    }
    if (j.error) throw new Error(j.error.message ?? 'Meta rechazó la consulta.')
    out.push(...(j.data ?? []))
    url = j.paging?.next ?? ''
  }
  return out
}

Deno.serve(async (req: Request): Promise<Response> => {
  let cuerpo: { accion?: string; page_id?: string; organizacion?: string }
  try {
    cuerpo = await req.json()
  } catch {
    cuerpo = {}
  }

  try {
    // --- listar -------------------------------------------------------------
    if (cuerpo.accion === 'listar' || !cuerpo.accion) {
      const paginas = await listarPaginas()
      const conectadas = await sql<Array<{ page_id: string; organization_id: string }>>(
        'meta_connections?select=page_id,organization_id',
      )
      const porPagina = new Map(conectadas.map((c) => [c.page_id, c.organization_id]))

      // Se devuelve TODO menos el token. Ni el de portafolio ni los de Página:
      // el navegador no tiene nada que hacer con ellos y una respuesta que los
      // lleve acaba en el historial de red de alguien.
      return json({
        paginas: paginas.map((p) => ({
          id: p.id,
          nombre: p.name,
          tasks: p.tasks ?? [],
          // Sin MESSAGING ni MODERATE ni MANAGE, la Página puede conectarse y
          // no recibir nada. No se bloquea —las fuentes no coinciden en cuál es
          // el valor que hace falta— pero se dice.
          puede_mensajear: (p.tasks ?? []).some((t) =>
            ['MESSAGING', 'MODERATE', 'MANAGE'].includes(t)),
          instagram: p.instagram_business_account?.username ?? null,
          instagram_id: p.instagram_business_account?.id ?? null,
          organizacion: porPagina.get(p.id) ?? null,
        })),
      })
    }

    // --- conectar -----------------------------------------------------------
    if (cuerpo.accion === 'conectar') {
      const { page_id, organizacion } = cuerpo
      if (!page_id || !organizacion) return json({ error: 'faltan datos' }, 400)

      const pagina = (await listarPaginas()).find((p) => p.id === page_id)
      if (!pagina) return json({ error: 'esa Página no está en el portafolio' }, 404)
      if (!pagina.access_token) return json({ error: 'Meta no devolvió token para esa Página' }, 502)

      // 1. La fila. Si la Página ya estaba conectada, el RPC lo rechaza: una
      //    Página en dos espacios metería los mensajes de un cliente en la
      //    bandeja de otro.
      const conexion = await sql<string>('rpc/registrar_conexion', {
        method: 'POST',
        headers: { Accept: 'application/vnd.pgrst.object+json' },
        body: JSON.stringify({
          p_org: organizacion,
          p_page_id: pagina.id,
          p_page_name: pagina.name,
          p_ig_id: pagina.instagram_business_account?.id ?? null,
          p_ig_user: pagina.instagram_business_account?.username ?? null,
          p_business: Deno.env.get('META_BUSINESS_ID') ?? null,
          p_tasks: pagina.tasks ?? [],
        }),
      })

      // 2. La credencial, cifrada. Es lo único de todo el flujo que no se puede
      //    rehacer desde fuera: si esto falla, la conexión queda sin token y hay
      //    que borrarla a mano. Por eso va antes que la suscripción.
      const { cipher, nonce, kid } = await cifrar(pagina.access_token, KID)
      await sql('rpc/guardar_credencial', {
        method: 'POST',
        body: JSON.stringify({
          p_conexion: conexion,
          p_cipher: aHexPg(cipher),
          p_nonce: aHexPg(nonce),
          p_kid: kid,
        }),
      })

      // 3. La suscripción a los webhooks. Con el token de la PÁGINA, no con el
      //    de portafolio: es la llamada que Meta documenta y la que el
      //    reconciliador repetirá cada quince minutos.
      const form = new URLSearchParams()
      form.set('subscribed_fields', CAMPOS_MESSENGER.join(','))
      const rs = await fetch(`https://graph.facebook.com/${V}/${pagina.id}/subscribed_apps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pagina.access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(20_000),
      })
      const js = await rs.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }

      // 4. El diagnóstico, inmediatamente. Conectar y no comprobar es cómo se
      //    entrega un canal que dice «conectado» y está mudo.
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/diagnosticar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${claveServicio()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conexion, origen: 'alta' }),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => {})

      return json({
        conexion,
        suscrito: Boolean(js.success),
        // Si la suscripción falló se dice, y no se deshace la conexión: el
        // reconciliador la reintenta cada quince minutos y el panel lo enseña
        // en rojo. Borrar la conexión perdería la credencial recién cifrada.
        aviso: js.success ? null : (js.error?.message ?? 'La suscripción no confirmó.'),
      })
    }

    return json({ error: 'acción desconocida' }, 400)
  } catch (err) {
    // El mensaje se recorta y NUNCA se devuelve el cuerpo de una respuesta de
    // Meta entera: podría llevar un token dentro.
    return json({ error: String(err).slice(0, 300) }, 500)
  }
})

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
