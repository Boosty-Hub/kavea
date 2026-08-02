'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { ESTADOS, haceCuanto, type Estado } from '@/lib/ventana'

type Resultado = {
  tarjeta_id: string
  titulo: string | null
  contacto: string
  estado: string
  last_message_at: string | null
  fragmento: string
  donde: string
}

/**
 * Buscar en la bandeja.
 *
 * El índice de texto completo llevaba desde la fase 3 sin que nada lo usara: un
 * GIN que se paga en cada mensaje que entra y no servía ni una consulta.
 *
 * Busca en el contenido, en el nombre de la persona y en el título, y devuelve
 * TARJETAS, no mensajes: quien escribe «presupuesto» quiere el asunto donde se
 * habló de eso, no catorce líneas sueltas de cuatro conversaciones.
 */
export function Buscador({ huso }: { huso: string }) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const ultima = useRef(0)

  useEffect(() => {
    const t = texto.trim()
    if (t.length < 2) { setResultados(null); return }

    // Se espera a que deje de escribir. Sin esto, «presupuesto» lanza once
    // consultas de texto completo y solo importa la última.
    const reloj = setTimeout(async () => {
      const mio = ++ultima.current
      setBuscando(true)
      const { data } = await crearClienteNavegador()
        .rpc('buscar_tarjetas', { p_texto: t, p_limite: 30 })
      // Una respuesta que llega tarde no puede pisar a una posterior: sin este
      // guardia, teclear rápido deja en pantalla el resultado de un término
      // que ya no está en la caja.
      if (mio !== ultima.current) return
      setResultados((data ?? []) as Resultado[])
      setBuscando(false)
    }, 250)

    return () => clearTimeout(reloj)
  }, [texto])

  return (
    <div style={{ marginTop: 10 }}>
      <input
        className="campo"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar en las conversaciones"
        aria-label="Buscar"
        style={{ fontSize: 14, padding: '7px 10px' }}
      />

      {resultados !== null ? (
        <div className="resultados" role="region" aria-live="polite">
          {buscando ? (
            <p className="ficha__vacia" style={{ padding: '8px 0' }}>Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="ficha__vacia" style={{ padding: '8px 0' }}>
              Nada con «{texto.trim()}». Se busca en los mensajes, en el nombre de la persona
              y en el título del asunto.
            </p>
          ) : (
            <>
              <p className="ficha__ayuda" style={{ padding: '6px 0' }}>
                {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}
              </p>
              {resultados.map((r) => {
                const e = ESTADOS[r.estado as Estado] ?? ESTADOS.nueva
                return (
                  <Link key={r.tarjeta_id} href={`/bandeja/${r.tarjeta_id}`} className="resultado">
                    <div className="fila__alto">
                      <span className="fila__nombre">{r.titulo ?? r.contacto}</span>
                      <span className="fila__cuando">{haceCuanto(r.last_message_at, huso)}</span>
                    </div>
                    <p className="resultado__frag">
                      <Resaltado texto={r.fragmento} />
                    </p>
                    <span className="pildora" style={{ background: e.bg, color: e.fg }}>
                      {e.etiqueta}
                    </span>
                  </Link>
                )
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * El resaltado, sin HTML.
 *
 * El fragmento viene de `ts_headline`, que por defecto devuelve `<b>…</b>`. Ese
 * texto lo escribió un tercero, así que pintarlo con `dangerouslySetInnerHTML`
 * para ver la negrita sería XSS almacenado servido en la bandeja del cliente.
 *
 * La función de Postgres delimita con chr(1) y chr(2), y aquí se parte y se
 * pinta con React, que escapa todo. Si un mensaje trajera esos caracteres, lo
 * peor que pasa es un resaltado raro.
 */
function Resaltado({ texto }: { texto: string }) {
  const partes = texto.split(new RegExp("[\u0001\u0002]"))
  return (
    <>
      {partes.map((p, i) =>
        // Las posiciones impares son lo que iba entre los delimitadores.
        i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  )
}