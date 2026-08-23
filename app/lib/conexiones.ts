import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

/**
 * El estado de los canales conectados, comprobación a comprobación.
 *
 * No hay un campo «conectado». El estado se DERIVA de las siete comprobaciones,
 * porque un octavo dato guardado aparte puede contradecir a los otros siete y el
 * día que lo haga nadie sabrá cuál creer.
 */

export type Verificacion = {
  codigo: string
  titulo: string
  resultado: 'ok' | 'fallo' | 'no_verificable' | 'sin_probar'
  causa: string | null
  crudo: Record<string, unknown> | null
  bloquea: boolean
  verificado_en: string
}

/**
 * Un canal concreto de una conexión: la cuenta de Instagram, la Página o el
 * número de WhatsApp.
 *
 * `activo` es un campo GUARDADO, y aquí sí está bien que lo sea, al revés que el
 * estado de la conexión. Son cosas distintas: las siete comprobaciones dicen si
 * el canal PUEDE funcionar, y esto dice si Kavea QUIERE que funcione. Un canal
 * pausado a mano por un operador está perfectamente sano y aun así no debe
 * despachar, y eso no se deriva de ninguna comprobación.
 */
export type CanalConectado = {
  id: string
  canal: string
  nombre: string | null
  activo: boolean
  pausado_motivo: string | null
  pausado_desde: string | null
}

export type Conexion = {
  meta_connection_id: string
  page_name: string | null
  /** Null en una conexión de WhatsApp: la restricción de la 0065 lo exige. */
  page_id: string | null
  ig_username: string | null
  en_verde: number
  en_rojo: number
  sin_saber: number
  sin_probar: number
  bloqueada: boolean | null
  ultima_pasada: string | null
  comprobaciones: Verificacion[]
  canales: CanalConectado[]
}

/**
 * Los husos, leídos de Postgres.
 *
 * De `pg_timezone_names`, que es la misma lista contra la que valida el trigger
 * de `organizations`. Una lista escrita a mano en el cliente sería una segunda
 * verdad, y la que se quede corta es la que rechaza al cliente que vive en ella.
 */
export const husosDisponibles = cache(async (): Promise<Array<{ nombre: string; desfase: string }>> => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.rpc('husos_disponibles')
  return (data ?? []) as Array<{ nombre: string; desfase: string }>
})

export const conexionesDe = cache(async (organizacionId: string): Promise<Conexion[]> => {
  const supabase = await crearClienteServidor()

  // Dos consultas y no un embed: `estado_de_conexion` es una vista agregada y
  // PostgREST no sabe colgarle una relación. Unirlas aquí cuesta un bucle y no
  // deja una consulta que devuelve filas de más sin dar error.
  const [{ data: estados }, { data: checks }, { data: canales }] = await Promise.all([
    supabase.from('estado_de_conexion').select('*').eq('organization_id', organizacionId),
    supabase
      .from('verificaciones')
      .select('meta_connection_id, codigo, titulo, resultado, causa, crudo, bloquea, verificado_en')
      .eq('organization_id', organizacionId)
      .order('codigo'),
    supabase
      .from('channels')
      .select('id, meta_connection_id, canal, nombre, activo, pausado_motivo, pausado_desde')
      .eq('organization_id', organizacionId)
      .order('canal'),
  ])

  const porConexion = new Map<string, Verificacion[]>()
  for (const v of (checks ?? []) as Array<Verificacion & { meta_connection_id: string }>) {
    const l = porConexion.get(v.meta_connection_id) ?? []
    l.push(v)
    porConexion.set(v.meta_connection_id, l)
  }

  const canalesDe = new Map<string, CanalConectado[]>()
  for (const c of (canales ?? []) as Array<CanalConectado & { meta_connection_id: string }>) {
    const l = canalesDe.get(c.meta_connection_id) ?? []
    l.push(c)
    canalesDe.set(c.meta_connection_id, l)
  }

  return ((estados ?? []) as Omit<Conexion, 'comprobaciones' | 'canales'>[]).map((e) => ({
    ...e,
    comprobaciones: porConexion.get(e.meta_connection_id) ?? [],
    canales: canalesDe.get(e.meta_connection_id) ?? [],
  }))
})
