'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Tarea } from '@/lib/agenda'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * El calendario del mes.
 *
 * Vista de mes y nada más. Resuelve la pregunta que se hace de verdad —«¿qué
 * tengo esta semana?»— y la de semana, la de día y arrastrar para cambiar la
 * fecha se añaden cuando alguien las pida, no antes.
 *
 * Lo vencido se calcula aquí igual que en la base: `vence_en < ahora` y sin
 * completar. No hay ningún estado guardado que pueda quedarse obsoleto.
 */
export function Calendario({
  organizacionId, anio, mes, tareas, miembros, soloMias, yo,
}: {
  organizacionId: string
  anio: number
  mes: number
  tareas: Tarea[]
  miembros: Array<{ user_id: string; nombre: string }>
  soloMias: boolean
  yo: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [nueva, setNueva] = useState<string | null>(null)

  /**
   * La casilla se marca al pulsar, no cuando contesta el servidor.
   *
   * Con la casilla atada solo al dato del servidor, React la devolvía a su sitio
   * hasta que terminaba la ida y vuelta. En una conexión lenta eso se siente
   * roto e invita a pulsar otra vez, que es como se acaba completando y
   * reabriendo la misma tarea. Si la llamada falla, se deshace.
   */
  const [cambiadas, setCambiadas] = useState<Record<string, boolean>>({})
  const hecha = (t: Tarea) => cambiadas[t.id] ?? t.completada_en !== null

  const primero = new Date(Date.UTC(anio, mes - 1, 1))
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  // getUTCDay: 0 es domingo. La semana empieza en lunes, que es como se lee un
  // calendario en español.
  const hueco = (primero.getUTCDay() + 6) % 7
  const hoyISO = new Date().toISOString().slice(0, 10)

  const porDia = new Map<string, Tarea[]>()
  for (const t of tareas) {
    const d = t.vence_en.slice(0, 10)
    porDia.set(d, [...(porDia.get(d) ?? []), t])
  }

  function mesRelativo(n: number) {
    const d = new Date(Date.UTC(anio, mes - 1 + n, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }

  async function completar(t: Tarea) {
    const destino = !hecha(t)
    setCambiadas((c) => ({ ...c, [t.id]: destino }))
    setError(null)

    const { error } = await crearClienteNavegador()
      .rpc('completar_tarea', { p_tarea: t.id, p_completada: destino })

    if (error) {
      setCambiadas((c) => {
        const n = { ...c }
        delete n[t.id]
        return n
      })
      setError(error.message)
      return
    }
    router.refresh()
  }

  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ m: `${anio}-${String(mes).padStart(2, '0')}`, ...extra })
    if (soloMias && !('todos' in extra)) p.delete('todos')
    return `/agenda?${p}`
  }

  return (
    <div style={{ padding: '0 24px 24px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="barra" style={{ padding: '12px 0', borderBottom: 0 }}>
        <Link className="operar__control" href={`/agenda?m=${mesRelativo(-1)}${soloMias ? '' : '&todos=1'}`}>
          ←
        </Link>
        <h1 style={{ fontSize: 20, minWidth: 190 }}>{MESES[mes - 1]} de {anio}</h1>
        <Link className="operar__control" href={`/agenda?m=${mesRelativo(1)}${soloMias ? '' : '&todos=1'}`}>
          →
        </Link>

        <Link className="operar__control" href={q({ todos: soloMias ? '1' : '' })} style={{ marginInlineStart: 12 }}>
          {soloMias ? 'Ver las de todo el equipo' : 'Ver solo las mías'}
        </Link>

        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--k-text-2)' }}>
          {tareas.length} {tareas.length === 1 ? 'tarea' : 'tareas'}
        </span>
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="mes">
        {DIAS.map((d) => <div key={d} className="mes__dia">{d}</div>)}

        {Array.from({ length: hueco }, (_, i) => <div key={`h${i}`} className="mes__celda mes__celda--fuera" />)}

        {Array.from({ length: dias }, (_, i) => {
          const n = i + 1
          const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(n).padStart(2, '0')}`
          const suyas = porDia.get(iso) ?? []
          return (
            <div key={iso} className={`mes__celda${iso === hoyISO ? ' mes__celda--hoy' : ''}`}>
              <div className="mes__numero">
                <span>{n}</span>
                <button
                  type="button"
                  className="mes__mas"
                  aria-label={`Añadir tarea el ${n}`}
                  onClick={() => setNueva(nueva === iso ? null : iso)}
                >
                  +
                </button>
              </div>

              {suyas.map((t) => {
                const listo = hecha(t)
                const vencida = !listo && new Date(t.vence_en) < new Date()
                const hora = new Date(t.vence_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div
                    key={t.id}
                    className={`tarea${listo ? ' tarea--hecha' : ''}${vencida ? ' tarea--vencida' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={listo}
                      onChange={() => completar(t)}
                      aria-label={`Completar ${t.titulo}`}
                    />
                    {t.tarjeta_id ? (
                      <Link href={`/bandeja/${t.tarjeta_id}`} className="tarea__texto">
                        {hora} {t.titulo}
                      </Link>
                    ) : (
                      <span className="tarea__texto">{hora} {t.titulo}</span>
                    )}
                  </div>
                )
              })}

              {nueva === iso ? (
                <NuevaTarea
                  organizacionId={organizacionId}
                  dia={iso}
                  miembros={miembros}
                  yo={yo}
                  setError={setError}
                  alCerrar={() => setNueva(null)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NuevaTarea({
  organizacionId, dia, miembros, yo, setError, alCerrar,
}: {
  organizacionId: string
  dia: string
  miembros: Array<{ user_id: string; nombre: string }>
  yo: string
  setError: (v: string | null) => void
  alCerrar: () => void
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [hora, setHora] = useState('09:00')
  const [asignado, setAsignado] = useState(yo)
  const [aviso, setAviso] = useState('30')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null)
    const vence = new Date(`${dia}T${hora}:00`)
    // El recordatorio va ANTES del vencimiento. Avisar cuando ya venció es
    // llegar tarde por diseño.
    const recordar = aviso === '0'
      ? null
      : new Date(vence.getTime() - Number(aviso) * 60_000)

    const { error } = await crearClienteNavegador().rpc('guardar_tarea', {
      p_org: organizacionId,
      p_titulo: titulo,
      p_vence_en: vence.toISOString(),
      p_asignado: asignado,
      p_detalle: null,
      p_recordar_en: recordar?.toISOString() ?? null,
      p_tarjeta: null,
      p_tarea: null,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    alCerrar()
    router.refresh()
  }

  return (
    <form onSubmit={enviar} className="mes__forma">
      <input
        className="campo" value={titulo} onChange={(e) => setTitulo(e.target.value)}
        placeholder="Qué hay que hacer" required autoFocus maxLength={200}
        aria-label="Título de la tarea"
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <input className="campo" type="time" value={hora} onChange={(e) => setHora(e.target.value)}
          aria-label="Hora" style={{ width: 96 }} />
        <select className="campo" value={aviso} onChange={(e) => setAviso(e.target.value)}
          aria-label="Aviso" style={{ flex: 1 }}>
          <option value="0">Sin aviso</option>
          <option value="15">15 min antes</option>
          <option value="30">30 min antes</option>
          <option value="60">1 hora antes</option>
          <option value="1440">1 día antes</option>
        </select>
      </div>
      {miembros.length > 1 ? (
        <select className="campo" value={asignado} onChange={(e) => setAsignado(e.target.value)}
          aria-label="Responsable">
          {miembros.map((m) => <option key={m.user_id} value={m.user_id}>{m.nombre}</option>)}
        </select>
      ) : null}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn" type="submit" disabled={ocupado}
          style={{ padding: '4px 10px', fontSize: 12 }}>
          Añadir
        </button>
        <button type="button" onClick={alCerrar}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--k-text-2)' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
