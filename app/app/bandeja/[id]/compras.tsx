'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { Documento, ResumenComercial } from '@/lib/comercial'
import { formatoValor } from '@/lib/ventana'

/**
 * El historial comercial de la PERSONA.
 *
 * No de la tarjeta. Un cliente que compra tres veces al año tiene tres asuntos
 * y un solo historial, y al abrir la conversación de hoy hay que ver lo que
 * compró en marzo: es lo que decide cómo se le atiende.
 *
 * Kavea REGISTRA estos documentos, no los genera. Sin PDF compuesto, sin
 * impuestos y sin inventario. Por eso no hay líneas de detalle: sin generación
 * ni cálculo, solo servirían para volver a sumar a mano un total que ya viene
 * dado.
 */

const TIPOS = [
  { v: 'presupuesto', n: 'Presupuesto' },
  { v: 'pedido', n: 'Pedido' },
  { v: 'factura', n: 'Factura' },
]

const ESTADOS: Record<string, string> = {
  borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado',
  rechazado: 'Rechazado', pagado: 'Pagado', anulado: 'Anulado',
}

// Los estados que tienen sentido según el tipo. Ofrecer "pagado" en un
// presupuesto invita a registrar algo que no significa nada.
const ESTADOS_POR_TIPO: Record<string, string[]> = {
  presupuesto: ['borrador', 'enviado', 'aceptado', 'rechazado', 'anulado'],
  pedido: ['borrador', 'enviado', 'aceptado', 'pagado', 'anulado'],
  factura: ['borrador', 'enviado', 'pagado', 'anulado'],
}

