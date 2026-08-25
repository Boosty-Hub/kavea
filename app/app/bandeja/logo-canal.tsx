/**
 * El logo del canal, para saber por dónde va una conversación de un vistazo.
 *
 * POR QUÉ NO BASTABA EL PUNTO DE COLOR. La fila llevaba un punto coloreado más
 * la etiqueta en texto. El color solo distingue si ya sabes qué color es cada
 * canal, y la etiqueta hay que leerla: en una lista de veinte filas nadie lee
 * veinte etiquetas. Una forma reconocible se ve sin leer.
 *
 * POR QUÉ SON ICONOS Y NO LAS MARCAS OFICIALES. Redibujar de memoria el trazo
 * exacto de una marca registrada sale mal —y mal dibujada es peor que no
 * ponerla—. Aquí va un icono claro dentro del color de cada canal: el auricular
 * en verde, el rayo en azul, la cámara en el morado. Se distinguen al tamaño al
 * que de verdad se ven, que son dieciséis píxeles.
 *
 * EL TEXTO NO SE QUITA. El icono acompaña a la etiqueta, no la sustituye: el
 * color y la forma nunca comunican solos, que es la misma regla que ya seguían
 * las píldoras de estado.
 */

/** El trazo blanco de cada canal, dentro de un lienzo de 24. */
const GLIFOS: Record<string, { d: string; relleno: boolean }> = {
  // Auricular descolgado, el icono de teléfono de toda la vida.
  whatsapp: {
    d: 'M7.6 10.7c1 2 2.7 3.7 4.7 4.7l1.5-1.5c.2-.2.5-.3.8-.2 1 .3 2 .5 3 .5.4 0 .8.4.8.8v2.6c0 .4-.4.8-.8.8C10.5 18.4 5.6 13.5 5.6 6.4c0-.4.4-.8.8-.8H9c.4 0 .8.4.8.8 0 1 .2 2 .5 3 .1.3 0 .6-.2.8l-1.5 1.5z',
    relleno: true,
  },
  // El rayo, que es lo que distingue la burbuja de Messenger de cualquier otra.
  messenger: {
    d: 'M13.6 4.5 7.2 13.4h3.6l-1 6.1 6.4-8.9h-3.6z',
    relleno: true,
  },
  // Una cámara: marco, objetivo y el punto del flash.
  instagram: {
    d: 'M8 4.8h8A3.2 3.2 0 0 1 19.2 8v8a3.2 3.2 0 0 1-3.2 3.2H8A3.2 3.2 0 0 1 4.8 16V8A3.2 3.2 0 0 1 8 4.8Zm4 4.1a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Zm4.3-1.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z',
    relleno: true,
  },
}

export function LogoCanal({ canal, lado = 16 }: { canal: string | null | undefined; lado?: number }) {
  const glifo = canal ? GLIFOS[canal] : undefined

  // Un canal que no conocemos no se dibuja a medias: se deja el hueco y la
  // etiqueta de texto de al lado sigue diciendo qué es.
  if (!glifo) return null

  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: lado,
        height: lado,
        borderRadius: Math.round(lado / 4),
        background: `var(--k-canal-${canal})`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(lado * 0.72)}
        height={Math.round(lado * 0.72)}
        focusable="false"
      >
        <path
          d={glifo.d}
          fill={glifo.relleno ? '#fff' : 'none'}
          stroke={glifo.relleno ? 'none' : '#fff'}
          strokeWidth={glifo.relleno ? undefined : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
