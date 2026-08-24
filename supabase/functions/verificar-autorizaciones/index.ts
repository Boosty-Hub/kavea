/**
 * ¿Siguen vivas las autorizaciones de Facebook? Una vez al día.
 *
 * POR QUÉ HACE FALTA. Los Page Access Tokens ya tienen quien los vigile: el
 * despachador marca `token_invalid_since` al recibir un error 190 enviando, y el
 * reconciliador lo comprueba cada quince minutos. El BISU no tenía a nadie, y es
 * el que peor falla: un Page Access Token muerto se nota al primer mensaje que
 * se intenta enviar, pero el BISU solo se usa al descubrir y activar activos —o
 * sea, una vez cada mucho—. Puede llevar semanas muerto y el único síntoma
 * aparece el día que un cliente entra a conectar un canal y la pantalla se queda
 * en blanco sin saber decir por qué.
 *
 * «NO CADUCA» NO ES «NO SE INVALIDA». La configuración se creó con caducidad
 * `Never` a conciencia, pero un token sin fecha muere igual: cuando el cliente
 * revoca la app, cuando quien autorizó pierde su rol en el portafolio, con un
 * cambio de contraseña, o si Meta restringe la app. Nada de eso avisa.
 *
 * SE USA `debug_token` Y NO UNA LLAMADA CUALQUIERA. Una llamada normal solo dice
 * «funcionó o no». `debug_token` dice si sigue vivo, cuándo caduca de verdad, y
 * qué scopes quedan — y eso último importa porque un cliente puede quitar UN
 * permiso sin revocar la app, y entonces el token vale para unas cosas y no para
 * otras. Devolver «sirve» en ese caso sería mentir a medias.
 *
 * NO ARREGLA NADA: solo anota. Renovar un BISU es que una persona vuelva a pasar
 * por el diálogo, y eso no lo puede hacer un cron.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const APP_ID = Deno.env.get('META_APP_ID') ?? ''
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SECRETO = Deno.env.get('KAVEA_SUPABASE_SECRET') ?? ''

function limpiar(s: string) {
  return s.replace(/access_token=[^&\s"']+/gi, 'access_token=[oculto]').slice(0, 200)
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      apikey: SECRETO,
      Authorization: `Bearer ${SECRETO}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-verificar-autorizaciones/0.1',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${nombre} ${r.status} ${limpiar(t)}`)
  return t ? JSON.parse(t) : null
}

Deno.serve(async (req) => {
  if (!APP_ID || !APP_SECRET || !SUPABASE_URL || !SECRETO) {
    return new Response(JSON.stringify({ error: 'sin configurar' }), { status: 503 })
  }
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SECRETO}`) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }

  const orgs = (await rpc('organizaciones_con_autorizacion', {})) as Array<{ organization_id: string }>
  const resumen: Array<{ org: string; valida: boolean; motivo?: string }> = []

  for (const { organization_id: org } of orgs ?? []) {
    try {
      const filas = await rpc('autorizacion_de_organizacion', { p_org: org })
      const a = Array.isArray(filas) ? filas[0] : filas
      if (!a?.bisu_cipher) continue

      const bisu = await descifrar(desdeHexPg(a.bisu_cipher), desdeHexPg(a.bisu_nonce), a.bisu_kid)

      // El token de app —`APP_ID|APP_SECRET`— y no el propio BISU: `debug_token`
      // pide un token con autoridad sobre la app para poder inspeccionar otro.
      const url = new URL(`https://graph.facebook.com/${V}/debug_token`)
      url.searchParams.set('input_token', bisu)
      url.searchParams.set('access_token', `${APP_ID}|${APP_SECRET}`)

      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      const d = (await r.json().catch(() => ({}))) as {
        data?: {
          is_valid?: boolean
          expires_at?: number
          scopes?: string[]
          error?: { message?: string; code?: number }
        }
        error?: { message?: string }
      }
      const dato = d.data

      // Sin `data` no se sabe nada, y «no se sabe» NO es «está muerto». Marcar
      // inválida una autorización sana por un fallo de red le enseñaría al
      // cliente a reautorizar sin motivo, que es la forma más rápida de que deje
      // de hacer caso al aviso el día que sea verdad.
      if (!dato) {
        resumen.push({ org, valida: true, motivo: 'sin respuesta de debug_token' })
        continue
      }

      const valida = dato.is_valid === true
      // `expires_at: 0` significa «no caduca», no «caducó en 1970».
      const expira = dato.expires_at && dato.expires_at > 0
        ? new Date(dato.expires_at * 1000).toISOString()
        : null

      await rpc('anotar_autorizacion', {
        p_org: org,
        p_valida: valida,
        p_expira_en: expira,
        p_scopes: dato.scopes ?? null,
        p_motivo: valida ? null : (dato.error?.message ?? 'Meta la da por inválida').slice(0, 200),
      })

      resumen.push({ org, valida, motivo: valida ? undefined : dato.error?.message })
    } catch (err) {
      // Un fallo con una organización no puede dejar sin comprobar a las demás.
      resumen.push({ org, valida: true, motivo: `no se pudo comprobar: ${limpiar(String(err))}` })
    }
  }

  return new Response(JSON.stringify({ ok: true, comprobadas: resumen.length, resumen }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
