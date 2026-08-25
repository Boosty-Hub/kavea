import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { HUSO_POR_DEFECTO, hora as enHuso } from '@/lib/fechas'
import { misNotificaciones, sinLeer } from '@/lib/agenda'
import { obtenerComentario, respuestasDe, type Comentario } from '@/lib/comentarios'
import { etiquetaCanal, haceCuanto } from '@/lib/ventana'
import { ListaComentarios } from '../lista'
import { ResponderComentario } from '../responder'
import { AccionesComentario } from '../acciones'
import { Refrescador } from '../../refrescador'

export const dynamic = 'force-dynamic'

const ESTADOS: Record<string, { etiqueta: string; fg: string; bg: string }> = {
  nuevo:      { etiqueta: 'Nuevo', fg: 'var(--k-curso-fg)', bg: 'var(--k-curso-bg)' },
  respondido: { etiqueta: 'Respondido', fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)' },
  ignorado:   { etiqueta: 'Ignorado', fg: 'var(--k-text-2)', bg: 'var(--k-surface-2)' },
}

/**
 * El hilo de un comentario, como un chat.
 *
 * NO comparte pantalla con la bandeja de mensajes privados, y eso es a
 * propósito: `docs` de la 0066 lo dice sin rodeos, un comentario es público y
 * un mensaje no. Lo que sí comparte es el gesto — una lista a la izquierda, un
 * hilo con burbujas a la derecha, un compositor abajo — porque para quien
 * atiende es el mismo tipo de trabajo aunque la privacidad sea distinta.
 */
export default async function HiloComentario({ params }: { params: Promise<{ id: string }> }) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const { id } = await params
  const comentario = await obtenerComentario(id)
  // RLS ya filtró: si no es de esta organización, es null.
  if (!comentario) notFound()

  const huso = org.zona_horaria ?? HUSO_POR_DEFECTO
  const [respuestas, avisos, pendientes] = await Promise.all([
    respuestasDe(comentario.comment_id),
    misNotificaciones(),
    sinLeer(),
  ])

  const e = ESTADOS[comentario.estado] ?? ESTADOS.nuevo!
  const hilo = [comentario, ...respuestas]
  const vivos = hilo.filter((c) => !c.borrado_en)
  const borrados = hilo.filter((c) => c.borrado_en)

  return (
    <div className="bandeja bandeja--hilo">
      {/* El hilo de un comentario no se refrescaba solo: el `Refrescador` estaba
          en la bandeja y en el hilo de mensajes, no aquí. Desde la 0108 los
          comentarios difunden, así que solo faltaba escuchar. */}
      <Refrescador organizationId={org.id} />
      <ListaComentarios org={org} huso={huso} avisos={avisos} pendientes={pendientes} activoId={id} />

      <section className="bandeja__hilo" aria-label="Hilo del comentario">
        <header className="hilo__cabecera">
          <div>
            <Link href="/bandeja?vista=comentarios" style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
              ← Comentarios
            </Link>
            <div style={{ marginTop: 4 }}>
              <h2 style={{ margin: 0 }}>
                {comentario.autor_username ? `@${comentario.autor_username}` : 'Sin identificar'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--k-text-2)' }}>
                {etiquetaCanal(comentario.canal)} · público
              </p>
            </div>
          </div>
          <span className="pildora" style={{ background: e.bg, color: e.fg }}>{e.etiqueta}</span>
        </header>

        <div className="hilo__cuerpo">
          <p className="traza" style={{ marginBottom: 8 }}>
            Esto es público: lo lee cualquiera que pase por la publicación. No es un mensaje
            privado y no tiene ventana de 24 h.
          </p>

          {/* Cada burbuja lleva lo que se le puede hacer. El ciclo que Meta pide
              —publicar, editar, borrar— tiene que verse sobre el comentario
              concreto, no en una barra al pie que no dice sobre cuál actúa. */}
          {vivos.map((c) => <Burbuja key={c.id} c={c} huso={huso} />)}

          {/* LOS BORRADOS SE GUARDAN PERO NO ESTORBAN. Se quedan en la base para
              que el hilo pueda contar lo que pasó, y eso sigue valiendo; lo que
              no vale es que cuatro comentarios tachados sean lo primero que se
              ve. Va en un `details` nativo: se abre sin JavaScript y sin pedirle
              una pantalla nueva a nadie. */}
          {borrados.length ? (
            <details style={{ margin: '4px 0 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--k-text-2)' }}>
                {borrados.length === 1
                  ? 'Un comentario borrado'
                  : `${borrados.length} comentarios borrados`}
              </summary>
              <div style={{ marginTop: 8 }}>
                {borrados.map((c) => <Burbuja key={c.id} c={c} huso={huso} />)}
              </div>
            </details>
          ) : null}

          {comentario.respondido_en ? (
            <p className="traza">
              Marcado como respondido · {haceCuanto(comentario.respondido_en, huso)}
            </p>
          ) : null}
        </div>

        <ResponderComentario c={comentario} />
      </section>
    </div>
  )
}

/**
 * Una burbuja del hilo.
 *
 * Se saca de la página porque ahora se pinta en dos sitios —las vivas y, dentro
 * del desplegable, las borradas— y dos copias del mismo marcado se separan el
 * día que una gana un campo.
 */
function Burbuja({
  c, huso,
}: {
  c: Comentario
  huso: string
}) {
  return (
    <div className="burbuja">
      <div
        className="burbuja__caja"
        style={c.borrado_en ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}
      >
        {c.texto ?? <em style={{ color: 'var(--k-text-2)' }}>Sin texto: solo una imagen o un sticker.</em>}
      </div>
      <div className="burbuja__meta">
        {c.propio ? 'Kavea' : c.autor_username ? `@${c.autor_username}` : 'Sin identificar'}
        {' · '}{enHuso(c.created_at, huso)}
        {c.editado_en ? ' · editado' : ''}
        {c.oculto ? ' · oculto en Meta' : ''}
        {c.borrado_en ? ` · borrado de ${etiquetaCanal(c.canal)}` : ''}
      </div>
      <AccionesComentario c={c} />
    </div>
  )
}
