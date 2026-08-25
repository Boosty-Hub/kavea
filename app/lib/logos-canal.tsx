/**
 * Las marcas de los tres canales, en SVG dentro del propio bundle.
 *
 * VIVÍA EN `ajustes/canales/` y ya lo importaban dos pantallas más por ruta
 * relativa, subiendo dos carpetas. Con la bandeja son cuatro: es de todos, así
 * que está en `lib`. Y hubo un momento en que la bandeja tuvo sus propios
 * iconos dibujados a mano, que era la peor de las opciones —dos juegos de logos
 * para los mismos tres canales, y el de la bandeja peor—.
 *
 * NADA DE IMÁGENES REMOTAS. Un `<img src="...cdn.meta.com...">` mete un tercero
 * en el camino de render de una pantalla interna: se cae su CDN y la pantalla
 * queda con huecos, y de paso cada carga le cuenta a Meta quién está mirando el
 * panel. Son tres glifos, caben en el bundle.
 *
 * Van en `currentColor` para que hereden el token de color del canal
 * —`--k-canal-instagram` y compañía, que ya existen en los dos temas— en lugar
 * de traer sus propios colores de marca. Un logo a todo color junto a un estado
 * en gris compite con el dato que importa, que es si el canal está activo.
 */

type Props = { className?: string; size?: number }

function Svg({ size = 20, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      {children}
    </svg>
  )
}

export function LogoInstagram({ size }: Props) {
  return (
    <Svg size={size}>
      <rect
        x="2.75" y="2.75" width="18.5" height="18.5" rx="5.25"
        stroke="currentColor" strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" />
    </Svg>
  )
}

export function LogoMessenger({ size }: Props) {
  return (
    <Svg size={size}>
      <path
        d="M12 2.4c-5.46 0-9.6 4-9.6 9.4 0 2.82 1.14 5.26 3 6.94.15.14.25.34.25.55l.05 1.7c.02.54.58.9 1.07.68l1.9-.84c.16-.07.34-.09.51-.04.97.27 2 .41 3.07.41h.05c5.46 0 9.6-4 9.6-9.4S17.46 2.4 12 2.4Z"
        fill="currentColor"
      />
      {/* El rayo va calado sobre la burbuja, no dibujado encima: así el glifo
          funciona igual sobre fondo claro y sobre fondo oscuro. */}
      <path
        d="m6.28 15.02 2.82-4.47a1.44 1.44 0 0 1 2.08-.38l2.24 1.68c.2.15.48.15.69 0l3.03-2.3c.4-.3.93.18.66.61l-2.82 4.47a1.44 1.44 0 0 1-2.08.38l-2.24-1.68a.58.58 0 0 0-.69 0l-3.03 2.3c-.4.3-.93-.18-.66-.61Z"
        fill="var(--k-surface)"
      />
    </Svg>
  )
}

export function LogoWhatsApp({ size }: Props) {
  return (
    <Svg size={size}>
      <path
        d="M12.04 2.6a9.34 9.34 0 0 0-7.93 14.3l-1.1 4.03 4.13-1.08a9.34 9.34 0 1 0 4.9-17.25Zm0 1.66a7.68 7.68 0 0 1 6.5 11.77 7.68 7.68 0 0 1-10.4 2.5l-.29-.17-2.45.64.65-2.39-.19-.3a7.68 7.68 0 0 1 6.18-12.05Z"
        fill="currentColor"
      />
      <path
        d="M9.5 7.28c-.18-.4-.36-.4-.53-.41h-.45c-.15 0-.4.06-.62.28-.21.23-.81.8-.81 1.94 0 1.14.83 2.24.95 2.4.11.15 1.62 2.6 4.01 3.55 1.99.79 2.39.63 2.82.59.43-.04 1.4-.57 1.6-1.13.19-.55.19-1.02.14-1.12-.06-.1-.21-.16-.44-.28-.23-.11-1.4-.68-1.61-.76-.22-.08-.38-.12-.53.12-.15.23-.6.76-.74.91-.14.16-.27.18-.5.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.17-1.38-1.31-1.62-.14-.23-.02-.36.1-.48.11-.1.24-.27.35-.41.12-.14.15-.24.23-.4.08-.16.04-.29-.02-.41-.05-.11-.5-1.25-.7-1.71Z"
        fill="currentColor"
      />
    </Svg>
  )
}

const POR_CANAL = {
  instagram: LogoInstagram,
  messenger: LogoMessenger,
  whatsapp: LogoWhatsApp,
} as const

/**
 * El logo del canal, o null si no lo conocemos.
 *
 * Devuelve null en vez de un icono genérico a propósito, por lo mismo que
 * `etiquetaCanal` acepta cualquier string: el dominio de la base puede crecer
 * antes que este fichero, y un hueco es más honesto que un icono equivocado.
 */
export function LogoCanal({ canal, size }: { canal: string; size?: number }) {
  const C = (POR_CANAL as Record<string, ((p: Props) => React.ReactElement) | undefined>)[canal]
  return C ? <C size={size} /> : null
}
