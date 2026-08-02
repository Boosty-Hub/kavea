import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'
import type { Canal } from './bandeja'

export type Embudo = {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
  es_predeterminado: boolean
}

export type EtapaResumen = {
  etapa_id: string
  embudo_id: string
  nombre: string
  orden: number
  color: string
  tipo: 'abierta' | 'ganada' | 'perdida'
  tarjetas: number
  valor: number
  monedas: string[] | null
}

export type TarjetaDeTablero = {
  id: string
  titulo: string | null
  estado: string
  etapa_id: string | null
  etapa_desde: string | null
  valor: number | null
  moneda: string
  no_leidos: number
  last_message_at: string | null
  contacts: { nombre: string | null; username: string | null } | null
  conversations: Array<{ canal: Canal }>
}

export const listarEmbudos = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('embudos')
    .select('id, nombre, descripcion, orden, es_predeterminado')
    .is('archivado_en', null)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as Embudo[]
})

/**
 * Las columnas del tablero.
 *
 * Incluye las etapas vacías, que es justo lo que hay que ver en un embudo: una
 * columna a cero es información, no una fila que sobra.
 */
export const columnasDe = cache(async (embudoId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('embudo_resumen')
    .select('etapa_id, embudo_id, nombre, orden, color, tipo, tarjetas, valor, monedas')
    .eq('embudo_id', embudoId)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EtapaResumen[]
})

/**
 * Las tarjetas del tablero.
 *
 * Solo las vivas: un embudo con el histórico entero deja de decir nada sobre lo
 * que hay ahora. Y con tope, porque una columna con seiscientas tarjetas no se
 * mira, se filtra.
 */
export const tarjetasDe = cache(async (embudoId: string, tope = 300) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('tarjetas')
    .select(
      'id, titulo, estado, etapa_id, etapa_desde, valor, moneda, no_leidos, ' +
      'last_message_at, contacts(nombre, username), conversations(canal)',
    )
    .eq('embudo_id', embudoId)
    .is('cerrada_en', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(tope)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TarjetaDeTablero[]
})

/** Las etapas de un embudo, para los selectores. */
export const etapasDe = cache(async (embudoId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('etapas')
    .select('id, nombre, orden, color, tipo, embudo_id')
    .eq('embudo_id', embudoId)
    .is('archivado_en', null)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{
    id: string; nombre: string; orden: number
    color: string; tipo: string; embudo_id: string
  }>
})

/** Todas las etapas de la organización, para el selector de la ficha. */
export const todasLasEtapas = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('etapas')
    .select('id, nombre, orden, color, tipo, embudo_id, embudos(nombre)')
    .is('archivado_en', null)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Array<{
    id: string; nombre: string; orden: number; color: string; tipo: string
    embudo_id: string; embudos: { nombre: string } | null
  }>
})

// Los ayudantes de presentación —colorEtapa, diasEnEtapa, formatoValor— viven en
// `lib/ventana.ts`, no aquí. Este módulo importa el cliente de servidor de
// Supabase, y un componente de cliente que importe de aquí un valor cualquiera
// arrastra `next/headers` al bundle del navegador y rompe el build. Ya pasó una
// vez con `terminoSeguro`.
