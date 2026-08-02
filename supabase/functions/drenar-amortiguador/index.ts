/**
 * Drenaje del amortiguador de emergencia.
 *
 * Cuando Postgres no está, el receptor vuelca el cuerpo crudo en Netlify Blobs
 * y devuelve 200 igual. Esta función recoge lo acumulado y lo mete en la cola
 * cuando la base vuelve.
 *
 * BLOBS NO ES UNA COLA. No hay entrega garantizada, ni reintentos, ni cola de
 * fallidos, ni reglas de ciclo de vida. Todo eso se implementa aquí a mano:
 *
 *   - El ORDEN lo pone el drenaje, porque `list()` no lo garantiza. Por eso la
 *     clave lleva la marca temporal delante y es ordenable como texto.
 *   - La DEDUPLICACIÓN la da `ingesta_id`, que el receptor genera ANTES de
 *     intentar escribir y viaja por los dos caminos. Cierra el caso del insert
 *     que se confirmó pero cuya respuesta se perdió.
 *   - El BORRADO solo ocurre tras confirmar la escritura en Postgres. Un objeto
 *     borrado antes es un evento perdido.
 *   - La CADUCIDAD se aplica en el propio bucle: nada limpia Blobs solo.
 *
 * Se invoca desde pg_cron cada minuto. Es idempotente: si corre dos veces a la
 * vez, el `on conflict` de `ingesta_id` evita duplicados.
 */

const SITIO = Deno.env.get('NETLIFY_BLOBS_SITE_ID')!
const TOKEN = Deno.env.get('NETLIFY_BLOBS_TOKEN')!
const STORE = 'ingesta-emergencia'
const BASE = `https://api.netlify.com/api/v1/blobs/${SITIO}/${STORE}`

/** Tope por invocación. Con más, se deja para la siguiente pasada. */
const MAX_POR_PASADA = 100

/** Un objeto más viejo que esto se descarta: Meta ya lo dio por perdido. */
const DIAS_CADUCIDAD = 7

type Blob = { key: string; size: number; last_modified: string }

/**
 * Codifica los segmentos de la clave pero conserva las barras.
 *
 * `encodeURIComponent` sobre la clave entera convierte la barra en %2F y
 * Netlify guarda el objeto con ese nombre literal, lo que rompe el filtro por
 * prefijo. Pasó de verdad: dos mensajes reales quedaron en el amortiguador y el
 * listado los daba por inexistentes.
 */
function ruta(clave: string): string {
  return clave.split('/').map(encodeURIComponent).join('/')
}

/**
 * Claves escritas por la versión con el fallo, que llevan %2F en el nombre.
 * Se listan aparte para poder rescatarlas. Se puede quitar cuando el store no
 * tenga ninguna.
 */
const PREFIJOS = ['crudo/', 'crudo%2F']

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function listar(prefijo: string): Promise<Blob[]> {
  const r = await fetch(`${BASE}?prefix=${encodeURIComponent(prefijo)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!r.ok) throw new Error(`list ${r.status}`)
  const j = (await r.json()) as { blobs?: Blob[] }
  // El orden de list() no está garantizado. Se ordena por clave, que empieza
  // por la marca temporal ISO y por tanto ordena cronológicamente como texto.
  return (j.blobs ?? []).sort((a, b) => a.key.localeCompare(b.key))
}

async function leer(clave: string): Promise<{ bytes: Uint8Array; meta: Record<string, unknown> }> {
  const r = await fetch(`${BASE}/${ruta(clave)}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'x-nf-strong-consistency': 'true' },
  })
  if (!r.ok) throw new Error(`get ${r.status}`)

  const cabecera = r.headers.get('netlify-blobs-metadata')
  let meta: Record<string, unknown> = {}
  if (cabecera) {
    try {
      meta = JSON.parse(atob(cabecera)) as Record<string, unknown>
    } catch {
      // Metadata corrupta no impide rescatar el cuerpo, que es lo que importa.
    }
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), meta }
}

async function borrar(clave: string): Promise<void> {
  await fetch(`${BASE}/${ruta(clave)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
}

async function insertar(fila: Record<string, unknown>): Promise<boolean> {
  const clave = claveServicio()
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/webhook_events`, {
    method: 'POST',
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      // Deduplicación: si ingesta_id ya existe, no se duplica y no es un error.
      Prefer: 'return=minimal,resolution=ignore-duplicates',
      'User-Agent': 'kavea-drenaje/0.1',
    },
    body: JSON.stringify(fila),
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  return true
}

Deno.serve(async (): Promise<Response> => {
  const resumen = { listados: 0, drenados: 0, caducados: 0, fallidos: 0 }

  try {
    const todos: Blob[] = []
    for (const p of PREFIJOS) todos.push(...(await listar(p)))
    // Puede haber solape entre prefijos; se deduplica por clave.
    const vistos = new Set<string>()
    const objetos = todos
      .filter((o) => (vistos.has(o.key) ? false : (vistos.add(o.key), true)))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, MAX_POR_PASADA)
    resumen.listados = objetos.length

    const limite = Date.now() - DIAS_CADUCIDAD * 24 * 60 * 60 * 1000

    for (const o of objetos) {
      try {
        if (new Date(o.last_modified).getTime() < limite) {
          await borrar(o.key)
          resumen.caducados++
          continue
        }

        const { bytes, meta } = await leer(o.key)
        const cuerpo = new TextDecoder('utf-8').decode(bytes)

        let objeto: string | null = null
        let entryIds: string[] | null = null
        try {
          const v = JSON.parse(cuerpo) as { object?: string; entry?: Array<{ id?: string }> }
          objeto = typeof v.object === 'string' ? v.object : null
          const ids = (v.entry ?? [])
            .map((e) => e?.id)
            .filter((x): x is string => typeof x === 'string')
          entryIds = ids.length ? ids : null
        } catch {
          // Igual que en el receptor: si no parsea, se encola de todos modos.
        }

        await insertar({
          ingesta_id: meta.ingesta_id,
          // recibido_en conserva el instante ORIGINAL de la entrega, no el del
          // rescate. drenado_en guarda cuándo se recuperó. Sin esa distinción,
          // una caída larga falsearía toda la latencia medida.
          recibido_en: meta.recibido_en,
          drenado_en: new Date().toISOString(),
          firma_ok: true,
          cuerpo_crudo: cuerpo,
          cuerpo_bytes: bytes.byteLength,
          ruta: 'blobs',
          object: objeto,
          entry_ids: entryIds,
        })

        // Solo se borra DESPUÉS de confirmar la escritura.
        await borrar(o.key)
        resumen.drenados++
      } catch {
        resumen.fallidos++
        // No se borra: se reintenta en la pasada siguiente.
      }
    }

    return new Response(JSON.stringify(resumen), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300), ...resumen }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
})
