/**
 * Adaptadores por canal: payload de Meta → efectos.
 *
 * Son funciones PURAS. No tocan la red ni la base, así que la mayor parte de la
 * batería de pruebas corre en memoria y en milisegundos. Todo lo que escribe
 * vive en `private.aplicar_efecto`, en la base.
 *
 * Un efecto es una unión discriminada por `tipo`:
 *   mensaje.upsert | mensaje.borrar | mensaje.editar | evento.registrar | desconocido
 */

export type Efecto = Record<string, unknown> & { tipo: string }

/**
 * Una unidad de trabajo: un elemento de messaging[] o standby[] de un entry, o
 * de messages[] o statuses[] cuando el canal es WhatsApp.
 */
export type Update = {
  assetId: string
  canal: 'messenger' | 'instagram' | 'whatsapp'
  standby: boolean
  m: Record<string, any>
  /**
   * Solo WhatsApp, y por dos razones que no se pueden resolver mirando `m`:
   *
   * - Un elemento de `messages[]` y uno de `statuses[]` son objetos distintos
   *   sin campo que los discrimine de forma fiable. Olfatear por la presencia
   *   de `status` funcionaría hasta que Meta añada ese nombre a otra cosa.
   * - El nombre del contacto vive en `value.contacts[]`, que es HERMANO de
   *   `messages[]` y no está dentro del mensaje. Si no se transporta aquí, se
   *   pierde, y es el dato que en Instagram cuesta una llamada por contacto.
   */
  wa?: { clase: 'mensaje' | 'estado'; perfil: string | null; nuestroNumero: string }
}

/**
 * Aplana el cuerpo en unidades de trabajo, de forma DETERMINISTA.
 *
 * El orden importa: el cursor de troceado es un índice sobre esta lista, así
 * que dos aplanados del mismo cuerpo tienen que producir exactamente la misma
 * secuencia o una reanudación saltaría o repetiría updates.
 *
 * Se leen `messaging[]` Y `standby[]`. Si solo se leyera messaging, cuando la
 * Bandeja de Meta Business Suite se apropia del hilo Kavea se quedaría ciega y
 * muda sin ningún error visible.
 */
export function aplanar(cuerpo: unknown): Update[] {
  const raiz = cuerpo as { object?: string; entry?: unknown[] }

  // WhatsApp no comparte NADA de la forma de los otros dos, así que se desvía
  // antes de tocar `messaging[]`. Hasta el 4 de agosto de 2026 este cuerpo caía
  // por el camino de abajo, se clasificaba como `messenger` —porque el ternario
  // solo pregunta por instagram— y producía cero updates.
  if (raiz?.object === 'whatsapp_business_account') return aplanarWhatsapp(raiz)

  const canal: 'messenger' | 'instagram' =
    raiz?.object === 'instagram' ? 'instagram' : 'messenger'

  const out: Update[] = []
  for (const e of Array.isArray(raiz?.entry) ? raiz.entry : []) {
    const entry = e as { id?: string; messaging?: unknown[]; standby?: unknown[] }
    const assetId = String(entry?.id ?? '')
    if (!assetId) continue

    for (const m of Array.isArray(entry.messaging) ? entry.messaging : []) {
      out.push({ assetId, canal, standby: false, m: m as Record<string, any> })
    }
    // standby[] va DESPUÉS y marcado: los postbacks entregados por standby no
    // incluyen `payload`, así que cualquier lógica que dependa de él falla en
    // silencio al perder la propiedad del hilo.
    for (const m of Array.isArray(entry.standby) ? entry.standby : []) {
      out.push({ assetId, canal, standby: true, m: m as Record<string, any> })
    }
  }
  return out
}

/**
 * Aplana un cuerpo de WhatsApp. La cuarta forma de payload, medida con tráfico
 * REAL el 4 de agosto de 2026, no leída de la documentación.
 *
 * Tres diferencias que rompen cualquier reutilización de la ruta de Messaging:
 *
 * 1. **`entry[].id` es la WABA, no el asset de mensajería.** En `page` y en
 *    `instagram` el `entry.id` ES el asset y por ahí resuelve el enrutado. Aquí
 *    vale `1415042803155441` —la cuenta— y el asset real es
 *    `changes[].value.metadata.phone_number_id`, dos niveles más abajo. Enrutar
 *    por `entry.id` deja el mensaje sin tenant y dispara `tenant_no_resuelto`.
 * 2. **El trabajo no está en `messaging[]`** sino en `value.messages[]` y
 *    `value.statuses[]`, que son dos listas hermanas.
 * 3. **El nombre del contacto llega gratis** en `value.contacts[]`.
 */
