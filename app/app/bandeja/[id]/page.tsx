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
  miembrosDe,
  fichaDeTarjeta,
  fichaDeContacto,
  ventanaDe,
  type EntradaHilo,
  type Adjunto,
  type ConversacionDeTarjeta,
} from '@/lib/bandeja'
import { todasLasEtapas } from '@/lib/embudo'
import { archivosDe, documentosDe, resumenDe } from '@/lib/comercial'
import { plantillasUsables } from '@/lib/plantillas'
import {
  ESTADOS, etiquetaCanal, colorCanal, calcularVentana, COLOR_VENTANA, haceCuanto, type Estado,
} from '@/lib/ventana'
import { hora as enHuso, HUSO_POR_DEFECTO } from '@/lib/fechas'
import { Refrescador } from '../refrescador'
import { Adjuntos } from './adjunto'
import { Ficha } from './ficha'
import { AlFinal } from './alfinal'
import { Compositor } from './compositor'
import { Operar } from './operar'
import { Perfil } from './perfil'
import { describirActividad } from '@/lib/actividad'

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

  // El huso de la organización, que baja a todo lo que pinte una hora en esta
  // pantalla. Ver `lib/fechas.ts`.
  const huso = org.zona_horaria ?? HUSO_POR_DEFECTO

  const contactoId = tarjeta.contacts?.id ?? null
  const convIds = tarjeta.conversations.map((c) => c.id)

  const [entradas, adjuntos, lista, conteos, canales, otras, campoT, campoC, etapas,
         miembros, plantillas, archivos, documentos, resumen] =
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
      miembrosDe(org.id),
      plantillasUsables(),
      archivosDe(id, contactoId),
      contactoId ? documentosDe(contactoId) : Promise.resolve([]),
      contactoId ? resumenDe(contactoId) : Promise.resolve([]),
    ])

  const porMensaje = new Map<string, Adjunto[]>()
  for (const a of adjuntos) {
    const l = porMensaje.get(a.message_id) ?? []
    l.push(a)
    porMensaje.set(a.message_id, l)
  }

  // La píldora de estado de la cabecera la sustituyó el selector de `Operar`:
  // enseñar el estado y no dejar cambiarlo era justo el hueco que se cierra aquí.
  const nombre =
    tarjeta.titulo ?? tarjeta.contacts?.nombre ?? tarjeta.contacts?.username ?? 'Contacto sin nombre'

  // Una tarjeta con varios canales tiene una ventana POR CANAL. Enseñar una
  // sola sería mentir sobre si se puede responder: la de Instagram puede estar
  // vencida y la de Messenger abierta.
  const vivas = tarjeta.conversations.filter((c) => !c.cerrada_en)
  const multicanal = new Set(entradas.map((x) => x.canal)).size > 1

  // La ventana la decide Postgres, con la misma función que usan el encolado y
  // el despachador. Aquí solo se pinta.
  const ventanas = await Promise.all(vivas.map((c) => ventanaDe(c.id)))

  // Lo consumen el compositor y la pestaña de archivos: los dos sitios desde los
  // que sale algo hacia Meta, y los dos con la misma verdad sobre la ventana.
  const canalesVivos = vivas.map((c, i) => ({ id: c.id, canal: c.canal, ventana: ventanas[i]! }))

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
                  <span className="fila__cuando">{haceCuanto(c.last_message_at, huso)}</span>
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
            <div style={{ marginTop: 4 }}>
              <Perfil
                nombre={nombre}
                username={tarjeta.contacts?.username ?? null}
                fotoRuta={tarjeta.contacts?.foto_ruta ?? null}
              />
            </div>
            <div className="canales">
              {vivas.map((c) => (
                <Ventana key={c.id} c={c} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Operar
              tarjetaId={id}
              estado={tarjeta.estado}
              asignadoA={tarjeta.asignado_a}
              miembros={miembros}
            />
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
                huso={huso}
              />
            ))}

            <AlFinal marca={`${id}:${entradas.at(-1)?.ref ?? ''}`} />
          </div>

          <Ficha
            organizacionId={org.id}
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
            archivos={archivos}
            documentos={documentos}
            resumen={resumen}
            conversaciones={canalesVivos}
          />
        </div>

        {/* Una conversación por canal, y cada una con SU ventana: el token, el
            endpoint y la propiedad del hilo en Meta son de ese canal. */}
        <Compositor
          tarjetaId={id}
          plantillas={plantillas}
          conversaciones={canalesVivos}
        />
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
  x, adjuntos, multicanal, corte, huso,
}: {
  x: EntradaHilo
  adjuntos: Adjunto[]
  multicanal: boolean
  corte: boolean
  huso: string
}) {
  // En el huso de la organización, no en el del servidor. Antes salía en UTC:
  // para quien atiende desde Caracas, cada mensaje del hilo aparecía cuatro
  // horas en el futuro. Ver `lib/fechas.ts`.
  const hora = enHuso(x.momento, huso)

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
          {describirActividad(x, huso)} · {hora}
        </p>
      </>
    )
  }

  const saliente = x.detalle.direccion === 'outbound'
  const borrado = Boolean(x.detalle.borrado)
  const texto = x.detalle.texto as string | null
  const visibles = borrado ? [] : adjuntos
  const enCola = borrado ? null : (x.detalle.adjunto_nombre as string | null)

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
              {/* Un adjunto que todavía está en la cola: aún no existe la fila
                  de `media` que lo describiría, así que se pinta con lo que la
                  cola sabe de él. Sin esto la burbuja sale vacía entre que se
                  pulsa Enviar y vuelve el echo, y el operador vuelve a pulsar. */}
              {enCola ? (
                x.detalle.adjunto_tipo === 'like_heart' ? (
                  <span style={{ fontSize: 30, lineHeight: 1 }} role="img" aria-label="Un corazón">❤️</span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true">📎</span>
                    {enCola}
                  </span>
                )
              ) : null}
              {!texto && !visibles.length && !enCola ? (
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
          <EstadoEnvio x={x} />
        </div>
      </div>
    </>
  )
}

/**
 * En qué punto está un mensaje que Kavea mandó.
 *
 * Solo aparece mientras la fila de la cola de salida sigue en la línea de
 * tiempo, es decir, hasta que llega su echo. Cuando el echo lo sustituye, la
 * burbuja pasa a ser un mensaje normal y este indicador desaparece: eso ES la
 * confirmación de que Meta lo entregó de vuelta.
 */
function EstadoEnvio({ x }: { x: EntradaHilo }) {
  const estado = x.detalle.envio_estado as string | undefined
  if (!estado || estado === 'enviado') return null

  if (estado === 'fallido') {
    return (
      <span style={{ color: 'var(--k-escalada-fg)' }}>
        {' '}· no se envió{x.detalle.envio_error ? `: ${x.detalle.envio_error}` : ''}
      </span>
    )
  }
  return (
    <span style={{ color: 'var(--k-text-2)' }}>
      {' '}· {estado === 'bloqueado' ? 'esperando a Meta' : 'enviando'}
    </span>
  )
}

