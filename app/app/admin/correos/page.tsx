import { listar, sincronizar, type Resultado } from '@/lib/correos'
import { soloStaff } from '../guardia'
import { NavAdmin } from '../nav'
import { Bandeja } from './bandeja'

export const dynamic = 'force-dynamic'

/**
 * El correo de kavea.ai, dentro de Kavea.
 *
 * `support@kavea.ai` está publicado en la política de privacidad, en los
 * términos y en la página de eliminación de datos. Meta rastrea esas páginas, y
 * una dirección publicada que nadie lee es peor que no publicarla.
 *
 * SE SINCRONIZA AL ABRIR, y está razonado en la migración 0061: Resend guarda
 * todo el histórico y lo sirve por API, así que no hay nada que perder por no
 * estar escuchando con un webhook.
 *
 * SI LA SINCRONIZACIÓN FALLA, LA BANDEJA SE PINTA IGUAL. Un fallo de Resend no
 * puede dejar sin ver los correos que ya están guardados: se muestra lo que hay
 * y se dice arriba qué falló. Una pantalla en blanco con un error se lee como
 * «no hay correos», que es mentira.
 */
export default async function PaginaCorreos() {
  await soloStaff()

  let sincro: Resultado | null = null
  let fallo: string | null = null
  try {
    sincro = await sincronizar()
  } catch (e) {
    fallo = (e as Error).message
  }

  const correos = await listar()

  return (
    <main className="pagina">
      <NavAdmin actual="correos" />

      <h1>Correo</h1>
      <p className="muted">
        Todo lo que entra y sale por <strong>kavea.ai</strong>. El MX captura el dominio entero, así
        que aquí caen también <code>no-reply@</code> y cualquier otro buzón.
      </p>

      {fallo ? (
        <p className="error" role="alert" style={{ marginTop: 16 }}>
          No se pudo sincronizar con Resend: {fallo}. Abajo está lo que ya estaba guardado.
        </p>
      ) : null}

      {sincro && (sincro.nuevos > 0 || sincro.problemas.length > 0 || sincro.hayMas) ? (
        <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          {sincro.nuevos > 0 ? (
            <div>
              {sincro.nuevos} correo{sincro.nuevos === 1 ? '' : 's'} nuevo
              {sincro.nuevos === 1 ? '' : 's'}
              {sincro.adjuntos > 0 ? `, ${sincro.adjuntos} adjunto${sincro.adjuntos === 1 ? '' : 's'} guardado${sincro.adjuntos === 1 ? '' : 's'}` : ''}.
            </div>
          ) : null}
          {/* Un tope silencioso se lee como «esto es todo». Se dice. */}
          {sincro.hayMas ? (
            <div>Resend dice que hay más de 100 correos: esta sincronización trajo los 100 más recientes.</div>
          ) : null}
          {sincro.problemas.map((p) => (
            <div key={p} style={{ color: 'var(--k-escalada-fg)' }}>{p}</div>
          ))}
        </div>
      ) : null}

      <Bandeja correos={correos} />
    </main>
  )
}
