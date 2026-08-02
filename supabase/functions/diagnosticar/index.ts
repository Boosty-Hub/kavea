/**
 * Diagnóstico de una conexión de Meta, comprobación a comprobación.
 *
 * Fuente: docs/fases/05-fase-configuracion.md T12, V1–V7.
 *
 * POR QUÉ NO DEVUELVE UN BOOLEANO
 *
 * El 80 % de los fallos de conexión son configuración del cliente, no código. Un
 * OAuth que devolvió 200 y una Página de la que no llega un solo mensaje son el
 * mismo estado desde el punto de vista del código y estados opuestos desde el
 * del negocio. «La conexión falla» no le dice a nadie qué hacer; «la app no
 * aparece en subscribed_apps» sí.
 *
 * `no_verificable` ES UN RESULTADO, NO UN FALLO DISFRAZADO. El toggle «Permitir
 * acceso a mensajes» no lo expone ninguna API en el material disponible. Fingir
 * un fallo por no tener el dato manda a alguien a arreglar lo que no está roto;
 * decir «no lo sé» permite el diagnóstico diferencial de T15, donde ese toggle
 * es la CAUSA RESIDUAL: lo único compatible con todo lo demás en verde y
 * silencio total.
 *
 * NO HAY REINTENTOS NI BACKOFF AQUÍ. Son llamadas de lectura y el cron pasa una
 * vez al día. Si Meta responde 500, la comprobación queda `no_verificable` con
 * la causa escrita, que es la verdad: no sabemos, no que esté roto.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

/** Los tres valores que la tabla acepta, más el título que lee una persona. */
type Resultado = 'ok' | 'fallo' | 'no_verificable' | 'sin_probar'

type Conexion = {
  id: string
  organization_id: string
  page_id: string
  page_name: string | null
  ig_business_account_id: string | null
  /** Lo que se vio al conectar. No se puede releer: ver V2. */
  tasks: string[] | null
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
      'User-Agent': 'kavea-diagnostico/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 300)}`)
  if (r.status === 204) return undefined as T
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

/** Una llamada de lectura al grafo, con la respuesta cruda pase lo que pase. */
async function grafo(ruta: string, token: string): Promise<{
  ok: boolean
  http: number
  cuerpo: Record<string, unknown>
}> {
  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    const cuerpo = await r.json().catch(() => ({})) as Record<string, unknown>
    return { ok: r.ok && !cuerpo.error, http: r.status, cuerpo }
  } catch (err) {
    return { ok: false, http: 0, cuerpo: { error: { message: String(err) } } }
  }
}

/** El mensaje de error de Meta, o algo mejor que «undefined». */
function porque(c: Record<string, unknown>, http: number): string {
  const e = c.error as { message?: string; code?: number } | undefined
  if (e?.message) return `${e.message}${e.code ? ` (código ${e.code})` : ''}`
  return http === 0 ? 'Meta no respondió.' : `Meta devolvió HTTP ${http}.`
}

