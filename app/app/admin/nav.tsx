import Link from 'next/link'

/**
 * La navegación del panel interno.
 *
 * El orden no es alfabético ni cronológico: es el orden en el que se hacen las
 * preguntas. Primero qué está roto, después quién es quién, y al final las
 * cosas que se miran una vez al mes.
 */
const SECCIONES = [
  { clave: 'salud', href: '/admin', etiqueta: 'Salud' },
  { clave: 'solicitudes', href: '/admin/solicitudes', etiqueta: 'Solicitudes' },
  { clave: 'espacios', href: '/admin/espacios', etiqueta: 'Espacios' },
  { clave: 'portafolio', href: '/admin/portafolio', etiqueta: 'Portafolio' },
  { clave: 'accesos', href: '/admin/accesos', etiqueta: 'Accesos' },
  { clave: 'uso', href: '/admin/uso', etiqueta: 'Uso' },
] as const

export type SeccionAdmin = (typeof SECCIONES)[number]['clave']

export function NavAdmin({ actual }: { actual: SeccionAdmin }) {
  return (
    <nav className="nav-ajustes" aria-label="Panel interno" style={{ marginBottom: 24 }}>
      {SECCIONES.map((s) => (
        <Link
          key={s.clave}
          href={s.href}
          aria-current={s.clave === actual ? 'page' : undefined}
          style={{
            color: s.clave === actual ? 'var(--k-text)' : 'var(--k-text-2)',
            fontWeight: s.clave === actual ? 500 : 400,
          }}
        >
          {s.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
