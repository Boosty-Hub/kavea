import { notFound } from 'next/navigation'
import { crearClienteServicio } from '@/lib/supabase/servicio'
import { superficieActual } from '@/lib/organizacion'
import { Aceptar } from './aceptar'

export const dynamic = 'force-dynamic'

/**
 * La pantalla de invitación.
 *
 * Es la única del producto que se abre SIN sesión, porque quien llega todavía
 * no tiene cuenta. El token es la autorización, y se valida aquí en el servidor
 * antes de pintar nada: así un enlace caducado dice que caducó en vez de
 * enseñar un formulario que va a fallar al enviarlo.
 *
 * El correo se muestra pero no se puede editar. Sale de la invitación: si lo
 * eligiera quien acepta, cualquiera con un enlace válido se daría de alta con
 * el correo de un compañero.
 */
export default async function Invitacion({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()

  const { token } = await params

  const admin = crearClienteServicio()
  const { data, error } = await admin.rpc('invitacion_por_token', { p_token: token })

  /**
   * «No la encuentro» y «no puedo consultar» NO son lo mismo.
   *
   * Al principio esta página trataba las dos igual, y una llamada que fallaba
   * porque el esquema `private` no está expuesto por PostgREST se mostraba como
   * «esta invitación ya no vale». Un fallo de infraestructura disfrazado de
   * invitación caducada: quien lo recibiera pediría otro enlace, que también
   * fallaría, y nadie miraría el sitio correcto.
   */
  if (error) {
    return (
      <main className="pagina" style={{ maxWidth: 460 }}>
        <p className="label">Kavea</p>
        <h1 style={{ marginBlock: '12px 16px' }}>Ahora mismo no podemos comprobarlo</h1>
        <p style={{ color: 'var(--k-text-2)' }}>
          Tu invitación puede estar perfectamente. Es un fallo nuestro. Vuelve a intentarlo en
          un minuto y, si sigue igual, escribe a support@kavea.ai.
        </p>
      </main>
    )
  }

  const inv = (data as Array<{ correo: string; rol: string; organizacion: string }> | null)?.[0]

  if (!inv) {
    return (
      <main className="pagina" style={{ maxWidth: 460 }}>
        <p className="label">Kavea</p>
        <h1 style={{ marginBlock: '12px 16px' }}>Esta invitación ya no vale</h1>
        <p style={{ color: 'var(--k-text-2)' }}>
          Puede que haya caducado —duran siete días—, que ya se haya usado o que quien te
          invitó la haya revocado. Pídele que te mande otra.
        </p>
      </main>
    )
  }

  const rol = inv.rol === 'owner' ? 'propietario'
    : inv.rol === 'admin' ? 'administrador' : 'agente'

  return (
    <main className="pagina" style={{ maxWidth: 460 }}>
      <p className="label">Kavea</p>
      <h1 style={{ marginBlock: '12px 8px' }}>Te han invitado a {inv.organizacion}</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0 }}>
        Entrarás como <strong>{rol}</strong> con el correo <strong>{inv.correo}</strong>.
      </p>

      <Aceptar token={token} correo={inv.correo} />
    </main>
  )
}
