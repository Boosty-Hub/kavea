'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { EtapaResumen, TarjetaDeTablero } from '@/lib/embudo'
import { colorCanal, etiquetaCanal, colorEtapa, diasEnEtapa, formatoValor } from '@/lib/ventana'

/**
 * El tablero del embudo.
 *
 * DOS FORMAS DE MOVER, Y NO ES REDUNDANCIA.
 *
 * Arrastrar es lo que espera quien viene de Kommo. Pero el arrastre nativo del
 * navegador no funciona con teclado y en táctil es poco fiable, así que cada
 * tarjeta lleva además un selector de etapa. Es la misma regla que rige los
 * estados en la bandeja: el color nunca comunica solo, y aquí el ratón nunca
 * opera solo.
 *
 * LO QUE ESTE COMPONENTE NO HACE, A PROPÓSITO: tocar el estado de atención.
 * Mover a "Ganada" no cierra la conversación. Si el cliente sigue escribiendo,
 * la conversación sigue viva; cerrarla al ganar es lo que hace que el mensaje
 * de después de la venta se pierda de vista.
 */
export function Tablero({
  columnas, tarjetas,
}: {
  columnas: EtapaResumen[]
  tarjetas: TarjetaDeTablero[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [encima, setEncima] = useState<string | null>(null)
  // Movimiento optimista: el tablero responde al soltar, no cuando contesta el
  // servidor. Un tablero que tarda medio segundo en mover la tarjeta se siente
  // roto aunque funcione.
  const [movidas, setMovidas] = useState<Record<string, string>>({})

  const etapaDe = (t: TarjetaDeTablero) => movidas[t.id] ?? t.etapa_id

  async function mover(tarjetaId: string, etapaId: string) {
    const antes = tarjetas.find((t) => t.id === tarjetaId)
    if (!antes || etapaDe(antes) === etapaId) return

    setMovidas((m) => ({ ...m, [tarjetaId]: etapaId }))
    setError(null)

    const { error } = await crearClienteNavegador()
      .rpc('mover_etapa', { p_tarjeta: tarjetaId, p_etapa: etapaId })

    if (error) {
      // Se deshace la suposición: dejar la tarjeta donde no está es peor que no
      // haberla movido.
      setMovidas((m) => {
        const n = { ...m }
        delete n[tarjetaId]
        return n
      })
      setError(error.message)
      return
    }
    router.refresh()
  }

  if (columnas.length === 0) {
    return (
      <div className="vacio" style={{ margin: 'auto', padding: 40 }}>
        <h2>Este embudo no tiene etapas</h2>
        <p>
          Se crean en <Link href="/ajustes/embudos">Ajustes → Embudos</Link>. Sin etapas no hay
          dónde colocar las tarjetas.
        </p>
      </div>
    )
  }

  return (
    <>
      {error ? (
        <p className="error" role="alert" style={{ margin: '0 24px 12px' }}>{error}</p>
      ) : null}

      <div className="tablero">
        {columnas.map((c) => {
          const dentro = tarjetas.filter((t) => etapaDe(t) === c.etapa_id)
          // La suma se recalcula en el cliente para que cuadre con lo que se ve
          // durante un movimiento optimista.
          const suma = dentro.reduce((n, t) => n + (t.valor ?? 0), 0)
          const monedas = [...new Set(dentro.filter((t) => t.valor != null).map((t) => t.moneda))]

          return (
            <section
              key={c.etapa_id}
              className={
                'columna' +
                (c.tipo !== 'abierta' ? ' columna--terminal' : '') +
                (encima === c.etapa_id ? ' columna--recibiendo' : '')
              }
              aria-label={`${c.nombre}, ${dentro.length} tarjetas`}
              onDragOver={(e) => { e.preventDefault(); setEncima(c.etapa_id) }}
              onDragLeave={() => setEncima((v) => (v === c.etapa_id ? null : v))}
              onDrop={(e) => {
                e.preventDefault()
                setEncima(null)
                const id = e.dataTransfer.getData('text/plain')
                if (id) mover(id, c.etapa_id)
              }}
            >
              <header className="columna__cabecera" style={{ borderTopColor: colorEtapa(c.color) }}>
                <div className="columna__nombre">
                  {c.nombre}
                  <span className="columna__n">{dentro.length}</span>
                </div>
                {/* Sumar dos monedas sería inventar un tipo de cambio. */}
                <div className="columna__suma">
                  {monedas.length > 1
                    ? 'Varias monedas'
                    : suma > 0
                      ? formatoValor(suma, monedas[0] ?? 'USD')
                      : <span style={{ color: 'var(--k-text-2)', fontSize: 13 }}>Sin importe</span>}
                </div>
              </header>

              <div className="columna__cuerpo">
                {dentro.map((t) => (
                  <Naipe
                    key={t.id}
                    t={t}
                    columnas={columnas}
                    etapaActual={c.etapa_id}
                    arrastrando={arrastrando === t.id}
                    onArrastrar={setArrastrando}
                    onMover={mover}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

function Naipe({
  t, columnas, etapaActual, arrastrando, onArrastrar, onMover,
}: {
  t: TarjetaDeTablero
  columnas: EtapaResumen[]
  etapaActual: string
  arrastrando: boolean
  onArrastrar: (id: string | null) => void
  onMover: (tarjeta: string, etapa: string) => void
}) {
  const nombre = t.titulo ?? t.contacts?.nombre ?? t.contacts?.username ?? 'Contacto sin nombre'
  const parada = diasEnEtapa(t.etapa_desde)

  return (
    <div
      className={`naipe${arrastrando ? ' naipe--arrastrando' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', t.id)
        e.dataTransfer.effectAllowed = 'move'
        onArrastrar(t.id)
      }}
      onDragEnd={() => onArrastrar(null)}
    >
      <Link href={`/bandeja/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="naipe__nombre">{nombre}</div>
        {t.valor != null ? (
          <div className="naipe__valor">{formatoValor(Number(t.valor), t.moneda)}</div>
        ) : null}
        <div className="naipe__pie">
          {(t.conversations ?? []).map((c) => (
            <span
              key={c.canal}
              className="pildora__punto"
              style={{ background: colorCanal(c.canal) }}
              title={etiquetaCanal(c.canal)}
            />
          ))}
          {parada ? <span>{parada}</span> : null}
          {t.no_leidos > 0 ? (
            <span className="sinleer" style={{ marginLeft: 'auto' }}>{t.no_leidos}</span>
          ) : null}
        </div>
      </Link>

      {/* El camino que no necesita ratón. */}
      <select
        className="naipe__mover"
        value={etapaActual}
        aria-label={`Mover ${nombre} de etapa`}
        onChange={(e) => onMover(t.id, e.target.value)}
      >
        {columnas.map((c) => (
          <option key={c.etapa_id} value={c.etapa_id}>{c.nombre}</option>
        ))}
      </select>
    </div>
  )
}
