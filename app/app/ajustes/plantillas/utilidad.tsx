'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Las plantillas de utilidad de Messenger.
 *
 * NO SE GUARDAN EN KAVEA, y por eso esta pantalla se comporta distinta de la de
 * arriba. Son objetos de Meta: se crean contra la Página, Meta las aprueba en
 * segundos, y su estado puede cambiar después sin avisarnos. Una copia local de
 * algo que aprueba un tercero es una copia que se queda desfasada, y el día que
 * se desfase la pantalla dirá «aprobada» sobre una plantilla que Meta ya rechazó.
 *
 * Así que se lee en vivo cada vez que se abre. Cuesta una llamada en una pantalla
 * que se visita poco.
 */

type Plantilla = {
  id?: string
  name?: string
  language?: string
  status?: string
  category?: string
  components?: Array<{ type?: string; text?: string }>
  /** Solo cuando `status` es REJECTED. Meta lo manda si se le pide por su nombre. */
  rejected_reason?: string
}

/**
 * Los motivos de rechazo de Meta, en castellano y con la salida al lado.
 *
 * El código a secas —`INCORRECT_CATEGORY`— no le dice nada a quien acaba de
 * escribir una plantilla, y buscarlo es una visita a la documentación de Meta.
 * Los dos primeros son los que ya se han cobrado una plantilla cada uno el
 * 24-ago; los demás están porque el día que salgan no habrá que volver aquí.
 */
const MOTIVO: Record<string, string> = {
  INCORRECT_CATEGORY:
    'Categoría equivocada. Meta cree que el contenido pertenece a otra: los códigos de acceso '
    + 'son de autenticación y las promociones, de marketing.',
  INVALID_FORMAT:
    'Formato inválido. Casi siempre son los ejemplos: una plantilla con {{1}} y sin ejemplo se '
    + 'crea y se rechaza en el mismo instante.',
  ABUSIVE_CONTENT: 'Contenido no permitido por las normas de Meta.',
  PROMOTIONAL: 'Es promocional y se envió como utilidad. Va en la categoría de marketing.',
  TAG_CONTENT_MISMATCH: 'El contenido no encaja con la etiqueta declarada.',
  SCAM: 'Meta lo leyó como un intento de engaño.',
  NONE: 'Meta no dio motivo.',
}

const CARA: Record<string, { texto: string; fg: string; bg: string }> = {
  APPROVED: { texto: 'Aprobada', fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)' },
  PENDING:  { texto: 'En revisión', fg: 'var(--k-esperando-fg)', bg: 'var(--k-esperando-bg)' },
  REJECTED: { texto: 'Rechazada', fg: 'var(--k-escalada-fg)', bg: 'var(--k-escalada-bg)' },
}

/** Cuántos `{{n}}` distintos lleva el texto. Es lo que decide cuántos ejemplos pedir. */
function variablesDe(texto: string): number {
  const vistos = new Set<string>()
  for (const m of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) vistos.add(m[1]!)
  return vistos.size
}

