'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CanalConectado, Conexion, EmbudoBreve, Verificacion } from '@/lib/conexiones'
import { fechaHora } from '@/lib/fechas'
import { colorCanal, etiquetaCanal } from '@/lib/ventana'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { LogoCanal } from './logos'

/**
 * El panel de canales.
 *
 * NO HAY UNA LUZ VERDE O ROJA. Hay siete, y cada una dice qué hacer si está
 * apagada. «La conexión falla» no le sirve a nadie; «la app no aparece suscrita
 * a esta Página» sí. El 80 % de los fallos de conexión son configuración del
 * cliente, y el único valor de esta pantalla es decir CUÁL.
 *
 * `No se pudo comprobar` se pinta distinto de `No funciona`, en gris y no en
 * rojo, porque son cosas distintas: una manda a arreglar algo y la otra no.
 * Pintarlas igual es cómo alguien se pasa una tarde revisando una Página que
 * estaba bien.
 */

const CARA = {
  ok:             { icono: '✓', texto: 'Funciona',            color: 'var(--k-resuelta-fg)', fondo: 'var(--k-resuelta-bg)' },
  fallo:          { icono: '✕', texto: 'No funciona',         color: 'var(--k-escalada-fg)', fondo: 'var(--k-escalada-bg)' },
  no_verificable: { icono: '?', texto: 'No se pudo comprobar', color: 'var(--k-text-2)',      fondo: 'var(--k-surface-2)' },
  sin_probar:     { icono: '·', texto: 'Sin probar todavía',  color: 'var(--k-esperando-fg)', fondo: 'var(--k-esperando-bg)' },
} as const

/**
 * Cómo se llama una conexión, en palabras.
 *
 * ESTABA ROTO PARA WHATSAPP Y SE VEÍA EN DOS SITIOS. El título usaba
 * `page_name ?? page_id` y la confirmación `page_name ?? ig_username ??
 * meta_connection_id`. Una conexión de WhatsApp no tiene Página ni Instagram
 * —`page_id` es null POR DISEÑO desde la 0065—, así que el título salía VACÍO
 * y la confirmación pedía transcribir «00000000-0000-4000-8000-00000000c002».
 *
 * El número ya estaba a mano en `canales[].nombre` («+1 829-954-3803») y el
 * panel no lo miraba. Mismo descuido que la 0073 y la 0082: código escrito
 * para Página+Instagram al que WhatsApp se le añadió por un lado.
 */
function nombreDe(c: Conexion): string {
  if (c.page_name) return c.page_name
  if (c.ig_username) return `@${c.ig_username}`
  const porCanal = c.canales.map((x) => x.nombre).filter(Boolean).join(' · ')
  return porCanal || c.page_id || c.meta_connection_id
}

/** Lo que hay que teclear para desconectar. Fija, legible y sin signos. */
const PALABRA = 'DESCONECTAR'

/** El orden en que se enseñan los canales. Fijo, para que no baile entre cargas. */
const ORDEN_CANALES = ['whatsapp', 'instagram', 'messenger'] as const

/**
 * ¿El diagnóstico guardado es anterior al último cambio de la conexión?
 *
 * Sin `ultima_pasada` no hay veredicto que envejecer, y sin `cambiada_en` no hay
 * con qué comparar: en los dos casos no se afirma que esté viejo, que sería
 * inventar un aviso.
 */
function viejo(c: Conexion): boolean {
  if (!c.ultima_pasada || !c.cambiada_en) return false
  return new Date(c.cambiada_en).getTime() > new Date(c.ultima_pasada).getTime()
}

