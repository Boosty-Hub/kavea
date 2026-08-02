/**
 * Descifrado de credenciales de Meta.
 *
 * AES-256-GCM, con la clave en los secretos del proyecto y NUNCA en la base:
 * un volcado de Postgres no permite recuperar ningún token.
 *
 * El `kid` decide qué clave usar. Existe desde el primer día porque sin
 * identificador de clave, rotar significa descifrar y volver a cifrar todo a la
 * vez, con ventana de indisponibilidad. Con `kid`, la rotación es perezosa: las
 * credenciales viejas siguen descifrándose con la clave vieja mientras las
 * nuevas usan la nueva.
 */

const claves = new Map<string, Promise<CryptoKey>>()

function clavePara(kid: string): Promise<CryptoKey> {
  let p = claves.get(kid)
  if (!p) {
    const b64 = Deno.env.get(`KAVEA_CRED_KEY_${kid}`)
    if (!b64) throw new Error(`Falta KAVEA_CRED_KEY_${kid}`)
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    p = crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, false, [
      'decrypt',
    ])
    claves.set(kid, p)
  }
  return p
}

/** Convierte el `\x...` que devuelve PostgREST para una columna bytea. */
export function desdeHexPg(s: string): Uint8Array {
  const hex = s.startsWith('\\x') ? s.slice(2) : s
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

/**
 * El tag de autenticación va concatenado al final del ciphertext, que es como
 * lo espera WebCrypto. Si alguien manipuló los bytes, `decrypt` lanza en lugar
 * de devolver basura: eso es lo que hace de GCM cifrado autenticado.
 */
export async function descifrar(
  cipherConTag: Uint8Array,
  nonce: Uint8Array,
  kid: string,
): Promise<string> {
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
    await clavePara(kid),
    cipherConTag as BufferSource,
  )
  return new TextDecoder().decode(plano)
}
