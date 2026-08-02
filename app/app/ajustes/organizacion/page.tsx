import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { puedeHacer } from '@/lib/equipo'
import { husosDisponibles } from '@/lib/conexiones'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { Datos } from './editor'

import { NavAjustes } from '../nav'

export const dynamic = 'force-dynamic'

export default async function PaginaOrganizacion() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const [husos, puedeConfigurar] = await Promise.all([
    husosDisponibles(),
    puedeHacer(org.id, 'configurar'),
  ])

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <NavAjustes actual="organizacion" />

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>La organización</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
        El nombre que se ve en la aplicación y la hora en la que trabaja este equipo. La
        dirección web (<code>{org.slug}</code>) no se cambia desde aquí: los enlaces que ya
        estén repartidos dejarían de funcionar.
      </p>

      <Datos
        organizacionId={org.id}
        nombre={org.nombre}
        huso={org.zona_horaria ?? HUSO_POR_DEFECTO}
        husos={husos}
        puedeConfigurar={puedeConfigurar}
      />
    </main>
  )
}
