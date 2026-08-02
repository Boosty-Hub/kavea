'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { ESTADOS, type Estado } from '@/lib/ventana'

/**
 * Cerrar, asignar y anotar.
 *
 * Es la mitad del trabajo de una jornada y faltaba entera: la bandeja filtraba
 * por estado sin dejar cambiarlo.
 *
 * El estado y la asignación se escriben con un PATCH directo sobre `tarjetas`,
 * no por RPC, y no es una excepción a la regla de «todo pasa por RPC para que
 * quede actividad»: son COLUMNAS, y el trigger `tarjetas_actividad` las ve
 * cambiar pase lo que pase. Depender de que cada ruta se acuerde de registrar es
 * garantizar que alguna no lo haga; que lo vea la base es más fuerte que un RPC.
 *
 * La nota sí va por RPC, porque no es una columna: es una fila de actividad y
 * alguien tiene que crearla.
 */
export function Operar({
  tarjetaId, estado, asignadoA, miembros,
}: {
  tarjetaId: string
  estado: string
  asignadoA: string | null
  miembros: Array<{ user_id: string; nombre: string; rol: string }>
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [notando, setNotando] = useState(false)

  async function cambiar(campos: Record<string, unknown>) {
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador()
      .from('tarjetas').update(campos).eq('id', tarjetaId)
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  async function guardarNota(e: React.FormEvent) {
    e.preventDefault()
    if (!nota.trim()) return
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador()
      .rpc('anadir_nota', { p_tarjeta: tarjetaId, p_texto: nota })
    setOcupado(false)
    if (error) { setError(error.message); return }
    setNota(''); setNotando(false)
    router.refresh()
  }

  return (
    <div className="operar">
      <select
        className="operar__control"
        value={estado}
        disabled={ocupado}
        aria-label="Estado de la conversación"
        onChange={(e) => cambiar({ estado: e.target.value })}
      >
        {(Object.keys(ESTADOS) as Estado[]).map((k) => (
          <option key={k} value={k}>{ESTADOS[k].etiqueta}</option>
        ))}
      </select>

      <select
        className="operar__control"
        value={asignadoA ?? ''}
        disabled={ocupado}
        aria-label="Responsable"
        onChange={(e) => cambiar({ asignado_a: e.target.value || null })}
      >
        <option value="">Sin asignar</option>
        {miembros.map((m) => (
          <option key={m.user_id} value={m.user_id}>{m.nombre}</option>
        ))}
      </select>

      <button
        type="button"
        className="operar__control"
        style={{ cursor: 'pointer' }}
        onClick={() => setNotando((v) => !v)}
        aria-expanded={notando}
      >
        Nota
      </button>

      {notando ? (
        <form onSubmit={guardarNota} className="operar__nota">
          <textarea
            className="campo"
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Solo la ve el equipo. Sale en el hilo, junto a los mensajes."
            aria-label="Nota interna"
            autoFocus
            maxLength={2000}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" type="submit" disabled={ocupado || !nota.trim()} style={{ padding: '6px 14px', fontSize: 13 }}>
              Añadir nota
            </button>
            <button
              type="button"
              onClick={() => { setNotando(false); setNota('') }}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)' }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="error" role="alert" style={{ flexBasis: '100%' }}>{error}</p> : null}
    </div>
  )
}
