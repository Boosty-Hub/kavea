'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CanalConectado, Conexion, Verificacion } from '@/lib/conexiones'
import { fechaHora } from '@/lib/fechas'
import { colorCanal, etiquetaCanal } from '@/lib/ventana'
import { LogoCanal } from './logos'

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

export function Canales({ conexiones, huso }: { conexiones: Conexion[]; huso: string }) {
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
              <> · comprobado el {fechaHora(c.ultima_pasada, huso)}</>
            ) : ' · sin comprobar todavía'}
          </p>

          <Canalitos canales={c.canales} huso={huso} />

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

/**
 * Los canales de esta conexión, con su marca y si están activos.
 *
 * VA ANTES DE LAS SIETE COMPROBACIONES, y el orden importa. Las comprobaciones
 * responden «¿puede funcionar?»; esto responde «¿está encendido?». Es la
 * pregunta más barata de las dos y la que más veces se viene a hacer, así que se
 * contesta primero y sin tener que leer una tabla.
 *
 * Una conexión de Página trae dos canales —Messenger e Instagram— y una de
 * WhatsApp trae uno. La lista sale de la base, no de una constante, para que un
 * canal nuevo aparezca aquí el día que exista y no el día que alguien se acuerde
 * de tocar este fichero.
 */
function Canalitos({ canales, huso }: { canales: CanalConectado[]; huso: string }) {
  if (canales.length === 0) return null

  return (
    <ul
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        listStyle: 'none', padding: 0, margin: '12px 0 0',
      }}
    >
      {canales.map((k) => (
        <li
          key={k.id}
          className="tarjeta"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', margin: 0,
            // Un canal apagado se despinta entero en vez de llevar una etiqueta
            // roja: el rojo de esta pantalla ya significa «algo está roto», y un
            // canal pausado a propósito no lo está.
            opacity: k.activo ? 1 : 0.55,
          }}
          title={
            k.activo
              ? undefined
              : [k.pausado_motivo, k.pausado_desde ? `desde el ${fechaHora(k.pausado_desde, huso)}` : null]
                  .filter(Boolean)
                  .join(' · ') || undefined
          }
        >
          <span style={{ color: colorCanal(k.canal), display: 'flex' }}>
            <LogoCanal canal={k.canal} size={20} />
          </span>

          <span style={{ display: 'grid', minWidth: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>{etiquetaCanal(k.canal)}</span>
            {k.nombre ? (
              <span
                style={{
                  fontSize: 12, color: 'var(--k-text-2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {k.nombre}
              </span>
            ) : null}
          </span>

          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginLeft: 8, fontSize: 12,
              color: k.activo ? 'var(--k-resuelta-fg)' : 'var(--k-text-2)',
            }}
          >
            {/* El punto no es el único portador del estado: al lado va la
                palabra. Un estado que solo se distingue por color no lo
                distingue quien no separa esos dos colores. */}
            <span
              aria-hidden="true"
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: k.activo ? 'var(--k-resuelta)' : 'var(--k-text-2)',
              }}
            />
            {k.activo ? 'Activo' : 'Inactivo'}
          </span>
        </li>
      ))}
    </ul>
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
