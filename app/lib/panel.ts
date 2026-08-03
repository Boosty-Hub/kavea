import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

/**
 * Lo que ve el panel interno de Boosty.
 *
 * NINGUNA DE ESTAS CONSULTAS DEVUELVE CONTENIDO. Cuentas, códigos y marcas de
 * tiempo. Lo que un cliente escribió sigue necesitando un grant de break-glass
 * con motivo declarado, y eso no es burocracia: es la única razón por la que un
 * cliente puede confiar su bandeja a un proveedor que también la opera.
 *
 * Todo pasa por funciones que comprueban `es_staff()` en su primera línea. Si
 * alguna vez estas llamadas devuelven vacío en vez de error, es que la sesión no
 * es de staff, no que no haya datos.
 */

export type FilaSalud = {
  organization_id: string
  nombre: string
  slug: string
  conexiones: number
  sin_verificar: number
  con_bloqueo: number
  con_aviso: number
  nunca_llego_nada: number
  envios_atascados: number
  peor_error: number | null
  espera_limite: number | null
  ultima_pasada: string | null
  gravedad: number
}

export type FilaIngesta = {
  estado: string
  eventos: number
  mas_viejo: string | null
  retraso_s: number | null
}

export type FilaEspacio = {
  organization_id: string
  nombre: string
  slug: string
  zona_horaria: string | null
  creada_en: string
  canales: number
  personas: number
  invitaciones: number
  abiertas: number
  ultimo_mensaje: string | null
}

export type FilaAcceso = {
  id: string
  organization_id: string
  organizacion: string
  quien: string
  motivo: string
  created_at: string
  expira_en: string
  vigente: boolean
}

export type FilaUso = {
  organization_id: string
  nombre: string
  mes: string
  entrantes: number
  salientes: number
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc(fn, args ?? {})
  // Un error aquí casi siempre es «no eres staff», y la página ya lo comprobó
  // antes de llegar. Se devuelve vacío en vez de reventar la pantalla entera por
  // una de cinco consultas.
  if (error) return []
  return (data ?? []) as T[]
}

export const salud = cache(() => rpc<FilaSalud>('panel_salud'))
export const ingesta = cache(() => rpc<FilaIngesta>('panel_ingesta'))
export const espacios = cache(() => rpc<FilaEspacio>('panel_espacios'))
export const accesos = cache(() => rpc<FilaAcceso>('panel_accesos'))
export const uso = cache((meses = 6) => rpc<FilaUso>('panel_uso', { p_meses: meses }))
