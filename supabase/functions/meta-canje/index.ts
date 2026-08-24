/**
 * Canjea el código del diálogo de Meta por una AUTORIZACIÓN. Nada más.
 *
 * ESTA FUNCIÓN EXISTE POR EL APP SECRET. El intercambio del código lo exige, y
 * ese mismo secreto firma los webhooks entrantes: con él se puede fabricar un
 * evento que Kavea aceptaría como legítimo. Así que no entra en el proceso de
 * Next ni en variables de Netlify. Vive en el almacén del borde y solo aquí.
 *
 * QUÉ HACE Y QUÉ YA NO HACE. Hasta el 24-ago esta función canjeaba el código Y
 * conectaba la Página en la misma pasada, y abortaba si el cliente autorizaba
 * más de una: «Kavea todavía conecta una por vez, repite el diálogo». Repetir un
 * diálogo de OAuth una vez por Página es cobrarle al cliente el precio de
 * nuestra implementación —cinco pantallas de Meta por activo—, y el modelo que
 * pidió Gabriel es el correcto: **una autenticación con Facebook, y la elección
 * de qué activar se hace dentro de Kavea, con la lista delante**.
 *
 * Así que aquí termina la parte que necesita el App Secret:
 *   1. código → BISU
 *   2. el BISU se cifra y se guarda A NOMBRE DE LA ORGANIZACIÓN
 *   3. se devuelve cuántos activos se ven, para poder decirlo al volver
 *
 * Descubrir y activar viven en `meta-activos`, que ya no necesita el secreto:
 * le basta el BISU guardado.
 */

import { cifrar, aHexPg } from '../_compartido/cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const APP_ID = Deno.env.get('META_APP_ID') ?? ''
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
const KID = Deno.env.get('KAVEA_CRED_KID') ?? 'k1'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

/** Fase 5 §T8: un token no aparece en un log, nunca. */
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

function fallo(paso: string, error: string, http = 200) {
  return json({ ok: false, paso, error: limpiar(error) }, http)
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

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-canje/0.2',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${limpiar(texto)}`)
  return texto ? JSON.parse(texto) : null
}

Deno.serve(async (req) => {
  try {
    if (!APP_ID || !APP_SECRET || !SUPABASE_URL || !SECRETO) {
      return fallo('configuración', 'Faltan secretos en el borde', 503)
    }
    if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
      return fallo('autorización', 'no autorizado', 401)
    }

    const { code, organizacion, config_id, redirect_uri, usuario } =
      (await req.json().catch(() => ({}))) as Record<string, string | undefined>

    if (!code || !organizacion || !redirect_uri) {
      return fallo('parámetros', 'faltan code, organizacion o redirect_uri', 400)
    }

    // -----------------------------------------------------------------------
    // 1. El código por el BISU
    // -----------------------------------------------------------------------
    // `redirect_uri` tiene que ser IDÉNTICA a la del diálogo: Meta la usa como
    // parte de la prueba de que quien canjea es quien pidió. Por eso viaja desde
    // Next en vez de reconstruirse aquí, donde una barra de más la rompería sin
    // decir por qué.
    const canje = await graph(`https://graph.facebook.com/${V}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri,
        code,
      }),
    })
    if (!canje.ok) return fallo('canje del código', canje.error)

    const bisu: string = canje.datos.access_token
    if (!bisu) return fallo('canje del código', 'Meta no devolvió token')

    // -----------------------------------------------------------------------
    // 2. Qué concedió, para poder explicarlo después sin volver a preguntar
    // -----------------------------------------------------------------------
    const permisos = await graph(
      `https://graph.facebook.com/${V}/me/permissions?access_token=${encodeURIComponent(bisu)}`,
    )
    const scopes = permisos.ok
      ? (permisos.datos?.data ?? [])
          .filter((p: { status?: string }) => p.status === 'granted')
          .map((p: { permission: string }) => p.permission)
      : null

    // -----------------------------------------------------------------------
    // 3. Guardar la autorización, cifrada, a nombre de la ORGANIZACIÓN
    // -----------------------------------------------------------------------
    const c = await cifrar(bisu, KID)
    await rpc('guardar_autorizacion', {
      p_org: organizacion,
      p_cipher: aHexPg(c.cipher),
      p_nonce: aHexPg(c.nonce),
      p_kid: c.kid,
      p_config_id: config_id ?? null,
      p_scopes: scopes,
      p_usuario: usuario ?? null,
    })

    // -----------------------------------------------------------------------
    // 4. Contar lo que se ve, solo para el mensaje de vuelta
    // -----------------------------------------------------------------------
    // No se crea ninguna conexión aquí. Elegir es del cliente y ocurre en Kavea.
    const cuentas = await graph(
      `https://graph.facebook.com/${V}/me/accounts?fields=id&limit=200&access_token=${encodeURIComponent(bisu)}`,
    )
    const cuantas = cuentas.ok ? (cuentas.datos?.data ?? []).length : null

    return json({ ok: true, paginas_visibles: cuantas, scopes })
  } catch (err) {
    return fallo('inesperado', String(err), 500)
  }
})
