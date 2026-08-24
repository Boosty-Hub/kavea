/**
 * Los activos que la autorización deja ver, y activarlos uno a uno.
 *
 * Es la segunda mitad del modelo que pidió Gabriel el 24-ago: **una sola
 * autenticación con Facebook, y la elección dentro de Kavea**. `meta-canje`
 * guarda el BISU del portafolio; esta función lo usa para dos cosas:
 *
 *   · `listar`  — qué Páginas hay, qué Instagram cuelga de cada una, cuáles ya
 *                 están conectadas y cuáles no se pueden conectar y por qué.
 *   · `activar` — coger UNA Página y hacer lo que antes hacía el canje: su token,
 *                 el Instagram vinculado, cifrar, persistir y suscribir webhooks.
 *
 * NO NECESITA EL APP SECRET, y por eso está separada de `meta-canje`: el secreto
 * solo hace falta para cambiar un código por un token. Con el BISU ya guardado,
 * todo lo demás son llamadas normales a Graph. Menos sitios que tocan el secreto
 * es menos superficie.
 *
 * ACTIVAR ES POR PÁGINA Y A PROPÓSITO. Un fallo al conectar la tercera no puede
 * deshacer las dos anteriores ni dejar la pantalla sin saber cuál falló. Cada
 * activación es independiente y devuelve su propio resultado.
 */

import { cifrar, descifrar, aHexPg, desdeHexPg } from '../_compartido/cripto.ts'
import { CAMPOS_MESSENGER } from '../_compartido/campos.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const KID = Deno.env.get('KAVEA_CRED_KID') ?? 'k1'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

function limpiar(s: string): string {
  return s
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[oculto]')
    .replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[oculto]"')
    .slice(0, 300)
}

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function graph(url: string, init: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
    const texto = await r.text()
    let datos: any
    try {
      datos = JSON.parse(texto)
    } catch {
      return { ok: false as const, error: `respuesta no JSON (${r.status})` }
    }
    if (!r.ok || datos?.error) {
      const e = datos?.error ?? {}
      const partes = [e.message, e.code && `code ${e.code}`, e.error_subcode && `subcode ${e.error_subcode}`]
      return { ok: false as const, error: limpiar(partes.filter(Boolean).join(' · ') || `HTTP ${r.status}`) }
    }
    return { ok: true as const, datos }
  } catch (err) {
    return { ok: false as const, error: limpiar(String(err)) }
  }
}

function cabeceras() {
  return {
    apikey: SECRETO,
    Authorization: `Bearer ${SECRETO}`,
    'Content-Type': 'application/json',
    'User-Agent': 'kavea-activos/0.1',
  }
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: cabeceras(), body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${limpiar(texto)}`)
  return texto ? JSON.parse(texto) : null
}

/** El BISU de la organización, ya descifrado. */
async function bisuDe(org: string): Promise<string | null> {
  const filas = await rpc('autorizacion_de_organizacion', { p_org: org })
  const a = Array.isArray(filas) ? filas[0] : filas
  if (!a?.bisu_cipher) return null
  return await descifrar(desdeHexPg(a.bisu_cipher), desdeHexPg(a.bisu_nonce), a.bisu_kid)
}

type Pagina = {
  id: string
  name?: string
  tasks?: string[]
  access_token?: string
  instagram_business_account?: { id?: string; username?: string }
}

/** Todas las Páginas que ve el BISU, con su Instagram, paginando. */
async function paginasDe(bisu: string) {
  const out: Pagina[] = []
  let url =
    `https://graph.facebook.com/${V}/me/accounts` +
    `?fields=id,name,tasks,access_token,instagram_business_account{id,username,profile_picture_url}` +
    `&limit=100&access_token=${encodeURIComponent(bisu)}`

  // Tope de seguridad: un portafolio grande no puede convertirse en un bucle.
  for (let i = 0; i < 10 && url; i++) {
    const r = await graph(url)
    if (!r.ok) return { ok: false as const, error: r.error }
    out.push(...((r.datos?.data ?? []) as Pagina[]))
    url = r.datos?.paging?.next ?? ''
  }
  return { ok: true as const, paginas: out }
}

