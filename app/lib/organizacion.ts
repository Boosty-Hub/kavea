import { cache } from 'react'
import { headers } from 'next/headers'
import { crearClienteServidor } from './supabase/servidor'
import { slugDesdeHost, superficieDesdeHost, type Superficie } from './dominio'

export type Organizacion = {
  id: string
  slug: string
  nombre: string
}

/** La superficie de la petición, derivada del Host. */
export const superficieActual = cache(async (): Promise<Superficie> => {
  return superficieDesdeHost((await headers()).get('host'))
})

/**
 * Resuelve la organización del subdominio, bajo RLS.
 *
 * Si el usuario no es miembro, RLS devuelve cero filas y esto devuelve null: la
 * página responde 404 y no confirma que la organización exista, que sería lo
 * que haría un 403.
 *
 * `cache` de React memoriza por petición, así que llamarla en el layout y en la
 * página no hace dos consultas.
 */
export const organizacionActual = cache(async (): Promise<Organizacion | null> => {
  const slug = slugDesdeHost((await headers()).get('host'))
  if (!slug) return null

  const supabase = await crearClienteServidor()
  const { data } = await supabase
    .from('organizations')
    .select('id, slug, nombre')
    .eq('slug', slug)
    .maybeSingle()

  return data
})

/**
 * Regla que rige todas las fases siguientes:
 *
 * NINGUNA consulta de lectura filtra por organization_id desde el cliente.
 * El filtro lo pone RLS. El organization_id resuelto sirve para ESCRIBIR, donde
 * `with check` lo valida, no para leer. Añadir `.eq('organization_id', id)` a
 * una lectura no aporta seguridad y da la falsa impresión de que sí.
 */

export const esStaff = cache(async (): Promise<boolean> => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.rpc('es_staff')
  return data === true
})

export const usuarioActual = cache(async () => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub as string, email: claims.email as string | undefined }
})
