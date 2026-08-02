'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Notificacion } from '@/lib/agenda'
import { haceCuanto } from '@/lib/ventana'

/**
 * El centro de notificaciones.
 *
 * NO es una copia del registro de actividad. El registro dice lo que pasó; esto
 * dice lo que alguien tiene que saber. La lista de disparadores es corta a
 * propósito —asignación, mensaje en conversación tuya, recordatorio y
 * vencimiento de tarea— y cada uno nuevo entra con la pregunta delante: ¿esto le
 * cambia el día a alguien, o solo es que pasó?
 *
 * Y se agrupan: diez mensajes en la misma conversación son UNA notificación, no
 * diez. Sin eso, media hora sin mirar deja cuarenta líneas iguales y la reacción
 * de cualquiera es vaciarlo a ciegas. Una bandeja que se vacía sin leerse no
 * notifica nada.
 */
export function Notificaciones({
  iniciales, sinLeerInicial, organizacionId,
}: {
  iniciales: Notificacion[]
  sinLeerInicial: number
  organizacionId: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState(iniciales)
  const [pendientes, setPendientes] = useState(sinLeerInicial)

  // El servidor manda: cuando la página se revalida, lo que llegue de props
  // pisa lo que hubiera en estado.
  useEffect(() => { setLista(iniciales); setPendientes(sinLeerInicial) }, [iniciales, sinLeerInicial])

  useEffect(() => {
    const supabase = crearClienteNavegador()
    const canal = supabase
      .channel(`org:${organizacionId}`, { config: { private: true } })
      .on('broadcast', { event: 'cambio' }, (m) => {
        // El aviso no trae contenido: solo dice que hay algo. Se relee bajo RLS.
        if ((m.payload as { tabla?: string })?.tabla === 'notificaciones') router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [organizacionId, router])

  async function marcar(ids?: string[]) {
    const supabase = crearClienteNavegador()
    // Optimista: el contador baja al pulsar, no cuando responde el servidor.
    if (ids) {
      setLista((l) => l.map((n) => (ids.includes(n.id) ? { ...n, leida_en: 'ya' } : n)))
      setPendientes((p) => Math.max(0, p - ids.length))
    } else {
      setLista((l) => l.map((n) => ({ ...n, leida_en: n.leida_en ?? 'ya' })))
      setPendientes(0)
    }
    await supabase.rpc('marcar_notificaciones', { p_ids: ids ?? null })
    router.refresh()
  }

  return (
    <div className="campana">
      <button
        type="button"
        className="campana__boton"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={pendientes > 0 ? `${pendientes} notificaciones sin leer` : 'Notificaciones'}
      >
        Avisos
        {pendientes > 0 ? <span className="campana__n">{pendientes}</span> : null}
      </button>

      {abierto ? (
        <>
          {/* Capa para cerrar al pulsar fuera. Sin esto el panel se queda
              abierto tapando la bandeja y hay que volver al mismo botón. */}
          <button
            type="button"
            className="campana__fuera"
            aria-label="Cerrar los avisos"
            onClick={() => setAbierto(false)}
          />
          <div className="campana__panel" role="dialog" aria-label="Notificaciones">
            <header className="campana__cabecera">
              <strong style={{ fontWeight: 500, fontSize: 14 }}>Avisos</strong>
              {pendientes > 0 ? (
                <button
                  type="button"
                  onClick={() => marcar()}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--k-text-2)' }}
                >
                  Marcar todo leído
                </button>
              ) : null}
            </header>

            {lista.length === 0 ? (
              <p className="ficha__vacia" style={{ padding: 16, margin: 0 }}>
                Nada por ahora. Aquí llegan las conversaciones que te asignen, los mensajes
                nuevos de las tuyas y los recordatorios de tus tareas.
              </p>
            ) : (
              <div className="campana__lista">
                {lista.map((n) => {
                  const cuerpo = (
                    <>
                      <div style={{ fontSize: 13, fontWeight: n.leida_en ? 400 : 500 }}>
                        {n.titulo}
                      </div>
                      {n.cuerpo ? <div className="ficha__ayuda">{n.cuerpo}</div> : null}
                      <div className="ficha__ayuda">{haceCuanto(n.created_at)}</div>
                    </>
                  )
                  return n.enlace ? (
                    <Link
                      key={n.id}
                      href={n.enlace}
                      className={`aviso${n.leida_en ? '' : ' aviso--nuevo'}`}
                      onClick={() => { setAbierto(false); if (!n.leida_en) marcar([n.id]) }}
                    >
                      {cuerpo}
                    </Link>
                  ) : (
                    <div key={n.id} className={`aviso${n.leida_en ? '' : ' aviso--nuevo'}`}>
                      {cuerpo}
                    </div>
                  )
                })}
              </div>
            )}

            <Link href="/agenda" className="campana__pie" onClick={() => setAbierto(false)}>
              Ver la agenda
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}
