import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { listarEmbudos, etapasDe } from '@/lib/embudo'
import { EditorEmbudos } from './editor'

import { NavAjustes } from '../nav'

export const dynamic = 'force-dynamic'

export default async function Embudos() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const embudos = await listarEmbudos()
  const conEtapas = await Promise.all(
    embudos.map(async (e) => ({ ...e, etapas: await etapasDe(e.id) })),
  )

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <NavAjustes actual="embudos" />

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Embudos</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 580 }}>
        Las etapas por las que pasa un asunto. Se pueden tener varios: la venta y el cobro son
        dos procesos distintos con etapas distintas. El embudo predeterminado es donde caen las
        conversaciones nuevas.
      </p>
      <p style={{ color: 'var(--k-text-2)', fontSize: 13, maxWidth: 580 }}>
        La etapa es el eje comercial y no toca el estado de la bandeja. Una tarjeta puede estar
        en <em>Propuesta enviada</em> y a la vez <em>esperando</em>: son dos hechos distintos y
        los dos son ciertos.
      </p>

      <EditorEmbudos organizacionId={org.id} embudos={conEtapas} />
    </main>
  )
}
