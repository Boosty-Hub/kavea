/**
 * Captura y GRABA la aplicación real, iniciando sesión de verdad.
 *
 * Hace dos trabajos con una sola sesión:
 *
 *   1. Revisar la interfaz mirándola. Compilar no dice nada sobre si la pantalla
 *      se lee: la última vez aparecieron cuatro defectos en la primera captura y
 *      ninguno se veía en el código.
 *   2. Grabar un vídeo por permiso para el App Review de Meta, que exige un
 *      screencast por cada permiso solicitado.
 *
 * Uso:
 *   node scripts/grabar-screencasts.mjs <correo> <contraseña> [carpeta]
 *
 * La contraseña va por argumento y NUNCA se escribe en ningún fichero ni se
 * imprime. Es el mismo contrato que `capturar.mjs`.
 *
 * POR QUÉ EL VÍDEO SALE EN .webm
 *
 * Playwright graba con su propio ffmpeg, y ese binario solo trae `libvpx`: VP8 y
 * nada más. Comprobado el 4 de agosto de 2026 listando sus encoders. Si el App
 * Review rechaza webm hay que convertir con un ffmpeg de verdad —`scoop install
 * ffmpeg`—, y por eso el script avisa al final en vez de dejarlo por descubrir el
 * día de la entrega.
 *
 * LO QUE ESTE SCRIPT NO PUEDE GRABAR, y no es por falta de código:
 *
 *   · whatsapp_business_messaging y whatsapp_business_management — se graban en
 *     el dashboard de Meta, que exige la sesión de Facebook de Gabriel.
 *   · Human Agent — no tiene pantalla propia; y su ventana cierra el 11-ago.
 *   · instagram_manage_comments — no existe la interfaz de comentarios.
 *   · pages_utility_messaging — no existe en Kavea, y está fuera de v1.
 *   · pages_messaging — necesita una conversación viva de Messenger, y no hay.
 */

import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [correo, clave, carpeta = 'screencasts'] = process.argv.slice(2)
if (!correo || !clave) {
  console.error('uso: node scripts/grabar-screencasts.mjs <correo> <clave> [carpeta]')
  process.exit(1)
}

const BASE = 'https://boosty.kavea.ai'
const ADMIN = 'https://admin.kavea.ai'

mkdirSync(carpeta, { recursive: true })
const dirVideo = join(carpeta, 'video')
mkdirSync(dirVideo, { recursive: true })

const navegador = await chromium.launch()

/**
 * El login NO se hace por selectores adivinados.
 *
 * Se busca el campo por su tipo —`email` y `password` son semánticos y no
 * dependen de cómo se llamen las clases— y si no aparece, el script imprime qué
 * campos SÍ hay en la página. Un fallo de login que dice «timeout esperando
 * #correo» obliga a abrir el navegador a mano; uno que dice qué encontró se
 * arregla en un intento.
 */
async function entrar(ctx) {
  const p = await ctx.newPage()
  await p.goto(`${BASE}/entrar`, { waitUntil: 'networkidle', timeout: 45_000 })

  const email = p.locator('input[type="email"], input[name*="correo" i], input[name*="email" i]').first()
  const pass = p.locator('input[type="password"]').first()

  if ((await email.count()) === 0 || (await pass.count()) === 0) {
    const campos = await p.locator('input').evaluateAll((ns) =>
      ns.map((n) => ({ type: n.getAttribute('type'), name: n.getAttribute('name'), id: n.id })))
    console.error('No encuentro el formulario. Campos en la página:', JSON.stringify(campos))
    throw new Error('formulario de acceso no reconocido')
  }

  await email.fill(correo)
  await pass.fill(clave)
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 45_000 }),
    pass.press('Enter'),
  ])
  console.log(`  sesión iniciada, aterrizó en ${new URL(p.url()).pathname}`)
  return p
}

