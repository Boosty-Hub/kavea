'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { fechaHora } from '@/lib/fechas'
import type { Adjunto, Correo } from '@/lib/correos'

/**
 * La bandeja: lista, correo abierto y respuesta.
 *
 * LOS ADJUNTOS SE PIDEN AL ABRIR EL CORREO, NO AL CARGAR LA LISTA. Con doscientos
 * correos serían doscientas consultas para pintar algo que nadie está mirando
 * todavía.
 *
 * Y SU ENLACE SE FIRMA EN EL NAVEGADOR. El bucket es privado y la política de
 * Storage exige staff, así que la sesión de quien mira es exactamente el permiso
 * que hace falta. Firmarlo en el servidor obligaría a repartir enlaces con vida
 * propia a todo el que cargue la página.
 */
export function Bandeja({ correos }: { correos: Correo[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [adjuntos, setAdjuntos] = useState<Record<string, Adjunto[]>>({})
  const [respuesta, setRespuesta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; mal: boolean } | null>(null)

  async function abrir(c: Correo) {
    if (abierto === c.id) { setAbierto(null); return }
    setAbierto(c.id)
    setRespuesta('')
    setAviso(null)

    const supabase = crearClienteNavegador()

    if (!adjuntos[c.id]) {
      const { data } = await supabase.rpc('panel_correo_adjuntos', { p_correo: c.id })
      setAdjuntos((prev) => ({ ...prev, [c.id]: (data ?? []) as Adjunto[] }))
    }

    if (c.direccion === 'entrante' && !c.leido_en) {
      await supabase.rpc('marcar_correo_leido', { p_id: c.id })
      router.refresh()
    }
  }

  async function descargar(a: Adjunto) {
    if (!a.ruta) return
    const { data, error } = await crearClienteNavegador()
      .storage.from('correo-adjuntos').createSignedUrl(a.ruta, 3600)
    if (error || !data) { setAviso({ texto: `No se pudo abrir ${a.nombre}.`, mal: true }); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function responder(c: Correo) {
    const texto = respuesta.trim()
    if (!texto) return
    setEnviando(true); setAviso(null)

    const r = await fetch('/api/correos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correoId: c.id, texto }),
    })
    const j = (await r.json()) as { ok?: boolean; error?: string; motivo?: string }
    setEnviando(false)

    if (!r.ok || !j.ok) {
      setAviso({ texto: j.error ?? 'No se pudo enviar.', mal: true })
      return
    }
    setRespuesta('')
    setAviso({ texto: j.motivo ?? 'Respuesta enviada.', mal: Boolean(j.motivo) })
    router.refresh()
  }

  if (correos.length === 0) {
    return (
      <p className="muted" style={{ marginTop: 24 }}>
        No hay correos guardados todavía. Manda uno a <strong>support@kavea.ai</strong> y recarga.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
      {correos.map((c) => {
        const entrante = c.direccion === 'entrante'
        const sinLeer = entrante && !c.leido_en
        const esteAbierto = abierto === c.id
        const lista = adjuntos[c.id] ?? []

        return (
          <div
            key={c.id}
            className="tarjeta"
            style={{ borderColor: sinLeer ? 'var(--k-escalada-fg)' : 'var(--k-border)' }}
          >
            <button
              onClick={() => abrir(c)}
              aria-expanded={esteAbierto}
              style={{
                all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: sinLeer ? 600 : 400, flex: 1, minWidth: 200 }}>
                  {c.asunto || '(sin asunto)'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                  {fechaHora(c.fecha, 'UTC')} UTC
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 3 }}>
                {entrante ? `de ${c.de}` : `a ${c.para.join(', ')}`}
                {entrante && c.recibido_para ? ` · para ${c.recibido_para}` : ''}
                {!entrante ? ' · enviado' : ''}
                {lista.length > 0 ? ` · ${lista.length} adjunto${lista.length === 1 ? '' : 's'}` : ''}
              </div>
            </button>

            {esteAbierto ? (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--k-border)', paddingTop: 14 }}>
                {/* Se muestra el texto plano, no el HTML. Pintar HTML de un correo
                    entrante en el panel interno es aceptar que un desconocido
                    inyecte marcado en la pantalla del staff. */}
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, margin: 0 }}>
                  {c.texto || '(el correo no traía texto plano)'}
                </p>

                {lista.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>
                    {lista.map((a) => (
                      <div key={a.id} style={{ fontSize: 13 }}>
                        {a.ruta ? (
                          <button
                            onClick={() => descargar(a)}
                            style={{ all: 'unset', cursor: 'pointer', color: 'var(--k-accent)' }}
                          >
                            {a.nombre}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--k-text-2)' }}>
                            {a.nombre} — no se guardó, era demasiado grande
                          </span>
                        )}
                        <span style={{ color: 'var(--k-text-2)' }}>
                          {a.bytes ? ` · ${Math.max(1, Math.round(a.bytes / 1024))} KB` : ''}
                          {a.tipo ? ` · ${a.tipo}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {entrante ? (
                  <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
                    <label className="label" htmlFor={`r-${c.id}`}>
                      Responder a {c.de}
                    </label>
                    <textarea
                      id={`r-${c.id}`}
                      className="campo"
                      rows={4}
                      value={respuesta}
                      disabled={enviando}
                      onChange={(e) => setRespuesta(e.target.value)}
                      placeholder="Se envía desde support@kavea.ai, en el mismo hilo."
                    />
                    <div>
                      <button
                        className="btn btn--primary"
                        disabled={enviando || respuesta.trim().length === 0}
                        onClick={() => responder(c)}
                      >
                        {enviando ? 'Enviando…' : 'Responder'}
                      </button>
                    </div>
                    {aviso ? (
                      <p
                        role="status"
                        style={{ margin: 0, fontSize: 13, color: aviso.mal ? 'var(--k-escalada-fg)' : 'var(--k-text-2)' }}
                      >
                        {aviso.texto}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