export function PlantillasDeUtilidad({ puedeConfigurar }: { puedeConfigurar: boolean }) {
  const [lista, setLista] = useState<Plantilla[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [texto, setTexto] = useState('')
  const [ejemplos, setEjemplos] = useState<string[]>([])

  const necesarias = variablesDe(texto)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/plantillas-utilidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'listar' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudieron leer las plantillas.'); setLista([]); return }
      setLista(j.plantillas ?? [])
    } catch {
      setError('No se pudo hablar con Meta ahora mismo.')
      setLista([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    try {
      const r = await fetch('/api/plantillas-utilidad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'crear', nombre, texto, idioma: 'es_ES',
          ejemplos: ejemplos.slice(0, necesarias),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'Meta no aceptó la plantilla.'); return }
      setNombre(''); setTexto(''); setEjemplos([]); setAbierto(false)
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>De utilidad, en Messenger</h2>
        <button
          type="button"
          className="operar__control"
          style={{ cursor: 'pointer', marginLeft: 'auto', fontSize: 13 }}
          onClick={() => void cargar()}
        >
          Volver a leer
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '6px 0 0', maxWidth: 620 }}>
        Avisos de pedido, de cita o de cuenta que se mandan por Messenger. Las aprueba Meta, no
        Kavea, y su estado se lee de Meta cada vez que se abre esta pantalla: aquí no hay copia
        que se pueda quedar desfasada.
      </p>

      {error ? <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}

      <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
        {lista === null ? (
          <p className="ficha__vacia" style={{ padding: 16 }}>Leyendo de Meta…</p>
        ) : lista.length === 0 ? (
          <p className="ficha__vacia" style={{ padding: 16 }}>
            Esta Página no tiene ninguna plantilla de utilidad todavía.
          </p>
        ) : (
          lista.map((p) => {
            const cara = CARA[p.status ?? ''] ?? { texto: p.status ?? '—', fg: 'var(--k-text-2)', bg: 'var(--k-surface-2)' }
            const body = p.components?.find((c) => c.type === 'BODY')?.text ?? ''
            // El motivo se enseña SIEMPRE que exista. Una pantalla que dice
            // «Rechazada» y calla por qué obliga a ir al panel de Meta a
            // averiguar algo que la API ya había contestado.
            const motivo = p.status === 'REJECTED' && p.rejected_reason && p.rejected_reason !== 'NONE'
              ? (MOTIVO[p.rejected_reason] ?? p.rejected_reason)
              : null
            return (
              <div key={p.id ?? p.name} className="miembro" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    <code>{p.name}</code>
                    <span style={{ fontWeight: 400, color: 'var(--k-text-2)' }}> · {p.language}</span>
                  </div>
                  {body ? (
                    <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 2 }}>{body}</div>
                  ) : null}
                  {motivo ? (
                    <div style={{ fontSize: 13, color: 'var(--k-escalada-fg)', marginTop: 4 }}>
                      {motivo}
                    </div>
                  ) : null}
                </div>
                <span
                  className="pildora"
                  style={{ flex: 'none', background: cara.bg, color: cara.fg }}
                >
                  {cara.texto}
                </span>
              </div>
            )
          })
        )}
      </div>

      {!puedeConfigurar ? null : !abierto ? (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() => setAbierto(true)}
        >
          Nueva plantilla de utilidad
        </button>
      ) : (
        <form onSubmit={crear} className="tarjeta" style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="label">Nombre en Meta</span>
            <input
              className="campo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="aviso_de_pedido"
              required
            />
            {/* El nombre no se «arregla» en silencio. Si el operador escribe
                «Aviso de envío» y Kavea lo convierte por su cuenta, la plantilla
                que ve en el panel de Meta no es la que él nombró. */}
            <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
              Minúsculas, números y guion bajo. Lo exige Meta y no se corrige solo. Si Meta la
              rechaza, ese nombre queda ocupado y hay que empezar con otro.
            </span>
          </label>

          <label style={{ display: 'grid', gap: 4 }}>
            <span className="label">Texto</span>
            <textarea
              className="campo"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Hola {{1}}, su pedido {{2}} ya va en camino."
              required
            />
            <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
              Los huecos van numerados: <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>.
            </span>
          </label>

          {/* LOS EJEMPLOS SE PIDEN AQUÍ Y NO SON OPCIONALES. Una plantilla con
              variables y sin ejemplos Meta la crea y la rechaza en el mismo
              instante, y hay que borrarla y empezar con otro nombre. */}
          {Array.from({ length: necesarias }, (_, i) => (
            <label key={i} style={{ display: 'grid', gap: 4 }}>
              <span className="label">{`Ejemplo para {{${i + 1}}}`}</span>
              <input
                className="campo"
                value={ejemplos[i] ?? ''}
                onChange={(e) => {
                  const v = [...ejemplos]; v[i] = e.target.value; setEjemplos(v)
                }}
                required
              />
            </label>
          ))}
          {necesarias > 0 ? (
            <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
              Meta exige un ejemplo por hueco. Sin ellos rechaza la plantilla nada más crearla.
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn" disabled={guardando}>
              {guardando ? 'Enviando a Meta' : 'Crear y enviar a Meta'}
            </button>
            <button
              type="button"
              className="operar__control"
              style={{ cursor: 'pointer' }}
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
