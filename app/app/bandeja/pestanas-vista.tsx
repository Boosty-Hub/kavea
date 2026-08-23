import Link from 'next/link'

/**
 * Conversaciones / Comentarios, como pestañas de la misma bandeja.
 *
 * Comentarios dejó de ser un módulo del sidebar: es el mismo trabajo de
 * atender a alguien, aunque la respuesta sea pública y sin ventana de 24 h.
 * Cambiar de pestaña navega —no hay estado compartido entre las dos vistas—
 * porque cada una abre un detalle distinto (`/bandeja/[id]` o
 * `/bandeja/comentario/[id]`) y no tiene sentido dejar uno abierto detrás del
 * otro.
 */
export function PestanasVista({ activa }: { activa: 'conversaciones' | 'comentarios' }) {
  return (
    <div className="pestanas" role="tablist" aria-label="Conversaciones o comentarios">
      <Link
        href="/bandeja"
        role="tab"
        aria-selected={activa === 'conversaciones'}
        className="pestana"
      >
        Conversaciones
      </Link>
      <Link
        href="/bandeja?vista=comentarios"
        role="tab"
        aria-selected={activa === 'comentarios'}
        className="pestana"
      >
        Comentarios
      </Link>
    </div>
  )
}
