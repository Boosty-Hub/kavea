'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fechaHora } from '@/lib/fechas'

export type Conexion = {
  meta_connection_id: string
  organization_id: string
  page_name: string | null
  page_id: string
  ig_username: string | null
  en_verde: number
  en_rojo: number
  sin_saber: number
  bloqueada: boolean
  ultima_pasada: string | null
}

/**
 * Las conexiones de un espacio, con el gesto que las arregla.
 *
 * Volver a comprobar desde aquí NO es un atajo al break-glass: pregunta a Meta
 * por el estado de una Página y no toca ni una línea de lo que el cliente
 * escribió. La fricción del break-glass protege contenido; esto no lo tiene.
 */
export function Conexiones({ lista }: { lista: Conexion[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (lista.length === 0) {
    return <span style={{ color: 'var(--k-text-2)' }}>ninguno</span>
  }

  async function comprobar(id: string) {
    setOcupado(id); setError(null)
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
    setOcupado(null)
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {error ? <span style={{ color: 'var(--k-escalada-fg)', fontSize: 12 }}>{error}</span> : null}
      {lista.map((c) => (
        <div key={c.meta_connection_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            aria-hidden="true"
            style={{
              width: 8, height: 8, borderRadius: '50%', flex: 'none',
              background: c.bloqueada ? 'var(--k-escalada-fg)'
                : c.en_rojo > 0 ? 'var(--k-esperando-fg)' : 'var(--k-resuelta-fg)',
            }}
          />
          <span style={{ fontSize: 13 }}>{c.page_name ?? c.page_id}</span>
          {c.ig_username ? (
            <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>@{c.ig_username}</span>
          ) : null}
          <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
            {c.en_verde} bien{c.en_rojo > 0 ? `, ${c.en_rojo} mal` : ''}
            {c.sin_saber > 0 ? `, ${c.sin_saber} sin saber` : ''}
            {c.ultima_pasada ? ` · ${fechaHora(c.ultima_pasada, 'UTC')}` : ' · sin comprobar'}
          </span>
          <button
            type="button"
            onClick={() => comprobar(c.meta_connection_id)}
            disabled={ocupado !== null}
            style={{
              border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
              font: 'inherit', fontSize: 12, color: 'var(--k-accent)',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {ocupado === c.meta_connection_id ? 'comprobando' : 'volver a comprobar'}
          </button>
        </div>
      ))}
    </div>
  )
}
