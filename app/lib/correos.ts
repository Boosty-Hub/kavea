import 'server-only'

import { REMITENTE } from './correo'
import { crearClienteServidor } from './supabase/servidor'

/**
 * La bandeja de correo de kavea.ai.
 *
 * POR QUÉ SE SINCRONIZA AL ABRIR Y NO POR WEBHOOK
 *
 * Está razonado en la migración 0061. Resumen: `GET /emails/inbound` lista todo
 * el histórico, así que no hay nada que perder por no estar escuchando, y eso
 * ahorra un endpoint público, la verificación de firmas de Resend y un cron más.
 *
 * POR QUÉ LOS ADJUNTOS SE BAJAN AQUÍ Y NO EN EL NAVEGADOR
 *
 * El `download_url` de Resend caduca a la hora y va firmado con la clave de la
 * cuenta. Servirlo al navegador sería repartir un enlace que caduca y que además
 * sale de una API autenticada. Se baja en el servidor, se guarda en Storage, y
 * el navegador pide el binario a Supabase con su propia sesión.
 */

const API = 'https://api.resend.com'
const BUCKET = 'correo-adjuntos'

/**
 * Tope de descarga por adjunto. No es una limitación de Resend: es que bajar y
 * volver a subir un fichero enorme dentro del render de una página deja la
 * bandeja colgada varios segundos. Por encima del tope el adjunto se ANOTA sin
 * `ruta`, que es un estado que la tabla contempla y la interfaz sabe mostrar.
 */
const TOPE_BYTES = 25 * 1024 * 1024

export type Correo = {
  id: string
  resend_id: string
  direccion: 'entrante' | 'saliente'
  de: string
  para: string[]
  cc: string[]
  bcc: string[]
  responder_a: string[]
  recibido_para: string | null
  asunto: string | null
  texto: string | null
  html: string | null
  message_id: string | null
  in_reply_to: string | null
  referencias: string[]
  fecha: string
  leido_en: string | null
}

export type Adjunto = {
  id: string
  correo_id: string
  resend_id: string
  nombre: string
  tipo: string | null
  bytes: number | null
  ruta: string | null
}

export type Resultado = {
  nuevos: number
  adjuntos: number
  hayMas: boolean
  problemas: string[]
}

function clave(): string {
  const k = process.env.RESEND_API_KEY
  if (!k) throw new Error('Falta RESEND_API_KEY')
  return k
}

async function resend<T>(ruta: string): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${clave()}` },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`Resend ${r.status} en ${ruta}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T
}

/**
 * Trae de Resend lo que no esté ya guardado.
 *
 * Los problemas se ACUMULAN y se devuelven en vez de lanzarse. Un adjunto que no
 * se pudo bajar no puede impedir que los otros veinte correos entren: el
 * comportamiento correcto es guardar todo lo que se pueda y decir en voz alta
 * qué falló.
 */
export async function sincronizar(): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const res: Resultado = { nuevos: 0, adjuntos: 0, hayMas: false, problemas: [] }

  type AdjuntoResend = { id: string; filename: string; content_type: string | null; size: number | null }

  /**
   * EL LISTADO NO TRAE EL CUERPO. Medido el 3 de agosto de 2026:
   * `GET /emails/inbound` devuelve `id`, `from`, `to`, `cc`, `bcc`, `reply_to`,
   * `subject`, `message_id`, `created_at` y `attachments`, y nada más. El `text`,
   * el `html`, el `received_for` y las cabeceras de hilo viven SOLO en el
   * detalle. Guardar desde el listado dejaría una bandeja de asuntos sin
   * mensajes, y el fallo no se vería hasta abrir un correo.
   */
  type Resumen = { id: string }
  type Entrante = {
    id: string
    from: string
    to: string[] | null
    cc: string[] | null
    bcc: string[] | null
    reply_to: string[] | null
    received_for: string[] | string | null
    subject: string | null
    text: string | null
    html: string | null
    message_id: string | null
    created_at: string
    attachments: AdjuntoResend[] | null
    headers?: Record<string, string> | null
  }

  const lista = await resend<{ data: Resumen[]; has_more: boolean }>('/emails/inbound?limit=100')
  res.hayMas = Boolean(lista.has_more)

  // Los que ya están guardados no se vuelven a pedir. Sin esto, cada apertura del
  // módulo haría una llamada de detalle por correo del histórico.
  const guardados = new Set((await listar(500)).map((c) => c.resend_id))

  for (const resumen of lista.data ?? []) {
    if (guardados.has(resumen.id)) continue

    let e: Entrante
    try {
      e = await resend<Entrante>(`/emails/inbound/${resumen.id}`)
    } catch (err) {
      res.problemas.push(`${resumen.id}: ${(err as Error).message}`)
      continue
    }

    // `received_for` llega a veces como array y a veces como cadena. Se
    // normaliza aquí y no en la base: la base guarda un dato, no una variante.
    const recibidoPara = Array.isArray(e.received_for) ? (e.received_for[0] ?? null) : (e.received_for ?? null)
    const cabeceras = e.headers ?? {}
    const enRespuestaA = cabeceras['in-reply-to'] ?? cabeceras['In-Reply-To'] ?? null
    const referencias = (cabeceras['references'] ?? cabeceras['References'] ?? '')
      .split(/\s+/).filter(Boolean)

    const { data, error } = await supabase.rpc('guardar_correo_entrante', {
      p_resend_id: e.id,
      p_de: e.from,
      p_para: e.to ?? [],
      p_asunto: e.subject,
      p_texto: e.text,
      p_html: e.html,
      p_fecha: e.created_at,
      p_recibido_para: recibidoPara,
      p_cc: e.cc ?? [],
      p_bcc: e.bcc ?? [],
      p_responder_a: e.reply_to ?? [],
      p_message_id: e.message_id,
      p_in_reply_to: enRespuestaA,
      p_referencias: referencias,
    })
    if (error) { res.problemas.push(`${e.id}: ${error.message}`); continue }

    const fila = (data as Array<{ id: string; nuevo: boolean }>)?.[0]
    if (!fila) { res.problemas.push(`${e.id}: la base no devolvió id`); continue }
    if (!fila.nuevo) continue

    res.nuevos++

    for (const a of e.attachments ?? []) {
      try {
        await bajarAdjunto(supabase, fila.id, e.id, a)
        res.adjuntos++
      } catch (err) {
        res.problemas.push(`adjunto ${a.filename}: ${(err as Error).message}`)
      }
    }
  }

  return res
}

