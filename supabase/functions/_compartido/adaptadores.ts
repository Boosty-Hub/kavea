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

/** Una unidad de trabajo: un elemento de messaging[] o standby[] de un entry. */
export type Update = {
  assetId: string
  canal: 'messenger' | 'instagram'
  standby: boolean
  m: Record<string, any>
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

/** App ID de Kavea: distingue lo que enviamos nosotros de lo que envió el cliente por fuera. */
const APP_ID = Deno.env.get('META_APP_ID') ?? ''

export function aEfectos(u: Update, org: string, channelId: string): Efecto[] {
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
