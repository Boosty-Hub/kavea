/**
 * Todo tipo de actividad que la base escribe tiene que saber decirse en castellano.
 *
 * POR QUÉ EXISTE ESTE GUARDIÁN
 *
 * Cuatro veces seguidas pasó lo mismo: se añade un RPC que registra una
 * actividad nueva, se despliega, y el hilo escupe el identificador técnico
 * —«tarjeta valor», «archivo subido», «mensaje encolado»— porque nadie se
 * acordó de añadir el caso en `describir()`. El fallo no rompe nada, no lo
 * detiene el compilador y solo se ve mirando la pantalla, que es la peor
 * combinación posible: sobrevive a los despliegues.
 *
 * Esto compara los tipos que las migraciones escriben con los que la interfaz
 * sabe traducir, y falla si sobra alguno. Corre en CI.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath y no `.pathname`: la ruta del repositorio lleva un espacio y
// `pathname` lo deja como %20, con lo que ninguna lectura encuentra nada.
const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const dirMigraciones = join(raiz, 'supabase', 'migrations')
const vista = join(raiz, 'app', 'app', 'bandeja', '[id]', 'page.tsx')

// Los tipos salen del segundo argumento de registrar_actividad y del tercero de
// registrar_actividad_tarjeta, siempre literales entre comillas simples.
const escritos = new Set()
for (const f of readdirSync(dirMigraciones).filter((n) => n.endsWith('.sql'))) {
  const sql = readFileSync(join(dirMigraciones, f), 'utf8')
  for (const m of sql.matchAll(/registrar_actividad(?:_tarjeta)?\s*\(([\s\S]{0,400}?)\)/g)) {
    for (const t of m[1].matchAll(/'([a-záéíóúñ_]+\.[a-záéíóúñ_]+)'/gi)) escritos.add(t[1])
  }
  // Los que escribe un trigger construyendo el literal en un `case`.
  for (const t of sql.matchAll(/then\s+'((?:tarjeta|conversacion|contacto|documento|archivo|campo|identidad|mensaje|nota|embudo|etapa|breakglass|tarjetas)\.[a-záéíóúñ_]+)'/gi)) {
    escritos.add(t[1])
  }
}

/**
 * Lo que a propósito no sale en el hilo, con el motivo.
 *
 * Un guardián que grita en falso se acaba ignorando, y entonces ya no guarda
 * nada. Esta lista es explícita para que añadir algo aquí sea una decisión
 * consciente y no una forma cómoda de callarlo.
 */
const FUERA_DEL_HILO = new Map([
  // Actividad de ORGANIZACIÓN: se registra con conversation_id y tarjeta_id
  // nulos, así que la vista `linea_tiempo` no la recoge. Vive en el registro de
  // la organización, no en una conversación.
  ['campo.definido', 'de organización'],
  ['campo.archivado', 'de organización'],
  ['embudo.definido', 'de organización'],
  ['etapa.definida', 'de organización'],
  ['etapa.archivada', 'de organización'],

  // No son actividades: son el `tipo` que la vista da a los MENSAJES. Los pinta
  // la rama de burbujas, que nunca llama a describir().
  ['mensaje.borrado', 'es un mensaje, no una actividad'],
  ['mensaje.saliente', 'es un mensaje, no una actividad'],
  ['mensaje.entrante', 'es un mensaje, no una actividad'],
])

const tsx = readFileSync(vista, 'utf8')
const traducidos = new Set(
  [...tsx.matchAll(/case\s+'([a-záéíóúñ_]+\.[a-záéíóúñ_]+)'/gi)].map((m) => m[1]),
)

const faltan = [...escritos]
  .filter((t) => !traducidos.has(t) && !FUERA_DEL_HILO.has(t))
  .sort()

if (faltan.length) {
  console.error('\nTipos de actividad que la base escribe y la interfaz no sabe traducir:\n')
  for (const t of faltan) console.error(`  · ${t}`)
  console.error(`\nAñade su \`case\` en describir(), dentro de`)
  console.error(`  app/app/bandeja/[id]/page.tsx`)
  console.error(`o, si de verdad no debe salir en el hilo, apúntalo en FUERA_DEL_HILO`)
  console.error(`de este mismo archivo con el motivo.\n`)
  process.exit(1)
}

// Al revés también avisa: una traducción sin nadie que la escriba es código
// muerto, y casi siempre significa que se renombró el tipo en la migración y se
// dejó el `case` viejo.
const huerfanos = [...traducidos].filter(
  (t) => !escritos.has(t) && !t.startsWith('evento.') && !FUERA_DEL_HILO.has(t),
)

console.log(`  ${escritos.size} tipos de actividad, todos traducidos.`)
if (huerfanos.length) {
  console.log(`  Traducciones sin quien las escriba: ${huerfanos.join(', ')}`)
}
