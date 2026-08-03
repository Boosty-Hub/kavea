import { solicitudes } from '@/lib/panel'
import { soloStaff } from '../guardia'
import { NavAdmin } from '../nav'
import { Solicitudes } from './lista'

export const dynamic = 'force-dynamic'

/**
 * Quién ha pedido una demo desde kavea.ai.
 *
 * Es la única puerta por la que entra alguien de fuera, y por eso vive aquí y no
 * en un correo: un formulario que acaba en una bandeja de entrada se pierde en
 * cuanto hay tres, y nadie sabe cuál se contestó.
 */
export default async function PaginaSolicitudes() {
  await soloStaff()
  const lista = await solicitudes()
  const nuevas = lista.filter((s) => s.estado === 'nueva')

  return (
    <main className="pagina">
      <NavAdmin actual="solicitudes" />
      <p className="label">Panel interno</p>
      <h1>Solicitudes</h1>
      <p className="muted" style={{ maxWidth: 660 }}>
        {nuevas.length === 0
          ? 'Ninguna sin atender.'
          : `${nuevas.length} sin atender.`}
        {' '}Las más viejas primero: una petición de hace tres días es más urgente que la de hace
        diez minutos.
      </p>

      <Solicitudes lista={lista} />
    </main>
  )
}
