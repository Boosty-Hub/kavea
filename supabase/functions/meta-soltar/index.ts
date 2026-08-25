/**
 * Suelta la cuenta de Facebook entera: da de baja los webhooks y revoca el permiso.
 *
 * LA DECISIÓN LLEGA TOMADA. `public.desautorizar_meta` ya comprobó que quien pide
 * esto es el propietario, desconectó todas las conexiones, borró credenciales y
 * enrutado, y marcó la autorización como revocada. Aquí solo queda lo que
 * necesita hablar con Meta.
 *
 * EL ORDEN NO ES NEGOCIABLE:
 *
 *   1. Dar de baja los webhooks de cada activo. Hace falta un token de Página, y
 *      los tokens de Página se piden CON el BISU, así que esto va antes de
 *      revocarlo.
 *   2. Revocar el permiso: `DELETE /me/permissions`. Esto es lo que hace que
 *      Kavea desaparezca de los ajustes de Facebook del cliente. Sin este paso,
 *      «desconectar» habría sido solo dejar de mirar.
 *   3. Olvidar la fila. El token ya no sirve para nada y no se guarda lo que no
 *      se puede usar.
 *
 * Al revés —revocar primero— el BISU muere y ya no hay con qué dar de baja nada:
 * Meta se queda mandando eventos de esas Páginas a una ruta que no existe.
 *
 * LOS TOKENS DE PÁGINA SE PIDEN AL VUELO, con `GET /me/accounts`, y no se leen de
 * `private.meta_credentials`: esa tabla ya está vacía cuando llega esta llamada,
 * porque borrarla es parte de desconectar y no puede quedar pendiente de que Meta
 * conteste.
 *
 * REVOCAR DISPARA EL CALLBACK DE DESAUTORIZACIÓN de Meta, que llama a
 * `meta-desautorizar` y vuelve a desconectar lo mismo. Es idempotente a
 * propósito: las dos rutas hacen la misma limpieza y la segunda no encuentra nada
 * que hacer.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const URL_SB = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

type Activo = { conexion?: string; page_id?: string | null; waba_id?: string | null; nombre?: string | null }

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

function limpiar(s: string) {
  return s.replace(/access_token=[^&\s"']+/gi, 'access_token=[oculto]').slice(0, 200)
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-soltar/0.1',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${limpiar(t)}`)
  return t ? JSON.parse(t) : null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!URL_SB || !SECRETO) return json({ error: 'sin configurar' }, 503)
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
    return json({ error: 'no autorizado' }, 401)
  }

  let cuerpo: { organizacion?: string; activos?: Activo[] }
  try { cuerpo = await req.json() } catch { return json({ error: 'cuerpo no válido' }, 400) }

  const org = cuerpo.organizacion
  if (!org) return json({ error: 'falta la organización' }, 400)
  const activos = Array.isArray(cuerpo.activos) ? cuerpo.activos : []

  const avisos: string[] = []
  let bajas = 0

  try {
    const filas = await rpc('autorizacion_por_revocar', { p_org: org })
    const a = Array.isArray(filas) ? filas[0] : filas

    if (!a?.bisu_cipher) {
      // No hay nada que revocar en Meta. La parte local ya está hecha, así que
      // esto no es un fallo: es que la organización no tenía autorización o ya
      // se soltó antes.
      return json({ ok: true, revocado: false, bajas: 0, avisos: ['No había autorización que revocar en Meta.'] })
    }

    const bisu = await descifrar(
      desdeHexPg(a.bisu_cipher), desdeHexPg(a.bisu_nonce), a.bisu_kid,
    )

    // --- 1. Los webhooks, antes de que el token muera --------------------------
    const paginas = new Map<string, string>()
    try {
      const r = await fetch(
        `https://graph.facebook.com/${V}/me/accounts?fields=id,access_token&limit=200` +
        `&access_token=${encodeURIComponent(bisu)}`,
        { signal: AbortSignal.timeout(20_000) },
      )
      const j = await r.json() as { data?: Array<{ id?: string; access_token?: string }>; error?: { message?: string } }
      if (j.error) avisos.push(`No se pudo listar las Páginas: ${limpiar(j.error.message ?? '')}`)
      for (const p of j.data ?? []) if (p.id && p.access_token) paginas.set(p.id, p.access_token)
    } catch (e) {
      avisos.push(`No se pudo listar las Páginas: ${limpiar(String(e))}`)
    }

    for (const act of activos) {
      const id = act.page_id ?? act.waba_id
      if (!id) continue
      const token = act.page_id ? paginas.get(act.page_id) : Deno.env.get('META_PORTFOLIO_TOKEN')
      if (!token) {
        avisos.push(`${act.nombre ?? id}: sin token para darla de baja; Meta puede seguir mandando eventos.`)
        continue
      }
      try {
        const r = await fetch(`https://graph.facebook.com/${V}/${encodeURIComponent(id)}/subscribed_apps`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        })
        const j = await r.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
        if (j.success) bajas++
        else avisos.push(`${act.nombre ?? id}: ${limpiar(j.error?.message ?? 'Meta no confirmó la baja.')}`)
      } catch (e) {
        avisos.push(`${act.nombre ?? id}: ${limpiar(String(e))}`)
      }
    }

    // --- 2. La revocación, que es lo que de verdad desconecta ------------------
    let revocado = false
    try {
      const r = await fetch(
        `https://graph.facebook.com/${V}/me/permissions?access_token=${encodeURIComponent(bisu)}`,
        { method: 'DELETE', signal: AbortSignal.timeout(20_000) },
      )
      const j = await r.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
      revocado = Boolean(j.success)
      if (!revocado) {
        avisos.push(`Meta no confirmó la revocación: ${limpiar(j.error?.message ?? `HTTP ${r.status}`)}`)
      }
    } catch (e) {
      avisos.push(`No se pudo revocar en Meta: ${limpiar(String(e))}`)
    }

    // --- 3. Olvidar el token -------------------------------------------------
    //
    // Se borra aunque Meta no haya confirmado. Guardar un token que el cliente
    // pidió soltar, por si acaso, es exactamente lo que no se debe hacer: si la
    // revocación falló, el cliente puede retirar la app desde sus ajustes de
    // Facebook, y ahí el aviso de arriba le dice que hace falta.
    await rpc('olvidar_autorizacion', { p_org: org })

    return json({ ok: true, revocado, bajas, avisos })
  } catch (e) {
    return json({ error: limpiar(String(e)), avisos }, 500)
  }
})
