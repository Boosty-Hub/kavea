'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { fechaHora } from '@/lib/fechas'
import { etiquetaCanal, colorCanal } from '@/lib/ventana'
import type { FilaSolicitud } from '@/lib/panel'

/**
 * Las solicitudes, y en qué punto está cada una.
 *
 * Los estados son los del embudo comercial de verdad, no «leída / no leída»:
 * lo que hace falta saber es si alguien la contestó, si la demo llegó a pasar y
 * si acabó en cliente. Con «leída» nadie sabe qué hacer al día siguiente.
 */
const ESTADOS = [
  { v: 'nueva', n: 'Sin atender', c: 'var(--k-escalada-fg)' },
  { v: 'contactada', n: 'Contactada', c: 'var(--k-esperando-fg)' },
  { v: 'demo_hecha', n: 'Demo hecha', c: 'var(--k-curso-fg)' },
  { v: 'cliente', n: 'Cliente', c: 'var(--k-resuelta-fg)' },
  { v: 'descartada', n: 'Descartada', c: 'var(--k-text-2)' },
] as const

export function Solicitudes({ lista }: { lista: FilaSolicitud[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function mover(s: FilaSolicitud, estado: string) {
    setOcupado(s.id); setError(null)
    const { error } = await crearClienteNavegador()
      .rpc('mover_solicitud', { p_solicitud: s.id, p_estado: estado })
    setOcupado(null)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  if (lista.length === 0) {
    return (
      <p className="muted" style={{ marginTop: 24 }}>
        Todavía no ha pedido demo nadie. El formulario está en kavea.ai/demo.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {lista.map((s) => {
        const e = ESTADOS.find((x) => x.v === s.estado) ?? ESTADOS[0]
        return (
          <div
            key={s.id}
            className="tarjeta"
            style={{ borderColor: s.estado === 'nueva' ? 'var(--k-escalada-fg)' : 'var(--k-border)' }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 500 }}>
                  {s.nombre}
                  {s.negocio ? (
                    <span style={{ fontWeight: 400, color: 'var(--k-text-2)' }}> · {s.negocio}</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>
                  {/* Enlaces de verdad: el gesto siguiente es escribirle o
                      llamarle, y copiar a mano un correo de una tabla es
                      exactamente donde se pierde media hora al día. */}
                  <a href={`mailto:${s.correo}`} style={{ color: 'var(--k-accent)' }}>{s.correo}</a>
                  {s.telefono ? (
                    <> · <a href={`tel:${s.telefono}`} style={{ color: 'var(--k-accent)' }}>{s.telefono}</a></>
                  ) : null}
                </div>

                {s.canales.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {s.canales.map((c) => (
                      <span key={c} className="pildora"
                        style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}>
                        <span className="pildora__punto" style={{ background: colorCanal(c) }} aria-hidden="true" />
                        {etiquetaCanal(c)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {s.mensaje ? (
                  <p style={{ fontSize: 13, marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                    {s.mensaje}
                  </p>
                ) : null}

                <div style={{ fontSize: 12, color: 'var(--k-text-2)', marginTop: 8 }}>
                  {fechaHora(s.created_at, 'UTC')} UTC
                  {s.origen ? ` · llegó desde ${s.origen}` : ''}
                  {s.atendida_en ? ` · movida el ${fechaHora(s.atendida_en, 'UTC')}` : ''}
                </div>
              </div>

              <div style={{ flex: 'none', display: 'grid', gap: 6, justifyItems: 'end' }}>
                <span style={{ fontSize: 12, color: e.c }}>{e.n}</span>
                <select
                  className="operar__control"
                  value={s.estado}
                  disabled={ocupado !== null}
                  aria-label={`Estado de la solicitud de ${s.nombre}`}
                  onChange={(ev) => mover(s, ev.target.value)}
                >
                  {ESTADOS.map((x) => (
                    <option key={x.v} value={x.v}>{x.n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
