'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { fechaHora } from '@/lib/fechas'

/**
 * El nombre y la hora de la organización.
 *
 * EL HUSO NO ES UNA PREFERENCIA DE PANTALLA. Cambiarlo reinterpreta toda la
 * historia: los mensajes de ayer pasan a leerse a otra hora, y las tareas
 * programadas cambian de día. Por eso se enseña, ANTES de guardar, qué hora es
 * ahora mismo en el huso elegido. Un desplegable de quinientos nombres sin
 * ninguna referencia es una forma cómoda de elegir mal.
 */
export function Datos({
  organizacionId, nombre, huso, husos, puedeConfigurar,
}: {
  organizacionId: string
  nombre: string
  huso: string
  husos: Array<{ nombre: string; desfase: string }>
  puedeConfigurar: boolean
}) {
  const router = useRouter()
  const [n, setN] = useState(nombre)
  const [h, setH] = useState(huso)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  const sinCambios = n.trim() === nombre && h === huso

  /**
   * «Ahora mismo» se calcula en el navegador, nunca al renderizar en servidor.
   *
   * `new Date()` dentro del render de un componente de cliente da un valor en el
   * servidor y otro en el navegador: es exactamente el error de hidratación que
   * destapó el problema de los dos relojes. Se deja vacío en la primera pintada
   * y lo rellena el efecto, que solo corre en el cliente.
   *
   * Se refresca cada 30 segundos porque, si no, quien tenga la pestaña abierta
   * un rato compara su reloj con una hora congelada y concluye que Kavea va mal.
   */
  const [ahora, setAhora] = useState<string | null>(null)
  useEffect(() => {
    const pinta = () => setAhora(fechaHora(new Date().toISOString(), h))
    pinta()
    const t = setInterval(pinta, 30_000)
    return () => clearInterval(t)
  }, [h])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null); setGuardado(false)
    const { error } = await crearClienteNavegador()
      .rpc('guardar_organizacion', { p_org: organizacionId, p_nombre: n, p_huso: h })
    setOcupado(false)
    if (error) { setError(error.message); return }
    setGuardado(true)
    router.refresh()
  }

  return (
    <form onSubmit={guardar} style={{ display: 'grid', gap: 20, marginTop: 32, maxWidth: 480 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {guardado ? (
        <p
          className="compositor__aviso"
          style={{ background: 'var(--k-resuelta-bg)', color: 'var(--k-resuelta-fg)' }}
          role="status"
        >
          Guardado.
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="org-nombre">Nombre</label>
        <input
          id="org-nombre"
          className="campo"
          value={n}
          onChange={(e) => { setN(e.target.value); setGuardado(false) }}
          disabled={!puedeConfigurar || ocupado}
          maxLength={80}
          required
          style={{ marginTop: 6 }}
        />
      </div>

      <div>
        <label className="label" htmlFor="org-huso">Zona horaria</label>
        <select
          id="org-huso"
          className="campo"
          value={h}
          onChange={(e) => { setH(e.target.value); setGuardado(false) }}
          disabled={!puedeConfigurar || ocupado}
          style={{ marginTop: 6 }}
        >
          {/* Si el huso guardado no está en la lista —una fila vieja, un alias
              retirado— se añade igual. Un desplegable que no puede representar
              el valor actual lo cambiaría solo al primer guardado. */}
          {!husos.some((x) => x.nombre === huso) ? (
            <option value={huso}>{huso} · el que hay guardado</option>
          ) : null}
          {husos.map((x) => (
            <option key={x.nombre} value={x.nombre}>
              {x.nombre.replace(/_/g, ' ')} · UTC{x.desfase.startsWith('-') ? '' : '+'}{x.desfase}
            </option>
          ))}
        </select>
        <span className="ficha__ayuda">
          {ahora ? (
            <>Con esta zona, ahora mismo serían las <strong style={{ fontWeight: 500 }}>{ahora}</strong>. </>
          ) : null}
          Es la hora que se verá en cada mensaje del hilo y en el calendario, para todo el equipo
          y viva donde viva cada uno.
        </span>
      </div>

      {puedeConfigurar ? (
        <button className="btn" type="submit" disabled={ocupado || sinCambios} style={{ justifySelf: 'start' }}>
          {ocupado ? 'Guardando' : 'Guardar'}
        </button>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
          Solo quien administra la organización puede cambiar esto.
        </p>
      )}
    </form>
  )
}
