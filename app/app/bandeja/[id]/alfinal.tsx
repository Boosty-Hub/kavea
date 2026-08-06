'use client'

import { useEffect, useRef } from 'react'

/**
 * El hilo abre por el final.
 *
 * Medido antes de escribir esto: al abrir una conversación, scrollTop = 0 con
 * scrollHeight = 1325 y clientHeight = 732. Es decir, el operador aterrizaba en
 * el mensaje MÁS VIEJO y tenía que bajar a mano para ver por qué le habían
 * escrito. En una bandeja que se abre cien veces al día eso no es un detalle.
 *
 * Dos sutilezas que hacen falta para que funcione de verdad:
 *
 * · Las imágenes cargan DESPUÉS del primer render y empujan el fondo hacia
 *   abajo. Un scroll único al montar deja el hilo a medio camino en cuanto hay
 *   un adjunto. Por eso hay un ResizeObserver: mientras estemos pegados abajo,
 *   nos mantenemos pegados abajo aunque el contenido crezca.
 *
 * · Si el operador ha subido a leer historial y entra un mensaje nuevo, saltar
 *   al final le arranca la lectura de las manos. Solo se sigue al fondo si ya
 *   estaba cerca del fondo.
 *
 * LA EXCEPCIÓN: LO QUE MANDAS TÚ.
 *
 * Esa última regla vale para un mensaje que ENTRA, no para uno que acabas de
 * escribir. Si has subido a releer algo, pulsas enviar y la vista se queda
 * donde estaba, tu mensaje sale disparado a un sitio que no ves: no sabes si se
 * mandó, y lo reescribes. Se vio grabando el screencast del App Review, que es
 * donde más se nota porque el vídeo enseña exactamente lo que ve el operador.
 *
 * Por eso el compositor avisa con `kavea:al-fondo` y aquí se baja sin preguntar.
 * Va por evento y no por prop: `AlFinal` y el compositor son hermanos con el
 * hilo entero en medio, y pasar una señal de uno a otro obligaría a subir estado
 * hasta la página y bajarlo por dos ramas para un empujón que no es estado.
 */
export function AlFinal({ marca }: { marca: string }) {
  const ancla = useRef<HTMLDivElement>(null)
  const primeraVez = useRef(true)

  useEffect(() => {
    const nodo = ancla.current
    const cuerpo = nodo?.closest('.hilo__cuerpo') as HTMLElement | null
    if (!nodo || !cuerpo) return

    const cercaDelFondo = () =>
      cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 160

    const alFondo = (suave: boolean) => {
      cuerpo.scrollTo({ top: cuerpo.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
    }

    let pegado = primeraVez.current || cercaDelFondo()
    if (pegado) alFondo(!primeraVez.current)
    primeraVez.current = false

    // El usuario manda: en cuanto se separa del fondo, dejamos de seguirlo.
    const alScroll = () => { pegado = cercaDelFondo() }
    cuerpo.addEventListener('scroll', alScroll, { passive: true })

    // Acabas de enviar: se baja pase lo que pase, y además se vuelve a pegar,
    // porque el mensaje todavía no está pintado cuando llega este aviso. El
    // ResizeObserver de abajo hace el resto cuando aparezca.
    const forzar = () => { pegado = true; alFondo(true) }
    window.addEventListener('kavea:al-fondo', forzar)

    const ro = new ResizeObserver(() => { if (pegado) alFondo(false) })
    for (const hijo of Array.from(cuerpo.children)) ro.observe(hijo)

    return () => {
      cuerpo.removeEventListener('scroll', alScroll)
      window.removeEventListener('kavea:al-fondo', forzar)
      ro.disconnect()
    }
  }, [marca])

  return <div ref={ancla} aria-hidden="true" style={{ height: 0 }} />
}
