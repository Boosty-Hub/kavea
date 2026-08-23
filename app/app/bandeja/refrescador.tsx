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

    /**
     * Sondeo de seguridad, con DOS cadencias.
     *
     * Un socket vivo que deja de entregar es el fallo más caro de esta pantalla:
     * el operador ve una bandeja quieta y cree que no hay trabajo. Ningún estado
     * de conexión lo delata, porque el socket está abierto. Sesenta segundos de
     * retraso son aceptables; una bandeja congelada en silencio, no.
     *
     * Y si el canal NO llega a suscribirse, 60 s pasan a ser el único mecanismo
     * vivo, que es justo lo que ocurrió hasta el 23-ago-2026: la política de
     * `realtime.messages` no existía, la suscripción privada se denegaba, y
     * como aquí nadie miraba el estado de `subscribe()` la bandeja llevaba
     * semanas actualizándose solo por sondeo sin que nada lo dijera. Degradar a
     * 15 s no arregla el canal —eso es la 0086— pero deja la pantalla usable y,
     * sobre todo, deja rastro en la consola.
     */
    let reloj: ReturnType<typeof setInterval>
    let aviso: ReturnType<typeof setTimeout> | null = null
    const sondear = (ms: number) => {
      clearInterval(reloj)
      reloj = setInterval(() => router.refresh(), ms)
    }
    sondear(60_000)

    const canal = supabase
      .channel(`org:${organizationId}`, { config: { private: true } })
      .on('broadcast', { event: 'cambio' }, refrescar)
      .subscribe((estado, error) => {
        if (estado === 'SUBSCRIBED') {
          if (aviso) { clearTimeout(aviso); aviso = null }
          sondear(60_000)
          return
        }
        if (estado !== 'CHANNEL_ERROR' && estado !== 'TIMED_OUT') return

        // Degradar es inmediato: mientras no haya canal, sondear más rápido no
        // cuesta nada y la pantalla no se queda quieta.
        sondear(15_000)

        // AVISAR, EN CAMBIO, ESPERA DIEZ SEGUNDOS. El primer intento de
        // suscripción sale SIN el JWT —el cliente se une antes de que la sesión
        // esté puesta— y el servidor contesta «Unauthorized: You do not have
        // permissions to read from this Channel topic». Visto en los frames del
        // websocket el 23-ago-2026: acto seguido reintenta con el token y
        // recibe `status: ok`. Es transitorio y se cura solo, así que gritarlo
        // en consola cada carga entrena a ignorar el mensaje justo cuando
        // señale algo real.
        if (aviso) return
        aviso = setTimeout(() => {
          aviso = null
          console.error(
            `[bandeja] el canal org:${organizationId} sigue sin entregar (${estado}) ` +
            'diez segundos después. La pantalla se actualiza solo por sondeo. ' +
            'Suele ser autorización del canal privado: mira la política de realtime.messages.',
            error,
          )
        }, 10_000)
      })

    // Al volver de segundo plano el navegador pudo perder eventos mientras el
    // socket estaba dormido.
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      if (pendiente) clearTimeout(pendiente)
      if (aviso) clearTimeout(aviso)
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
      supabase.removeChannel(canal)
    }
  }, [organizationId, router])

  return null
}