Deno.serve(async (req) => {
  try {
    if (!SUPABASE_URL || !SECRETO) return json({ ok: false, error: 'sin configurar' }, 503)
    if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
      return json({ ok: false, error: 'no autorizado' }, 401)
    }

    const { accion, organizacion, page_id } =
      (await req.json().catch(() => ({}))) as Record<string, string | undefined>
    if (!organizacion) return json({ ok: false, error: 'falta la organización' }, 400)

    const bisu = await bisuDe(organizacion)
    if (!bisu) {
      return json({
        ok: false,
        sin_autorizacion: true,
        error: 'Este espacio todavía no ha autorizado ninguna cuenta de Facebook.',
      })
    }

    const res = await paginasDe(bisu)
    if (!res.ok) {
      // Un BISU muerto se nota justo aquí y hay que decirlo tal cual: lo que toca
      // es repetir el diálogo, no reintentar.
      return json({ ok: false, error: res.error, reautorizar: true })
    }

    // Qué hay ya conectado EN CUALQUIER espacio: una Página no puede estar en
    // dos, así que la pantalla tiene que poder decir «esta ya está en otro» en
    // vez de dejar pulsar y fallar.
    const yaR = await fetch(
      `${SUPABASE_URL}/rest/v1/meta_connections?select=page_id,organization_id,estado`,
      { headers: cabeceras(), signal: AbortSignal.timeout(15_000) },
    )
    const ya = (await yaR.json().catch(() => [])) as Array<{
      page_id: string | null; organization_id: string; estado: string
    }>
    const porPagina = new Map(ya.filter((c) => c.page_id).map((c) => [c.page_id as string, c]))

    // -----------------------------------------------------------------------
    // LISTAR
    // -----------------------------------------------------------------------
    if (accion !== 'activar') {
      return json({
        ok: true,
        paginas: res.paginas.map((p) => {
          const c = porPagina.get(p.id)
          const ig = p.instagram_business_account
          return {
            page_id: p.id,
            nombre: p.name ?? p.id,
            tasks: p.tasks ?? [],
            // Sin una tarea de mensajería la Página se puede conectar igual
            // —el árbitro real es V7— pero conviene decirlo antes.
            puede_mensajear: (p.tasks ?? []).some((t) =>
              ['MESSAGING', 'MODERATE', 'MANAGE'].includes(t)),
            instagram: ig?.id ? { id: ig.id, username: ig.username ?? null } : null,
            estado: !c
              ? 'sin_conectar'
              : c.organization_id === organizacion
                ? (c.estado === 'disconnected' ? 'desconectada' : 'conectada')
                : 'en_otro_espacio',
          }
        }),
      })
    }

    // -----------------------------------------------------------------------
    // ACTIVAR una Página concreta
    // -----------------------------------------------------------------------
    if (!page_id) return json({ ok: false, error: 'falta page_id' }, 400)

    const p = res.paginas.find((x) => x.id === page_id)
    if (!p) {
      return json({ ok: false, error: 'Esa Página no está entre las que autorizó esta cuenta.' })
    }
    const ajena = porPagina.get(page_id)
    if (ajena && ajena.organization_id !== organizacion) {
      return json({ ok: false, error: 'Esa Página ya está conectada a otro espacio de Kavea.' })
    }
    const tokenPagina = p.access_token
    if (!tokenPagina) {
      return json({
        ok: false,
        error: 'Meta no devolvió token para esa Página. Suele faltar el permiso de mensajería sobre ella.',
      })
    }

    const ig = p.instagram_business_account
    const igId = ig?.id ?? null
    const igUser = ig?.username ?? null

    // Informativo; que falle no aborta.
    const feats = await graph(
      `https://graph.facebook.com/${V}/${page_id}?fields=messaging_feature_status&access_token=${encodeURIComponent(tokenPagina)}`,
    )

    let conexion: string
    try {
      conexion = (await rpc('registrar_conexion_oauth', {
        p_org: organizacion,
        p_page_id: page_id,
        p_page_name: p.name ?? null,
        p_ig_id: igId,
        p_ig_user: igUser,
        p_business: null,
        p_tasks: p.tasks ?? null,
        p_config_id: null,
      })) as string
    } catch (err) {
      const t = String(err)
      if (t.includes('otro espacio')) {
        return json({ ok: false, error: 'Esa Página ya está conectada a otro espacio de Kavea.' })
      }
      return json({ ok: false, paso: 'registro', error: limpiar(t) })
    }

    const pat = await cifrar(tokenPagina, KID)
    await rpc('guardar_credencial', {
      p_conexion: conexion,
      p_cipher: aHexPg(pat.cipher),
      p_nonce: aHexPg(pat.nonce),
      p_kid: pat.kid,
    })

    if (feats.ok && feats.datos?.messaging_feature_status) {
      await fetch(`${SUPABASE_URL}/rest/v1/meta_connections?id=eq.${conexion}`, {
        method: 'PATCH',
        headers: { ...cabeceras(), Prefer: 'return=minimal' },
        body: JSON.stringify({ messaging_feature_status: feats.datos.messaging_feature_status }),
      }).catch(() => {})
    }

    // La suscripción a webhooks decide si la conexión sirve para algo. Si falla,
    // la fila queda en `degraded` y no en `connected`: una conexión que dice
    // «conectado» sin recibir nada es el peor estado posible.
    const sub = await graph(`https://graph.facebook.com/${V}/${page_id}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: CAMPOS_MESSENGER.join(','),
        access_token: tokenPagina,
      }),
    })
    if (!sub.ok || sub.datos?.success !== true) {
      await rpc('marcar_suscripcion', { p_conexion: conexion, p_ok: false }).catch(() => {})
      return json({
        ok: false, paso: 'suscripción a webhooks',
        error: sub.ok ? 'Meta no confirmó la suscripción' : sub.error,
      })
    }
    await rpc('marcar_suscripcion', {
      p_conexion: conexion, p_ok: true, p_campos_messenger: CAMPOS_MESSENGER,
    })

    // El alta acaba de invalidar el diagnóstico anterior: se rehace. No aborta.
    await fetch(`${SUPABASE_URL}/functions/v1/diagnosticar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRETO}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conexion }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {})

    return json({ ok: true, conexion, page_id, nombre: p.name ?? page_id, instagram: igUser })
  } catch (err) {
    return json({ ok: false, error: limpiar(String(err)) }, 500)
  }
})
