import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

export type Plantilla = {
  id: string
  tipo: 'interna' | 'whatsapp'
  nombre: string
  cuerpo: string
  atajo: string | null
  variables: string[]
  categoria: string | null
  idioma: string | null
  estado: string
  meta_nombre: string | null
  motivo_rechazo: string | null
}

export type VariableDisponible = { clave: string; etiqueta: string; ejemplo: string }

export const listarPlantillas = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('plantillas')
    .select('id, tipo, nombre, cuerpo, atajo, variables, categoria, idioma, estado, meta_nombre, motivo_rechazo')
    .is('archivado_en', null)
    .order('tipo')
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as Plantilla[]
})

export const variablesDe = cache(async (organizacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('variables_disponibles', { p_org: organizacionId })
  if (error) throw new Error(error.message)
  return (data ?? []) as VariableDisponible[]
})

/**
 * Las que el compositor puede usar ya.
 *
 * Solo internas. Una plantilla de WhatsApp sin aprobar por Meta no se puede
 * mandar, y ofrecerla en el desplegable sería ofrecer un envío que va a fallar.
 * Cuando exista el canal de WhatsApp, aquí entrarán también las `aprobada`.
 */
export const plantillasUsables = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('plantillas')
    .select('id, nombre, atajo, cuerpo')
    .eq('tipo', 'interna')
    .is('archivado_en', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ id: string; nombre: string; atajo: string | null; cuerpo: string }>
})

/**
 * Las de WhatsApp que ya se pueden mandar: aprobadas en Meta y emparejadas con
 * la ficha. El compositor solo las ofrece con la ventana cerrada, que es cuando
 * son la única salida.
 */
export const plantillasWhatsApp = cache(async (organizacionId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .rpc('plantillas_whatsapp_usables', { p_org: organizacionId })
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{
    id: string; nombre: string; cuerpo: string; idioma: string; categoria: string; huecos: number
  }>
})