/** Un vídeo por permiso. El nombre del fichero ES el permiso, para no confundirlos al subirlos. */
async function grabar(permiso, recorrido) {
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: dirVideo, size: { width: 1440, height: 900 } },
    locale: 'es-ES',
    timezoneId: 'America/Caracas',
  })
  const errores = []
  ctx.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)) })

  const p = await entrar(ctx)
  try {
    await recorrido(p)
  } finally {
    // El vídeo se escribe AL CERRAR el contexto, no antes: sin este close el
    // fichero queda de cero bytes.
    await ctx.close()
  }

  // Playwright nombra el fichero con un hash. Se renombra al permiso.
  const recientes = readdirSync(dirVideo)
    .filter((f) => f.endsWith('.webm') && !f.includes('__'))
    .map((f) => ({ f, t: statSync(join(dirVideo, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  if (recientes[0]) {
    const destino = `${permiso}__${recientes[0].f}`
    renameSync(join(dirVideo, recientes[0].f), join(dirVideo, destino))
    const kb = Math.round(statSync(join(dirVideo, destino)).size / 1024)
    console.log(`  ${permiso.padEnd(28)} ${kb} KB`)
  } else {
    console.log(`  ${permiso.padEnd(28)} SIN VÍDEO`)
  }
  if (errores.length) console.log(`     errores de consola: ${errores.slice(0, 3).join(' | ')}`)
}

/** Pausas generosas a propósito: un revisor tiene que poder leer la pantalla. */
async function ver(p, url, ms = 3200) {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })
  await p.waitForTimeout(ms)
}

// ---------------------------------------------------------------- los seis vídeos
console.log('\nGrabando:')

await grabar('pages_show_list', async (p) => {
  await ver(p, `${ADMIN}/admin/portafolio`, 4200)
  // Se desplaza para que se vean varias de las 28 Páginas, no solo las primeras.
  await p.mouse.wheel(0, 700); await p.waitForTimeout(1800)
  await p.mouse.wheel(0, 700); await p.waitForTimeout(1800)
})

await grabar('business_management', async (p) => {
  await ver(p, `${ADMIN}/admin/portafolio`, 3600)
  await ver(p, `${ADMIN}/admin/espacios`, 3600)
})

await grabar('pages_read_engagement', async (p) => {
  await ver(p, `${ADMIN}/admin/portafolio`, 4200)
  await p.mouse.wheel(0, 500); await p.waitForTimeout(2200)
})

await grabar('pages_manage_metadata', async (p) => {
  await ver(p, `${BASE}/ajustes/canales`, 4800)
})

await grabar('instagram_basic', async (p) => {
  await ver(p, `${BASE}/bandeja`, 4200)
})

await grabar('instagram_manage_messages', async (p) => {
  await ver(p, `${BASE}/bandeja`, 2600)
  // Abre el primer hilo de la lista. Sin `first()`, un locator con varias
  // coincidencias lanza en modo estricto.
  const hilo = p.locator('a[href^="/bandeja/"]').first()
  if (await hilo.count()) {
    await hilo.click()
    await p.waitForTimeout(4200)
  } else {
    console.log('     no hay hilos en la bandeja: el vídeo queda sin conversación')
  }
})

// ------------------------------------------------- revisión visual del sidebar
console.log('\nRevisando el sidebar:')

const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' })
const p = await entrar(ctx)

async function foto(nombre, url, { movil = false, oscuro = false } = {}) {
  if (movil) await p.setViewportSize({ width: 390, height: 844 })
  else await p.setViewportSize({ width: 1440, height: 900 })
  await p.emulateMedia({ colorScheme: oscuro ? 'dark' : 'light' })
  await p.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })
  await p.waitForTimeout(900)
  await p.screenshot({ path: join(carpeta, `${nombre}.png`) })
  const menu = p.locator('nav[aria-label="Módulos"], nav[aria-label="Panel interno"]').first()
  const caja = (await menu.count()) ? await menu.boundingBox() : null
  console.log(`  ${nombre.padEnd(30)} menú ${caja ? `${Math.round(caja.width)}px de ancho` : 'AUSENTE'}`)
}

await foto('sidebar-bandeja', `${BASE}/bandeja`)
await foto('sidebar-bandeja-oscuro', `${BASE}/bandeja`, { oscuro: true })
await foto('sidebar-bandeja-movil', `${BASE}/bandeja`, { movil: true })
await foto('sidebar-ajustes', `${BASE}/ajustes/canales`)
await foto('sidebar-admin', `${ADMIN}/admin`)
// En /entrar NO debe haber menú: es la comprobación negativa.
await foto('entrar-sin-menu', `${BASE}/entrar`)

// Colapsado, que es la mitad del requisito y lo que hay que ver de verdad.
await p.setViewportSize({ width: 1440, height: 900 })
await p.emulateMedia({ colorScheme: 'light' })
await p.goto(`${BASE}/bandeja`, { waitUntil: 'networkidle' })
const boton = p.locator('nav button[aria-expanded]').first()
if (await boton.count()) {
  await boton.click()
  await p.waitForTimeout(700)
  await p.screenshot({ path: join(carpeta, 'sidebar-colapsado.png') })
  const caja = await p.locator('nav[aria-label="Módulos"]').first().boundingBox()
  console.log(`  sidebar-colapsado               menú ${Math.round(caja?.width ?? 0)}px de ancho`)
  // Y que la preferencia sobreviva a un recargado, que es para lo que existe.
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const tras = await p.locator('nav[aria-label="Módulos"]').first().boundingBox()
  console.log(`  tras recargar                   menú ${Math.round(tras?.width ?? 0)}px — ${Math.round(tras?.width ?? 0) < 100 ? 'la preferencia PERSISTE' : 'la preferencia SE PERDIÓ'}`)
} else {
  console.log('  NO ENCUENTRO el botón de colapsar')
}

await ctx.close()
await navegador.close()

console.log(`\nCapturas en ${carpeta}/ y vídeos en ${dirVideo}/`)
console.log('Los vídeos son .webm (VP8). Si el App Review los rechaza: scoop install ffmpeg.')
