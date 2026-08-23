'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Comentario } from '@/lib/comentarios'

/**
 * Responder, ignorar o reabrir un comentario, y traerlos de Meta.
 *
 * Mismas tres llamadas que ya usaba `app/comentarios/panel.tsx`
 * (`/api/comentarios`, `marcar_comentario`, y el propio POST de sincronizar):
 * esta pantalla no inventa un camino nuevo, solo lo enseña como un hilo de
 * chat en vez de una tarjeta suelta.
 */
export function ResponderComentario({ c }: { c: Comentario }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function responder() {
    if (!texto.trim()) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario: c.id, texto }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo publicar la respuesta.'); return }
      setTexto('')
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function marcar(estado: 'nuevo' | 'ignorado') {
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador()
      .rpc('marcar_comentario', { p_comentario: c.id, p_estado: estado })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  async function sincronizar() {
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'sincronizar' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo leer de Meta.'); return }
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ padding: '12px 24px', borderTop: '1px solid var(--k-border)', display: 'grid', gap: 8 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {c.estado === 'nuevo' ? (
          <button type="button" className="operar__control" style={{ cursor: 'pointer', fontSize: 13 }} disabled={ocupado} onClick={() => void marcar('ignorado')}>
            Ignorar
          </button>
        ) : null}
        {c.estado === 'ignorado' ? (
          <button type="button" className="operar__control" style={{ cursor: 'pointer', fontSize: 13 }} disabled={ocupado} onClick={() => void marcar('nuevo')}>
            Reabrir
          </button>
        ) : null}
        <button type="button" className="operar__control" style={{ cursor: 'pointer', fontSize: 13, marginLeft: 'auto' }} disabled={ocupado} onClick={() => void sincronizar()}>
          {ocupado ? 'Leyendo de Meta' : 'Traer de Meta'}
        </button>
      </div>

      {c.oculto ? (
        <p className="ficha__ayuda" style={{ margin: 0 }}>
          Meta lo marcó como oculto. Seguir respondiendo aquí es hablarle a una pared: solo
          quien ya tenía el enlace directo puede verlo.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            className="campo"
            rows={2}
            style={{ flex: 1 }}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            placeholder="Responder en público — lo verá cualquiera que pase por la publicación"
            aria-label="Respuesta pública al comentario"
          />
          <button type="button" className="btn" disabled={ocupado || !texto.trim()} onClick={() => void responder()}>
            {ocupado ? 'Publicando' : 'Publicar'}
          </button>
        </div>
      )}
    </div>
  )
}
