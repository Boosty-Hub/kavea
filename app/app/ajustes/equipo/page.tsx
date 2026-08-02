import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { equipoDe, invitacionesDe, puedeHacer } from '@/lib/equipo'
import { Equipo } from './editor'

export const dynamic = 'force-dynamic'

export default async function PaginaEquipo() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const [miembros, invitaciones, puedeGestionar, esDuenio] = await Promise.all([
    equipoDe(org.id),
    puedeHacer(org.id, 'equipo').then((p) => (p ? invitacionesDe(org.id) : [])),
    puedeHacer(org.id, 'equipo'),
    puedeHacer(org.id, 'conectar'),
  ])

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
        <Link href="/bandeja" style={{ color: 'var(--k-text-2)' }}>← Bandeja</Link>
        <Link href="/ajustes/campos" style={{ color: 'var(--k-text-2)' }}>Campos</Link>
        <Link href="/ajustes/embudos" style={{ color: 'var(--k-text-2)' }}>Embudos</Link>
      </div>

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Equipo</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 580 }}>
        Quién puede entrar y qué puede hacer. Un agente atiende conversaciones; un
        administrador además configura campos, embudos y plantillas; el propietario es el
        único que conecta canales.
      </p>

      <Equipo
        organizacionId={org.id}
        miembros={miembros}
        invitaciones={invitaciones}
        puedeGestionar={puedeGestionar}
        esDuenio={esDuenio}
      />
    </main>
  )
}
