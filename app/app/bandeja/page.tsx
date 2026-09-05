import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { organizacionActual, superficieActual, usuarioActual } from '@/lib/organizacion'
import { HUSO_POR_DEFECTO } from '@/lib/fechas'
import { listarTarjetas, contarPorEstado, type FilaBandeja } from '@/lib/bandeja'
import { LogoCanal } from '@/lib/logos-canal'
import { ESTADOS, etiquetaCanal, colorCanal, haceCuanto, calcularVentana, type Estado } from '@/lib/ventana'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { hayCanalVivo } from '@/lib/conexiones'
import { Bienvenida } from './bienvenida'
import { Refrescador } from './refrescador'
import { AvisosDelSistema } from './avisos-del-sistema'
import { Buscador } from './buscador'
import { PestanasVista } from './pestanas-vista'
import { ListaComentarios } from './comentario/lista'
import { Notificaciones } from '../notificaciones'
import { misNotificaciones, sinLeer } from '@/lib/agenda'

export const dynamic = 'force-dynamic'

const FILTROS: Array<{ clave: string; etiqueta: string }> = [
  { clave: 'todas', etiqueta: 'Abiertas' },
  { clave: 'nueva', etiqueta: 'Nuevas' },
  { clave: 'en_curso', etiqueta: 'En curso' },
  { clave: 'esperando', etiqueta: 'Esperando' },
  { clave: 'cerrada', etiqueta: 'Cerradas' },
]

export default async function Bandeja({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; canal?: string; vista?: string }>
}) {
  if ((await superficieActual()) !== 'app') notFound()
  if (!(await usuarioActual())) redirect('/entrar')

  const org = await organizacionActual()
  if (!org) notFound()

  // El huso es el de la ORGANIZACIÓN, y baja por props a todo lo que pinte una
  // hora. Ni el del servidor —que en Netlify es UTC— ni el del navegador: eran
  // dos relojes distintos en la misma pantalla. Ver `lib/fechas.ts`.
  const huso = org.zona_horaria ?? HUSO_POR_DEFECTO

  const sp = await searchParams
  const vista = sp.vista === 'comentarios' ? 'comentarios' : 'conversaciones'
  const estado = sp.estado ?? 'todas'

  if (vista === 'comentarios') {
    const [avisos, pendientes] = await Promise.all([misNotificaciones(), sinLeer()])
    return (
      <div className="bandeja">
        <ListaComentarios org={org} huso={huso} avisos={avisos} pendientes={pendientes} estado={sp.estado} />

        <section className="bandeja__hilo">
          <div className="vacio">
            <h2>Elige un comentario</h2>
            <p>
              Son públicos: lo que respondas aquí lo lee cualquiera que pase por la
              publicación. No hay ventana de 24 h porque no son mensajes privados.
            </p>
          </div>
        </section>
      </div>
    )
  }

  const [tarjetas, conteos, avisos, pendientes] = await Promise.all([
    listarTarjetas({ estado, canal: sp.canal }),
    contarPorEstado(),
    misNotificaciones(),
    sinLeer(),
  ])

  // UN ESPACIO RECIÉN CREADO no tiene ni una tarjeta, ni abierta ni cerrada. Y
  // solo entonces se preguntan las dos cosas que la bienvenida necesita:
  // preguntarlas en cada carga de la bandeja serían dos consultas de más para
  // siempre, y en la pantalla que más se recarga de Kavea.
  //
  // La comprobación NO es `tarjetas.length === 0`: con un filtro puesto eso
  // también es cero en un espacio lleno, y entonces la bienvenida saldría a
  // quien lleva meses trabajando.
  const esNueva = (conteos.todas ?? 0) === 0 && (conteos.cerrada ?? 0) === 0
  let bienvenida: { hayCanal: boolean; puedeConectar: boolean } | null = null
  if (esNueva) {
    const supabase = await crearClienteServidor()
    const [hayCanal, { data: puede }] = await Promise.all([
      hayCanalVivo(org.id),
      supabase.rpc('puede', { org: org.id, accion: 'conectar' }),
    ])
    bienvenida = { hayCanal, puedeConectar: puede === true }
  }

  return (
    <div className="bandeja">
      {/* `Refrescador` devuelve null, así que no ocupa celda del grid. El aviso
          del sistema SÍ pintaba una, y ahí estaba el fallo: ver más abajo. */}
      <Refrescador organizationId={org.id} />

      <section className="bandeja__lista" aria-label="Conversaciones">
        <header className="bandeja__cabecera">
          <Cabeza org={org} huso={huso} avisos={avisos} pendientes={pendientes} />
          <h1 style={{ fontSize: 22, marginTop: 4 }}>Bandeja</h1>

          <PestanasVista activa="conversaciones" />

          {/* EL AVISO DEL SISTEMA VA AQUÍ DENTRO, y no como hijo de `.bandeja`,
              que es donde estaba.
              `.bandeja` es un grid de DOS columnas y este componente pinta un
              `<p>` —o un `<button>`— cuando el permiso de notificaciones está
              `denied` o `default`. Siendo hijo directo del grid, ese aviso se
              comía la primera celda: la lista se iba a la segunda columna y el
              hilo caía a una segunda fila. O sea que la bandeja aparecía con las
              columnas invertidas a TODO el que no hubiera concedido los avisos,
              que es casi todo el mundo. No se veía porque en el navegador de
              quien lo escribió el permiso estaba `granted` y el componente
              devuelve null.
              Lo cazó una captura de Playwright del 5-sep, que corre con los
              avisos bloqueados por defecto.
              Sigue viviendo en la bandeja a propósito —es la pantalla que se
              deja abierta y pedir el permiso desde otra sería fuera de
              contexto—, solo que ahora dentro de la columna que le toca. */}
          <AvisosDelSistema organizationId={org.id} />

          <Buscador huso={huso} />

          <nav className="filtros" aria-label="Filtrar por estado">
            {FILTROS.map((f) => (
              <Link
                key={f.clave}
                href={`/bandeja?estado=${f.clave}`}
                className="filtro"
                aria-current={estado === f.clave}
              >
                {f.etiqueta}
                {conteos[f.clave] ? <span className="filtro__n">{conteos[f.clave]}</span> : null}
              </Link>
            ))}
          </nav>
        </header>

        <div className="lista">
          {tarjetas.length === 0 ? (
            bienvenida ? (
              <Bienvenida
                nombre={org.nombre}
                hayCanal={bienvenida.hayCanal}
                puedeConectar={bienvenida.puedeConectar}
              />
            ) : (
              <EstadoVacio estado={estado} />
            )
          ) : (
            tarjetas.map((t) => <Fila key={t.id} t={t} huso={huso} />)
          )}
        </div>
      </section>

      <section className="bandeja__hilo">
        <div className="vacio">
          <h2>Elige una conversación</h2>
          <p>Los mensajes, lo que ocurre en Meta y lo que hace el equipo se ven en un solo hilo.</p>
        </div>
      </section>
    </div>
  )
}

