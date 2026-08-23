import Link from 'next/link'
import { listarComentarios, contarComentarios } from '@/lib/comentarios'
import { PestanasVista } from '../pestanas-vista'
import { Notificaciones } from '../../notificaciones'
import { FilaComentario } from './fila'
import type { Notificacion } from '@/lib/agenda'

const FILTROS = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'nuevo', etiqueta: 'Nuevos' },
  { valor: 'respondido', etiqueta: 'Respondidos' },
  { valor: 'ignorado', etiqueta: 'Ignorados' },
] as const

/**
 * El panel de la izquierda en la vista de comentarios, compartido entre
 * `/bandeja?vista=comentarios` (sin nada abierto) y `/bandeja/comentario/[id]`
 * (con un hilo abierto a la derecha). Misma lista, misma cabecera.
 */
export async function ListaComentarios({
  org, huso, avisos, pendientes, estado, activoId,
}: {
  org: { id: string; nombre: string }
  huso: string
  avisos: Notificacion[]
  pendientes: number
  estado?: string
  activoId?: string
}) {
  const activo = FILTROS.some((f) => f.valor === estado) ? (estado ?? '') : ''
  const [comentarios, conteos] = await Promise.all([
    listarComentarios(activo || undefined),
    contarComentarios(),
  ])

  return (
    <section className="bandeja__lista" aria-label="Comentarios">
      <header className="bandeja__cabecera">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p className="label">{org.nombre}</p>
          <span style={{ fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/embudo" style={{ color: 'var(--k-text-2)' }}>Embudo</Link>
            <Link href="/agenda" style={{ color: 'var(--k-text-2)' }}>Agenda</Link>
            <Link href="/ajustes/organizacion" style={{ color: 'var(--k-text-2)' }}>Ajustes</Link>
            <Notificaciones iniciales={avisos} sinLeerInicial={pendientes} organizacionId={org.id} huso={huso} />
          </span>
        </div>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>Bandeja</h1>

        <PestanasVista activa="comentarios" />

        <nav className="filtros" aria-label="Filtrar comentarios">
          {FILTROS.map((f) => {
            const n = f.valor ? conteos[f.valor] ?? 0 : Object.values(conteos).reduce((a, b) => a + b, 0)
            return (
              <Link
                key={f.valor}
                href={f.valor ? `/bandeja?vista=comentarios&estado=${f.valor}` : '/bandeja?vista=comentarios'}
                className="filtro"
                aria-current={activo === f.valor}
              >
                {f.etiqueta}
                <span className="filtro__n">{n}</span>
              </Link>
            )
          })}
        </nav>
      </header>

      <div className="lista">
        {comentarios.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--k-text-2)' }}>
            <p style={{ color: 'var(--k-text)' }}>No hay comentarios todavía.</p>
            <p style={{ fontSize: 13 }}>
              Llegan solos cuando alguien comenta una publicación de las cuentas conectadas.
            </p>
          </div>
        ) : (
          comentarios.map((c) => (
            <FilaComentario key={c.id} c={c} huso={huso} activo={c.id === activoId} />
          ))
        )}
      </div>
    </section>
  )
}
