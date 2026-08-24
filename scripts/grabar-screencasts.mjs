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
 * LO QUE ESTE SCRIPT NO PUEDE GRABAR, y hay que hacer a mano:
 *
 *   · EL LOGIN DE META Y LA PANTALLA DE CONSENTIMIENTO. Existen desde el 24-ago
 *     —Facebook Login for Business, en `/ajustes/canales` → Conectar—, que es
 *     justo lo que hundió los ocho vídeos del 7-ago. Pero completar el diálogo
 *     pide credenciales de Facebook en el navegador, y eso no lo automatiza un
 *     runner ni debe intentarlo.
 *   · EL CLIENTE NATIVO. Cuatro notas de rechazo piden ver el resultado en
 *     Messenger, Instagram o WhatsApp. Eso es un teléfono en la mano.
 *
 * REVISADO EL 24-AGO, y tres guiones estaban grabando la pantalla equivocada:
 * `instagram_manage_comments` apuntaba a `/comentarios`, que dejó de existir el
 * 21-ago; `pages_read_engagement` grababa la lista del portafolio en vez de
 * contenido de la Página; `instagram_basic` grababa la bandeja en vez del perfil.
 * Los tres se rechazaron, y ahora se entiende por qué.
 *
 * ESTE SCRIPT GRABA CONTRA PRODUCCIÓN. Las pantallas nuevas tienen que estar
 * desplegadas antes de grabar, o el vídeo enseña un 404 con mucha calma.
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
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
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

/**
 * LA CARPETA SE VACÍA ANTES DE GRABAR, y no es limpieza: es evitar subir el
 * vídeo equivocado.
 *
 * Playwright nombra con un hash y este script le pone el permiso delante, así
 * que tras dos tiradas quedan DOS ficheros por permiso con el mismo prefijo y
 * distinto hash. El 24-ago convivían el `instagram_basic` del 6-ago —197 KB, la
 * bandeja, rechazado— con el nuevo de 2 MB. Elegir bien al subirlos dependía de
 * mirar la fecha de doce ficheros.
 *
 * Se mueve, no se borra: una tirada que sale mal no debe destruir la anterior.
 */
if (readdirSync(carpeta).includes('video')) {
  const previo = join(carpeta, 'video-anterior')
  rmSync(previo, { recursive: true, force: true })
  renameSync(dirVideo, previo)
  console.log('Los vídeos de la tirada anterior están en video-anterior/')
}
mkdirSync(dirVideo, { recursive: true })

/** Los hitos: un PNG por momento que justifica el permiso. Ver `hito()`. */
const dirHitos = join(carpeta, 'hitos')
rmSync(dirHitos, { recursive: true, force: true })
mkdirSync(dirHitos, { recursive: true })

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

/**
 * Un PNG del momento que justifica el permiso.
 *
 * POR QUÉ, si ya hay vídeo: porque un vídeo no se puede revisar de un vistazo y
 * `ffmpeg` no está instalado, así que no hay forma de sacar un fotograma después.
 * El 24-ago tres guiones llevaban semanas grabando la pantalla equivocada
 * —`/comentarios`, que ya no existe— y nadie lo vio porque el fichero salía, con
 * su tamaño razonable. Un artefacto que se produce siempre parece que funcionó.
 *
 * Con esto, revisar una tirada es mirar una carpeta de imágenes en vez de ver
 * doce vídeos, y el vídeo equivocado se nota antes de subirlo.
 */
