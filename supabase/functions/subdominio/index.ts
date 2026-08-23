/**
 * Da de alta el subdominio de una organizacion en Netlify.
 *
 * POR QUE HACE FALTA UNA FUNCION PARA ESTO.
 *
 * La zona de `kavea.ai` vive en Netlify DNS con un registro POR HOST: no hay
 * comodin. El 2-ago se intento `*.kavea.ai` y Netlify lo bloqueo — no es
 * autoservicio, requiere ticket. Mientras eso siga asi, cada inquilino necesita
 * su alias en el sitio, y sin el su subdominio simplemente no resuelve.
 *
 * Eso era tolerable cuando las altas las conducia Boosty a mano. Con el registro
 * self-service abierto deja de serlo: alguien se registra, `registrarse` le crea
 * la organizacion, y aterriza en un host muerto. El alta diria «hecho» — que es
 * exactamente el fallo de la 0059 repetido en otra capa.
 *
 * Comprobado el 23-ago-2026 que la API sirve: al añadir `cuenta` y `conectar`
 * como alias, Netlify creo los registros DNS y emitio certificado, y los dos
 * hosts respondieron 200 en segundos.
 *
 * EL TOKEN DE NETLIFY ES DE CUENTA, no de sitio: alcanza los veinte sitios del
 * usuario. Por eso vive aqui, en el almacen de secretos del borde, y no en el
 * entorno de Next: la app pide, el borde decide. Y por eso esta funcion NO
 * acepta un site_id por parametro — el sitio lo fija el secreto.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const NETLIFY = Deno.env.get('KAVEA_NETLIFY_TOKEN') ?? ''
const SITIO = Deno.env.get('KAVEA_NETLIFY_SITE_ID') ?? ''
const RAIZ = Deno.env.get('KAVEA_DOMINIO_RAIZ') ?? 'kavea.ai'

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  try {
    if (!NETLIFY || !SITIO) return json({ error: 'sin configurar' }, 503)

    const { organizacion } = await req.json().catch(() => ({})) as { organizacion?: string }
    if (!organizacion) return json({ error: 'falta la organización' }, 400)

    // EL SLUG SE LEE DE LA BASE, NO SE ACEPTA POR PARAMETRO. Si viniera de
    // fuera, quien llamara a esta funcion podria pedir un alias para cualquier
    // host —`admin`, `cuenta`— y apuntarlo a este sitio. Aqui solo se puede
    // pedir el subdominio que una organizacion YA tiene, y el CHECK de la 0087
    // garantiza que ese slug nunca es uno de la plataforma.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('KAVEA_SUPABASE_SECRET') ?? '',
    )
    const { data: org, error } = await supabase
      .from('organizations').select('slug').eq('id', organizacion).maybeSingle()

    if (error) return json({ error: 'no se pudo leer la organización' }, 500)
    if (!org?.slug) return json({ error: 'no existe esa organización' }, 404)

    const host = `${org.slug}.${RAIZ}`

    const cabeceras = {
      Authorization: `Bearer ${NETLIFY}`,
      'Content-Type': 'application/json',
    }

    const sitio = await fetch(`https://api.netlify.com/api/v1/sites/${SITIO}`, {
      headers: cabeceras,
      signal: AbortSignal.timeout(20_000),
    })
    if (!sitio.ok) return json({ error: 'Netlify no contesta', http: sitio.status }, 502)

    const actual = (await sitio.json()) as { domain_aliases?: string[] }
    const alias = actual.domain_aliases ?? []

    // Idempotente a proposito: /crear puede reintentarse, y un alta que ya
    // aprovisiono no puede fallar la segunda vez.
    if (alias.includes(host)) return json({ ok: true, host, ya_estaba: true })

    const r = await fetch(`https://api.netlify.com/api/v1/sites/${SITIO}`, {
      method: 'PATCH',
      headers: cabeceras,
      body: JSON.stringify({ domain_aliases: [...alias, host] }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!r.ok) {
      // El cuerpo de Netlify se recorta: nunca se devuelve entero, por la misma
      // regla que las respuestas de Meta.
      const detalle = (await r.text().catch(() => '')).slice(0, 200)
      return json({ error: 'Netlify rechazó el alias', http: r.status, detalle }, 502)
    }

    const despues = (await r.json()) as { domain_aliases?: string[] }
    return json({
      ok: (despues.domain_aliases ?? []).includes(host),
      host,
      total_alias: (despues.domain_aliases ?? []).length,
    })
  } catch (err) {
    return json({ error: String(err).slice(0, 300) }, 500)
  }
})
