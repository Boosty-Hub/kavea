'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

import { PreviaPlantilla } from './previa-plantilla'
import { LogoCanal } from '@/lib/logos-canal'
import { etiquetaCanal, colorCanal } from '@/lib/ventana'

/**
 * El compositor.
 *
 * TRES ESTADOS VISIBLES, y el que manda es el de la base.
 *
 *   abierta  → se responde con normalidad
 *   humana   → fuera de las 24 h, con aviso: solo hasta los 7 días y solo
 *              porque lo escribe una persona
 *   cerrada  → deshabilitado, con el motivo escrito
 *
 * La ventana la calcula `ventana_de()` en Postgres y el compositor la refleja.
 * No la recalcula aquí: dos implementaciones de la misma regla son dos reglas,
 * y la que se olvida de actualizar es la que deja mandar lo que Meta rechaza.
 *
 * EL CONTADOR DE BYTES NO ES DECORACIÓN. Instagram admite 1000 BYTES, no 1000
 * caracteres, verbatim de la documentación. Con tildes y emojis el margen real
 * es bastante menor, y en Venezuela, República Dominicana y México eso es
 * siempre. Sin contador, el operador escribe un párrafo y el envío falla.
 */

type Ventana = { clase: 'abierta' | 'humana' | 'cerrada'; motivo: string | null }

/**
 * Por dónde sale la respuesta, escrito entero.
 *
 * Desde la 0082 una organización puede tener dos números de WhatsApp, y cada
 * conversación sale por el suyo: `encolar_envio` saca la conexión de
 * `conversations.channel_id`. Con solo «WhatsApp» en pantalla, las dos se leen
 * igual y por cuál se contesta queda a la suerte de cuál eligió el selector.
 * El 23-ago-2026 eso mandó un mensaje al hilo de un número desconectado.
 */
function porDonde(c: { canal: string; nombre: string | null }) {
  return c.nombre ? `${etiquetaCanal(c.canal)} · ${c.nombre}` : etiquetaCanal(c.canal)
}

/** Sin tildes y en minúsculas, para que «cita» encuentre «Citación». */
function llano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * El comando de barra que se está escribiendo, si se está escribiendo alguno.
 *
 * La barra cuenta como comando solo al principio del texto o después de un
 * espacio: en «http://algo/otro» hay tres barras y ninguna es un comando, y
 * abrir el menú ahí sería pelearse con quien pega un enlace.
 *
 * Devuelve dónde empieza —para poder sustituirlo al insertar— y qué se ha
 * escrito detrás, que es el filtro.
 */
function comandoEnCurso(valor: string, caret: number): { inicio: number; token: string } | null {
  const antes = valor.slice(0, caret)
  const barra = antes.lastIndexOf('/')
  if (barra < 0) return null
  if (barra > 0 && !/\s/.test(antes[barra - 1]!)) return null
  const token = antes.slice(barra + 1)
  // Un espacio cierra el comando: ya no se está eligiendo, se está escribiendo.
  if (/\s/.test(token)) return null
  return { inicio: barra, token }
}

/**
 * El botón que abre las plantillas.
 *
 * Vive encima de la caja, en la línea que ya dice por dónde se responde, y no en
 * el pie: en el pie era un `<select>` que se comía una fila entera del
 * compositor —en una pantalla donde el sitio se le debe al hilo— para una lista
 * que se abre dos veces al día.
 *
 * Lleva el número al lado a propósito. Un icono solo no dice si hay algo dentro,
 * y abrir un menú vacío es el peor resultado posible de pulsar un botón.
 */
function BotonPlantillas({
  cuantas, abierto, onClick,
}: { cuantas: number; abierto: boolean; onClick: () => void }) {
  if (cuantas === 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-haspopup="listbox"
      title={`Plantillas (${cuantas}) · o escribe / en la caja`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginLeft: 8, padding: '2px 7px', border: '1px solid var(--k-border)',
        borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 12,
        background: abierto ? 'var(--k-surface-2)' : 'transparent',
        color: 'var(--k-text-2)', flex: 'none',
      }}
    >
      {/* Un documento con líneas: es lo que es una plantilla, y se distingue de
          los tres logos de canal que ya están en esta misma línea. */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6.5 3.5h7.4l4.1 4.1V20a.5.5 0 0 1-.5.5H6.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
        />
        <path d="M13.6 3.6v4.2h4.2M9 12h6M9 15.4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Plantillas
      <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{cuantas}</span>
    </button>
  )
}

