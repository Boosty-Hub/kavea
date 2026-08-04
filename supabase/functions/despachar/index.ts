/**
 * Despachador de la cola de salida.
 *
 * LA ÚNICA RUTA QUE HABLA CON EL SEND API. Ninguna otra parte del código llama
 * a Meta para enviar: si aparece un segundo camino, la ventana de 24 h y los
 * límites se aplican en un sitio y no en el otro, y el que falta es el que
 * rompe la mensajería de la Página del cliente.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN, del docs/03 y del docs/fases/04:
 *
 * 1. La ventana se REEVALÚA AQUÍ, no al encolar. Un mensaje aprobado a las
 *    23:59 y despachado a las 00:01 es un fallo real.
 * 2. Durante un bloqueo NO se llama. Verbatim: "Continuing API calls during
 *    throttling extends the wait period further". Ni siquiera para comprobar si
 *    ya pasó.
 * 3. El 190 no se reintenta nunca. Se marca la conexión y se para.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'
import { alertar } from '../_compartido/almacen.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

type Envio = {
  id: string
  organization_id: string
  conversation_id: string
  canal: 'instagram' | 'messenger' | 'whatsapp'
  particion: string
  carril: 'texto' | 'media'
  emisor: string
  messaging_type: string | null
  tag: string | null
  cuerpo: {
    destinatario: string
    /** Carril de texto. */
    texto?: string
    /**
     * Carril de media. `tipo` lo derivó la base; aquí no se vuelve a calcular.
     *
     * `like_heart` es el único sticker que la API manda, y es el único tipo sin
     * `payload`: no hay objeto que descargar, así que tampoco hay ruta que
     * firmar.
     */
    tipo?: 'image' | 'audio' | 'video' | 'file' | 'like_heart'
    ruta?: string
    nombre?: string
  }
  metadata: string | null
  intentos: number
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
      'User-Agent': 'kavea-despachador/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 300)}`)
  if (r.status === 204) return undefined as T
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

/**
 * La URL que va a leer Meta se firma AQUÍ, no al encolar.
 *
 * El bucket `salientes` es privado. Meta necesita poder descargar el objeto sin
 * credenciales, así que se le da una URL firmada de vida corta, y la vida corta
 * solo sirve si empieza a contar en el momento de la llamada: una firma hecha al
 * encolar y consumida quince minutos después, tras un bloqueo por límites,
 * llegaría caducada.
 *
 * Diez minutos. Meta descarga el objeto durante la propia llamada al Send API;
 * el margen es para su reintento, no para que el enlace ande suelto.
 */