function Cabeza({
  org, huso, avisos, pendientes,
}: {
  org: { id: string; nombre: string }
  huso: string
  avisos: Awaited<ReturnType<typeof misNotificaciones>>
  pendientes: number
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <p className="label">{org.nombre}</p>
      <span style={{ fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Link href="/embudo" style={{ color: 'var(--k-text-2)' }}>Embudo</Link>
        <Link href="/agenda" style={{ color: 'var(--k-text-2)' }}>Agenda</Link>
        {/* A la organización, no a Campos: es la primera de las seis y la
            que hace de portada. Entrar en Ajustes y aterrizar en un
            formulario de campos personalizados no dice dónde estás. */}
        <Link href="/ajustes/organizacion" style={{ color: 'var(--k-text-2)' }}>Ajustes</Link>
        <Notificaciones iniciales={avisos} sinLeerInicial={pendientes} organizacionId={org.id} huso={huso} />
      </span>
    </div>
  )
}

function Fila({ t, huso }: { t: FilaBandeja; huso: string }) {
  const e = ESTADOS[t.estado as Estado] ?? ESTADOS.nueva
  const nombre = t.titulo ?? t.contacts?.nombre ?? t.contacts?.username ?? 'Contacto sin nombre'
  const canales = t.conversations ?? []

  // La ventana de la tarjeta es la MÁS HOLGADA de sus canales: si por alguno se
  // puede responder, el asunto no está bloqueado. Avisar de "fuera de ventana"
  // teniendo Messenger abierto haría que el operador no lo intentara.
  const ventanas = canales.map((c) => calcularVentana(c.last_incoming_at))
  const alguna = ventanas.find((v) => v.clase === 'abierta')
  const peor = ventanas.find((v) => v.clase === 'cerrada')

  return (
    <Link href={`/bandeja/${t.id}`} className="fila">
      <div className="fila__alto">
        <span className="fila__nombre">{nombre}</span>
        <span className="fila__cuando">{haceCuanto(t.last_message_at, huso)}</span>
      </div>

      <p className="fila__preview">
        {t.preview_emisor && t.preview_emisor !== 'contacto' ? (
          <span style={{ color: 'var(--k-text-2)' }}>
            {t.preview_emisor === 'agente' ? 'Agente: ' : 'Tú: '}
          </span>
        ) : null}
        {t.preview_texto ?? 'Sin mensajes'}
      </p>

      <div className="fila__pie">
        {/* El color nunca comunica solo: cada píldora lleva su etiqueta de texto.
            Hay gente daltónica en cualquier base de usuarios. */}
        <span className="pildora" style={{ background: e.bg, color: e.fg }}>
          <span className="pildora__punto" style={{ background: e.punto }} aria-hidden="true" />
          {e.etiqueta}
        </span>

        {/* La clave es el id de la conversación y no el canal: desde la 0082 una
            tarjeta puede tener dos de WhatsApp, y `key={c.canal}` daba dos
            claves `whatsapp` iguales. Lo cazó una pasada de Playwright, no el
            compilador.

            Y cuando se repite el canal se añade el nombre concreto: dos
            píldoras «WhatsApp» seguidas no dicen nada sobre por cuál de los
            dos números llegó cada hilo. */}
        {canales.map((c) => {
          const repetido = canales.filter((o) => o.canal === c.canal).length > 1
          const nombre = c.channels?.nombre
          // El numero ENTERO no cabe: con tres canales la ultima pildora se
          // salia de la columna. Bastan los cuatro ultimos digitos para
          // distinguir dos numeros, y el completo se queda en el `title`.
          const cola = nombre?.replace(/\D/g, '').slice(-4)
          return (
            <span
              key={c.id}
              className="pildora"
              style={{ background: 'var(--k-surface-2)', color: 'var(--k-text-2)' }}
              title={nombre ?? etiquetaCanal(c.canal)}
            >
              {/* LA MARCA DE VERDAD, la misma que Canales y Contenido, y en el
                  color de su canal: el logo hereda `currentColor`, así que basta
                  con teñir el envoltorio. Antes había un punto de color, y el
                  color solo distingue si ya sabes qué color es cada canal. */}
              <span
                style={{ color: colorCanal(c.canal), display: 'inline-flex', flex: 'none' }}
              >
                <LogoCanal canal={c.canal} size={15} />
              </span>
              {repetido && cola ? `${etiquetaCanal(c.canal)} ·${cola}` : etiquetaCanal(c.canal)}
            </span>
          )
        })}

        {!alguna && peor ? (
          <span
            className="pildora"
            style={{ background: 'var(--k-escalada-bg)', color: 'var(--k-escalada-fg)' }}
            title={peor.detalle}
          >
            {peor.etiqueta}
          </span>
        ) : null}

        {t.no_leidos > 0 ? (
          <span className="sinleer" aria-label={`${t.no_leidos} sin leer`}>
            {t.no_leidos}
          </span>
        ) : null}
      </div>
    </Link>
  )
}

/**
 * Estado vacío como invitación, no como disculpa.
 *
 * Y el aviso del histórico no es opcional: la Conversations API de Meta solo
 * devuelve los 20 mensajes más recientes y el histórico completo NO es
 * recuperable. La bandeja de un cliente nuevo arranca vacía y eso hay que
 * decirlo aquí, no dejar que lo descubra pensando que algo falla.
 */
function EstadoVacio({ estado }: { estado: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--k-text-2)' }}>
      {estado === 'cerrada' ? (
        <p>No hay conversaciones cerradas.</p>
      ) : (
        <>
          <p style={{ color: 'var(--k-text)' }}>Todavía no hay conversaciones.</p>
          <p style={{ fontSize: 13 }}>
            Aparecerán aquí en cuanto alguien escriba por un canal conectado. El histórico
            anterior a la conexión no se puede recuperar: Meta no lo entrega.
          </p>
        </>
      )}
    </div>
  )
}
