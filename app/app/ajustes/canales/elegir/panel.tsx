'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoCanal } from '@/lib/logos-canal'

/**
 * Elegir qué activar, con la lista delante.
 *
 * ESTA PANTALLA ES LA MITAD QUE FALTABA. Hasta el 24-ago el diálogo de Meta
 * conectaba UNA Página y abortaba si el cliente autorizaba más: le pedíamos
 * repetir cinco pantallas de Meta por cada activo. Ahora autoriza una vez y
 * decide aquí, que además es el único sitio donde puede ver qué hay, qué ya
 * está conectado y qué no se puede.
 *
 * NO HAY «ACTIVAR TODO». Cada Página que se activa empieza a meter las
 * conversaciones de alguien en esta bandeja, y eso es una decisión por activo,
 * no un interruptor. Se activan de una en una y cada una dice cómo le fue: si
 * la tercera falla, las dos anteriores siguen conectadas y se ve cuál falló.
 */

type Activo = {
  page_id: string
  nombre: string
  tasks: string[]
  puede_mensajear: boolean
  instagram: { id: string; username: string | null } | null
  estado: 'sin_conectar' | 'conectada' | 'desconectada' | 'en_otro_espacio'
}

export function Elegir() {
  const router = useRouter()
  const [activos, setActivos] = useState<Activo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reautorizar, setReautorizar] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [hechos, setHechos] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    setError(null)
    const r = await fetch('/api/meta/activos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'listar' }),
    })
    const d = await r.json().catch(() => ({}))
    if (d?.ok) { setActivos(d.paginas ?? []); return }
    setActivos([])
    setReautorizar(Boolean(d?.reautorizar || d?.sin_autorizacion))
    setError(d?.error ?? 'No se pudo leer lo que autorizaste.')
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function activar(a: Activo) {
    setOcupado(a.page_id); setError(null)
    const r = await fetch('/api/meta/activos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'activar', page_id: a.page_id }),
    })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (d?.ok) {
      setHechos((h) => ({ ...h, [a.page_id]: 'ok' }))
      await cargar()
      router.refresh()
      return
    }
    setError([d?.paso && `Falló en: ${d.paso}.`, d?.error].filter(Boolean).join(' ')
      || 'No se pudo activar.')
  }

  if (activos === null) {
    return <p className="ficha__vacia" style={{ marginTop: 24 }}>Preguntando a Meta qué autorizaste…</p>
  }

  return (
    <div style={{ marginTop: 24 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {reautorizar ? (
        <p style={{ marginTop: 16 }}>
          <a className="boton" href="/api/meta/oauth/start?canal=mensajeria">
            Autorizar con Facebook
          </a>
        </p>
      ) : null}

      {!reautorizar && activos.length === 0 ? (
        <p className="ficha__vacia">
          La cuenta que autorizaste no administra ninguna Página. Entra en Meta con la cuenta que
          sí las administra y vuelve a autorizar.
        </p>
      ) : null}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {activos.map((a) => {
          const conectada = a.estado === 'conectada'
          const ajena = a.estado === 'en_otro_espacio'
          return (
            <li
              key={a.page_id}
              className="tarjeta"
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                opacity: ajena ? 0.55 : 1,
              }}
            >
              <span style={{ display: 'grid', gap: 3, minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{a.nombre}</span>
                <span
                  style={{
                    fontSize: 13, color: 'var(--k-text-2)',
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <LogoCanal canal="messenger" size={14} /> Messenger
                  </span>
                  {a.instagram ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <LogoCanal canal="instagram" size={14} />
                      {a.instagram.username ? `@${a.instagram.username}` : 'Instagram'}
                    </span>
                  ) : (
                    <span>sin Instagram vinculado</span>
                  )}
                  {/* Se avisa, no se bloquea: las fuentes de Meta no coinciden en
                      qué tarea concede mensajería, y el árbitro real es V7. */}
                  {!a.puede_mensajear ? (
                    <span style={{ color: 'var(--k-escalada-fg)' }}>
                      sin permiso de mensajería declarado
                    </span>
                  ) : null}
                </span>
              </span>

              {ajena ? (
                <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>En otro espacio</span>
              ) : conectada && !hechos[a.page_id] ? (
                <span style={{ fontSize: 13, color: 'var(--k-resuelta-fg)' }}>Conectada</span>
              ) : hechos[a.page_id] ? (
                <span style={{ fontSize: 13, color: 'var(--k-resuelta-fg)' }}>Activada</span>
              ) : (
                <button
                  type="button"
                  className="operar__control"
                  style={{ cursor: 'pointer', fontSize: 13 }}
                  disabled={ocupado !== null}
                  onClick={() => activar(a)}
                >
                  {ocupado === a.page_id
                    ? 'Activando'
                    : a.estado === 'desconectada' ? 'Volver a activar' : 'Activar'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
