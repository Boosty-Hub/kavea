'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Plantilla, VariableDisponible } from '@/lib/plantillas'

const ESTADOS: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada a Meta', aprobada: 'Aprobada',
  rechazada: 'Rechazada', pausada: 'Pausada', inhabilitada: 'Inhabilitada',
}

const CATEGORIAS = ['UTILITY', 'MARKETING', 'AUTHENTICATION']

export function EditorPlantillas({
  organizacionId, plantillas, variables, puedeConfigurar,
}: {
  organizacionId: string
  plantillas: Plantilla[]
  variables: VariableDisponible[]
  puedeConfigurar: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState<Plantilla | null>(null)
  const [creando, setCreando] = useState<'interna' | 'whatsapp' | null>(null)

  async function archivar(p: Plantilla) {
    if (!confirm(`Archivar «${p.nombre}».`)) return
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc('archivar_plantilla', { p_plantilla: p.id })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  async function cambiarEstado(p: Plantilla, estado: string) {
    setOcupado(true); setError(null)
    const motivo = estado === 'rechazada'
      ? prompt('¿Qué motivo dio Meta?') ?? null
      : null
    const { error } = await crearClienteNavegador().rpc('marcar_estado_plantilla', {
      p_plantilla: p.id, p_estado: estado, p_meta_nombre: null, p_motivo: motivo,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  const porTipo = {
    interna: plantillas.filter((p) => p.tipo === 'interna'),
    whatsapp: plantillas.filter((p) => p.tipo === 'whatsapp'),
  }

  return (
    <div style={{ display: 'grid', gap: 28, marginTop: 28 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {(['interna', 'whatsapp'] as const).map((tipo) => (
        <section key={tipo}>
          <h2 style={{ fontSize: 16 }}>
            {tipo === 'interna' ? 'Internas' : 'De WhatsApp'} ({porTipo[tipo].length})
          </h2>

          <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
            {porTipo[tipo].length === 0 ? (
              <p style={{ padding: 20, margin: 0, color: 'var(--k-text-2)', fontSize: 14 }}>
                Todavía no hay ninguna.
              </p>
            ) : (
              porTipo[tipo].map((p) => (
                <div key={p.id} className="plantilla">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>
                      {p.nombre}
                      {p.atajo ? (
                        <code style={{ fontSize: 12, color: 'var(--k-text-2)', marginLeft: 8 }}>
                          /{p.atajo}
                        </code>
                      ) : null}
                    </div>
                    <div className="plantilla__cuerpo">{p.cuerpo}</div>
                    {tipo === 'whatsapp' ? (
                      <div style={{ fontSize: 12, color: 'var(--k-text-2)', marginTop: 4 }}>
                        {p.categoria} · {p.idioma} · {ESTADOS[p.estado] ?? p.estado}
                        {p.variables?.length ? ` · ${p.variables.join(', ')}` : ''}
                        {p.motivo_rechazo ? (
                          <span style={{ color: 'var(--k-escalada-fg)' }}> · {p.motivo_rechazo}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {puedeConfigurar ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {tipo === 'whatsapp' ? (
                        <select
                          className="operar__control"
                          value={p.estado}
                          disabled={ocupado}
                          aria-label={`Estado de ${p.nombre} en Meta`}
                          onChange={(e) => cambiarEstado(p, e.target.value)}
                          title="Lo que pasó en Meta. Kavea todavía no envía plantillas: esto es un registro."
                        >
                          {Object.entries(ESTADOS).map(([v, n]) => (
                            <option key={v} value={v}>{n}</option>
                          ))}
                        </select>
                      ) : null}
                      <button type="button" className="operar__control" style={{ cursor: 'pointer' }}
                        onClick={() => { setEditando(p); setCreando(null) }} disabled={ocupado}>
                        Editar
                      </button>
                      <button type="button" className="operar__control" style={{ cursor: 'pointer' }}
                        onClick={() => archivar(p)} disabled={ocupado}>
                        Archivar
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {puedeConfigurar && creando !== tipo && !editando ? (
            <button type="button" className="btn" style={{ marginTop: 12 }}
              onClick={() => { setCreando(tipo); setEditando(null) }}>
              Añadir {tipo === 'interna' ? 'respuesta rápida' : 'plantilla de WhatsApp'}
            </button>
          ) : null}

          {(creando === tipo || editando?.tipo === tipo) ? (
            <Formulario
              organizacionId={organizacionId}
              tipo={tipo}
              inicial={editando?.tipo === tipo ? editando : null}
              variables={variables}
              ocupado={ocupado}
              setOcupado={setOcupado}
              setError={setError}
              alCerrar={() => { setCreando(null); setEditando(null) }}
            />
          ) : null}
        </section>
      ))}
    </div>
  )
}

function Formulario({
  organizacionId, tipo, inicial, variables, ocupado, setOcupado, setError, alCerrar,
}: {
  organizacionId: string
  tipo: 'interna' | 'whatsapp'
  inicial: Plantilla | null
  variables: VariableDisponible[]
  ocupado: boolean
  setOcupado: (v: boolean) => void
  setError: (v: string | null) => void
  alCerrar: () => void
}) {
  const router = useRouter()
  const caja = useRef<HTMLTextAreaElement>(null)
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [cuerpo, setCuerpo] = useState(inicial?.cuerpo ?? '')
  const [atajo, setAtajo] = useState(inicial?.atajo ?? '')
  const [categoria, setCategoria] = useState(inicial?.categoria ?? 'UTILITY')
  const [idioma, setIdioma] = useState(inicial?.idioma ?? 'es')
  const [posicionales, setPosicionales] = useState<string[]>(inicial?.variables ?? [])

  /**
   * Insertar una variable donde está el cursor, no al final.
   *
   * Escribir la plantilla y luego tener que colocar el hueco a mano es
   * exactamente el roce que hace que nadie use las variables y todo el mundo
   * acabe escribiendo el nombre del cliente a mano.
   */
  function insertar(texto: string) {
    const t = caja.current
    if (!t) { setCuerpo((c) => c + texto); return }
    const i = t.selectionStart ?? cuerpo.length
    const j = t.selectionEnd ?? i
    const nuevo = cuerpo.slice(0, i) + texto + cuerpo.slice(j)
    setCuerpo(nuevo)
    requestAnimationFrame(() => {
      t.focus()
      t.setSelectionRange(i + texto.length, i + texto.length)
    })
  }

  function anadirPosicional(clave: string) {
    const n = posicionales.length + 1
    setPosicionales([...posicionales, clave])
    insertar(`{{${n}}}`)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc('guardar_plantilla', {
      p_org: organizacionId,
      p_nombre: nombre,
      p_cuerpo: cuerpo,
      p_tipo: tipo,
      p_atajo: atajo || null,
      p_variables: tipo === 'whatsapp' ? posicionales : [],
      p_categoria: tipo === 'whatsapp' ? categoria : null,
      p_idioma: tipo === 'whatsapp' ? idioma : null,
      p_plantilla: inicial?.id ?? null,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    alCerrar()
    router.refresh()
  }

  return (
    <form onSubmit={enviar} className="tarjeta" style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <div>
        <label className="label" htmlFor={`nombre-${tipo}`}>Nombre</label>
        <input id={`nombre-${tipo}`} className="campo" value={nombre} required maxLength={80}
          onChange={(e) => setNombre(e.target.value)} style={{ marginTop: 6 }} />
      </div>

      {tipo === 'interna' ? (
        <div>
          <label className="label" htmlFor="atajo">Atajo, opcional</label>
          <input id="atajo" className="campo" value={atajo} pattern="[a-z][a-z0-9_-]{1,24}"
            placeholder="precio" onChange={(e) => setAtajo(e.target.value.toLowerCase())}
            style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace' }} />
          <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
            Para encontrarla rápido en el compositor.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="categoria">Categoría</label>
            <select id="categoria" className="campo" value={categoria}
              onChange={(e) => setCategoria(e.target.value)} style={{ marginTop: 6 }}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label className="label" htmlFor="idioma">Idioma</label>
            <input id="idioma" className="campo" value={idioma} maxLength={5}
              onChange={(e) => setIdioma(e.target.value)} style={{ marginTop: 6 }} />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor={`cuerpo-${tipo}`}>Mensaje</label>
        <textarea id={`cuerpo-${tipo}`} ref={caja} className="campo" rows={4} value={cuerpo}
          required maxLength={4000} onChange={(e) => setCuerpo(e.target.value)}
          style={{ marginTop: 6, fontFamily: 'inherit' }} />
      </div>

      <div>
        <span className="label">
          {tipo === 'interna' ? 'Pulsa para insertar una variable' : 'Pulsa para añadir un hueco numerado'}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {variables.map((v) => (
            <button key={v.clave} type="button" className="canal-chip"
              style={{ cursor: 'pointer', font: 'inherit' }}
              title={`${v.etiqueta} · por ejemplo ${v.ejemplo}`}
              onClick={() => tipo === 'interna' ? insertar(`{{${v.clave}}}`) : anadirPosicional(v.clave)}>
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {tipo === 'whatsapp' && posicionales.length > 0 ? (
        <div style={{ fontSize: 13 }}>
          <span className="label">Qué va en cada hueco</span>
          <ol style={{ margin: '6px 0 0', paddingInlineStart: 20, color: 'var(--k-text-2)' }}>
            {posicionales.map((p, i) => (
              <li key={i}>
                <code>{`{{${i + 1}}}`}</code> · {variables.find((v) => v.clave === p)?.etiqueta ?? p}
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setPosicionales([])}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--k-text-2)', padding: '6px 0 0' }}>
            Empezar de nuevo con los huecos
          </button>
        </div>
      ) : null}

      {tipo === 'whatsapp' && inicial?.estado === 'aprobada' ? (
        <p className="compositor__aviso" style={{ background: 'var(--k-esperando-bg)', color: 'var(--k-esperando-fg)' }}>
          Esta plantilla está aprobada en Meta. Si cambias el texto vuelve a borrador: lo que
          Meta revisó ya no sería lo que se envía.
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={ocupado}>
          {ocupado ? 'Guardando' : inicial ? 'Guardar cambios' : 'Crear plantilla'}
        </button>
        <button type="button" onClick={alCerrar}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'var(--k-text-2)' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
