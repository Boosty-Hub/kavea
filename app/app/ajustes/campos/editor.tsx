'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

type Campo = {
  id: string
  clave: string
  etiqueta: string
  tipo: string
  opciones: string[] | null
  ayuda: string | null
  obligatorio: boolean
  orden: number
  ambito: 'tarjeta' | 'contacto'
}

const TIPOS: Array<{ v: string; n: string }> = [
  { v: 'texto', n: 'Texto' },
  { v: 'texto_largo', n: 'Texto largo' },
  { v: 'numero', n: 'Número' },
  { v: 'moneda', n: 'Importe' },
  { v: 'fecha', n: 'Fecha' },
  { v: 'booleano', n: 'Sí o no' },
  { v: 'seleccion', n: 'Lista de opciones' },
  { v: 'telefono', n: 'Teléfono' },
  { v: 'correo', n: 'Correo' },
  { v: 'url', n: 'Enlace' },
]

const NOMBRE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.v, t.n]))

export function EditorCampos({
  organizacionId, campos,
}: {
  organizacionId: string
  campos: Campo[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function archivar(c: Campo) {
    if (!confirm(
      `Archivar "${c.etiqueta}".\n\nDeja de aparecer en las fichas. Los valores ya guardados se conservan: por eso se archiva en vez de borrarse.`,
    )) return
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc('archivar_campo', { p_campo: c.id })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  const porAmbito = {
    tarjeta: campos.filter((c) => c.ambito === 'tarjeta'),
    contacto: campos.filter((c) => c.ambito === 'contacto'),
  }

  return (
    <div style={{ display: 'grid', gap: 32, marginTop: 32 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {(['tarjeta', 'contacto'] as const).map((ambito) => (
        <section key={ambito}>
          <h2 style={{ fontSize: 16 }}>
            {ambito === 'tarjeta' ? 'Del asunto' : 'De la persona'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 4 }}>
            {ambito === 'tarjeta'
              ? 'Se rellenan una vez por tarjeta. Un presupuesto, una fecha de entrega, un origen.'
              : 'Acompañan a la persona por todos sus canales y todos sus asuntos. Un documento, una dirección.'}
          </p>

          <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
            {porAmbito[ambito].length === 0 ? (
              <p style={{ padding: 20, margin: 0, color: 'var(--k-text-2)', fontSize: 14 }}>
                Todavía no hay campos aquí.
              </p>
            ) : (
              porAmbito[ambito].map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderBottom: '1px solid var(--k-border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>
                      {c.etiqueta}
                      {c.obligatorio ? (
                        <span style={{ color: 'var(--k-accent)', fontSize: 12 }}> · obligatorio</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                      <code>{c.clave}</code> · {NOMBRE_TIPO[c.tipo] ?? c.tipo}
                      {c.opciones?.length ? ` · ${c.opciones.join(', ')}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => archivar(c)}
                    disabled={ocupado}
                    style={{
                      border: '1px solid var(--k-border)', background: 'transparent',
                      borderRadius: 'var(--r-control)', padding: '4px 10px',
                      cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)',
                    }}
                  >
                    Archivar
                  </button>
                </div>
              ))
            )}
          </div>

          <Nuevo
            organizacionId={organizacionId}
            ambito={ambito}
            ocupado={ocupado}
            setOcupado={setOcupado}
            setError={setError}
          />
        </section>
      ))}
    </div>
  )
}

function Nuevo({
  organizacionId, ambito, ocupado, setOcupado, setError,
}: {
  organizacionId: string
  ambito: 'tarjeta' | 'contacto'
  ocupado: boolean
  setOcupado: (v: boolean) => void
  setError: (v: string | null) => void
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [etiqueta, setEtiqueta] = useState('')
  const [clave, setClave] = useState('')
  const [tipo, setTipo] = useState('texto')
  const [opciones, setOpciones] = useState('')
  const [ayuda, setAyuda] = useState('')
  const [obligatorio, setObligatorio] = useState(false)

  /**
   * La clave se propone desde la etiqueta y se puede corregir.
   *
   * La etiqueta se cambia cuando se quiera; la clave no, porque es la que usan
   * los filtros y la API. Proponerla evita que alguien escriba "Presupuesto €"
   * como clave, y dejarla editable evita que quede una clave absurda cuando la
   * etiqueta lleva tildes o palabras de relleno.
   */
  function alEscribirEtiqueta(v: string) {
    const tocada = clave !== '' && clave !== sugerir(etiqueta)
    setEtiqueta(v)
    if (!tocada) setClave(sugerir(v))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null)
    const lista = opciones.split('\n').map((s) => s.trim()).filter(Boolean)
    const { error } = await crearClienteNavegador().rpc('definir_campo', {
      p_org: organizacionId,
      p_clave: clave,
      p_etiqueta: etiqueta,
      p_tipo: tipo,
      p_ambito: ambito,
      p_opciones: tipo === 'seleccion' ? lista : null,
      p_ayuda: ayuda || null,
      p_obligatorio: obligatorio,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    setEtiqueta(''); setClave(''); setTipo('texto'); setOpciones(''); setAyuda('')
    setObligatorio(false); setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button
        type="button"
        className="btn"
        onClick={() => setAbierto(true)}
        style={{ marginTop: 12 }}
      >
        Añadir campo
      </button>
    )
  }

  return (
    <form onSubmit={enviar} className="tarjeta" style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <div>
        <label className="label" htmlFor={`etiqueta-${ambito}`}>Nombre</label>
        <input
          id={`etiqueta-${ambito}`}
          className="campo"
          value={etiqueta}
          onChange={(e) => alEscribirEtiqueta(e.target.value)}
          required
          maxLength={60}
          style={{ marginTop: 6 }}
        />
      </div>

      <div>
        <label className="label" htmlFor={`clave-${ambito}`}>Clave</label>
        <input
          id={`clave-${ambito}`}
          className="campo"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          required
          pattern="[a-z][a-z0-9_]{1,38}"
          style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace' }}
        />
        <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
          Minúsculas, números y guion bajo. No se cambia después: la usan los filtros.
        </span>
      </div>

      <div>
        <label className="label" htmlFor={`tipo-${ambito}`}>Tipo</label>
        <select
          id={`tipo-${ambito}`}
          className="campo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ marginTop: 6 }}
        >
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.n}</option>)}
        </select>
      </div>

      {tipo === 'seleccion' ? (
        <div>
          <label className="label" htmlFor={`opciones-${ambito}`}>Opciones, una por línea</label>
          <textarea
            id={`opciones-${ambito}`}
            className="campo"
            rows={4}
            value={opciones}
            onChange={(e) => setOpciones(e.target.value)}
            required
            style={{ marginTop: 6 }}
          />
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor={`ayuda-${ambito}`}>Ayuda, opcional</label>
        <input
          id={`ayuda-${ambito}`}
          className="campo"
          value={ayuda}
          onChange={(e) => setAyuda(e.target.value)}
          style={{ marginTop: 6 }}
        />
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input
          type="checkbox"
          checked={obligatorio}
          onChange={(e) => setObligatorio(e.target.checked)}
        />
        Obligatorio
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={ocupado}>
          {ocupado ? 'Creando' : 'Crear campo'}
        </button>
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

function sugerir(etiqueta: string): string {
  return etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // fuera las tildes: la clave es ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'c$1')        // tiene que empezar por letra
    .slice(0, 39)
}
