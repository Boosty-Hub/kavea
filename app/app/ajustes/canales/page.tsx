import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { conexionesDe } from '@/lib/conexiones'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { Canales } from './panel'

import { NavAjustes } from '../nav'

export const dynamic = 'force-dynamic'

export default async function PaginaCanales() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const conexiones = await conexionesDe(org.id)

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <NavAjustes actual="canales" />

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Canales</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
        Cada canal se comprueba por partes, no de golpe. Un canal que dice «conectado» y del
        que no llega un solo mensaje es el caso más común y el más difícil de diagnosticar:
        esta pantalla existe para decir cuál de las siete comprobaciones falla, no si falla.
      </p>

      <Canales conexiones={conexiones} huso={org.zona_horaria ?? HUSO_POR_DEFECTO} />
    </main>
  )
}