function aplanarWhatsapp(raiz: { entry?: unknown[] }): Update[] {
  const out: Update[] = []

  for (const e of Array.isArray(raiz?.entry) ? raiz.entry : []) {
    const entry = e as { changes?: unknown[] }

    for (const c of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = (c as { value?: Record<string, any> })?.value
      if (!v) continue

      const assetId = String(v.metadata?.phone_number_id ?? '')
      if (!assetId) continue

      // `contacts[]` se indexa una vez por cambio en lugar de recorrerlo por
      // cada mensaje: un lote de WhatsApp puede traer decenas.
      const perfiles = new Map<string, string | null>()
      for (const ct of Array.isArray(v.contacts) ? v.contacts : []) {
        const p = ct as { wa_id?: string; profile?: { name?: string } }
        if (p?.wa_id) perfiles.set(String(p.wa_id), p.profile?.name ?? null)
      }

      // Mensajes antes que acuses, y cada lista en su orden de llegada. El
      // cursor de troceado es un índice sobre esta secuencia, así que dos
      // aplanados del mismo cuerpo tienen que dar exactamente lo mismo o una
      // reanudación salta o repite updates.
      for (const msg of Array.isArray(v.messages) ? v.messages : []) {
        const m = msg as Record<string, any>
        out.push({
          assetId,
          canal: 'whatsapp',
          standby: false,
          m,
          wa: {
            clase: 'mensaje',
            perfil: perfiles.get(String(m.from ?? '')) ?? null,
            nuestroNumero: assetId,
          },
        })
      }

      for (const st of Array.isArray(v.statuses) ? v.statuses : []) {
        const m = st as Record<string, any>
        out.push({
          assetId,
          canal: 'whatsapp',
          standby: false,
          m,
          wa: {
            clase: 'estado',
            perfil: perfiles.get(String(m.recipient_id ?? '')) ?? null,
            nuestroNumero: assetId,
          },
        })
      }
    }
  }

  return out
}

/** App ID de Kavea: distingue lo que enviamos nosotros de lo que envió el cliente por fuera. */
const APP_ID = Deno.env.get('META_APP_ID') ?? ''

/**
 * Allowlist de hosts de media entrante.
 *
 * Todo fetch de una URL que venga de un webhook pasa por aquí. Es SSRF de
 * manual: un `payload.url` es contenido que decide un tercero, y seguirlo sin
 * comprobar convierte al normalizador en un proxy hacia la red interna.
 * Chatwoot tuvo que cerrarlo con un SafeFetch.
 *
 * Kavea no descarga nada en fase 2 —solo persiste la URL—, pero el host se
 * valida y se guarda igual: cuando la bandeja quiera mostrar la imagen, la
 * comprobación ya está hecha y auditada.
 */
const HOSTS_PERMITIDOS = [
  'lookaside.fbsbx.com',
  'scontent.xx.fbcdn.net',
]

/**
 * Y los que NO son de Meta pero sirven contenido que Meta entrega.
 *
 * MEDIDO EL 2 DE AGOSTO DE 2026. Un GIF elegido desde el selector que Instagram
 * lleva dentro de sus mensajes directos llega con `payload.url` apuntando a
 * `media4.giphy.com`, no a un CDN de Meta. La allowlist original solo conocía
 * hosts de Meta, así que la URL se descartaba, la fila de `media` reventaba
 * contra su CHECK y el adjunto desaparecía sin dejar rastro: dos burbujas que
 * decían «Sin contenido» donde el contacto había mandado dos GIF.
 *
 * Tenor va también, sin haberlo visto llegar: es el otro proveedor que Meta usa
 * en sus productos y la alternativa es enterarse el día que un cliente mande uno
 * y no llegue.
 *
 * El riesgo que la allowlist frena es el SSRF, y estos hosts no lo abren: Kavea
 * NO descarga la media entrante, solo guarda la dirección para que la cargue el
 * navegador de quien mira. Lo que cambia al añadirlos es qué imágenes de
 * terceros se pintan en la bandeja, no qué red alcanza el servidor.
 */
