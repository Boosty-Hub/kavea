import { espacios } from '@/lib/panel'
import { husosDisponibles } from '@/lib/conexiones'
import { soloStaff } from '../guardia'
import { NavAdmin } from '../nav'
import { Portafolio } from './panel'

export const dynamic = 'force-dynamic'

/**
 * Las cuentas del portafolio de Meta, y de cuál se hace un cliente.
 *
 * La lista NO se carga en el servidor de esta página: son varias llamadas al
 * grafo con paginación y tardan segundos. Cargarla aquí dejaría la pantalla en
 * blanco cada vez que alguien entra, incluso cuando solo venía a mirar los
 * espacios. Se pide desde el navegador, con su propio estado de carga.
 */
export default async function PaginaPortafolio() {
  await soloStaff()
  const [lista, husos] = await Promise.all([espacios(), husosDisponibles()])

  return (
    <main className="pagina">
      <NavAdmin actual="portafolio" />
      <p className="label">Panel interno</p>
      <h1>Portafolio</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        Las Páginas asignadas al Business Manager de Boosty. Desde aquí se le crea el espacio a
        un cliente y se le conecta su Página: no hace falta que el cliente pase por ningún
        diálogo de Meta, porque el activo ya está asignado.
      </p>

      <Portafolio
        espacios={lista.map((e) => ({ id: e.organization_id, nombre: e.nombre, slug: e.slug }))}
        husos={husos}
      />
    </main>
  )
}
