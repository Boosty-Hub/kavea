'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * La vista previa de una plantilla, antes de mandarla.
 *
 * POR QUÉ EXISTE. Una plantilla de Meta se envía ENTERA: no se puede corregir
 * después, sale tal cual y se factura. El aviso anterior era un `confirm()` del
 * navegador con el nombre técnico dentro —«Enviar pedido_devuelto»— sin una sola
 * palabra de lo que la persona iba a recibir. Confirmar sin ver es firmar sin
 * leer.
 *
 * Y SI FALTA UN DATO SE PIDE AQUÍ. Antes el envío se negaba diciendo qué faltaba
 * y en qué bloque de la ficha se rellenaba; había que ir, buscarlo, escribirlo y
 * volver. Ahora el hueco se rellena en el mismo diálogo y `rellenar_variable` lo
 * escribe donde el dato vive de verdad —el nombre en la persona, el importe en la
 * ficha, un campo personalizado en su valor— así que queda guardado y no solo
 * pegado en este mensaje.
 *
 * LO QUE NO SE PIDE AQUÍ. La etapa del embudo es una lista cerrada y el nombre de
 * quien escribe sale de la sesión: pedirlos en una caja de texto produciría datos
 * inventados. Esos se marcan con dónde se tocan y el envío sigue bloqueado hasta
 * que se toquen.
 */

type Hueco = {
  marca: string
  clave: string | null
  etiqueta: string
  valor: string | null
  falta: boolean
  rellenable: boolean
  donde: string | null
}

