/**
 * Enriquecedor de perfiles de Instagram.
 *
 * PARA QUÉ EXISTE
 *
 * Un `messaging[]` de Instagram trae `sender.id` y nada más: ni nombre ni
 * handle. Comprobado el 6 de agosto de 2026 sobre los cuerpos crudos guardados.
 * WhatsApp sí manda `contacts[].profile.name`, y por eso sus contactos tienen
 * nombre desde el primer mensaje y los de Instagram salían todos como «Contacto
 * sin nombre».
 *
 * El handle hay que ir a pedirlo. Es una llamada por contacto NUEVO, no por
 * mensaje: `perfil_leido_en` sella el intento y la consulta no lo vuelve a
 * devolver.
 *
 * POR QUÉ NO VIVE EN EL NORMALIZADOR
 *
 * Porque la ingesta no puede depender de que la Graph API conteste. El
 * normalizador tiene 1,2 s de presupuesto de CPU y un cursor que avanza en la
 * misma transacción que confirma el tramo; una espera de red por contacto nuevo
 * ahí dentro convierte un mal día de Meta en una cola atascada. Aquí, un mal día
 * de Meta solo significa que el nombre aparece dos minutos más tarde.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'
import { alertar } from '../_compartido/almacen.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

/** Contactos por invocación. El cron corre cada dos minutos. */
const LOTE = 20

/**
 * Techo de la descarga del avatar, y coincide con el del bucket.
 *
 * Un perfil de Instagram no pasa de 100 KB, así que 2 MB ya es holgado. El tope
 * existe porque `profile_pic` es una URL que decide Meta, y descargar sin límite
 * lo que apunte un tercero es cómo una función efímera se queda sin memoria.
 */
const MAX_FOTO = 2 * 1024 * 1024

type Pendiente = {
  contact_id: string
  organization_id: string
  scoped_id: string
  meta_connection_id: string
  canal: 'instagram' | 'messenger'
}

/**
 * Qué se le pide a Meta según el canal, y qué se hace con la respuesta.
 *
 * NO ES EL MISMO DATO. Instagram devuelve `username`, que es un IDENTIFICADOR
 * —`@fulanito`— y se guarda como tal, dejando `nombre` en null: `nombre`
 * significa «alguien nombró a esta persona» y un handle no lo es.
 *
 * Messenger no tiene handle. Devuelve `first_name` y `last_name`, que sí son un
 * nombre de persona, igual que el `profile.name` de WhatsApp que se guarda en
 * `nombre` desde el primer día. Ahí sí se escribe `nombre`, y es coherente: se
 * guarda en `nombre` lo que es un nombre.
 */
const CAMPOS = {
  instagram: 'username,profile_pic',
  messenger: 'first_name,last_name,profile_pic',
} as const

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function sql<T>(ruta: string, init?: RequestInit): Promise<T> {
  const clave = claveServicio()
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-enriquecedor/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 300)}`)
  if (r.status === 204) return undefined as T
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

/**
 * El Page Access Token de una conexión, cacheado por invocación.
 *
 * Los contactos de un lote son casi siempre de la misma conexión, así que sin
 * caché se descifraría la misma credencial veinte veces. La caché es local a la
 * invocación a propósito: un token revocado no puede sobrevivir al cron que
 * viene.
 */
async function tokenDe(conexion: string, cache: Map<string, string>): Promise<string> {
  const ya = cache.get(conexion)
  if (ya) return ya

  const cred = (await sql<Array<{
    page_access_token_cipher: string
    page_access_token_nonce: string
    page_access_token_kid: string
  }>>('rpc/credencial_de_conexion', {
    method: 'POST',
    body: JSON.stringify({ p_conexion: conexion }),
  }))?.[0]
  if (!cred) throw new Error('sin credencial para esa conexión')

  const token = await descifrar(
    desdeHexPg(cred.page_access_token_cipher),
    desdeHexPg(cred.page_access_token_nonce),
    cred.page_access_token_kid,
  )
  cache.set(conexion, token)
  return token
}

/**
 * Copia el avatar de Meta al bucket propio y devuelve su ruta.
 *
 * Devuelve null en vez de lanzar: quedarse sin foto no puede costar el handle,
 * que es el dato que de verdad quita el «Contacto sin nombre» de la bandeja.
 *
 * La extensión sale del `content-type` que contesta el CDN y no de la URL: la de
 * `lookaside` lleva la extensión dentro de una ristra de parámetros firmados y
 * adivinarla de ahí es cómo se acaba guardando un `.jpg` que es un `.webp`.
 */
async function copiarFoto(
  org: string, contacto: string, url: string,
): Promise<string | null> {
  const img = await fetch(url)
  if (!img.ok || !img.body) return null

  const tipo = (img.headers.get('content-type') ?? 'image/jpeg').split(';')[0]!.trim()
  if (!tipo.startsWith('image/')) return null

  const bytes = new Uint8Array(await img.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FOTO) return null

  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg'
  // La organización como PRIMER SEGMENTO: es lo que la política de lectura mira
  // para separar a un cliente de otro dentro del bucket.
  const ruta = `${org}/${contacto}.${ext}`

  const clave = claveServicio()
  const r = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/perfiles/${ruta}`,
    {
      method: 'POST',
      headers: {
        apikey: clave,
        Authorization: `Bearer ${clave}`,
        'Content-Type': tipo,
        // Un contacto que cambia de foto se sobreescribe en su misma ruta, para
        // que no queden avatares viejos ocupando sitio sin que nadie los mire.
        'x-upsert': 'true',
        'User-Agent': 'kavea-enriquecedor/0.1',
      },
      body: bytes as BodyInit,
    },
  )
  if (!r.ok) return null

  return ruta
}