async function firmar(ruta: string, segundos = 600): Promise<string> {
  const clave = claveServicio()
  const base = Deno.env.get('SUPABASE_URL')
  // Cada segmento por separado: encodeURIComponent sobre la ruta entera
  // escaparía las barras y buscaría un objeto con nombre literal "a%2Fb".
  const camino = ruta.split('/').map(encodeURIComponent).join('/')

  const r = await fetch(`${base}/storage/v1/object/sign/salientes/${camino}`, {
    method: 'POST',
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: segundos }),
  })
  if (!r.ok) {
    throw new Error(`no se pudo firmar el adjunto: ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
  const j = await r.json() as { signedURL?: string }
  if (!j.signedURL) throw new Error('la firma no devolvió URL')
  return `${base}/storage/v1${j.signedURL}`
}

/**
 * Qué hacer con cada código de error. En UN SOLO SITIO.
 *
 * Repartir esta tabla por el código es cómo se acaba reintentando un 190 en
 * bucle desde una rama que nadie revisó.
 */
function politica(codigo: number | undefined, http: number): {
  estado: 'fallido' | 'bloqueado'
  esperaMin: number
  desconectar: boolean
  alerta: 'p1' | 'p2' | null
} {
  switch (codigo) {
    // Token invalidado. Nunca se reintenta: no se arregla solo y quema cuota.
    case 190:
      return { estado: 'fallido', esperaMin: 0, desconectar: true, alerta: 'p1' }

    // Límites. No se llama hasta que pase el tiempo indicado.
    case 4: case 17: case 32: case 613:
    case 80001: case 80002: case 80006:
      return { estado: 'bloqueado', esperaMin: 15, desconectar: false, alerta: 'p2' }

    // Parámetro inválido. Aquí caen los tags muertos y una ventana mal
    // calculada. Reintentar produce exactamente el mismo error.
    case 100:
      return { estado: 'fallido', esperaMin: 0, desconectar: false, alerta: 'p2' }

    // Consentimiento de perfil no otorgado: es normal, no es un error.
    case 230:
      return { estado: 'fallido', esperaMin: 0, desconectar: false, alerta: null }

    default:
      // 5xx y timeouts son transitorios: backoff con tope.
      if (http >= 500 || http === 0) {
        return { estado: 'bloqueado', esperaMin: 2, desconectar: false, alerta: null }
      }
      return { estado: 'fallido', esperaMin: 0, desconectar: false, alerta: 'p2' }
  }
}

/** Lo que Meta dice de nuestro consumo, guardado en cada respuesta. */
async function anotarUso(e: Envio, r: Response, http: number, codigo?: number) {
  const bruto = r.headers.get('x-business-use-case-usage') ?? r.headers.get('x-app-usage')
  let tipo: string | null = null
  let uso: Record<string, number> = {}
  try {
    const j = JSON.parse(bruto ?? '{}')
    const primera = Object.values(j)[0]
    if (Array.isArray(primera) && primera[0]) { uso = primera[0]; tipo = uso['type'] as unknown as string }
    else if (bruto && r.headers.get('x-app-usage')) { uso = j; tipo = 'app' }
  } catch { /* una cabecera ilegible no puede tumbar el despacho */ }

  await sql('rate_limit_usage', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: e.organization_id,
      particion: e.particion,
      tipo,
      call_count: uso['call_count'] ?? null,
      total_cputime: uso['total_cputime'] ?? null,
      total_time: uso['total_time'] ?? null,
      regain_access_min: uso['estimated_time_to_regain_access'] ?? null,
      http_status: http,
      error_codigo: codigo ?? null,
    }),
  }).catch(() => {})

  return Number(uso['estimated_time_to_regain_access'] ?? 0)
}

/**
 * Los dos canales, con la forma EXACTA que documenta Meta para cada uno.
 *
 * No se unifican. Instagram va a `/me/messages` con form-data porque es la
 * forma literalmente documentada para la vía Facebook Login; Messenger va a
 * `/{PAGE_ID}/messages` con JSON para que el tenant destino sea explícito en la
 * llamada y un fallo de selección de token falle en voz alta en vez de mandar
 * desde la Página equivocada.
 */
function peticion(e: Envio, token: string, urlMedia?: string): { url: string; init: RequestInit } {
  // `is_reusable: false` a propósito. El plan lo deja escrito: no se depende de
  // `attachment_id` ni de la reutilización, que no están confirmados para esta
  // vía, así que cada envío vuelve a exponer el objeto.
  //
  // El corazón va SIN payload. Es la forma literal que documenta Meta, y
  // mandarle un `payload: {}` vacío sería inventarse un campo.
  const mensaje: Record<string, unknown> = e.cuerpo.tipo === 'like_heart'
    ? { attachment: { type: 'like_heart' } }
    : urlMedia
      ? { attachment: { type: e.cuerpo.tipo, payload: { url: urlMedia, is_reusable: false } } }
      : { text: e.cuerpo.texto }

  // --- WhatsApp -------------------------------------------------------------
  //
  // Tercera forma, y no se parece a las otras dos. `POST /{phone_number_id}/messages`
  // con JSON, `messaging_product` obligatorio, el destinatario en `to` como wa_id
  // plano —no un objeto `recipient`— y el tipo en la raíz en vez de dentro de
  // `message`.
  //
  // Y NO SE MANDA `tag` NI `messaging_type`. En WhatsApp no existe HUMAN_AGENT:
  // fuera de las 24 h la única vía es una plantilla aprobada, y mandar un tag de
  // Messenger aquí devuelve error. La ventana ya se reevaluó más arriba con
  // `ventana_de()`, así que si llegamos hasta aquí es que está abierta; si estaba
  // cerrada, el envío se marcó fallido con su motivo y nunca entra en esta rama.
  //
  // La plantilla NO se elige automáticamente a propósito. Las 25 aprobadas de
  // Boosty son todas MARKETING, tienen coste por conversación y usar una para
  // contestar a alguien que escribió hace dos días es spam facturado. Que falle
  // con un motivo legible es mejor que meter al cliente en un cargo que no pidió.
  if (e.canal === 'whatsapp') {
    const cuerpoWa: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: e.cuerpo.destinatario,
    }
    if (e.cuerpo.tipo === 'like_heart') {
      // No hay sticker de corazón en Cloud API. Se manda el carácter, que es
      // además exactamente lo que Meta devuelve en el echo de Instagram.
      cuerpoWa.type = 'text'
      cuerpoWa.text = { body: '❤' }
    } else if (urlMedia) {
      // WhatsApp acepta media por enlace, y la URL se firma en el despacho igual
      // que para los otros canales: una firma hecha al encolar llegaría caducada.
      cuerpoWa.type = e.cuerpo.tipo
      cuerpoWa[e.cuerpo.tipo] = { link: urlMedia }
    } else {
      cuerpoWa.type = 'text'
      // `preview_url` desactivado: una vista previa la genera Meta pidiendo la
      // URL, y eso convierte un enlace pegado por un operador en una petición
      // que sale de la infraestructura de Meta hacia donde diga ese enlace.
      cuerpoWa.text = { body: e.cuerpo.texto, preview_url: false }
    }

    return {
      url: `https://graph.facebook.com/${V}/${e.particion}/messages`,
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoWa),
      },
    }
  }

  if (e.canal === 'instagram') {
    const form = new URLSearchParams()
    form.set('recipient', JSON.stringify({ id: e.cuerpo.destinatario }))
    form.set('message', JSON.stringify(mensaje))
    if (e.tag) form.set('tag', e.tag)
    if (e.messaging_type) form.set('messaging_type', e.messaging_type)
    if (e.metadata) form.set('metadata', e.metadata)
    return {
      url: `https://graph.facebook.com/${V}/me/messages`,
      init: {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    }
  }

  const cuerpo: Record<string, unknown> = {
    recipient: { id: e.cuerpo.destinatario },
    message: e.metadata ? { ...mensaje, metadata: e.metadata } : mensaje,
  }
  if (e.messaging_type) cuerpo.messaging_type = e.messaging_type
  if (e.tag) cuerpo.tag = e.tag

  return {
    url: `https://graph.facebook.com/${V}/${e.particion}/messages`,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    },
  }
}

