import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { conexionesDe, embudosDe } from '@/lib/conexiones'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { Canales } from './panel'
import { ConectarUnCanal } from './conectar'
import { SoltarCuenta } from './soltar'

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

  const [conexiones, embudos] = await Promise.all([conexionesDe(org.id), embudosDe(org.id)])
  // Cuántas se apagarían al soltar la cuenta, y cuántas NO. Solo cae lo que
  // produjo la autorización de Facebook —las que tienen `page_id`—; WhatsApp
  // entra por el portafolio y se queda. Los dos números van en la confirmación:
  // la primera versión contaba todas y el botón se llevó un WhatsApp vivo.
  const vivas = conexiones.filter((c) => c.estado !== 'disconnected' && c.page_id).length
  const intactas = conexiones.filter((c) => c.estado !== 'disconnected' && !c.page_id).length
  const { conexion, motivo } = await searchParams

  // Quien no puede conectar no ve el botón. No es solo estética: la ruta
  // devuelve 403 igualmente, y un botón que existe para fallar enseña a la
  // gente que la aplicación está rota.
  const supabase = await crearClienteServidor()
  const { data: puedeConectar } = await supabase.rpc('puede', {
    org: org.id,
    accion: 'conectar',
  })

  // Si ya autorizó, el botón principal deja de ser «autoriza» y pasa a ser
  // «elige»: repetir el diálogo de Meta cuando ya hay permiso concedido es
  // hacerle pasar cinco pantallas para nada.
  const { data: autorizacion } = await supabase.rpc('hay_autorizacion_meta', { p_org: org.id })
  const auth = (Array.isArray(autorizacion) ? autorizacion[0] : autorizacion) as
    | { invalida_desde: string | null; ultimo_motivo: string | null }
    | undefined
  const yaAutorizo = Boolean(auth)
  // Una autorización muerta no se descubre sola: solo se usa al conectar algo
  // nuevo, o sea casi nunca. El cron diario la comprueba y aquí se dice, porque
  // enterarse el día que hace falta es enterarse tarde.
  const autorizacionMuerta = Boolean(auth?.invalida_desde)

  return (
    <main className="pagina" style={{ maxWidth: 780 }}>
      <NavAjustes actual="canales" />

      <p className="label" style={{ marginTop: 16 }}>{org.nombre}</p>
      <h1 style={{ marginBlock: '8px 12px' }}>Canales</h1>
      {/* Este párrafo explica el DIAGNÓSTICO, y solo tiene sentido cuando hay
          algo que diagnosticar. En un espacio sin canales era lo primero que se
          leía —«un canal que dice conectado y del que no llega un mensaje»— y le
          hablaba de un problema que no puede tener todavía. */}
      {conexiones.length > 0 ? (
        <p style={{ color: 'var(--k-text-2)', marginTop: 0, maxWidth: 620 }}>
          Cada canal se comprueba por partes, no de golpe. Un canal que dice «conectado» y del
          que no llega un solo mensaje es el caso más común y el más difícil de diagnosticar:
          esta pantalla existe para decir cuál de las siete comprobaciones falla, no si falla.
        </p>
      ) : null}

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

      {autorizacionMuerta ? (
        <p className="error" role="alert" style={{ marginBottom: 16 }}>
          Tu autorización con Facebook dejó de valer
          {auth?.ultimo_motivo ? ` (${auth.ultimo_motivo})` : ''}. Los canales ya conectados siguen
          funcionando, pero no se pueden añadir nuevos hasta volver a autorizar.
        </p>
      ) : null}

      {/* Las tarjetas y los pasos salen SIEMPRE, también para quien no puede
          conectar: dentro se le dice que es cosa del propietario. Antes el
          bloque entero desaparecía y un `agente` veía una pantalla de canales
          que no explicaba por qué no había ninguno. */}
      <ConectarUnCanal
        puedeConectar={puedeConectar === true}
        yaAutorizo={yaAutorizo}
        autorizacionMuerta={autorizacionMuerta}
        hayConexiones={conexiones.some((c) => c.archivada_en === null)}
      />

      {/* La puerta de salida, en el mismo sitio que la de entrada. Antes solo se
          podía soltar un canal: la autorización de la que cuelgan todos no tenía
          botón, y quedarse vinculado sin querer no es una opción que el producto
          deba ofrecer.

          Va FUERA de la tarjeta de conectar y en su propio `div`: dentro lleva un
          `div`, y un `div` dentro de un `p` es HTML inválido —el navegador cierra
          el párrafo antes de tiempo, el DOM deja de coincidir con lo que React
          pintó y salta el error de hidratación 418. Compilaba y se veía bien; lo
          dijo la consola. */}
      {puedeConectar === true && yaAutorizo && !autorizacionMuerta ? (
        <div style={{ margin: '0 0 24px' }}>
          <SoltarCuenta conexionesVivas={vivas} intactas={intactas} />
        </div>
      ) : null}

      <Canales
        conexiones={conexiones}
        huso={org.zona_horaria ?? HUSO_POR_DEFECTO}
        embudos={embudos}
        puedeConectar={puedeConectar === true}
      />
    </main>
  )
}
