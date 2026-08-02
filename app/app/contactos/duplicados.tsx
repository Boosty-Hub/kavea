'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Duplicado } from '@/lib/registro'

/**
 * Posibles duplicados.
 *
 * NO une nada solo, y eso no es prudencia excesiva. El documento 02 lo fija:
 * «Maria Gonzalez» en Instagram y «María González» en Messenger pueden ser dos
 * personas distintas, y una fusión errónea muestra la conversación de un cliente
 * bajo el nombre de otro. Eso es una incidencia de privacidad, no un error de
 * datos.
 *
 * Por eso cada pareja lleva la FUERZA de la señal a la vista. Un teléfono
 * repetido es determinista; un nombre repetido es una coincidencia que hay que
 * mirar. Presentar las dos igual invitaría a unir en cadena sin pensar.
 */
export function Duplicados({ parejas }: { parejas: Duplicado[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [descartadas, setDescartadas] = useState<string[]>([])

  const visibles = parejas.filter((p) => !descartadas.includes(`${p.a_id}|${p.b_id}`))
  if (visibles.length === 0) return null

  async function unir(p: Duplicado) {
    const motivo = prompt(
      `Unir «${p.b_nombre}» dentro de «${p.a_nombre}».\n\n` +
      `Sus canales, asuntos e historial pasan a la primera. Se puede deshacer.\n\n` +
      `¿Por qué son la misma persona? (mínimo 8 caracteres)`,
      p.motivo,
    )
    if (!motivo || motivo.trim().length < 8) return

    setOcupado(true); setError(null)
    const supabase = crearClienteNavegador()

    // Se unen las TARJETAS, que es la operación que además unifica la persona.
    // Hacen falta las tarjetas vivas de cada uno.
    const { data: tj } = await supabase
      .from('tarjetas')
      .select('id, contact_id')
      .in('contact_id', [p.a_id, p.b_id])
      .is('cerrada_en', null)

    const filas = (tj ?? []) as Array<{ id: string; contact_id: string }>
    const a = filas.find((t) => t.contact_id === p.a_id)
    const b = filas.find((t) => t.contact_id === p.b_id)

    if (!a || !b) {
      setOcupado(false)
      setError(
        'Uno de los dos no tiene un asunto abierto. Ábrelo desde su conversación y únelos ahí.',
      )
      return
    }

    const { error } = await supabase.rpc('unir_tarjetas', {
      p_superviviente: a.id, p_absorbida: b.id, p_motivo: motivo,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  return (
    <section className="tarjeta" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--k-border)' }}>
        <strong style={{ fontWeight: 500 }}>
          Puede que sean la misma persona ({visibles.length})
        </strong>
        <div className="ficha__ayuda">
          Kavea no las une sola. Una unión equivocada muestra la conversación de un cliente
          bajo el nombre de otro.
        </div>
      </header>

      {error ? <p className="error" style={{ margin: 12 }} role="alert">{error}</p> : null}

      {visibles.map((p) => (
        <div key={`${p.a_id}|${p.b_id}`} className="contacto">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>
              <strong style={{ fontWeight: 500 }}>{p.a_nombre}</strong>
              <span style={{ color: 'var(--k-text-2)' }}> y </span>
              <strong style={{ fontWeight: 500 }}>{p.b_nombre}</strong>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
              <span
                className="pildora"
                style={p.fuerza === 'fuerte'
                  ? { background: 'var(--k-escalada-bg)', color: 'var(--k-escalada-fg)' }
                  : { background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}
              >
                {p.fuerza === 'fuerte' ? 'Señal fuerte' : 'Solo el nombre'}
              </span>
              <span className="ficha__ayuda">{p.motivo}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            <button type="button" className="operar__control" style={{ cursor: 'pointer' }}
              disabled={ocupado} onClick={() => unir(p)}>
              Unir
            </button>
            <button
              type="button" className="operar__control" style={{ cursor: 'pointer' }}
              onClick={() => setDescartadas((d) => [...d, `${p.a_id}|${p.b_id}`])}
              title="Solo la oculta en esta pantalla. No cambia nada en los datos."
            >
              No son
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
