import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

/**
 * La bandeja opera sobre TARJETAS, no sobre conversaciones.
 *
 * La tarjeta es el asunto: una persona y lo que hay que resolver con ella.
 * La conversación es el transporte: un hilo con Meta por un canal concreto.
 * Una tarjeta tiene de una a N conversaciones, como mucho una viva por canal.
 *
 * Lo que se lee en pantalla es la unión de las líneas de tiempo de sus
 * conversaciones, con cada entrada marcada con su canal. Lo que NO se une es la
 * ventana de 24 h ni el envío: esos son de cada conversación, porque el token,
 * el endpoint y la propiedad del hilo en Meta lo son.
 */

export type Canal = 'instagram' | 'messenger' | 'whatsapp'

export type ConversacionDeTarjeta = {
  id: string
  canal: Canal
  last_incoming_at: string | null
  last_message_at: string | null
  en_standby: boolean
  cerrada_en: string | null
}

export type FilaBandeja = {
  id: string
  estado: 'nueva' | 'en_curso' | 'esperando' | 'cerrada'
  titulo: string | null
  preview_texto: string | null
  preview_emisor: string | null
  no_leidos: number
  last_message_at: string | null
  asignado_a: string | null
  contacts: { nombre: string | null; username: string | null } | null
  conversations: Array<{ canal: Canal; last_incoming_at: string | null }>
}

export type EntradaHilo = {
  clase: 'mensaje' | 'evento' | 'actividad'
  ref: string
  momento: string
  tipo: string
  // Nulo en la actividad del asunto, y eso es correcto: unir dos tarjetas o
  // rellenar un campo no ocurre "por Instagram".
  canal: Canal | null
  conversation_id: string | null
  actor_tipo: string | null
  actor_nombre: string | null
  detalle: Record<string, unknown>
}

const CAMPOS_LISTA =
  'id, estado, titulo, preview_texto, preview_emisor, no_leidos, last_message_at, ' +
  'asignado_a, contacts(nombre, username), conversations(canal, last_incoming_at)'

/**
 * Lista de tarjetas.
 *
 * NO filtra por organization_id. El filtro lo pone RLS, y añadirlo aquí no
 * aporta seguridad: da la falsa impresión de que sí, y el día que alguien lo
 * quite creerá que quitó la protección cuando nunca estuvo ahí.
 *
 * Paginación por CURSOR sobre last_message_at, nunca por offset: con offset, la
 * página 20 hace que Postgres lea y descarte las 19 anteriores, y además una
 * conversación nueva desplaza todo y duplica filas entre páginas.
 */
export const listarTarjetas = cache(
  async (opts: { estado?: string; canal?: string; cursor?: string; limite?: number } = {}) => {
    const supabase = await crearClienteServidor()

    // El filtro por canal necesita que la tarjeta TENGA una conversación de ese
    // canal, de ahí el inner. Sin él, PostgREST devolvería todas las tarjetas
    // con el array de conversaciones filtrado, que es otra pregunta.
    const seleccion = opts.canal && opts.canal !== 'todos'
      ? CAMPOS_LISTA.replace('conversations(', 'conversations!inner(')
      : CAMPOS_LISTA

    let q = supabase
      .from('tarjetas')
      .select(seleccion)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(opts.limite ?? 40)

    if (opts.estado && opts.estado !== 'todas') q = q.eq('estado', opts.estado)
    else q = q.neq('estado', 'cerrada')

    if (opts.canal && opts.canal !== 'todos') q = q.eq('conversations.canal', opts.canal)
    if (opts.cursor) q = q.lt('last_message_at', opts.cursor)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as FilaBandeja[]
  },
)

export const contarPorEstado = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('tarjetas').select('estado')
  const filas = (data ?? []) as Array<{ estado: string }>
  const n: Record<string, number> = { todas: 0, nueva: 0, en_curso: 0, esperando: 0, cerrada: 0 }
  for (const f of filas) {
    n[f.estado] = (n[f.estado] ?? 0) + 1
    if (f.estado !== 'cerrada') n.todas!++
  }
  return n
})

export const obtenerTarjeta = cache(async (id: string) => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('tarjetas')
    .select(
      'id, estado, titulo, asignado_a, no_leidos, last_message_at, cerrada_en, ' +
      'embudo_id, etapa_id, valor, moneda, ' +
      'contacts(id, nombre, username, profile_pic_url), ' +
      'conversations(id, canal, last_incoming_at, last_message_at, en_standby, cerrada_en)',
    )
    .eq('id', id)
    .maybeSingle()
  // Omit de `conversations` y `contacts`: en el hilo hacen falta enteras, y una
  // intersección con las versiones reducidas de FilaBandeja se queda con la
  // reducida sin avisar.
  return data as unknown as
    | (Omit<FilaBandeja, 'conversations' | 'contacts'> & {
        cerrada_en: string | null
        embudo_id: string | null
        etapa_id: string | null
        valor: number | null
        moneda: string
        contacts: { id: string; nombre: string | null; username: string | null; profile_pic_url: string | null } | null
        conversations: ConversacionDeTarjeta[]
      })
    | null
})

