import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { conexionesDe } from '@/lib/conexiones'
import { LogoCanal } from '@/lib/logos-canal'

export const dynamic = 'force-dynamic'

/**
 * Elegir de qué cuenta se quiere ver el contenido.
 *
 * ESTE PASO NO ES DECORATIVO. Meta lo pide con esas palabras para
 * `pages_read_engagement` —«(1) Page selection, (2) the retrieval of Page
 * content…, (3) the rendered results in your app's UI with the Page identity
 * visibly displayed»— y los ocho permisos se rechazaron el 7-ago porque los
 * vídeos no enseñaban justo esta clase de recorrido. Aquí se elige; en el
 * detalle se ve, con la identidad delante.
 *
 * Y sirve para trabajar, no solo para grabar: quien atiende una conversación
 * suele necesitar ver qué publicó el negocio esta semana para entender de qué le
 * están hablando.
 */
export default async function PaginaContenido() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  // Solo las vivas: el contenido de una conexión desconectada no se puede leer
  // —no hay token— y ofrecerlo sería un enlace que falla.
  const conexiones = (await conexionesDe(org.id)).filter((c) => c.estado !== 'disconnected')
  const conPagina = conexiones.filter((c) => c.page_id)

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <p className="label">{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Contenido</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
        Lo que estas cuentas han publicado, leído en directo desde Meta. Elige una para ver su
        perfil y sus últimas publicaciones.
      </p>

      {conPagina.length === 0 ? (
        <p className="ficha__vacia" style={{ marginTop: 24 }}>
          No hay ninguna Página conectada.{' '}
          <Link href="/ajustes/canales">Conectar una</Link>.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'grid', gap: 10 }}>
          {conPagina.map((c) => (
            <li key={c.meta_connection_id} className="tarjeta" style={{ padding: 0 }}>
              <Link
                href={`/contenido/${c.meta_connection_id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', textDecoration: 'none', color: 'inherit',
                }}
              >
                <span style={{ display: 'grid', gap: 3, minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{c.page_name ?? c.page_id}</span>
                  <span
                    style={{
                      fontSize: 13, color: 'var(--k-text-2)',
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <LogoCanal canal="messenger" size={14} /> Página
                    </span>
                    {c.ig_username ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <LogoCanal canal="instagram" size={14} /> @{c.ig_username}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span aria-hidden="true" style={{ color: 'var(--k-text-2)' }}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
