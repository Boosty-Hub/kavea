/**
 * Validación de la firma de Meta.
 *
 * ESTA ES LA PIEZA QUE DECIDE SI KAVEA FUNCIONA EN VE, RD Y MX.
 *
 * Meta firma el cuerpo con HMAC-SHA256 usando el App Secret, y lo entrega en
 * `X-Hub-Signature-256` con el prefijo literal `sha256=` y hex en minúscula.
 * `X-Hub-Signature` (SHA1) es legacy y no se valida.
 *
 * Cita oficial: "we generate the signature using an escaped unicode version of
 * the payload, with lowercase hex digits. If you just calculate against the
 * decoded bytes, you will end up with a different signature."
 *
 * Meta manda `café` como `café`: seis caracteres ASCII para la é.
 * `JSON.parse` los convierte en un carácter real y `JSON.stringify` no vuelve a
 * escaparlos; además reordena claves y normaliza espaciado. El cuerpo resultante
 * es otro y el HMAC es otro.
 *
 * El fallo que produce esto es peor que uno limpio: solo aparece cuando alguien
 * escribe con tildes, eñes o emoji. Nunca en las pruebas en inglés, siempre en
 * los tres mercados de Kavea.
 *
 * REGLA: los bytes que llegaron por el socket son la única fuente admisible.
 */

/** La CryptoKey se importa una vez por instancia, no una vez por petición. */
let claveHmac: Promise<CryptoKey> | null = null

function clave(appSecret: string): Promise<CryptoKey> {
  claveHmac ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return claveHmac
}

export async function firmaValida(
  bytes: Uint8Array,
  cabecera: string,
  appSecret: string,
): Promise<boolean> {
  if (!cabecera.startsWith('sha256=')) return false

  const esperado = cabecera.slice('sha256='.length).trim().toLowerCase()
  if (esperado.length !== 64) return false

  const mac = await crypto.subtle.sign('HMAC', await clave(appSecret), bytes as BufferSource)
  const calculado = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return iguales(calculado, esperado)
}

/**
 * Comparación en tiempo constante.
 *
 * Un `===` con salida temprana filtra la firma carácter a carácter: midiendo
 * cuánto tarda en devolver false se puede reconstruir el valor esperado.
 */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
