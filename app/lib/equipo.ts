import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

export type Miembro = {
  user_id: string
  correo: string
  nombre: string
  rol: 'owner' | 'admin' | 'agente'
  desde: string
  soy_yo: boolean
  en_rotacion: boolean
  ultima_asignacion: string | null
  abiertas: number
}

export type Invitacion = {
  id: string
  correo: string
  rol: string
  expira_en: string
  created_at: string
}

export const equipoDe = cache(async (organizacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('equipo_de', { p_org: organizacionId })
  if (error) throw new Error(error.message)
  return (data ?? []) as Miembro[]
})

/**
 * Las invitaciones vivas.
 *
 * NO se selecciona `token_sha`. La política de RLS deja leer la fila entera a
 * quien administra, pero el hash no tiene por qué salir de la base ni una vez:
 * no sirve para nada en la interfaz y todo lo que viaja se puede filtrar.
 */
export const invitacionesDe = cache(async (organizacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('invitaciones')
    .select('id, correo, rol, expira_en, created_at')
    .eq('organization_id', organizacionId)
    .is('aceptada_en', null)
    .is('revocada_en', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Invitacion[]
})

/** Qué puede hacer quien está mirando. La interfaz no enseña lo que va a fallar. */
export const puedeHacer = cache(async (organizacionId: string, accion: string) => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.rpc('puede', { org: organizacionId, accion })
  return data === true
})

/** Si el reparto por turnos esta encendido en esta organizacion. */
export const repartoDe = cache(async (organizacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('organizations')
    .select('reparto_automatico')
    .eq('id', organizacionId)
    .maybeSingle()
  return (data as { reparto_automatico: boolean } | null)?.reparto_automatico ?? false
})