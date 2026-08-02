/**
 * Persistencia del receptor: Postgres primero, Netlify Blobs después.
 *
 * El amortiguador solo gana su sitio en caídas de Postgres de MÁS DE UNA HORA.
 * Por debajo, Meta reintenta las entregas fallidas y el evento acaba entrando
 * igual. Pasada la hora, Meta desuscribe la Página en silencio y por cliente, y
 * ahí sí se pierden eventos. Se mantiene porque la promesa del producto es que
 * nada se pierda, no porque sea el caso frecuente.
 */

export type EventoIngesta = {
  ingesta_id: string
  recibido_en: string
  firma_ok: true
  cuerpo_crudo: string
  cuerpo_bytes: number
  ruta: 'directa' | 'blobs'
  duracion_ms: number
  object?: string | null
  entry_ids?: string[] | null
}

export function conTimeout<T>(p: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rechazar) =>
      setTimeout(() => rechazar(new Error(`timeout ${etiqueta} ${ms}ms`)), ms),
    ),
  ])
}

/**
 * Inserta por PostgREST con la clave de servicio.
 *
 * Va por HTTPS y no por conexión TCP directa: en una función efímera un pool no
 * tiene dónde vivir, y abrir una conexión por petición agota la base bajo carga.
 */
export async function insertarEvento(e: EventoIngesta, ms: number): Promise<void> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/webhook_events`
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!

  const r = await conTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        apikey: clave,
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
        // Las claves sb_secret_* rechazan peticiones que parezcan de navegador.
        'User-Agent': 'kavea-receptor/0.1',
      },
      body: JSON.stringify(e),
    }),
    ms,
    'postgres',
  )

  if (!r.ok) {
    const detalle = await r.text().catch(() => '')
    throw new Error(`postgrest ${r.status} ${detalle.slice(0, 200)}`)
  }
}

/**
 * Clave de objeto en el amortiguador.
 *
 * Ordenable por tiempo, porque `list()` de Blobs NO garantiza orden y el
 * drenaje tiene que reconstruirlo. El `ingesta_id` al final evita colisiones
 * entre dos entregas del mismo milisegundo.
 */
export function claveBlob(recibidoEn: string, ingestaId: string): string {
  return `crudo/${recibidoEn.replace(/[:.]/g, '-')}_${ingestaId}`
}

/**
 * Escribe en Netlify Blobs desde FUERA del runtime de Netlify.
 *
 * Se usa la API REST directamente en lugar del paquete `@netlify/blobs`: el
 * paquete espera variables de entorno del runtime de Netlify y arrastra
 * dependencias que en Deno no aportan nada. Son dos cabeceras y un PUT.
 *
 * Consistencia fuerte pedida a propósito: Blobs es de consistencia eventual por
 * defecto, con propagación de hasta 60 s. El drenaje corre cada minuto, así que
 * con la consistencia por defecto podría listar un store que parece vacío justo
 * después de la caída.
 */
export async function guardarEnAmortiguador(
  clave: string,
  bytes: Uint8Array,
  metadata: Record<string, unknown>,
  ms: number,
): Promise<void> {
  const sitio = Deno.env.get('NETLIFY_BLOBS_SITE_ID')!
  const token = Deno.env.get('NETLIFY_BLOBS_TOKEN')!
  const store = 'ingesta-emergencia'

  const url =
    `https://api.netlify.com/api/v1/blobs/${sitio}/${store}/${encodeURIComponent(clave)}`

  const r = await conTimeout(
    fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'netlify-blobs-metadata': btoa(JSON.stringify(metadata)),
        'x-nf-strong-consistency': 'true',
      },
      body: bytes as BodyInit,
    }),
    ms,
    'blobs',
  )

  if (!r.ok) {
    const detalle = await r.text().catch(() => '')
    throw new Error(`blobs ${r.status} ${detalle.slice(0, 200)}`)
  }
}

/**
 * Registra una alerta.
 *
 * Nunca lanza: una alerta que falla no puede romper la respuesta a Meta. Y
 * `detalle` jamás lleva el cuerpo del webhook ni texto de mensajes.
 */
export async function alertar(
  tipo: string,
  severidad: 'p1' | 'p2',
  detalle: Record<string, unknown>,
): Promise<void> {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/alertas`
    const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!
    await conTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          apikey: clave,
          Authorization: `Bearer ${clave}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
          'User-Agent': 'kavea-receptor/0.1',
        },
        body: JSON.stringify({ tipo, severidad, detalle }),
      }),
      2_000,
      'alerta',
    )
  } catch {
    // Silencio deliberado. Si Postgres no está, la alerta que importa es la que
    // sale por el camino externo, no esta.
  }
}
