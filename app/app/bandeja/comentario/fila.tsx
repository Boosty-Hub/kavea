import Link from 'next/link'
import type { Comentario } from '@/lib/comentarios'
import { colorCanal, etiquetaCanal, haceCuanto } from '@/lib/ventana'

const ESTADOS: Record<string, { etiqueta: string; fg: string; bg: string }> = {
  nuevo:      { etiqueta: 'Nuevo', fg: 'var(--k-curso-fg)', bg: 'var(--k-curso-bg)' },
  respondido: { etiqueta: 'Respondido', fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)' },
  ignorado:   { etiqueta: 'Ignorado', fg: 'var(--k-text-2)', bg: 'var(--k-surface-2)' },
}

/** Una fila de comentario en la lista, con la misma forma que una de tarjeta. */
export function FilaComentario({
  c, huso, activo,
}: {
  c: Comentario
  huso: string
  activo?: boolean
}) {
  const e = ESTADOS[c.estado] ?? ESTADOS.nuevo!

  return (
    <Link href={`/bandeja/comentario/${c.id}`} className="fila" aria-current={activo}>
      <div className="fila__alto">
        <span className="fila__nombre">
          {c.autor_username ? `@${c.autor_username}` : 'Sin identificar'}
        </span>
        <span className="fila__cuando">{haceCuanto(c.created_at, huso)}</span>
      </div>

      <p className="fila__preview">
        {c.texto ?? 'Sin texto: solo una imagen o un sticker.'}
      </p>

      <div className="fila__pie">
        <span
          className="pildora"
          style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}
        >
          <span className="pildora__punto" style={{ background: colorCanal(c.canal) }} aria-hidden="true" />
          {etiquetaCanal(c.canal)}
        </span>
        <span className="pildora" style={{ background: e.bg, color: e.fg }}>
          {e.etiqueta}
        </span>
        {c.oculto ? (
          <span className="pildora" style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}>
            Oculto
          </span>
        ) : null}
      </div>
    </Link>
  )
}
