/**
 * Callback de borrado de datos de Facebook Login, y su página de estado.
 *
 * Dos rutas en una función porque son las dos mitades de la misma promesa:
 *
 *   POST /            → recibe el `signed_request` y devuelve {url, confirmation_code}
 *   GET  /estado      → la página que abre la persona con ese código
 *
 * LA FORMA DE LA RESPUESTA NO ES NEGOCIABLE. Meta espera exactamente dos claves,
 * `url` y `confirmation_code`, en JSON. Una tercera clave de más, un envoltorio
 * `{data: ...}` o un 204 y el callback se da por incumplido en el App Review.
 *
 * LO QUE NO HACE: borrar. Un `user_id` firmado no basta para vaciar por su
 * cuenta el historial comercial de un cliente; se registra en p1 y lo confirma
 * una persona. La página de estado dice en qué punto está de verdad, que es toda
 * la diferencia entre cumplir la promesa y aparentarlo.
 *
 * Se despliega con `verify_jwt = false`: Meta no manda bearer token.
 */

import { cargaFirmada } from '../_compartido/firma.ts'
import { alertar } from '../_compartido/almacen.ts'

/**
 * La URL que se le enseña a la persona.
 *
 * Va bajo `kavea.ai` y no bajo el dominio del proyecto de Supabase: es una
 * página que Meta muestra a un usuario final, y un enlace a un subdominio
 * técnico que nadie reconoce es exactamente lo que parece un fraude. El sitio
 * público la reenvía por proxy a esta misma función.
 */
const BASE_ESTADO = Deno.env.get('KAVEA_URL_BORRADO')
  ?? 'https://kavea.ai/eliminacion-de-datos/estado'

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function rpc<T>(nombre: string, cuerpo: unknown): Promise<T> {
  const clave = claveServicio()
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-borrado/0.1',
    },
    body: JSON.stringify(cuerpo),
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

/** Escapado de lo que se interpola en el HTML. El código viene de la URL. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const TEXTO: Record<string, { titulo: string; cuerpo: string }> = {
  recibida: {
    titulo: 'Solicitud recibida',
    cuerpo: 'Hemos registrado tu solicitud de eliminación de datos y está en cola. '
      + 'Se resuelve dentro del plazo legal aplicable.',
  },
  en_curso: {
    titulo: 'Eliminación en curso',
    cuerpo: 'Estamos eliminando los datos asociados a tu solicitud.',
  },
  completada: {
    titulo: 'Eliminación completada',
    cuerpo: 'Los datos asociados a tu solicitud han sido eliminados.',
  },
  sin_datos: {
    titulo: 'No había datos que eliminar',
    cuerpo: 'No encontramos datos asociados a tu solicitud. No hay nada que eliminar.',
  },
}

/**
 * La página, sin una línea de JavaScript y sin recursos externos.
 *
 * El sitio público la sirve por proxy, así que hereda su Content-Security-Policy,
 * que es `script-src 'self'`. Un script en línea aquí no se ejecutaría y la
 * página quedaría muda sin dar ningún error.
 */
function pagina(estado: string | null, codigo: string, recibida?: string): Response {
  const t = estado ? TEXTO[estado] : null
  const titulo = t?.titulo ?? 'No encontramos esa solicitud'
  const cuerpo = t?.cuerpo
    ?? 'El código no corresponde a ninguna solicitud. Comprueba que lo has copiado entero.'

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)} · Kavea</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
         background:#faf8f5; color:#1c1a17; padding:24px; }
  main { max-width:36rem; }
  h1 { font-size:1.5rem; margin:0 0 .5rem; }
  dl { margin:1.5rem 0 0; }
  dt { font-size:.75rem; letter-spacing:.06em; text-transform:uppercase; opacity:.65; }
  dd { margin:.15rem 0 1rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
       word-break:break-all; }
  @media (prefers-color-scheme: dark) { body { background:#1a1815; color:#efeae2; } }
</style>
</head>
<body>
<main>
  <h1>${esc(titulo)}</h1>
  <p>${esc(cuerpo)}</p>
  <dl>
    <dt>Código de confirmación</dt>
    <dd>${esc(codigo)}</dd>
    ${recibida ? `<dt>Solicitada el</dt><dd>${esc(recibida.slice(0, 10))}</dd>` : ''}
  </dl>
  <p>Si necesitas ayuda, escribe a <a href="mailto:hola@kavea.ai">hola@kavea.ai</a> citando el código.</p>
</main>
</body>
</html>`

  return new Response(html, {
    // 200 aunque el código no exista: un 404 distinto convierte esta página en un
    // oráculo con el que enumerar códigos válidos a base de probar.
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const codigo = (url.searchParams.get('codigo') ?? '').trim()
    if (!codigo) return pagina(null, '—')

    try {
      const filas = await rpc<Array<{ estado: string; recibida_en: string }>>(
        'estado_de_borrado', { p_codigo: codigo },
      )
      const f = filas?.[0]
      return pagina(f?.estado ?? null, codigo, f?.recibida_en)
    } catch {
      return pagina(null, codigo)
    }
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const secreto = Deno.env.get('META_APP_SECRET')
  if (!secreto) {
    await alertar('borrado_sin_secreto', 'p1', {})
    return new Response('sin configurar', { status: 500 })
  }

  let firmado: string | null = null
  try {
    const form = await req.formData()
    const v = form.get('signed_request')
    firmado = typeof v === 'string' ? v : null
  } catch {
    firmado = null
  }
  if (!firmado) return new Response('bad request', { status: 400 })

  const carga = await cargaFirmada(firmado, secreto)
  if (!carga?.user_id) return new Response('bad request', { status: 400 })

  try {
    const codigo = await rpc<string>('registrar_borrado', { p_meta_user_id: carga.user_id })

    // Exactamente estas dos claves, y ninguna más.
    return new Response(
      JSON.stringify({
        url: `${BASE_ESTADO}?codigo=${encodeURIComponent(codigo)}`,
        confirmation_code: codigo,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch (e) {
    await alertar('borrado_fallido', 'p1', { error: String(e).slice(0, 200) })
    return new Response('error', { status: 500 })
  }
})
