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

type Entrada = { href: string; etiqueta: string; icono: string }

/**
 * El orden es el del trabajo, no alfabético: primero donde se atiende, después
 * donde se organiza, y al final lo que se configura una vez al mes.
 */
const CLIENTE: Entrada[] = [
  { href: '/bandeja', etiqueta: 'Bandeja', icono: '◧' },
  { href: '/embudo', etiqueta: 'Embudo', icono: '▤' },
  { href: '/agenda', etiqueta: 'Agenda', icono: '▦' },
  { href: '/contactos', etiqueta: 'Contactos', icono: '◍' },
  { href: '/actividad', etiqueta: 'Actividad', icono: '◷' },
  { href: '/ajustes/organizacion', etiqueta: 'Ajustes', icono: '◎' },
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
  return ruta === '/' || ruta === '/entrar' || ruta.startsWith('/invitacion')
}

const CLAVE = 'kavea:menu-colapsado'

export function Sidebar() {
  const ruta = usePathname() ?? '/'
  // Arranca expandido en el servidor y en la primera pintura del cliente, y solo
  // después lee la preferencia. Leer localStorage durante el render produce una
  // discordancia de hidratación: el servidor no tiene localStorage y React
  // compara los dos árboles. Ya pasó una vez en el calendario, con un #418.
  const [colapsado, setColapsado] = useState(false)
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    try {
      setColapsado(window.localStorage.getItem(CLAVE) === '1')
    } catch {
      // Modo privado o almacenamiento bloqueado: se queda expandido y no se
      // rompe nada. Una preferencia no vale una pantalla en blanco.
    }
    setMontado(true)
  }, [])

  function alternar() {
    const v = !colapsado
    setColapsado(v)
    try {
      window.localStorage.setItem(CLAVE, v ? '1' : '0')
    } catch { /* ver arriba */ }
  }

  if (sinMenu(ruta)) return null

  const entradas = ruta.startsWith('/admin') ? ADMIN : CLIENTE
  const ancho = colapsado ? 60 : 216

  return (
    <nav
      aria-label={ruta.startsWith('/admin') ? 'Panel interno' : 'Módulos'}
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

      {entradas.map((e) => {
        // UNA regla, no tres.
        //
        // `/admin` se compara EXACTA porque es prefijo de las otras seis del
        // panel: con `startsWith`, «Salud» saldría activa en las siete pantallas.
        // El resto se compara por su primer segmento, que es lo que hace que
        // `/ajustes/organizacion` quede activo en las seis pantallas de ajustes y
        // `/bandeja` en `/bandeja/<id>`.
        const seccion = '/' + e.href.split('/')[1]
        const activo = e.href === '/admin'
          ? ruta === '/admin'
          : ruta === seccion || ruta.startsWith(seccion + '/')

        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? 'page' : undefined}
            title={colapsado ? e.etiqueta : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '8px 10px',
              borderRadius: 6,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              color: activo ? 'var(--k-text)' : 'var(--k-text-2)',
              fontWeight: activo ? 500 : 400,
              background: activo ? 'var(--k-activo, rgba(0,0,0,.05))' : 'transparent',
            }}
          >
            <span aria-hidden="true" style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>
              {e.icono}
            </span>
            {/* La etiqueta se quita del árbol al colapsar en vez de ocultarse con
                CSS: un lector de pantalla leería siete nombres invisibles. */}
            {!colapsado && <span>{e.etiqueta}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
