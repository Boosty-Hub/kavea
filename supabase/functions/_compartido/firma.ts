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

/**
 * El `signed_request` de Facebook Login, que es OTRA COSA que la firma de arriba.
 *
 * Llega en un campo de formulario, no en una cabecera, y con la forma
 * `firma.carga`, ambas en base64 URL-SAFE y SIN relleno. Lo usan los dos
 * callbacks que Meta exige para el App Review: `deauthorize` y borrado de datos.
 *
 * LA TRAMPA, Y ES LA MISMA CLASE DE TRAMPA QUE LA DE ARRIBA: el HMAC se calcula
 * sobre la CARGA TAL CUAL LLEGÓ —la cadena base64, sin decodificar— y no sobre el
 * JSON que hay dentro. Decodificar, parsear y volver a serializar produce otros
 * bytes y por tanto otra firma. Aquí el error no es sutil como el de los acentos:
 * no valida nunca, lo que al menos falla en voz alta.
 *
 * Base64 URL-safe: `-` por `+`, `_` por `/`, y sin `=` al final. `atob` no
 * entiende ninguna de las tres cosas, así que hay que deshacerlas antes.
 */
function desdeBase64Url(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/')
  const conRelleno = norm + '='.repeat((4 - (norm.length % 4)) % 4)
  const bin = atob(conRelleno)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type CargaFirmada = {
  algorithm?: string
  issued_at?: number
  user_id?: string
  [k: string]: unknown
}

/**
 * Devuelve la carga si la firma es válida, y null si no lo es.
 *
 * Null y no una excepción porque quien llama tiene que contestar algo a Meta en
 * los dos casos, y un `try/catch` alrededor de esto invitaría a tratar «firma
 * mala» y «se rompió algo» igual. Son cosas distintas: la primera es un intento
 * de suplantación y la segunda un fallo nuestro.
 */
export async function cargaFirmada(
  signedRequest: string,
  appSecret: string,
): Promise<CargaFirmada | null> {
  const partes = signedRequest.split('.')
  if (partes.length !== 2) return null

  const [firmaB64, cargaB64] = partes as [string, string]
  if (!firmaB64 || !cargaB64) return null

  let firma: Uint8Array
  let carga: CargaFirmada
  try {
    firma = desdeBase64Url(firmaB64)
    carga = JSON.parse(new TextDecoder().decode(desdeBase64Url(cargaB64))) as CargaFirmada
  } catch {
    return null
  }

  // Meta solo emite HMAC-SHA256, y comprobarlo cierra la puerta a que un día
  // acepte un `algorithm` que diga `none`. Es el fallo clásico de JWT y no
  // cuesta nada no tenerlo.
  if (carga.algorithm !== 'HMAC-SHA256') return null

  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await clave(appSecret),
      // AQUÍ ESTÁ TODO: se firma la cadena base64, no lo que hay dentro.
      new TextEncoder().encode(cargaB64) as BufferSource,
    ),
  )

  const hex = (b: Uint8Array) =>
    Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')

  return iguales(hex(mac), hex(firma)) ? carga : null
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
