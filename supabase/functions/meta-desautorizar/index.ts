/**
 * Callback de desautorización de Facebook Login.
 *
 * Meta lo llama cuando alguien retira el permiso a la app desde su configuración
 * de Facebook. Es uno de los dos callbacks que el App Review exige.
 *
 * LO QUE HACE Y LO QUE NO: desconecta y avisa. NO borra datos. Retirar el
 * permiso es «dejad de escribir en mi nombre», no «olvidad todo lo que pasó»;
 * eso segundo es el otro callback, y tiene su propio circuito con confirmación.
 * Confundirlos convierte un clic en un ajuste de Facebook en pérdida
 * irreversible del historial comercial de un cliente.
 *
 * Se despliega con `verify_jwt = false`: Meta no manda bearer token, igual que en
 * el receptor de webhooks.
 */

import { cargaFirmada } from '../_compartido/firma.ts'
import { alertar } from '../_compartido/almacen.ts'

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
      'User-Agent': 'kavea-desautorizar/0.1',
    },
    body: JSON.stringify(cuerpo),
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const secreto = Deno.env.get('META_APP_SECRET')
  if (!secreto) {
    // 500 y no 200: sin App Secret no se puede distinguir a Meta de cualquiera,
    // y contestar 200 sería fingir que se atendió algo que ni se leyó.
    await alertar('desautorizacion_sin_secreto', 'p1', {})
    return new Response('sin configurar', { status: 500 })
  }

  let firmado: string | null = null
  try {
    // Llega como `application/x-www-form-urlencoded` con un solo campo.
    const form = await req.formData()
    const v = form.get('signed_request')
    firmado = typeof v === 'string' ? v : null
  } catch {
    firmado = null
  }

  if (!firmado) return new Response('bad request', { status: 400 })

  const carga = await cargaFirmada(firmado, secreto)
  // 400 y no 403: no se le confirma a quien prueba firmas que el formato era
  // correcto y solo falló el HMAC.
  if (!carga?.user_id) return new Response('bad request', { status: 400 })

  try {
    const n = await rpc<number>('registrar_desautorizacion', { p_meta_user_id: carga.user_id })
    return new Response(JSON.stringify({ ok: true, desconectadas: n }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    await alertar('desautorizacion_fallida', 'p1', { error: String(e).slice(0, 200) })
    // 500 a propósito: Meta reintenta, y esta es una notificación que conviene
    // que vuelva. No es el receptor de webhooks, donde el 200 pase lo que pase
    // es la propiedad que evita la desuscripción silenciosa.
    return new Response('error', { status: 500 })
  }
})
