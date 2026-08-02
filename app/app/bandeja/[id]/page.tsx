import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import {
  listarConversaciones,
  contarPorEstado,
  obtenerConversacion,
  obtenerHilo,
  adjuntosDe,
  type EntradaHilo,
} from '@/lib/bandeja'
import { ESTADOS, CANALES, calcularVentana, COLOR_VENTANA, haceCuanto, type Estado } from '@/lib/ventana'
import { Refrescador } from '../refrescador'

export const dynamic = 'force-dynamic'

export default async function Hilo({ params }: { params: Promise<{ id: string }> }) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const { id } = await params
  const conv = await obtenerConversacion(id)
  // RLS ya filtró: si no es de esta organización, `conv` es null y respondemos
  // 404 en vez de un 403 que confirmaría que existe.
  if (!conv) notFound()

  const [entradas, adjuntos, lista, conteos] = await Promise.all([
    obtenerHilo(id),
    adjuntosDe(id),
    listarConversaciones({}),
    contarPorEstado(),
  ])

  const porMensaje = new Map<string, typeof adjuntos>()
  for (const a of adjuntos) {
    const l = porMensaje.get(a.message_id) ?? []
    l.push(a)
    porMensaje.set(a.message_id, l)
  }

  const e = ESTADOS[conv.estado as Estado] ?? ESTADOS.nueva
  const v = calcularVentana(conv.last_incoming_at)
  const cv = COLOR_VENTANA[v.clase]
  const nombre = conv.contacts?.nombre ?? conv.contacts?.username ?? 'Contacto sin nombre'

  return (
    <div className="bandeja bandeja--hilo">
      <Refrescador organizationId={org.id} />

      <section className="bandeja__lista" aria-label="Conversaciones">
        <header className="bandeja__cabecera">
          <p className="label">{org.nombre}</p>
          <h1 style={{ fontSize: 22, marginTop: 4 }}>Bandeja</h1>
          <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '8px 0 0' }}>
            {conteos.todas ?? 0} abiertas
          </p>
        </header>
        <div className="lista">
          {lista.map((c) => {
            const ec = ESTADOS[c.estado as Estado] ?? ESTADOS.nueva
            return (
              <Link
                key={c.id}
                href={`/bandeja/${c.id}`}
                className="fila"
                aria-current={c.id === id}
              >
                <div className="fila__alto">
                  <span className="fila__nombre">
                    {c.contacts?.nombre ?? c.contacts?.username ?? 'Contacto sin nombre'}
                  </span>
                  <span className="fila__cuando">{haceCuanto(c.last_message_at)}</span>
                </div>
                <p className="fila__preview">{c.preview_texto ?? 'Sin mensajes'}</p>
                <div className="fila__pie">
                  <span className="pildora" style={{ background: ec.bg, color: ec.fg }}>
                    <span className="pildora__punto" style={{ background: ec.punto }} aria-hidden="true" />
                    {ec.etiqueta}
                  </span>
                  {c.no_leidos > 0 ? <span className="sinleer">{c.no_leidos}</span> : null}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="bandeja__hilo" aria-label={`Conversación con ${nombre}`}>
        <header className="hilo__cabecera">
          <div>
            <Link href="/bandeja" style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
              ← Bandeja
            </Link>
            <h2 style={{ marginTop: 4 }}>{nombre}</h2>
            <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '4px 0 0' }}>
              {CANALES[conv.canal] ?? conv.canal}
              {conv.contacts?.username ? ` · @${conv.contacts.username}` : ''}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pildora" style={{ background: e.bg, color: e.fg }}>
              <span className="pildora__punto" style={{ background: e.punto }} aria-hidden="true" />
              {e.etiqueta}
            </span>
            {/* El indicador de ventana se muestra aunque todavía no haya
                compositor: un operador que no sabe que la ventana venció
                escribe una respuesta que no se podrá enviar. */}
            <span className="pildora" style={{ background: cv.bg, color: cv.fg }} title={v.detalle}>
              {v.clase === 'abierta' ? `Ventana abierta · ${v.etiqueta}` : v.etiqueta}
            </span>
            {conv.en_standby ? (
              <span
                className="pildora"
                style={{ background: 'var(--k-esperando-bg)', color: 'var(--k-esperando-fg)' }}
                title="Otra aplicación es dueña del hilo. Kavea recibe por standby y no puede responder."
              >
                En standby
              </span>
            ) : null}
          </div>
        </header>

        <div className="hilo__cuerpo">
          <p className="traza" style={{ marginBottom: 8 }}>
            El historial anterior a la conexión no está disponible: Meta no lo entrega.
          </p>

          {entradas.map((x) => (
            <Entrada key={`${x.clase}-${x.ref}`} x={x} adjuntos={porMensaje.get(x.ref) ?? []} />
          ))}
        </div>

        <footer
          style={{
            borderTop: '1px solid var(--k-border)',
            padding: '14px 24px',
            fontSize: 13,
            color: 'var(--k-text-2)',
          }}
        >
          Responder llega en el bloque 4. La ventana de servicio y el estado del hilo ya se
          calculan aquí para que la respuesta salga con la regla correcta.
        </footer>
      </section>
    </div>
  )
}