function hostDeTercero(h: string): boolean {
  return /(^|\.)giphy\.com$/.test(h) || /(^|\.)tenor\.com$/.test(h)
}

function hostPermitido(host: string): boolean {
  const h = host.toLowerCase()
  if (HOSTS_PERMITIDOS.includes(h)) return true
  if (hostDeTercero(h)) return true
  // Comodines: *.fbcdn.net y scontent-*.
  return h.endsWith('.fbcdn.net') || h.startsWith('scontent')
}

type Adjunto = {
  tipo: string
  cdn_url: string | null
  cdn_host: string | null
  payload: unknown
}

/**
 * Extrae los adjuntos de un mensaje.
 *
 * Tolerante por diseño: un tipo que Meta invente mañana va a 'fallback' con el
 * payload crudo y se sigue. Nunca lanza. En Chatwoot, cada tipo nuevo —sticker
 * en junio de 2026, post en junio de 2026— tumbaba el job completo y perdía
 * TODOS los mensajes del lote, no solo el afectado.
 *
 * Se aceptan a la vez `share` e `ig_post`: se anunció que `share` desaparecería
 * el 1 de febrero de 2026 en favor de `ig_post`, pero la referencia viva sigue
 * listando `share`. Contradicción sin resolver, así que el parser admite ambos.
 */
export function extraerAdjuntos(msg: Record<string, any>): Adjunto[] {
  const lista = Array.isArray(msg?.attachments) ? msg.attachments : []
  const out: Adjunto[] = []

  for (const a of lista) {
    const tipoCrudo = typeof a?.type === 'string' ? a.type : 'fallback'
    const url = typeof a?.payload?.url === 'string' ? a.payload.url : null

    let host: string | null = null
    let urlValida: string | null = null

    if (url) {
      try {
        const u = new URL(url)
        host = u.hostname
        // Solo https, y solo hosts de Meta. Un http:// o un host ajeno se
        // guarda como payload crudo sin url, para no dejar en la base una
        // dirección que alguien pueda acabar siguiendo.
        if (u.protocol === 'https:' && hostPermitido(u.hostname)) urlValida = url
      } catch {
        // URL no parseable: se conserva el payload y se descarta la dirección.
      }
    }

    out.push({
      // El valor de attachment.type se guarda TAL COMO LLEGA, sin validar
      // contra una lista: un check cerrado convertiría un tipo nuevo en un
      // insert fallido.
      tipo: tipoCrudo,
      cdn_url: urlValida,
      cdn_host: host,
      payload: a,
    })
  }

  return out
}

