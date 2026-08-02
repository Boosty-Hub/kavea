import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { listarPlantillas, variablesDe } from '@/lib/plantillas'
import { puedeHacer } from '@/lib/equipo'
import { EditorPlantillas } from './editor'

export const dynamic = 'force-dynamic'

export default async function PaginaPlantillas() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const [plantillas, variables, puedeConfigurar] = await Promise.all([
    listarPlantillas(),
    variablesDe(org.id),
    puedeHacer(org.id, 'configurar'),
  ])

  return (
    <main className="pagina" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
        <Link href="/bandeja" style={{ color: 'var(--k-text-2)' }}>← Bandeja</Link>
        <Link href="/ajustes/equipo" style={{ color: 'var(--k-text-2)' }}>Equipo</Link>
        <Link href="/ajustes/campos" style={{ color: 'var(--k-text-2)' }}>Campos</Link>
        <Link href="/ajustes/embudos" style={{ color: 'var(--k-text-2)' }}>Embudos</Link>
      </div>

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Plantillas</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
        Mensajes que se repiten, con huecos que se rellenan solos a partir de la ficha. Hay
        dos clases y no se parecen en nada.
      </p>

      <div className="tarjeta" style={{ marginTop: 16, display: 'grid', gap: 12, maxWidth: 620 }}>
        <div>
          <strong style={{ fontWeight: 500 }}>Internas</strong>
          <div style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
            Respuestas rápidas que escribe el equipo. Variables con nombre, se editan cuando
            quieras y no las aprueba nadie.
          </div>
        </div>
        <div>
          <strong style={{ fontWeight: 500 }}>De WhatsApp</strong>
          <div style={{ fontSize: 13, color: 'var(--k-text-2)' }}>
            Las aprueba Meta antes de poder usarse, y llevan huecos numerados —
            <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>— porque así funciona su API.
            Cambiar el texto de una ya aprobada la devuelve a borrador: Meta revisó otra cosa.
            <strong> El envío a WhatsApp todavía no existe</strong>; aquí se lleva el registro.
          </div>
        </div>
      </div>

      <EditorPlantillas
        organizacionId={org.id}
        plantillas={plantillas}
        variables={variables}
        puedeConfigurar={puedeConfigurar}
      />
    </main>
  )
}
