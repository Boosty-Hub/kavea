'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

type Pagina = {
  id: string
  nombre: string
  tasks: string[]
  puede_mensajear: boolean
  instagram: string | null
  instagram_id: string | null
  organizacion: string | null
}

type Espacio = { id: string; nombre: string; slug: string }

/**
 * El portafolio, y el alta de un cliente desde él.
 *
 * DOS DECISIONES QUE SE NOTAN AL USARLO
 *
 * 1. Las Páginas ya conectadas no desaparecen de la lista: se quedan, marcadas
 *    y con el espacio al que pertenecen. Esconderlas haría imposible responder
 *    «¿esta Página de quién es?», que es media pregunta de soporte.
 *
 * 2. Una Página sin permiso de mensajería se puede conectar igual, con el aviso
 *    delante. Las fuentes de Meta no coinciden en qué tarea concreta hace falta
 *    —MESSAGING, MESSAGE y MODERATE aparecen en páginas distintas de la propia
 *    documentación— así que bloquear por ausencia descartaría clientes válidos.
 *    El árbitro real es si llega un mensaje, y eso solo se sabe después.
 */
export function Portafolio({ espacios, husos }: { espacios: Espacio[]; husos: Array<{ nombre: string; desfase: string }> }) {
  const router = useRouter()
  const [paginas, setPaginas] = useState<Pagina[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [busca, setBusca] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => { listar() }, [])

  async function listar() {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/portafolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'listar' }),
      })
      const j = await r.json()
      if (!r.ok || j.error) setError(j.error ?? 'No se pudo leer el portafolio.')
      else setPaginas(j.paginas as Pagina[])
    } catch {
      setError('No se pudo leer el portafolio.')
    }
    setCargando(false)
  }

  const porOrg = new Map(espacios.map((e) => [e.id, e]))
  const visibles = (paginas ?? []).filter((p) => {
    const t = busca.trim().toLowerCase()
    if (!t) return true
    return p.nombre.toLowerCase().includes(t) || (p.instagram ?? '').toLowerCase().includes(t)
  })
  const sinConectar = (paginas ?? []).filter((p) => !p.organizacion).length

  return (
    <div style={{ marginTop: 24 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {cargando ? (
        <p className="muted">Preguntando a Meta…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="campo"
              style={{ maxWidth: 280 }}
              placeholder="Buscar por nombre o por Instagram"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar en el portafolio"
            />
            <span className="muted" style={{ fontSize: 13 }}>
              {paginas?.length ?? 0} Páginas · {sinConectar} sin espacio
            </span>
            <button
              type="button"
              className="operar__control"
              style={{ cursor: 'pointer', fontSize: 13 }}
              onClick={listar}
            >
              Volver a leer
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {visibles.map((p) => (
              <div key={p.id} className="tarjeta" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--k-text-2)', marginTop: 2 }}>
                      {p.instagram ? `@${p.instagram}` : 'sin Instagram vinculado'}
                      {' · '}
                      <code>{p.id}</code>
                    </div>
                    {!p.puede_mensajear ? (
                      <div style={{ fontSize: 12, color: 'var(--k-escalada-fg)', marginTop: 4 }}>
                        Esta Página no concede ninguna tarea de mensajería ({p.tasks.join(', ') || 'ninguna'}).
                        Se puede conectar, pero es probable que no entre ningún mensaje.
                      </div>
                    ) : null}
                  </div>

                  {p.organizacion ? (
                    <span style={{ fontSize: 13, color: 'var(--k-text-2)', flex: 'none' }}>
                      Ya conectada ·{' '}
                      <strong style={{ fontWeight: 500, color: 'var(--k-text)' }}>
                        {porOrg.get(p.organizacion)?.nombre ?? 'otro espacio'}
                      </strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="operar__control"
                      style={{
                        cursor: 'pointer', flex: 'none', fontSize: 13,
                        borderColor: 'var(--k-accent)', color: 'var(--k-accent)',
                      }}
                      onClick={() => setAbierta(abierta === p.id ? null : p.id)}
                      aria-expanded={abierta === p.id}
                    >
                      {abierta === p.id ? 'Cancelar' : 'Crear espacio'}
                    </button>
                  )}
                </div>

                {abierta === p.id ? (
                  <Alta
                    pagina={p}
                    espacios={espacios}
                    husos={husos}
                    alTerminar={() => { setAbierta(null); listar(); router.refresh() }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * El alta: espacio nuevo o espacio existente.
 *
 * Las dos opciones existen porque un cliente puede tener varias Páginas —una por
 * marca, o una de respaldo— y todas deben caer en el mismo espacio. Forzar un
 * espacio por Página partiría en dos la bandeja del mismo cliente.
 */
function Alta({
  pagina, espacios, husos, alTerminar,
}: {
  pagina: Pagina
  espacios: Espacio[]
  husos: Array<{ nombre: string; desfase: string }>
  alTerminar: () => void
}) {
  const [modo, setModo] = useState<'nuevo' | 'existente'>('nuevo')
  const [nombre, setNombre] = useState(pagina.nombre)
  const [slug, setSlug] = useState(sugerirSlug(pagina.nombre))
  const [huso, setHuso] = useState('America/Caracas')
  const [destino, setDestino] = useState(espacios[0]?.id ?? '')
  const [paso, setPaso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function conectar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = crearClienteNavegador()

    let org = destino
    if (modo === 'nuevo') {
      setPaso('Creando el espacio…')
      const { data, error } = await supabase.rpc('crear_espacio', {
        p_nombre: nombre, p_slug: slug, p_huso: huso,
      })
      if (error) { setPaso(null); setError(error.message); return }
      org = data as string
    }

    setPaso('Conectando la Página y suscribiendo los webhooks…')
    const r = await fetch('/api/portafolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'conectar', page_id: pagina.id, organizacion: org }),
    })
    const j = await r.json()
    setPaso(null)
    if (!r.ok || j.error) {
      // Si el espacio se creó y la conexión falló, el espacio SE QUEDA. Borrarlo
      // aquí sería una segunda operación que también puede fallar, y dejaría el
      // estado peor. Se dice lo que pasó y se puede reintentar la conexión.
      setError(
        `${j.error ?? 'No se pudo conectar la Página.'}`
        + (modo === 'nuevo' ? ' El espacio sí quedó creado: reintenta la conexión desde aquí.' : ''),
      )
      return
    }
    if (j.aviso) {
      setError(`Conectada, pero la suscripción a webhooks avisó: ${j.aviso}. `
        + 'El reconciliador lo reintenta cada quince minutos; míralo en Salud.')
      return
    }
    alTerminar()
  }

  return (
    <form onSubmit={conectar} style={{ display: 'grid', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--k-border)' }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" checked={modo === 'nuevo'} onChange={() => setModo('nuevo')} />
          Espacio nuevo
        </label>
        {espacios.length > 0 ? (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="radio" checked={modo === 'existente'} onChange={() => setModo('existente')} />
            Añadir a uno que ya existe
          </label>
        ) : null}
      </div>

      {modo === 'nuevo' ? (
        <>
          <div>
            <label className="label" htmlFor={`n-${pagina.id}`}>Nombre del cliente</label>
            <input
              id={`n-${pagina.id}`} className="campo" value={nombre} required
              onChange={(e) => { setNombre(e.target.value); setSlug(sugerirSlug(e.target.value)) }}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <label className="label" htmlFor={`s-${pagina.id}`}>Subdominio</label>
            <input
              id={`s-${pagina.id}`} className="campo" value={slug} required
              onChange={(e) => setSlug(e.target.value)}
              style={{ marginTop: 6 }}
            />
            {/* El subdominio no se puede cambiar después sin romper los enlaces
                que ya estén repartidos. Se enseña entero para que se lea antes
                de crearlo, no después. */}
            <span className="ficha__ayuda">
              Quedará en <code>{slug || '…'}.kavea.ai</code>. No se puede cambiar después sin
              romper los enlaces que ya estén repartidos.
            </span>
          </div>
          <div>
            <label className="label" htmlFor={`h-${pagina.id}`}>Zona horaria</label>
            <select
              id={`h-${pagina.id}`} className="campo" value={huso}
              onChange={(e) => setHuso(e.target.value)} style={{ marginTop: 6 }}
            >
              {husos.map((x) => (
                <option key={x.nombre} value={x.nombre}>
                  {x.nombre.replace(/_/g, ' ')} · UTC{x.desfase.startsWith('-') ? '' : '+'}{x.desfase}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <div>
          <label className="label" htmlFor={`d-${pagina.id}`}>Espacio</label>
          <select
            id={`d-${pagina.id}`} className="campo" value={destino}
            onChange={(e) => setDestino(e.target.value)} style={{ marginTop: 6 }}
          >
            {espacios.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre} · {e.slug}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={paso !== null}>
          {paso ? 'Trabajando' : 'Conectar'}
        </button>
        {/* El paso se dice en voz alta: son dos llamadas a Meta y tardan. Un
            botón que se queda pensando sin decir qué hace se lee como colgado. */}
        {paso ? <span className="muted" style={{ fontSize: 13 }}>{paso}</span> : null}
      </div>
    </form>
  )
}

/** Sugerencia, no imposición: se puede editar antes de crear. */
function sugerirSlug(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}