export function aEfectos(u: Update, org: string, channelId: string): Efecto[] {
  // WhatsApp se desvía entero: su unidad no tiene `message`, ni `sender`, ni
  // `recipient`, y el timestamp está en otra unidad. Compartir este cuerpo
  // obligaría a un `if` por cada campo y a que el más olvidado fallara callado.
  if (u.canal === 'whatsapp') return aEfectosWhatsapp(u, org, channelId)

  const m = u.m
  const base = {
    organization_id: org,
    canal: u.canal,
    channel_id: channelId,
    llego_por_standby: u.standby,
    meta_timestamp_ms: Number(m.timestamp ?? Date.now()),
    raw: m,
  }

  // --- mensaje -------------------------------------------------------------
  if (m.message) {
    const msg = m.message
    const esEcho = Boolean(msg.is_echo)

    // El unsend de Instagram llega como un objeto `message` normal con solo
    // {mid, is_deleted:true}. Es un UPDATE, nunca un INSERT.
    if (msg.is_deleted) {
      return [{ tipo: 'mensaje.borrar', mid: String(msg.mid ?? ''), ...base }]
    }
    if (msg.is_edit || m.message_edit) {
      return [{ tipo: 'mensaje.editar', mid: String(msg.mid ?? ''), texto: msg.text ?? null, ...base }]
    }

    // En un ECHO, sender y recipient están INVERTIDOS: sender.id es la Página.
    const contactoId = esEcho ? String(m.recipient?.id ?? '') : String(m.sender?.id ?? '')

    // `emisor` distingue en la bandeja quién habló de verdad. Un echo con
    // nuestro app_id es el agente o la ruta de envío de Kavea; un echo sin él
    // es alguien del cliente respondiendo desde el móvil o Business Suite.
    //
    // ESTO NO FUNCIONA EN INSTAGRAM, y no es un fallo de configuración. Medido el
    // 3 de agosto de 2026: los echoes de Instagram NO traen `app_id`. Se enviaron
    // dos mensajes por el Send API con el token de esta misma app y los dos
    // volvieron sin el campo, así que caen a 'humano'. Lo que Kavea manda por
    // Instagram es hoy indistinguible de lo que el cliente escribe desde el móvil.
    //
    // Tampoco se arregla suscribiéndose a nada: el topic `instagram` NO TIENE
    // `message_echoes` entre sus campos —el de `page` sí—, y los echoes llegan por
    // `messages` con `is_echo: true`. Verificado contra la lista de topics de la
    // app el 3 de agosto de 2026.
    //
    // LA ALTERNATIVA ESTÁ MEDIDA Y NO SE IMPLEMENTA AQUÍ: el `mid` del echo es
    // exactamente el `message_id` que devolvió el Send API. Se comprobó carácter a
    // carácter contra el acuse de lectura del mismo mensaje. Kavea ya guarda ese
    // valor en `send_api_message_id`, así que lo propio se reconoce cruzando el
    // `mid`, sin `app_id`.
    //
    // Por qué no se cambia en este fichero: los adaptadores son una función pura
    // sobre el cuerpo del webhook y no tocan la base. La comparación tiene que
    // vivir donde hay consulta, es decir en el aplicador. Cambiarlo afecta al
    // bucle del agente de IA, así que va como tarea propia y no de pasada.
    let emisor: 'contacto' | 'humano' | 'agente' = 'contacto'
    if (esEcho) emisor = APP_ID && String(msg.app_id ?? '') === APP_ID ? 'agente' : 'humano'

    return [{
      tipo: 'mensaje.upsert',
      mid: String(msg.mid ?? ''),
      direccion: esEcho ? 'outbound' : 'inbound',
      emisor,
      is_echo: esEcho,
      app_id: msg.app_id ? String(msg.app_id) : null,
      metadata: msg.metadata ?? null,
      contacto_scoped_id: contactoId,
      contacto_nombre: null,
      sender_scoped_id: String(m.sender?.id ?? ''),
      recipient_scoped_id: String(m.recipient?.id ?? ''),
      texto: msg.text ?? null,
      reply_to_mid: msg.reply_to?.mid ?? null,
      quick_reply_payload: msg.quick_reply?.payload ?? null,
      referral: m.referral ?? msg.referral ?? null,
      is_unsupported: Boolean(msg.is_unsupported),
      adjuntos: extraerAdjuntos(msg),
      ...base,
    }]
  }

  // --- eventos sin mid propio ----------------------------------------------
  // Reacciones, lecturas, entregas y postbacks no tienen identificador propio y
  // derivan su clave de deduplicación en la base.
  const actor = String(m.sender?.id ?? '')

  if (m.reaction) {
    return [{
      tipo: 'evento.registrar', evento_tipo: 'reaction',
      // OJO: reaction.mid referencia el mensaje REACCIONADO, no la reacción.
      target_mid: m.reaction.mid ?? null,
      actor_scoped_id: actor,
      accion: m.reaction.action ?? null,
      emoji: m.reaction.emoji ?? null,
      reaction: m.reaction.reaction ?? null,
      ...base,
    }]
  }

  if (m.read) {
    // Messenger e Instagram usan modelos de acuse DISTINTOS y no comparten
    // columna: watermark es "todo lo anterior leído", mid es un mensaje concreto.
    return [{
      tipo: 'evento.registrar', evento_tipo: 'read',
      read_watermark_ms: m.read.watermark ?? null,
      read_mid: m.read.mid ?? null,
      actor_scoped_id: actor,
      ...base,
    }]
  }

  if (m.delivery) {
    return [{
      tipo: 'evento.registrar', evento_tipo: 'delivery',
      delivery_mids: m.delivery.mids ?? [],
      actor_scoped_id: actor,
      ...base,
    }]
  }

  if (m.postback) {
    return [{
      tipo: 'evento.registrar', evento_tipo: 'postback',
      // Por standby llega SIN payload. No es un bug del parser.
      postback_payload: m.postback.payload ?? null,
      postback_title: m.postback.title ?? null,
      actor_scoped_id: actor,
      ...base,
    }]
  }

  if (m.optin) {
    return [{ tipo: 'evento.registrar', evento_tipo: 'optin', actor_scoped_id: actor, ...base }]
  }
  if (m.referral) {
    return [{ tipo: 'evento.registrar', evento_tipo: 'referral', actor_scoped_id: actor, ...base }]
  }
  if (m.pass_thread_control || m.take_thread_control || m.request_thread_control || m.app_roles) {
    return [{ tipo: 'evento.registrar', evento_tipo: 'thread_control', actor_scoped_id: actor, ...base }]
  }

  // Tipo desconocido: se guarda crudo y se sigue. NUNCA se lanza excepción.
  // En Chatwoot, cada tipo nuevo de Meta tumbaba el job completo y perdía todos
  // los mensajes del lote, no solo el afectado.
  return [{ tipo: 'desconocido', evento_tipo: Object.keys(m).join('+').slice(0, 60), ...base }]
}

