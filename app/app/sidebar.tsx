'use client'

/**
 * La navegación de Kavea, en un solo sitio y colapsable.
 *
 * POR QUÉ NO EXISTÍA Y POR QUÉ HACE FALTA
 *
 * Hasta hoy `app/layout.tsx` eran catorce líneas sin navegación, y los módulos
 * principales —bandeja, embudo, agenda, contactos, actividad— no tenían forma de
 * llegar unos a otros: se llegaba escribiendo la URL. Solo `/ajustes` y `/admin`
 * llevaban su propia lista horizontal, cada una con las suyas y sin nombrar a la
 * otra. Es el mismo problema que el comentario de `ajustes/nav.tsx` describe para
 * seis pantallas, una escala más arriba.
 *
 * POR QUÉ LA SUPERFICIE SE DEDUCE DE LA RUTA
 *
 * `admin.kavea.ai` y `<slug>.kavea.ai` son dos superficies distintas con menús
 * distintos, y quién puede ver cada una lo decide el servidor. Aquí NO se decide
 * nada de permisos: se elige qué lista pintar según dónde estás. Un enlace que no
 * te corresponde no te da acceso a nada —el 404 lo pone el servidor y RLS lo
 * respalda— así que este componente puede ser de cliente sin abrir nada.
 *
 * POR QUÉ EL ESTADO VA EN localStorage Y NO EN UNA COOKIE
 *
 * Colapsar el menú es una preferencia del aparato, no de la cuenta: el mismo
 * operador quiere el menú abierto en el portátil y cerrado en la tablet. Una
 * cookie lo haría viajar en cada petición y lo compartiría entre dispositivos.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

type Entrada = { href: string; etiqueta: string; icono: string }
type Seccion = { id: string; titulo: string; entradas: Entrada[] }

/**
 * Por secciones, y el orden de cada sección es el del trabajo: primero el
 * proceso comercial y la atención del día, después lo que se organiza, y al
 * final lo que se configura una vez al mes.
 *
 * Comentarios ya no es una entrada de primer nivel: entra como pestaña dentro
 * de la Bandeja (`app/bandeja/[id]/page.tsx` y `app/bandeja/page.tsx`), porque
 * es el mismo tipo de trabajo —atender a alguien— aunque la respuesta sea
 * pública y no tenga ventana de 24 h.
 */
const SECCIONES_CLIENTE: Seccion[] = [
  {
    id: 'trabajo',
    titulo: 'Trabajo',
    entradas: [
      { href: '/embudo', etiqueta: 'Embudo', icono: '▤' },
      { href: '/bandeja', etiqueta: 'Bandeja', icono: '◧' },
      { href: '/agenda', etiqueta: 'Agenda', icono: '▦' },
    ],
  },
  {
    id: 'datos',
    titulo: 'Datos',
    entradas: [
      { href: '/contactos', etiqueta: 'Contactos', icono: '◍' },
      { href: '/contenido', etiqueta: 'Contenido', icono: '▣' },
      { href: '/actividad', etiqueta: 'Actividad', icono: '◷' },
    ],
  },
  {
    id: 'cuenta',
    titulo: 'Cuenta',
    entradas: [
      { href: '/ajustes/organizacion', etiqueta: 'Ajustes', icono: '◎' },
    ],
  },
]

const ADMIN: Entrada[] = [
  { href: '/admin', etiqueta: 'Salud', icono: '◉' },
  { href: '/admin/solicitudes', etiqueta: 'Solicitudes', icono: '◫' },
  { href: '/admin/correos', etiqueta: 'Correo', icono: '✉' },
  { href: '/admin/espacios', etiqueta: 'Espacios', icono: '▣' },
  { href: '/admin/portafolio', etiqueta: 'Portafolio', icono: '◈' },
  { href: '/admin/accesos', etiqueta: 'Accesos', icono: '⚿' },
  { href: '/admin/uso', etiqueta: 'Uso', icono: '◴' },
]

/**
 * Rutas sin menú.
 *
 * `/entrar` y `/invitacion/...` se abren SIN sesión, y pintar un menú de módulos
 * a quien todavía no ha entrado es enseñarle puertas que no puede abrir. La raíz
 * tampoco: solo redirige.
 */
function sinMenu(ruta: string): boolean {
  // `/registro` y `/crear` viven en la superficie SIN INQUILINO: quien las abre
  // todavía no tiene organización, así que un menú con Bandeja y Embudo enseña
  // una casa que no es suya. Se vio en una captura del 23-ago-2026, no leyendo
  // esta función: aquí no hay nada que delate qué rutas existen.
  return ruta === '/'
    || ruta === '/entrar'
    || ruta === '/registro'
    || ruta === '/crear'
    || ruta.startsWith('/invitacion')
}

const CLAVE = 'kavea:menu-colapsado'
const CLAVE_SECCIONES = 'kavea:menu-secciones-colapsadas'

/**
 * Sección de la navegación, colapsable independientemente del menú entero.
 *
 * Solo tiene sentido con el menú expandido: en modo icono ya no hay título que
 * plegar, así que ahí se ignora y se pintan las entradas planas — es el mismo
 * criterio que ya usa la etiqueta de cada enlace.
 */