Deno.serve(async (req: Request): Promise<Response> => {
  let conexionId: string
  try {
    conexionId = (await req.json() as { conexion?: string }).conexion ?? ''
  } catch {
    conexionId = ''
  }
  if (!conexionId) {
    return new Response(JSON.stringify({ error: 'falta la conexión' }), { status: 400 })
  }

  const resultados: Array<{ codigo: string; resultado: Resultado; causa: string | null }> = []

  async function anotar(
    codigo: string, titulo: string, resultado: Resultado,
    causa: string | null, crudo: unknown, bloquea = true,
  ) {
    resultados.push({ codigo, resultado, causa })
    // Envoltorio en `public`: PostgREST no alcanza el esquema `private`, y van
    // tres veces que esa lección se aprende sobre una función distinta.
    await sql('rpc/anotar_verificacion', {
      method: 'POST',
      body: JSON.stringify({
        p_org: conexion.organization_id, p_conexion: conexion.id,
        p_codigo: codigo, p_titulo: titulo, p_resultado: resultado,
        p_causa: causa, p_crudo: crudo ?? null, p_bloquea: bloquea,
      }),
    }).catch(() => {})
  }

  let conexion: Conexion
  try {
    conexion = (await sql<Conexion[]>(
      `meta_connections?select=id,organization_id,page_id,page_name,ig_business_account_id,tasks`
      + `&id=eq.${conexionId}`,
    ))?.[0]
    if (!conexion) throw new Error('esa conexión no existe')
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 404 })
  }

  // El token. Si no se puede descifrar, TODO lo demás es no_verificable: no hay
  // forma de saber si la Página está bien configurada sin poder preguntarlo, y
  // marcarlo como fallo mandaría a revisar la Página en vez de la credencial.
  let token: string
  try {
    const cred = (await sql<Array<{
      page_access_token_cipher: string
      page_access_token_nonce: string
      page_access_token_kid: string
    }>>('rpc/credencial_de_conexion', {
      method: 'POST',
      body: JSON.stringify({ p_conexion: conexion.id }),
    }))?.[0]
    if (!cred) throw new Error('no hay credencial guardada para esta conexión')
    token = await descifrar(
      desdeHexPg(cred.page_access_token_cipher),
      desdeHexPg(cred.page_access_token_nonce),
      cred.page_access_token_kid,
    )
  } catch (err) {
    for (const [c, t] of [
      ['V1', 'La Página existe y hay acceso'], ['V2', 'Permiso para gestionar mensajes'],
      ['V3', 'Instagram profesional vinculado'], ['V4', 'El token sirve'],
      ['V5', 'Webhooks suscritos'], ['V6', 'Aplicación por defecto designada'],
    ]) {
      await anotar(c, t, c === 'V4' ? 'fallo' : 'no_verificable',
        c === 'V4' ? `No se pudo leer la credencial: ${err}` : 'Sin token no se puede preguntar.',
        null, c === 'V4')
    }
    return new Response(JSON.stringify({ conexion: conexion.id, resultados }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // --- V1: la Página existe y este token la alcanza -------------------------
  // Con un Page Access Token, `/me` ES la Página.
  //
  // `tasks` NO SE PIDE AQUÍ, y no es un olvido. Medido el 2 de agosto de 2026:
  // pedirlo devuelve «(#100) Tried accessing nonexisting field (tasks) on node
  // type (Page)» y, como Meta rechaza la petición ENTERA, tumbaba también el
  // nombre, el Instagram vinculado y messaging_feature_status. Un campo de más
  // en una lista de campos no degrada la respuesta: la anula.
  const pagina = await grafo(
    `me?fields=id,name,instagram_business_account{id,username},messaging_feature_status`,
    token,
  )
  const c = pagina.cuerpo

  await anotar('V1', 'La Página existe y hay acceso',
    pagina.ok && c.id ? 'ok' : 'fallo',
    pagina.ok && c.id ? null : porque(c, pagina.http),
    { id: c.id, name: c.name })

  // --- V2: la tarea sobre la Página -----------------------------------------
  // Se lee de lo GUARDADO al conectar, no de Meta: el campo no existe en el
  // nodo de la Página y una conexión establecida no puede volver a preguntarlo.
  //
  // AVISO, NUNCA BLOQUEO. Las fuentes no coinciden en el valor concreto:
  // MESSAGING, MESSAGE y MODERATE aparecen en páginas distintas de la propia
  // documentación de Meta. Rechazar por ausencia descartaría clientes válidos
  // —el caso real de una Página con solo ANALYZE y ADVERTISE— con una causa
  // inventada. El árbitro real es V7.
  const tareas = conexion.tasks ?? []
  const buenas = tareas.filter((t) => ['MESSAGING', 'MODERATE', 'MANAGE'].includes(t))
  await anotar('V2', 'Permiso para gestionar mensajes',
    !conexion.tasks ? 'no_verificable' : buenas.length ? 'ok' : 'fallo',
    !conexion.tasks
      ? 'Las tareas de la Página solo se pueden leer al conectar, y esta conexión se creó '
        + 'sin pasar por el diálogo. No dice nada sobre si funciona: lo dice V7.'
      : buenas.length ? null
      : `La Página concede ${tareas.join(', ')}, y ninguna es de mensajería. `
        + 'Puede funcionar igual: no se bloquea por esto.',
    { tasks: tareas, origen: 'guardado al conectar' }, false)

  // --- V3: Instagram profesional vinculado ----------------------------------
  const ig = c.instagram_business_account as { id?: string; username?: string } | undefined
  await anotar('V3', 'Instagram profesional vinculado',
    !pagina.ok ? 'no_verificable' : ig?.id ? 'ok' : 'fallo',
    !pagina.ok ? 'No se pudo leer la Página.'
      : ig?.id ? null
      : 'La Página no tiene una cuenta profesional de Instagram vinculada. Se vincula desde '
        + 'la configuración de la Página, en Cuentas vinculadas.',
    ig ?? null)

  // --- V4: el token sirve ----------------------------------------------------
  // `debug_token` necesita el token de la APP, no el de la Página. Sin él no se
  // puede preguntar: eso es `no_verificable`, no un fallo. Que V1 haya
  // funcionado ya dice que el token vale para leer.
  //
  // Los nombres son los que YA usa el receptor de webhooks para verificar la
  // firma. Inventar aquí un par nuevo dejaría dos variables con el mismo
  // secreto dentro y una de ellas sin rotar el día que toque.
  const appId = Deno.env.get('META_APP_ID')
  const appSecret = Deno.env.get('META_APP_SECRET')
  if (appId && appSecret) {
    const d = await grafo(
      `debug_token?input_token=${encodeURIComponent(token)}&access_token=${appId}|${appSecret}`,
      token,
    )
    const dd = (d.cuerpo.data ?? {}) as { is_valid?: boolean; expires_at?: number; scopes?: string[] }
    await anotar('V4', 'El token sirve',
      d.ok && dd.is_valid ? 'ok' : 'fallo',
      d.ok && dd.is_valid ? null : porque(d.cuerpo, d.http),
      { is_valid: dd.is_valid, expires_at: dd.expires_at, scopes: dd.scopes })
  } else {
    await anotar('V4', 'El token sirve',
      pagina.ok ? 'no_verificable' : 'fallo',
      pagina.ok
        ? 'Sin el identificador y el secreto de la app no se puede llamar a debug_token. '
          + 'La lectura de la Página sí funcionó, así que el token vale al menos para leer.'
        : porque(c, pagina.http),
      null, !pagina.ok)
  }

  // --- V5: webhooks suscritos ------------------------------------------------
  // Que Meta ENTREGARÁ eventos. Sin esto la bandeja está muda y todo lo demás
  // puede estar perfecto.
  const subs = await grafo(`${conexion.page_id}/subscribed_apps`, token)
  const apps = (subs.cuerpo.data ?? []) as Array<{ subscribed_fields?: string[] }>
  const campos = apps.flatMap((a) => a.subscribed_fields ?? [])
  await anotar('V5', 'Webhooks suscritos',
    !subs.ok ? 'no_verificable' : apps.length ? 'ok' : 'fallo',
    !subs.ok ? porque(subs.cuerpo, subs.http)
      : apps.length ? null
      : 'La app de Kavea no aparece suscrita a esta Página. Meta no va a entregar ningún '
        + 'evento. Hay que volver a suscribirla.',
    { apps: apps.length, subscribed_fields: campos })

  // --- V6: aplicación por defecto (Conversation Routing) ---------------------
  // AQUÍ SE MIDE UN INCIERTO. `03` deja escrito que se sabe que el campo
  // devuelve {hop_v2, msgr_multi_app, ig_multi_app} pero NO qué valores toma
  // cada uno ni cuál significa «hay default application». Por eso el crudo se
  // guarda entero: la primera pasada sobre una Página bien configurada es la
  // medición que cierra C6.
  //
  // Mientras no esté cerrado, no bloquea. Bloquear con un umbral inventado es
  // parar conexiones que funcionan.
  const mfs = c.messaging_feature_status as Record<string, unknown> | undefined
  await anotar('V6', 'Aplicación por defecto designada',
    !pagina.ok ? 'no_verificable' : mfs ? 'no_verificable' : 'no_verificable',
    !pagina.ok ? 'No se pudo leer la Página.'
      : mfs
        ? 'Meta devuelve el campo pero no está establecido qué valor significa «configurada». '
          + 'Se guarda la respuesta entera para cerrarlo con una medición antes y después.'
        : 'Esta Página no devuelve messaging_feature_status.',
    mfs ?? null, false)
  if (mfs) {
    await sql(`meta_connections?id=eq.${conexion.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ messaging_feature_status: mfs }),
    }).catch(() => {})
  }

  // --- V7: ha llegado un mensaje de verdad ----------------------------------
  // El árbitro. Todo lo anterior junto, incluido el toggle que ninguna API
  // expone. No se llama a Meta: se mira si alguna vez entró algo por esta
  // conexión, que es exactamente lo que la pregunta significa.
  //
  // `!inner` no es adorno: sin él PostgREST no resuelve un filtro sobre una
  // columna embebida y devuelve filas de más SIN dar error, que es la peor
  // forma de equivocarse.
  const entrantes = await sql<Array<{ id: string }>>(
    `conversations?select=id,channels!inner(meta_connection_id)`
    + `&channels.meta_connection_id=eq.${conexion.id}`
    + `&last_incoming_at=not.is.null&limit=1`,
  ).catch(() => [])
  const llego = (entrantes?.length ?? 0) > 0
  await anotar('V7', 'Ha llegado un mensaje real',
    llego ? 'ok' : 'sin_probar',
    llego ? null
      : 'Todavía no ha entrado ningún mensaje por esta conexión. Es la única comprobación '
        + 'que prueba el toggle «Permitir acceso a mensajes», que no expone ninguna API.',
    null)

  await sql(`meta_connections?id=eq.${conexion.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      last_subscription_check_at: new Date().toISOString(),
      subscription_ok: apps.length > 0,
    }),
  }).catch(() => {})

  return new Response(JSON.stringify({ conexion: conexion.id, resultados }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
