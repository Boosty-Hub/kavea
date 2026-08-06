import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { contarComentarios, listarComentarios } from '@/lib/comentarios'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { PanelComentarios } from './panel'

export const dynamic = 'force-dynamic'

const FILTROS = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'nuevo', etiqueta: 'Nuevos' },
  { valor: 'respondido', etiqueta: 'Respondidos' },
  { valor: 'ignorado', etiqueta: 'Ignorados' },
] as const

export default async function PaginaComentarios({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const { estado } = await searchParams
  const activo = FILTROS.some((f) => f.valor === estado) ? (estado ?? '') : ''

  const [comentarios, conteos] = await Promise.all([
    listarComentarios(activo || undefined),
    contarComentarios(),
  ])

  return (
    <main className="pagina" style={{ maxWidth: 820 }}>
      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Comentarios</h1>

      {/*
        ESTE PÁRRAFO ES LA MITAD DE LA PANTALLA.

        Quien atiende viene de la bandeja, donde todo es privado, y aquí el gesto
        es el mismo: una caja y un botón. La diferencia —que esto lo lee
        cualquiera— no se ve en ninguna parte si no se dice.
      */}
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
        Lo que la gente escribe <strong>en público</strong> bajo las publicaciones de las
        cuentas conectadas. No son mensajes: no hay ventana de 24 horas y lo que respondas
        aquí lo lee cualquiera. Si hace falta un dato que el cliente dio en privado, síguelo
        por la <Link href="/bandeja">bandeja</Link>.
      </p>

      <nav
        aria-label="Filtrar comentarios"
        style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}
      >
        {FILTROS.map((f) => {
          const n = f.valor ? conteos[f.valor] ?? 0 : Object.values(conteos).reduce((a, b) => a + b, 0)
          return (
            <Link
              key={f.valor}
              href={f.valor ? `/comentarios?estado=${f.valor}` : '/comentarios'}
              className="canal-chip"
              aria-current={activo === f.valor}
            >
              {f.etiqueta}
              <span style={{ color: 'var(--k-text-2)' }}>{n}</span>
            </Link>
          )
        })}
      </nav>

      <PanelComentarios
        comentarios={comentarios}
        huso={org.zona_horaria ?? HUSO_POR_DEFECTO}
      />
    </main>
  )
}
