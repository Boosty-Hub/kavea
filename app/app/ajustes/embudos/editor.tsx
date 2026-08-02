'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { colorEtapa } from '@/lib/ventana'

type Etapa = { id: string; nombre: string; orden: number; color: string; tipo: string }
type Embudo = {
  id: string; nombre: string; descripcion: string | null
  es_predeterminado: boolean; etapas: Etapa[]
}

const COLORES = ['piedra', 'terracota', 'azul', 'verde', 'ambar', 'ciruela', 'teja', 'oliva']

const TIPOS: Array<{ v: string; n: string; ayuda: string }> = [
  { v: 'abierta', n: 'En curso', ayuda: 'El asunto sigue vivo' },
  { v: 'ganada', n: 'Ganada', ayuda: 'Cierre favorable. Cuenta para la conversión' },
  { v: 'perdida', n: 'Perdida', ayuda: 'Cierre desfavorable' },
]

export function EditorEmbudos({
  organizacionId, embudos,
}: {
  organizacionId: string
  embudos: Embudo[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function llamar(fn: string, args: Record<string, unknown>) {
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc(fn, args)
    setOcupado(false)
    if (error) { setError(error.message); return false }
    router.refresh()
    return true
  }

  return (
    <div style={{ display: 'grid', gap: 28, marginTop: 32 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {embudos.map((e) => (
        <section key={e.id} className="tarjeta">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ fontSize: 17 }}>{e.nombre}</h2>
            {e.es_predeterminado ? (
              <span className="pildora" style={{ background: 'var(--k-terra-100)', color: 'var(--k-terra-700)' }}>
                Predeterminado
              </span>
            ) : null}
          </div>
          {e.descripcion ? (
            <p style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 4 }}>{e.descripcion}</p>
          ) : null}

          <div style={{ display: 'grid', gap: 6, marginTop: 16 }}>
            {e.etapas.map((et) => (
              <div
                key={et.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', border: '1px solid var(--k-border)',
                  borderRadius: 'var(--r-control)',
                  borderInlineStartWidth: 3, borderInlineStartColor: colorEtapa(et.color),
                }}
              >
                <span style={{ flex: 1, fontSize: 14 }}>{et.nombre}</span>
                <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                  {TIPOS.find((t) => t.v === et.tipo)?.n ?? et.tipo}
                </span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    if (confirm(
                      `Archivar la etapa "${et.nombre}".\n\nLas tarjetas que estén ahí pasan a la primera etapa en curso: no desaparecen del tablero.`,
                    )) llamar('archivar_etapa', { p_etapa: et.id })
                  }}
                  style={{
                    border: '1px solid var(--k-border)', background: 'transparent',
                    borderRadius: 'var(--r-control)', padding: '2px 8px',
                    cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--k-text-2)',
                  }}
                >
                  Archivar
                </button>
              </div>
            ))}
          </div>

          <NuevaEtapa embudoId={e.id} ocupado={ocupado} llamar={llamar} />
        </section>
      ))}

      <NuevoEmbudo organizacionId={organizacionId} ocupado={ocupado} llamar={llamar} />
    </div>
  )
}

function NuevaEtapa({
  embudoId, ocupado, llamar,
}: {
  embudoId: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('abierta')
  const [color, setColor] = useState('piedra')

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{
          border: 0, background: 'transparent', color: 'var(--k-accent)',
          cursor: 'pointer', font: 'inherit', fontSize: 13, padding: 0,
          marginTop: 12, textAlign: 'left',
        }}
      >
        + Añadir etapa
      </button>
    )
  }

  return (
    <form
      style={{ display: 'grid', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--k-border)' }}
      onSubmit={async (ev) => {
        ev.preventDefault()
        const ok = await llamar('definir_etapa', {
          p_embudo: embudoId, p_nombre: nombre, p_tipo: tipo, p_color: color,
        })
        if (ok) { setNombre(''); setTipo('abierta'); setColor('piedra'); setAbierto(false) }
      }}
    >
      <input
        className="campo"
        placeholder="Nombre de la etapa"
        value={nombre}
        onChange={(ev) => setNombre(ev.target.value)}
        required
        maxLength={40}
        aria-label="Nombre de la etapa"
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="campo"
          style={{ width: 'auto' }}
          value={tipo}
          onChange={(ev) => setTipo(ev.target.value)}
          aria-label="Tipo de etapa"
        >
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.n}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
          {TIPOS.find((t) => t.v === tipo)?.ayuda}
        </span>
      </div>

      {/* Paleta cerrada: un color libre acaba en un tablero de ocho colores
          saturados que contradice el libro de marca. */}
      <div style={{ display: 'flex', gap: 6 }} role="radiogroup" aria-label="Color">
        {COLORES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            style={{
              width: 26, height: 26, borderRadius: 999, cursor: 'pointer',
              background: colorEtapa(c),
              border: color === c ? '2px solid var(--k-text)' : '2px solid transparent',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={ocupado} style={{ padding: '6px 14px', fontSize: 14 }}>
          Añadir etapa
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 14, color: 'var(--k-text-2)' }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function NuevoEmbudo({
  organizacionId, ocupado, llamar,
}: {
  organizacionId: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')

  if (!abierto) {
    return (
      <button type="button" className="btn" onClick={() => setAbierto(true)} style={{ justifySelf: 'start' }}>
        Añadir embudo
      </button>
    )
  }

  return (
    <form
      className="tarjeta"
      style={{ display: 'grid', gap: 12 }}
      onSubmit={async (ev) => {
        ev.preventDefault()
        const ok = await llamar('definir_embudo', {
          p_org: organizacionId, p_nombre: nombre, p_descripcion: descripcion || null,
        })
        if (ok) { setNombre(''); setDescripcion(''); setAbierto(false) }
      }}
    >
      <div>
        <label className="label" htmlFor="embudo-nombre">Nombre</label>
        <input
          id="embudo-nombre"
          className="campo"
          placeholder="Cobros"
          value={nombre}
          onChange={(ev) => setNombre(ev.target.value)}
          required
          maxLength={60}
          style={{ marginTop: 6 }}
        />
      </div>
      <div>
        <label className="label" htmlFor="embudo-desc">Para qué sirve, opcional</label>
        <input
          id="embudo-desc"
          className="campo"
          value={descripcion}
          onChange={(ev) => setDescripcion(ev.target.value)}
          style={{ marginTop: 6 }}
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
        Nace sin etapas. Se añaden aquí mismo en cuanto esté creado.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={ocupado}>Crear embudo</button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'var(--k-text-2)' }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
