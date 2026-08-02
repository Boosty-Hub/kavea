'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Invitacion, Miembro } from '@/lib/equipo'
import { ROLES, NOMBRE_ROL } from '@/lib/roles'
import { fecha, fechaHora } from '@/lib/fechas'

export function Equipo({
  organizacionId, miembros, invitaciones, reparto, puedeGestionar, esDuenio, huso,
}: {
  organizacionId: string
  /** El de la organización. Ver `lib/fechas.ts`. */
  huso: string
  miembros: Miembro[]
  invitaciones: Invitacion[]
  reparto: boolean
  puedeGestionar: boolean
  esDuenio: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  /**
   * Las casillas se mueven al pulsarlas, no cuando contesta el servidor.
   *
   * Estos interruptores están gobernados por lo que viene del servidor, así que
   * al pulsarlos se quedaban quietos hasta que volvía el `router.refresh()`:
   * casi un segundo con la casilla en el sitio de antes. Eso no se lee como
   * «cargando», se lee como «no funciona», y lleva a pulsar otra vez.
   *
   * Se guarda el valor pulsado y manda sobre el del servidor hasta que llega la
   * respuesta. Si el RPC falla, se descarta y la casilla vuelve sola a la
   * verdad; si sale bien, el nuevo dato del servidor la sustituye.
   */
  const [optReparto, setOptReparto] = useState<boolean | null>(null)
  const [optTurno, setOptTurno] = useState<Record<string, boolean>>({})
  useEffect(() => { setOptReparto(null); setOptTurno({}) }, [reparto, miembros])
  const encendido = optReparto ?? reparto

  async function rpc(fn: string, args: Record<string, unknown>) {
    setOcupado(true); setError(null); setAviso(null)
    const { error } = await crearClienteNavegador().rpc(fn, args)
    setOcupado(false)
    if (error) { setError(error.message); return false }
    router.refresh()
    return true
  }

  return (
    <div style={{ display: 'grid', gap: 28, marginTop: 32 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {aviso ? (
        <p className="compositor__aviso" style={{ background: 'var(--k-esperando-bg)', color: 'var(--k-esperando-fg)' }}>
          {aviso}
        </p>
      ) : null}

      {/* El reparto por turnos.
          Va aquí y no en una pantalla aparte porque la pregunta «¿quién está en
          el turno?» solo se responde viendo el equipo entero al lado. */}
      <section>
        <h2 style={{ fontSize: 16 }}>Reparto por turnos</h2>
        <div className="tarjeta" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: puedeGestionar ? 'pointer' : 'default' }}>
            <input
              type="checkbox"
              checked={encendido}
              disabled={!puedeGestionar || ocupado}
              onChange={async (e) => {
                const v = e.target.checked
                setOptReparto(v)
                const ok = await rpc('configurar_reparto', { p_org: organizacionId, p_activo: v })
                if (!ok) setOptReparto(null)
              }}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong style={{ fontWeight: 500 }}>
                Repartir las conversaciones que entran
              </strong>
              <div style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
                Cada conversación nueva se asigna a quien lleve más tiempo sin recibir una,
                entre los que estén en el turno. Las asignaciones a mano también cuentan, para
                que el reparto no reparta por igual sobre una carga que ya está torcida.
              </div>
              {!encendido ? (
                <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 6 }}>
                  Ahora mismo está apagado: las conversaciones nuevas entran <strong>del
                  sistema</strong> hasta que alguien las tome desde el hilo.
                </div>
              ) : null}
            </span>
          </label>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16 }}>En el equipo ({miembros.length})</h2>
        <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
          {miembros.map((m) => (
            <div key={m.user_id} className="miembro">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>
                  {m.nombre}
                  {m.soy_yo ? <span style={{ color: 'var(--k-text-2)', fontWeight: 400 }}> · tú</span> : null}
                </div>
                <div style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                  {m.correo}
                  {' · '}
                  {m.abiertas} {m.abiertas === 1 ? 'conversación abierta' : 'conversaciones abiertas'}
                </div>
              </div>

              {/* El turno, solo cuando el reparto está encendido: un interruptor
                  que no hace nada porque el reparto está apagado es ruido que
                  hace dudar de si está activo. */}
              {encendido ? (() => {
                const dentro = optTurno[m.user_id] ?? m.en_rotacion
                return (
                  <label
                    style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, flex: 'none' }}
                    title={m.ultima_asignacion
                      ? `Última asignación: ${fechaHora(m.ultima_asignacion, huso)}`
                      : 'Todavía no ha recibido ninguna: es quien pasa primero'}
                  >
                    <input
                      type="checkbox"
                      checked={dentro}
                      disabled={!puedeGestionar || ocupado}
                      onChange={async (e) => {
                        const v = e.target.checked
                        setOptTurno((o) => ({ ...o, [m.user_id]: v }))
                        const ok = await rpc('rotacion_de', {
                          p_org: organizacionId, p_usuario: m.user_id, p_dentro: v,
                        })
                        if (!ok) setOptTurno((o) => { const n = { ...o }; delete n[m.user_id]; return n })
                      }}
                    />
                    <span style={{ color: dentro ? 'inherit' : 'var(--k-text-2)' }}>
                      En el turno
                    </span>
                  </label>
                )
              })() : null}

              {puedeGestionar && !m.soy_yo ? (
                <select
                  className="operar__control"
                  value={m.rol}
                  disabled={ocupado}
                  aria-label={`Rol de ${m.nombre}`}
                  onChange={(e) => rpc('cambiar_rol', {
                    p_org: organizacionId, p_usuario: m.user_id, p_rol: e.target.value,
                  })}
                >
                  {ROLES.filter((r) => r.v !== 'owner' || esDuenio).map((r) => (
                    <option key={r.v} value={r.v}>{r.n}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>{NOMBRE_ROL[m.rol]}</span>
              )}

              {puedeGestionar && !m.soy_yo ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    if (confirm(
                      `Quitar a ${m.nombre} del equipo.\n\nLas conversaciones que tuviera asignadas se quedan sin responsable, no se pierden.`,
                    )) rpc('quitar_miembro', { p_org: organizacionId, p_usuario: m.user_id })
                  }}
                  style={{
                    border: '1px solid var(--k-border)', background: 'transparent',
                    borderRadius: 'var(--r-control)', padding: '4px 10px',
                    cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)',
                  }}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {puedeGestionar ? (
        <>
          {invitaciones.length > 0 ? (
            <section>
              <h2 style={{ fontSize: 16 }}>Invitaciones sin usar ({invitaciones.length})</h2>
              <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
                {invitaciones.map((i) => (
                  <div key={i.id} className="miembro">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>{i.correo}</div>
                      <div style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                        {NOMBRE_ROL[i.rol]} · caduca el {fecha(i.expira_en, huso)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => rpc('revocar_invitacion', { p_invitacion: i.id })}
                      style={{
                        border: '1px solid var(--k-border)', background: 'transparent',
                        borderRadius: 'var(--r-control)', padding: '4px 10px',
                        cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)',
                      }}
                    >
                      Revocar
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <Invitar
            esDuenio={esDuenio}
            ocupado={ocupado}
            setOcupado={setOcupado}
            setError={setError}
            setAviso={setAviso}
          />
        </>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
          Solo quien administra la organización puede invitar o cambiar roles.
        </p>
      )}

      <section>
        <h2 style={{ fontSize: 16 }}>Qué puede cada rol</h2>
        <div className="tarjeta" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {ROLES.map((r) => (
            <div key={r.v}>
              <strong style={{ fontWeight: 500 }}>{r.n}</strong>
              <div style={{ fontSize: 13, color: 'var(--k-text-2)' }}>{r.que}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Invitar({
  esDuenio, ocupado, setOcupado, setError, setAviso,
}: {
  esDuenio: boolean
  ocupado: boolean
  setOcupado: (v: boolean) => void
  setError: (v: string | null) => void
  setAviso: (v: string | null) => void
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState('agente')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null); setAviso(null)

    // Va por el servidor y no por el RPC directo: el token en claro no debe
    // pasar por el navegador.
    const r = await fetch('/api/invitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo, rol }),
    })
    const j = await r.json()
    setOcupado(false)

    if (!r.ok || j.error) { setError(j.error ?? 'No se pudo invitar.'); return }

    if (!j.correoEnviado) {
      // La invitación existe aunque el correo no saliera. Se da el enlace en
      // vez de dejar a alguien esperando un correo que no va a llegar.
      setAviso(
        `La invitación está creada pero el correo no salió (${j.motivo}). ` +
        `Pásale este enlace tú: ${j.enlace}`,
      )
    } else {
      setAviso(`Invitación enviada a ${correo}. El enlace vale siete días.`)
    }
    setCorreo(''); setRol('agente'); setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button type="button" className="btn" onClick={() => setAbierto(true)} style={{ justifySelf: 'start' }}>
        Invitar a alguien
      </button>
    )
  }

  return (
    <form onSubmit={enviar} className="tarjeta" style={{ display: 'grid', gap: 12 }}>
      <div>
        <label className="label" htmlFor="correo-inv">Correo</label>
        <input
          id="correo-inv"
          className="campo"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
          style={{ marginTop: 6 }}
        />
      </div>
      <div>
        <label className="label" htmlFor="rol-inv">Rol</label>
        <select
          id="rol-inv"
          className="campo"
          value={rol}
          onChange={(e) => setRol(e.target.value)}
          style={{ marginTop: 6 }}
        >
          {ROLES.filter((r) => r.v !== 'owner' || esDuenio).map((r) => (
            <option key={r.v} value={r.v}>{r.n}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
          {ROLES.find((r) => r.v === rol)?.que}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={ocupado}>
          {ocupado ? 'Enviando' : 'Enviar invitación'}
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
