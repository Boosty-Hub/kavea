import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import {
  listarTarjetas,
  contarPorEstado,
  obtenerTarjeta,
  obtenerHilo,
  adjuntosDe,
  canalesDe,
  otrasTarjetasDe,
  fichaDeTarjeta,
  fichaDeContacto,
  type EntradaHilo,
  type Adjunto,
  type ConversacionDeTarjeta,
} from '@/lib/bandeja'
import { todasLasEtapas } from '@/lib/embudo'
import {
  ESTADOS, etiquetaCanal, colorCanal, calcularVentana, COLOR_VENTANA, haceCuanto, type Estado,
} from '@/lib/ventana'
import { Refrescador } from '../refrescador'
import { Adjuntos } from './adjunto'
import { Ficha } from './ficha'
import { AlFinal } from './alfinal'

export const dynamic = 'force-dynamic'

export default async function Hilo({ params }: { params: Promise<{ id: string }> }) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const { id } = await params
  const tarjeta = await obtenerTarjeta(id)
  // RLS ya filtró: si no es de esta organización, es null y respondemos 404 en
  // vez de un 403 que confirmaría que existe.
  if (!tarjeta) notFound()

  const contactoId = tarjeta.contacts?.id ?? null
  const convIds = tarjeta.conversations.map((c) => c.id)

  const [entradas, adjuntos, lista, conteos, canales, otras, campoT, campoC, etapas] =
    await Promise.all([
      obtenerHilo(id),
      adjuntosDe(convIds),
      listarTarjetas({}),
      contarPorEstado(),
      contactoId ? canalesDe(contactoId) : Promise.resolve([]),
      contactoId ? otrasTarjetasDe(contactoId, id) : Promise.resolve([]),
      fichaDeTarjeta(id),
      contactoId ? fichaDeContacto(contactoId) : Promise.resolve([]),
      todasLasEtapas(),
    ])

  const porMensaje = new Map<string, Adjunto[]>()
  for (const a of adjuntos) {
    const l = porMensaje.get(a.message_id) ?? []
    l.push(a)
    porMensaje.set(a.message_id, l)
  }

  const e = ESTADOS[tarjeta.estado as Estado] ?? ESTADOS.nueva
  const nombre =
    tarjeta.titulo ?? tarjeta.contacts?.nombre ?? tarjeta.contacts?.username ?? 'Contacto sin nombre'

  // Una tarjeta con varios canales tiene una ventana POR CANAL. Enseñar una
  // sola sería mentir sobre si se puede responder: la de Instagram puede estar
  // vencida y la de Messenger abierta.
  const vivas = tarjeta.conversations.filter((c) => !c.cerrada_en)
  const multicanal = new Set(entradas.map((x) => x.canal)).size > 1

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
              <Link key={c.id} href={`/bandeja/${c.id}`} className="fila" aria-current={c.id === id}>
                <div className="fila__alto">
                  <span className="fila__nombre">
                    {c.titulo ?? c.contacts?.nombre ?? c.contacts?.username ?? 'Contacto sin nombre'}
                  </span>
                  <span className="fila__cuando">{haceCuanto(c.last_message_at)}</span>
                </div>
                <p className="fila__preview">{c.preview_texto ?? 'Sin mensajes'}</p>
                <div className="fila__pie">
                  <span className="pildora" style={{ background: ec.bg, color: ec.fg }}>
                    <span className="pildora__punto" style={{ background: ec.punto }} aria-hidden="true" />
                    {ec.etiqueta}
                  </span>
                  {(c.conversations ?? []).map((cv) => (
                    <span
                      key={cv.canal}
                      className="pildora__punto"
                      style={{ background: colorCanal(cv.canal) }}
                      title={etiquetaCanal(cv.canal)}
                    />
                  ))}
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
            <div className="canales">
              {vivas.map((c) => (
                <Ventana key={c.id} c={c} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pildora" style={{ background: e.bg, color: e.fg }}>
              <span className="pildora__punto" style={{ background: e.punto }} aria-hidden="true" />
              {e.etiqueta}
            </span>
            {vivas.some((c) => c.en_standby) ? (
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

        <div className="hilo-con-ficha">
          <div className="hilo__cuerpo">
            <p className="traza" style={{ marginBottom: 8 }}>
              El historial anterior a la conexión no está disponible: Meta no lo entrega.
            </p>

            {marcarCortes(entradas, multicanal).map(({ x, corte }) => (
              <Entrada
                key={`${x.clase}-${x.ref}`}
                x={x}
                adjuntos={porMensaje.get(x.ref) ?? []}
                multicanal={multicanal}
                corte={corte}
              />
            ))}

            <AlFinal marca={`${id}:${entradas.at(-1)?.ref ?? ''}`} />
          </div>

          <Ficha
            tarjetaId={id}
            contactoId={contactoId}
            canales={canales}
            otras={otras}
            camposTarjeta={campoT}
            camposContacto={campoC}
            etapas={etapas}
            etapaActual={tarjeta.etapa_id}
            valor={tarjeta.valor != null ? Number(tarjeta.valor) : null}
            moneda={tarjeta.moneda}
          />
        </div>

        <footer
          style={{
            borderTop: '1px solid var(--k-border)',
            padding: '14px 24px',
            fontSize: 13,
            color: 'var(--k-text-2)',
          }}
        >
          Responder llega en el bloque 4. Cada canal tiene su propia ventana y se responde por
          uno concreto: el token y el hilo en Meta son de ese canal.
        </footer>
      </section>
    </div>
  )
}

/**
 * Dónde va el separador de canal.
 *
 * Solo lo disparan los MENSAJES, y solo comparándose con el mensaje anterior.
 * La actividad del equipo y los eventos de Meta cuelgan técnicamente de una
 * conversación, así que traen canal, pero son contexto de la tarjeta y no
 * conversación: si contaran, un "cambió el estado" entre dos mensajes de
 * Messenger metería un separador "Instagram" seguido de ningún mensaje de
 * Instagram. Se vio así en la primera prueba de una tarjeta con dos canales.
 */
function marcarCortes(entradas: EntradaHilo[], multicanal: boolean) {
  let ultimoCanal: string | null = null
  return entradas.map((x) => {
    if (!multicanal || x.clase !== 'mensaje') return { x, corte: false }
    const corte = x.canal !== ultimoCanal
    ultimoCanal = x.canal
    return { x, corte }
  })
}

/** La ventana de servicio de una conversación, con su canal delante. */
function Ventana({ c }: { c: ConversacionDeTarjeta }) {
  const v = calcularVentana(c.last_incoming_at)
  const cv = COLOR_VENTANA[v.clase]
  return (
    <span className="canal-chip" title={v.detalle}>
      <span className="pildora__punto" style={{ background: colorCanal(c.canal) }} aria-hidden="true" />
      {etiquetaCanal(c.canal)}
      <span style={{ color: cv.fg }}>
        {v.clase === 'abierta' ? v.etiqueta : v.etiqueta.toLowerCase()}
      </span>
    </span>
  )
}

function Entrada({
  x, adjuntos, multicanal, corte,
}: {
  x: EntradaHilo
  adjuntos: Adjunto[]
  multicanal: boolean
  corte: boolean
}) {
  const hora = new Date(x.momento).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  const separador = corte ? (
    <p className="corte-canal">
      <span className="corte-canal__punto" style={{ background: colorCanal(x.canal) }} aria-hidden="true" />
      {etiquetaCanal(x.canal)}
    </p>
  ) : null

  // Actividad del equipo y eventos de Meta no son burbujas: son contexto.
  if (x.clase !== 'mensaje') {
    return (
      <>
        {separador}
        <p className="traza">
          {x.actor_nombre ? <span className="traza__actor">{x.actor_nombre}</span> : null}{' '}
          {describir(x)} · {hora}
        </p>
      </>
    )
  }

  const saliente = x.detalle.direccion === 'outbound'
  const borrado = Boolean(x.detalle.borrado)
  const texto = x.detalle.texto as string | null
  const visibles = borrado ? [] : adjuntos

  return (
    <>
      {separador}
      <div className={`burbuja${saliente ? ' burbuja--saliente' : ''}${multicanal ? ' burbuja--multicanal' : ''}`}>
        <div
          className="burbuja__caja"
          style={multicanal ? { borderInlineStartColor: colorCanal(x.canal) } : undefined}
        >
          {borrado ? (
            <span className="burbuja__borrado">Mensaje eliminado</span>
          ) : (
            <>
              {texto ? <div style={{ marginBottom: visibles.length ? 8 : 0 }}>{texto}</div> : null}
              {visibles.length ? <Adjuntos lista={visibles} /> : null}
              {!texto && !visibles.length ? (
                <span style={{ color: 'var(--k-text-2)' }}>Sin contenido</span>
              ) : null}
            </>
          )}
        </div>
        <div className="burbuja__meta">
          {saliente ? (x.actor_tipo === 'agente' ? 'Agente' : 'Equipo') : 'Contacto'}
          {/* El canal también en texto. Nunca solo color: hay gente daltónica
              en cualquier equipo, y es la misma regla que rige los estados. */}
          {multicanal ? ` · ${etiquetaCanal(x.canal)}` : ''} · {hora}
          {x.detalle.editado ? ' · editado' : ''}
        </div>
      </div>
    </>
  )
}

function describir(x: EntradaHilo): string {
  const d = x.detalle as Record<string, string>
  switch (x.tipo) {
    case 'evento.read': return 'leyó la conversación'
    case 'evento.reaction': return `reaccionó ${d.emoji ?? ''}`.trim()
    case 'evento.delivery': return 'recibió el mensaje'
    case 'evento.postback': return 'pulsó un botón'
    case 'conversacion.asignada':
    case 'tarjeta.asignada': return `asignó la conversación a ${d.a_nombre ?? 'alguien'}`
    case 'conversacion.desasignada':
    case 'tarjeta.desasignada': return 'quitó la asignación'
    case 'conversacion.estado':
    case 'tarjeta.estado': return `cambió el estado de ${d.de} a ${d.a}`
    case 'conversacion.cerrada':
    case 'tarjeta.cerrada': return 'cerró la conversación'
    case 'tarjeta.titulo': return `cambió el título a "${d.a ?? ''}"`
    case 'nota.añadida': return `añadió una nota: ${d.texto ?? ''}`
    case 'breakglass.abierto': return 'abrió un acceso temporal al contenido'
    case 'identidad.vinculada':
      return `vinculó ${etiquetaCanal(d.canal ?? '')} (${d.etiqueta ?? ''}) a esta persona`
    case 'identidad.desvinculada':
      return `quitó ${etiquetaCanal(d.canal ?? '')} (${d.etiqueta ?? ''}) de esta persona`
    case 'tarjetas.unidas':
      return `unió otra tarjeta con esta · ${d.motivo ?? ''}`
    case 'tarjetas.separadas': return 'deshizo la unión de tarjetas'
    case 'tarjeta.etapa': {
      const parado = d.dias_en_etapa_anterior != null && Number(d.dias_en_etapa_anterior) >= 1
        ? ` · ${d.dias_en_etapa_anterior} días en la anterior` : ''
      return d.de
        ? `movió la tarjeta de ${d.de} a ${d.a}${parado}`
        : `puso la tarjeta en ${d.a}`
    }
    case 'tarjeta.embudo': return `cambió el embudo de ${d.de ?? 'ninguno'} a ${d.a}`
    case 'tarjeta.valor': {
      const a = d.a != null ? `${d.a} ${d.moneda ?? ''}`.trim() : 'sin valor'
      return d.de != null
        ? `cambió el valor de ${d.de} a ${a}`
        : `puso el valor en ${a}`
    }
    case 'campo.valor':
      return `cambió ${d.etiqueta ?? 'un campo'}${d.de != null ? ` de "${textoValor(d.de)}"` : ''} a "${textoValor(d.a)}"`
    case 'contacto.fusionado':
      return `unió a ${d.absorbido ?? 'otro contacto'} con esta persona · ${d.motivo ?? ''}`
    case 'contacto.separado': return 'deshizo la unión de contactos'
    default: return x.tipo.replace(/[._]/g, ' ')
  }
}

function textoValor(v: unknown): string {
  if (v === null || v === undefined) return 'vacío'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}
