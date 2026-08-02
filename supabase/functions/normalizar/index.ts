/**
 * Normalizador: convierte cuerpos crudos de Meta en conversaciones.
 *
 * EL LÍMITE QUE MANDA SOBRE TODO EL DISEÑO son los 2 segundos de CPU por
 * petición de las Edge Functions de Supabase. Los 400 s que anuncia son de
 * RELOJ: esperar no ayuda, porque parsear mil updates y construir sus efectos
 * es cómputo puro. La única salida es trocear.
 *
 * El cursor marca por dónde iba y avanza EN LA MISMA TRANSACCIÓN que confirma
 * el tramo. Si la función muere a mitad, la reanudación empieza donde se quedó;
 * si el cursor se quedó corto, se repite un tramo y todos sus efectos vuelven
 * como `duplicado`. Nunca se pierde, como mucho se repite.
 */

import { aplanar, aEfectos, type Efecto } from '../_compartido/adaptadores.ts'
import { alertar } from '../_compartido/almacen.ts'

/** Tope duro del RPC: es el caché de subtransacciones del backend. */
const EFECTOS_POR_LOTE = 64

/** Presupuesto de CPU que se deja consumir antes de ceder la fila. */
const MS_CPU = 1_200

/** Filas por invocación. Con más, se deja para la siguiente. */
const FILAS = 5

function claveServicio(): string {
  const c = Deno.env.get('KAVEA_SUPABASE_SECRET')
  if (!c) throw new Error('Falta KAVEA_SUPABASE_SECRET')
  return c
}

async function rest<T>(ruta: string, init?: RequestInit): Promise<T> {
  const clave = claveServicio()
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kavea-normalizador/0.1',
      ...(init?.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`postgrest ${r.status} ${(await r.text()).slice(0, 200)}`)
  if (r.status === 204) return undefined as T
  const t = await r.text()
  return (t ? JSON.parse(t) : undefined) as T
}

type Fila = {
  id: number
  cuerpo_crudo: string
  cursor_update: number
  intentos: number
}

type Ruta = { asset_id: string; organization_id: string; meta_connection_id: string }
type Canal = { id: string; organization_id: string; meta_connection_id: string; canal: string }

/**
 * Resolución de tenant SIN caché.
 *
 * `asset_id` es clave primaria de `meta_asset_routes`, así que resolver es un
 * único acierto de índice: una consulta por cuerpo, no por update. Una caché
 * ahorraría microsegundos y reintroduciría el peor fallo posible del sistema
 * —escribir mensajes de un cliente en el tenant de otro— por una entrada
 * obsoleta tras un cambio de alta o de baja. No compensa.
 */
async function resolver(assetId: string): Promise<{ org: string; conexion: string } | null> {
  const r = await rest<Ruta[]>(
    `meta_asset_routes?select=asset_id,organization_id,meta_connection_id&asset_id=eq.${encodeURIComponent(assetId)}`,
  )
  const f = r?.[0]
  return f ? { org: f.organization_id, conexion: f.meta_connection_id } : null
}

async function canalDe(conexion: string, canal: string): Promise<string | null> {
  const r = await rest<Canal[]>(
    `channels?select=id&meta_connection_id=eq.${conexion}&canal=eq.${canal}`,
  )
  return r?.[0]?.id ?? null
}

/** Retroceso exponencial: 5 s, 25 s, 2 min, 10 min, 50 min, 4 h. */
function retroceso(intentos: number): string {
  const seg = Math.min(5 * Math.pow(5, Math.max(0, intentos - 1)), 6 * 3600)
  return new Date(Date.now() + seg * 1000).toISOString()
}

