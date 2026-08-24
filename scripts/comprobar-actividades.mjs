/**
 * Todo tipo de actividad que la base escribe tiene que saber decirse en castellano.
 *
 * POR QUÉ EXISTE ESTE GUARDIÁN
 *
 * Cuatro veces seguidas pasó lo mismo: se añade un RPC que registra una
 * actividad nueva, se despliega, y el hilo escupe el identificador técnico
 * —«tarjeta valor», «archivo subido», «mensaje encolado»— porque nadie se
 * acordó de añadir el caso en `describirActividad()`. El fallo no rompe nada, no lo
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
const vista = join(raiz, 'app', 'lib', 'actividad.ts')

// Los tipos salen del segundo argumento de registrar_actividad y del tercero de
// registrar_actividad_tarjeta, siempre literales entre comillas simples.
const escritos = new Set()

/** Tipos escritos sin punto: nombres mal puestos, no traducciones que falten. */
const malNombrados = new Set()

/**
 * Parte los argumentos de una llamada por las comas de PRIMER NIVEL.
 *
 * Un `split(',')` a secas rompe `jsonb_build_object('a', 1, 'b', 2)` en pedazos
 * y desplaza todas las posiciones siguientes, que es como se acaba leyendo el
 * argumento equivocado y creyendo que el tipo es otra cosa.
 */
function separarArgumentos(s) {
  const fuera = []
  let actual = ''
  let hondo = 0
  let comilla = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") comilla = !comilla
    if (!comilla) {
      if (c === '(') hondo++
      if (c === ')') hondo--
      if (c === ',' && hondo === 0) { fuera.push(actual); actual = ''; continue }
    }
    actual += c
  }
  fuera.push(actual)
  return fuera
}

/**
 * Los comentarios de SQL no son código.
 *
 * Sin esto, documentar un fallo citando la llamada vieja hace que el guardián la
 * cuente como si siguiera ahí. Pasó al escribir la 0077, que explica en su
 * cabecera el nombre mal puesto que viene a corregir.
 */
