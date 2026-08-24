/**
 * Mira el App Review una vez al día y avisa si algo cambió.
 *
 * POR QUÉ EXISTE. La respuesta del 7 de agosto estuvo dieciséis días sin leerse.
 * No hay webhook de esto, el correo de Meta cae en una bandeja que nadie mira a
 * diario y el panel hay que abrirlo a propósito. Dieciséis días es lo que cuesta
 * enterarse cuando el aviso depende de acordarse.
 *
 * QUÉ PREGUNTA. `GET /{app-id}/permissions` con TOKEN DE APP —`{id}|{secreto}`,
 * que no caduca y no depende de ninguna persona—. Devuelve los permisos vivos con
 * su estado; los rechazados simplemente no aparecen. Así una aprobación se nota
 * porque el permiso APARECE y una revocación porque DESAPARECE, y la segunda
 * importa más: es la que avisaría de que Kavea se quedó sin poder mandar nada.
 *
 * LO QUE NO HACE, y es deliberado: si Graph falla o contesta sin `data`, NO ANOTA.
 * Un error de red tratado como respuesta buena diría que se perdieron los trece
 * permisos de golpe, y una alerta falsa de esa magnitud es cómo un vigilante deja
 * de usarse. Es la misma guarda que `verificar-autorizaciones`.
 *
 * EL CORREO SE MARCA DESPUÉS. La alerta se escribe en Postgres primero y solo se
 * marca notificada cuando Resend acepta. Si el correo falla, la fila se queda
 * entre las pendientes, que es donde tiene que estar.
 */

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const APP_ID = Deno.env.get('META_APP_ID') ?? ''
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
const URL_SB = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const DESTINO = Deno.env.get('KAVEA_CORREO_ALERTAS') ?? ''
const REMITENTE = 'Kavea <support@kavea.ai>'

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

function limpiar(s: string) {
  return s.replace(/access_token=[^&\s"']+/gi, 'access_token=[oculto]').slice(0, 250)
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-vigilante/0.1',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${limpiar(t)}`)
  return t ? JSON.parse(t) : null
}

/** El texto del aviso. Se escribe para leerse en el móvil, sin abrir nada más. */
function cuerpoDelAviso(cambios: Array<{ permiso: string; estado: string }>) {
  const linea = (c: { permiso: string; estado: string }) =>
    c.estado === 'ausente'
      ? `  · ${c.permiso}: YA NO APARECE en la lista de la app`
      : `  · ${c.permiso}: ${c.estado}`
  return [
    'Cambió el estado de los permisos de la app de Meta.',
    '',
    ...cambios.map(linea),
    '',
    'Un permiso que aparece es una aprobación. Uno que deja de aparecer es una',
    'revocación, y eso puede dejar canales sin poder enviar.',
    '',
    `Panel: https://developers.facebook.com/apps/${APP_ID}/app-review/permissions/`,
  ].join('\n')
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!URL_SB || !SECRETO) return json({ error: 'sin configurar' }, 503)
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
    return json({ error: 'no autorizado' }, 401)
  }
  if (!APP_ID || !APP_SECRET) return json({ error: 'faltan las credenciales de la app' }, 503)

  try {
    const r = await fetch(
      `https://graph.facebook.com/${V}/${encodeURIComponent(APP_ID)}/permissions` +
      `?access_token=${encodeURIComponent(`${APP_ID}|${APP_SECRET}`)}`,
      { signal: AbortSignal.timeout(20_000) },
    )
    const t = await r.text()
    let d: any
    try { d = JSON.parse(t) } catch { return json({ error: `respuesta no JSON (${r.status})` }, 502) }

    // Sin `data` no se anota NADA. Ver la cabecera.
    if (!r.ok || d?.error || !Array.isArray(d?.data)) {
      return json({
        error: limpiar(d?.error?.message ?? `HTTP ${r.status}`),
        anotado: false,
      }, 502)
    }

    const res = await rpc('anotar_revision', { p_permisos: d.data })
    const cambios = (res?.cambios ?? []) as Array<{ permiso: string; estado: string }>

    if (res?.primera_vez) {
      return json({ ok: true, primera_vez: true, permisos: d.data.length, avisado: false })
    }
    if (!res?.alerta) {
      return json({ ok: true, cambios: 0, permisos: d.data.length, avisado: false })
    }

    // Hay novedad. El correo es el camino primario; la fila de `alertas` es el
    // espejo, y ya está escrita.
    let avisado = false
    let motivo: string | null = null
    if (!RESEND || !DESTINO) {
      motivo = 'sin RESEND_API_KEY o sin KAVEA_CORREO_ALERTAS: la alerta queda sin notificar'
    } else {
      const envio = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: REMITENTE,
          to: [DESTINO],
          subject: `Kavea · App Review: ${cambios.length} cambio${cambios.length === 1 ? '' : 's'}`,
          text: cuerpoDelAviso(cambios),
        }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null)

      if (envio?.ok) {
        await rpc('alerta_notificada', { p_alerta: res.alerta })
        avisado = true
      } else {
        motivo = `el proveedor de correo devolvió ${envio?.status ?? 'nada'}`
      }
    }

    return json({ ok: true, cambios, alerta: res.alerta, avisado, motivo })
  } catch (e) {
    return json({ error: limpiar(String(e)) }, 500)
  }
})
