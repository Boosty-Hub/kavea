import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { listarConversaciones, contarPorEstado, type FilaBandeja } from '@/lib/bandeja'
import { ESTADOS, CANALES, haceCuanto, calcularVentana, type Estado } from '@/lib/ventana'
import { Refrescador } from './refrescador'

export const dynamic = 'force-dynamic'

const FILTROS: Array<{ clave: string; etiqueta: string }> = [
  { clave: 'todas', etiqueta: 'Abiertas' },
  { clave: 'nueva', etiqueta: 'Nuevas' },
  { clave: 'en_curso', etiqueta: 'En curso' },
  { clave: 'esperando', etiqueta: 'Esperando' },
  { clave: 'cerrada', etiqueta: 'Cerradas' },
]

export default async function Bandeja({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; canal?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const sp = await searchParams
  const estado = sp.estado ?? 'todas'

  const [conversaciones, conteos] = await Promise.all([
    listarConversaciones({ estado, canal: sp.canal }),
    contarPorEstado(),
  ])

  return (
    <div className="bandeja">
      <Refrescador organizationId={org.id} />

      <section className="bandeja__lista" aria-label="Conversaciones">
        <header className="bandeja__cabecera">
          <p className="label">{org.nombre}</p>
          <h1 style={{ fontSize: 22, marginTop: 4 }}>Bandeja</h1>

          <nav className="filtros" aria-label="Filtrar por estado">
            {FILTROS.map((f) => (
              <Link
                key={f.clave}
                href={`/bandeja?estado=${f.clave}`}
                className="filtro"
                aria-current={estado === f.clave}
              >
                {f.etiqueta}
                {conteos[f.clave] ? <span className="filtro__n">{conteos[f.clave]}</span> : null}
              </Link>
            ))}
          </nav>
        </header>

        <div className="lista">
          {conversaciones.length === 0 ? (
            <EstadoVacio estado={estado} />
          ) : (
            conversaciones.map((c) => <Fila key={c.id} c={c} />)
          )}
        </div>
      </section>

      <section className="bandeja__hilo">
        <div className="vacio">
          <h2>Elige una conversación</h2>
          <p>Los mensajes, lo que ocurre en Meta y lo que hace el equipo se ven en un solo hilo.</p>
        </div>
      </section>
    </div>
  )
}

function Fila({ c }: { c: FilaBandeja }) {
  const e = ESTADOS[c.estado as Estado] ?? ESTADOS.nueva
  const v = calcularVentana(c.last_incoming_at)
  const nombre = c.contacts?.nombre ?? c.contacts?.username ?? 'Contacto sin nombre'

  return (
    <Link href={`/bandeja/${c.id}`} className="fila">
      <div className="fila__alto">
        <span className="fila__nombre">{nombre}</span>
        <span className="fila__cuando">{haceCuanto(c.last_message_at)}</span>
      </div>

      <p className="fila__preview">
        {c.preview_emisor && c.preview_emisor !== 'contacto' ? (
          <span style={{ color: 'var(--k-text-3)' }}>
            {c.preview_emisor === 'agente' ? 'Agente: ' : 'Tú: '}
          </span>
        ) : null}
        {c.preview_texto ?? 'Sin mensajes'}
      </p>

      <div className="fila__pie">
        {/* El color nunca comunica solo: cada píldora lleva su etiqueta de texto.
            Hay gente daltónica en cualquier base de usuarios. */}
        <span className="pildora" style={{ background: e.bg, color: e.fg }}>
          <span className="pildora__punto" style={{ background: e.punto }} aria-hidden="true" />
          {e.etiqueta}
        </span>

        <span className="pildora" style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}>
          {CANALES[c.canal] ?? c.canal}
        </span>

        {v.clase !== 'abierta' && v.clase !== 'sin_contacto' ? (
          <span
            className="pildora"
            style={{ background: 'var(--k-escalada-bg)', color: 'var(--k-escalada-fg)' }}
            title={v.detalle}
          >
            {v.etiqueta}
          </span>
        ) : null}

        {c.no_leidos > 0 ? (
          <span className="sinleer" aria-label={`${c.no_leidos} sin leer`}>
            {c.no_leidos}
          </span>
        ) : null}
      </div>
    </Link>
  )
}

/**
 * Estado vacío como invitación, no como disculpa.
 *
 * Y el aviso del histórico no es opcional: la Conversations API de Meta solo
 * devuelve los 20 mensajes más recientes y el histórico completo NO es
 * recuperable. La bandeja de un cliente nuevo arranca vacía y eso hay que
 * decirlo aquí, no dejar que lo descubra pensando que algo falla.
 */
function EstadoVacio({ estado }: { estado: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--k-text-2)' }}>
      {estado === 'cerrada' ? (
        <p>No hay conversaciones cerradas.</p>
      ) : (
        <>
          <p style={{ color: 'var(--k-text)' }}>Todavía no hay conversaciones.</p>
          <p style={{ fontSize: 13 }}>
            Aparecerán aquí en cuanto alguien escriba por un canal conectado. El histórico
            anterior a la conexión no se puede recuperar: Meta no lo entrega.
          </p>
        </>
      )}
    </div>
  )
}
