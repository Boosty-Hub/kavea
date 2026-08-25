'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
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
  const [plantillaWa, setPlantillaWa] = useState('')
  const [mandandoWa, setMandandoWa] = useState(false)
  const [errorWa, setErrorWa] = useState<string | null>(null)

  const conv = conversaciones.find((c) => c.id === activa)
  if (!conv) return null

  const bytes = new TextEncoder().encode(texto).length
  const tope = conv.canal === 'instagram' ? 1000 : 4000
  const pasado = bytes > tope
  const cerrada = conv.ventana.clase === 'cerrada'

  /**
   * CUÁNDO SE OFRECE UNA PLANTILLA, y no es lo mismo en los dos canales.
   *
   * WhatsApp: solo con la ventana cerrada. Dentro de las 24 h el texto libre es
   * gratis y una plantilla se factura por conversación, así que ofrecerla antes
   * sería empujar a un cargo evitable.
   *
   * Messenger: en cuanto la ventana deja de estar abierta —pasadas las 24 h—,
   * porque ahí ya no hay texto libre gratis. Entre las 24 h y los 7 días existe
   * la prórroga humana, pero exige que conteste una persona y por un motivo
   * real; un aviso de utilidad no es eso, y para eso está `messaging_type`
   * UTILITY, que es justo el permiso que Meta concede con
   * `pages_utility_messaging`.
   */
  const deEsteCanal = conv.canal === 'whatsapp' ? plantillasWa
    : conv.canal === 'messenger' ? plantillasMs
      : []
  const cabePlantilla = conv.canal === 'whatsapp'
    ? cerrada
    : conv.canal === 'messenger' && conv.ventana.clase !== 'abierta'

  /**
   * Mandar la plantilla. Los huecos NO se piden aquí: los resuelve
   * `encolar_plantilla` contra la ficha, y si falta alguno se niega a encolar
   * con el nombre del que falta. Preguntarlos en el compositor sería duplicar la
   * ficha en un formulario y dejar que se separen.
   */
  /** Las internas que encajan con lo escrito tras la barra. */
  const coincidencias = comando === null
    ? []
    : plantillas.filter((pl) => {
      const t = llano(comando.token)
      if (!t) return true
      return llano(pl.nombre).includes(t) || (pl.atajo ? llano(pl.atajo).startsWith(t) : false)
    }).slice(0, 8)

  /**
   * Insertar la plantilla donde estaba el comando.
   *
   * El texto lo resuelve la BASE con `renderizar_plantilla`, la misma función
   * que usa el desplegable: resolver las variables aquí sería una segunda
   * implementación de lo mismo, y dos implementaciones de las variables se
   * separan.
   */
  async function insertarComando(id: string) {
    if (comando === null || insertando) return
    const caja = cajaTexto.current
    const fin = caja?.selectionStart ?? (comando.inicio + comando.token.length + 1)
    setInsertando(true)
    const { data, error: err } = await crearClienteNavegador()
      .rpc('renderizar_plantilla', { p_plantilla: id, p_tarjeta: tarjetaId })
    setInsertando(false)
    if (err) { setError(err.message); return }
    const r = (data as Array<{ texto: string; faltan: string[] }>)?.[0]
    if (!r) return
    const nuevo = texto.slice(0, comando.inicio) + r.texto + texto.slice(fin)
    setTexto(nuevo)
    setFaltan(r.faltan ?? [])
    setComando(null); setMarcada(0)
    const corte = comando.inicio + r.texto.length
    requestAnimationFrame(() => { caja?.focus(); caja?.setSelectionRange(corte, corte) })
  }

  /** Recalcula si hay comando en curso, con el cursor donde esté. */
  function revisarComando(caja: HTMLTextAreaElement) {
    const c = comandoEnCurso(caja.value, caja.selectionStart ?? caja.value.length)
    setComando(c)
    setMarcada(0)
  }

  const convId = conv.id
  async function mandarPlantilla() {
    if (!plantillaWa) return
    setMandandoWa(true); setErrorWa(null)
    const { error } = await crearClienteNavegador()
      .rpc('encolar_plantilla', { p_conversacion: convId, p_plantilla: plantillaWa })
    setMandandoWa(false)
    if (error) { setErrorWa(error.message); return }
    setPlantillaWa('')
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
    <footer className="compositor">
      {conversaciones.length > 1 ? (
        <div className="compositor__canales">
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
        </p>
      )}

      {/* LA SALIDA CUANDO NO HAY SALIDA. Solo fuera de la ventana y solo con
          plantillas ya emparejadas: ofrecerla en cualquier otro caso sería
          empujar a un envío facturado que se podía haber hecho con texto normal
          y gratis. Ver `cabePlantilla` para la diferencia entre canales. */}
      {cabePlantilla && deEsteCanal.length > 0 ? (
        <div
          className="compositor__aviso"
          style={{ background: 'var(--k-surface-2)', display: 'grid', gap: 8 }}
        >
          <span style={{ fontSize: 13 }}>
            {conv.canal === 'whatsapp'
              ? 'Fuera de las 24 horas solo se puede escribir con una plantilla aprobada. '
              : 'Fuera de las 24 horas, un aviso de utilidad aprobado por Meta llega sin '
                + 'necesidad de que conteste una persona. '}
            Los huecos se rellenan solos con los datos de la ficha.
          </span>
          {errorWa ? <span className="error" role="alert">{errorWa}</span> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="campo"
              style={{ flex: '1 1 240px' }}
              value={plantillaWa}
              onChange={(e) => { setPlantillaWa(e.target.value); setErrorWa(null) }}
              aria-label={`Plantilla de ${conv.canal === 'whatsapp' ? 'WhatsApp' : 'Messenger'}`}
            >
              <option value="">Elegir plantilla…</option>
              {deEsteCanal.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!plantillaWa || mandandoWa}
              onClick={() => void mandarPlantilla()}
            >
              {mandandoWa ? 'Enviando' : 'Enviar plantilla'}
            </button>
          </div>
          {plantillaWa ? (
            <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
              {deEsteCanal.find((p) => p.id === plantillaWa)?.cuerpo}
            </span>
          ) : null}
        </div>
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
          {/* EL MENÚ DEL COMANDO, encima de la caja y no debajo: debajo lo tapa
              el pie del compositor, y el borde inferior de la ventana lo tapa
              del todo cuando el hilo está a pantalla completa. */}
          {comando !== null && coincidencias.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Plantillas"
              style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
                margin: 0, padding: 4, listStyle: 'none', zIndex: 20,
                background: 'var(--k-surface)', border: '1px solid var(--k-border)',
                borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.16)',
                maxHeight: 260, overflowY: 'auto',
              }}
            >
              {coincidencias.map((pl, i) => (
                <li key={pl.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === marcada}
                    // `onMouseDown` y no `onClick`: al hacer clic, el `blur` de
                    // la caja llega antes que el `click` y cierra el menú, así
                    // que el clic caía sobre un elemento que ya no existía.
                    onMouseDown={(ev) => { ev.preventDefault(); void insertarComando(pl.id) }}
                    onMouseEnter={() => setMarcada(i)}
                    style={{
                      display: 'flex', width: '100%', gap: 8, alignItems: 'baseline',
                      padding: '6px 8px', border: 0, borderRadius: 7, cursor: 'pointer',
                      font: 'inherit', textAlign: 'left',
                      background: i === marcada ? 'var(--k-surface-2)' : 'transparent',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{pl.nombre}</span>
                    {pl.atajo ? (
                      <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>/{pl.atajo}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <textarea
            ref={cajaTexto}
            className="campo"
            rows={2}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); revisarComando(e.currentTarget) }}
            onClick={(e) => revisarComando(e.currentTarget)}
            onKeyUp={(e) => {
              // Las flechas mueven el cursor sin cambiar el texto: el comando
              // puede empezar o dejar de existir sin que haya `change`.
              if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
                revisarComando(e.currentTarget)
              }
            }}
            onBlur={() => setComando(null)}
            disabled={cerrada || enviando}
            placeholder={
              cerrada
                ? 'No se puede responder por este canal'
                : `Responder por ${porDonde(conv)} · escribe / para una plantilla`
            }
            aria-label="Mensaje"
            onKeyDown={(e) => {
              // CON EL MENÚ ABIERTO EL TECLADO ES DEL MENÚ. Si no, Enter enviaría
              // el mensaje con el «/segui» a medias dentro, que es justo lo que
              // el menú venía a evitar.
              const abierto = comando !== null && coincidencias.length > 0
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
                  void insertarComando(coincidencias[marcada]!.id)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setComando(null)
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
          {plantillas.length > 0 ? (
            <select
              className="operar__control"
              value=""
              disabled={cerrada || enviando}
              aria-label="Insertar una plantilla"
              onChange={async (e) => {
                const id = e.target.value
                if (!id) return
                e.target.value = ''
                // Se resuelve en la base, con la misma función que usará
                // cualquier automatización futura. Resolver aquí sería una
                // segunda implementación de las variables.
                const { data, error } = await crearClienteNavegador()
                  .rpc('renderizar_plantilla', { p_plantilla: id, p_tarjeta: tarjetaId })
                if (error) { setError(error.message); return }
                const r = (data as Array<{ texto: string; faltan: string[] }>)?.[0]
                if (!r) return
                setTexto((t) => (t ? `${t}\n${r.texto}` : r.texto))
                setFaltan(r.faltan ?? [])
              }}
            >
              <option value="">Plantilla…</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}{p.atajo ? ` · /${p.atajo}` : ''}
                </option>
              ))}
            </select>
          ) : null}

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
