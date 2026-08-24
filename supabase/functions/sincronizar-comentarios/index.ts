/**
 * Lee los comentarios de Instagram y los mete en la bandeja de comentarios.
 *
 * POR QUÉ EXISTE, SI YA HAY INGESTA POR WEBHOOK
 *
 * Porque el webhook no llega. Comprobado el 6 de agosto de 2026: se comentó una
 * publicación real de la cuenta conectada y no entró ni un evento. Falta la
 * suscripción al campo `comments` del objeto `instagram`, que se configura en el
 * panel de Meta.
 *
 * Y AUNQUE LLEGARA, ESTO SEGUIRÍA HACIENDO FALTA. Un webhook es una entrega, y
 * una entrega se pierde: tras una hora de fallos Meta desuscribe en silencio, y
 * lo que no llegó no vuelve solo. Esta lectura es la que reconcilia y descubre el
 * hueco, igual que el reconciliador de suscripciones.
 *
 * UNA ORGANIZACIÓN, TODAS SUS CUENTAS. Hasta el 24-ago esto hacía
 *
 *     const ig = rutas.find((r) => r.tipo === 'ig_business_account')
 *
 * sobre la tabla ENTERA: la primera cuenta que devolviera Postgres, de quien
 * fuera. Con una sola conectada acertaba siempre; desde que hay tres, pulsar
 * «Traer de Meta» en un espacio podía leer la cuenta de otro. Ahora la
 * organización llega por parámetro —resuelta en el servidor desde el Host y la
 * sesión, no del cuerpo de la petición del navegador— y se recorren TODAS sus
 * cuentas, que es lo que el operador cree que hace el botón.
 *
 * NO SE PAGINA HASTA EL FINAL, y es deliberado. Se leen las publicaciones más
 * recientes y sus comentarios. Recorrer el historial entero de una cuenta con
 * años de contenido en una función con presupuesto de CPU es cómo se construye
 * un trabajo que muere a mitad y deja la mitad aplicada. Los comentarios viejos,
 * si alguna vez hacen falta, son otro trabajo con su cursor.
 */

import { conToken, conexionesDeOrganizacion, type Conexion } from '../_compartido/token-pagina.ts'

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

/** Publicaciones que se miran por pasada y cuenta. Las nuevas primero, que es donde se comenta. */
const MEDIA = 12

type Comentario = { id?: string; username?: string; text?: string; timestamp?: string }
type Media = { id?: string; comments_count?: number; comments?: { data?: Comentario[] } }

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
      'User-Agent': 'kavea-comentarios/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

/** Todas las conexiones vivas con Instagram, cuando no se pide una organización. */
async function todasConInstagram(): Promise<Conexion[]> {
  return await sql<Conexion[]>(
    'meta_connections?select=id,page_id,page_name,ig_business_account_id,ig_username,organization_id' +
    '&estado=eq.connected&ig_business_account_id=not.is.null',
  )
}

Deno.serve(async (req: Request): Promise<Response> => {
  const t0 = Date.now()
  // `nuevos` y `refrescados`, no «aplicados». El upsert siempre aplica: la
  // primera versión contaba eso y anunciaba tres traídos en una pasada que no
  // cambió una sola fila. Un resumen que miente es peor que no tenerlo, porque
  // se cree, y este es el que dirá si la lectura está supliendo al webhook.
  const resumen = { cuentas: 0, publicaciones: 0, comentarios: 0, nuevos: 0, refrescados: 0 }
  const avisos: string[] = []

  try {
    const { organizacion } = await req.json().catch(() => ({})) as { organizacion?: string }

    const conexiones = (organizacion
      ? await conexionesDeOrganizacion(organizacion)
      : await todasConInstagram()
    ).filter((c) => c.ig_business_account_id)

    if (conexiones.length === 0) {
      return new Response(JSON.stringify({ error: 'no hay ninguna cuenta de Instagram conectada' }),
        { status: 409 })
    }

    const campos = 'id,comments_count,comments.limit(50){id,username,text,timestamp}'

    for (const cx of conexiones) {
      resumen.cuentas++

      // Una cuenta que falla no tumba a las demás: son clientes distintos y
      // dejar a los otros sin leer por un token caducado ajeno sería peor.
      const r = await conToken<{ data?: Media[] }>(cx, async (token) => {
        const res = await fetch(
          `https://graph.facebook.com/${V}/${encodeURIComponent(cx.ig_business_account_id!)}` +
            `/media?fields=${encodeURIComponent(campos)}&limit=${MEDIA}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) },
        )
        const j = await res.json().catch(() => ({})) as { data?: Media[]; error?: Record<string, unknown> }
        if (!res.ok || j.error) return { ok: false, error: (j.error ?? { message: `HTTP ${res.status}` }) as never }
        return { ok: true, datos: j }
      })

      if (!r.ok) {
        avisos.push(`@${cx.ig_username ?? cx.ig_business_account_id}: ${r.error}`)
        continue
      }
      if (r.aviso) avisos.push(`@${cx.ig_username ?? cx.ig_business_account_id}: ${r.aviso}`)

      for (const m of r.datos?.data ?? []) {
        resumen.publicaciones++
        for (const c of m.comments?.data ?? []) {
          if (!c.id) continue
          resumen.comentarios++

          const efecto = {
            organization_id: cx.organization_id,
            canal: 'instagram',
            asset_id: cx.ig_business_account_id,
            comment_id: c.id,
            post_id: m.id ?? null,
            autor_username: c.username ?? null,
            texto: c.text ?? null,
            // `timestamp` viene ISO con desfase; la tabla guarda milisegundos.
            meta_timestamp_ms: c.timestamp ? Date.parse(c.timestamp) : null,
            // Se guarda lo que Meta devolvió, igual que hace la ingesta por webhook:
            // el día que la forma cambie, el crudo es lo único que lo explica.
            raw: c,
          }

          const res = await sql<{ estado?: string; nuevo?: boolean }>('rpc/ingerir_comentario', {
            method: 'POST',
            body: JSON.stringify({ p: efecto }),
          })
          if (res?.nuevo) resumen.nuevos++
          else resumen.refrescados++
        }
      }
    }

    return new Response(JSON.stringify({ ...resumen, avisos, ms: Date.now() - t0 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300), ...resumen }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
})
