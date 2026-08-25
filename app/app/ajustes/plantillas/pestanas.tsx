'use client'

import { useState, type ReactNode } from 'react'

/**
 * Las tres clases de plantilla, una por pestaña.
 *
 * POR QUÉ CAMBIÓ. Antes las tres estaban en la misma página, una debajo de otra,
 * con un cuadro arriba explicando en qué se diferencian. El cuadro existía porque
 * la pantalla no se entendía sola, que es la señal de que la pantalla estaba mal:
 * el 24-ago se intentó crear una plantilla de WhatsApp en el bloque de Messenger,
 * que es otro producto de Meta con otras reglas y otra cuenta detrás.
 *
 * SON TRES Y NO DOS, aunque se pidieran dos. Messenger e Instagram usan plantillas
 * de la PÁGINA; WhatsApp, de la cuenta de WhatsApp; y las internas no salen de
 * Kavea. Meterlas juntas para que sean dos sería volver a mezclar justo lo que se
 * estaba confundiendo.
 *
 * CADA PESTAÑA SE MONTA AL ABRIRLA, y eso es deliberado: las de Meta se leen en
 * vivo, y volver a una pestaña es la forma natural de pedir el estado de nuevo.
 */

type Cual = 'internas' | 'whatsapp' | 'messenger'

const PESTANAS: Array<{ id: Cual; nombre: string; pie: string }> = [
  {
    id: 'internas',
    nombre: 'Internas',
    pie: 'Respuestas rápidas del equipo. No las aprueba nadie, se editan cuando quieras y sus '
      + 'huecos llevan nombre —{{contacto.nombre}}—, no número.',
  },
  {
    id: 'whatsapp',
    nombre: 'WhatsApp',
    pie: 'Viven en la cuenta de WhatsApp del negocio y las aprueba Meta. Hacen falta para '
      + 'escribir fuera de las 24 horas; dentro de la ventana se responde con texto normal.',
  },
  {
    id: 'messenger',
    nombre: 'Messenger',
    pie: 'Otra cosa distinta: viven en la Página de Facebook, no en la cuenta de WhatsApp. '
      + 'Solo admiten avisos de utilidad —pedido, cita, cuenta— y las aprueba Meta en segundos.',
  },
]

export function PestanasPlantillas({
  internas, whatsapp, messenger,
}: {
  internas: ReactNode
  whatsapp: ReactNode
  messenger: ReactNode
}) {
  const [cual, setCual] = useState<Cual>('internas')
  const activa = PESTANAS.find((p) => p.id === cual)!

  return (
    <div style={{ marginTop: 20 }}>
      <div role="tablist" aria-label="Clases de plantilla" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={cual === p.id}
            className="operar__control"
            style={{
              cursor: 'pointer', fontSize: 13,
              borderColor: cual === p.id ? 'var(--k-accent)' : undefined,
              color: cual === p.id ? 'var(--k-accent)' : undefined,
            }}
            onClick={() => setCual(p.id)}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {/* La explicación va DEBAJO de la pestaña elegida y solo la suya. Tres
          párrafos a la vez es lo que había antes, y es lo que no se leía. */}
      <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '10px 0 0', maxWidth: 640 }}>
        {activa.pie}
      </p>

      <div style={{ marginTop: 4 }}>
        {cual === 'internas' ? internas : cual === 'whatsapp' ? whatsapp : messenger}
      </div>
    </div>
  )
}
