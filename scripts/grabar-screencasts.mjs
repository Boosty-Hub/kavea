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
 * LO QUE ESTE SCRIPT NO PUEDE GRABAR: nada, desde el 6 de agosto de 2026. Los
 * doce permisos que necesitan vídeo tienen recorrido.
 *
 * LO QUE SÍ SE PUEDE DESDE EL 6 DE AGOSTO, y antes no:
 *
 * `whatsapp_business_messaging` decía aquí que había que grabarlo en el
 * dashboard de Meta. Era cierto mientras el compositor no pudo mandar un
 * WhatsApp —la 0073 arregló que `encolar_envio` calculaba la partición desde
 * `page_id`, que en WhatsApp es null—, y grabar el dashboard de Meta es enseñar
 * la herramienta de Meta, no el producto. Ahora se graba Kavea haciéndolo, que
 * es lo que el revisor pide de verdad.
 *
 * `Human Agent` decía que no tiene pantalla propia. Sí la tiene, y es mejor que
 * una pantalla propia: la cabecera del hilo pinta «solo intervención humana»
 * cuando la conversación pasó de 24 h, y el compositor deja responder porque
 * `ventana_de` devuelve el tag. Eso ES la feature, vista por el operador. La
 * 0074 arregló además que en Instagram salía el tag sin `messaging_type`.
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

/**
 * La sesión se abre UNA VEZ y fuera de cualquier grabación.
 *
 * Antes cada vídeo empezaba iniciando sesión, y el resultado eran DIECISIETE
 * SEGUNDOS de pantalla en blanco y formulario de acceso antes de que apareciera
 * nada. El revisor no tiene por qué ver eso, y en un vídeo corto es la mayor
 * parte del metraje.
 *
 * Se guarda el estado —cookies y almacenamiento— y cada contexto de grabación
 * nace ya dentro. De paso son nueve inicios de sesión menos.
 */
let estadoSesion = null
async function sesion() {
  if (estadoSesion) return estadoSesion
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' })
  await entrar(ctx)
  estadoSesion = await ctx.storageState()
  await ctx.close()
  return estadoSesion
}

/** Un vídeo por permiso. El nombre del fichero ES el permiso, para no confundirlos al subirlos. */
async function grabar(permiso, recorrido) {
  const estado = await sesion()
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: dirVideo, size: { width: 1440, height: 900 } },
    locale: 'es-ES',
    timezoneId: 'America/Caracas',
    storageState: estado,
  })
  const errores = []
  ctx.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 160)) })

  const p = await ctx.newPage()
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

// ---------------------------------------------------------------- los vídeos
console.log('\nGrabando:')

/**
 * La tarjeta con la conversación viva de WhatsApp.
 *
 * Va por parámetro y no fija en el código: la ventana de 24 h se cierra, y el
 * día que se cierre hay que grabar otra conversación, no editar el script. Si no
 * se pasa, el vídeo de WhatsApp se salta y se dice por qué en vez de grabar una
 * pantalla vacía y descubrirlo al subirla.
 */
const TARJETA_WA = process.env.TARJETA_WHATSAPP ?? ''

/** La tarjeta con la conversación viva de Messenger. Misma regla que la de WhatsApp. */
const TARJETA_MSG = process.env.TARJETA_MESSENGER ?? ''

/**
 * ESTE VÍDEO MANDA UN MENSAJE DE VERDAD.
 *
 * Es el único del script que escribe hacia fuera, y es a propósito: un vídeo del
 * compositor sin pulsar enviar no demuestra el permiso, demuestra una caja de
 * texto. El destinatario es el número que tenga esa conversación abierta.
 *
 * Requiere ventana de 24 h abierta. Si está cerrada, Kavea rechaza el envío por
 * su propia comprobación —que es correcto— y el vídeo saldría enseñando un
 * error, así que conviene mirar la ventana antes de grabar.
 */
