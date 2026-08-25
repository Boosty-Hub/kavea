import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { listarPlantillas, variablesDe } from '@/lib/plantillas'
import { puedeHacer } from '@/lib/equipo'
import { EditorPlantillas } from './editor'
import { PlantillasDeUtilidad } from './utilidad'
import { PlantillasDeWhatsApp } from './whatsapp'
import { PestanasPlantillas } from './pestanas'

import { NavAjustes } from '../nav'

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
      <NavAjustes actual="plantillas" />

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Plantillas</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 640 }}>
        Mensajes que se repiten. Hay tres clases y no se parecen en nada: cambian quién las
        aprueba, dónde viven y para qué sirven. Cada una en su pestaña.
      </p>

      <PestanasPlantillas
        internas={
          <EditorPlantillas
            organizacionId={org.id}
            plantillas={plantillas}
            variables={variables}
            puedeConfigurar={puedeConfigurar}
          />
        }
        whatsapp={
          <PlantillasDeWhatsApp
            puedeConfigurar={puedeConfigurar}
            organizacionId={org.id}
            variables={variables}
          />
        }
        messenger={<PlantillasDeUtilidad puedeConfigurar={puedeConfigurar} variables={variables} />}
      />
    </main>
  )
}
