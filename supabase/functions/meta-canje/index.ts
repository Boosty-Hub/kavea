/**
 * Canjea el código de Facebook Login for Business por una conexión funcionando.
 *
 * ESTA FUNCIÓN EXISTE POR UNA SOLA RAZÓN: EL APP SECRET. El intercambio del
 * código lo exige, y el App Secret firma también los webhooks entrantes — con
 * él se puede fabricar un evento que Kavea aceptaría como legítimo. Así que no
 * entra en el proceso de Next ni en variables de Netlify: vive en el almacén de
 * secretos del borde y solo aquí. La ruta `/api/meta/oauth/callback` autoriza y
 * encamina; decidir es de este lado. Es la misma frontera que ya usa
 * `/api/subdominio` con el token de Netlify.
 *
 * QUIÉN LA PUEDE LLAMAR: solo quien traiga la clave de servicio, que únicamente
 * tiene el servidor de Next. No hay ruta desde un navegador hasta aquí.
 *
 * EL ORDEN DE LOS PASOS ES EL DE `docs/fases/05` §T6 y no es negociable: cada
 * uno necesita lo que produjo el anterior, y el último —la suscripción a
 * webhooks— es el que decide si la conexión sirve para algo. Una conexión
 * guardada sin webhooks suscritos es exactamente el estado que produce el fallo
 * silencioso que este producto no se puede permitir: el cliente ve «conectado»
 * en su panel y no le entra un solo mensaje.
 */

import { cifrar, aHexPg } from '../_compartido/cripto.ts'
import { CAMPOS_MESSENGER } from '../_compartido/campos.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const APP_ID = Deno.env.get('META_APP_ID') ?? ''
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
// `k1` Y NO `v1`: el secreto que existe en el proyecto se llama
// `KAVEA_CRED_KEY_k1`, y `cripto.ts` compone el nombre de la variable con el
// `kid`. Un valor por defecto inventado aquí no fallaría al desplegar ni al
// arrancar: fallaría en el primer alta real, con «Falta KAVEA_CRED_KEY_v1»,
// después de haber canjeado ya el código —que es de un solo uso—. Comprobado
// contra las credenciales guardadas: todas las que tienen kid dicen `k1`.
const KID = Deno.env.get('KAVEA_CRED_KID') ?? 'k1'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

/**
 * Fase 5 §T8: un token no aparece en un log, nunca.
 *
 * Los ejemplos de Meta pasan el token en la query string, así que cualquier
 * error que arrastre una URL lo arrastra dentro. Esto se aplica a TODO lo que
 * salga de aquí hacia un log o hacia la respuesta, no solo a lo que se sospecha.
 */
function limpiar(s: string): string {
  return s
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[oculto]')
    .replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[oculto]"')
    .slice(0, 300)
}

type Fallo = { ok: false; paso: string; error: string }
function fallo(paso: string, error: string, http = 200): Response {
  return json({ ok: false, paso, error: limpiar(error) } satisfies Fallo, http)
}

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Llamada a Graph con timeout y con el error de Meta legible, sin tokens. */
async function graph(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: true; datos: any } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
    const texto = await r.text()
    let datos: any
    try {
      datos = JSON.parse(texto)
    } catch {
      return { ok: false, error: `respuesta no JSON (${r.status})` }
    }
    if (!r.ok || datos?.error) {
      const e = datos?.error ?? {}
      // El código y el subcódigo de Meta importan más que el texto: son lo que
      // distingue «falta un permiso» de «el token murió» en el diagnóstico.
      const partes = [e.message, e.code && `code ${e.code}`, e.error_subcode && `subcode ${e.error_subcode}`]
      return { ok: false, error: limpiar(partes.filter(Boolean).join(' · ') || `HTTP ${r.status}`) }
    }
    return { ok: true, datos }
  } catch (err) {
    return { ok: false, error: limpiar(String(err)) }
  }
}