function sinComentarios(sql) {
  return sql.replace(/--[^\n]*/g, '')
}
for (const f of readdirSync(dirMigraciones).filter((n) => n.endsWith('.sql'))) {
  const sql = sinComentarios(readFileSync(join(dirMigraciones, f), 'utf8'))
  // DETECCIÓN, sin tocar: cualquier literal con punto dentro de la llamada. Es
  // deliberadamente laxa y así debe seguir. Al intentar afinarla mirando solo la
  // posición del tipo, la cuenta cayó de 57 a 49: se perdieron los que se pasan
  // envueltos o en llamadas que no terminan donde el patrón esperaba. Un
  // guardián que detecta de menos es peor que uno que detecta de más.
  for (const m of sql.matchAll(/registrar_actividad(?:_tarjeta)?\s*\(([\s\S]{0,400}?)\)/g)) {
    for (const t of m[1].matchAll(/'([a-záéíóúñ_]+\.[a-záéíóúñ_]+)'/gi)) escritos.add(t[1])
  }

  // NOMBRES MAL PUESTOS, que sí necesitan precisión: aquí se mira SOLO la
  // posición del tipo, porque cualquier otro literal snake_case de la llamada es
  // una clave de `jsonb_build_object` y señalarla sería gritar en falso.
  for (const m of sql.matchAll(/registrar_actividad(_tarjeta)?\s*\(([\s\S]{0,400}?)\)\s*;/g)) {
    const args = separarArgumentos(m[2])
    // El tipo es el 2º argumento de registrar_actividad y el 3º de la variante
    // de tarjeta, que lleva el uuid de la tarjeta delante.
    const tipo = (args[m[1] ? 2 : 1] ?? '').trim()
    const lit = tipo.match(/^'([^']+)'$/)
    if (!lit || lit[1].includes('.')) continue

    /**
     * EL PUNTO CIEGO QUE ESTO CIERRA.
     *
     * El patrón de arriba exige un literal CON PUNTO, porque el convenio es
     * `algo.accion`. Un tipo con guion bajo no encaja, y entonces el guardián no
     * lo ve: ni lo cuenta como escrito ni lo echa de menos en la traducción.
     * Silencio absoluto.
     *
     * Pasó de verdad. La 0067 registraba `comentario_respondido` y este fichero
     * decía «57 tipos, todos traducidos» mientras ese tipo no estaba traducido —y
     * ni siquiera se escribía, porque la llamada usaba una firma inexistente—. Se
     * descubrió el 6 de agosto, cuando un operador pulsó el botón por primera vez.
     *
     * SE MIRA SOLO LA POSICIÓN DEL TIPO, y no cualquier literal de la llamada.
     * La primera versión buscaba snake_case en todo el paréntesis y señalaba las
     * claves de `jsonb_build_object` —`comentario_id`, `fuera_de_ventana`—, que
     * son correctas. Diecisiete avisos falsos, que es justo cómo un guardián deja
     * de guardar.
     */
    malNombrados.add(`${f}: '${lit[1]}'`)
  }
  // Los que escribe un trigger construyendo el literal en un `case`.
  for (const t of sql.matchAll(/then\s+'((?:tarjeta|conversacion|contacto|documento|archivo|campo|identidad|mensaje|nota|embudo|etapa|breakglass|tarjetas|comentario)\.[a-záéíóúñ_]+)'/gi)) {
    escritos.add(t[1])
  }

  /**
   * Y los que se escriben por la puerta de atrás.
   *
   * Este bloque se añadió DESPUÉS de que pasara: 0050 registraba
   * `conexion.verificacion` con un `insert into public.actividades` directo, y
   * el guardián no vio nada. El resultado era correcto y aun así estaba mal,
   * porque salía del único camino vigilado — que es justo la clase de atajo
   * contra la que este archivo existe.
   *
   * Se busca el literal en el `values` que sigue a un insert sobre
   * `actividades`. Detectarlo aquí no bendice el atajo: lo hace ruidoso.
   */
  for (const m of sql.matchAll(/insert\s+into\s+public\.actividades\b[\s\S]{0,600}?values\s*\(([\s\S]{0,400}?)\)/gi)) {
    for (const t of m[1].matchAll(/'([a-záéíóúñ_]+\.[a-záéíóúñ_]+)'/gi)) escritos.add(t[1])
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

/**
 * Nombres malos que YA NO CORREN, con quién los reemplazó.
 *
 * Las migraciones son hacia delante: un `create or replace` posterior deja la
 * definición vieja en su fichero para siempre, y el guardián la sigue leyendo.
 * Enseñar la definición superada como si fuera un fallo vivo manda a arreglar
 * algo que ya está arreglado.
 *
 * Va como lista explícita y no como «quédate con la última definición» porque
 * eso exigiría que este script entendiera qué función envuelve cada llamada, y
 * un guardián que hay que depurar deja de usarse. Aquí cada entrada dice quién
 * la superó, y si alguien la borra sin motivo el guardián vuelve a gritar.
 */
const SUPERADOS = new Map([
  ['0067_ingesta_de_comentarios.sql: \'comentario_respondido\'', '0077'],
  ['0067_ingesta_de_comentarios.sql: \'comentario_marcado\'', '0077'],
])
for (const k of SUPERADOS.keys()) malNombrados.delete(k)

// Antes que nada, los mal nombrados: un tipo sin punto no se puede ni comprobar,
// así que decirlo primero evita que el fallo real quede debajo de otra cosa.
if (malNombrados.size) {
  console.error('\nTipos de actividad escritos SIN PUNTO, que el convenio exige:\n')
  for (const t of [...malNombrados].sort()) console.error(`  · ${t}`)
  console.error('\nEl convenio es `algo.accion`, como `contacto.editado`. Un nombre con')
  console.error('guion bajo es invisible para este guardián: ni se cuenta como escrito')
  console.error('ni se echa de menos su traducción. Renómbralo en la migración.\n')
  process.exit(1)
}

const faltan = [...escritos]
  .filter((t) => !traducidos.has(t) && !FUERA_DEL_HILO.has(t))
  .sort()

if (faltan.length) {
  console.error('\nTipos de actividad que la base escribe y la interfaz no sabe traducir:\n')
  for (const t of faltan) console.error(`  · ${t}`)
  console.error(`\nAñade su \`case\` en describir(), dentro de`)
  console.error(`  app/lib/actividad.ts`)
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