function Entrada({
  x,
  adjuntos,
}: {
  x: EntradaHilo
  adjuntos: Array<{ tipo: string; cdn_url: string | null }>
}) {
  const hora = new Date(x.momento).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  // Actividad del equipo y eventos de Meta no son burbujas: son contexto.
  if (x.clase !== 'mensaje') {
    return (
      <p className="traza">
        {x.actor_nombre ? <span className="traza__actor">{x.actor_nombre}</span> : null}{' '}
        {describir(x)} · {hora}
      </p>
    )
  }

  const saliente = x.detalle.direccion === 'outbound'
  const borrado = Boolean(x.detalle.borrado)
  const texto = x.detalle.texto as string | null

  return (
    <div className={`burbuja${saliente ? ' burbuja--saliente' : ''}`}>
      <div className="burbuja__caja">
        {borrado ? (
          <span className="burbuja__borrado">Mensaje eliminado</span>
        ) : texto ? (
          texto
        ) : adjuntos.length ? (
          <span style={{ color: 'var(--k-text-2)' }}>
            {adjuntos.map((a) => etiquetaAdjunto(a.tipo)).join(', ')}
          </span>
        ) : (
          <span style={{ color: 'var(--k-text-2)' }}>Sin contenido</span>
        )}
      </div>
      <div className="burbuja__meta">
        {saliente ? (x.actor_tipo === 'agente' ? 'Agente' : 'Equipo') : 'Contacto'} · {hora}
        {x.detalle.editado ? ' · editado' : ''}
      </div>
    </div>
  )
}

/**
 * Los adjuntos se nombran, no se incrustan.
 *
 * De la media entrante solo se guarda la URL del CDN de Meta, y NO está
 * confirmado que el navegador pueda cargarla directamente: `lookaside.fbsbx.com`
 * es privacy-aware y puede exigir contexto. Proxearla desde el servidor
 * equivaldría a cachear, que es justo lo que Meta prohíbe y la causa documentada
 * de rechazos de App Review. Hasta comprobarlo empíricamente, se nombra el
 * adjunto sin intentar mostrarlo.
 */
function etiquetaAdjunto(tipo: string): string {
  switch (tipo) {
    case 'image': return 'Imagen'
    case 'video': return 'Vídeo'
    case 'audio': return 'Nota de voz'
    case 'file': return 'Archivo'
    case 'share':
    case 'ig_post': return 'Publicación compartida'
    case 'story_mention': return 'Mención en historia'
    default: return `Adjunto (${tipo})`
  }
}

function describir(x: EntradaHilo): string {
  const d = x.detalle as Record<string, string>
  switch (x.tipo) {
    case 'evento.read': return 'leyó la conversación'
    case 'evento.reaction': return `reaccionó ${d.emoji ?? ''}`.trim()
    case 'evento.delivery': return 'recibió el mensaje'
    case 'evento.postback': return 'pulsó un botón'
    case 'conversacion.asignada': return `asignó la conversación a ${d.a_nombre ?? 'alguien'}`
    case 'conversacion.desasignada': return 'quitó la asignación'
    case 'conversacion.estado': return `cambió el estado de ${d.de} a ${d.a}`
    case 'conversacion.cerrada': return 'cerró la conversación'
    case 'nota.añadida': return `añadió una nota: ${d.texto ?? ''}`
    case 'breakglass.abierto': return 'abrió un acceso temporal al contenido'
    default: return x.tipo.replace(/[._]/g, ' ')
  }
}