if (TARJETA_WA) {
  await grabar('whatsapp_business_messaging', async (p) => {
    // Primero la bandeja entera: el revisor tiene que ver que esto es un
    // producto con varias conversaciones, no una pantalla de demostración.
    await ver(p, `${BASE}/bandeja`, 3000)

    await ver(p, `${BASE}/bandeja/${TARJETA_WA}`, 3200)

    // EL RATÓN SE PONE ENCIMA DEL HILO ANTES DE GIRAR LA RUEDA.
    //
    // `mouse.wheel` desplaza lo que haya bajo el cursor, y el cursor arranca en
    // (0,0), que es la barra lateral. La primera versión creía estar recorriendo
    // la conversación y estaba moviendo el menú.
    const hilo = p.locator('.hilo__cuerpo').first()
    const caja0 = await hilo.boundingBox()
    if (caja0) await p.mouse.move(caja0.x + caja0.width / 2, caja0.y + caja0.height / 2)

    // Subir a ver los mensajes ENTRANTES del cliente: sin esto el vídeo prueba
    // que Kavea escribe, no que conversa.
    await p.mouse.wheel(0, -700); await p.waitForTimeout(2200)
    await p.mouse.wheel(0, 700); await p.waitForTimeout(1500)

    const caja = p.locator('textarea[aria-label="Mensaje"]').first()
    if (!(await caja.count())) {
      console.log('     no encuentro el compositor: el vídeo queda sin envío')
      return
    }

    // Se escribe con retardo por tecla para que en el vídeo se vea ESCRIBIR. Un
    // `fill` pone el texto de golpe y parece un pegado automático.
    await caja.click()
    await caja.pressSequentially('Hola, gracias por escribirnos. Le respondemos desde Kavea.', { delay: 55 })
    await p.waitForTimeout(1200)

    const enviar = p.locator('button[type="submit"]').first()
    await enviar.click()

    // NO se desplaza a mano después de enviar, y es a propósito.
    //
    // La aplicación baja sola al fondo al pulsar enviar: el compositor avisa con
    // `kavea:al-fondo` y `AlFinal` obedece. Bajar aquí con la rueda taparía si
    // eso dejara de funcionar, y el vídeo enseñaría una conversación que se
    // comporta bien solo porque el guion la empuja.
    //
    // La espera es larga porque el compositor refresca a los 2,5 s y el
    // despachador se despierta por `/api/despachar`: da tiempo a que el mensaje
    // salga de verdad y no solo a que aparezca en la lista.
    await p.waitForTimeout(9000)
  })
} else {
  console.log('  whatsapp_business_messaging  OMITIDO: falta TARJETA_WHATSAPP')
}

/**
 * Human Agent, en la misma tarjeta pero por el canal de Instagram.
 *
 * LA FEATURE SE VE SIN NARRARLA. Al elegir Instagram, cuya conversación pasó de
 * las 24 h, la cabecera dice «solo intervención humana» y el compositor pinta el
 * aviso literal: «Fuera de las 24 horas. Se enviará como intervención humana, y
 * solo vale hasta los 7 días». El revisor lee en pantalla la política que la
 * feature exige, y luego ve el envío salir bajo ella.
 *
 * Solo vale entre las 24 h y los 7 días desde el último mensaje ENTRANTE. Fuera
 * de ese tramo el compositor cierra —correctamente— y el vídeo enseñaría un
 * canal bloqueado, así que conviene mirar la ventana antes de grabar.
 */
if (TARJETA_WA) {
  await grabar('human_agent', async (p) => {
    await ver(p, `${BASE}/bandeja/${TARJETA_WA}`, 3000)

    const chip = p.locator('button.canal-chip', { hasText: 'Instagram' }).first()
    if (!(await chip.count())) {
      console.log('     no encuentro el selector de canal: el vídeo queda sin Human Agent')
      return
    }
    await chip.click()
    // Pausa larga a propósito: este es el fotograma que justifica el permiso.
    // El aviso de la ventana tiene que dar tiempo a leerse entero.
    await p.waitForTimeout(4500)

    const caja = p.locator('textarea[aria-label="Mensaje"]').first()
    await caja.click()
    await caja.pressSequentially(
      'Retomamos su consulta. Le atiende una persona del equipo.', { delay: 55 },
    )
    await p.waitForTimeout(1200)
    await p.locator('button[type="submit"]').first().click()
    await p.waitForTimeout(9000)
  })
}

/**
 * Messenger: recibir y responder desde la bandeja compartida.
 *
 * Idéntico al de WhatsApp a propósito. El revisor de `pages_messaging` quiere ver
 * exactamente esto —una conversación de Messenger entrando y una respuesta
 * saliendo desde el producto— y no un recorrido distinto que le obligue a
 * traducir. Lo único que cambia es la conversación.
 */
if (TARJETA_MSG) {
  await grabar('pages_messaging', async (p) => {
    await ver(p, `${BASE}/bandeja`, 3000)
    await ver(p, `${BASE}/bandeja/${TARJETA_MSG}`, 3200)

    const hilo = p.locator('.hilo__cuerpo').first()
    const caja0 = await hilo.boundingBox()
    if (caja0) await p.mouse.move(caja0.x + caja0.width / 2, caja0.y + caja0.height / 2)
    await p.mouse.wheel(0, -600); await p.waitForTimeout(1800)
    await p.mouse.wheel(0, 600); await p.waitForTimeout(1500)

    const caja = p.locator('textarea[aria-label="Mensaje"]').first()
    if (!(await caja.count())) {
      console.log('     no encuentro el compositor: el vídeo queda sin envío')
      return
    }
    await caja.click()
    await caja.pressSequentially(
      'Hola, gracias por escribirnos por Messenger. Le atiende el equipo de Boosty.',
      { delay: 55 },
    )
    await p.waitForTimeout(1200)
    await p.locator('button[type="submit"]').first().click()
    await p.waitForTimeout(9000)
  })
} else {
  console.log('  pages_messaging              OMITIDO: falta TARJETA_MESSENGER')
}

