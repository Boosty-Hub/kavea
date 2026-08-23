'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'

/**
 * La cabecera del hilo, colapsable.
 *
 * Mismo patrón que el sidebar: preferencia del APARATO en `localStorage`, no de
 * la cuenta, y arranca expandida en el servidor y en la primera pintura del
 * cliente para no producir una discordancia de hidratación.
 *
 * Colapsada esconde las píldoras de ventana y las acciones (Operar, standby),
 * y deja solo el enlace de vuelta y el nombre: es la fila que casi nunca cambia
 * mientras se lee un hilo largo, y la que más alto ocupaba sin aportar nada
 * nuevo en esos minutos.
 */

const CLAVE = 'kavea:hilo-cabecera-colapsada'

export function Cabecera({
  perfil, ventanas, acciones,
}: {
  perfil: ReactNode
  ventanas: ReactNode
  acciones: ReactNode
}) {
  const [colapsada, setColapsada] = useState(false)
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    try {
      setColapsada(window.localStorage.getItem(CLAVE) === '1')
    } catch {
      // Modo privado o almacenamiento bloqueado: se queda expandida.
    }
    setMontado(true)
  }, [])

  function alternar() {
    const v = !colapsada
    setColapsada(v)
    try {
      window.localStorage.setItem(CLAVE, v ? '1' : '0')
    } catch { /* ver arriba */ }
  }

  return (
    <header
      className="hilo__cabecera"
      style={{ transition: montado ? 'padding .14s ease' : 'none', paddingBlock: colapsada ? 8 : undefined }}
    >
      <div style={{ minWidth: 0 }}>
        <Link href="/bandeja" style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
          ← Bandeja
        </Link>
        <div style={{ marginTop: 4 }}>{perfil}</div>
        {!colapsada && <div className="canales">{ventanas}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!colapsada && acciones}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!colapsada}
          title={colapsada ? 'Expandir la cabecera' : 'Colapsar la cabecera'}
          style={{
            border: '1px solid var(--k-border)',
            background: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'var(--k-text-2)',
            font: 'inherit',
            fontSize: 13,
            padding: '4px 8px',
            lineHeight: 1,
          }}
        >
          {colapsada ? '˅' : '˄'}
        </button>
      </div>
    </header>
  )
}
