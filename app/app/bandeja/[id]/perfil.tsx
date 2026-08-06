'use client'

import { useEffect, useRef, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * La cara del contacto en la cabecera del hilo: avatar, y de ahí a la foto
 * grande o a su perfil de Instagram.
 *
 * LA URL FIRMADA SE PIDE DESDE EL NAVEGADOR, con la sesión del usuario, igual
 * que en `archivos.tsx` y en la bandeja de correo. Es lo que hace que la
 * política `perfiles_leer` decida de verdad: si el objeto es de otra
 * organización, la firma no se emite. Firmarla en el servidor con el rol de
 * servicio saltaría RLS y convertiría la ruta en el único control, que es
 * exactamente el fallo que las políticas existen para no depender de él.
 *
 * Vida corta a propósito. El enlace no debería sobrevivir al portapapeles de
 * nadie, y la foto se vuelve a firmar cada vez que se abre la conversación.
 */

const VIDA_FIRMA = 60 * 10

export function Perfil({
  nombre, username, fotoRuta,
}: {
  nombre: string
  username: string | null
  fotoRuta: string | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [abierta, setAbierta] = useState(false)
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!fotoRuta) { setUrl(null); return }
    let vivo = true
    crearClienteNavegador()
      .storage.from('perfiles').createSignedUrl(fotoRuta, VIDA_FIRMA)
      .then(({ data }) => { if (vivo) setUrl(data?.signedUrl ?? null) })
      // Sin foto se sigue viendo la inicial. Un avatar que no carga no es motivo
      // para enseñar un error en la cabecera de la conversación.
      .catch(() => { if (vivo) setUrl(null) })
    return () => { vivo = false }
  }, [fotoRuta])

  /**
   * `<dialog>` nativo y no el patrón de `notificaciones.tsx`.
   *
   * Aquel es un popover que se cierra al pinchar fuera; esto es un modal, y el
   * elemento nativo trae gratis lo que un div tendría que reimplementar mal:
   * Escape para cerrar, foco atrapado dentro, y capa superior por encima de
   * cualquier `z-index` de la página.
   */
  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (abierta && !d.open) d.showModal()
    if (!abierta && d.open) d.close()
  }, [abierta])

  const perfilUrl = username ? `https://instagram.com/${username}` : null
  const inicial = (nombre.trim()[0] ?? '?').toUpperCase()

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {url ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label={`Ver la foto de ${nombre} en grande`}
          style={{
            padding: 0, border: 0, background: 'none', cursor: 'zoom-in',
            borderRadius: '50%', lineHeight: 0,
          }}
        >
          {/* `img` y no `next/image`: la fuente es una URL firmada que cambia en
              cada carga, así que el optimizador no puede cachear nada y solo
              añadiría un salto por el servidor de Next para el mismo byte. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            width={40}
            height={40}
            style={{
              width: 40, height: 40, borderRadius: '50%', objectFit: 'cover',
              border: '1px solid var(--k-border)',
            }}
          />
        </button>
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 40, height: 40, borderRadius: '50%',
            display: 'grid', placeItems: 'center',
            background: 'var(--k-surface-2)', color: 'var(--k-text-2)',
            fontSize: 16, fontWeight: 500,
          }}
        >
          {inicial}
        </span>
      )}

      <span style={{ display: 'grid', minWidth: 0 }}>
        <h2 style={{ margin: 0 }}>{nombre}</h2>
        {perfilUrl ? (
          <a
            href={perfilUrl}
            target="_blank"
            // `noopener` no es opcional: sin él la pestaña que se abre puede
            // reescribir la de Kavea por `window.opener`.
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--k-text-2)', width: 'fit-content' }}
          >
            @{username} ↗
          </a>
        ) : null}
      </span>

      {url ? (
        <dialog
          ref={dialogo}
          onClose={() => setAbierta(false)}
          // Pinchar en el fondo cierra. El `<dialog>` nativo no lo trae, y sin
          // esto la única salida es Escape o el botón, que en una foto a
          // pantalla completa no es lo que nadie intenta primero.
          onClick={(e) => { if (e.target === dialogo.current) setAbierta(false) }}
          style={{
            padding: 0, border: 0, background: 'none',
            maxWidth: '90vw', maxHeight: '90vh',
          }}
        >
          <figure style={{ margin: 0, display: 'grid', gap: 8, justifyItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Foto de perfil de ${nombre}`}
              style={{
                maxWidth: '90vw', maxHeight: '80vh',
                borderRadius: 12, display: 'block', background: 'var(--k-surface)',
              }}
            />
            <figcaption style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {perfilUrl ? (
                <a href={perfilUrl} target="_blank" rel="noopener noreferrer" className="btn">
                  Abrir en Instagram ↗
                </a>
              ) : null}
              <button type="button" className="btn" onClick={() => setAbierta(false)}>
                Cerrar
              </button>
            </figcaption>
          </figure>
        </dialog>
      ) : null}
    </span>
  )
}
