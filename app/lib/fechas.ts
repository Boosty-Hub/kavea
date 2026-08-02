/**
 * Las horas se pintan en el huso de la ORGANIZACIÓN, siempre.
 *
 * DOS RELOJES EN EL MISMO PRODUCTO
 *
 * Antes de este módulo convivían dos:
 *
 *   - Los componentes de SERVIDOR llamaban a `toLocaleTimeString('es')`, que en
 *     Netlify se resuelve en UTC. El hilo de una conversación de Caracas
 *     enseñaba cada mensaje cuatro horas en el futuro.
 *   - Los componentes de CLIENTE hacían lo mismo y se resolvía en el huso del
 *     navegador. La misma marca de tiempo salía con dos horas distintas según
 *     qué parte de la pantalla la pintara.
 *
 * Y de propina, un componente de cliente que formatea una fecha sin huso
 * explícito produce un texto en el servidor y otro en el navegador: es el error
 * de hidratación 418 de React, que la primera vez que apareció aquí escondía
 * exactamente este bug.
 *
 * La regla: el huso viene de `organizations.zona_horaria`, baja por props desde
 * el componente de servidor que ya carga la organización, y NUNCA se deduce del
 * entorno. Un huso deducido es un huso que cambia según quién mire, y la hora a
 * la que un cliente escribió no depende de dónde esté quien lee.
 *
 * Este módulo NO lleva `import 'server-only'`: lo usan los dos lados, que es
 * justo el punto.
 */

/** Cuando falta el dato. Es el mercado principal, y es mejor que UTC callado. */
export const HUSO_POR_DEFECTO = 'America/Caracas'

function formatear(iso: string, huso: string, opciones: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('es', { ...opciones, timeZone: huso }).format(new Date(iso))
  } catch {
    // Un huso inválido no puede dejar la pantalla en blanco. La base ya lo
    // valida con un trigger; esto es el cinturón por si alguna fila vieja se
    // coló antes de existir la validación.
    return new Intl.DateTimeFormat('es', { ...opciones, timeZone: 'UTC' }).format(new Date(iso))
  }
}

/** 18:27 — la hora de un mensaje dentro del hilo. */
export function hora(iso: string, huso: string): string {
  return formatear(iso, huso, { hour: '2-digit', minute: '2-digit' })
}

/** 2/8/2026, 18:27 — cuándo pasó algo, con día. */
export function fechaHora(iso: string, huso: string): string {
  return formatear(iso, huso, {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 2/8/2026 — solo el día. */
export function fecha(iso: string, huso: string): string {
  return formatear(iso, huso, { day: 'numeric', month: 'numeric', year: 'numeric' })
}

/** 2 ago — para listas apretadas. */
export function fechaCorta(iso: string, huso: string): string {
  return formatear(iso, huso, { day: 'numeric', month: 'short' })
}
