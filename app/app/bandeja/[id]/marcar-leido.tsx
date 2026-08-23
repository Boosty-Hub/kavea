'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * Marca la tarjeta como leída al abrir su hilo.
 *
 * `public.marcar_leido` existía desde la 0027 y nadie la llamaba: `no_leidos`
 * solo subía. Va en un efecto de cliente y no en el render del servidor a
 * propósito — Next.js puede prefetchear este `Link` al pasar el cursor por
 * encima en la lista, y un prefetch no ejecuta efectos de React. Marcar leído
 * dentro del render del servidor habría vaciado el contador sin que nadie
 * abriera nada.
 */
export function MarcarLeido({ conversacionId }: { conversacionId: string }) {
  const router = useRouter()
  const marcada = useRef<string | null>(null)

  useEffect(() => {
    if (!conversacionId || marcada.current === conversacionId) return
    marcada.current = conversacionId
    crearClienteNavegador()
      .rpc('marcar_leido', { p_conversacion: conversacionId })
      .then(() => router.refresh())
  }, [conversacionId, router])

  return null
}
