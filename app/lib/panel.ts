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

/**
 * VACÍO Y ROTO NO PUEDEN VERSE IGUAL.
 *
 * La primera versión devolvía `[]` cuando la consulta fallaba, con el argumento
 * de que un error aquí «casi siempre es no eres staff». No lo era: `panel_salud`
 * tenía un `sum()` que devuelve `numeric` declarado como `bigint`, Postgres lo
 * rechazaba, y la pantalla decía «No hay espacios todavía» teniendo uno. Un
 * panel de salud que miente diciendo que todo está bien es peor que no tener
 * panel.
 *
 * Ahora el error sube. Que reviente la pantalla es lo correcto: alguien lo
 * arregla el mismo día en vez de confiar en un cero durante semanas.
 */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc(fn, args ?? {})
  if (error) throw new Error(`${fn}: ${error.message}`)
  return (data ?? []) as T[]
}

export type FilaConexion = {
  meta_connection_id: string
  organization_id: string
  page_name: string | null
  page_id: string
  ig_username: string | null
  en_verde: number
  en_rojo: number
  sin_saber: number
  bloqueada: boolean
  ultima_pasada: string | null
}

export type FilaSolicitud = {
  id: string
  nombre: string
  correo: string
  negocio: string | null
  telefono: string | null
  canales: string[]
  mensaje: string | null
  origen: string | null
  estado: string
  nota: string | null
  atendida_en: string | null
  created_at: string
}

export const salud = cache(() => rpc<FilaSalud>('panel_salud'))
export const solicitudes = cache(() => rpc<FilaSolicitud>('panel_solicitudes'))
export const conexiones = cache(() => rpc<FilaConexion>('panel_conexiones'))
export const ingesta = cache(() => rpc<FilaIngesta>('panel_ingesta'))
export const espacios = cache(() => rpc<FilaEspacio>('panel_espacios'))
export const accesos = cache(() => rpc<FilaAcceso>('panel_accesos'))
export const uso = cache((meses = 6) => rpc<FilaUso>('panel_uso', { p_meses: meses }))
