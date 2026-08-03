import Link from 'next/link'
import { fechaHora } from '@/lib/fechas'
import { salud, ingesta, type FilaSalud } from '@/lib/panel'
import { soloStaff } from './guardia'
import { NavAdmin } from './nav'

export const dynamic = 'force-dynamic'

/**
 * Qué cliente está roto ahora mismo.
 *
 * UNA PANTALLA PARA TODOS, no una por espacio. Con veinte clientes, veinte
 * pantallas de salud son cero pantallas de salud: nadie abre veinte pestañas
 * cada mañana.
 *
 * Ordenada por gravedad, que la calcula Postgres. Si el orden viviera aquí, la
 * siguiente pantalla que enseñe lo mismo lo ordenaría distinto y las dos
 * dirían que lo urgente es otra cosa.
 *
 * En UTC y dicho: este panel mira organizaciones de husos distintos, así que no
 * hay un «huso de la organización» que aplicar. Se elige uno y se nombra.
 */
export default async function Salud() {
  await soloStaff()
  const [filas, cola] = await Promise.all([salud(), ingesta()])

  const rotos = filas.filter((f) => f.gravedad >= 100)
  const atascada = cola.filter((c) => c.estado !== 'procesado')

  return (
    <main className="pagina">
      <NavAdmin actual="salud" />
      <p className="label">Panel interno</p>
      <h1>Salud</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        {rotos.length === 0
          ? 'Ningún espacio tiene algo que atender ahora mismo.'
          : `${rotos.length} ${rotos.length === 1 ? 'espacio necesita' : 'espacios necesitan'} atención.`}
        {' '}Cuentas y códigos, nunca contenido: para leer una conversación hace falta un acceso
        temporal con motivo declarado.
      </p>

      {/* La ingesta va aparte y arriba porque es GLOBAL: `webhook_events` se
          escribe antes de saber de quién es el evento. Si esto está atascado,
          todo lo de abajo es una foto vieja. */}
      {atascada.length > 0 ? (
        <div
          className="tarjeta"
          style={{ marginTop: 24, borderColor: 'var(--k-escalada-fg)' }}
        >
          <strong style={{ fontWeight: 500 }}>La ingesta no está limpia</strong>
          <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 6 }}>
            {atascada.map((c) => (
              <div key={c.estado}>
                {c.eventos} en <code>{c.estado}</code>
                {c.retraso_s != null ? ` · hasta ${Math.round(c.retraso_s)} s de retraso` : ''}
                {c.mas_viejo ? ` · el más viejo del ${fechaHora(c.mas_viejo, 'UTC')} UTC` : ''}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        {filas.length === 0 ? (
          <p className="muted">No hay espacios todavía.</p>
        ) : (
          filas.map((f) => <Espacio key={f.organization_id} f={f} />)
        )}
      </div>

      <p className="muted" style={{ marginTop: 32, fontSize: 13 }}>
        Las horas de esta pantalla van en UTC: hay espacios de husos distintos y no hay uno solo
        que aplicar.
      </p>
    </main>
  )
}

function Espacio({ f }: { f: FilaSalud }) {
  const problemas = motivos(f)
  const grave = f.gravedad >= 300

  return (
    <div
      className="tarjeta"
      style={{
        display: 'flex', gap: 16, alignItems: 'flex-start',
        borderColor: problemas.length === 0
          ? 'var(--k-border)'
          : grave ? 'var(--k-escalada-fg)' : 'var(--k-esperando-fg)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>
          {f.nombre}{' '}
          <span style={{ fontWeight: 400, color: 'var(--k-text-2)', fontSize: 13 }}>
            {f.slug}
          </span>
        </div>

        {problemas.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 4 }}>
            {f.conexiones === 0
              ? 'Sin canales conectados todavía.'
              : `${f.conexiones} ${f.conexiones === 1 ? 'canal' : 'canales'}, todo en orden.`}
          </div>
        ) : (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {problemas.map((p) => (
              <li key={p} style={{ color: grave ? 'var(--k-escalada-fg)' : 'var(--k-text-2)' }}>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ flex: 'none', textAlign: 'right', fontSize: 12, color: 'var(--k-text-2)' }}>
        {f.ultima_pasada
          ? <>comprobado<br />{fechaHora(f.ultima_pasada, 'UTC')}</>
          : 'sin comprobar'}
        <div style={{ marginTop: 6 }}>
          <Link href={`/admin/espacios#${f.slug}`} style={{ color: 'var(--k-accent)' }}>Ver espacio</Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Los motivos, escritos como acciones.
 *
 * «gravedad 400» no le dice nada a nadie a las nueve de la mañana. Cada línea
 * dice qué pasa y, cuando se sabe, qué hacer.
 */
function motivos(f: FilaSalud): string[] {
  const out: string[] = []
  if (f.con_bloqueo > 0) {
    out.push(`${f.con_bloqueo} ${f.con_bloqueo === 1 ? 'comprobación' : 'comprobaciones'} en rojo: el canal no puede funcionar.`)
  }
  if (f.peor_error === 190) {
    out.push('Token invalidado (error 190). Hay que reconectar la Página: no se arregla solo.')
  }
  if (f.nunca_llego_nada > 0) {
    out.push(
      `${f.nunca_llego_nada} ${f.nunca_llego_nada === 1 ? 'canal conectado' : 'canales conectados'} `
      + 'y sin un solo mensaje entrante. Suele ser el permiso de mensajes apagado en la Página.',
    )
  }
  if (f.envios_atascados > 0) {
    out.push(
      `${f.envios_atascados} ${f.envios_atascados === 1 ? 'envío atascado' : 'envíos atascados'}`
      + `${f.peor_error && f.peor_error !== 190 ? ` (último código ${f.peor_error})` : ''}. `
      + 'El cliente cree que respondió.',
    )
  }
  if (f.espera_limite && f.espera_limite > 0) {
    out.push(`Meta pide esperar ${f.espera_limite} min por límite de uso.`)
  }
  if (f.sin_verificar > 0) {
    out.push(`${f.sin_verificar} ${f.sin_verificar === 1 ? 'conexión' : 'conexiones'} sin comprobar nunca.`)
  }
  if (f.con_aviso > 0) {
    out.push(`${f.con_aviso} ${f.con_aviso === 1 ? 'aviso' : 'avisos'} que no bloquean.`)
  }
  return out
}