/**
 * El hilo, desde la vista unificada.
 *
 * Una sola consulta trae mensajes, eventos de Meta y actividad del equipo de
 * TODAS las conversaciones de la tarjeta, ya ordenados y con su canal. Traerlos
 * por separado y mezclar en el cliente rompería la paginación: no se puede
 * paginar una mezcla que se ordena después.
 */
export const obtenerHilo = cache(async (tarjetaId: string, limite = 100) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('linea_tiempo')
    .select('clase, ref, momento, tipo, canal, conversation_id, actor_tipo, actor_nombre, detalle')
    .eq('tarjeta_id', tarjetaId)
    .order('momento', { ascending: true })
    .limit(limite)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EntradaHilo[]
})

export type Adjunto = {
  message_id: string
  tipo: string
  cdn_url: string | null
  cdn_host: string | null
  cdn_url_recibida_en: string | null
}

/**
 * Los adjuntos del hilo.
 *
 * Se filtra por la lista de conversaciones de la tarjeta, que el llamante ya
 * tiene: `media` no lleva `tarjeta_id` y encadenar dos embeds anidados en
 * PostgREST para llegar hasta él es frágil de leer y de depurar.
 */
export const adjuntosDe = cache(async (conversacionIds: string[]) => {
  if (!conversacionIds.length) return []
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('media')
    .select(
      'message_id, tipo, cdn_url, cdn_host, cdn_url_recibida_en, messages!media_mensaje_mismo_tenant!inner(conversation_id)',
    )
    .in('messages.conversation_id', conversacionIds)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Adjunto[]
})

export type CanalDePersona = {
  identidad_id: string
  canal: Canal
  scoped_id: string
  origen: 'meta' | 'manual'
  etiqueta: string
  tarjeta_abierta: string | null
}

export const canalesDe = cache(async (contactoId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('persona_canales')
    .select('identidad_id, canal, scoped_id, origen, etiqueta, tarjeta_abierta')
    .eq('contact_id', contactoId)
    .order('canal')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as CanalDePersona[]
})

/** Otras tarjetas de la misma persona: asuntos anteriores, casi siempre cerrados. */
export const otrasTarjetasDe = cache(async (contactoId: string, exceptoId: string) => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('tarjetas')
    .select('id, titulo, estado, preview_texto, last_message_at')
    .eq('contact_id', contactoId)
    .neq('id', exceptoId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(10)
  return (data ?? []) as Array<{
    id: string; titulo: string | null; estado: string
    preview_texto: string | null; last_message_at: string | null
  }>
})

export type CampoDeFicha = {
  campo_id: string
  clave: string
  etiqueta: string
  tipo: string
  opciones: string[] | null
  ayuda: string | null
  obligatorio: boolean
  orden: number
  valor: unknown
  actualizado_en: string | null
}

/**
 * La ficha.
 *
 * Sale de una vista que parte de las DEFINICIONES y hace left join a los
 * valores, no al revés: un formulario que solo muestra lo que ya está relleno
 * no se puede rellenar.
 */
export const fichaDeTarjeta = cache(async (tarjetaId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('ficha_tarjeta')
    .select('campo_id, clave, etiqueta, tipo, opciones, ayuda, obligatorio, orden, valor, actualizado_en')
    .eq('tarjeta_id', tarjetaId)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as CampoDeFicha[]
})

export const fichaDeContacto = cache(async (contactoId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('ficha_contacto')
    .select('campo_id, clave, etiqueta, tipo, opciones, ayuda, obligatorio, orden, valor, actualizado_en')
    .eq('contacto_id', contactoId)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as CampoDeFicha[]
})

export type Ventana = { clase: 'abierta' | 'humana' | 'cerrada'; motivo: string | null }

/**
 * La ventana de servicio, calculada en Postgres.
 *
 * No se recalcula en el cliente. La misma función `ventana_de()` la usan el
 * compositor, el RPC que encola y el despachador que llama a Meta: tres sitios,
 * una sola regla. Tenerla escrita dos veces es tenerla mal una vez.
 */
export const ventanaDe = cache(async (conversacionId: string, emisor = 'humano') => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .rpc('ventana_de', { p_conversacion: conversacionId, p_emisor: emisor })
  if (error) throw new Error(error.message)
  const f = (data as unknown as Ventana[])?.[0]
  return f ?? { clase: 'cerrada' as const, motivo: 'No se pudo calcular la ventana.' }
})

export const listarCampos = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('campos')
    .select('id, clave, etiqueta, tipo, opciones, ayuda, obligatorio, orden, ambito, archivado_en')
    .is('archivado_en', null)
    .order('ambito')
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{
    id: string; clave: string; etiqueta: string; tipo: string
    opciones: string[] | null; ayuda: string | null; obligatorio: boolean
    orden: number; ambito: 'tarjeta' | 'contacto'; archivado_en: string | null
  }>
})
