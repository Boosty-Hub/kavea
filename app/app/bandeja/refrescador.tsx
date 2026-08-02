'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * Tiempo real de la bandeja.
 *
 * BROADCAST, no `postgres_changes`. El docs/02 §5.2 lo fija y conviene repetir
 * por qué: `postgres_changes` evalúa las políticas RLS por suscriptor Y por
 * cambio, y una bandeja compartida con varios agentes conectados es exactamente
 * el patrón que lo castiga. Con Broadcast la autorización se resuelve una vez,
 * al suscribirse al canal `org:{id}`.
 *
 * El payload solo trae identificadores. Al recibirlo se pide al servidor que
 * revalide, y la lectura vuelve a pasar por RLS. Así un fallo de autorización
 * de canal no puede filtrar contenido de mensajes.
 */
export function Refrescador({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const ultimo = useRef(0)

  useEffect(() => {
    const supabase = crearClienteNavegador()

    // Coalescencia: cincuenta mensajes en un segundo no pueden producir
    // cincuenta recargas. Se agrupa en una.
    let pendiente: ReturnType<typeof setTimeout> | null = null
    const refrescar = () => {
      if (pendiente) return
      const espera = Math.max(0, 600 - (Date.now() - ultimo.current))
      pendiente = setTimeout(() => {
        pendiente = null
        ultimo.current = Date.now()
        router.refresh()
      }, espera)
    }

    const canal = supabase
      .channel(`org:${organizationId}`, { config: { private: true } })
      .on('broadcast', { event: 'cambio' }, refrescar)
      .subscribe()

    /**
     * Sondeo de seguridad.
     *
     * Un socket vivo que deja de entregar es el fallo más caro de esta pantalla:
     * el operador ve una bandeja quieta y cree que no hay trabajo. Ningún estado
     * de conexión lo delata, porque el socket está abierto. Sesenta segundos de
     * retraso son aceptables; una bandeja congelada en silencio, no.
     */
    const reloj = setInterval(() => router.refresh(), 60_000)

    // Al volver de segundo plano el navegador pudo perder eventos mientras el
    // socket estaba dormido.
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      if (pendiente) clearTimeout(pendiente)
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
      supabase.removeChannel(canal)
    }
  }, [organizationId, router])

  return null
}
