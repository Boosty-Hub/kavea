import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { conexionesDe } from '@/lib/conexiones'
import { Contenido } from './panel'

export const dynamic = 'force-dynamic'

/**
 * El contenido de una cuenta concreta.
 *
 * La conexión se busca en la lista del espacio y no por id suelto: `conexionesDe`
 * lee bajo RLS, así que un id de otro inquilino no aparece y esto responde 404.
 * Es la misma regla que el resto de la aplicación —no se confirma que algo
 * exista a quien no puede verlo— y aquí importa el doble, porque lo que hay
 * detrás es contenido de la Página de un cliente.
 */
export default async function PaginaDeContenido({
  params,
}: {
  params: Promise<{ conexion: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const { conexion } = await params
  const c = (await conexionesDe(org.id)).find((x) => x.meta_connection_id === conexion)
  if (!c || c.estado === 'disconnected') notFound()

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        <Link href="/contenido">← Contenido</Link>
      </p>
      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>{c.page_name ?? c.page_id}</h1>

      <Contenido conexion={conexion} tieneInstagram={Boolean(c.ig_username)} />
    </main>
  )
}
