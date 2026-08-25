'use client'

import { useState } from 'react'
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
        <textarea
          className="campo"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={cerrada || enviando}
          placeholder={
            cerrada
              ? 'No se puede responder por este canal'
              : `Responder por ${porDonde(conv)}`
          }
          aria-label="Mensaje"
          onKeyDown={(e) => {
            // Enter envía, Mayúsculas+Enter salta línea. Es lo que hace todo
            // el mundo en un chat y lo que el dedo espera.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
            }
          }}
        />
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