let nHito = 0
async function hito(p, permiso, momento) {
  nHito += 1
  const nombre = `${String(nHito).padStart(2, '0')}-${permiso}-${momento}.png`
  await p.screenshot({ path: join(dirHitos, nombre) }).catch(() => {})
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
// Un `if` sin `else` deja de grabar un permiso SIN DECIRLO: la tirada del
// 24-ago sacó once vídeos y nadie notó que faltaba el duodécimo hasta contarlos.
if (!TARJETA_WA) {
  console.log('  human_agent'.padEnd(30) + 'OMITIDO: falta TARJETA_WHATSAPP')
}
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
  // La lista vive en la Bandeja desde el 21-ago. `/comentarios` ya no existe, y
  // este guion apuntaba ahi: grababa un 404 y nadie lo miro antes de subirlo.
  await ver(p, `${BASE}/bandeja?vista=comentarios`, 3000)

  const hilo = p.locator('a[href*="/bandeja/comentario/"]').first()
  if (!(await hilo.count())) {
    console.log('     no hay comentarios: el vídeo queda vacío')
    return
  }
  await hilo.click()
  await p.waitForTimeout(2200)

  // Traer de Meta ANTES de nada. Sin este clic el vídeo enseña una tabla, y una
  // tabla no prueba que el permiso se use.
  const traer = p.getByRole('button', { name: /traer de meta/i }).first()
  if (await traer.count()) {
    await traer.click()
    await p.waitForTimeout(6000)
  }

  // 1. AÑADIR. «add a comment from your app».
  const caja = p.locator('textarea[aria-label*="Respuesta"]').first()
  await caja.click()
  await caja.pressSequentially(
    'Gracias por comentar. Le escribimos por mensaje directo con el detalle.', { delay: 45 },
  )
  await p.waitForTimeout(1400)
  await p.getByRole('button', { name: /^publicar$/i }).first().click()
  await p.waitForTimeout(9000)
  await hito(p, 'instagram_manage_comments', '1-publicado')

  // 2. EDITAR. Instagram no deja cambiar el texto, así que Kavea publica el
  //    nuevo y borra el anterior; la pantalla lo dice y el aviso sale en cámara,
  //    que es lo que evita que el revisor lea el cambio de id como un truco.
  const editar = p.getByRole('button', { name: /^editar$/i }).last()
  if (!(await editar.count())) {
    console.log('     no salió el botón de editar: la respuesta no se guardó')
    return
  }
  await editar.click()
  await p.waitForTimeout(2600)
  const nueva = p.locator('textarea[aria-label*="Texto nuevo"]').first()
  await nueva.click()
  await nueva.fill('')
  await nueva.pressSequentially(
    'Gracias por comentar. Ya le hemos escrito por mensaje directo.', { delay: 45 },
  )
  await p.waitForTimeout(1600)
  await p.getByRole('button', { name: /publicar el cambio/i }).click()
  await p.waitForTimeout(10000)
  await hito(p, 'instagram_manage_comments', '2-editado')

  // 3. BORRAR, con la confirmación a la vista.
  const borrar = p.getByRole('button', { name: /^borrar$/i }).last()
  if (await borrar.count()) {
    await borrar.click()
    await p.waitForTimeout(2400)
    await p.getByRole('button', { name: /borrar de verdad/i }).click()
    await p.waitForTimeout(9000)
    await hito(p, 'instagram_manage_comments', '3-borrado')
  }
  // El estado final se queda en pantalla: tachado y «borrado de Instagram». El
  // revisor tiene que abrir el cliente nativo justo después, y eso lo hace una
  // persona.
  await p.waitForTimeout(3000)
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

/**
 * Contenido de la Página, que es lo que la nota pide y el portafolio no era.
 *
 * El guion anterior grababa `/admin/portafolio` con scroll: una lista de Páginas.
 * La nota pide «(1) Page selection, (2) the retrieval of Page content such as
 * posts, photos, events, and (3) the rendered results in your app UI with the
 * Page identity visibly displayed». Una lista de nombres no es ninguna de las
 * tres. `/contenido` sí: se elige, se lee en vivo de Graph y se pinta con el
 * nombre, la categoría, los seguidores y el ID de la Página en la cabecera.
 */
await grabar('pages_read_engagement', async (p) => {
  await ver(p, `${BASE}/contenido`, 3800)
  await p.locator('li.tarjeta a').first().click()
  // Cuatro llamadas a Graph en paralelo. Se le da aire para que el vídeo enseñe
  // el resultado y no la espera.
  await p.waitForTimeout(9000)
  await hito(p, 'pages_read_engagement', 'identidad-y-contenido')
  await p.mouse.wheel(0, 700); await p.waitForTimeout(2600)
  await p.mouse.wheel(0, 900); await p.waitForTimeout(2600)
  await hito(p, 'pages_read_engagement', 'publicaciones-y-fotos')
  await p.mouse.wheel(0, 900); await p.waitForTimeout(3000)
})

/**
 * Dónde Kavea suscribe la Página a los eventos, y un evento de esa misma Página.
 *
 * La nota pide las dos cosas atadas: «(1) where your app subscribes to Page
 * events or updates Page settings, and (2) a sample webhook event (for example, a
 * new comment notification) arriving in your app, tied to the same Page shown
 * during setup». El guion anterior solo enseñaba la pantalla de canales, que es
 * la mitad de (1) y ninguna parte de (2).
 */
await grabar('pages_manage_metadata', async (p) => {
  await ver(p, `${BASE}/ajustes/canales`, 3000)
  // La tarjeta del canal abre el modal con las conexiones y sus campos suscritos.
  const tarjeta = p.getByRole('button', { name: /messenger/i }).first()
  if (await tarjeta.count()) {
    await tarjeta.click()
    await p.waitForTimeout(5000)
    await p.mouse.wheel(0, 500); await p.waitForTimeout(3000)
    await hito(p, 'pages_manage_metadata', 'suscripcion-de-la-pagina')
    await p.keyboard.press('Escape').catch(() => {})
    await p.waitForTimeout(900)
  }
  // Y el evento de esa misma Página, ya dentro: la bandeja con lo que entró.
  await ver(p, `${BASE}/bandeja`, 4200)
  const hilo = p.locator('a[href^="/bandeja/"]').first()
  if (await hilo.count()) {
    await hilo.click(); await p.waitForTimeout(4500)
    await hito(p, 'pages_manage_metadata', 'evento-de-esa-pagina')
  }
})

/**
 * El perfil de Instagram con su handle, su ID y su lista de medios.
 *
 * El guion anterior grababa `/bandeja`, que es mensajería y no tiene nada de lo
 * que la nota nombra: «(1) the selected Instagram professional account with its
 * handle or ID visible, (2) a sample of profile fields (name, bio, followers,
 * etc.), and (3) a media list displayed in your app UI labeled for that
 * account». Las tres están en la pestaña de Instagram de `/contenido`, y el
 * encabezado de la lista dice literalmente «Publicaciones de @handle».
 */
await grabar('instagram_basic', async (p) => {
  await ver(p, `${BASE}/contenido`, 3200)
  await p.locator('li.tarjeta a').first().click()
  await p.waitForTimeout(7000)
  const pestana = p.getByRole('button', { name: /^instagram$/i }).first()
  if (!(await pestana.count())) {
    console.log('     esa conexión no tiene Instagram vinculado')
    return
  }
  await pestana.click()
  await p.waitForTimeout(9000)
  await hito(p, 'instagram_basic', 'handle-id-y-campos')
  await p.mouse.wheel(0, 600); await p.waitForTimeout(2800)
  await hito(p, 'instagram_basic', 'lista-de-medios')
  await p.mouse.wheel(0, 900); await p.waitForTimeout(3200)
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
