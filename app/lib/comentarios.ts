import 'server-only'

import { cache } from 'react'
import { crearClienteServidor } from './supabase/servidor'

/**
 * Los comentarios públicos de Instagram y Facebook.
 *
 * CAMINO APARTE DE LA BANDEJA, y no por comodidad. Un comentario no tiene
 * ventana de 24 h, no pertenece a ninguna conversación y llega con `comment_id`
 * en vez de PSID o IGSID. Pero la razón de fondo es de privacidad: un mensaje
 * directo es privado entre dos y un comentario lo ve cualquiera. Responder en
 * público con algo que el contacto dijo en privado es una fuga, así que las dos
 * cosas ni comparten tabla ni comparten pantalla.
 *
 * La lista la sirve RLS: `comentarios_lee_miembro` filtra por organización y
 * aquí no se repite la condición a mano.
 */

export type Comentario = {
  id: string
  canal: string
  comment_id: string
  parent_id: string | null
  post_id: string | null
  autor_username: string | null
  texto: string | null
  estado: 'nuevo' | 'respondido' | 'ignorado'
  oculto: boolean
  respondido_en: string | null
  created_at: string
}

export const listarComentarios = cache(async (estado?: string): Promise<Comentario[]> => {
  const supabase = await crearClienteServidor()

  let c = supabase
    .from('comentarios')
    .select(
      'id, canal, comment_id, parent_id, post_id, autor_username, texto, ' +
      'estado, oculto, respondido_en, created_at',
    )
    // Los nuevos primero, que es el orden en que hay que atenderlos. Es también
    // el orden del índice `comentarios_bandeja_idx`.
    .order('created_at', { ascending: false })
    .limit(100)

  if (estado) c = c.eq('estado', estado)

  const { data } = await c
  return (data ?? []) as unknown as Comentario[]
})

export const contarComentarios = cache(async (): Promise<Record<string, number>> => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('comentarios').select('estado')
  const n: Record<string, number> = { nuevo: 0, respondido: 0, ignorado: 0 }
  for (const f of (data ?? []) as Array<{ estado: string }>) {
    n[f.estado] = (n[f.estado] ?? 0) + 1
  }
  return n
})