/**
 * El texto de un mensaje de WhatsApp está en un sitio distinto según el tipo.
 *
 * Los tipos con media traen `caption`, que es texto que escribió el contacto: si
 * no se lee, la burbuja sale vacía y lo que dijo la persona se pierde sin que
 * nada falle. Es el mismo modo de fallo que costó los GIF el 2 de agosto.
 */
function textoDeWhatsapp(m: Record<string, any>): string | null {
  if (m.text?.body) return String(m.text.body)
  if (m.button?.text) return String(m.button.text)
  if (m.interactive?.button_reply?.title) return String(m.interactive.button_reply.title)
  if (m.interactive?.list_reply?.title) return String(m.interactive.list_reply.title)
  for (const k of ['image', 'video', 'document', 'audio']) {
    if (m[k]?.caption) return String(m[k].caption)
  }
  return null
}

/**
 * WhatsApp NO manda la URL de la media: manda un id.
 *
 * Es la diferencia gorda con Messenger e Instagram, donde `payload.url` viene
 * dentro del webhook y basta con validar el host. Aquí hay que pedir
 * `GET /{media-id}` con el token para conseguir una URL, y esa URL caduca en
 * minutos. Así que el adjunto se persiste con `cdn_url` en null, que es
 * exactamente el caso `sin_servir` que el CHECK `media_origen_coherente` ya
 * contempla desde la 0010. No hay que tocar el esquema.
 *
 * Resolver el id contra el grafo es trabajo de quien sirva la imagen, no de una
 * función pura: aquí no hay red, y meterla convertiría los adaptadores en algo
 * que no se puede probar en memoria.
 */
function adjuntosDeWhatsapp(m: Record<string, any>): Adjunto[] {
  const out: Adjunto[] = []
  for (const t of ['image', 'video', 'audio', 'document', 'sticker']) {
    const a = m[t]
    if (a && typeof a === 'object') out.push({ tipo: t, cdn_url: null, cdn_host: null, payload: a })
  }
  if (m.location) out.push({ tipo: 'location', cdn_url: null, cdn_host: null, payload: m.location })
  // `contacts` dentro de un mensaje son tarjetas de contacto compartidas, y no
  // tienen nada que ver con el `contacts[]` hermano de `messages[]`, que es el
  // perfil de quien escribe. Dos cosas con el mismo nombre en el mismo payload.
  for (const c of Array.isArray(m.contacts) ? m.contacts : []) {
    out.push({ tipo: 'contact', cdn_url: null, cdn_host: null, payload: c })
  }
  return out
}

