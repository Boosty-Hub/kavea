import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { listarTarjetas, contarPorEstado, type FilaBandeja } from '@/lib/bandeja'
import { ESTADOS, etiquetaCanal, colorCanal, haceCuanto, calcularVentana, type Estado } from '@/lib/ventana'
import { Refrescador } from './refrescador'
import { Buscador } from './buscador'
import { Notificaciones } from '../notificaciones'
import { misNotificaciones, sinLeer } from '@/lib/agenda'

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

  // El huso es el de la ORGANIZACIÓN, y baja por props a todo lo que pinte una
  // hora. Ni el del servidor —que en Netlify es UTC— ni el del navegador: eran
  // dos relojes distintos en la misma pantalla. Ver `lib/fechas.ts`.
  const huso = org.zona_horaria ?? HUSO_POR_DEFECTO

  const sp = await searchParams
  const estado = sp.estado ?? 'todas'

  const [tarjetas, conteos, avisos, pendientes] = await Promise.all([
    listarTarjetas({ estado, canal: sp.canal }),
    contarPorEstado(),
    misNotificaciones(),
    sinLeer(),
  ])

  return (
    <div className="bandeja">
      <Refrescador organizationId={org.id} />

      <section className="bandeja__lista" aria-label="Conversaciones">
        <header className="bandeja__cabecera">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p className="label">{org.nombre}</p>
            <span style={{ fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Link href="/embudo" style={{ color: 'var(--k-text-2)' }}>Embudo</Link>
              <Link href="/agenda" style={{ color: 'var(--k-text-2)' }}>Agenda</Link>
              <Link href="/ajustes/campos" style={{ color: 'var(--k-text-2)' }}>Ajustes</Link>
              <Notificaciones iniciales={avisos} sinLeerInicial={pendientes} organizacionId={org.id} huso={huso} />
            </span>
          </div>
          <h1 style={{ fontSize: 22, marginTop: 4 }}>Bandeja</h1>

          <Buscador huso={huso} />

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
          {tarjetas.length === 0 ? (
            <EstadoVacio estado={estado} />
          ) : (
            tarjetas.map((t) => <Fila key={t.id} t={t} huso={huso} />)
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

function Fila({ t, huso }: { t: FilaBandeja; huso: string }) {
  const e = ESTADOS[t.estado as Estado] ?? ESTADOS.nueva
  const nombre = t.titulo ?? t.contacts?.nombre ?? t.contacts?.username ?? 'Contacto sin nombre'
  const canales = t.conversations ?? []

  // La ventana de la tarjeta es la MÁS HOLGADA de sus canales: si por alguno se
  // puede responder, el asunto no está bloqueado. Avisar de "fuera de ventana"
  // teniendo Messenger abierto haría que el operador no lo intentara.
  const ventanas = canales.map((c) => calcularVentana(c.last_incoming_at))
  const alguna = ventanas.find((v) => v.clase === 'abierta')
  const peor = ventanas.find((v) => v.clase === 'cerrada')

  return (
    <Link href={`/bandeja/${t.id}`} className="fila">
      <div className="fila__alto">
        <span className="fila__nombre">{nombre}</span>
        <span className="fila__cuando">{haceCuanto(t.last_message_at, huso)}</span>
      </div>

      <p className="fila__preview">
        {t.preview_emisor && t.preview_emisor !== 'contacto' ? (
          <span style={{ color: 'var(--k-text-2)' }}>
            {t.preview_emisor === 'agente' ? 'Agente: ' : 'Tú: '}
          </span>
        ) : null}
        {t.preview_texto ?? 'Sin mensajes'}
      </p>

      <div className="fila__pie">
        {/* El color nunca comunica solo: cada píldora lleva su etiqueta de texto.
            Hay gente daltónica en cualquier base de usuarios. */}
        <span className="pildora" style={{ background: e.bg, color: e.fg }}>
          <span className="pildora__punto" style={{ background: e.punto }} aria-hidden="true" />
          {e.etiqueta}
        </span>

        {canales.map((c) => (
          <span
            key={c.canal}
            className="pildora"
            style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}
          >
            <span className="pildora__punto" style={{ background: colorCanal(c.canal) }} aria-hidden="true" />
            {etiquetaCanal(c.canal)}
          </span>
        ))}

        {!alguna && peor ? (
          <span
            className="pildora"
            style={{ background: 'var(--k-escalada-bg)', color: 'var(--k-escalada-fg)' }}
            title={peor.detalle}
          >
            {peor.etiqueta}
          </span>
        ) : null}

        {t.no_leidos > 0 ? (
          <span className="sinleer" aria-label={`${t.no_leidos} sin leer`}>
            {t.no_leidos}
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
