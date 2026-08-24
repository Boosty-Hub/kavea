import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * El `state` del diálogo de Meta: qué lleva, cómo se firma y por qué.
 *
 * EL PROBLEMA QUE RESUELVE. Strict Mode está en Yes en el panel de Facebook
 * Login for Business, así que Meta solo acepta UNA URI de retorno literal:
 * `https://conectar.kavea.ai/api/meta/oauth/callback`. Pero el cliente arranca
 * el flujo desde SU subdominio y hay que devolverlo allí, y el callback tiene
 * que saber a qué organización pertenece el token que acaba de recibir. Nada de
 * eso cabe en la URI. Cabe en el `state`, que Meta devuelve intacto.
 *
 * Y POR ESO HAY QUE FIRMARLO. Un `state` sin firma es un parámetro que escribe
 * quien quiera: bastaría con enviarle a un dueño de Kavea un enlace al diálogo
 * con `state` apuntando a OTRA organización para que su autorización —legítima,
 * hecha con su propia cuenta de Meta— colgara la Página del atacante del espacio
 * de la víctima. Es el CSRF clásico de OAuth, y aquí la consecuencia es cruzar
 * credenciales entre inquilinos, que es el fallo más caro del producto.
 *
 * LA FIRMA NO BASTA POR SÍ SOLA. Un `state` firmado sigue siendo válido si se
 * intercepta y se reenvía. Por eso el `nonce` viaja además en una cookie del
 * navegador que abrió el flujo (`.kavea.ai`, así que `conectar` la ve), y el
 * callback exige que coincidan. La firma dice «esto lo emitió Kavea»; la cookie
 * dice «y se lo emitió a ESTE navegador». Hacen falta las dos.
 *
 * El secreto es de servidor y NO es el App Secret de Meta: ese vive solo en el
 * borde y no entra en el proceso de Next ni de casualidad.
 */

const VIDA_MS = 10 * 60 * 1000

export type EstadoOauth = {
  /** A qué organización se cuelga la conexión. */
  org: string
  /** Su subdominio, para saber a dónde devolver al cliente sin tocar la base. */
  slug: string
  /** `mensajeria` (Messenger + Instagram) o `whatsapp`. */
  canal: string
  /** El `config_id` con el que se abrió: se comprueba que no cambió por el camino. */
  cfg: string
  nonce: string
  /** Milisegundos epoch. */
  exp: number
}

function secreto(): string {
  const s = process.env.KAVEA_ESTADO_SECRETO
  // Sin secreto no se firma con uno vacío ni se degrada a «sin firma»: se
  // rompe. Un flujo de OAuth que arranca sin protección de CSRF es peor que un
  // flujo que no arranca.
  if (!s || s.length < 32) {
    throw new Error('Falta KAVEA_ESTADO_SECRETO (32 caracteres o más)')
  }
  return s
}

/** base64url sin relleno: viaja por query string sin escapar nada. */
function b64u(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deB64u(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function mac(cuerpo: string): string {
  return b64u(createHmac('sha256', secreto()).update(cuerpo).digest())
}

export function nuevoNonce(): string {
  return b64u(randomBytes(18))
}

export function firmarEstado(datos: Omit<EstadoOauth, 'exp'>): string {
  const cuerpo = b64u(
    Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + VIDA_MS }), 'utf8'),
  )
  return `${cuerpo}.${mac(cuerpo)}`
}

export type Verificacion =
  | { ok: true; estado: EstadoOauth }
  | { ok: false; motivo: 'formato' | 'firma' | 'caducado' }

/**
 * Verifica ANTES de mirar el contenido.
 *
 * El orden importa: firma primero, `JSON.parse` después. Al revés se estaría
 * deserializando un texto que todavía no se sabe de dónde viene.
 */
export function verificarEstado(state: string | null): Verificacion {
  if (!state) return { ok: false, motivo: 'formato' }

  const corte = state.indexOf('.')
  if (corte <= 0) return { ok: false, motivo: 'formato' }

  const cuerpo = state.slice(0, corte)
  const firma = state.slice(corte + 1)

  // Comparación en tiempo constante. Con `===` el tiempo de respuesta filtra
  // cuántos bytes iniciales acertó quien lo intenta, y una firma se puede
  // adivinar byte a byte con suficientes intentos.
  const esperada = Buffer.from(mac(cuerpo), 'utf8')
  const recibida = Buffer.from(firma, 'utf8')
  if (esperada.length !== recibida.length) return { ok: false, motivo: 'firma' }
  if (!timingSafeEqual(esperada, recibida)) return { ok: false, motivo: 'firma' }

  let estado: EstadoOauth
  try {
    estado = JSON.parse(deB64u(cuerpo).toString('utf8')) as EstadoOauth
  } catch {
    return { ok: false, motivo: 'formato' }
  }

  if (typeof estado?.exp !== 'number' || Date.now() > estado.exp) {
    return { ok: false, motivo: 'caducado' }
  }
  if (!estado.org || !estado.slug || !estado.canal || !estado.nonce) {
    return { ok: false, motivo: 'formato' }
  }

  return { ok: true, estado }
}

/** Nombre de la cookie que lleva el nonce. Corta y sin datos dentro. */
export const COOKIE_NONCE = 'kv_oauth'

/**
 * El `config_id` de cada canal.
 *
 * Hoy solo existe `kavea-mensajeria` (Messenger + Instagram, creada el 23-ago).
 * La de WhatsApp llegará cuando Embedded Signup deje de estar detrás de la
 * pantalla rota de Tech Provider; hasta entonces pedirla devuelve 400 en vez de
 * abrir un diálogo con `config_id` vacío, que Meta rechaza con un error que no
 * dice nada.
 */
export function configDe(canal: string): string | null {
  const mapa: Record<string, string | undefined> = {
    mensajeria: process.env.META_CONFIG_MENSAJERIA,
    whatsapp: process.env.META_CONFIG_WHATSAPP,
  }
  return mapa[canal] || null
}

/** El host fijo del retorno. Strict Mode exige que sea literalmente este. */
export function uriDeRetorno(): string {
  const raiz = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'
  return `https://conectar.${raiz}/api/meta/oauth/callback`
}