/**
 * WhatsApp → efectos.
 *
 * EL TIMESTAMP VIENE EN SEGUNDOS, y esto es lo que más fácil se cuela. Messenger
 * e Instagram mandan milisegundos y la columna se llama `meta_timestamp_ms`.
 * Medido el 4 de agosto de 2026 con un mensaje real: `"1785871068"`, diez
 * dígitos. Sin multiplicar, cada mensaje de WhatsApp aterriza en enero de 1970,
 * la bandeja lo ordena al final para siempre y la ventana de 24 h lo da por
 * caducado desde el primer segundo. No falla nada visiblemente.
 */
function aEfectosWhatsapp(u: Update, org: string, channelId: string): Efecto[] {
  const m = u.m
  const seg = Number(m.timestamp ?? 0)
  const base = {
    organization_id: org,
    canal: u.canal,
    channel_id: channelId,
    // No existe standby en WhatsApp: la propiedad del hilo no se cede como en
    // Messenger. Se manda false explícito porque la columna es NOT NULL.
    llego_por_standby: false,
    meta_timestamp_ms: Number.isFinite(seg) && seg > 0 ? seg * 1000 : Date.now(),
    raw: m,
  }

  // --- acuses ---------------------------------------------------------------
  if (u.wa?.clase === 'estado') {
    const bruto = String(m.status ?? '')
    // `delivered` y `read` se traducen al vocabulario que la línea de tiempo ya
    // entiende, para no tener que enseñarle dos idiomas. `sent` y `failed` no
    // existen en Messenger y van con prefijo propio.
    const evento =
      bruto === 'delivered' ? 'delivery' : bruto === 'read' ? 'read' : `wa_${bruto || 'estado'}`

    return [{
      tipo: 'evento.registrar',
      evento_tipo: evento,
      // EL ID DEL ACUSE ES EL WAMID DEL MENSAJE, y ese wamid es el mismo que
      // devuelve el Send API. Aquí está la salida que Instagram no tiene: lo
      // propio se reconoce cruzando este id contra `send_api_message_id`, sin
      // `app_id` y sin depender de `message_echoes`, que además falló al
      // suscribirse el 4 de agosto de 2026.
      target_mid: m.id ? String(m.id) : null,
      read_mid: bruto === 'read' && m.id ? String(m.id) : null,
      actor_scoped_id: String(m.recipient_id ?? ''),
      // Meta manda el PRECIO en cada acuse: billable, modelo y categoría. El
      // coste por conversación no hay que estimarlo ni consultarlo, llega solo.
      pricing: m.pricing ?? null,
      errores: m.errors ?? null,
      ...base,
    }]
  }

  // --- mensaje entrante -----------------------------------------------------
  const from = String(m.from ?? '')

  return [{
    tipo: 'mensaje.upsert',
    mid: String(m.id ?? ''),
    // Un entrante de WhatsApp siempre es del contacto. Lo que manda Kavea no
    // vuelve por aquí: vuelve como acuse en `statuses[]`.
    direccion: 'inbound',
    emisor: 'contacto',
    is_echo: false,
    app_id: null,
    metadata: null,
    contacto_scoped_id: from,
    // GRATIS. En Instagram `contacts.nombre` está en null y rellenarlo cuesta
    // una llamada al grafo por cada contacto nuevo.
    contacto_nombre: u.wa?.perfil ?? null,
    sender_scoped_id: from,
    recipient_scoped_id: u.wa?.nuestroNumero ?? u.assetId,
    texto: textoDeWhatsapp(m),
    // Una respuesta citada llega en `context.id`, no en `reply_to.mid`.
    reply_to_mid: m.context?.id ?? null,
    quick_reply_payload: m.interactive?.button_reply?.id ?? m.button?.payload ?? null,
    referral: m.referral ?? null,
    is_unsupported: String(m.type ?? '') === 'unsupported',
    adjuntos: adjuntosDeWhatsapp(m),
    ...base,
  }]
}

/**
 * Un echo NUNCA dispara al agente, sea cual sea su app_id.
 *
 * Eso saca del camino crítico la discrepancia documental sobre el App ID de la
 * Bandeja de Business Suite —una página oficial dice 15 dígitos y otra 14— que
 * de otro modo habría que resolver para evitar bucles. El app_id queda solo
 * para atribución y alerta, no para decidir.
 */
export function disparaAgente(e: Efecto): boolean {
  return e.tipo === 'mensaje.upsert' && !e.is_echo && e.direccion === 'inbound'
}
