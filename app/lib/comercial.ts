import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

/**
 * Archivos y documentos comerciales.
 *
 * La asimetría entre unos y otros es deliberada y está razonada en
 * docs/fases/03d-fase-ficha.md §1:
 *
 *   · Los DOCUMENTOS cuelgan de la persona. Un cliente que compra tres veces
 *     tiene tres asuntos y un solo historial.
 *   · Los ARCHIVOS pueden colgar de la tarjeta, de la persona o de nadie —la
 *     biblioteca de la organización—, y las tres cosas significan algo distinto.
 */

export type Archivo = {
  id: string
  nombre: string
  storage_path: string
  content_type: string | null
  bytes: number
  enviable: boolean
  motivo_no_enviable: string | null
  contacto_id: string | null
  tarjeta_id: string | null
  created_at: string
}

export type Documento = {
  id: string
  tipo: 'presupuesto' | 'pedido' | 'factura'
  numero: string | null
  concepto: string
  total: number
  moneda: string
  estado: string
  emitido_en: string
  vence_en: string | null
  pagado_en: string | null
  tarjeta_id: string | null
  archivo_id: string | null
}

export type ResumenComercial = {
  moneda: string
  comprado: number
  pendiente: number
  vencido: number
  presupuestos_abiertos: number
  compras: number
}

const CAMPOS_ARCHIVO =
  'id, nombre, storage_path, content_type, bytes, enviable, motivo_no_enviable, ' +
  'contacto_id, tarjeta_id, created_at'

/**
 * Los archivos que este operador puede mandar en esta conversación.
 *
 * Tres orígenes en una sola consulta: los de la tarjeta, los de la persona y la
 * biblioteca de la organización. Se piden juntos porque en la pantalla van
 * juntos: quien busca el catálogo no quiere saber en qué ámbito se guardó.
 */
export const archivosDe = cache(async (tarjetaId: string, contactoId: string | null) => {
  const supabase = await crearClienteServidor()
  const clausulas = [`tarjeta_id.eq.${tarjetaId}`, 'and(contacto_id.is.null,tarjeta_id.is.null)']
  if (contactoId) clausulas.push(`contacto_id.eq.${contactoId}`)

  const { data, error } = await supabase
    .from('archivos')
    .select(CAMPOS_ARCHIVO)
    .or(clausulas.join(','))
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Archivo[]
})

export const documentosDe = cache(async (contactoId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('documentos')
    .select('id, tipo, numero, concepto, total, moneda, estado, emitido_en, vence_en, pagado_en, tarjeta_id, archivo_id')
    .eq('contacto_id', contactoId)
    .order('emitido_en', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Documento[]
})

export const resumenDe = cache(async (contactoId: string) => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('resumen_comercial')
    .select('moneda, comprado, pendiente, vencido, presupuestos_abiertos, compras')
    .eq('contacto_id', contactoId)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ResumenComercial[]
})