/**
 * Comentarios de Instagram: leerlos y responder en público.
 *
 * El recorrido pulsa «Traer de Meta» ANTES de enseñar la lista, aunque los
 * comentarios ya estén en la base. Es lo que demuestra la lectura: sin ese clic
 * el vídeo enseña una tabla, y una tabla no prueba que el permiso se use.
 *
 * Después responde a uno de verdad. La respuesta se publica en Instagram y queda
 * colgando del comentario, que es exactamente lo que concede el permiso.
 */
await grabar('instagram_manage_comments', async (p) => {
  await ver(p, `${BASE}/comentarios`, 3500)

  const traer = p.getByRole('button', { name: /traer de meta/i }).first()
  if (await traer.count()) {
    await traer.click()
    await p.waitForTimeout(5000)
  }

  // Responder al primero que siga en «nuevo».
  const responder = p.getByRole('button', { name: /responder en público/i }).first()
  if (!(await responder.count())) {
    console.log('     no hay comentarios sin responder: el vídeo queda solo con la lectura')
    return
  }
  await responder.click()
  await p.waitForTimeout(1200)

  const caja = p.locator('textarea[aria-label="Respuesta al comentario"]').first()
  await caja.click()
  await caja.pressSequentially(
    'Gracias por comentar. Le escribimos por mensaje directo con el detalle.', { delay: 50 },
  )
  await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /publicar respuesta/i }).click()
  await p.waitForTimeout(8000)
})

// Los canales, con su marca y si están activos. Es la pantalla que enseña que
// Kavea LEE los activos de la WhatsApp Business Account del cliente, que es
// exactamente lo que concede este permiso.
await grabar('whatsapp_business_management', async (p) => {
  await ver(p, `${BASE}/ajustes/canales`, 5000)
  await p.mouse.wheel(0, 400); await p.waitForTimeout(2500)
})

/**
 * Plantillas de utilidad de Messenger.
 *
 * La pantalla lee de Meta EN VIVO al abrirse, así que el vídeo no enseña una
 * lista guardada: enseña la respuesta de la Graph API pintada. Por eso la pausa
 * inicial es larga —hay una ida y vuelta a Meta antes de que aparezca nada— y
 * por eso conviene que haya al menos una plantilla aprobada y una rechazada: la
 * columna de estado solo significa algo si tiene dos valores distintos.
 */
await grabar('pages_utility_messaging', async (p) => {
  await ver(p, `${BASE}/ajustes/plantillas`, 3000)

  // Hasta el final de la página, que es donde vive la sección.
  const seccion = p.getByRole('heading', { name: /utilidad/i }).first()
  if (await seccion.count()) {
    await seccion.scrollIntoViewIfNeeded()
  } else {
    await p.mouse.wheel(0, 1200)
  }
  // La lista tarda: la pantalla pregunta a Meta al montarse.
  await p.waitForTimeout(5000)

  // Y el formulario, que es la mitad que demuestra «manage»: no solo leer.
  const nueva = p.getByRole('button', { name: /nueva plantilla de utilidad/i }).first()
  if (await nueva.count()) {
    await nueva.click()
    await p.waitForTimeout(1500)
    /**
     * EL NOMBRE LLEVA MARCA DE TIEMPO, y no es cosmética.
     *
     * Meta rechaza una plantilla cuyo nombre ya existe en la Página, así que la
     * segunda grabación devolvía 502 y el vídeo enseñaba un error. Un guion que
     * solo funciona la primera vez no es un guion: es una casualidad.
     */
    const sufijo = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '')
    await p.getByPlaceholder('aviso_de_pedido').fill(`recordatorio_de_cita_${sufijo}`)
    await p.waitForTimeout(800)
    await p.getByPlaceholder(/Hola \{\{1\}\}/).fill(
      'Hola {{1}}, le recordamos su cita del {{2}}. Si no puede asistir, respondanos por aqui.',
    )
    // Los campos de ejemplo aparecen SOLOS al detectar los huecos. Que se vea:
    // es la parte que explica por qué Meta rechaza una plantilla sin ellos.
    await p.waitForTimeout(2500)
    const ej = p.locator('form input.campo')
    await ej.nth(1).fill('Maria')
    await ej.nth(2).fill('martes 11 a las 10:00')
    await p.waitForTimeout(1200)

    // Y se envía de verdad. Un formulario relleno sin pulsar no demuestra el
    // permiso: la plantilla tiene que aparecer en la lista con el estado que
    // Meta le haya dado, que es lo que este permiso concede.
    await p.getByRole('button', { name: /crear y enviar a meta/i }).click()
    await p.waitForTimeout(7000)
  }
})

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
