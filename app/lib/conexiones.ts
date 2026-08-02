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

export type Conexion = {
  meta_connection_id: string
  page_name: string | null
  page_id: string
  ig_username: string | null
  en_verde: number
  en_rojo: number
  sin_saber: number
  sin_probar: number
  bloqueada: boolean | null
  ultima_pasada: string | null
  comprobaciones: Verificacion[]
}

export const conexionesDe = cache(async (organizacionId: string): Promise<Conexion[]> => {
  const supabase = await crearClienteServidor()

  // Dos consultas y no un embed: `estado_de_conexion` es una vista agregada y
  // PostgREST no sabe colgarle una relación. Unirlas aquí cuesta un bucle y no
  // deja una consulta que devuelve filas de más sin dar error.
  const [{ data: estados }, { data: checks }] = await Promise.all([
    supabase.from('estado_de_conexion').select('*').eq('organization_id', organizacionId),
    supabase
      .from('verificaciones')
      .select('meta_connection_id, codigo, titulo, resultado, causa, crudo, bloquea, verificado_en')
      .eq('organization_id', organizacionId)
      .order('codigo'),
  ])

  const porConexion = new Map<string, Verificacion[]>()
  for (const v of (checks ?? []) as Array<Verificacion & { meta_connection_id: string }>) {
    const l = porConexion.get(v.meta_connection_id) ?? []
    l.push(v)
    porConexion.set(v.meta_connection_id, l)
  }

  return ((estados ?? []) as Omit<Conexion, 'comprobaciones'>[]).map((e) => ({
    ...e,
    comprobaciones: porConexion.get(e.meta_connection_id) ?? [],
  }))
})