function SeccionNav({
  seccion, colapsada, alternar, children,
}: {
  seccion: Seccion
  colapsada: boolean
  alternar: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={!colapsada}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 0,
          cursor: 'pointer',
          font: 'inherit',
          padding: '6px 10px',
          marginTop: 6,
          color: 'var(--k-text-2)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {seccion.titulo}
        <span aria-hidden="true" style={{ fontSize: 10 }}>{colapsada ? '▸' : '▾'}</span>
      </button>
      {colapsada ? null : children}
    </div>
  )
}

export function Sidebar() {
  const ruta = usePathname() ?? '/'
  // Arranca expandido en el servidor y en la primera pintura del cliente, y solo
  // después lee la preferencia. Leer localStorage durante el render produce una
  // discordancia de hidratación: el servidor no tiene localStorage y React
  // compara los dos árboles. Ya pasó una vez en el calendario, con un #418.
  const [colapsado, setColapsado] = useState(false)
  const [montado, setMontado] = useState(false)
  const [seccionesColapsadas, setSeccionesColapsadas] = useState<Set<string>>(new Set())
  const [noLeidos, setNoLeidos] = useState(0)

  const enPanelAdmin = ruta.startsWith('/admin')

  // El total de no leídos de toda la bandeja, para la píldora del enlace.
  // Cliente y no servidor: el layout que envuelve al Sidebar es compartido por
  // rutas con y sin sesión, así que resolver la organización ahí arriesga
  // romper `/entrar`. RLS ya limita la consulta a lo que el usuario puede ver,
  // igual que en `lib/bandeja.ts`. Sin canal de Broadcast propio —el Sidebar no
  // conoce el id de la organización— así que se refresca al cambiar de ruta y
  // con un sondeo, igual que la seguridad de `Refrescador`.
  useEffect(() => {
    if (enPanelAdmin || sinMenu(ruta)) return
    let vivo = true
    async function cargar() {
      const cliente = crearClienteNavegador()
      /**
       * DOS CUENTAS, PORQUE SON DOS COSAS QUE ESPERAN RESPUESTA.
       *
       * La píldora contaba solo `tarjetas.no_leidos`, y **un comentario no tiene
       * tarjeta**: llegaba uno nuevo y el menú no se movía. Para quien atiende,
       * un comentario sin contestar pesa lo mismo que un mensaje sin leer, así
       * que suman. Los propios y los borrados no cuentan: no son de nadie.
       */
      const [mensajes, comentarios] = await Promise.all([
        cliente.from('tarjetas').select('no_leidos').neq('estado', 'cerrada').gt('no_leidos', 0),
        cliente.from('comentarios').select('id', { count: 'exact', head: true })
          .eq('estado', 'nuevo').eq('propio', false).is('borrado_en', null),
      ])
      if (mensajes.error) console.error('[sidebar] no_leidos', mensajes.error)
      if (comentarios.error) console.error('[sidebar] comentarios nuevos', comentarios.error)
      if (!vivo) return
      const m = (mensajes.data ?? []).reduce((s, t: { no_leidos: number }) => s + t.no_leidos, 0)
      setNoLeidos(m + (comentarios.count ?? 0))
    }
    cargar()

    // Y se recarga al vuelo con la difusión, no solo cada treinta segundos: la
    // bandeja se refresca sola desde la 0086 y el menú se quedaba atrás medio
    // minuto, enseñando un número que ya no era verdad.
    const alCambio = () => { void cargar() }
    window.addEventListener('kavea:cambio', alCambio)

    const reloj = setInterval(cargar, 30_000)
    return () => {
      vivo = false
      clearInterval(reloj)
      window.removeEventListener('kavea:cambio', alCambio)
    }
  }, [ruta, enPanelAdmin])

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE)
      if (guardado !== null) {
        // Una elección explícita manda siempre, también en móvil: si alguien
        // abrió el menú a propósito en el teléfono, no se le vuelve a cerrar.
        setColapsado(guardado === '1')
      } else {
        // SIN PREFERENCIA GUARDADA, EN PANTALLA ESTRECHA, ARRANCA CERRADO.
        //
        // Medido el 4 de agosto de 2026 con Playwright: en un viewport de 390 px
        // el menú expandido ocupaba 216, o sea el 55 % de la pantalla, y dejaba
        // la bandeja en la mitad restante. No rompía el layout —no había barra
        // horizontal— y por eso no lo detectaba nada automático: solo se ve
        // mirando la captura. Es el mismo defecto que ya salió una vez, con la
        // lista de conversaciones a media pantalla.
        //
        // El corte va en 860 px, que es el mismo que ya usa el CSS de la bandeja
        // para pasar a una columna. Dos puntos de corte distintos producirían un
        // tramo de anchos donde el menú y el hilo se pelean por el sitio.
        setColapsado(window.matchMedia('(max-width: 860px)').matches)
      }
    } catch {
      // Modo privado o almacenamiento bloqueado: se queda expandido y no se
      // rompe nada. Una preferencia no vale una pantalla en blanco.
    }
    try {
      const guardadas = window.localStorage.getItem(CLAVE_SECCIONES)
      if (guardadas) setSeccionesColapsadas(new Set(guardadas.split(',').filter(Boolean)))
    } catch { /* ver arriba */ }
    setMontado(true)
  }, [])

  function alternar() {
    const v = !colapsado
    setColapsado(v)
    try {
      window.localStorage.setItem(CLAVE, v ? '1' : '0')
    } catch { /* ver arriba */ }
  }

  function alternarSeccion(id: string) {
    setSeccionesColapsadas((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id)
      try {
        window.localStorage.setItem(CLAVE_SECCIONES, [...siguiente].join(','))
      } catch { /* ver arriba */ }
      return siguiente
    })
  }

  if (sinMenu(ruta)) return null

  const ancho = colapsado ? 60 : 216

  function EnlaceModulo({ e }: { e: Entrada }) {
    // UNA regla, no tres.
    //
    // `/admin` se compara EXACTA porque es prefijo de las otras seis del
    // panel: con `startsWith`, «Salud» saldría activa en las siete pantallas.
    // El resto se compara por su primer segmento, que es lo que hace que
    // `/ajustes/organizacion` quede activo en las seis pantallas de ajustes y
    // `/bandeja` en `/bandeja/<id>`.
    const seccionRuta = '/' + e.href.split('/')[1]
    const activo = e.href === '/admin'
      ? ruta === '/admin'
      : ruta === seccionRuta || ruta.startsWith(seccionRuta + '/')
    const pildora = e.href === '/bandeja' && noLeidos > 0 ? noLeidos : null

    return (
      <Link
        href={e.href}
        aria-current={activo ? 'page' : undefined}
        title={colapsado ? `${e.etiqueta}${pildora ? ` · ${pildora} sin leer` : ''}` : undefined}
        /* El color, el fondo y el peso viven en `.nav__enlace` (globals.css) y no
           aquí: un estilo en línea no admite `:hover`, y este menú era la única
           superficie de la aplicación que no respondía al ratón. */
        className={`nav__enlace${activo ? ' nav__enlace--activo' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '8px 10px',
          borderRadius: 6,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span aria-hidden="true" style={{ width: 16, textAlign: 'center', flexShrink: 0, position: 'relative' }}>
          {e.icono}
          {/* En modo icono la píldora se convierte en un punto: un número de
              tres cifras no cabe sobre 16 px de ancho. */}
          {pildora && colapsado ? (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', top: -2, right: -4, width: 7, height: 7,
                borderRadius: 999, background: 'var(--k-escalada-fg, #b3261e)',
              }}
            />
          ) : null}
        </span>
        {/* La etiqueta se quita del árbol al colapsar en vez de ocultarse con
            CSS: un lector de pantalla leería siete nombres invisibles. */}
        {!colapsado && <span style={{ flex: 1, minWidth: 0 }}>{e.etiqueta}</span>}
        {pildora && !colapsado ? (
          <span className="sinleer" aria-label={`${pildora} sin leer`}>{pildora}</span>
        ) : null}
      </Link>
    )
  }

  return (
    <nav
      aria-label={enPanelAdmin ? 'Panel interno' : 'Módulos'}
      style={{
        width: ancho,
        minWidth: ancho,
        borderRight: '1px solid var(--k-linea, rgba(0,0,0,.10))',
        padding: '14px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        // Sin transición hasta que se monta: si no, al leer la preferencia el
        // menú se ve encogerse de 216 a 60 al cargar cada página.
        transition: montado ? 'width .14s ease' : 'none',
        position: 'sticky',
        top: 0,
        height: '100dvh',
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={alternar}
        aria-expanded={!colapsado}
        // El title es lo único que explica el botón cuando está colapsado y solo
        // se ve un símbolo.
        title={colapsado ? 'Expandir el menú' : 'Colapsar el menú'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--k-text-2)',
          font: 'inherit',
          fontSize: 15,
          padding: '6px 10px',
          marginBottom: 8,
          textAlign: 'left',
          borderRadius: 6,
        }}
      >
        {colapsado ? '»' : '«'}
        {!colapsado && <span style={{ marginLeft: 10, fontSize: 13 }}>Kavea</span>}
      </button>

      {enPanelAdmin ? (
        ADMIN.map((e) => <EnlaceModulo key={e.href} e={e} />)
      ) : colapsado ? (
        // En modo icono las secciones no aportan nada que plegar: se pintan
        // planas, en el mismo orden, para no obligar a expandir el menú
        // entero solo para ver el segundo grupo.
        SECCIONES_CLIENTE.flatMap((s) => s.entradas).map((e) => <EnlaceModulo key={e.href} e={e} />)
      ) : (
        SECCIONES_CLIENTE.map((s) => (
          <SeccionNav
            key={s.id}
            seccion={s}
            colapsada={seccionesColapsadas.has(s.id)}
            alternar={() => alternarSeccion(s.id)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {s.entradas.map((e) => <EnlaceModulo key={e.href} e={e} />)}
            </div>
          </SeccionNav>
        ))
      )}
    </nav>
  )
}
