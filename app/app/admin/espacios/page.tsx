import { fecha, fechaHora } from '@/lib/fechas'
import { espacios, conexiones } from '@/lib/panel'
import { Conexiones } from './conexiones'
import { soloStaff } from '../guardia'
import { NavAdmin } from '../nav'

export const dynamic = 'force-dynamic'

/**
 * Los espacios, con lo que de verdad los distingue.
 *
 * Antes esta pantalla era nombre, subdominio y fecha de alta. Con eso no se
 * responde ninguna pregunta: todas las filas se parecen. Lo que distingue a un
 * cliente de otro es si tiene canales, si tiene gente y si hay algo pasando.
 *
 * `último mensaje` es la columna que más dice. Un espacio con tres canales y sin
 * un mensaje en dos semanas es un cliente que se está yendo, y eso no sale en
 * ninguna otra parte.
 */
export default async function Espacios() {
  await soloStaff()
  const [filas, conex] = await Promise.all([espacios(), conexiones()])

  return (
    <main className="pagina">
      <NavAdmin actual="espacios" />
      <p className="label">Panel interno</p>
      <h1>Espacios</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        {filas.length} {filas.length === 1 ? 'espacio' : 'espacios'}. Para crear uno nuevo y
        conectarle una Página, en <strong>Portafolio</strong>.
      </p>

      <div className="tarjeta" style={{ marginTop: 24, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={th}>Espacio</th>
              <th style={th}>Canales</th>
              <th style={th}>Equipo</th>
              <th style={th}>Abiertas</th>
              <th style={th}>Último mensaje</th>
              <th style={th}>Alta</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => (
              <tr key={e.organization_id} id={e.slug}>
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{e.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                    <code>{e.slug}</code> · {e.zona_horaria ?? 'sin huso'}
                  </div>
                </td>
                <td style={td}>
                  <Conexiones lista={conex.filter((c) => c.organization_id === e.organization_id)} />
                </td>
                <td style={td}>
                  {e.personas}
                  {e.invitaciones > 0 ? (
                    <span style={{ color: 'var(--k-text-2)', fontSize: 12 }}>
                      {' '}+{e.invitaciones} sin aceptar
                    </span>
                  ) : null}
                </td>
                <td style={td}>{e.abiertas || <Vacio>0</Vacio>}</td>
                <td style={{ ...td, color: 'var(--k-text-2)' }}>
                  {e.ultimo_mensaje ? fechaHora(e.ultimo_mensaje, 'UTC') : <Vacio>nunca</Vacio>}
                </td>
                <td style={{ ...td, color: 'var(--k-text-2)' }}>{fecha(e.creada_en, 'UTC')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        Las horas van en UTC. Cada espacio tiene el suyo y aquí conviven varios.
      </p>
    </main>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--k-text-2)' }}>{children}</span>
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '12px 20px', borderBottom: '1px solid var(--k-border)',
  fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--k-text-2)', whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '12px 20px', borderBottom: '1px solid var(--k-border)', verticalAlign: 'top',
}
