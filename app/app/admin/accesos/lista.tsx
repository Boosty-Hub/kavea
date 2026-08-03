'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { fechaHora } from '@/lib/fechas'
import type { FilaAcceso } from '@/lib/panel'

/**
 * La lista de accesos, con el botón de cortar.
 *
 * REVOCAR NO BORRA. Acorta la caducidad a «ahora». Borrar la fila borraría la
 * prueba de que el acceso existió, y eso es exactamente lo contrario de para lo
 * que sirve esta pantalla: un registro que se puede limpiar no es un registro.
 */
export function Accesos({ lista }: { lista: FilaAcceso[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function revocar(a: FilaAcceso) {
    if (!confirm(`Cortar el acceso de ${a.quien} a ${a.organizacion}.`)) return
    setOcupado(a.id); setError(null)
    const { error } = await crearClienteNavegador().rpc('revocar_acceso', { p_grant: a.id })
    setOcupado(null)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  if (lista.length === 0) {
    return <p className="muted" style={{ marginTop: 24 }}>Todavía no se ha pedido ninguno.</p>
  }

  return (
    <div style={{ marginTop: 24 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="tarjeta" style={{ padding: 0, overflow: 'hidden' }}>
        {lista.map((a) => (
          <div key={a.id} className="miembro" style={{ alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{
                flex: 'none', width: 8, height: 8, borderRadius: '50%', marginTop: 7,
                background: a.vigente ? 'var(--k-escalada-fg)' : 'var(--k-border)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>
                {a.organizacion}
                <span style={{ fontWeight: 400, color: 'var(--k-text-2)' }}> · {a.quien}</span>
              </div>
              {/* El motivo es lo único que hace que esto sirva. Sin él, un
                  registro de accesos solo dice que alguien miró. */}
              <div style={{ fontSize: 13, marginTop: 2 }}>{a.motivo}</div>
              <div style={{ fontSize: 12, color: 'var(--k-text-2)', marginTop: 2 }}>
                {fechaHora(a.created_at, 'UTC')} → {fechaHora(a.expira_en, 'UTC')} UTC
              </div>
            </div>
            {a.vigente ? (
              <button
                type="button"
                className="operar__control"
                style={{ cursor: 'pointer', flex: 'none', fontSize: 13 }}
                disabled={ocupado !== null}
                onClick={() => revocar(a)}
              >
                {ocupado === a.id ? 'Cortando' : 'Cortar'}
              </button>
            ) : (
              <span style={{ flex: 'none', fontSize: 12, color: 'var(--k-text-2)' }}>caducado</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