export function Canales({
  conexiones, huso, embudos,
}: { conexiones: Conexion[]; huso: string; embudos: EmbudoBreve[] }) {
  const router = useRouter()
  const [comprobando, setComprobando] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Las retiradas no se pintan, pero se pueden mirar.
   *
   * Esconderlas sin dejar volver a verlas convertiría «retirar de la lista» en
   * un borrado que no se puede deshacer, que es justo lo que esta función NO
   * hace: el historial del canal sigue entero detrás.
   */
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [retirando, setRetirando] = useState<string | null>(null)
  /** Qué canal tiene el detalle abierto. `null` = solo las tarjetas. */
  const [abierto, setAbierto] = useState<string | null>(null)

  // Escape cierra, como cualquier diálogo: sin esto el modal es una trampa para
  // quien navega con teclado. Y el fondo no se desplaza mientras hay algo
  // encima, porque si no la rueda mueve la página de detrás y al cerrar
  // apareces en otro sitio.
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(null) }
    document.addEventListener('keydown', alPulsar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = antes
    }
  }, [abierto])

  async function comprobar(id: string) {
    setComprobando(id); setError(null)
    try {
      const r = await fetch('/api/diagnosticar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conexion: id }),
      })
      if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'No se pudo comprobar.')
      else router.refresh()
    } catch {
      setError('No se pudo comprobar ahora mismo.')
    }
    setComprobando(null)
  }

  /**
   * Desconectar, con la confirmación escribiendo una palabra.
   *
   * No es reversible con un clic —borra la credencial y el enrutado—, así que
   * la fricción es a propósito: la misma que ya usa `Unir` en la ficha para
   * fusionar tarjetas, pero un paso más arriba porque aquí lo que se pierde no
   * se puede deshacer solo con otro clic.
   *
   * SE ESCRIBE DESCONECTAR, NO EL NOMBRE. El nombre va en el aviso, que es
   * donde sirve —para reconocer qué se está tirando—; lo que se teclea tiene
   * que ser tecleable. Antes se pedía el nombre y para una conexión de
   * WhatsApp eso era el UUID: la única acción destructiva del panel era, en la
   * práctica, imposible de confirmar. Una fricción tiene que costar una
   * decisión, no una transcripción.
   */
  async function retirar(conexion: string, archivar: boolean) {
    setRetirando(conexion); setError(null)
    const { error } = await crearClienteNavegador()
      .rpc('archivar_conexion', { p_conexion: conexion, p_archivar: archivar })
    setRetirando(null)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  async function desconectar(c: Conexion) {
    const nombre = nombreDe(c)
    const escrito = window.prompt(
      `Esto desconecta ${nombre} de Kavea: deja de recibir y enviar por aquí hasta que se `
      + `vuelva a conectar desde cero.

Escribe ${PALABRA} para confirmar.`,
    )
    if (escrito?.trim().toUpperCase() !== PALABRA) return

    setDesconectando(c.meta_connection_id); setError(null)
    try {
      const r = await fetch('/api/canales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conexion: c.meta_connection_id, motivo: 'Desconectado desde Ajustes → Canales' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo desconectar.'); return }
      if (j.meta && j.meta.ok === false) {
        setError(
          `Se desconectó en Kavea. Meta no confirmó la baja de webhooks (${j.meta.aviso ?? 'sin detalle'}); `
          + 'puedes darla de baja también desde el Business Manager si quieres estar seguro.',
        )
      }
      router.refresh()
    } catch {
      setError('No se pudo desconectar ahora mismo.')
    }
    setDesconectando(null)
  }

  if (conexiones.length === 0) {
    return (
      <p className="ficha__vacia" style={{ marginTop: 24 }}>
        Todavía no hay ningún canal conectado.
      </p>
    )
  }

  // AGRUPADO POR CANAL, NO POR CONEXIÓN. Esta pantalla era una columna con una
  // conexión detrás de otra y sus siete comprobaciones siempre abiertas: con tres
  // conexiones había que bajar cuatro pantallas para ver la última, y no
  // contestaba de un vistazo lo único que se viene a preguntar —«¿mis canales
  // están bien?»—. Ahora hay una tarjeta por canal con su veredicto, y el detalle
  // se abre cuando se pide.
  const grupos = ORDEN_CANALES
    .map((canal) => ({
      canal,
      conexiones: conexiones.filter((c) => c.canales.some((k) => k.canal === canal)),
    }))
    .filter((g) => g.conexiones.length > 0)

  const abiertas = grupos.find((g) => g.canal === abierto)?.conexiones ?? []

  return (
    <div style={{ marginTop: 32 }}>
      {/* Un error de una acción del modal se enseña dentro del modal, no detrás. */}
      {error && !abierto ? <p className="error" role="alert">{error}</p> : null}

      <ul
        style={{
          listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {grupos.map(({ canal, conexiones: cs }) => {
          // Las desconectadas se cuentan aparte: no están rotas —lo están a
          // propósito— y decir «todo en orden» incluyéndolas sería falso.
          // Lo retirado no cuenta para nada de lo que la tarjeta resume: ni
          // como desconectado ni como pendiente. Está fuera de la lista, que es
          // lo que se pidió.
          const visibles = cs.filter((c) => !c.archivada_en)
          const fuera = visibles.filter((c) => c.estado === 'disconnected')
          const vivas = visibles.filter((c) => c.estado !== 'disconnected')
          const rotas = vivas.filter((c) => c.bloqueada).length
          const avisos = vivas.filter((c) => !c.bloqueada && c.en_rojo > 0).length
          const pendientes = vivas.filter((c) => viejo(c) || !c.ultima_pasada).length
          // El peor estado manda: una tarjeta que dice «todo en orden» teniendo
          // una conexión rota debajo es peor que no tener tarjeta.
          const resumen = rotas
            ? { t: rotas === 1 ? 'Una no funciona' : `${rotas} no funcionan`, c: 'var(--k-escalada-fg)' }
            : avisos
              ? { t: avisos === 1 ? 'Una con avisos' : `${avisos} con avisos`, c: 'var(--k-esperando-fg)' }
              : pendientes
                ? { t: 'Sin comprobar', c: 'var(--k-text-2)' }
                : vivas.length === 0
                  ? { t: 'Ninguna conectada', c: 'var(--k-text-2)' }
                  : { t: 'Todo en orden', c: 'var(--k-resuelta-fg)' }
          const enPausa = cs.flatMap((c) => c.canales)
            .filter((k) => k.canal === canal && !k.activo).length

          return (
            <li key={canal}>
              <button
                type="button"
                className="tarjeta"
                onClick={() => { setAbierto(canal); setError(null) }}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  display: 'grid', gap: 8, padding: '14px 16px',
                  font: 'inherit', color: 'inherit',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ color: colorCanal(canal), display: 'flex' }}>
                    <LogoCanal canal={canal} size={20} />
                  </span>
                  <span style={{ fontWeight: 500 }}>{etiquetaCanal(canal)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--k-text-2)' }}>
                    {visibles.length}
                  </span>
                </span>
                <span style={{ fontSize: 13, color: resumen.c }}>
                  {resumen.t}
                  {enPausa ? (
                    <span style={{ color: 'var(--k-text-2)' }}>{' · '}{enPausa} en pausa</span>
                  ) : null}
                  {fuera.length ? (
                    <span style={{ color: 'var(--k-text-2)' }}>
                      {' · '}{fuera.length} desconectada{fuera.length > 1 ? 's' : ''}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {abierto ? (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Conexiones de ${etiquetaCanal(abierto)}`}
          // Cerrar pinchando fuera, pero solo si el clic EMPIEZA fuera: sin
          // comparar con `currentTarget`, arrastrar desde dentro hasta el borde
          // cierra el modal y se lleva por delante lo que se estuviera haciendo.
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(null) }}
        >
          <div className="modal__caja">
            <div className="modal__cabecera">
              <span style={{ color: colorCanal(abierto), display: 'flex' }}>
                <LogoCanal canal={abierto} size={20} />
              </span>
              <h2 style={{ fontSize: 16, margin: 0 }}>{etiquetaCanal(abierto)}</h2>
              {/* El camino de vuelta a lo retirado. Sin esto, «retirar de la
                  lista» sería un borrado que no se puede deshacer, y no lo es:
                  el historial del canal sigue entero detrás. Solo sale si hay
                  algo retirado que enseñar. */}
              {abiertas.some((c) => c.archivada_en) ? (
                <button
                  type="button"
                  className="operar__control"
                  style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 13 }}
                  aria-pressed={verArchivadas}
                  onClick={() => setVerArchivadas((v) => !v)}
                >
                  {verArchivadas
                    ? 'Ocultar las retiradas'
                    : `Ver ${abiertas.filter((c) => c.archivada_en).length} retirada${
                        abiertas.filter((c) => c.archivada_en).length > 1 ? 's' : ''}`}
                </button>
              ) : null}
              <button
                type="button"
                className="operar__control"
                style={{
                  marginLeft: abiertas.some((c) => c.archivada_en) ? 0 : 'auto',
                  cursor: 'pointer', fontSize: 13,
                }}
                onClick={() => setAbierto(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="modal__cuerpo">
              {error ? <p className="error" role="alert">{error}</p> : null}
              <div style={{ display: 'grid', gap: 28 }}>
                {abiertas.filter((c) => verArchivadas || !c.archivada_en).map((c) => (
                  <section key={c.meta_connection_id}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: 16, margin: 0 }}>{nombreDe(c)}</h2>
                      {c.ig_username && c.page_name ? (
                        <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>@{c.ig_username}</span>
                      ) : null}
                      {/* UNA CONEXIÓN DESCONECTADA NO OFRECE DESHACERLO. Al desconectar
                Centromarca, la cabecera seguía enseñando «Desconectar» y
                «Volver a comprobar» mientras sus canales decían «Inactivo»: la
                misma tarjeta afirmaba dos cosas distintas a diez píxeles. Un
                botón que ofrece deshacer algo ya deshecho invita a pulsarlo y a
                dudar de si la primera vez funcionó. */}
            {c.estado === 'disconnected' ? (
              <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>Desconectada</span>
            ) : null}

            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        {/* RECONECTAR. El BISU no se refresca: se renueva volviendo a pasar
                            por el diálogo. Sin este enlace, un token muerto es una llamada
                            a soporte. Solo sale cuando hace falta —`token_invalido_desde`
                            no nulo— y solo en conexiones de Página: WhatsApp no entra por
                            esta configuración. */}
                        {c.token_invalido_desde && c.page_id ? (
                          <a
                            className="operar__control"
                            style={{ fontSize: 13, textDecoration: 'none', color: 'var(--k-accent)' }}
                            href="/api/meta/oauth/start?canal=mensajeria"
                          >
                            Reconectar
                          </a>
                        ) : null}
                        {c.estado === 'disconnected' ? (
                          // Lo único que tiene sentido ofrecer sobre algo ya
                          // desconectado es volver a traerlo. «Desconectar» ahí
                          // invita a pulsarlo y a dudar de si la primera vez funcionó.
                          <a
                            className="operar__control"
                            style={{ fontSize: 13, textDecoration: 'none', color: 'var(--k-accent)' }}
                            href="/ajustes/canales/elegir"
                          >
                            Volver a conectar
                          </a>
                        ) : null}
                        {/* RETIRAR DE LA LISTA. Solo sobre lo desconectado: esconder
                            algo vivo convertiría esta pantalla en lo contrario de lo
                            que es. Y dice «retirar», no «eliminar», porque no borra:
                            un `delete` de la conexión arrastraría en cascada sus
                            canales, sus conversaciones y sus mensajes. */}
                        {c.estado === 'disconnected' ? (
                          <button
                            type="button"
                            className="operar__control"
                            style={{ cursor: 'pointer', fontSize: 13 }}
                            disabled={retirando === c.meta_connection_id}
                            onClick={() => void retirar(c.meta_connection_id, !c.archivada_en)}
                            title={c.archivada_en
                              ? 'Vuelve a salir en la lista'
                              : 'Deja de salir aquí. No se borra el historial.'}
                          >
                            {c.archivada_en ? 'Devolver a la lista' : 'Retirar de la lista'}
                          </button>
                        ) : null}
                        {c.estado !== 'disconnected' ? (
                          <>
                            <button
                              type="button"
                              className="operar__control"
                              style={{ cursor: 'pointer', fontSize: 13 }}
                              disabled={comprobando !== null}
                              onClick={() => comprobar(c.meta_connection_id)}
                            >
                              {comprobando === c.meta_connection_id ? 'Comprobando' : 'Volver a comprobar'}
                            </button>
                            <button
                              type="button"
                              className="operar__control"
                              style={{ cursor: 'pointer', fontSize: 13, color: 'var(--k-escalada-fg)' }}
                              disabled={desconectando !== null}
                              onClick={() => desconectar(c)}
                            >
                              {desconectando === c.meta_connection_id ? 'Desconectando' : 'Desconectar'}
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>

                    {/* UN VEREDICTO ANTERIOR AL ÚLTIMO CAMBIO NO SE AFIRMA. El 24-ago una
                        reconexión correcta se leyó como fallida porque la pantalla seguía
                        enseñando el diagnóstico del día anterior, que decía «se creó sin
                        pasar por el diálogo» sobre una conexión que acababa de pasar por
                        él. Con las dos fechas al lado, la pantalla puede decir que lo que
                        enseña es viejo en vez de darlo por actual. */}
                    {viejo(c) ? (
                      <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '6px 0 0' }}>
                        La conexión cambió después de la última comprobación, así que lo de abajo describe
                        cómo estaba antes. Pulsa «Volver a comprobar».
                      </p>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '6px 0 0' }}>
                        {c.bloqueada
                          ? 'Hay algo que impide que este canal funcione.'
                          : c.en_rojo > 0
                            ? 'Funciona, pero hay un aviso.'
                            : 'Todo lo que se puede comprobar está en orden.'}
                        {c.ultima_pasada ? (
                          <> · comprobado el {fechaHora(c.ultima_pasada, huso)}</>
                        ) : ' · sin comprobar todavía'}
                      </p>
                    )}

                    <Canalitos
                        canales={c.canales}
                        huso={huso}
                        embudos={embudos}
                        onCambiado={() => router.refresh()}
                      />

                    <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
                      {c.comprobaciones.length === 0 ? (
                        <p className="ficha__vacia" style={{ padding: 16 }}>
                          Sin comprobar. Pulsa «Volver a comprobar».
                        </p>
                      ) : (
                        c.comprobaciones.map((v) => <Fila key={v.codigo} v={v} />)
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Los canales de esta conexión, con su marca y si están activos.
 *
 * VA ANTES DE LAS SIETE COMPROBACIONES, y el orden importa. Las comprobaciones
 * responden «¿puede funcionar?»; esto responde «¿está encendido?». Es la
 * pregunta más barata de las dos y la que más veces se viene a hacer, así que se
 * contesta primero y sin tener que leer una tabla.
 *
 * Una conexión de Página trae dos canales —Messenger e Instagram— y una de
 * WhatsApp trae uno. La lista sale de la base, no de una constante, para que un
 * canal nuevo aparezca aquí el día que exista y no el día que alguien se acuerde
 * de tocar este fichero.
 */
function Canalitos({
  canales, huso, embudos, onCambiado,
}: {
  canales: CanalConectado[]
  huso: string
  embudos: EmbudoBreve[]
  onCambiado: () => void
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * A qué embudo entran las conversaciones nuevas de este canal.
   *
   * SOLO SE ENSEÑA SI HAY MÁS DE UNO. Con un embudo la elección no existe, y un
   * selector de una sola opción es ruido que hay que leer para descartar.
   *
   * Cambiarlo NO mueve nada de lo que ya entró: la tarjeta es por contacto y se
   * queda donde nació. Lo dice el `title`, porque es justo lo que alguien espera
   * mal la primera vez.
   */
  async function mover(k: CanalConectado, embudo: string) {
    setOcupado(k.id); setError(null)
    const { error } = await crearClienteNavegador().rpc('asignar_embudo_a_canal', {
      p_canal: k.id,
      p_embudo: embudo || null,
    })
    setOcupado(null)
    if (error) { setError(error.message); return }
    onCambiado()
  }

  async function alternar(k: CanalConectado) {
    setOcupado(k.id); setError(null)
    const { error } = k.activo
      ? await crearClienteNavegador().rpc('pausar_canal', { p_canal: k.id, p_motivo: null })
      : await crearClienteNavegador().rpc('reanudar_canal', { p_canal: k.id })
    setOcupado(null)
    if (error) { setError(error.message); return }
    onCambiado()
  }

  // Se resuelve una vez, no por canal.
  const predeterminado = embudos.find((x) => x.es_predeterminado)

  if (canales.length === 0) return null

  return (
    <>
    {error ? <p className="error" role="alert" style={{ marginTop: 8 }}>{error}</p> : null}
    <ul
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        listStyle: 'none', padding: 0, margin: '12px 0 0',
      }}
    >
      {canales.map((k) => (
        <li
          key={k.id}
          className="tarjeta"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', margin: 0,
            // Un canal apagado se despinta entero en vez de llevar una etiqueta
            // roja: el rojo de esta pantalla ya significa «algo está roto», y un
            // canal pausado a propósito no lo está.
            opacity: k.activo ? 1 : 0.55,
          }}
          title={
            k.activo
              ? undefined
              : [k.pausado_motivo, k.pausado_desde ? `desde el ${fechaHora(k.pausado_desde, huso)}` : null]
                  .filter(Boolean)
                  .join(' · ') || undefined
          }
        >
          <span style={{ color: colorCanal(k.canal), display: 'flex' }}>
            <LogoCanal canal={k.canal} size={20} />
          </span>

          <span style={{ display: 'grid', minWidth: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>{etiquetaCanal(k.canal)}</span>
            {k.nombre ? (
              <span
                style={{
                  fontSize: 12, color: 'var(--k-text-2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {k.nombre}
              </span>
            ) : null}
          </span>

          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginLeft: 8, fontSize: 12,
              color: k.activo ? 'var(--k-resuelta-fg)' : 'var(--k-text-2)',
            }}
          >
            {/* El punto no es el único portador del estado: al lado va la
                palabra. Un estado que solo se distingue por color no lo
                distingue quien no separa esos dos colores. */}
            <span
              aria-hidden="true"
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: k.activo ? 'var(--k-resuelta)' : 'var(--k-text-2)',
              }}
            />
            {k.activo ? 'Activo' : 'Inactivo'}
          </span>

          <button
            type="button"
            onClick={() => alternar(k)}
            disabled={ocupado !== null}
            title={k.activo ? 'Deja de enviar y recibir por este canal, sin desconectarlo' : 'Vuelve a activarlo'}
            style={{
              border: 0, background: 'transparent', cursor: 'pointer',
              font: 'inherit', fontSize: 12, color: 'var(--k-accent)',
              textDecoration: 'underline', textUnderlineOffset: 3, padding: 0,
            }}
          >
            {ocupado === k.id ? '…' : k.activo ? 'Pausar' : 'Reanudar'}
          </button>

          {/* SOLO SI HAY MÁS DE UN EMBUDO. Con uno la elección no existe, y un
              selector de una sola opción es ruido que hay que leer para
              descartar. */}
          {embudos.length > 1 ? (
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}
              title={
                'A qué embudo entran las conversaciones NUEVAS de este canal. '
                + 'Las que ya existen no se mueven: la tarjeta es de la persona, no del canal.'
              }
            >
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>→</span>
              <select
                className="operar__control"
                style={{ fontSize: 12, padding: '3px 6px' }}
                value={k.embudo_id ?? ''}
                disabled={ocupado !== null}
                onChange={(e) => mover(k, e.target.value)}
              >
                {/* El vacío no es «ninguno», es «el de siempre»: así se puede
                    volver atrás sin acordarse de cuál era, y si mañana cambia el
                    predeterminado, este canal lo sigue.

                    Y el predeterminado NO se repite abajo. La primera versión
                    listaba «Ventas (por defecto)» y luego «Ventas», que se lee
                    como un error aunque signifiquen cosas distintas. Se deja
                    solo si este canal está clavado a él explícitamente, que es
                    el único caso en que hace falta poder verlo seleccionado. */}
                <option value="">
                  Por defecto{predeterminado ? ` · ${predeterminado.nombre}` : ''}
                </option>
                {embudos
                  .filter((x) => !x.es_predeterminado || k.embudo_id === x.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>{x.nombre}</option>
                  ))}
              </select>
            </label>
          ) : null}
        </li>
      ))}
    </ul>
    </>
  )
}

function Fila({ v }: { v: Verificacion }) {
  const cara = CARA[v.resultado] ?? CARA.no_verificable
  return (
    <div className="miembro" style={{ alignItems: 'flex-start' }}>
      <span
        aria-hidden="true"
        style={{
          flex: 'none', width: 22, height: 22, borderRadius: '50%',
          display: 'grid', placeItems: 'center', fontSize: 12, marginTop: 1,
          background: cara.fondo, color: cara.color,
        }}
      >
        {cara.icono}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>
          {v.titulo}
          {!v.bloquea && v.resultado === 'fallo' ? (
            <span style={{ fontWeight: 400, color: 'var(--k-text-2)' }}> · solo aviso</span>
          ) : null}
        </div>
        {/* La causa dice QUÉ HACER, no qué pasó. «Error 190» no es una causa
            para quien lo lee. */}
        {v.causa ? (
          <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 2 }}>{v.causa}</div>
        ) : null}
      </div>
      <span style={{ flex: 'none', fontSize: 12, color: cara.color }}>{cara.texto}</span>
    </div>
  )
}
