'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CanalConectado, Conexion, Verificacion } from '@/lib/conexiones'
import { fechaHora } from '@/lib/fechas'
import { colorCanal, etiquetaCanal } from '@/lib/ventana'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
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

/**
 * Cómo se llama una conexión, en palabras.
 *
 * ESTABA ROTO PARA WHATSAPP Y SE VEÍA EN DOS SITIOS. El título usaba
 * `page_name ?? page_id` y la confirmación `page_name ?? ig_username ??
 * meta_connection_id`. Una conexión de WhatsApp no tiene Página ni Instagram
 * —`page_id` es null POR DISEÑO desde la 0065—, así que el título salía VACÍO
 * y la confirmación pedía transcribir «00000000-0000-4000-8000-00000000c002».
 *
 * El número ya estaba a mano en `canales[].nombre` («+1 829-954-3803») y el
 * panel no lo miraba. Mismo descuido que la 0073 y la 0082: código escrito
 * para Página+Instagram al que WhatsApp se le añadió por un lado.
 */
function nombreDe(c: Conexion): string {
  if (c.page_name) return c.page_name
  if (c.ig_username) return `@${c.ig_username}`
  const porCanal = c.canales.map((x) => x.nombre).filter(Boolean).join(' · ')
  return porCanal || c.page_id || c.meta_connection_id
}

/** Lo que hay que teclear para desconectar. Fija, legible y sin signos. */
const PALABRA = 'DESCONECTAR'

export function Canales({ conexiones, huso }: { conexiones: Conexion[]; huso: string }) {
  const router = useRouter()
  const [comprobando, setComprobando] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState<string | null>(null)
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

  /**
   * Desconectar, con la confirmación escribiendo una palabra.
   *
   * No es reversible con un clic —borra la credencial y el enrutado—, así que
   * la fricción es a propósito: la misma que ya usa `Unir` en la ficha para
   * fusionar tarjetas, pero un paso más arriba porque aquí lo que se pierde no
   * se puede deshacer solo con otro clic.
   *
   * SE ESCRIBE DESCONECTAR, NO EL NOMBRE. El nombre va en el aviso, que es
   * donde sirve —para reconocer qué se está tirando—; lo que se teclea tiene
   * que ser tecleable. Antes se pedía el nombre y para una conexión de
   * WhatsApp eso era el UUID: la única acción destructiva del panel era, en la
   * práctica, imposible de confirmar. Una fricción tiene que costar una
   * decisión, no una transcripción.
   */
  async function desconectar(c: Conexion) {
    const nombre = nombreDe(c)
    const escrito = window.prompt(
      `Esto desconecta ${nombre} de Kavea: deja de recibir y enviar por aquí hasta que se `
      + `vuelva a conectar desde cero.

Escribe ${PALABRA} para confirmar.`,
    )
    if (escrito?.trim().toUpperCase() !== PALABRA) return

    setDesconectando(c.meta_connection_id); setError(null)
    try {
      const r = await fetch('/api/canales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conexion: c.meta_connection_id, motivo: 'Desconectado desde Ajustes → Canales' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo desconectar.'); return }
      if (j.meta && j.meta.ok === false) {
        setError(
          `Se desconectó en Kavea. Meta no confirmó la baja de webhooks (${j.meta.aviso ?? 'sin detalle'}); `
          + 'puedes darla de baja también desde el Business Manager si quieres estar seguro.',
        )
      }
      router.refresh()
    } catch {
      setError('No se pudo desconectar ahora mismo.')
    }
    setDesconectando(null)
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
            <h2 style={{ fontSize: 16, margin: 0 }}>{nombreDe(c)}</h2>
            {c.ig_username && c.page_name ? (
              <span style={{ fontSize: 13, color: 'var(--k-text-2)' }}>@{c.ig_username}</span>
            ) : null}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="operar__control"
                style={{ cursor: 'pointer', fontSize: 13 }}
                disabled={comprobando !== null}
                onClick={() => comprobar(c.meta_connection_id)}
              >
                {comprobando === c.meta_connection_id ? 'Comprobando' : 'Volver a comprobar'}
              </button>
              <button
                type="button"
                className="operar__control"
                style={{ cursor: 'pointer', fontSize: 13, color: 'var(--k-escalada-fg)' }}
                disabled={desconectando !== null}
                onClick={() => desconectar(c)}
              >
                {desconectando === c.meta_connection_id ? 'Desconectando' : 'Desconectar'}
              </button>
            </span>
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

          <Canalitos canales={c.canales} huso={huso} onCambiado={() => router.refresh()} />

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
function Canalitos({
  canales, huso, onCambiado,
}: {
  canales: CanalConectado[]
  huso: string
  onCambiado: () => void
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function alternar(k: CanalConectado) {
    setOcupado(k.id); setError(null)
    const { error } = k.activo
      ? await crearClienteNavegador().rpc('pausar_canal', { p_canal: k.id, p_motivo: null })
      : await crearClienteNavegador().rpc('reanudar_canal', { p_canal: k.id })
    setOcupado(null)
    if (error) { setError(error.message); return }
    onCambiado()
  }

  if (canales.length === 0) return null

  return (
    <>
    {error ? <p className="error" role="alert" style={{ marginTop: 8 }}>{error}</p> : null}
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

          <button
            type="button"
            onClick={() => alternar(k)}
            disabled={ocupado !== null}
            title={k.activo ? 'Deja de enviar y recibir por este canal, sin desconectarlo' : 'Vuelve a activarlo'}
            style={{
              border: 0, background: 'transparent', cursor: 'pointer',
              font: 'inherit', fontSize: 12, color: 'var(--k-accent)',
              textDecoration: 'underline', textUnderlineOffset: 3, padding: 0,
            }}
          >
            {ocupado === k.id ? '…' : k.activo ? 'Pausar' : 'Reanudar'}
          </button>
        </li>
      ))}
    </ul>
    </>
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
