'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { etiquetaCanal, colorCanal } from '@/lib/ventana'

/**
 * El compositor.
 *
 * TRES ESTADOS VISIBLES, y el que manda es el de la base.
 *
 *   abierta  → se responde con normalidad
 *   humana   → fuera de las 24 h, con aviso: solo hasta los 7 días y solo
 *              porque lo escribe una persona
 *   cerrada  → deshabilitado, con el motivo escrito
 *
 * La ventana la calcula `ventana_de()` en Postgres y el compositor la refleja.
 * No la recalcula aquí: dos implementaciones de la misma regla son dos reglas,
 * y la que se olvida de actualizar es la que deja mandar lo que Meta rechaza.
 *
 * EL CONTADOR DE BYTES NO ES DECORACIÓN. Instagram admite 1000 BYTES, no 1000
 * caracteres, verbatim de la documentación. Con tildes y emojis el margen real
 * es bastante menor, y en Venezuela, República Dominicana y México eso es
 * siempre. Sin contador, el operador escribe un párrafo y el envío falla.
 */

type Ventana = { clase: 'abierta' | 'humana' | 'cerrada'; motivo: string | null }

export function Compositor({
  conversaciones, tarjetaId, plantillas,
}: {
  conversaciones: Array<{
    id: string
    canal: string
    ventana: Ventana
  }>
  tarjetaId: string
  plantillas: Array<{ id: string; nombre: string; atajo: string | null }>
}) {
  const router = useRouter()
  const [faltan, setFaltan] = useState<string[]>([])
  const [activa, setActiva] = useState(
    // Se arranca en el canal por el que SÍ se puede responder. Aterrizar en uno
    // cerrado teniendo otro abierto hace pensar que no se puede contestar.
    conversaciones.find((c) => c.ventana.clase === 'abierta')?.id ?? conversaciones[0]?.id ?? '',
  )
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conv = conversaciones.find((c) => c.id === activa)
  if (!conv) return null

  const bytes = new TextEncoder().encode(texto).length
  const tope = conv.canal === 'instagram' ? 1000 : 4000
  const pasado = bytes > tope
  const cerrada = conv.ventana.clase === 'cerrada'

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim() || pasado || cerrada) return
    setEnviando(true); setError(null)

    const { error } = await crearClienteNavegador()
      .rpc('encolar_envio', { p_conversacion: activa, p_texto: texto })

    setEnviando(false)
    if (error) { setError(error.message); return }

    setTexto('')
    setFaltan([])
    router.refresh()

    // Se despierta al despachador en vez de esperar al cron: un minuto de
    // espera para una respuesta que el operador acaba de escribir se siente
    // roto aunque acabe saliendo.
    fetch('/api/despachar', { method: 'POST' }).catch(() => {})
    setTimeout(() => router.refresh(), 2500)
  }

  return (
    <footer className="compositor">
      {conversaciones.length > 1 ? (
        <div className="compositor__canales">
          {conversaciones.map((c) => (
            <button
              key={c.id}
              type="button"
              className="canal-chip"
              aria-current={c.id === activa}
              onClick={() => setActiva(c.id)}
              style={{ cursor: 'pointer', font: 'inherit' }}
              title={c.ventana.motivo ?? 'Se puede responder'}
            >
              <span className="pildora__punto" style={{ background: colorCanal(c.canal) }} aria-hidden="true" />
              {etiquetaCanal(c.canal)}
              {c.ventana.clase !== 'abierta' ? (
                <span style={{ color: 'var(--k-text-2)' }}>
                  {c.ventana.clase === 'humana' ? 'fuera de ventana' : 'cerrado'}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {conv.ventana.motivo ? (
        <p
          className="compositor__aviso"
          style={{
            background: cerrada ? 'var(--k-escalada-bg)' : 'var(--k-esperando-bg)',
            color: cerrada ? 'var(--k-escalada-fg)' : 'var(--k-esperando-fg)',
          }}
        >
          {conv.ventana.motivo}
        </p>
      ) : null}

      {/* Las variables sin resolver se avisan ANTES de enviar, no se maquillan.
          Un "Hola , ¿cómo estás?" que sale al cliente es peor que no mandar
          nada, y el hueco vacío no se ve al releer. */}
      {faltan.length > 0 ? (
        <p
          className="compositor__aviso"
          style={{ background: 'var(--k-esperando-bg)', color: 'var(--k-esperando-fg)' }}
        >
          La plantilla tiene {faltan.length === 1 ? 'un hueco' : 'huecos'} que no se
          {faltan.length === 1 ? ' pudo' : ' pudieron'} rellenar: {faltan.join(', ')}. Complétalo
          a mano antes de enviar.
        </p>
      ) : null}

      {error ? <p className="error" role="alert" style={{ marginBottom: 8 }}>{error}</p> : null}

      <form onSubmit={enviar} className="compositor__caja">
        <textarea
          className="campo"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={cerrada || enviando}
          placeholder={
            cerrada
              ? 'No se puede responder por este canal'
              : `Responder por ${etiquetaCanal(conv.canal)}`
          }
          aria-label="Mensaje"
          onKeyDown={(e) => {
            // Enter envía, Mayúsculas+Enter salta línea. Es lo que hace todo
            // el mundo en un chat y lo que el dedo espera.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
            }
          }}
        />
        <div className="compositor__pie">
          {plantillas.length > 0 ? (
            <select
              className="operar__control"
              value=""
              disabled={cerrada || enviando}
              aria-label="Insertar una plantilla"
              onChange={async (e) => {
                const id = e.target.value
                if (!id) return
                e.target.value = ''
                // Se resuelve en la base, con la misma función que usará
                // cualquier automatización futura. Resolver aquí sería una
                // segunda implementación de las variables.
                const { data, error } = await crearClienteNavegador()
                  .rpc('renderizar_plantilla', { p_plantilla: id, p_tarjeta: tarjetaId })
                if (error) { setError(error.message); return }
                const r = (data as Array<{ texto: string; faltan: string[] }>)?.[0]
                if (!r) return
                setTexto((t) => (t ? `${t}\n${r.texto}` : r.texto))
                setFaltan(r.faltan ?? [])
              }}
            >
              <option value="">Plantilla…</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}{p.atajo ? ` · /${p.atajo}` : ''}
                </option>
              ))}
            </select>
          ) : null}

          <span
            style={{
              fontSize: 12,
              color: pasado ? 'var(--k-escalada-fg)' : 'var(--k-text-2)',
              fontVariantNumeric: 'tabular-nums',
            }}
            title="Instagram cuenta BYTES, no caracteres: los acentos ocupan dos y los emojis hasta cuatro"
          >
            {bytes} / {tope} bytes
          </span>
          <button
            className="btn"
            type="submit"
            disabled={cerrada || enviando || pasado || !texto.trim()}
            style={{ padding: '8px 18px' }}
          >
            {enviando ? 'Enviando' : 'Enviar'}
          </button>
        </div>
      </form>
    </footer>
  )
}
