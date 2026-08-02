'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Conexion, Verificacion } from '@/lib/conexiones'

/**
 * El panel de canales.
 *
 * NO HAY UNA LUZ VERDE O ROJA. Hay siete, y cada una dice qué hacer si está
 * apagada. «La conexión falla» no le sirve a nadie; «la app no aparece suscrita
 * a esta Página» sí. El 80 % de los fallos de conexión son configuración del
 * cliente, y el único valor de esta pantalla es decir CUÁL.
 *
 * `No se pudo comprobar` se pinta distinto de `No funciona`, en gris y no en
 * rojo, porque son cosas distintas: una manda a arreglar algo y la otra no.
 * Pintarlas igual es cómo alguien se pasa una tarde revisando una Página que
 * estaba bien.
 */

const CARA = {
  ok:             { icono: '✓', texto: 'Funciona',            color: 'var(--k-resuelta-fg)', fondo: 'var(--k-resuelta-bg)' },
  fallo:          { icono: '✕', texto: 'No funciona',         color: 'var(--k-escalada-fg)', fondo: 'var(--k-escalada-bg)' },
  no_verificable: { icono: '?', texto: 'No se pudo comprobar', color: 'var(--k-text-2)',      fondo: 'var(--k-surface-2)' },
  sin_probar:     { icono: '·', texto: 'Sin probar todavía',  color: 'var(--k-esperando-fg)', fondo: 'var(--k-esperando-bg)' },
} as const

export function Canales({ conexiones }: { conexiones: Conexion[] }) {
  const router = useRouter()
  const [comprobando, setComprobando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function comprobar(id: string) {
    setComprobando(id); setError(null)
    try {
      const r = await fetch('/api/diagnosticar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conexion: id }),
      })
      if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'No se pudo comprobar.')
      else router.refresh()
    } catch {
      setError('No se pudo comprobar ahora mismo.')
    }
    setComprobando(null)
  }

  if (conexiones.length === 0) {
    return (
      <p className="ficha__vacia" style={{ marginTop: 24 }}>
        Todavía no hay ningún canal conectado.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 28, marginTop: 32 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {conexiones.map((c) => (
        <section key={c.meta_connection_id}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>{c.page_name ?? c.page_id}</h2>
            {c.ig_username ? (
              <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>@{c.ig_username}</span>
            ) : null}
            <button
              type="button"
              className="operar__control"
              style={{ cursor: 'pointer', marginLeft: 'auto', fontSize: 13 }}
              disabled={comprobando !== null}
              onClick={() => comprobar(c.meta_connection_id)}
            >
              {comprobando === c.meta_connection_id ? 'Comprobando' : 'Volver a comprobar'}
            </button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '6px 0 0' }}>
            {c.bloqueada
              ? 'Hay algo que impide que este canal funcione.'
              : c.en_rojo > 0
                ? 'Funciona, pero hay un aviso.'
                : 'Todo lo que se puede comprobar está en orden.'}
            {c.ultima_pasada ? (
              <> · comprobado el {new Date(c.ultima_pasada).toLocaleString('es')}</>
            ) : ' · sin comprobar todavía'}
          </p>

          <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
            {c.comprobaciones.length === 0 ? (
              <p className="ficha__vacia" style={{ padding: 16 }}>
                Sin comprobar. Pulsa «Volver a comprobar».
              </p>
            ) : (
              c.comprobaciones.map((v) => <Fila key={v.codigo} v={v} />)
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function Fila({ v }: { v: Verificacion }) {
  const cara = CARA[v.resultado] ?? CARA.no_verificable
  return (
    <div className="miembro" style={{ alignItems: 'flex-start' }}>
      <span
        aria-hidden="true"
        style={{
          flex: 'none', width: 22, height: 22, borderRadius: '50%',
          display: 'grid', placeItems: 'center', fontSize: 12, marginTop: 1,
          background: cara.fondo, color: cara.color,
        }}
      >
        {cara.icono}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>
          {v.titulo}
          {!v.bloquea && v.resultado === 'fallo' ? (
            <span style={{ fontWeight: 400, color: 'var(--k-text-2)' }}> · solo aviso</span>
          ) : null}
        </div>
        {/* La causa dice QUÉ HACER, no qué pasó. «Error 190» no es una causa
            para quien lo lee. */}
        {v.causa ? (
          <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 2 }}>{v.causa}</div>
        ) : null}
      </div>
      <span style={{ flex: 'none', fontSize: 12, color: cara.color }}>{cara.texto}</span>
    </div>
  )
}
