/**
 * Reconciliación de suscripciones de webhooks.
 *
 * POR QUÉ EXISTE, literal del docs/03:
 *
 *   "a los 15 minutos de entregas fallidas Meta manda una alerta, y tras 1 hora
 *   de fallos continuados llega Webhooks Disabled y la app queda DESUSCRITA de
 *   esa Página o cuenta de Instagram, con resuscripción manual."
 *
 * Una caída de una hora no degrada Kavea: la apaga por cliente y en silencio.
 * No llega ningún error, simplemente dejan de entrar eventos. Este cron es la
 * mitigación, y sin él la ingesta no es autorreparable.
 *
 * Corre cada 15 minutos desde pg_cron. Consulta el estado real en Meta y
 * re-suscribe lo que falte.
 */

import { descifrar, desdeHexPg } from '../_compartido/cripto.ts'
import { alertar } from '../_compartido/almacen.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'
const APP_ID = Deno.env.get('META_APP_ID') ?? ''

const CAMPOS_MESSENGER = [
  'messages',
  'messaging_postbacks',
  'message_echoes',
  'message_reads',
  'message_reactions',
  'messaging_referrals',
  'messaging_optins',
  'messaging_handovers',

  // SONDA DE COMENTARIOS, 2 de agosto de 2026.
  //
  // Los comentarios ENTRAN EN V1 desde el 3 de agosto de 2026 por decisión de
  // Gabriel, recogida en docs/03. Kavea todavía no los procesa: `aplanar` solo
  // lee messaging[] y standby[], así que un `changes[]` se guarda crudo en
  // `webhook_events` y produce cero efectos. Eso es lo correcto mientras nada
  // los consuma.
  //
  // Lo que sigue vigente del análisis original es la forma del dato, y es la
  // razón de que la ingesta de comentarios sea un camino aparte y no un caso
  // más: no tienen ventana de 24 h, no tienen conversación, y traen comment_id
  // en vez de PSID o IGSID.
  //
  // Se suscriben igualmente para PODER MEDIR si llegan y con qué forma exacta.
  // Suscribirse a un campo usa `pages_manage_metadata`, que ya tenemos, y NO
  // añade ningún permiso al App Review pendiente: eso importa, porque pedir
  // scopes de más es causa documentada de rechazo.
  //
  // La fase de comentarios arranca con la forma real del payload en la mano en
  // vez de con dos páginas de Meta contradiciéndose.
  'feed',
]

// PROBADO Y DESCARTADO, 2 de agosto de 2026: `comments` NO es un campo válido
// de `subscribed_apps` de una Página. Meta rechaza el POST entero con él en la
// lista. Se comprobó en vivo y la suscripción existente quedó intacta —el POST
// es atómico—, pero mientras estuvo puesto el reconciliador reportaba fallo
// cada quince minutos.
//
// OJO CON LA CAPA, verificado por API el 3 de agosto de 2026: a nivel de APP el
// topic `instagram` sí lleva `comments` entre sus campos suscritos. Lo que Meta
// rechaza es el `comments` POR PÁGINA en subscribed_apps. Son dos suscripciones
// distintas y confundirlas hace perder una tarde.
//
// Consecuencia: los comentarios de Instagram no se pueden habilitar solo con
// `pages_manage_metadata`. Necesitan `instagram_manage_comments` en Advanced
// Access, es decir, otra ronda de App Review. Y aunque los comentarios ya están
// DENTRO de v1 desde el 3 de agosto de 2026, el permiso NO se añade al envío
// antes de que la ingesta exista: Meta exige una llamada exitosa por permiso en
// los 30 días previos y un screencast del permiso funcionando. Hoy no hay ni
// una ni otro, y pedir scopes de más es causa documentada de rechazo.

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
      'User-Agent': 'kavea-reconciliador/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)

  // Un PATCH sin `Prefer: return=representation` responde 204 sin cuerpo.
  // Llamar a r.json() sobre eso lanza "Unexpected end of JSON input", y el
  // error aparece como fallo de reconciliación cuando en realidad la
  // reconciliación fue bien y lo que falló fue registrar el resultado.
  if (r.status === 204) return undefined as T
  const texto = await r.text()
  return (texto ? JSON.parse(texto) : undefined) as T
}

