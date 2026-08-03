import 'server-only'

import { notFound, redirect } from 'next/navigation'
import { esStaff, superficieActual, usuarioActual } from '@/lib/organizacion'

/**
 * La puerta del panel interno, en un solo sitio.
 *
 * Estaba escrita a mano en la única pantalla que había. Con cinco, copiarla
 * cinco veces es garantizar que alguna se quede sin la comprobación de staff, y
 * esa es la que expone los datos de todos los clientes.
 *
 * Tres cosas, en este orden y todas de SERVIDOR:
 *
 *   1. Que sea el subdominio de admin. Las mismas rutas bajo el subdominio de un
 *      cliente no existen.
 *   2. Que haya sesión.
 *   3. Que sea staff.
 *
 * Quien no es staff recibe 404 y no 403. Un 403 confirmaría que la ruta existe,
 * y la existencia de un panel interno ya es información.
 */
export async function soloStaff(): Promise<{ email: string | undefined }> {
  if ((await superficieActual()) !== 'admin') notFound()

  const usuario = await usuarioActual()
  if (!usuario) redirect('/entrar')

  if (!(await esStaff())) notFound()

  return { email: usuario.email }
}
