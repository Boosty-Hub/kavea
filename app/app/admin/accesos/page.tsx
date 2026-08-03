import { accesos } from '@/lib/panel'
import { soloStaff } from '../guardia'
import { NavAdmin } from '../nav'
import { Accesos } from './lista'

export const dynamic = 'force-dynamic'

/**
 * Quién ha mirado datos de qué cliente.
 *
 * Los grants de break-glass existen desde la fase 0, con motivo escrito y
 * caducidad, y hasta hoy solo se veían por SQL. Una auditoría que nadie puede
 * leer no audita a nadie: es una tabla.
 */
export default async function PaginaAccesos() {
  await soloStaff()
  const lista = await accesos()
  const vigentes = lista.filter((a) => a.vigente)

  return (
    <main className="pagina">
      <NavAdmin actual="accesos" />
      <p className="label">Panel interno</p>
      <h1>Accesos</h1>
      <p className="muted" style={{ maxWidth: 660 }}>
        Cada vez que alguien de Boosty necesita ver el contenido de un cliente pide un acceso
        temporal con motivo escrito, y caduca solo. {vigentes.length === 0
          ? 'Ahora mismo no hay ninguno abierto.'
          : `Hay ${vigentes.length} abierto${vigentes.length === 1 ? '' : 's'}.`}
      </p>

      <Accesos lista={lista} />
    </main>
  )
}
