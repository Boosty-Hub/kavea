import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { contactosDe, duplicadosDe } from '@/lib/registro'
import { etiquetaCanal, colorCanal, haceCuanto, formatoValor } from '@/lib/ventana'
import { Duplicados } from './duplicados'

export const dynamic = 'force-dynamic'

export default async function Contactos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  // El huso de la organización. Ver `lib/fechas.ts`.
  const huso = org.zona_horaria ?? HUSO_POR_DEFECTO

  const sp = await searchParams
  const pagina = Number(sp.p ?? 0)

  const [contactos, duplicados] = await Promise.all([
    contactosDe(org.id, sp.q, pagina),
    duplicadosDe(org.id),
  ])

  return (
    <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="barra">
        <p className="label" style={{ margin: 0 }}>{org.nombre}</p>
        <nav className="barra__nav" aria-label="Secciones">
          <Link href="/bandeja">Bandeja</Link>
          <Link href="/embudo">Embudo</Link>
          <Link href="/agenda">Agenda</Link>
          <Link href="/contactos" aria-current>Contactos</Link>
          <Link href="/actividad">Actividad</Link>
        </nav>
      </div>

      <div className="pagina" style={{ maxWidth: 940, paddingTop: 24, width: '100%' }}>
        <h1 style={{ marginBottom: 8 }}>Contactos</h1>
        <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 640 }}>
          Las personas, no las conversaciones. Una persona puede escribir por varios canales y
          tener varios asuntos a lo largo del tiempo: aquí se ve entera.
        </p>

        {duplicados.length > 0 ? <Duplicados parejas={duplicados} /> : null}

        <form style={{ marginTop: 20, maxWidth: 420 }}>
          <input
            className="campo" type="search" name="q" defaultValue={sp.q ?? ''}
            placeholder="Buscar por nombre, usuario o identificador" aria-label="Buscar contacto"
          />
        </form>

        <div className="tarjeta" style={{ padding: 0, marginTop: 16, overflow: 'hidden' }}>
          {contactos.length === 0 ? (
            <p style={{ padding: 24, margin: 0, color: 'var(--k-text-2)', fontSize: 14 }}>
              {sp.q ? `Nadie con «${sp.q}».` : 'Todavía no hay contactos.'}
            </p>
          ) : (
            contactos.map((c) => (
              <div key={c.id} className="contacto">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {c.nombre ?? c.username ?? 'Contacto sin nombre'}
                    {c.fusionado ? (
                      <span
                        style={{ fontSize: 12, color: 'var(--k-text-2)', fontWeight: 400 }}
                        title="Se unió con otra persona. Su historial vive en la ficha de esa."
                      > · unido</span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                    {c.canales.map((k) => (
                      <span key={k} className="pildora"
                        style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}>
                        <span className="pildora__punto" style={{ background: colorCanal(k) }} aria-hidden="true" />
                        {etiquetaCanal(k)}
                      </span>
                    ))}
                    <span className="ficha__ayuda">
                      {c.tarjetas} {c.tarjetas === 1 ? 'asunto' : 'asuntos'}
                      {c.ultimo_mensaje ? ` · ${haceCuanto(c.ultimo_mensaje, huso)}` : ''}
                    </span>
                  </div>
                </div>

                {Number(c.comprado) > 0 ? (
                  <span style={{ fontSize: 14, flex: 'none' }}>
                    {formatoValor(Number(c.comprado), c.moneda ?? 'USD')}
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>

        {contactos.length === 60 ? (
          <Link className="btn" style={{ marginTop: 16, textDecoration: 'none' }}
            href={`/contactos?p=${pagina + 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}>
            Ver más
          </Link>
        ) : null}
      </div>
    </main>
  )
}