Deno.serve(async (): Promise<Response> => {
  const t0 = Date.now()
  const quien = crypto.randomUUID().slice(0, 8)
  // `sinEfectos` cuenta los cuerpos que el adaptador no entiende. No es un
  // error, pero si crece hay una forma de payload nueva que Kavea está tirando
  // a la basura sin enterarse: es la métrica que lo delata.
  const resumen = {
    reclamadas: 0, completadas: 0, cedidas: 0, fallidas: 0, efectos: 0, sinEfectos: 0,
  }

  try {
    const filas = await rest<Fila[]>('rpc/webhook_events_reclamar', {
      method: 'POST',
      body: JSON.stringify({ p_limite: FILAS, p_quien: quien }),
      })
    resumen.reclamadas = filas?.length ?? 0

    for (const f of filas ?? []) {
      try {
        const cuerpo = JSON.parse(f.cuerpo_crudo) as unknown
        const updates = aplanar(cuerpo)
        const total = updates.length

        /**
         * UN CUERPO QUE NO PRODUCE NADA TAMBIÉN TERMINA.
         *
         * El bucle de abajo es `while (i < total)`. Con `total = 0` no se
         * ejecuta ni una vez, así que `ingerir_tramo` nunca se llama con
         * `p_final` y la fila se queda en `en_proceso` PARA SIEMPRE: el segador
         * la devuelve a pendiente cada diez minutos, el normalizador la vuelve a
         * reclamar, y así indefinidamente. Una fuga lenta y silenciosa.
         *
         * Cuándo pasa: cualquier payload cuya forma `aplanar` no entienda. Hasta
         * hoy no ocurría porque solo llegaban `messaging[]` y `standby[]`. Al
         * suscribir `feed` para sondear los comentarios empezaron a entrar
         * cuerpos con `changes[]`, que producen cero updates, y el fallo se hizo
         * alcanzable.
         *
         * El invariante del docs/03 dice que un tipo desconocido va a fallback y
         * nunca tumba el lote. Eso estaba resuelto para un ADJUNTO desconocido;
         * para un CUERPO entero desconocido, no. Aquí se cierra: se marca
         * procesado, el cuerpo crudo se conserva, y queda constancia de que no
         * se aplicó nada.
         */
        if (total === 0) {
          await rest('rpc/ingerir_tramo', {
            method: 'POST',
            body: JSON.stringify({
              p_evento: f.id, p_efectos: [], p_cursor: 0, p_total: 0, p_final: true,
            }),
          })
          resumen.completadas++
          resumen.sinEfectos++
          continue
        }

        // Cachés locales a esta fila: el mismo asset se repite en todo el lote.
        const rutas = new Map<string, { org: string; conexion: string } | null>()
        const canales = new Map<string, string | null>()

        let i = f.cursor_update
        let lote: Efecto[] = []
        let cedido = false

        while (i < total) {
          // Se cede ANTES de empezar un lote nuevo, no a mitad: así el cursor
          // siempre queda en una frontera limpia.
          if (Date.now() - t0 > MS_CPU && lote.length === 0) {
            cedido = true
            break
          }

          const u = updates[i]!

          if (!rutas.has(u.assetId)) rutas.set(u.assetId, await resolver(u.assetId))
          const r = rutas.get(u.assetId)!

          if (!r) {
            // Un entry[].id que no resuelve se registra y se descarta. NUNCA se
            // adivina: escribir en el tenant equivocado es el peor fallo posible.
            await alertar('tenant_no_resuelto', 'p1', { asset_id: u.assetId, evento: f.id })
            i++
            continue
          }

          const ck = `${r.conexion}|${u.canal}`
          if (!canales.has(ck)) canales.set(ck, await canalDe(r.conexion, u.canal))
          const canalId = canales.get(ck)
          if (!canalId) {
            await alertar('canal_no_encontrado', 'p2', {
              conexion: r.conexion, canal: u.canal, evento: f.id,
            })
            i++
            continue
          }

          lote.push(...aEfectos(u, r.org, canalId))
          i++

          if (lote.length >= EFECTOS_POR_LOTE || i >= total) {
            const esFinal = i >= total
            await rest('rpc/ingerir_tramo', {
              method: 'POST',
              body: JSON.stringify({
                p_evento: f.id, p_efectos: lote, p_cursor: i, p_total: total, p_final: esFinal,
              }),
            })
            resumen.efectos += lote.length
            lote = []
          }
        }

        if (cedido) {
          // Vuelve a pendiente disponible ya: otra invocación la retoma desde
          // el cursor. No cuenta como intento fallido.
          await rest(`webhook_events?id=eq.${f.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              estado: 'pendiente', reclamado_en: null, reclamado_por: null,
              disponible_en: new Date().toISOString(), cursor_update: i, updates_total: total,
            }),
          })
          resumen.cedidas++
        } else {
          resumen.completadas++
        }
      } catch (e) {
        resumen.fallidas++
        await rest(`webhook_events?id=eq.${f.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            estado: f.intentos >= 6 ? 'cuarentena' : 'pendiente',
            reclamado_en: null,
            reclamado_por: null,
            disponible_en: retroceso(f.intentos),
            error: String(e).slice(0, 400),
          }),
        }).catch(() => {})
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
