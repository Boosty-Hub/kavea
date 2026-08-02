import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { tareasDelMes } from '@/lib/agenda'
import { miembrosDe } from '@/lib/bandeja'
import { Calendario } from './calendario'

export const dynamic = 'force-dynamic'

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; todos?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  const usuario = await usuarioActual()
  if (!usuario) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const sp = await searchParams

  /**
   * El mes se lee de la URL, no del estado.
   *
   * Así un enlace a «marzo» sigue siendo marzo cuando se comparte o se recarga,
   * y el refresco de tiempo real no devuelve a nadie al mes actual mientras
   * mira el siguiente.
   */
  const hoy = new Date()
  const [anio, mes] = (sp.m ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`)
    .split('-').map(Number)
  const primero = new Date(Date.UTC(anio!, (mes ?? 1) - 1, 1))
  const siguiente = new Date(Date.UTC(anio!, mes ?? 1, 1))

  // «Solo las mías» por defecto: un calendario de todo el equipo es un
  // calendario que nadie mira.
  const soloMias = sp.todos !== '1'

  const [tareas, miembros] = await Promise.all([
    tareasDelMes(primero.toISOString(), siguiente.toISOString(), soloMias ? usuario.id : undefined),
    miembrosDe(org.id),
  ])

  return (
    <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="barra">
        <p className="label" style={{ margin: 0 }}>{org.nombre}</p>
        <nav className="barra__nav" aria-label="Secciones">
          <Link href="/bandeja">Bandeja</Link>
          <Link href="/embudo">Embudo</Link>
          <Link href="/agenda" aria-current>Agenda</Link>
        </nav>
        <Link href="/ajustes/campos" style={{ fontSize: 13, color: 'var(--k-text-2)', marginLeft: 'auto' }}>
          Ajustes
        </Link>
      </div>

      <Calendario
        organizacionId={org.id}
        anio={anio!}
        mes={mes ?? 1}
        tareas={tareas}
        miembros={miembros}
        soloMias={soloMias}
        yo={usuario.id}
      />
    </main>
  )
}
