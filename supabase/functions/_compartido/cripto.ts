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

/**
 * `encrypt` además de `decrypt`, y esto es un cambio de propiedades del sistema.
 *
 * Hasta la fase 5b Kavea SOLO podía descifrar. Eso significaba que un compromiso
 * de la aplicación permitía leer credenciales existentes pero no fabricar
 * ninguna nueva: no se podía dar de alta una conexión falsa contra una Página
 * ajena. Se pierde esa propiedad a cambio de poder conectar clientes sin SQL a
 * mano. Está decidido a conciencia y escrito en `docs/fases/05b` §6, no ocurrido
 * por descuido.
 *
 * La contención es que cifrar solo puede hacerlo el rol de servicio desde una
 * función de borde: no hay ninguna ruta desde el navegador hasta aquí.
 */
function clavePara(kid: string): Promise<CryptoKey> {
  let p = claves.get(kid)
  if (!p) {
    const b64 = Deno.env.get(`KAVEA_CRED_KEY_${kid}`)
    if (!b64) throw new Error(`Falta KAVEA_CRED_KEY_${kid}`)
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    p = crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
    claves.set(kid, p)
  }
  return p
}

/** El formato `\x...` que espera Postgres para una columna `bytea`. */
export function aHexPg(b: Uint8Array): string {
  let s = '\\x'
  for (const x of b) s += x.toString(16).padStart(2, '0')
  return s
}

/**
 * Nonce de 12 bytes, NUEVO EN CADA CIFRADO.
 *
 * Repetir un nonce con la misma clave en GCM no degrada la seguridad: la
 * destruye, y permite recuperar el texto en claro. Por eso se genera aquí dentro
 * y no se acepta como parámetro: un nonce que viene de fuera es un nonce que
 * alguien puede reutilizar sin darse cuenta.
 */
export async function cifrar(
  texto: string,
  kid: string,
): Promise<{ cipher: Uint8Array; nonce: Uint8Array; kid: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      await clavePara(kid),
      new TextEncoder().encode(texto) as BufferSource,
    ),
  )
  return { cipher, nonce, kid }
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
