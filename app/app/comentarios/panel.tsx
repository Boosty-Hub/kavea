'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Comentario } from '@/lib/comentarios'
import { colorCanal, etiquetaCanal, haceCuanto } from '@/lib/ventana'

/**
 * Los comentarios, y responderlos.
 *
 * LA ADVERTENCIA DE ARRIBA NO ES DECORACIÓN. Un comentario es público: lo lee
 * cualquiera que pase por la publicación, no solo quien lo escribió. Quien
 * atiende viene de la bandeja, donde todo es privado, y el gesto es idéntico —
 * una caja de texto y un botón—. Sin decirlo en la pantalla, alguien acabará
 * contestando aquí con el número de pedido o el teléfono que el cliente dio por
 * privado.
 */

const ESTADOS: Record<string, { etiqueta: string; fg: string; bg: string }> = {
  nuevo:      { etiqueta: 'Nuevo', fg: 'var(--k-curso-fg)', bg: 'var(--k-curso-bg)' },
  respondido: { etiqueta: 'Respondido', fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)' },
  ignorado:   { etiqueta: 'Ignorado', fg: 'var(--k-text-2)', bg: 'var(--k-surface-2)' },
}

export function PanelComentarios({
  comentarios, huso,
}: {
  comentarios: Comentario[]
  huso: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function responder(c: Comentario) {
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
      setTexto(''); setAbierto(null)
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  async function marcar(c: Comentario, estado: 'nuevo' | 'ignorado') {
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador()
      .rpc('marcar_comentario', { p_comentario: c.id, p_estado: estado })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  if (comentarios.length === 0) {
    return (
      <p className="ficha__vacia" style={{ marginTop: 24 }}>
        No hay comentarios todavía. Llegan solos cuando alguien comenta una publicación
        de las cuentas conectadas.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {comentarios.map((c) => {
        const e = ESTADOS[c.estado] ?? ESTADOS.nuevo!
        return (
          <article key={c.id} className="tarjeta" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                className="pildora__punto"
                style={{ background: colorCanal(c.canal) }}
                aria-hidden="true"
              />
              <strong style={{ fontWeight: 500 }}>
                {c.autor_username ? `@${c.autor_username}` : 'Sin identificar'}
              </strong>
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                {etiquetaCanal(c.canal)} · {haceCuanto(c.created_at, huso)}
                {c.parent_id ? ' · respuesta a otro comentario' : ''}
              </span>
              {c.oculto ? (
                <span className="pildora" style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}>
                  Oculto en Meta
                </span>
              ) : null}
              <span className="pildora" style={{ marginLeft: 'auto', background: e.bg, color: e.fg }}>
                {e.etiqueta}
              </span>
            </div>

            <p style={{ margin: 0 }}>{c.texto ?? <em style={{ color: 'var(--k-text-2)' }}>Sin texto: solo una imagen o un sticker.</em>}</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {c.estado !== 'respondido' ? (
                <button
                  type="button"
                  className="operar__control"
                  style={{ cursor: 'pointer', fontSize: 13 }}
                  disabled={ocupado}
                  onClick={() => { setAbierto(abierto === c.id ? null : c.id); setTexto('') }}
                >
                  {abierto === c.id ? 'Cerrar' : 'Responder en público'}
                </button>
              ) : null}
              {c.estado === 'nuevo' ? (
                <button
                  type="button"
                  className="operar__control"
                  style={{ cursor: 'pointer', fontSize: 13 }}
                  disabled={ocupado}
                  onClick={() => void marcar(c, 'ignorado')}
                >
                  Ignorar
                </button>
              ) : null}
              {c.estado === 'ignorado' ? (
                <button
                  type="button"
                  className="operar__control"
                  style={{ cursor: 'pointer', fontSize: 13 }}
                  disabled={ocupado}
                  onClick={() => void marcar(c, 'nuevo')}
                >
                  Reabrir
                </button>
              ) : null}
            </div>

            {abierto === c.id ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea
                  className="campo"
                  rows={2}
                  value={texto}
                  onChange={(ev) => setTexto(ev.target.value)}
                  placeholder="Tu respuesta, que verá cualquiera"
                  aria-label="Respuesta al comentario"
                />
                <div>
                  <button
                    type="button"
                    className="btn"
                    disabled={ocupado || !texto.trim()}
                    onClick={() => void responder(c)}
                  >
                    {ocupado ? 'Publicando' : 'Publicar respuesta'}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
