/**
 * Monta los vídeos finales del App Review pegando las tomas en orden.
 *
 * POR QUÉ EXISTE ESTE PASO
 *
 * Meta pide cinco cosas en CADA screencast, y las dos primeras son «the complete
 * Meta login flow» y «a user granting app access». Los ocho vídeos del 7-ago se
 * rechazaron por no tenerlas. Grabar el login ocho veces es absurdo: se graba una
 * vez y se pega delante de los ocho, que es lo que hace este script.
 *
 * Y hay tres notas de rechazo que piden además «the delivered message in the
 * native client» —Messenger, Instagram, WhatsApp—. Eso no lo puede grabar un
 * runner: vive en otro navegador y con otra sesión. Esas tomas las hace una
 * persona y entran aquí como ficheros.
 *
 * QUÉ ESPERA ENCONTRAR, en `screencasts/manuales/`:
 *
 *   login.mp4              ← el diálogo de Meta completo. OBLIGATORIO.
 *   messenger.mp4          ← envío desde Kavea + llegada en Messenger
 *   instagram.mp4          ← envío desde Kavea + llegada en Instagram
 *   plantilla.mp4          ← plantillas de utilidad de la PÁGINA en Messenger
 *                            —que es lo que pide `pages_utility_messaging`— y detrás
 *                            las de WhatsApp como contexto. Lleva un rótulo delante de
 *                            cada mitad: el revisor ve cambiar de canal y nada se lo
 *                            explicaría.
 *   comentarios-nativo.mp4 ← la publicación en Instagram sin el comentario borrado
 *
 * Y en `screencasts/video/`, lo que grabó `grabar-screencasts.mjs`.
 *
 * POR QUÉ SE NORMALIZA ANTES DE PEGAR. `concat` exige que todos los trozos
 * tengan el mismo códec, tamaño, fps y pista de audio. Los vídeos de Playwright
 * son VP8 1440x900 a 25 fps y SIN AUDIO; una grabación de pantalla es H.264 a la
 * resolución del monitor y con audio. Pegarlos en crudo produce un fichero que
 * algunos reproductores abren y otros no, y el reproductor del revisor de Meta
 * es justo el que no se puede probar. Así que todo pasa por 1440x900, 25 fps,
 * H.264 y una pista de audio silenciosa.
 *
 * NO INVENTA VÍDEOS A MEDIAS. Si a un permiso le falta una toma, no se monta y
 * se dice cuál falta. Un vídeo incompleto con el nombre correcto es lo que se
 * sube sin mirar.
 *
 * Uso:
 *   node scripts/montar-screencasts.mjs [carpeta]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const carpeta = process.argv[2] ?? 'screencasts'
const dirVideo = join(carpeta, 'video')
const dirManual = join(carpeta, 'manuales')
const dirTrabajo = join(carpeta, 'trabajo')
const dirEntrega = join(carpeta, 'entrega')

const ANCHO = 1440
const ALTO = 900
const FPS = 25

/**
 * La receta de cada permiso rechazado, en orden de reproducción.
 *
 * `auto` es lo que grabó el runner; `manual`, lo que grabó una persona. El orden
 * de la lista ES el orden del vídeo: el login primero siempre, porque es el
 * requisito que hundió los ocho.
 */
