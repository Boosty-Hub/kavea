'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Soltar la cuenta de Facebook entera.
 *
 * POR QUÉ EXISTE, Y POR QUÉ NO ESTABA. Se podía desconectar un canal, pero no la
 * autorización de la que cuelgan todos: la cuenta seguía vinculada, Kavea seguía
 * apareciendo en los ajustes de Facebook del cliente como una app con acceso, y
 * la pantalla seguía diciendo «ya autorizaste tu cuenta». Un producto que deja
 * entrar tiene que dejar salir por la misma puerta.
 *
 * DOS CLICS Y LA CUENTA DELANTE. La confirmación no es un adorno: esto apaga
 * TODOS los canales del espacio a la vez, y el número va escrito en el propio
 * botón para que nadie descubra después cuántos eran. Es el mismo criterio que el
 * borrado de un comentario, subido de escala.
 *
 * NO BORRA CONVERSACIONES. Retirar el acceso es «dejad de escribir en mi
 * nombre», no «olvidad lo que pasó» —la misma distinción que hace el callback de
 * desautorización de Meta—. Se dice en pantalla, porque quien pulsa esto tiene
 * derecho a saber qué NO se lleva por delante.
 */
export function SoltarCuenta({ conexionesVivas }: { conexionesVivas: number }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])

  async function soltar() {
    setOcupado(true); setError(null); setAvisos([])
    try {
      const r = await fetch('/api/canales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'desautorizar' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo desconectar la cuenta.'); return }

      // El paso local ya ocurrió aunque Meta se queje. Los avisos se enseñan sin
      // deshacer nada, porque deshacer sería volver a conectar lo que se pidió
      // soltar.
      const av = (j.meta?.avisos ?? []) as string[]
      if (j.meta?.revocado === false && !av.length) {
        av.push('Meta no confirmó la revocación. Puedes retirar Kavea desde tus ajustes de Facebook.')
      }
      setAvisos(av)
      setAbierto(false)
      router.refresh()
    } catch {
      setError('No se pudo desconectar la cuenta ahora mismo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      {error ? <p className="error" role="alert" style={{ fontSize: 13 }}>{error}</p> : null}

      {avisos.length ? (
        <div className="tarjeta" style={{ padding: 12, marginBottom: 10 }}>
          <p className="label" style={{ marginTop: 0 }}>La cuenta quedó desconectada, con estos avisos</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--k-text-2)' }}>
            {avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      ) : null}

      {abierto ? (
        <div className="tarjeta" style={{ padding: 14, display: 'grid', gap: 10, maxWidth: 560 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Se desconectan{' '}
            <strong>
              {conexionesVivas === 1 ? 'la única conexión activa' : `las ${conexionesVivas} conexiones activas`}
            </strong>{' '}
            de este espacio y se retira el acceso de Kavea a tu cuenta de Facebook. Dejarán de entrar
            mensajes y comentarios por todos los canales de Meta.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--k-text-2)' }}>
            Las conversaciones, los contactos y el historial <strong>no se borran</strong>. Para volver
            a conectar hay que pasar otra vez por Meta.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button" className="btn" style={{ cursor: 'pointer' }}
              disabled={ocupado} onClick={() => void soltar()}
            >
              {ocupado ? 'Desconectando' : 'Sí, desconectar la cuenta'}
            </button>
            <button
              type="button" className="operar__control" style={{ cursor: 'pointer' }}
              disabled={ocupado} onClick={() => setAbierto(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="operar__control"
          style={{ cursor: 'pointer', fontSize: 13 }}
          onClick={() => { setAbierto(true); setError(null) }}
        >
          Desconectar la cuenta de Facebook
        </button>
      )}
    </div>
  )
}