type ClienteSupabase = Awaited<ReturnType<typeof crearClienteServidor>>

async function bajarAdjunto(
  supabase: ClienteSupabase,
  correoId: string,
  entranteId: string,
  a: { id: string; filename: string; content_type: string | null; size: number | null },
): Promise<void> {
  // El listado del correo no trae `download_url`: hay que pedir el adjunto suelto
  // para que Resend firme una URL. Medido el 3 de agosto de 2026.
  const det = await resend<{ download_url?: string }>(
    `/emails/inbound/${entranteId}/attachments/${a.id}`,
  )

  let ruta: string | null = null

  if (a.size !== null && a.size > TOPE_BYTES) {
    await anotar(supabase, correoId, a, null)
    throw new Error(`${a.filename} pesa ${Math.round((a.size ?? 0) / 1e6)} MB, por encima del tope`)
  }

  if (det.download_url) {
    const bin = await fetch(det.download_url, { signal: AbortSignal.timeout(60_000) })
    if (!bin.ok) throw new Error(`la descarga devolvió ${bin.status}`)
    const cuerpo = await bin.arrayBuffer()

    // El nombre del fichero del correo NO se usa como ruta. Un adjunto se llama
    // como quiera quien lo manda, incluido `../` o cien caracteres de unicode.
    // La ruta se construye con ids que nosotros controlamos.
    ruta = `${correoId}/${a.id}`

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, cuerpo, { contentType: a.content_type ?? 'application/octet-stream', upsert: true })
    if (error) throw new Error(`Storage: ${error.message}`)
  }

  await anotar(supabase, correoId, a, ruta)
}

async function anotar(
  supabase: ClienteSupabase,
  correoId: string,
  a: { id: string; filename: string; content_type: string | null; size: number | null },
  ruta: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('guardar_adjunto_de_correo', {
    p_correo: correoId,
    p_resend_id: a.id,
    p_nombre: a.filename,
    p_tipo: a.content_type,
    p_bytes: a.size,
    p_ruta: ruta,
  })
  if (error) throw new Error(error.message)
}

export async function listar(limite = 200): Promise<Correo[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('panel_correos', { p_limite: limite })
  if (error) throw new Error(`panel_correos: ${error.message}`)
  return (data ?? []) as Correo[]
}

export async function adjuntosDe(correoId: string): Promise<Adjunto[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('panel_correo_adjuntos', { p_correo: correoId })
  if (error) throw new Error(`panel_correo_adjuntos: ${error.message}`)
  return (data ?? []) as Adjunto[]
}

/**
 * Responder, o escribir de cero.
 *
 * Si se pasa `enRespuestaA`, se mandan las cabeceras `In-Reply-To` y
 * `References`. Sin ellas el cliente de correo de quien recibe abre un hilo
 * nuevo, y la conversación se parte en dos por nuestra culpa.
 */
export async function enviar(entrada: {
  para: string[]
  asunto: string
  texto: string
  enRespuestaA?: { messageId: string | null; referencias: string[] } | null
}): Promise<{ ok: boolean; id?: string; motivo?: string }> {
  const cabeceras: Record<string, string> = {}
  const r = entrada.enRespuestaA
  if (r?.messageId) {
    cabeceras['In-Reply-To'] = r.messageId
    cabeceras['References'] = [...(r.referencias ?? []), r.messageId].join(' ')
  }

  let id: string
  try {
    const resp = await fetch(`${API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: entrada.para,
        subject: entrada.asunto,
        text: entrada.texto,
        ...(Object.keys(cabeceras).length ? { headers: cabeceras } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!resp.ok) {
      return { ok: false, motivo: `Resend respondió ${resp.status}: ${(await resp.text()).slice(0, 160)}` }
    }
    id = ((await resp.json()) as { id: string }).id
  } catch {
    return { ok: false, motivo: 'No hubo respuesta de Resend.' }
  }

  // El correo YA SALIÓ. Si el registro falla se dice, pero no se presenta como
  // un envío fallido: reintentar mandaría el mensaje dos veces.
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_correo_saliente', {
    p_resend_id: id,
    p_para: entrada.para,
    p_asunto: entrada.asunto,
    p_texto: entrada.texto,
    p_de: REMITENTE,
    p_in_reply_to: r?.messageId ?? null,
    p_referencias: r?.referencias ?? [],
  })

  return error
    ? { ok: true, id, motivo: `Salió, pero no quedó registrado: ${error.message}` }
    : { ok: true, id }
}

export async function marcarLeido(id: string): Promise<void> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('marcar_correo_leido', { p_id: id })
  if (error) throw new Error(`marcar_correo_leido: ${error.message}`)
}
