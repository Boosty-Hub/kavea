'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Comentario } from '@/lib/comentarios'

/**
 * Ocultar, mostrar, editar y borrar un comentario, desde su propia burbuja.
 *
 * EL CICLO COMPLETO EN UN SITIO. Es la nota con la que Meta rechazó
 * `instagram_manage_comments`: «add a comment from your app, edit that comment,
 * and delete it». Publicar ya estaba abajo, en el compositor; lo demás no
 * existía. Va en la burbuja y no en una barra aparte porque el revisor tiene que
 * ver sobre QUÉ comentario actúa, y una barra al pie no lo dice.
 *
 * EDITAR NO ES EDITAR, Y SE DICE. Instagram no deja cambiar el texto de un
 * comentario: Graph acepta ocultar, mostrar y borrar, y nada más. Lo que hace
 * Kavea es publicar el nuevo y borrar el anterior. Aquí se avisa con esas
 * palabras antes de pulsar, porque el resultado se ve en público y cambia el
 * enlace del comentario.
 *
 * QUÉ SALE PARA CADA UNO. Editar y borrar solo en lo que se publicó desde Kavea
 * —lo que la 0097 marca `propio`—; ocultar y mostrar en lo demás, que es
 * moderación de lo que otro escribió en nuestra publicación. Un botón de borrar
 * sobre el comentario de un cliente, en una bandeja compartida y sin vuelta
 * atrás, se pulsa por error un día.
 */
export function AccionesComentario({ c }: { c: Comentario }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(c.texto ?? '')
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function pedir(accion: string, cuerpoExtra?: Record<string, unknown>) {
    setOcupado(accion); setError(null); setAviso(null)
    try {
      const r = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, comentario: c.id, ...cuerpoExtra }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(typeof j.error === 'string' ? j.error : 'Meta no aceptó la acción.'); return false }
      if (j.aviso) setAviso(j.aviso)
      setEditando(false); setConfirmando(false)
      router.refresh()
      return true
    } finally {
      setOcupado(null)
    }
  }

  if (c.borrado_en) return null

  const boton = {
    cursor: 'pointer', fontSize: 12, padding: '3px 8px',
  } as const

  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
      {error ? <p className="error" role="alert" style={{ margin: 0, fontSize: 12 }}>{error}</p> : null}
      {aviso ? <p className="ficha__ayuda" role="status" style={{ margin: 0, fontSize: 12 }}>{aviso}</p> : null}

      {editando ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <textarea
            className="campo"
            rows={2}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            aria-label="Texto nuevo del comentario"
          />
          <p className="ficha__ayuda" style={{ margin: 0, fontSize: 12 }}>
            Instagram no deja cambiar el texto de un comentario. Kavea publica el nuevo y borra el
            anterior, así que el enlace cambia.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button" className="btn" style={boton}
              disabled={ocupado !== null || !texto.trim() || texto.trim() === (c.texto ?? '')}
              onClick={() => void pedir('editar', { texto })}
            >
              {ocupado === 'editar' ? 'Publicando' : 'Publicar el cambio'}
            </button>
            <button
              type="button" className="operar__control" style={boton}
              disabled={ocupado !== null}
              onClick={() => { setEditando(false); setTexto(c.texto ?? '') }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : confirmando ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
            Se borra de Instagram y no se puede deshacer.
          </span>
          <button
            type="button" className="btn" style={boton}
            disabled={ocupado !== null}
            onClick={() => void pedir('borrar')}
          >
            {ocupado === 'borrar' ? 'Borrando' : 'Borrar de verdad'}
          </button>
          <button
            type="button" className="operar__control" style={boton}
            disabled={ocupado !== null} onClick={() => setConfirmando(false)}
          >
            No
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {c.propio ? (
            <>
              <button
                type="button" className="operar__control" style={boton}
                disabled={ocupado !== null} onClick={() => setEditando(true)}
              >
                Editar
              </button>
              <button
                type="button" className="operar__control" style={boton}
                disabled={ocupado !== null} onClick={() => setConfirmando(true)}
              >
                Borrar
              </button>
            </>
          ) : (
            <button
              type="button" className="operar__control" style={boton}
              disabled={ocupado !== null}
              onClick={() => void pedir(c.oculto ? 'mostrar' : 'ocultar')}
            >
              {ocupado ? 'Un momento' : c.oculto ? 'Mostrar' : 'Ocultar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