type Conexion = {
  id: string
  organization_id: string
  page_id: string
  meta_credentials: Array<{
    page_access_token_cipher: string
    page_access_token_nonce: string
    page_access_token_kid: string
  }> | null
}

Deno.serve(async (): Promise<Response> => {
  const resumen = { revisadas: 0, ok: 0, resuscritas: 0, fallidas: 0 }

  try {
    // El join trae la credencial cifrada; el token en claro no sale nunca de
    // esta función.
    const conexiones = await sql<Conexion[]>(
      'meta_connections?select=id,organization_id,page_id,meta_credentials(page_access_token_cipher,page_access_token_nonce,page_access_token_kid)&estado=neq.disconnected',
    ).catch(async () => {
      // El esquema `private` no se expone por la API, así que el join anterior
      // falla. Se leen las conexiones y las credenciales van por RPC.
      return await sql<Conexion[]>(
        'meta_connections?select=id,organization_id,page_id&estado=neq.disconnected',
      )
    })

    resumen.revisadas = conexiones.length

    for (const c of conexiones) {
      try {
        const cred = c.meta_credentials?.[0] ??
          (await sql<Conexion['meta_credentials']>(
            `rpc/credencial_de_conexion`,
            { method: 'POST', body: JSON.stringify({ p_conexion: c.id }) },
          ))?.[0]

        if (!cred) throw new Error('sin credencial')

        const token = await descifrar(
          desdeHexPg(cred.page_access_token_cipher),
          desdeHexPg(cred.page_access_token_nonce),
          cred.page_access_token_kid,
        )

        // Estado REAL en Meta. Es la fuente de verdad, no lo que diga la base.
        const r = await fetch(
          `https://graph.facebook.com/${V}/${c.page_id}/subscribed_apps`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const j = (await r.json()) as {
          data?: Array<{ id: string; subscribed_fields?: string[] }>
          error?: { code?: number; message?: string }
        }

        if (j.error) {
          // 190 = token invalidado. Se marca y se PARA: reintentar un 190 en
          // bucle no lo arregla y quema cuota.
          if (j.error.code === 190) {
            await sql(`meta_connections?id=eq.${c.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                estado: 'disconnected',
                token_invalid_since: new Date().toISOString(),
              }),
            })
            await alertar('token_invalido', 'p1', {
              organization_id: c.organization_id,
              page_id: c.page_id,
            })
            resumen.fallidas++
            continue
          }
          throw new Error(`graph ${j.error.code}: ${j.error.message}`)
        }

        const mia = (j.data ?? []).find((a) => a.id === APP_ID)
        const suscritos = new Set(mia?.subscribed_fields ?? [])
        const faltan = CAMPOS_MESSENGER.filter((f) => !suscritos.has(f))

        if (!mia || faltan.length > 0) {
          // Aquí es donde se cura la desuscripción silenciosa.
          const alta = await fetch(
            `https://graph.facebook.com/${V}/${c.page_id}/subscribed_apps`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: `subscribed_fields=${CAMPOS_MESSENGER.join(',')}`,
            },
          )
          if (!alta.ok) throw new Error(`resuscripcion ${alta.status}`)

          await alertar('desuscripcion', 'p1', {
            organization_id: c.organization_id,
            page_id: c.page_id,
            faltaban: mia ? faltan : ['la app entera'],
            resuscrita: true,
          })
          resumen.resuscritas++
        } else {
          resumen.ok++
        }

        await sql(`meta_connections?id=eq.${c.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            subscription_ok: true,
            last_subscription_check_at: new Date().toISOString(),
            subscribed_fields_messenger: CAMPOS_MESSENGER,
            token_last_verified_at: new Date().toISOString(),
          }),
        })
      } catch (e) {
        resumen.fallidas++
        await alertar('reconciliacion_fallida', 'p2', {
          organization_id: c.organization_id,
          page_id: c.page_id,
          error: String(e).slice(0, 200),
        })
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
