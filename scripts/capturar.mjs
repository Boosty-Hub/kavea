/**
 * Verificación visual de la aplicación.
 *
 * Inicia sesión de verdad y captura las pantallas, para poder revisar cómo
 * queda en lugar de suponerlo desde el código. Un build que compila no dice
 * nada sobre si la pantalla se lee bien.
 *
 * Uso:
 *   node scripts/capturar.mjs <correo> <contraseña> [carpeta]
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [correo, clave, carpeta = 'capturas'] = process.argv.slice(2)
if (!correo || !clave) {
  console.error('uso: node scripts/capturar.mjs <correo> <clave> [carpeta]')
  process.exit(1)
}

mkdirSync(carpeta, { recursive: true })

const BASE = 'https://boosty.kavea.ai'
const ADMIN = 'https://admin.kavea.ai'

const navegador = await chromium.launch()
const ctx = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'es-ES',
})
const p = await ctx.newPage()

const errores = []
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)) })
p.on('pageerror', (e) => errores.push(`pageerror: ${String(e).slice(0, 200)}`))

async function tirar(nombre, ruta, { completa = false, espera = 1200 } = {}) {
  await p.goto(ruta, { waitUntil: 'networkidle', timeout: 45_000 })
  await p.waitForTimeout(espera)
  const destino = join(carpeta, `${nombre}.png`)
  await p.screenshot({ path: destino, fullPage: completa })
  console.log(`  ${nombre.padEnd(22)} ${p.url()}`)
  return destino
}

try {
  // Acceso
  await tirar('01-entrar', `${BASE}/entrar`)
  await p.fill('#correo', correo)
  await p.fill('#clave', clave)
  await Promise.all([
    p.waitForURL((u) => !u.pathname.includes('/entrar'), { timeout: 30_000 }).catch(() => {}),
    p.click('button[type=submit]'),
  ])
  await p.waitForTimeout(2500)
  console.log(`  sesion iniciada -> ${p.url()}`)

  // Bandeja y hilo
  await tirar('02-bandeja', `${BASE}/bandeja`)

  const primera = p.locator('a.fila').first()
  if (await primera.count()) {
    await primera.click()
    await p.waitForTimeout(2500)
    await p.screenshot({ path: join(carpeta, '03-hilo.png') })
    console.log(`  03-hilo                ${p.url()}`)
    await p.screenshot({ path: join(carpeta, '04-hilo-completo.png'), fullPage: true })
  } else {
    console.log('  (sin conversaciones en la lista)')
  }

  // Modo oscuro: el libro de marca lo cubre y casi nunca se mira.
  await ctx.close()
  const ctxOscuro = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'es-ES',
    colorScheme: 'dark',
    storageState: undefined,
  })
  const po = await ctxOscuro.newPage()
  await po.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await po.fill('#correo', correo)
  await po.fill('#clave', clave)
  await po.click('button[type=submit]')
  await po.waitForTimeout(3000)
  await po.goto(`${BASE}/bandeja`, { waitUntil: 'networkidle' })
  await po.waitForTimeout(1500)
  await po.screenshot({ path: join(carpeta, '05-bandeja-oscuro.png') })
  console.log('  05-bandeja-oscuro')

  // Panel interno
  await po.goto(`${ADMIN}/admin`, { waitUntil: 'networkidle' }).catch(() => {})
  await po.waitForTimeout(1500)
  await po.screenshot({ path: join(carpeta, '06-admin.png') })
  console.log('  06-admin')

  // Móvil: la lista tiene que ocupar la pantalla entera.
  const ctxMovil = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: 'es-ES',
    isMobile: true,
    hasTouch: true,
  })
  const pm = await ctxMovil.newPage()
  await pm.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
  await pm.fill('#correo', correo)
  await pm.fill('#clave', clave)
  await pm.click('button[type=submit]')
  await pm.waitForTimeout(3000)
  await pm.goto(`${BASE}/bandeja`, { waitUntil: 'networkidle' })
  await pm.waitForTimeout(1500)
  await pm.screenshot({ path: join(carpeta, '07-movil.png') })
  console.log('  07-movil')

  if (errores.length) {
    console.log('\n  ERRORES DE CONSOLA:')
    for (const e of [...new Set(errores)].slice(0, 10)) console.log(`    - ${e}`)
  } else {
    console.log('\n  sin errores de consola')
  }
} finally {
  await navegador.close()
}
