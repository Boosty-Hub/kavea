import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { listarCampos } from '@/lib/bandeja'
import { EditorCampos } from './editor'

export const dynamic = 'force-dynamic'

export default async function Campos() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const campos = await listarCampos()

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
        <Link href="/bandeja" style={{ color: 'var(--k-text-2)' }}>← Bandeja</Link>
        <Link href="/embudo" style={{ color: 'var(--k-text-2)' }}>Embudo</Link>
        <Link href="/ajustes/embudos" style={{ color: 'var(--k-text-2)' }}>Embudos</Link>
      </div>
      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Campos</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 560 }}>
        Lo que este negocio necesita guardar y que Kavea no sabe de antemano. Los campos del
        asunto viven en cada tarjeta; los de la persona la acompañan por todos sus canales y
        todos sus asuntos.
      </p>

      <EditorCampos organizacionId={org.id} campos={campos} />
    </main>
  )
}
