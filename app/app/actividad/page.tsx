import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { registroDe } from '@/lib/registro'
import { miembrosDe } from '@/lib/bandeja'
import { describirActividad } from '@/lib/actividad'
import { haceCuanto } from '@/lib/ventana'

export const dynamic = 'force-dynamic'

/** Familias por las que de verdad se filtra. Cuarenta y siete tipos no son un menú. */
const FAMILIAS = [
  { v: '', n: 'Todo' },
  { v: 'tarjeta', n: 'Conversaciones' },
  { v: 'mensaje', n: 'Mensajes' },
  { v: 'campo', n: 'Campos' },
  { v: 'documento', n: 'Documentos' },
  { v: 'archivo', n: 'Archivos' },
  { v: 'tarea', n: 'Tareas' },
  { v: 'equipo', n: 'Equipo' },
  { v: 'plantilla', n: 'Plantillas' },
  { v: 'contacto', n: 'Contactos' },
]

export default async function Actividad({
  searchParams,
}: {
  searchParams: Promise<{ quien?: string; que?: string; antes?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  // El huso de la organizacion. Ver `lib/fechas.ts`.
  const huso = org.zona_horaria ?? HUSO_POR_DEFECTO

  const sp = await searchParams
  const [movimientos, miembros] = await Promise.all([
    registroDe(org.id, { actor: sp.quien, tipo: sp.que, antesDe: sp.antes }),
    miembrosDe(org.id),
  ])

  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const v = { quien: sp.quien, que: sp.que, ...extra }
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x)
    return `/actividad${p.size ? `?${p}` : ''}`
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="barra">
        <p className="label" style={{ margin: 0 }}>{org.nombre}</p>
        <nav className="barra__nav" aria-label="Secciones">
          <Link href="/bandeja">Bandeja</Link>
          <Link href="/embudo">Embudo</Link>
          <Link href="/agenda">Agenda</Link>
          <Link href="/contactos">Contactos</Link>
          <Link href="/actividad" aria-current>Actividad</Link>
        </nav>
      </div>

      <div className="pagina" style={{ maxWidth: 880, paddingTop: 24, width: '100%' }}>
        <h1 style={{ marginBottom: 8 }}>Actividad</h1>
        <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
          Todo lo que hace cualquiera en el sistema, y lo que hace el sistema solo. No se
          edita ni se borra: si se pudiera reescribir dejaría de servir para auditar.
        </p>

        <nav className="filtros" aria-label="Filtrar por familia" style={{ marginTop: 16 }}>
          {FAMILIAS.map((f) => (
            <Link key={f.v} href={q({ que: f.v || undefined, antes: undefined })}
              className="filtro" aria-current={(sp.que ?? '') === f.v}>
              {f.n}
            </Link>
          ))}
        </nav>

        <nav className="filtros" aria-label="Filtrar por persona" style={{ marginTop: 8 }}>
          <Link href={q({ quien: undefined, antes: undefined })} className="filtro"
            aria-current={!sp.quien}>
            Cualquiera
          </Link>
          {miembros.map((m) => (
            <Link key={m.user_id} href={q({ quien: m.user_id, antes: undefined })}
              className="filtro" aria-current={sp.quien === m.user_id}>
              {m.nombre}
            </Link>
          ))}
        </nav>

        <div className="tarjeta" style={{ padding: 0, marginTop: 20, overflow: 'hidden' }}>
          {movimientos.length === 0 ? (
            <p style={{ padding: 24, margin: 0, color: 'var(--k-text-2)', fontSize: 14 }}>
              Nada con esos filtros.
            </p>
          ) : (
            movimientos.map((m) => (
              <div key={m.id} className="movimiento">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14 }}>
                    <strong style={{ fontWeight: 500 }}>
                      {m.actor_nombre ?? (m.actor_tipo === 'sistema' ? 'Kavea' : 'Alguien')}
                    </strong>{' '}
                    <span style={{ color: 'var(--k-text-2)' }}>{describirActividad(m, huso)}</span>
                  </span>
                  {m.tarjeta_id ? (
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <Link href={`/bandeja/${m.tarjeta_id}`} style={{ color: 'var(--k-text-2)' }}>
                        {m.titulo ?? 'Ver la conversación'}
                      </Link>
                    </div>
                  ) : null}
                </div>
                <time
                  className="ficha__ayuda"
                  dateTime={m.created_at}
                  title={new Date(m.created_at).toISOString()}
                  style={{ flex: 'none' }}
                >
                  {haceCuanto(m.created_at, huso)}
                </time>
              </div>
            ))
          )}
        </div>

        {/* Cursor, no número de página: con offset, una actividad nueva desplaza
            todo y la página 2 repite lo que ya se vio en la 1. */}
        {movimientos.length === 80 ? (
          <Link href={q({ antes: movimientos.at(-1)!.created_at })} className="btn"
            style={{ marginTop: 16, textDecoration: 'none' }}>
            Ver más atrás
          </Link>
        ) : null}
      </div>
    </main>
  )
}
