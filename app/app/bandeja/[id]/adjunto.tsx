'use client'

import { useState } from 'react'
import type { Adjunto } from '@/lib/bandeja'

/**
 * Los adjuntos se ven, y se abren aparte para guardarlos.
 *
 * POR QUÉ ESTO NO ROMPE EL INVARIANTE DE "NUNCA EL BINARIO"
 *
 * El `src` apunta directo al CDN de Meta. Quien pide la imagen es el NAVEGADOR
 * del operador, exactamente igual que cuando abre Instagram. Kavea no la
 * descarga, no la proxea y no la guarda: en la base sigue habiendo solo la URL.
 * El invariante del documento 03 prohíbe persistir el binario, y aquí no se
 * persiste nada.
 *
 * COMPROBADO CONTRA LA URL REAL, no deducido:
 *   HTTP 200 sin token             → no hace falta autenticación
 *   Cross-Origin-Resource-Policy: cross-origin → se puede incrustar
 *   Cache-Control: no-store        → Meta misma dice que no se guarde
 *   Access-Control-Allow-Origin ausente → JS NO puede leer los bytes
 *
 * Esa última línea es la que decide la forma del botón de descarga. Sin CORS no
 * se puede hacer fetch + blob + <a download>, y el atributo `download` a secas
 * lo ignoran los navegadores cuando el destino es de otro origen. La única
 * descarga honesta es abrir el original en una pestaña y dejar que el navegador
 * haga lo suyo. Fabricar un botón "Descargar" que en realidad navega sería
 * mentir sobre lo que hace.
 *
 * La alternativa —proxear desde el servidor con Content-Disposition— exigiría
 * que Kavea se bajara el binario, y eso es justo lo que el documento 03 deja
 * abierto como riesgo sin resolver, pendiente de respuesta por escrito de Meta.
 * No se hace hasta tener esa respuesta.
 */
export function Adjuntos({ lista }: { lista: Adjunto[] }) {
  if (!lista.length) return null
  return (
    <div className="adjuntos">
      {lista.map((a, i) => (
        <Pieza key={`${a.message_id}-${i}`} a={a} />
      ))}
    </div>
  )
}

function Pieza({ a }: { a: Adjunto }) {
  const [caido, setCaido] = useState(false)
  const url = a.cdn_url

  if (!url) return <p className="adjunto__caido">{nombre(a.tipo)} sin URL utilizable.</p>

  // Meta no documenta cuánto viven estas URLs y no guardamos el binario, así
  // que cuando caduca el adjunto se pierde. Decirlo es mejor que dejar el icono
  // de imagen rota, que se lee como un fallo de Kavea.
  if (caido) {
    return (
      <p className="adjunto__caido">
        {nombre(a.tipo)} · Meta ya no sirve este archivo. Los adjuntos entrantes
        viven en el CDN de Meta y caducan; Kavea no guarda copia.
      </p>
    )
  }

  const abrir = (
    <a
      className="adjunto__accion"
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Se abre en una pestaña nueva. Desde ahí lo guardas con el navegador."
    >
      Abrir original
    </a>
  )

  if (a.tipo === 'image' || a.tipo === 'sticker') {
    return (
      <figure style={{ margin: 0 }}>
        {/* referrerPolicy no-referrer: sin él, cada carga le cuenta a Meta qué
            hilo de qué subdominio de cliente se está mirando. */}
        <a className="adjunto__abrir" href={url} target="_blank" rel="noreferrer">
          <img
            className="adjunto__media"
            src={url}
            alt={nombre(a.tipo)}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setCaido(true)}
          />
        </a>
        <figcaption className="adjunto__accion" style={{ marginTop: 4 }}>
          {abrir}
        </figcaption>
      </figure>
    )
  }

  if (a.tipo === 'video') {
    return (
      <figure style={{ margin: 0 }}>
        <video
          className="adjunto__media"
          src={url}
          controls
          preload="metadata"
          onError={() => setCaido(true)}
        />
        <figcaption className="adjunto__accion" style={{ marginTop: 4 }}>{abrir}</figcaption>
      </figure>
    )
  }

  // Nota de voz. Se reproduce en el hilo: obligar a abrir una pestaña para oír
  // cinco segundos de audio es exactamente el roce que hace que un operador
  // deje de escucharlas.
  if (a.tipo === 'audio') {
    return (
      <div>
        <audio className="adjunto__audio" src={url} controls preload="metadata" onError={() => setCaido(true)} />
        <div className="adjunto__accion">Nota de voz · {abrir}</div>
      </div>
    )
  }

  return (
    <a className="adjunto__ficha" href={url} target="_blank" rel="noreferrer">
      <span className="adjunto__icono" aria-hidden="true">{icono(a.tipo)}</span>
      <span className="adjunto__nombre">{nombre(a.tipo)}</span>
      <span className="adjunto__accion">Abrir</span>
    </a>
  )
}

function nombre(tipo: string): string {
  switch (tipo) {
    case 'image': return 'Imagen'
    case 'video': return 'Vídeo'
    case 'audio': return 'Nota de voz'
    case 'file': return 'Archivo'
    case 'sticker': return 'Sticker'
    case 'share':
    case 'ig_post': return 'Publicación compartida'
    case 'story_mention': return 'Mención en historia'
    case 'story_reply': return 'Respuesta a una historia'
    case 'location': return 'Ubicación'
    case 'fallback': return 'Adjunto no reconocido'
    default: return `Adjunto (${tipo})`
  }
}

function icono(tipo: string): string {
  switch (tipo) {
    case 'file': return '📎'
    case 'location': return '📍'
    case 'share':
    case 'ig_post': return '🔗'
    case 'story_mention':
    case 'story_reply': return '⭘'
    default: return '📄'
  }
}
