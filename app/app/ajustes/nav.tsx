import Link from 'next/link'

/**
 * La navegación de ajustes, en un solo sitio.
 *
 * Cada pantalla llevaba la suya escrita a mano y ninguna coincidía: Campos no
 * enlazaba a Canales, Equipo no enlazaba a Plantillas, y al añadir la sexta
 * pantalla cuatro de las cinco anteriores no la nombraban. No es un descuido de
 * nadie: es lo que pasa siempre con una lista copiada seis veces.
 *
 * Componente de servidor y sin `usePathname`: la página que lo pinta ya sabe
 * cuál es, y pasarlo por prop evita convertir seis páginas de servidor en
 * clientes por un `aria-current`.
 */

const SECCIONES = [
  { clave: 'organizacion', href: '/ajustes/organizacion', etiqueta: 'La organización' },
  { clave: 'canales', href: '/ajustes/canales', etiqueta: 'Canales' },
  { clave: 'equipo', href: '/ajustes/equipo', etiqueta: 'Equipo' },
  { clave: 'campos', href: '/ajustes/campos', etiqueta: 'Campos' },
  { clave: 'embudos', href: '/ajustes/embudos', etiqueta: 'Embudos' },
  { clave: 'plantillas', href: '/ajustes/plantillas', etiqueta: 'Plantillas' },
] as const

export type SeccionAjustes = (typeof SECCIONES)[number]['clave']

export function NavAjustes({ actual }: { actual: SeccionAjustes }) {
  return (
    <nav className="nav-ajustes" aria-label="Ajustes">
      <Link href="/bandeja" style={{ color: 'var(--k-text-2)' }}>← Bandeja</Link>
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
