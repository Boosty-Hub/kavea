import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { listarEmbudos, columnasDe, tarjetasDe } from '@/lib/embudo'
import { Tablero } from './tablero'
import { Refrescador } from '../bandeja/refrescador'

export const dynamic = 'force-dynamic'

export default async function Embudo({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const embudos = await listarEmbudos()
  const sp = await searchParams
  const actual = embudos.find((e) => e.id === sp.e) ?? embudos.find((e) => e.es_predeterminado) ?? embudos[0]

  if (!actual) {
    return (
      <main className="pagina">
        <Barra org={org.nombre} />
        <div className="vacio" style={{ margin: '80px auto' }}>
          <h2>Todavía no hay ningún embudo</h2>
          <p>
            Un embudo son las etapas por las que pasa un asunto: un proceso de venta, uno de
            cobro. Se crea en <Link href="/ajustes/embudos">Ajustes → Embudos</Link>.
          </p>
        </div>
      </main>
    )
  }

  const [columnas, tarjetas] = await Promise.all([
    columnasDe(actual.id),
    tarjetasDe(actual.id),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <Refrescador organizationId={org.id} />
      <Barra org={org.nombre} />

      <div className="barra" style={{ borderBottom: '1px solid var(--k-border)', paddingBlock: 12 }}>
        {embudos.length > 1 ? (
          <nav className="barra__nav" aria-label="Embudo">
            {embudos.map((e) => (
              <Link key={e.id} href={`/embudo?e=${e.id}`} aria-current={e.id === actual.id}>
                {e.nombre}
              </Link>
            ))}
          </nav>
        ) : (
          <h1 style={{ fontSize: 18 }}>{actual.nombre}</h1>
        )}

        <span style={{ fontSize: 13, color: 'var(--k-text-2)', marginLeft: 'auto' }}>
          {tarjetas.length} {tarjetas.length === 1 ? 'tarjeta abierta' : 'tarjetas abiertas'}
        </span>

        {/* Un tablero de más de ocho columnas deja de leerse de un vistazo. No se
            impide por código, pero se dice. */}
        {columnas.length > 8 ? (
          <span style={{ fontSize: 12, color: 'var(--k-esperando-fg)' }}>
            {columnas.length} etapas: a partir de ocho el tablero deja de leerse de un vistazo
          </span>
        ) : null}
      </div>

      <Tablero columnas={columnas} tarjetas={tarjetas} />
    </div>
  )
}

function Barra({ org }: { org: string }) {
  return (
    <div className="barra">
      <p className="label" style={{ margin: 0 }}>{org}</p>
      <nav className="barra__nav" aria-label="Secciones">
        <Link href="/bandeja">Bandeja</Link>
        <Link href="/embudo" aria-current>Embudo</Link>
      </nav>
      <Link href="/ajustes/campos" style={{ fontSize: 13, color: 'var(--k-text-2)', marginLeft: 'auto' }}>
        Ajustes
      </Link>
    </div>
  )
}
