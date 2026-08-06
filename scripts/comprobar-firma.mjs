/**
 * Guarda del `signed_request` de Facebook Login.
 *
 * POR QUÉ EXISTE
 *
 * De los dos callbacks que el App Review exige, lo único que decide si son
 * seguros es esta verificación, y tiene una trampa que no da la cara: el HMAC se
 * calcula sobre la CARGA TAL CUAL LLEGÓ —la cadena base64— y no sobre el JSON
 * que hay dentro. Decodificar, parsear y volver a serializar produce otra firma.
 *
 * Un error así no se ve en el typechecker ni en una revisión rápida, y en
 * producción se manifiesta como «Meta dice que el callback no cumple» sin más
 * pista. Aquí se ejercita con un secreto conocido y vectores construidos a mano.
 *
 * Las Edge Functions no se typechequean en CI —está anotado como pendiente en la
 * bitácora—, así que este fichero es además lo único que hoy ejecuta una línea de
 * `_compartido/firma.ts` antes de desplegarla.
 */

import { createHmac } from 'node:crypto'
import { cargaFirmada } from '../supabase/functions/_compartido/firma.ts'

const SECRETO = 'secreto-de-prueba-que-no-es-de-nadie'

const b64url = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Construye un signed_request como lo construye Meta. */
function firmar(carga, secreto = SECRETO) {
  const cargaB64 = b64url(JSON.stringify(carga))
  // Sobre la CADENA base64, no sobre los bytes del JSON. Es la regla entera.
  const mac = createHmac('sha256', secreto).update(cargaB64).digest()
  return `${b64url(mac)}.${cargaB64}`
}

let fallos = 0
async function comprobar(nombre, fn) {
  try {
    const ok = await fn()
    if (ok) { console.log(`  ok    ${nombre}`) }
    else { console.log(`  FALLA ${nombre}`); fallos++ }
  } catch (e) {
    console.log(`  ROMPE ${nombre}: ${e.message}`)
    fallos++
  }
}

console.log('Verificación del signed_request:')

await comprobar('una petición bien firmada se acepta', async () => {
  const c = await cargaFirmada(firmar({ algorithm: 'HMAC-SHA256', user_id: '12345' }), SECRETO)
  return c?.user_id === '12345'
})

await comprobar('firmada con OTRO secreto se rechaza', async () => {
  const sr = firmar({ algorithm: 'HMAC-SHA256', user_id: '12345' }, 'otro-secreto')
  return (await cargaFirmada(sr, SECRETO)) === null
})

await comprobar('carga manipulada tras firmar se rechaza', async () => {
  const sr = firmar({ algorithm: 'HMAC-SHA256', user_id: '12345' })
  const [firma] = sr.split('.')
  const otra = b64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '99999' }))
  return (await cargaFirmada(`${firma}.${otra}`, SECRETO)) === null
})

// El fallo clásico de JWT. Si algún día alguien «simplifica» la comprobación del
// algoritmo, este caso lo caza.
await comprobar('algorithm distinto de HMAC-SHA256 se rechaza', async () => {
  const sr = firmar({ algorithm: 'none', user_id: '12345' })
  return (await cargaFirmada(sr, SECRETO)) === null
})

await comprobar('sin punto separador se rechaza', async () =>
  (await cargaFirmada('solounacosa', SECRETO)) === null)

await comprobar('cadena vacía se rechaza', async () =>
  (await cargaFirmada('', SECRETO)) === null)

await comprobar('carga que no es JSON se rechaza', async () => {
  const cargaB64 = b64url('esto no es json')
  const mac = createHmac('sha256', SECRETO).update(cargaB64).digest()
  return (await cargaFirmada(`${b64url(mac)}.${cargaB64}`, SECRETO)) === null
})

/**
 * EL CASO QUE JUSTIFICA EL FICHERO.
 *
 * Se busca una carga cuya base64 contenga `-` o `_`, que es lo que distingue el
 * alfabeto URL-safe del estándar. Un decodificador que use `atob` a secas falla
 * aquí y solo aquí: con cargas «normales» pasa todas las demás pruebas.
 */
await comprobar('base64 url-safe con - y _ se decodifica bien', async () => {
  for (let i = 0; i < 500; i++) {
    const carga = { algorithm: 'HMAC-SHA256', user_id: `u${i}`, ruido: `??>>${i}<<~~ñ€` }
    const cargaB64 = b64url(JSON.stringify(carga))
    if (!/[-_]/.test(cargaB64)) continue
    const c = await cargaFirmada(firmar(carga), SECRETO)
    return c?.user_id === `u${i}`
  }
  throw new Error('no se logró generar una carga con - o _; la prueba no probó nada')
})

// Meta manda la base64 SIN relleno. Con relleno de más, `atob` lanza.
await comprobar('carga sin relleno `=` se acepta', async () => {
  const sr = firmar({ algorithm: 'HMAC-SHA256', user_id: 'x' })
  return !sr.includes('=') && (await cargaFirmada(sr, SECRETO))?.user_id === 'x'
})

console.log('')
if (fallos > 0) {
  console.log(`${fallos} comprobación(es) fallidas.`)
  process.exit(1)
}
console.log('La verificación del signed_request se comporta como debe.')
