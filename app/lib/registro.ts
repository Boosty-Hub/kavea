import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

export type Movimiento = {
  id: number
  tipo: string
  actor_tipo: string
  actor_nombre: string | null
  detalle: Record<string, unknown>
  created_at: string
  tarjeta_id: string | null
  titulo: string | null
}

export type FilaContacto = {
  id: string
  nombre: string | null
  username: string | null
  canales: string[]
  tarjetas: number
  ultimo_mensaje: string | null
  comprado: number
  moneda: string | null
  fusionado: boolean
}

export type Duplicado = {
  a_id: string
  a_nombre: string
  b_id: string
  b_nombre: string
  motivo: string
  fuerza: 'fuerte' | 'debil'
}

export const registroDe = cache(async (
  organizacionId: string,
  opts: { actor?: string; tipo?: string; desde?: string; antesDe?: string } = {},
) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('registro_actividad', {
    p_org: organizacionId,
    p_actor: opts.actor ?? null,
    p_tipo: opts.tipo ?? null,
    p_desde: opts.desde ?? null,
    p_limite: 80,
    p_antes_de: opts.antesDe ?? null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Movimiento[]
})

export const contactosDe = cache(async (organizacionId: string, texto?: string, pagina = 0) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('listar_contactos', {
    p_org: organizacionId,
    p_texto: texto ?? null,
    p_limite: 60,
    p_desplazar: pagina * 60,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as FilaContacto[]
})

export const duplicadosDe = cache(async (organizacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('posibles_duplicados', {
    p_org: organizacionId, p_limite: 40,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Duplicado[]
})