Deno.serve(async (): Promise<Response> => {
  const t0 = Date.now()
  const resumen = { pendientes: 0, resueltos: 0, con_foto: 0, sin_handle: 0, fallidos: 0 }

  try {
    const pendientes = await sql<Pendiente[]>('rpc/contactos_sin_perfil', {
      method: 'POST',
      body: JSON.stringify({ p_limite: LOTE }),
    })
    resumen.pendientes = pendientes?.length ?? 0

    const tokens = new Map<string, string>()

    for (const p of pendientes ?? []) {
      try {
        const token = await tokenDe(p.meta_connection_id, tokens)

        const campos = CAMPOS[p.canal] ?? CAMPOS.instagram
        const r = await fetch(
          `https://graph.facebook.com/${V}/${encodeURIComponent(p.scoped_id)}?fields=${campos}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const j = await r.json() as {
          username?: string
          first_name?: string
          last_name?: string
          profile_pic?: string
          error?: { code?: number; message?: string }
        }

        /**
         * UN LÍMITE DE VELOCIDAD NO SE SELLA.
         *
         * El resto de respuestas de Meta sí: tanto un handle como un «esta
         * cuenta ya no existe» son contestaciones definitivas, y sellar
         * `perfil_leido_en` es lo que impide que un IGSID irresoluble se pida
         * cada dos minutos para siempre. Pero un 4 o un 613 es «ahora no,
         * vuelve luego», y sellarlo perdería el contacto para siempre por una
         * congestión pasajera.
         */
        const codigo = j.error?.code
        if (codigo === 4 || codigo === 17 || codigo === 613) {
          resumen.fallidos++
          await alertar('perfil_limitado', 'p2', { contacto: p.contact_id, codigo })
          continue
        }

        const ruta = j.profile_pic
          ? await copiarFoto(p.organization_id, p.contact_id, j.profile_pic).catch(() => null)
          : null

        const nombre = [j.first_name, j.last_name].filter(Boolean).join(' ').trim() || null

        await sql('rpc/guardar_perfil_instagram', {
          method: 'POST',
          body: JSON.stringify({
            p_contact: p.contact_id,
            p_username: j.username ?? null,
            p_foto_ruta: ruta,
            p_nombre: nombre,
          }),
        })

        if (ruta) resumen.con_foto++
        if (j.username || nombre) resumen.resueltos++
        else resumen.sin_handle++
      } catch (e) {
        // Un contacto que falla no puede llevarse por delante a los otros
        // diecinueve. Se cuenta, se sigue, y como no se selló nada el próximo
        // cron lo vuelve a intentar.
        resumen.fallidos++
        await alertar('perfil_no_resuelto', 'p2', {
          contacto: p.contact_id, error: String(e).slice(0, 200),
        })
      }
    }

    return new Response(JSON.stringify({ ...resumen, ms: Date.now() - t0 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300), ...resumen }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
