import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { conexionesDe } from '@/lib/conexiones'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { Canales } from './panel'

import { NavAjustes } from '../nav'

export const dynamic = 'force-dynamic'

export default async function PaginaCanales({
  searchParams,
}: {
  searchParams: Promise<{ conexion?: string; motivo?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  const conexiones = await conexionesDe(org.id)
  const { conexion, motivo } = await searchParams

  // Quien no puede conectar no ve el botón. No es solo estética: la ruta
  // devuelve 403 igualmente, y un botón que existe para fallar enseña a la
  // gente que la aplicación está rota.
  const supabase = await crearClienteServidor()
  const { data: puedeConectar } = await supabase.rpc('puede', {
    org: org.id,
    accion: 'conectar',
  })

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

      {conexion ? (
        <p
          className={conexion === 'ok' ? 'exito' : 'error'}
          role="status"
          style={{ marginBottom: 16 }}
        >
          {conexion === 'ok'
            ? 'Canal conectado. Ya está recibiendo mensajes.'
            : /* El motivo lo compone el callback y lleva el paso exacto que
                 falló: «no se pudo conectar» a secas no le sirve a nadie para
                 saber si el problema es el permiso, la Página o los webhooks. */
              (motivo ?? 'No se pudo completar la conexión.')}
        </p>
      ) : null}

      {puedeConectar === true ? (
        <p style={{ margin: '0 0 24px' }}>
          <a className="boton" href="/api/meta/oauth/start?canal=mensajeria">
            Conectar una Página de Facebook
          </a>
          <span
            style={{
              display: 'block',
              marginTop: 8,
              fontSize: 13,
              color: 'var(--k-text-2)',
            }}
          >
            Se abre Meta para que autorices. Si la Página tiene Instagram vinculado, entran
            los dos canales de una vez.
          </span>
        </p>
      ) : null}

      <Canales conexiones={conexiones} huso={org.zona_horaria ?? HUSO_POR_DEFECTO} />
    </main>
  )
}
