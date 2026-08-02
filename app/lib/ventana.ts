/**
 * Ventana de servicio de Meta.
 *
 * Se calcula POR CONVERSACIÓN sobre `last_incoming_at`, nunca con un flag
 * global. Chatwoot usó un flag global y es la implementación incorrecta.
 *
 * En fase 3 la bandeja es de solo lectura, pero el indicador ya se muestra: un
 * operador que ve una conversación sin saber que la ventana venció escribe una
 * respuesta que no se va a poder enviar. Es información crítica aunque todavía
 * no haya compositor.
 */

export type EstadoVentana = {
  /** `abierta` permite responder libremente; `humana` solo intervención humana real. */
  clase: 'abierta' | 'humana' | 'cerrada' | 'sin_contacto'
  etiqueta: string
  detalle: string
  /** Horas restantes dentro de la ventana de 24 h, si aplica. */
  restanHoras: number | null
}

const H24 = 24 * 60 * 60 * 1000
const D7 = 7 * 24 * 60 * 60 * 1000

export function calcularVentana(lastIncomingAt: string | null, ahora = Date.now()): EstadoVentana {
  if (!lastIncomingAt) {
    return {
      clase: 'sin_contacto',
      etiqueta: 'Sin mensajes del contacto',
      detalle: 'La ventana la abre un mensaje entrante. Todavía no ha llegado ninguno.',
      restanHoras: null,
    }
  }

  const delta = ahora - new Date(lastIncomingAt).getTime()

  if (delta < H24) {
    const restan = (H24 - delta) / 3_600_000
    return {
      clase: 'abierta',
      etiqueta: restan < 1 ? 'Menos de 1 h' : `${Math.floor(restan)} h`,
      detalle: 'Se puede responder con normalidad.',
      restanHoras: restan,
    }
  }

  if (delta < D7) {
    return {
      clase: 'humana',
      etiqueta: 'Solo intervención humana',
      detalle:
        'Pasaron más de 24 h. Solo puede responder una persona del equipo, y hasta 7 días ' +
        'desde el último mensaje del contacto. Los agentes automáticos no pueden.',
      restanHoras: null,
    }
  }

  return {
    clase: 'cerrada',
    etiqueta: 'Ventana vencida',
    detalle:
      'Pasaron más de 7 días desde el último mensaje del contacto. Meta no permite enviar ' +
      'hasta que vuelva a escribir.',
    restanHoras: null,
  }
}

/** Tokens del libro de marca. El color nunca comunica solo: siempre va con texto. */
export const COLOR_VENTANA: Record<EstadoVentana['clase'], { fg: string; bg: string }> = {
  abierta: { fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)' },
  humana: { fg: 'var(--k-esperando-fg)', bg: 'var(--k-esperando-bg)' },
  cerrada: { fg: 'var(--k-escalada-fg)', bg: 'var(--k-escalada-bg)' },
  sin_contacto: { fg: 'var(--k-text-2)', bg: 'var(--k-surface-2)' },
}

export const ESTADOS = {
  nueva: { etiqueta: 'Nueva', fg: 'var(--k-curso-fg)', bg: 'var(--k-curso-bg)', punto: 'var(--k-curso)' },
  en_curso: { etiqueta: 'En curso', fg: 'var(--k-curso-fg)', bg: 'var(--k-curso-bg)', punto: 'var(--k-curso)' },
  esperando: { etiqueta: 'Esperando', fg: 'var(--k-esperando-fg)', bg: 'var(--k-esperando-bg)', punto: 'var(--k-esperando)' },
  cerrada: { etiqueta: 'Cerrada', fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)', punto: 'var(--k-resuelta)' },
} as const

export type Estado = keyof typeof ESTADOS

export const CANALES = {
  instagram: 'Instagram',
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
} as const

/** Fecha relativa corta para la lista. */
export function haceCuanto(iso: string | null): string {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  if (s < 604800) return `${Math.floor(s / 86400)} d`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}