async function tokenDe(conversacion: string): Promise<{ token: string; conexion: string }> {
  // El canal se lee AQUÍ y no se recibe por parámetro, para que no exista una
  // forma de pedir el token de un canal y enviar por otro. Desde la 0065 una
  // conexión de WhatsApp NO tiene Page Access Token: tiene el suyo en su propia
  // ranura, y pedirle el de Página devolvería una fila con los tres campos en
  // null que `descifrar` reventaría con un error sin relación con la causa.
  const filas = await sql<Array<{ channels: { meta_connection_id: string; canal: string } }>>(
    `conversations?select=channels(meta_connection_id,canal)&id=eq.${conversacion}`,
  )
  const conexion = filas?.[0]?.channels?.meta_connection_id
  const canal = filas?.[0]?.channels?.canal
  if (!conexion) throw new Error('sin conexión para esa conversación')

  if (canal === 'whatsapp') {
    const cred = (await sql<Array<{
      whatsapp_token_cipher: string | null
      whatsapp_token_nonce: string | null
      whatsapp_token_kid: string | null
    }>>('rpc/credencial_whatsapp_de_conexion', {
      method: 'POST',
      body: JSON.stringify({ p_conexion: conexion }),
    }))?.[0]
    if (!cred?.whatsapp_token_cipher || !cred.whatsapp_token_nonce || !cred.whatsapp_token_kid) {
      throw new Error('sin credencial de WhatsApp para esa conexión')
    }
    const token = await descifrar(
      desdeHexPg(cred.whatsapp_token_cipher),
      desdeHexPg(cred.whatsapp_token_nonce),
      cred.whatsapp_token_kid,
    )
    return { token, conexion }
  }

  const cred = (await sql<Array<{
    page_access_token_cipher: string
    page_access_token_nonce: string
    page_access_token_kid: string
  }>>('rpc/credencial_de_conexion', {
    method: 'POST',
    body: JSON.stringify({ p_conexion: conexion }),
  }))?.[0]
  if (!cred) throw new Error('sin credencial')

  const token = await descifrar(
    desdeHexPg(cred.page_access_token_cipher),
    desdeHexPg(cred.page_access_token_nonce),
    cred.page_access_token_kid,
  )
  return { token, conexion }
}