export function Compositor({
  conversaciones, tarjetaId, plantillas, plantillasWa, plantillasMs,
}: {
  conversaciones: Array<{
    id: string
    canal: string
    /** El canal concreto: «+1 321-393-1397», «@boosty.digital». Puede faltar. */
    nombre: string | null
    ventana: Ventana
  }>
  tarjetaId: string
  plantillas: Array<{ id: string; nombre: string; atajo: string | null }>
  /**
   * Las de WhatsApp aprobadas y ya emparejadas con la ficha.
   *
   * Son la ÚNICA salida cuando la ventana de 24 h se cerró: Meta prohíbe el texto
   * libre y hasta hoy Kavea no sabía mandar plantillas, así que el compositor se
   * deshabilitaba con un motivo y ahí terminaba la conversación. Van aparte de
   * `plantillas` porque no se insertan en la caja: se envían enteras.
   */
  plantillasWa: Array<{ id: string; nombre: string; cuerpo: string; huecos: number }>
  /**
   * Las de la PÁGINA, aprobadas y emparejadas. Son otras: viven en la Página, no
   * en la cuenta de WhatsApp, y una no existe para la otra. Por eso son dos
   * listas y no una con un campo `canal`: mezclarlas invita a ofrecer en un hilo
   * una plantilla que ese canal no tiene, y Meta contesta con «nombre no
   * encontrado», que no dice nada de la causa.
   */
  plantillasMs: Array<{ id: string; nombre: string; cuerpo: string; huecos: number }>
}) {
  const router = useRouter()
  const [faltan, setFaltan] = useState<string[]>([])
  const [activa, setActiva] = useState(
    // Se arranca en el canal por el que SÍ se puede responder. Aterrizar en uno
    // cerrado teniendo otro abierto hace pensar que no se puede contestar.
    conversaciones.find((c) => c.ventana.clase === 'abierta')?.id ?? conversaciones[0]?.id ?? '',
  )
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ARRIBA DEL TODO, con los demás. Estaban debajo del `return null` de más
  // abajo, y un hook detrás de un retorno condicional se salta en algunos
  // renderizados: React cuenta los hooks por orden y el orden dejaba de ser el
  // mismo. Compilaba; lo cazó el typecheck por otro motivo.
  /**
   * EL COMANDO RÁPIDO. `/` abre la lista de plantillas internas y filtra al
   * teclear. Existe porque el desplegable de abajo obliga a soltar el teclado
   * en mitad de una frase, y quien contesta veinte conversaciones seguidas no
   * suelta el teclado.
   *
   * Solo lista las INTERNAS. Las de Meta no se insertan, se envían enteras y se
   * facturan: ponerlas a un `/` y un Enter de distancia sería un cargo a un
   * pulso de teclado.
   */
  const [comando, setComando] = useState<{ inicio: number; token: string } | null>(null)
  const [marcada, setMarcada] = useState(0)
  const [insertando, setInsertando] = useState(false)
  const cajaTexto = useRef<HTMLTextAreaElement | null>(null)
  /** El menú abierto con el icono, sin barra escrita. */
  const [menu, setMenu] = useState(false)
  /**
   * La plantilla que está en la vista previa.
   *
   * Elegir una en el menú ya NO manda: abre el diálogo. Una plantilla sale entera
   * y se factura, así que entre elegirla y que salga tiene que haber una pantalla
   * que enseñe lo que la persona va a recibir.
   */
  const [previa, setPrevia] = useState<{ id: string; nombre: string } | null>(null)
  const cajaMenu = useRef<HTMLDivElement | null>(null)
  const [mandandoWa, setMandandoWa] = useState(false)
  const [errorWa, setErrorWa] = useState<string | null>(null)

  /**
   * CERRAR AL PULSAR FUERA, que abierto con el icono no lo hace nadie más.
   *
   * El menú del comando se cierra con el `blur` de la caja; el del icono se abre
   * sin tocar la caja, así que no hay `blur` que llegue y quedaba abierto hasta
   * elegir algo o pulsar Escape. Y con la ventana cerrada la caja está
   * deshabilitada: ni foco ni Escape, así que sin esto no había forma de
   * cerrarlo.
   *
   * `mousedown` y no `click`: es el mismo momento en que los botones del menú
   * actúan, y con `click` el cierre llegaba antes de que se eligiera nada.
   */
  useEffect(() => {
    if (!menu) return
    function fuera(ev: MouseEvent) {
      if (!cajaMenu.current?.contains(ev.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [menu])

  const conv = conversaciones.find((c) => c.id === activa)
  if (!conv) return null

  const bytes = new TextEncoder().encode(texto).length
  const tope = conv.canal === 'instagram' ? 1000 : 4000
  const pasado = bytes > tope
  const cerrada = conv.ventana.clase === 'cerrada'

  /**
   * TODAS LAS PLANTILLAS DE ESTA CONVERSACIÓN, EN UNA SOLA LISTA.
   *
   * Antes había dos sitios: un desplegable en el pie para las internas y un
   * bloque aparte para las de Meta que solo aparecía fuera de la ventana. Dos
   * sitios con reglas distintas para lo mismo, y el de Meta no se había visto
   * nunca porque no se llega a una conversación cerrada por casualidad.
   *
   * Ahora es una lista con dos grupos, y cada elemento dice qué va a hacer:
   * las internas se INSERTAN en la caja, las de Meta se ENVÍAN enteras. No es
   * un detalle de forma: una se puede corregir antes de mandarla y la otra no.
   *
   * Las de Meta se ofrecen SIEMPRE, no solo fuera de la ventana. Dentro se
   * pueden mandar igual —Meta las acepta— y esconderlas obligaba a adivinar por
   * qué no estaban. Lo que sí hay es una confirmación con el coste escrito,
   * porque dentro de las 24 h el texto normal hace lo mismo y es gratis.
   */
  const deEsteCanal = conv.canal === 'whatsapp' ? plantillasWa
    : conv.canal === 'messenger' ? plantillasMs
      : []

  /**
   * Lo que el menú ofrece ahora mismo, ya filtrado.
   *
   * `filtro` es lo escrito tras la barra cuando se abrió con `/`, y cadena vacía
   * cuando se abrió con el icono. Un solo camino para las dos formas de abrirlo:
   * dos listas distintas según cómo se abre es la clase de diferencia que nadie
   * recuerda al cambiar una de ellas.
   */
  const filtro = comando?.token ?? ''
  const encaja = (nombre: string, atajo?: string | null) => {
    const t = llano(filtro)
    if (!t) return true
    return llano(nombre).includes(t) || (atajo ? llano(atajo).startsWith(t) : false)
  }
  const coincidencias: Array<{
    clase: 'interna' | 'meta'; id: string; nombre: string; atajo?: string | null; cuerpo?: string
  }> = [
    ...plantillas.filter((pl) => encaja(pl.nombre, pl.atajo))
      .map((pl) => ({ clase: 'interna' as const, id: pl.id, nombre: pl.nombre, atajo: pl.atajo })),
    ...deEsteCanal.filter((pl) => encaja(pl.nombre))
      .map((pl) => ({ clase: 'meta' as const, id: pl.id, nombre: pl.nombre, cuerpo: pl.cuerpo })),
  ].slice(0, 12)

  /**
   * Insertar la plantilla donde estaba el comando.
   *
   * El texto lo resuelve la BASE con `renderizar_plantilla`, la misma función
   * que usa el desplegable: resolver las variables aquí sería una segunda
   * implementación de lo mismo, y dos implementaciones de las variables se
   * separan.
   */
  async function insertarComando(id: string) {
    if (insertando) return
    const caja = cajaTexto.current
    // Abierto con el icono no hay barra que sustituir: se inserta donde esté el
    // cursor, que es lo que hace cualquier caja de texto.
    const inicio = comando?.inicio ?? (caja?.selectionStart ?? texto.length)
    const fin = caja?.selectionStart ?? inicio
    setInsertando(true)
    const { data, error: err } = await crearClienteNavegador()
      .rpc('renderizar_plantilla', { p_plantilla: id, p_tarjeta: tarjetaId })
    setInsertando(false)
    if (err) { setError(err.message); return }
    const r = (data as Array<{ texto: string; faltan: string[] }>)?.[0]
    if (!r) return
    const nuevo = texto.slice(0, inicio) + r.texto + texto.slice(Math.max(inicio, fin))
    setTexto(nuevo)
    setFaltan(r.faltan ?? [])
    setComando(null); setMenu(false); setMarcada(0)
    const corte = inicio + r.texto.length
    requestAnimationFrame(() => { caja?.focus(); caja?.setSelectionRange(corte, corte) })
  }

  /** Recalcula si hay comando en curso, con el cursor donde esté. */
  function revisarComando(caja: HTMLTextAreaElement) {
    const c = comandoEnCurso(caja.value, caja.selectionStart ?? caja.value.length)
    setComando(c)
    setMarcada(0)
  }

  const convId = conv.id
  /**
   * Mandar una plantilla de Meta. Se ENVÍA, no se inserta.
   *
   * Los huecos no se piden aquí: los resuelve `encolar_plantilla` contra la
   * ficha, y si falta alguno se niega a encolar diciendo cuál. Preguntarlos en
   * el compositor sería duplicar la ficha en un formulario y dejar que se
   * separen.
   *
   * DENTRO DE LA VENTANA SE PREGUNTA. Meta acepta el envío igual, pero se
   * factura como conversación y el texto normal hace lo mismo gratis. No se
   * esconde la opción —esconderla obligaba a adivinar por qué no estaba— pero
   * tampoco se manda un cargo con un solo clic.
   */
  /**
   * Mandar la plantilla. Ya no pregunta: para cuando llega aquí, el diálogo de
   * vista previa ha enseñado el texto y ha guardado los datos que faltaban.
   *
   * Los huecos no se resuelven aquí: los resuelve `encolar_plantilla` contra la
   * ficha, y si falta alguno se niega diciendo cuál. Resolverlos en el compositor
   * sería duplicar la ficha en un formulario y dejar que se separen.
   */
  async function mandarPlantillaMeta(id: string) {
    if (mandandoWa) return
    setMandandoWa(true); setErrorWa(null)
    const { error: err } = await crearClienteNavegador()
      .rpc('encolar_plantilla', { p_conversacion: convId, p_plantilla: id })
    setMandandoWa(false)
    if (err) { setErrorWa(err.message); throw new Error(err.message) }
    setPrevia(null)
    router.refresh()
    fetch('/api/despachar', { method: 'POST' }).catch(() => {})
    setTimeout(() => { router.refresh(); alFondo() }, 2500)
  }

  /**
   * Baja el hilo hasta el final. Lo escucha `AlFinal`, que es quien conoce el
   * contenedor y sus reglas.
   *
   * Se llama DOS VECES por envío, y no sobra: la primera al refrescar, cuando el
   * mensaje aún no está pintado y solo sirve para volver a pegarse al fondo; la
   * segunda tras el refresco de los 2,5 s, cuando ya está el acuse.
   */
  function alFondo() {
    window.dispatchEvent(new Event('kavea:al-fondo'))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim() || pasado || cerrada) return
    setEnviando(true); setError(null)

    const { error } = await crearClienteNavegador()
      .rpc('encolar_envio', { p_conversacion: activa, p_texto: texto })

    setEnviando(false)
    if (error) { setError(error.message); return }

    setTexto('')
    setFaltan([])
    router.refresh()
    alFondo()

    // Se despierta al despachador en vez de esperar al cron: un minuto de
    // espera para una respuesta que el operador acaba de escribir se siente
    // roto aunque acabe saliendo.
    fetch('/api/despachar', { method: 'POST' }).catch(() => {})
    setTimeout(() => { router.refresh(); alFondo() }, 2500)
  }

  return (
    <footer className="compositor" ref={cajaMenu}>
      {previa ? (
        <PreviaPlantilla
          plantillaId={previa.id}
          nombre={previa.nombre}
          tarjetaId={tarjetaId}
          canal={etiquetaCanal(conv.canal)}
          dentroDeVentana={conv.ventana.clase === 'abierta'}
          alCerrar={() => setPrevia(null)}
          alEnviar={() => mandarPlantillaMeta(previa.id)}
        />
      ) : null}

      {conversaciones.length > 1 ? (
        <div className="compositor__canales" style={{ alignItems: 'center' }}>
          {conversaciones.map((c) => (
            <button
              key={c.id}
              type="button"
              className="canal-chip"
              aria-current={c.id === activa}
              onClick={() => setActiva(c.id)}
              style={{ cursor: 'pointer', font: 'inherit' }}
              title={c.ventana.motivo ?? 'Se puede responder'}
            >
              {/* La marca, la misma que la lista y que Canales. Un punto de
                  color obliga a saberse los colores de memoria. */}
              <span style={{ color: colorCanal(c.canal), display: 'inline-flex', flex: 'none' }}>
                <LogoCanal canal={c.canal} size={14} />
              </span>
              {porDonde(c)}
              {c.ventana.clase !== 'abierta' ? (
                <span style={{ color: 'var(--k-text-2)' }}>
                  {c.ventana.clase === 'humana' ? 'fuera de ventana' : 'cerrado'}
                </span>
              ) : null}
            </button>
          ))}
          <BotonPlantillas
            cuantas={plantillas.length + deEsteCanal.length}
            abierto={menu}
            onClick={() => { setMenu((v) => !v); setComando(null); setMarcada(0) }}
          />
        </div>
      ) : (
        // Con un solo canal no hay selector, y el marcador de posición se va en
        // cuanto se escribe la primera letra. Esta línea se queda.
        <p
          className="compositor__canales"
          style={{ color: 'var(--k-text-2)', fontSize: 12, margin: 0 }}
        >
          <span
            style={{
              color: colorCanal(conv.canal), display: 'inline-flex',
              flex: 'none', marginRight: 6, verticalAlign: 'text-bottom',
            }}
          >
            <LogoCanal canal={conv.canal} size={14} />
          </span>
          Respondes por {porDonde(conv)}
          <BotonPlantillas
            cuantas={plantillas.length + deEsteCanal.length}
            abierto={menu}
            onClick={() => { setMenu((v) => !v); setComando(null); setMarcada(0) }}
          />
        </p>
      )}

      {/* El bloque grande que vivía aquí —desplegable de plantillas de Meta más
          botón de enviar, cuatro filas de alto— se fue al menú único. Ocupaba
          sitio permanente para algo que se usa una vez cada varios días, y
          además solo aparecía fuera de la ventana, que es cuando nadie lo había
          visto todavía. */}
      {errorWa ? (
        <p className="error" role="alert" style={{ margin: 0 }}>{errorWa}</p>
      ) : null}

      {conv.ventana.motivo ? (
        <p
          className="compositor__aviso"
          style={{
            background: cerrada ? 'var(--k-escalada-bg)' : 'var(--k-esperando-bg)',
            color: cerrada ? 'var(--k-escalada-fg)' : 'var(--k-esperando-fg)',
          }}
        >
          {conv.ventana.motivo}
        </p>
      ) : null}

      {/* Las variables sin resolver se avisan ANTES de enviar, no se maquillan.
          Un "Hola , ¿cómo estás?" que sale al cliente es peor que no mandar
          nada, y el hueco vacío no se ve al releer. */}
      {faltan.length > 0 ? (
        <p
          className="compositor__aviso"
          style={{ background: 'var(--k-esperando-bg)', color: 'var(--k-esperando-fg)' }}
        >
          La plantilla tiene {faltan.length === 1 ? 'un hueco' : 'huecos'} que no se
          {faltan.length === 1 ? ' pudo' : ' pudieron'} rellenar: {faltan.join(', ')}. Complétalo
          a mano antes de enviar.
        </p>
      ) : null}

      {error ? <p className="error" role="alert" style={{ marginBottom: 8 }}>{error}</p> : null}

      <form onSubmit={enviar} className="compositor__caja">
        <div style={{ position: 'relative' }}>
          {/* EL MENÚ, uno para las dos formas de abrirlo: la barra en la caja y
              el botón de arriba. Encima de la caja y no debajo, porque debajo lo
              tapa el pie del compositor y, a pantalla completa, el borde de la
              ventana.

              CADA ELEMENTO DICE QUÉ VA A HACER. Las internas se insertan en la
              caja y se pueden corregir antes de mandar; las de Meta salen
              enteras y ya no se tocan. Mezclarlas sin decirlo sería la peor
              manera de ahorrar dos palabras. */}
          {(comando !== null || menu) && coincidencias.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Plantillas"
              style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
                margin: 0, padding: 4, listStyle: 'none', zIndex: 20,
                background: 'var(--k-surface)', border: '1px solid var(--k-border)',
                borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.16)',
                maxHeight: 300, overflowY: 'auto',
              }}
            >
              {coincidencias.map((pl, i) => {
                // La cabecera de grupo se pinta al cambiar de clase, no con dos
                // listas: con dos listas el índice del teclado se parte en dos y
                // las flechas dejan de recorrer el menú entero.
                const primeraMeta = pl.clase === 'meta' && coincidencias[i - 1]?.clase !== 'meta'
                const primeraInterna = pl.clase === 'interna' && i === 0
                  && coincidencias.some((x) => x.clase === 'meta')
                return (
                  <li key={`${pl.clase}-${pl.id}`}>
                    {primeraInterna || primeraMeta ? (
                      <p
                        style={{
                          margin: primeraMeta ? '8px 8px 4px' : '2px 8px 4px',
                          fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
                          color: 'var(--k-text-2)',
                        }}
                      >
                        {primeraMeta
                          ? `Se envían enteras · ${etiquetaCanal(conv.canal)}`
                          : 'Se insertan en la caja'}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === marcada}
                      // `onMouseDown` y no `onClick`: al hacer clic, el `blur` de
                      // la caja llega antes que el `click` y cerraba el menú, así
                      // que el clic caía sobre un elemento que ya no existía.
                      onMouseDown={(ev) => {
                        ev.preventDefault()
                        if (pl.clase === 'interna') void insertarComando(pl.id)
                        else {
                          setMenu(false); setComando(null)
                          setPrevia({ id: pl.id, nombre: pl.nombre })
                        }
                      }}
                      onMouseEnter={() => setMarcada(i)}
                      style={{
                        display: 'flex', width: '100%', gap: 8, alignItems: 'baseline',
                        padding: '6px 8px', border: 0, borderRadius: 7, cursor: 'pointer',
                        font: 'inherit', textAlign: 'left',
                        background: i === marcada ? 'var(--k-surface-2)' : 'transparent',
                        color: 'inherit',
                      }}
                    >
                      {pl.clase === 'meta' ? (
                        <span
                          style={{ color: colorCanal(conv.canal), display: 'inline-flex', flex: 'none' }}
                        >
                          <LogoCanal canal={conv.canal} size={13} />
                        </span>
                      ) : null}
                      <span style={{ fontWeight: 500, flex: 'none' }}>{pl.nombre}</span>
                      {pl.atajo ? (
                        <span style={{ fontSize: 12, color: 'var(--k-text-2)', flex: 'none' }}>
                          /{pl.atajo}
                        </span>
                      ) : null}
                      {pl.cuerpo ? (
                        <span
                          style={{
                            fontSize: 12, color: 'var(--k-text-2)', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {pl.cuerpo}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          <textarea
            ref={cajaTexto}
            className="campo"
            rows={2}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); revisarComando(e.currentTarget) }}
            onClick={(e) => { setMenu(false); revisarComando(e.currentTarget) }}
            onKeyUp={(e) => {
              // Las flechas mueven el cursor sin cambiar el texto: el comando
              // puede empezar o dejar de existir sin que haya `change`.
              if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
                revisarComando(e.currentTarget)
              }
            }}
            // El menú abierto con el icono NO se cierra al perder el foco: se
            // abre sin tocar la caja, así que cerrarlo por `blur` lo cerraría en
            // el mismo momento de abrirlo.
            onBlur={() => setComando(null)}
            disabled={cerrada || enviando}
            placeholder={
              // Con la ventana cerrada la caja no sirve, pero el botón de arriba
              // sí: decirlo aquí es lo único que se lee antes de rendirse.
              cerrada
                ? (deEsteCanal.length > 0
                  ? 'No se puede escribir libre por este canal · usa Plantillas, arriba'
                  : 'No se puede responder por este canal')
                : `Responder por ${porDonde(conv)} · escribe / para una plantilla`
            }
            aria-label="Mensaje"
            onKeyDown={(e) => {
              // CON EL MENÚ ABIERTO EL TECLADO ES DEL MENÚ. Si no, Enter enviaría
              // el mensaje con el «/segui» a medias dentro, que es justo lo que
              // el menú venía a evitar.
              const abierto = (comando !== null || menu) && coincidencias.length > 0
              if (abierto) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMarcada((m) => (m + 1) % coincidencias.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMarcada((m) => (m - 1 + coincidencias.length) % coincidencias.length)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  const el = coincidencias[marcada]!
                  if (el.clase === 'interna') void insertarComando(el.id)
                  else {
                    setMenu(false); setComando(null)
                    setPrevia({ id: el.id, nombre: el.nombre })
                  }
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setComando(null); setMenu(false)
                  return
                }
              }
              // Enter envía, Mayúsculas+Enter salta línea. Es lo que hace todo
              // el mundo en un chat y lo que el dedo espera.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
              }
            }}
          />
        </div>
        <div className="compositor__pie">
          {/* El desplegable de plantillas se fue de aquí al icono de arriba: una
              fila entera del compositor para una lista que se abre dos veces al
              día, en la pantalla donde el sitio se le debe al hilo. */}

          <span
            style={{
              fontSize: 12,
              color: pasado ? 'var(--k-escalada-fg)' : 'var(--k-text-2)',
              fontVariantNumeric: 'tabular-nums',
            }}
            title="Instagram cuenta BYTES, no caracteres: los acentos ocupan dos y los emojis hasta cuatro"
          >
            {bytes} / {tope} bytes
          </span>
          {/* El único sticker que la API de Instagram manda es el corazón:
              `attachment: {type: "like_heart"}`, sin archivo y sin payload. Los
              stickers propios y los de avatar no están soportados, así que no
              hay biblioteca que ofrecer — hay un botón, que es lo que existe.

              Solo en Instagram, y solo con la ventana abierta. */}
          {conv.canal === 'instagram' ? (
            <button
              type="button"
              className="operar__control"
              title="Mandar un corazón. Es el único sticker que la API de Instagram permite enviar."
              aria-label="Mandar un corazón"
              disabled={cerrada || enviando}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 15 }}
              onClick={async () => {
                setEnviando(true); setError(null)
                const { error } = await crearClienteNavegador()
                  .rpc('encolar_corazon', { p_conversacion: activa })
                setEnviando(false)
                if (error) { setError(error.message); return }
                router.refresh()
                alFondo()
                fetch('/api/despachar', { method: 'POST' }).catch(() => {})
                setTimeout(() => { router.refresh(); alFondo() }, 2500)
              }}
            >
              ❤️
            </button>
          ) : null}

          <button
            className="btn"
            type="submit"
            disabled={cerrada || enviando || pasado || !texto.trim()}
            style={{ padding: '8px 18px' }}
          >
            {enviando ? 'Enviando' : 'Enviar'}
          </button>
        </div>
      </form>
    </footer>
  )
}
