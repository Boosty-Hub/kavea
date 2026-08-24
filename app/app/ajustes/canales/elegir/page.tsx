import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { NavAjustes } from '../../nav'
import { Elegir } from './panel'

export const dynamic = 'force-dynamic'

/**
 * Adonde vuelve el cliente después de autorizar en Meta.
 *
 * Separada de `/ajustes/canales` a propósito: aquella pantalla responde «¿esto
 * funciona?» y esta responde «¿qué quiero que exista?». Mezclarlas convertiría
 * la lista de diagnóstico en un formulario, y el diagnóstico es lo que se mira
 * cuando algo va mal, no cuando se está dando de alta.
 */
export default async function PaginaElegir() {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const supabase = await crearClienteServidor()
  const { data: puede } = await supabase.rpc('puede', { org: org.id, accion: 'conectar' })
  // Un 404 y no un 403: el resto de la aplicación tampoco confirma qué existe a
  // quien no puede verlo.
  if (puede !== true) notFound()

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <NavAjustes actual="canales" />

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Qué conectar</h1>
      <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
        Autorizaste tu cuenta de Facebook una vez. Estas son las Páginas que administra: activa
        las que quieras atender desde Kavea. Si una tiene Instagram vinculado, entran los dos
        canales juntos.
      </p>

      <Elegir />

      <p style={{ marginTop: 28, fontSize: 13 }}>
        <Link href="/ajustes/canales">← Volver a Canales</Link>
      </p>
    </main>
  )
}