export function PreviaPlantilla({
  plantillaId, nombre, tarjetaId, canal, dentroDeVentana, alCerrar, alEnviar,
}: {
  plantillaId: string
  nombre: string
  tarjetaId: string
  canal: string
  /** Con la ventana abierta el envío se factura sin necesidad: se dice. */
  dentroDeVentana: boolean
  alCerrar: () => void
  /** Manda de verdad. Lo hace el compositor, que es quien despacha y refresca. */
  alEnviar: () => Promise<void>
}) {
  const [texto, setTexto] = useState<string | null>(null)
  const [huecos, setHuecos] = useState<Hueco[]>([])
  const [escrito, setEscrito] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const caja = useRef<HTMLDivElement | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: err } = await crearClienteNavegador()
      .rpc('vista_previa_plantilla', { p_plantilla: plantillaId, p_tarjeta: tarjetaId })
    if (err) { setError(err.message); return }
    const r = (data as Array<{ texto: string; huecos: Hueco[] }>)?.[0]
    setTexto(r?.texto ?? '')
    setHuecos(r?.huecos ?? [])
  }, [plantillaId, tarjetaId])

  useEffect(() => { void cargar() }, [cargar])

  // Escape cierra. Es lo que el dedo prueba primero en cualquier diálogo, y sin
  // esto el único camino era encontrar el botón.
  useEffect(() => {
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') alCerrar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [alCerrar])

  const faltan = huecos.filter((h) => h.falta)
  const pendientesSinArreglo = faltan.filter((h) => !h.rellenable)
  const sinEscribir = faltan.filter((h) => h.rellenable && !(escrito[h.clave ?? ''] ?? '').trim())
  const listo = pendientesSinArreglo.length === 0 && sinEscribir.length === 0

  /**
   * El texto tal como quedará, con lo que se acaba de escribir ya puesto.
   *
   * Se sustituye sobre la marcha en vez de volver a pedir la vista previa a cada
   * tecla: una ida y vuelta por pulsación haría que la frase parpadeara mientras
   * se escribe, y el valor es el mismo que se va a guardar.
   */
  const textoFinal = huecos.reduce((t, h) => {
    const v = (escrito[h.clave ?? ''] ?? '').trim()
    return h.falta && v ? t.replace('[falta]', v) : t
  }, texto ?? '')

  async function confirmar() {
    if (!listo || ocupado) return
    setOcupado(true); setError(null)
    const cliente = crearClienteNavegador()

    // Primero se GUARDAN los datos, y solo si todos entran se manda. Al revés
    // —mandar y luego guardar— dejaría el mensaje fuera con un dato que aquí no
    // consta, y no hay forma de retirarlo.
    for (const h of faltan) {
      const v = (escrito[h.clave ?? ''] ?? '').trim()
      const { error: err } = await cliente.rpc('rellenar_variable', {
        p_tarjeta: tarjetaId, p_clave: h.clave, p_valor: v,
      })
      if (err) { setOcupado(false); setError(err.message); return }
    }

    try {
      await alEnviar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Enviar la plantilla ${nombre}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,.42)', padding: 16,
      }}
    >
      <div
        ref={caja}
        style={{
          width: 'min(560px, 100%)', maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--k-surface)', border: '1px solid var(--k-border)',
          borderRadius: 14, padding: 20, display: 'grid', gap: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,.28)',
        }}
      >
        <div>
          <p className="label" style={{ margin: 0 }}>Plantilla de {canal}</p>
          <h2 style={{ fontSize: 17, margin: '2px 0 0' }}><code>{nombre}</code></h2>
        </div>

        {texto === null ? (
          <p style={{ color: 'var(--k-text-2)', margin: 0 }}>Preparando la vista previa…</p>
        ) : (
          <>
            {/* CÓMO VA A LLEGAR, y con la burbuja del hilo a propósito: se compara
                con lo que ya hay en la conversación sin traducir de la cabeza. */}
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="label">Así le va a llegar</span>
              <div
                className="burbuja__caja"
                style={{ whiteSpace: 'pre-wrap', fontSize: 14, padding: '10px 12px' }}
              >
                {textoFinal}
              </div>
            </div>

            {huecos.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <span className="label">Los datos que lleva</span>
                {huecos.map((h) => {
                  const v = (escrito[h.clave ?? ''] ?? '')
                  if (!h.falta) {
                    return (
                      <div
                        key={h.marca}
                        style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}
                      >
                        <span style={{ color: 'var(--k-text-2)', minWidth: 150 }}>{h.etiqueta}</span>
                        <strong style={{ fontWeight: 500 }}>{h.valor}</strong>
                      </div>
                    )
                  }
                  if (!h.rellenable) {
                    return (
                      <p key={h.marca} className="error" role="alert" style={{ margin: 0, fontSize: 13 }}>
                        Falta <strong>{h.etiqueta}</strong> y no se escribe desde aquí
                        {h.donde ? `: ${h.donde}` : null}.
                      </p>
                    )
                  }
                  return (
                    <label key={h.marca} style={{ display: 'grid', gap: 4 }}>
                      <span className="label">
                        {h.etiqueta}
                        <span style={{ color: 'var(--k-accent)' }}> · falta</span>
                      </span>
                      <input
                        className="campo"
                        value={v}
                        disabled={ocupado}
                        onChange={(e) => setEscrito((m) => ({ ...m, [h.clave ?? '']: e.target.value }))}
                        autoFocus={h === sinEscribir[0]}
                      />
                      <span className="ficha__ayuda">
                        Se guarda {h.donde ?? 'en la ficha'}, no solo en este mensaje.
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}

            {dentroDeVentana ? (
              <p
                className="compositor__aviso"
                style={{ background: 'var(--k-esperando-bg)', color: 'var(--k-esperando-fg)' }}
              >
                La ventana está abierta: puedes responder con texto normal, que no cuesta nada. Una
                plantilla se factura como conversación.
              </p>
            ) : null}

            {error ? <p className="error" role="alert" style={{ margin: 0 }}>{error}</p> : null}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="operar__control"
                style={{ cursor: 'pointer' }}
                onClick={alCerrar}
                disabled={ocupado}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void confirmar()}
                disabled={!listo || ocupado}
                title={
                  listo
                    ? undefined
                    : 'Faltan datos: rellénalos arriba o cámbialos donde dice cada uno'
                }
              >
                {ocupado
                  ? 'Enviando'
                  : faltan.length > 0 ? 'Guardar y enviar' : 'Enviar la plantilla'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
