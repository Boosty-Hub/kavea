'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { CanalDePersona } from '@/lib/bandeja'
import { etiquetaCanal, terminoSeguro } from '@/lib/ventana'

/**
 * La persona y sus canales.
 *
 * LO QUE SE UNIFICA ES LA PERSONA, NO LA CONVERSACIÓN.
 *
 * Alguien puede escribir por Instagram y tener además WhatsApp. Para el
 * operador es una sola persona, y aquí se ve como tal. Pero el hilo sigue
 * siendo de un canal, porque la ventana de 24 h, el token de envío y la
 * propiedad del hilo en Meta son de ese canal y de ningún otro. Una
 * "conversación multicanal" tendría dos relojes de ventana a la vez y el
 * compositor no podría decidir si se puede responder.
 *
 * Así que esto no mezcla mensajes: enseña los canales de la persona y lleva de
 * un hilo a otro en un clic.
 */
export function Persona({
  contactoId,
  canales,
  otras,
  conversacionActual,
  canalActual,
}: {
  contactoId: string
  canales: CanalDePersona[]
  otras: Array<{ id: string; canal: string; estado: string; preview_texto: string | null }>
  conversacionActual: string
  canalActual: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function desvincular(identidadId: string, etiqueta: string) {
    if (!confirm(`Quitar ${etiqueta} de esta persona.`)) return
    setOcupado(true); setError(null)
    const supabase = crearClienteNavegador()
    const { error } = await supabase.rpc('desvincular_identidad', { p_identidad: identidadId })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="canales">
        {canales.map((c) => {
          const esActual = c.conversacion_abierta === conversacionActual
          const contenido = (
            <>
              {etiquetaCanal(c.canal)}
              <span style={{ color: 'var(--k-text-2)' }}>{c.etiqueta}</span>
              {/* Solo las manuales se quitan. Las de Meta enrutan los mensajes
                  entrantes: quitarlas los dejaría sin destino, y el RPC las
                  rechaza igualmente. No se ofrece un botón que va a fallar. */}
              {c.origen === 'manual' ? (
                <button
                  type="button"
                  onClick={() => desvincular(c.identidad_id, c.etiqueta)}
                  disabled={ocupado}
                  title={`Quitar ${etiquetaCanal(c.canal)} de esta persona`}
                  aria-label={`Quitar ${etiquetaCanal(c.canal)} ${c.etiqueta}`}
                  style={{
                    border: 0, background: 'transparent', cursor: 'pointer',
                    color: 'var(--k-text-2)', font: 'inherit', padding: '0 0 0 2px', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              ) : null}
            </>
          )
          return c.conversacion_abierta && !esActual ? (
            <Link key={c.identidad_id} href={`/bandeja/${c.conversacion_abierta}`} className="canal-chip">
              {contenido}
            </Link>
          ) : (
            <span key={c.identidad_id} className="canal-chip" aria-current={esActual}>
              {contenido}
            </span>
          )
        })}

        <button
          type="button"
          className="canal-chip"
          style={{ background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
        >
          {abierto ? 'Cerrar' : '+ Canal o persona'}
        </button>
      </div>

      {/* Los otros hilos de la misma persona. Sin esto, un operador responde por
          Instagram sin saber que hace una hora le contaron el problema entero
          por Messenger. */}
      {otras.length > 0 ? (
        <div className="canales" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>Otros hilos:</span>
          {otras.map((o) => (
            <Link key={o.id} href={`/bandeja/${o.id}`} className="canal-chip">
              {etiquetaCanal(o.canal)}
              <span style={{ color: 'var(--k-text-2)' }}>
                {o.estado === 'cerrada' ? 'cerrada' : 'abierta'}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {abierto ? (
        <div
          style={{
            marginTop: 10,
            border: '1px solid var(--k-border)',
            borderRadius: 'var(--r-card)',
            padding: 14,
            display: 'grid',
            gap: 16,
            maxWidth: 520,
            background: 'var(--k-surface)',
          }}
        >
          <AnadirCanal
            contactoId={contactoId}
            ocupado={ocupado}
            setOcupado={setOcupado}
            setError={setError}
            alTerminar={() => { setAbierto(false); router.refresh() }}
          />
          <hr style={{ border: 0, borderTop: '1px solid var(--k-border)', margin: 0 }} />
          <Fusionar
            contactoId={contactoId}
            canalActual={canalActual}
            ocupado={ocupado}
            setOcupado={setOcupado}
            setError={setError}
            alTerminar={() => { setAbierto(false); router.refresh() }}
          />
        </div>
      ) : null}

      {/* Fuera del panel: quitar un canal se hace con el panel cerrado, y un
          error que solo se pinta dentro sería un error que nadie ve. */}
      {error ? (
        <p className="error" role="alert" style={{ marginTop: 8, maxWidth: 520 }}>{error}</p>
      ) : null}
    </div>
  )
}

function AnadirCanal({
  contactoId, ocupado, setOcupado, setError, alTerminar,
}: {
  contactoId: string
  ocupado: boolean
  setOcupado: (v: boolean) => void
  setError: (v: string | null) => void
  alTerminar: () => void
}) {
  const [canal, setCanal] = useState('whatsapp')
  const [valor, setValor] = useState('')
  const [etiqueta, setEtiqueta] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null)
    const supabase = crearClienteNavegador()
    const { error } = await supabase.rpc('vincular_identidad', {
      p_contacto: contactoId,
      p_canal: canal,
      p_valor: valor,
      p_etiqueta: etiqueta || null,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    setValor(''); setEtiqueta('')
    alTerminar()
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 8 }}>
      <p className="label" style={{ margin: 0 }}>Añadir un canal a esta persona</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          className="campo"
          style={{ width: 'auto' }}
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          aria-label="Canal"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="messenger">Messenger</option>
        </select>
        <input
          className="campo"
          style={{ flex: 1, minWidth: 180 }}
          placeholder={canal === 'whatsapp' ? '584125551122' : 'Identificador'}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          required
          aria-label="Identificador"
        />
      </div>
      <input
        className="campo"
        placeholder="Cómo lo verá el equipo (opcional)"
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        aria-label="Etiqueta"
      />
      <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
        Un número de WhatsApp aquí queda registrado junto a la persona. Todavía no
        se envía ni se recibe por WhatsApp: el canal no está conectado.
      </p>
      <button className="btn" type="submit" disabled={ocupado} style={{ justifySelf: 'start' }}>
        {ocupado ? 'Guardando' : 'Añadir canal'}
      </button>
    </form>
  )
}

function Fusionar({
  contactoId, canalActual, ocupado, setOcupado, setError, alTerminar,
}: {
  contactoId: string
  canalActual: string
  ocupado: boolean
  setOcupado: (v: boolean) => void
  setError: (v: string | null) => void
  alTerminar: () => void
}) {
  const [termino, setTermino] = useState('')
  const [resultados, setResultados] = useState<Array<{ id: string; nombre: string | null; username: string | null }>>([])
  const [elegido, setElegido] = useState<{ id: string; nombre: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  async function buscar(t: string) {
    setTermino(t)
    setElegido(null)
    const limpio = terminoSeguro(t)
    if (limpio.length < 2) { setResultados([]); return }
    const supabase = crearClienteNavegador()
    const { data } = await supabase
      .from('contacts')
      .select('id, nombre, username')
      .is('fusionado_en', null)
      .neq('id', contactoId)
      .or(`nombre.ilike.%${limpio}%,username.ilike.%${limpio}%`)
      .limit(8)
    setResultados(data ?? [])
  }

  async function fusionar(e: React.FormEvent) {
    e.preventDefault()
    if (!elegido) return
    setOcupado(true); setError(null)
    const supabase = crearClienteNavegador()
    // El contacto que se está mirando SOBREVIVE y el otro se absorbe: así el
    // operador no pierde de vista el hilo que tiene delante.
    const { error } = await supabase.rpc('fusionar_contactos', {
      p_superviviente: contactoId,
      p_absorbido: elegido.id,
      p_motivo: motivo,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    alTerminar()
  }

  return (
    <form onSubmit={fusionar} style={{ display: 'grid', gap: 8 }}>
      <p className="label" style={{ margin: 0 }}>Es la misma persona que otro contacto</p>
      <input
        className="campo"
        placeholder="Buscar por nombre o usuario"
        value={termino}
        onChange={(e) => buscar(e.target.value)}
        aria-label="Buscar contacto"
      />

      {resultados.length > 0 && !elegido ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              className="adjunto__ficha"
              onClick={() => setElegido({ id: r.id, nombre: r.nombre ?? r.username ?? 'contacto sin nombre' })}
              style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
            >
              <span className="adjunto__nombre">{r.nombre ?? r.username ?? 'Contacto sin nombre'}</span>
              <span className="adjunto__accion">Elegir</span>
            </button>
          ))}
        </div>
      ) : null}

      {elegido ? (
        <>
          <p style={{ fontSize: 13, margin: 0 }}>
            Se absorberá <strong>{elegido.nombre}</strong>. Sus hilos e identidades pasan
            a esta persona.
          </p>
          <input
            className="campo"
            placeholder="Motivo (mínimo 8 caracteres)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
            minLength={8}
            aria-label="Motivo de la fusión"
          />
          <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
            Queda escrito en el hilo y se puede deshacer. Si los dos tienen un hilo
            abierto en {etiquetaCanal(canalActual)}, hay que cerrar uno antes:
            dos hilos abiertos en el mismo canal son dos cuentas distintas.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="submit" disabled={ocupado}>
              {ocupado ? 'Fusionando' : 'Fusionar'}
            </button>
            <button
              type="button"
              className="canal-chip"
              style={{ cursor: 'pointer', font: 'inherit' }}
              onClick={() => { setElegido(null); setMotivo('') }}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : null}
    </form>
  )
}
