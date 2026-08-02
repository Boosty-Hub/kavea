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

  return (
    <main className="pagina">
      <p className="label">Organización</p>
      <h1>{org.nombre}</h1>
      <p className="muted">
        Sesión iniciada como {usuario.email}. Estás en <code>{org.slug}</code>.
      </p>

      <div className="tarjeta" style={{ marginTop: 32 }}>
        <h2>Cimientos en pie</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          El aislamiento entre organizaciones lo impone la base de datos, no esta pantalla. La
          bandeja llega en el bloque 3, cuando haya ingesta que la alimente.
        </p>
      </div>
    </main>
  )
}
