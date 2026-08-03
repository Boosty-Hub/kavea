import { uso } from '@/lib/panel'
import { soloStaff } from '../guardia'
import { NavAdmin } from '../nav'

export const dynamic = 'force-dynamic'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Cuánto se usa Kavea, por cliente y por mes.
 *
 * NO ES UNA MÉTRICA DE VANIDAD. Es lo que dice qué cliente se va a ir: el uso
 * cae semanas antes de que nadie lo diga en voz alta. Un cliente que pasa de 400
 * mensajes a 40 ya se fue, solo que todavía paga.
 *
 * Por eso la última columna es la variación y no el total. Un total grande y
 * cayendo es peor noticia que un total pequeño y subiendo, y una tabla de
 * totales las enseña iguales.
 */
export default async function PaginaUso() {
  await soloStaff()
  const filas = await uso(6)

  const meses = [...new Set(filas.map((f) => f.mes))].sort()
  const porOrg = new Map<string, { nombre: string; datos: Map<string, number> }>()
  for (const f of filas) {
    const e = porOrg.get(f.organization_id) ?? { nombre: f.nombre, datos: new Map() }
    e.datos.set(f.mes, Number(f.entrantes) + Number(f.salientes))
    porOrg.set(f.organization_id, e)
  }

  const filasOrg = [...porOrg.entries()].map(([id, e]) => {
    const serie = meses.map((m) => e.datos.get(m) ?? 0)
    const ultimo = serie.at(-1) ?? 0
    const previo = serie.at(-2) ?? 0
    return { id, nombre: e.nombre, serie, ultimo, previo }
  })

  return (
    <main className="pagina">
      <NavAdmin actual="uso" />
      <p className="label">Panel interno</p>
      <h1>Uso</h1>
      <p className="muted" style={{ maxWidth: 660 }}>
        Mensajes por mes, entrantes y salientes juntos. Lo que importa no es el total: es hacia
        dónde va. Un cliente que baja de 400 a 40 ya se fue, solo que todavía paga.
      </p>

      {filasOrg.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>Todavía no hay mensajes que contar.</p>
      ) : (
        <div className="tarjeta" style={{ marginTop: 24, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>Espacio</th>
                {meses.map((m) => (
                  <th key={m} style={{ ...th, textAlign: 'right' }}>{etiquetaMes(m)}</th>
                ))}
                <th style={{ ...th, textAlign: 'right' }}>Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {filasOrg.map((f) => (
                <tr key={f.id}>
                  <td style={td}>{f.nombre}</td>
                  {f.serie.map((n, i) => (
                    <td key={i} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {n || <span style={{ color: 'var(--k-text-2)' }}>—</span>}
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Tendencia ultimo={f.ultimo} previo={f.previo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function Tendencia({ ultimo, previo }: { ultimo: number; previo: number }) {
  // Sin mes anterior no hay tendencia. Inventar «+100 %» sobre cero es la forma
  // más rápida de que nadie vuelva a creerse esta columna.
  if (previo === 0) return <span style={{ color: 'var(--k-text-2)' }}>—</span>
  const pct = Math.round(((ultimo - previo) / previo) * 100)
  const cae = pct <= -30
  return (
    <span style={{ color: cae ? 'var(--k-escalada-fg)' : 'var(--k-text-2)' }}>
      {pct > 0 ? '+' : ''}{pct} %
    </span>
  )
}

function etiquetaMes(iso: string): string {
  const [a, m] = iso.split('-')
  return `${MESES[Number(m) - 1]} ${a!.slice(2)}`
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid var(--k-border)',
  fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--k-text-2)', whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '10px 16px', borderBottom: '1px solid var(--k-border)',
}
