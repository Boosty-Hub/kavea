import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

export type Tarea = {
  id: string
  tarjeta_id: string | null
  titulo: string
  detalle: string | null
  vence_en: string
  recordar_en: string | null
  asignado_a: string
  completada_en: string | null
  tarjetas: { titulo: string | null; contacts: { nombre: string | null; username: string | null } | null } | null
}

export type Notificacion = {
  id: string
  tipo: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  leida_en: string | null
  created_at: string
}

const CAMPOS_TAREA =
  'id, tarjeta_id, titulo, detalle, vence_en, recordar_en, asignado_a, completada_en, ' +
  'tarjetas(titulo, contacts(nombre, username))'

/**
 * Las tareas de un mes.
 *
 * Se pide por rango y no todas: un calendario que carga tres años de tareas
 * para pintar treinta días es lento desde el primer cliente que lleve un año.
 */
export const tareasDelMes = cache(async (desde: string, hasta: string, soloMias?: string) => {
  const supabase = await crearClienteServidor()
  let q = supabase
    .from('tareas')
    .select(CAMPOS_TAREA)
    .gte('vence_en', desde)
    .lt('vence_en', hasta)
    .order('vence_en')
  if (soloMias) q = q.eq('asignado_a', soloMias)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Tarea[]
})

/** Las de una conversación, para la ficha. */
export const tareasDeTarjeta = cache(async (tarjetaId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('tareas')
    .select(CAMPOS_TAREA)
    .eq('tarjeta_id', tarjetaId)
    .order('completada_en', { nullsFirst: true })
    .order('vence_en')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Tarea[]
})

/**
 * Las notificaciones de quien mira.
 *
 * RLS las filtra por `user_id = auth.uid()`: no hay que pasar el usuario ni se
 * debe. Una notificación lleva el nombre de un contacto y un fragmento de
 * conversación, y no hay razón para que un compañero lea los avisos de otro.
 */
export const misNotificaciones = cache(async (limite = 30) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, titulo, cuerpo, enlace, leida_en, created_at')
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw new Error(error.message)
  return (data ?? []) as Notificacion[]
})

export const sinLeer = cache(async () => {
  const supabase = await crearClienteServidor()
  const { count } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .is('leida_en', null)
  return count ?? 0
})