async function marcar(id: string, campos: Record<string, unknown>) {
  await sql(`outbound_messages?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(campos) })
}

Deno.serve(async (): Promise<Response> => {
  const resumen = { reclamados: 0, enviados: 0, fallidos: 0, bloqueados: 0 }

  try {
    const lote = await sql<Envio[]>('rpc/reclamar_envios', {
      method: 'POST',
      body: JSON.stringify({ p_lote: 10 }),
    })
    resumen.reclamados = lote?.length ?? 0

    for (const e of lote ?? []) {
      try {
        // REGLA 1: la ventana se reevalúa AQUÍ, con la misma función que usó el
        // encolado. Entre encolar y despachar pueden pasar minutos, y las 24 h
        // no esperan.
        const v = (await sql<Array<{ clase: string; motivo: string; messaging_type: string | null; tag: string | null }>>(
          'rpc/ventana_de',
          { method: 'POST', body: JSON.stringify({ p_conversacion: e.conversation_id, p_emisor: e.emisor }) },
        ))?.[0]

        if (!v || v.clase === 'cerrada') {
          await marcar(e.id, {
            estado: 'fallido',
            error_mensaje: v?.motivo ?? 'La ventana se cerró antes de poder enviar.',
          })
          resumen.fallidos++
          continue
        }

        // Y con el tag que corresponda AHORA, no el que se calculó al encolar:
        // una conversación que cruzó las 24 h mientras esperaba necesita
        // HUMAN_AGENT, y mandarla sin él devuelve 100.
        const listo: Envio = { ...e, messaging_type: v.messaging_type, tag: v.tag }

        const { token, conexion } = await tokenDe(e.conversation_id)

        // La firma antes de la llamada, y dentro del try de la fila: si Storage
        // no responde, cae este envío y no el lote entero.
        const urlMedia = e.carril === 'media' && e.cuerpo.ruta && e.cuerpo.tipo !== 'like_heart'
          ? await firmar(e.cuerpo.ruta)
          : undefined

        const { url, init } = peticion(listo, token, urlMedia)

        let r: Response
        try {
          r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
        } catch {
          // Timeout o red caída: transitorio, se reintenta con backoff.
          await marcar(e.id, {
            estado: 'bloqueado',
            no_antes_de: new Date(Date.now() + 2 * 60_000).toISOString(),
            error_mensaje: 'No hubo respuesta de Meta.',
          })
          resumen.bloqueados++
          continue
        }

        const j = await r.json().catch(() => ({})) as {
          message_id?: string
          error?: { code?: number; message?: string; error_subcode?: number }
        }

        const codigo = j.error?.code
        const espera = await anotarUso(e, r, r.status, codigo)

        if (r.ok && j.message_id && !j.error) {
          await marcar(e.id, {
            estado: 'enviado',
            mid_devuelto: j.message_id,
            sent_at: new Date().toISOString(),
            error_codigo: null,
            error_mensaje: null,
          })
          resumen.enviados++
          continue
        }

        const p = politica(codigo, r.status)

        if (p.desconectar) {
          await sql(`meta_connections?id=eq.${conexion}`, {
            method: 'PATCH',
            body: JSON.stringify({
              token_invalid_since: new Date().toISOString(),
            }),
          }).catch(() => {})
        }

        await marcar(e.id, {
          estado: p.estado,
          error_codigo: codigo ?? null,
          error_mensaje: j.error?.message?.slice(0, 400) ?? `HTTP ${r.status}`,
          error_payload: j,
          // REGLA 2: se respeta lo que Meta diga, y si no dice nada, la espera
          // por defecto de la política. Nunca se llama antes.
          no_antes_de: p.estado === 'bloqueado'
            ? new Date(Date.now() + Math.max(espera, p.esperaMin) * 60_000).toISOString()
            : undefined,
        })

        if (p.alerta) {
          await alertar(
            p.desconectar ? 'token_invalido' : 'envio_fallido',
            p.alerta,
            { envio: e.id, canal: e.canal, codigo, mensaje: j.error?.message?.slice(0, 200) },
          ).catch(() => {})
        }

        p.estado === 'bloqueado' ? resumen.bloqueados++ : resumen.fallidos++
      } catch (err) {
        // Un envío que revienta no puede llevarse el lote por delante. Es el
        // fallo que en Chatwoot perdía todos los mensajes de la tanda.
        await marcar(e.id, {
          estado: 'fallido',
          error_mensaje: String(err).slice(0, 400),
        }).catch(() => {})
        resumen.fallidos++
      }
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(resumen), {
    headers: { 'Content-Type': 'application/json' },
  })
})
