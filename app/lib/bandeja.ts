import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

export type FilaBandeja = {
  id: string
  canal: 'instagram' | 'messenger'
  estado: 'nueva' | 'en_curso' | 'esperando' | 'cerrada'
  preview_texto: string | null
  preview_emisor: string | null
  no_leidos: number
  last_message_at: string | null
  last_incoming_at: string | null
  asignado_a: string | null
  contacts: { nombre: string | null; username: string | null } | null
}

export type EntradaHilo = {
  clase: 'mensaje' | 'evento' | 'actividad'
  ref: string
  momento: string
  tipo: string
  actor_tipo: string | null
  actor_nombre: string | null
  detalle: Record<string, unknown>
}

/**
 * Lista de conversaciones.
 *
 * NO filtra por organization_id. El filtro lo pone RLS, y añadirlo aquí no
 * aporta seguridad: da la falsa impresión de que sí, y el día que alguien lo
 * quite creerá que quitó la protección cuando nunca estuvo ahí.
 *
 * Paginación por CURSOR sobre (last_message_at, id), nunca por offset: con
 * offset, la página 20 hace que Postgres lea y descarte las 19 anteriores, y
 * además una conversación nueva desplaza todo y duplica filas entre páginas.
 */
export const listarConversaciones = cache(
  async (opts: { estado?: string; canal?: string; cursor?: string; limite?: number } = {}) => {
    const supabase = await crearClienteServidor()
    const limite = opts.limite ?? 40

    let q = supabase
      .from('conversations')
      .select(
        'id, canal, estado, preview_texto, preview_emisor, no_leidos, last_message_at, last_incoming_at, asignado_a, contacts(nombre, username)',
      )
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limite)

    // Por defecto la bandeja muestra lo vivo. Las cerradas se piden aparte y
    // usan otro índice.
    if (opts.estado && opts.estado !== 'todas') q = q.eq('estado', opts.estado)
    else q = q.neq('estado', 'cerrada')

    if (opts.canal && opts.canal !== 'todos') q = q.eq('canal', opts.canal)
    if (opts.cursor) q = q.lt('last_message_at', opts.cursor)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as FilaBandeja[]
  },
)

export const contarPorEstado = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('conversations').select('estado')
  const filas = (data ?? []) as Array<{ estado: string }>
  const n: Record<string, number> = { todas: 0, nueva: 0, en_curso: 0, esperando: 0, cerrada: 0 }
  for (const f of filas) {
    n[f.estado] = (n[f.estado] ?? 0) + 1
    if (f.estado !== 'cerrada') n.todas!++
  }
  return n
})

export const obtenerConversacion = cache(async (id: string) => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('conversations')
    .select(
      'id, canal, estado, last_incoming_at, last_message_at, asignado_a, en_standby, contacts(id, nombre, username, profile_pic_url)',
    )
    .eq('id', id)
    .maybeSingle()
  return data as unknown as
    | (FilaBandeja & { en_standby: boolean; contacts: { id: string; nombre: string | null; username: string | null; profile_pic_url: string | null } | null })
    | null
})

/**
 * El hilo, desde la vista unificada.
 *
 * Una sola consulta trae mensajes, eventos de Meta y actividad del equipo ya
 * ordenados. Traerlos por separado y mezclar en el cliente rompería la
 * paginación: no se puede paginar una mezcla que se ordena después.
 */
export const obtenerHilo = cache(async (conversacionId: string, limite = 100) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('linea_tiempo')
    .select('clase, ref, momento, tipo, actor_tipo, actor_nombre, detalle')
    .eq('conversation_id', conversacionId)
    .order('momento', { ascending: true })
    .limit(limite)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EntradaHilo[]
})

export const adjuntosDe = cache(async (conversacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('media')
    .select('message_id, tipo, cdn_url, cdn_host')
    .in(
      'message_id',
      (
        await supabase.from('messages').select('id').eq('conversation_id', conversacionId)
      ).data?.map((m: { id: string }) => m.id) ?? [],
    )
  return (data ?? []) as Array<{ message_id: string; tipo: string; cdn_url: string | null; cdn_host: string | null }>
})