const RECETAS = {
  human_agent: ['login', 'auto:human_agent'],
  pages_read_engagement: ['login', 'auto:pages_read_engagement'],
  instagram_basic: ['login', 'auto:instagram_basic'],
  pages_manage_metadata: ['login', 'auto:pages_manage_metadata'],
  // El ciclo completo y luego el cliente nativo, que es literalmente lo que la
  // nota pide: «Then, open the native client to confirm the final state».
  instagram_manage_comments: ['login', 'auto:instagram_manage_comments', 'manual:comentarios-nativo'],
  pages_messaging: ['login', 'manual:messenger'],
  instagram_manage_messages: ['login', 'manual:instagram'],
  pages_utility_messaging: ['login', 'manual:plantilla'],
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

/** El fichero del runner para un permiso. Playwright le pone un hash detrás. */
function autoDe(permiso) {
  if (!existsSync(dirVideo)) return null
  const f = readdirSync(dirVideo).find((x) => x.startsWith(`${permiso}__`) && x.endsWith('.webm'))
  return f ? join(dirVideo, f) : null
}

/** Una toma humana, aceptando las extensiones que sacan los grabadores de pantalla. */
function manualDe(nombre) {
  if (!existsSync(dirManual)) return null
  const f = readdirSync(dirManual).find((x) => {
    const base = x.replace(/\.[^.]+$/, '').toLowerCase()
    return base === nombre.toLowerCase() && /\.(mp4|mov|mkv|webm|avi)$/i.test(x)
  })
  return f ? join(dirManual, f) : null
}

function resolverTrozo(clave) {
  if (clave === 'login') return { etiqueta: 'login.mp4', ruta: manualDe('login') }
  const [tipo, nombre] = clave.split(':')
  return tipo === 'auto'
    ? { etiqueta: `video/${nombre}`, ruta: autoDe(nombre) }
    : { etiqueta: `manuales/${nombre}`, ruta: manualDe(nombre) }
}

/**
 * Normaliza un trozo: mismo tamaño, mismo fps, H.264 y audio silencioso.
 *
 * `scale` con `force_original_aspect_ratio=decrease` y luego `pad` en vez de
 * estirar: una grabación de pantalla de 1920x1080 estirada a 1440x900 deforma el
 * texto, y lo que el revisor tiene que hacer con este vídeo es LEER.
 */
function normalizar(entrada, salida) {
  ffmpeg([
    '-i', entrada,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-shortest',
    '-vf', `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=decrease,` +
           `pad=${ANCHO}:${ALTO}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '96k',
    '-map', '0:v:0', '-map', '1:a:0',
    salida,
  ])
}

function duracion(f) {
  const s = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f,
  ]).toString().trim()
  return Number.parseFloat(s) || 0
}

// ---------------------------------------------------------------------------

rmSync(dirTrabajo, { recursive: true, force: true })
mkdirSync(dirTrabajo, { recursive: true })
mkdirSync(dirEntrega, { recursive: true })

const faltan = []
const hechos = []

for (const [permiso, receta] of Object.entries(RECETAS)) {
  const trozos = receta.map(resolverTrozo)
  const ausentes = trozos.filter((t) => !t.ruta).map((t) => t.etiqueta)

  if (ausentes.length) {
    faltan.push(`${permiso}: falta ${ausentes.join(', ')}`)
    continue
  }

  const normalizados = []
  trozos.forEach((t, i) => {
    const destino = join(dirTrabajo, `${permiso}-${i}.mp4`)
    normalizar(resolve(t.ruta), destino)
    normalizados.push(destino)
  })

  // El demuxer `concat` lee una lista de ficheros. Va con rutas absolutas y
  // entre comillas: un espacio en la ruta —y aquí la hay, «APPS Github»— parte
  // la línea y el error que da no menciona el espacio.
  const lista = join(dirTrabajo, `${permiso}.txt`)
  writeFileSync(lista, normalizados.map((f) => `file '${resolve(f).replace(/\\/g, '/')}'`).join('\n'))

  const salida = join(dirEntrega, `${permiso}.mp4`)
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', salida])

  const mb = (statSync(salida).size / 1048576).toFixed(1)
  hechos.push(`${permiso.padEnd(28)} ${String(Math.round(duracion(salida))).padStart(3)} s  ${mb} MB  (${receta.length} tomas)`)
}

console.log('\nMontados en ' + dirEntrega + ':')
for (const h of hechos) console.log('  ' + h)

if (faltan.length) {
  console.log('\nSin montar, porque falta metraje:')
  for (const f of faltan) console.log('  ' + f)
  console.log('\nLas tomas humanas van en ' + dirManual + ' con estos nombres:')
  console.log('  login.mp4 · messenger.mp4 · instagram.mp4 · plantilla.mp4 · comentarios-nativo.mp4')
}

rmSync(dirTrabajo, { recursive: true, force: true })
console.log('')