/** RPC por PostgREST con la clave de servicio. */
async function rpc(nombre: string, args: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-canje/0.1',
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

    // Solo con la clave de servicio. Sin esto, cualquiera con la URL de la
    // función podría canjear códigos contra la app de Kavea.
    const auth = req.headers.get('Authorization') ?? ''
    if (auth !== `Bearer ${SECRETO}`) return fallo('autorización', 'no autorizado', 401)

    const cuerpo = (await req.json().catch(() => ({}))) as {
      code?: string
      organizacion?: string
      canal?: string
      config_id?: string
      redirect_uri?: string
    }
    const { code, organizacion, config_id, redirect_uri } = cuerpo
    if (!code || !organizacion || !redirect_uri) {
      return fallo('parámetros', 'faltan code, organizacion o redirect_uri', 400)
    }

    // ---------------------------------------------------------------------
    // PASO 2 — el código por el token BISU
    // ---------------------------------------------------------------------
    // `redirect_uri` tiene que ser IDÉNTICA a la del diálogo, carácter a
    // carácter: Meta la usa como parte de la prueba de que quien canjea es
    // quien pidió. Por eso viaja desde Next en vez de reconstruirse aquí, donde
    // una barra de más la rompería sin decir por qué.
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

    // ---------------------------------------------------------------------
    // PASO 3 — qué Páginas autorizó, y con qué permisos sobre cada una
    // ---------------------------------------------------------------------
    const cuentas = await graph(
      `https://graph.facebook.com/${V}/me/accounts?fields=id,name,tasks,access_token&access_token=${encodeURIComponent(bisu)}`,
    )
    if (!cuentas.ok) return fallo('lectura de Páginas', cuentas.error)

    const paginas: Array<{ id: string; name?: string; tasks?: string[]; access_token?: string }> =
      cuentas.datos?.data ?? []
    if (paginas.length === 0) {
      return fallo(
        'lectura de Páginas',
        'La autorización no incluyó ninguna Página. Vuelve a intentarlo y marca la Página en el diálogo de Meta.',
      )
    }
    // Una sola por alta: con varias no se sabe cuál quiere el cliente, y elegir
    // por él conecta la equivocada en silencio. La pantalla de selección
    // múltiple es trabajo aparte; hasta entonces, decirlo en voz alta.
    if (paginas.length > 1) {
      return fallo(
        'lectura de Páginas',
        `Se autorizaron ${paginas.length} Páginas. Kavea todavía conecta una por vez: repite el diálogo marcando solo la que quieres conectar.`,
      )
    }

    const pagina = paginas[0]
    const tokenPagina = pagina.access_token
    if (!tokenPagina) {
      return fallo(
        'lectura de Páginas',
        'Meta no devolvió token para esa Página. Suele significar que falta el permiso de mensajería sobre ella.',
      )
    }

    // ---------------------------------------------------------------------
    // PASO 4 — la cuenta de Instagram vinculada, si la hay
    // ---------------------------------------------------------------------
    const ig = await graph(
      `https://graph.facebook.com/${V}/${pagina.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(tokenPagina)}`,
    )
    // Que falle NO aborta: una Página sin Instagram es un cliente válido, y un
    // error aquí no puede tumbar un alta de Messenger que por lo demás está bien.
    const igId: string | null = ig.ok ? (ig.datos?.instagram_business_account?.id ?? null) : null
    const igUser: string | null = ig.ok
      ? (ig.datos?.instagram_business_account?.username ?? null)
      : null

    // ---------------------------------------------------------------------
    // PASO 5 — qué funciones de mensajería tiene concedidas esa Página
    // ---------------------------------------------------------------------
    // Informativo, y por eso tampoco aborta. Sirve para el diagnóstico: es lo
    // que distingue «no puede enviar» de «no quiso enviar».
    const feats = await graph(
      `https://graph.facebook.com/${V}/me/messaging_feature_status?access_token=${encodeURIComponent(tokenPagina)}`,
    )

    // ---------------------------------------------------------------------
    // PASO 6 — persistir, con los dos tokens cifrados
    // ---------------------------------------------------------------------
    let conexion: string
    try {
      conexion = (await rpc('registrar_conexion_oauth', {
        p_org: organizacion,
        p_page_id: pagina.id,
        p_page_name: pagina.name ?? null,
        p_ig_id: igId,
        p_ig_user: igUser,
        p_business: null,
        p_tasks: pagina.tasks ?? null,
        p_config_id: config_id ?? null,
      })) as string
    } catch (err) {
      const texto = String(err)
      // El único error de esta llamada que el cliente puede entender y
      // resolver: su Página ya está en otro espacio.
      if (texto.includes('otro espacio')) {
        return fallo('registro de la conexión', 'Esa Página ya está conectada a otro espacio de Kavea.')
      }
      return fallo('registro de la conexión', texto)
    }

    const pat = await cifrar(tokenPagina, KID)
    await rpc('guardar_credencial', {
      p_conexion: conexion,
      p_cipher: aHexPg(pat.cipher),
      p_nonce: aHexPg(pat.nonce),
      p_kid: pat.kid,
    })

    const bis = await cifrar(bisu, KID)
    await rpc('guardar_credencial_bisu', {
      p_conexion: conexion,
      p_cipher: aHexPg(bis.cipher),
      p_nonce: aHexPg(bis.nonce),
      p_kid: bis.kid,
    })

    if (feats.ok && feats.datos) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/meta_connections?id=eq.${conexion}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SECRETO,
            Authorization: `Bearer ${SECRETO}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
            'User-Agent': 'kavea-canje/0.1',
          },
          body: JSON.stringify({ messaging_feature_status: feats.datos }),
        },
      ).catch(() => {})
    }

    // ---------------------------------------------------------------------
    // PASO 7 — suscribir la app a los webhooks de la Página
    // ---------------------------------------------------------------------
    // ESTE PASO ABORTA EL ALTA SI FALLA, y por eso la fila queda en `degraded`
    // en vez de `connected`: sin webhooks no entra un solo mensaje, y una
    // conexión que dice «conectado» sin recibir nada es el peor de los estados
    // posibles — el cliente espera, nadie contesta, y el panel jura que todo va
    // bien. Mejor visiblemente roto que invisiblemente inútil.
    const sub = await graph(`https://graph.facebook.com/${V}/${pagina.id}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: CAMPOS_MESSENGER.join(','),
        access_token: tokenPagina,
      }),
    })

    if (!sub.ok || sub.datos?.success !== true) {
      await rpc('marcar_suscripcion', { p_conexion: conexion, p_ok: false }).catch(() => {})
      return fallo(
        'suscripción a webhooks',
        sub.ok ? 'Meta no confirmó la suscripción' : sub.error,
      )
    }

    await rpc('marcar_suscripcion', {
      p_conexion: conexion,
      p_ok: true,
      p_campos_messenger: CAMPOS_MESSENGER,
    })

    return json({
      ok: true,
      conexion,
      page_id: pagina.id,
      page_name: pagina.name ?? null,
      instagram: igUser,
    })
  } catch (err) {
    return fallo('inesperado', String(err), 500)
  }
})
