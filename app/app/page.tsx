import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

export default async function Inicio() {
  const superficie = await superficieActual()

  // Sin subdominio de organización no hay nada que mostrar: es el dominio
  // desnudo, la URL del proveedor o un host que no reconocemos.
  if (superficie === 'admin') redirect('/admin')
  if (superficie !== 'app') notFound()

  const usuario = await usuarioActual()
  if (!usuario) redirect('/entrar')

  // RLS decide. Si el usuario no es miembro, esto es null y respondemos 404 en
  // vez de un 403, que confirmaría que la organización existe.
  const org = await organizacionActual()
  if (!org) notFound()

  // La bandeja es la pantalla del producto. La raíz lleva ahí.
  redirect('/bandeja')
}
