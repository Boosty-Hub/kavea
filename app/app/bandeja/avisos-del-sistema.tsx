'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * El aviso del sistema cuando entra algo nuevo.
 *
 * POR QUÉ EXISTE. La bandeja se refresca sola desde la 0086, pero refrescarse
 * solo sirve si alguien la está mirando. Un operador con Kavea en otra pestaña no
 * se entera de nada hasta que vuelve, y en una bandeja compartida eso es una
 * conversación sin contestar durante horas.
 *
 * NO LLEVA EL TEXTO DEL MENSAJE, y es a propósito. El payload del canal solo trae
 * identificadores —la 0023 lo fijó así para que un fallo de autorización de canal
 * no pueda filtrar contenido— y esta pantalla no va a saltarse esa regla para
 * escribir un titular más bonito. Dice que hay algo nuevo; leerlo es un clic que
 * pasa por RLS como todo lo demás.
 *
 * EL PERMISO NO SE PIDE AL CARGAR. Un navegador que pregunta «¿permites
 * notificaciones?» en el primer segundo recibe «no» la mayoría de las veces, y
 * ese «no» es para siempre. Se ofrece un botón discreto y se pide **cuando lo
 * pulsan**, que es cuando la respuesta significa algo.
 *
 * Y SOLO AVISA DE LO ENTRANTE. La 0109 añadió `entrante` al payload justamente
 * para esto: notificar el mensaje que acaba de mandar el propio operador es la
 * forma más rápida de que apague los avisos.
 */
export function AvisosDelSistema({ organizationId }: { organizationId: string }) {
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-soportado'>('default')
  const ultimo = useRef(0)

  useEffect(() => {
    if (typeof Notification === 'undefined') { setPermiso('no-soportado'); return }
    setPermiso(Notification.permission)
  }, [])

  useEffect(() => {
    if (permiso !== 'granted') return

    /**
     * Se escucha al `Refrescador`, que ya tiene el canal abierto, en vez de abrir
     * otro. Ver su comentario: dos canales sobre el mismo tópico en el mismo
     * cliente es una fuente de sorpresas, y la primera versión de esto además
     * escuchaba un tópico que nadie emitía.
     */
    const alCambio = (ev: Event) => {
        const p = ((ev as CustomEvent).detail ?? {}) as {
          tabla?: string; entrante?: boolean; tarjeta_id?: string; fila_id?: string
        }
        if (!p.entrante) return
        if (p.tabla !== 'messages' && p.tabla !== 'comentarios') return

        // Con la pestaña delante no hace falta aviso: la bandeja ya se refrescó.
        if (document.visibilityState === 'visible') return

        // Uno cada cinco segundos como mucho. Una ráfaga de quince mensajes no
        // puede convertirse en quince notificaciones apiladas.
        const ahora = Date.now()
        if (ahora - ultimo.current < 5000) return
        ultimo.current = ahora

        const esComentario = p.tabla === 'comentarios'
        const destino = esComentario
          ? `/bandeja/comentario/${p.fila_id}`
          : p.tarjeta_id ? `/bandeja/${p.tarjeta_id}` : '/bandeja'

        const n = new Notification(
          esComentario ? 'Nuevo comentario' : 'Nuevo mensaje',
          {
            body: esComentario
              ? 'Alguien comentó una publicación. Pulsa para abrirlo.'
              : 'Han escrito a la bandeja. Pulsa para abrirlo.',
            // Una etiqueta fija hace que el sistema REEMPLACE el aviso anterior
            // en vez de apilarlos. Cinco avisos idénticos no dicen más que uno.
            tag: 'kavea-bandeja',
            // Sin `icon`: el proyecto no tiene uno y apuntar a un fichero que no
            // existe deja el aviso sin imagen y una petición 404 por cada uno.
          },
        )
        n.onclick = () => {
          window.focus()
          // `assign` y no `router.push`: la pestaña puede llevar horas dormida y
          // el enrutador del cliente con un árbol viejo. Una navegación completa
          // es lo único que garantiza llegar a la conversación de verdad.
          window.location.assign(destino)
          n.close()
        }
    }

    window.addEventListener('kavea:cambio', alCambio)
    return () => { window.removeEventListener('kavea:cambio', alCambio) }
  }, [organizationId, permiso])

  if (permiso === 'no-soportado' || permiso === 'granted') return null

  if (permiso === 'denied') {
    return (
      <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: '8px 0 0' }}>
        Los avisos del navegador están bloqueados para este sitio. Se activan desde el candado de
        la barra de direcciones.
      </p>
    )
  }

  return (
    <button
      type="button"
      className="operar__control"
      style={{ cursor: 'pointer', fontSize: 12, marginTop: 8 }}
      onClick={() => { void Notification.requestPermission().then(setPermiso) }}
    >
      Avisarme cuando llegue algo nuevo
    </button>
  )
}
