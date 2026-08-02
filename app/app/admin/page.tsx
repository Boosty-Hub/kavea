import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { esStaff, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export const dynamic = 'force-dynamic'

/**
 * Panel interno de Boosty.
 *
 * La comprobación es de SERVIDOR: desactivar JavaScript no la elude. Y quien no
 * es staff recibe 404, no 403: un 403 confirmaría que la ruta existe.
 *
 * Lo que ve el staff en esta fase: la lista de organizaciones con sus
 * metadatos, gracias a la política `organizations_staff_select`. Nada de
 * contenido de conversaciones — para eso hace falta un grant de break-glass con
 * motivo escrito, que caduca solo y queda registrado.
 */
export default async function PanelInterno() {
  const superficie = (await headers()).get('x-kavea-superficie')
  if (superficie !== 'admin') notFound()

  const usuario = await usuarioActual()
  if (!usuario) notFound()

  if (!(await esStaff())) notFound()

  const supabase = await crearClienteServidor()
  const { data: organizaciones } = await supabase
    .from('organizations')
    .select('id, slug, nombre, created_at')
    .order('created_at', { ascending: true })

  return (
    <main className="pagina">
      <p className="label">Panel interno</p>
      <h1>Organizaciones</h1>
      <p className="muted">
        Metadatos. El contenido de las conversaciones requiere un acceso temporal con motivo
        declarado, que caduca solo y queda registrado.
      </p>

      <div className="tarjeta" style={{ marginTop: 32, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={celdaCabecera}>Nombre</th>
              <th style={celdaCabecera}>Subdominio</th>
              <th style={celdaCabecera}>Alta</th>
            </tr>
          </thead>
          <tbody>
            {(organizaciones ?? []).map((o) => (
              <tr key={o.id}>
                <td style={celda}>{o.nombre}</td>
                <td style={celda}><code>{o.slug}</code></td>
                <td style={{ ...celda, color: 'var(--k-text-2)' }}>
                  {new Date(o.created_at).toLocaleDateString('es')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const celdaCabecera: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 24px',
  borderBottom: '1px solid var(--k-border)',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--k-text-2)',
}

const celda: React.CSSProperties = {
  padding: '12px 24px',
  borderBottom: '1px solid var(--k-border)',
}
