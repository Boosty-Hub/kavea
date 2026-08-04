import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from './sidebar'

export const metadata: Metadata = {
  title: 'Kavea',
  description: 'Centro de operaciones conversacionales',
  robots: { index: false, follow: false },
}

/**
 * El menú va aquí y no en un grupo de rutas.
 *
 * La alternativa era mover las veinte y pico páginas a `(app)/` y `(auth)/` para
 * que cada grupo tuviera su layout. Sale más limpio en el árbol de ficheros y
 * cuesta renombrar veinte carpetas, con el riesgo de romper un `import` relativo
 * en cada una. `Sidebar` decide por la ruta si se pinta o no, y el resultado que
 * ve el usuario es el mismo.
 *
 * El layout sigue siendo componente de SERVIDOR: `Sidebar` es cliente, pero
 * importarlo desde aquí no arrastra nada al bundle de las páginas que no lo usan.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: '100dvh' }}>
          <Sidebar />
          {/* `minWidth: 0` no es decorativo: sin él, un hijo que no encoge —una
              tabla ancha, un bloque de código— empuja el flex y saca la página
              del ancho de la ventana, con barra horizontal en todo el sitio. */}
          <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        </div>
      </body>
    </html>
  )
}