export function Compras({
  contactoId, tarjetaId, documentos, resumen,
}: {
  contactoId: string | null
  tarjetaId: string
  documentos: Documento[]
  resumen: ResumenComercial[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [nuevo, setNuevo] = useState(false)

  if (!contactoId) {
    return <p className="ficha__vacia">Esta tarjeta no tiene una persona asociada.</p>
  }

  async function borrar(d: Documento) {
    if (!confirm(`Borrar "${d.concepto}".`)) return
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc('borrar_documento', { p_documento: d.id })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  async function cambiarEstado(d: Documento, estado: string) {
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc('guardar_documento', {
      p_documento: d.id, p_contacto: contactoId, p_tipo: d.tipo, p_concepto: d.concepto,
      p_total: d.total, p_moneda: d.moneda, p_estado: estado, p_numero: d.numero,
      p_emitido: d.emitido_en, p_vence: d.vence_en, p_tarjeta: d.tarjeta_id, p_archivo: d.archivo_id,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {/* Arriba y en tres números: es lo que hay que ver antes de escribir la
          respuesta, no después de leer una tabla de veinte filas. */}
      {resumen.length === 0 ? null : resumen.map((r) => (
        <section key={r.moneda} className="resumen">
          <div>
            <span className="resumen__n">{formatoValor(Number(r.comprado), r.moneda)}</span>
            <span className="resumen__e">comprado</span>
          </div>
          <div>
            <span className="resumen__n">{formatoValor(Number(r.pendiente), r.moneda)}</span>
            <span className="resumen__e">pendiente</span>
          </div>
          <div>
            <span
              className="resumen__n"
              style={{ color: Number(r.vencido) > 0 ? 'var(--k-escalada-fg)' : undefined }}
            >
              {formatoValor(Number(r.vencido), r.moneda)}
            </span>
            <span className="resumen__e">vencido</span>
          </div>
        </section>
      ))}

      <section className="ficha__bloque">
        <p className="ficha__titulo">Historial de la persona ({documentos.length})</p>

        {documentos.length === 0 ? (
          <p className="ficha__vacia">
            Sin presupuestos ni compras registradas. Lo que se apunte aquí acompaña a la
            persona en todos sus asuntos, no solo en este.
          </p>
        ) : (
          documentos.map((d) => {
            const vencido = d.vence_en != null
              && ['enviado', 'aceptado'].includes(d.estado)
              && d.vence_en < new Date().toISOString().slice(0, 10)
            return (
              <div key={d.id} className="documento">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{d.concepto}</span>
                  <span style={{ fontSize: 13 }}>{formatoValor(Number(d.total), d.moneda)}</span>
                  <button
                    type="button"
                    onClick={() => borrar(d)}
                    disabled={ocupado}
                    aria-label={`Borrar ${d.concepto}`}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--k-text-2)', font: 'inherit' }}
                  >
                    ×
                  </button>
                </div>
                <div className="ficha__ayuda">
                  {TIPOS.find((t) => t.v === d.tipo)?.n}
                  {d.numero ? ` ${d.numero}` : ''} · {d.emitido_en}
                  {d.vence_en ? ` · vence ${d.vence_en}` : ''}
                  {vencido ? <span style={{ color: 'var(--k-escalada-fg)' }}> · VENCIDO</span> : null}
                </div>
                <select
                  className="campo"
                  style={{ marginTop: 6, fontSize: 13, padding: '4px 8px' }}
                  value={d.estado}
                  disabled={ocupado}
                  aria-label={`Estado de ${d.concepto}`}
                  onChange={(e) => cambiarEstado(d, e.target.value)}
                >
                  {(ESTADOS_POR_TIPO[d.tipo] ?? Object.keys(ESTADOS)).map((s) => (
                    <option key={s} value={s}>{ESTADOS[s]}</option>
                  ))}
                </select>
              </div>
            )
          })
        )}

        {nuevo ? (
          <Nuevo
            contactoId={contactoId}
            tarjetaId={tarjetaId}
            ocupado={ocupado}
            setOcupado={setOcupado}
            setError={setError}
            alTerminar={() => { setNuevo(false); router.refresh() }}
            alCancelar={() => setNuevo(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNuevo(true)}
            style={{
              border: 0, background: 'transparent', color: 'var(--k-accent)',
              cursor: 'pointer', font: 'inherit', fontSize: 13, padding: 0, textAlign: 'left',
            }}
          >
            + Registrar presupuesto o compra
          </button>
        )}
      </section>
    </div>
  )
}

function Nuevo({
  contactoId, tarjetaId, ocupado, setOcupado, setError, alTerminar, alCancelar,
}: {
  contactoId: string
  tarjetaId: string
  ocupado: boolean
  setOcupado: (v: boolean) => void
  setError: (v: string | null) => void
  alTerminar: () => void
  alCancelar: () => void
}) {
  const [tipo, setTipo] = useState('presupuesto')
  const [concepto, setConcepto] = useState('')
  const [total, setTotal] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [estado, setEstado] = useState('enviado')
  const [numero, setNumero] = useState('')
  const [vence, setVence] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc('guardar_documento', {
      p_contacto: contactoId,
      p_tipo: tipo,
      p_concepto: concepto,
      p_total: Number(total),
      p_moneda: moneda,
      p_estado: estado,
      p_numero: numero || null,
      p_emitido: null,
      p_vence: vence || null,
      p_tarjeta: tarjetaId,
      p_archivo: null,
      p_documento: null,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    alTerminar()
  }

  const estados = ESTADOS_POR_TIPO[tipo] ?? []

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--k-border)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          className="campo"
          style={{ width: 'auto' }}
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value)
            // Al cambiar de tipo, el estado puede dejar de tener sentido: un
            // presupuesto no se "paga". Se cae al segundo de la lista, que es
            // 'enviado' en los tres tipos y el caso normal al registrar algo.
            const permitidos = ESTADOS_POR_TIPO[e.target.value] ?? []
            if (!permitidos.includes(estado)) setEstado(permitidos[1] ?? permitidos[0] ?? 'borrador')
          }}
          aria-label="Tipo"
        >
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.n}</option>)}
        </select>
        <input
          className="campo"
          style={{ flex: 1 }}
          placeholder="Número, opcional"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          aria-label="Número"
        />
      </div>

      <input
        className="campo"
        placeholder="Concepto"
        value={concepto}
        onChange={(e) => setConcepto(e.target.value)}
        required
        maxLength={300}
        aria-label="Concepto"
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="campo"
          style={{ flex: 1 }}
          type="number"
          min="0"
          step="0.01"
          placeholder="Importe"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          required
          aria-label="Importe"
        />
        <input
          className="campo"
          style={{ width: 78 }}
          value={moneda}
          onChange={(e) => setMoneda(e.target.value.toUpperCase())}
          pattern="[A-Za-z]{3}"
          maxLength={3}
          aria-label="Moneda"
        />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <select
          className="campo"
          style={{ flex: 1 }}
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Estado"
        >
          {estados.map((s) => <option key={s} value={s}>{ESTADOS[s]}</option>)}
        </select>
        <input
          className="campo"
          style={{ flex: 1 }}
          type="date"
          value={vence}
          onChange={(e) => setVence(e.target.value)}
          aria-label="Vence"
          title="Sin fecha de vencimiento hay un importe pendiente, pero no una deuda que reclamar"
        />
      </div>
      <span className="ficha__ayuda">
        La fecha de vencimiento es lo que convierte un pendiente en un vencido.
      </span>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="submit" disabled={ocupado} style={{ padding: '6px 14px', fontSize: 13 }}>
          {ocupado ? 'Guardando' : 'Registrar'}
        </button>
        <button
          type="button"
          onClick={alCancelar}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)' }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
