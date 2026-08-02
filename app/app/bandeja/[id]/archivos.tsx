'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Archivo } from '@/lib/comercial'
import { pesoLegible } from '@/lib/ventana'

/**
 * Archivos de la conversación, de la persona y de la organización.
 *
 * La subida va DIRECTA del navegador a Supabase Storage. No pasa por el
 * servidor de la aplicación: subir 20 MB a una función de Netlify para que ella
 * los reenvíe es pagar dos veces el mismo tráfico y chocar con su límite de
 * cuerpo. Las políticas del bucket comprueban que el primer segmento de la ruta
 * sea una organización de la que este usuario es miembro.
 *
 * ENVIAR NO ES DE ESTA FASE. Aquí el archivo se guarda y se marca si Meta lo
 * aceptará; el botón de mandarlo llega con el compositor. Un botón que parece
 * que envía y no envía es peor que no tener botón.
 */
export function Archivos({
  organizacionId, tarjetaId, contactoId, archivos,
}: {
  organizacionId: string
  tarjetaId: string
  contactoId: string | null
  archivos: Archivo[]
}) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [ambito, setAmbito] = useState<'tarjeta' | 'contacto' | 'organizacion'>('tarjeta')

  async function subir(file: File) {
    setSubiendo(true); setError(null)
    const supabase = crearClienteNavegador()

    // El nombre se limpia para la ruta pero se guarda entero en la fila: la
    // ruta tiene que ser predecible, el nombre tiene que ser el que el operador
    // reconoce.
    const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
    const carpeta = ambito === 'tarjeta' ? `t/${tarjetaId}`
      : ambito === 'contacto' ? `c/${contactoId}` : 'org'
    const ruta = `${organizacionId}/${carpeta}/${crypto.randomUUID()}-${limpio}`

    const { error: errSubida } = await supabase.storage
      .from('salientes')
      .upload(ruta, file, { contentType: file.type || undefined, upsert: false })

    if (errSubida) {
      setSubiendo(false)
      setError(
        errSubida.message.includes('exceeded')
          ? 'El archivo pasa de 25 MB, que es el tope del almacén.'
          : errSubida.message,
      )
      return
    }

    const { error: errFila } = await supabase.rpc('registrar_archivo', {
      p_org: organizacionId,
      p_nombre: file.name,
      p_ruta: ruta,
      p_bytes: file.size,
      p_content_type: file.type || null,
      p_contacto: ambito === 'contacto' ? contactoId : null,
      p_tarjeta: ambito === 'tarjeta' ? tarjetaId : null,
    })

    setSubiendo(false)
    if (errFila) {
      // El objeto quedó arriba y la fila no. Se dice, en vez de dejar un
      // huérfano silencioso del que nadie se entera.
      setError(`El archivo se subió pero no se pudo registrar: ${errFila.message}`)
      return
    }
    if (entrada.current) entrada.current.value = ''
    router.refresh()
  }

  async function abrir(a: Archivo) {
    // URL firmada y de vida corta: el bucket es privado y el enlace no debería
    // sobrevivir al portapapeles de nadie.
    const { data, error } = await crearClienteNavegador()
      .storage.from('salientes').createSignedUrl(a.storage_path, 60)
    if (error) { setError(error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function borrar(a: Archivo) {
    if (!confirm(`Borrar "${a.nombre}".`)) return
    const supabase = crearClienteNavegador()
    const { data, error } = await supabase.rpc('borrar_archivo', { p_archivo: a.id })
    if (error) { setError(error.message); return }
    if (data) await supabase.storage.from('salientes').remove([data as string])
    router.refresh()
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="ficha__bloque">
        <p className="ficha__titulo">Subir un archivo</p>
        <select
          className="campo"
          value={ambito}
          onChange={(e) => setAmbito(e.target.value as typeof ambito)}
          aria-label="Dónde se guarda"
          disabled={subiendo}
        >
          <option value="tarjeta">Solo en este asunto</option>
          {contactoId ? <option value="contacto">En esta persona, para todos sus asuntos</option> : null}
          <option value="organizacion">En la biblioteca, para todo el equipo</option>
        </select>
        <input
          ref={entrada}
          className="campo"
          type="file"
          disabled={subiendo}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }}
          aria-label="Archivo"
        />
        <span className="ficha__ayuda">
          {subiendo
            ? 'Subiendo…'
            : 'Se comprueba al subir si Meta lo aceptará: PNG y JPEG hasta 8 MB, el resto hasta 25 MB.'}
        </span>
      </section>

      <section className="ficha__bloque">
        <p className="ficha__titulo">Archivos ({archivos.length})</p>
        {archivos.length === 0 ? (
          <p className="ficha__vacia">
            Todavía no hay ninguno. Lo que se suba aquí se podrá adjuntar a una respuesta
            cuando llegue el compositor.
          </p>
        ) : (
          archivos.map((a) => (
            <div key={a.id} className="archivo">
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => abrir(a)}
                  style={{
                    border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
                    font: 'inherit', fontSize: 13, textAlign: 'left', color: 'inherit',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}
                >
                  {a.nombre}
                </button>
                <div className="ficha__ayuda">
                  {pesoLegible(a.bytes)} · {ambitoDe(a)}
                  {!a.enviable ? (
                    <span style={{ color: 'var(--k-escalada-fg)' }}> · no se podrá enviar</span>
                  ) : null}
                </div>
                {!a.enviable && a.motivo_no_enviable ? (
                  <div className="ficha__ayuda" style={{ color: 'var(--k-escalada-fg)' }}>
                    {a.motivo_no_enviable}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => borrar(a)}
                aria-label={`Borrar ${a.nombre}`}
                style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--k-text-2)', font: 'inherit' }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function ambitoDe(a: Archivo): string {
  if (a.tarjeta_id) return 'de este asunto'
  if (a.contacto_id) return 'de esta persona'
  return 'de la biblioteca'
}
