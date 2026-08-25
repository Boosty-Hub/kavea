/**
 * Plantillas de utilidad de Messenger.
 *
 * Son otra cosa que las plantillas de `public.plantillas`. Aquellas son texto que
 * el operador reutiliza al escribir, y viven en Postgres. Estas son objetos de
 * Meta: se crean contra la Página, Meta las aprueba, y su estado —APPROVED,
 * PENDING, REJECTED— lo decide Meta y puede cambiar sin avisarnos.
 *
 * POR QUÉ NO SE GUARDAN EN POSTGRES
 *
 * Porque el estado no es nuestro. Una copia local de algo que aprueba un tercero
 * es una copia que se queda desfasada: la plantilla pasa a REJECTED en Meta,
 * Kavea sigue enseñándola en verde, y el operador la usa. Se lee en vivo. Cuesta
 * una llamada por visita a una pantalla que se abre poco.
 *
 * EL TOKEN
 *
 * `GET|POST /{page-id}/message_templates` exige un PAGE access token con
 * `pages_utility_messaging`. Comprobado el 6 de agosto de 2026: con el token de
 * system user directo devuelve
 *
 *   (#200) User does not have sufficient administrative permission for this
 *   action on this page
 *
 * y con el Page token derivado de ese mismo system user devuelve la lista. Así
 * que se deriva en cada invocación, igual que hace `portafolio`.
 *
 * No se usa la credencial cifrada de la conexión a propósito: esa se emitió
 * antes de que el system user tuviera este ámbito, y no lo lleva. Derivar aquí
 * evita tener que reconectar una Página viva solo para ampliar un permiso.
 */

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

type Plantilla = {
  id?: string
  name?: string
  language?: string
  status?: string
  category?: string
  components?: unknown[]
  rejected_reason?: string
}

function tokenPortafolio(): string {
  const t = Deno.env.get('META_PORTFOLIO_TOKEN')
  if (!t) throw new Error('No hay token de portafolio configurado.')
  return t
}

/** El Page Access Token, derivado en cada invocación. Ver la cabecera. */
async function tokenDePagina(pageId: string): Promise<string> {
  const r = await fetch(
    `https://graph.facebook.com/${V}/${encodeURIComponent(pageId)}?fields=access_token`,
    { headers: { Authorization: `Bearer ${tokenPortafolio()}` } },
  )
  const j = await r.json() as { access_token?: string; error?: { message?: string } }
  if (!j.access_token) {
    throw new Error(j.error?.message ?? 'no se pudo derivar el token de la Página')
  }
  return j.access_token
}

/**
 * El cuerpo de una plantilla nueva.
 *
 * Solo BODY. Meta admite HEADER y BUTTONS, y Kavea no los ofrece todavía: es
 * mejor no enseñar un formulario que promete más de lo que el producto sabe
 * mandar después. La categoría es siempre UTILITY porque es la única que este
 * permiso concede.
 *
 * LOS EJEMPLOS NO SON OPCIONALES CUANDO HAY VARIABLES.
 *
 * Una plantilla con `{{1}}` y sin `example` se crea —Meta devuelve id— y nace
 * REJECTED en el mismo instante. Medido el 6 de agosto de 2026: `aviso_de_pedido`
 * con dos variables y sin ejemplos volvió con `status: REJECTED` sin más
 * explicación. Es el peor modo de fallo posible, porque la llamada «funciona» y
 * el rechazo hay que ir a buscarlo en la respuesta.
 *
 * `body_text` es una lista de listas: una fila de valores por cada juego de
 * ejemplos, y Meta con una tiene bastante.
 */
/**
 * Los huecos CON NOMBRE, en orden y sin repetir.
 *
 * Messenger los admite igual que WhatsApp: `parameter_format: 'NAMED'` con
 * `example.body_text_named_params`. Comprobado contra la Página el 25-ago — una
 * plantilla con `{{contacto_nombre}}` salió APPROVED en segundos.
 *
 * Con nombres el texto ES el mapeo, y no hace falta una lista aparte que diga qué
 * campo va en cada posición y que pueda discrepar del cuerpo.
 */
/**
 * El motivo de verdad de un error de Meta.
 *
 * `error.message` es casi siempre «Invalid parameter», que no dice nada. La
 * explicación buena está en `error_user_msg` —Y EN CASTELLANO, porque Meta la
 * traduce— y el titular en `error_user_title`. Mostrar solo `message` fue lo que
 * dejó al operador con un «Invalid parameter» delante mientras Meta había escrito
 * «las variables no pueden estar al principio ni al final de la plantilla».
 *
 * Se juntan los tres por orden de utilidad y sin repetir: el titular a veces es
 * el resumen del mensaje y a veces añade algo.
 */
function motivoDeMeta(e: Record<string, unknown> | undefined): string {
  if (!e) return 'Meta rechazó la petición sin decir por qué.'
  const msg = typeof e.error_user_msg === 'string' ? e.error_user_msg.trim() : ''
  const titulo = typeof e.error_user_title === 'string' ? e.error_user_title.trim() : ''
  const generico = typeof e.message === 'string' ? e.message.trim() : ''
  const base = msg
    ? (titulo && !msg.startsWith(titulo) ? `${titulo}: ${msg}` : msg)
    : (titulo || generico || 'Meta rechazó la petición sin decir por qué.')

  /**
   * SI META DICE QUE FUE PASAJERO, SE DICE.
   *
   * El 25-ago un alta falló con «Message Template Creation Failed: An error
   * occurred while creating message template» —el título y el mensaje de Meta,
   * los dos vacíos de contenido— y la misma plantilla, con el mismo nombre y el
   * mismo cuerpo, entró aprobada un rato después. Sin esta línea el operador se
   * queda mirando un error que no explica nada y no sabe si reintentar o cambiar
   * el nombre. `is_transient` lo dice y no costaba nada leerlo.
   */
  return e.is_transient === true
    ? `${base} · Meta lo marca como fallo pasajero: vuelve a intentarlo con el mismo nombre.`
    : base
}

/**
 * Una variable al principio o al final del cuerpo es un rechazo seguro.
 *
 * Regla de Meta, comprobada el 25-ago: «Las variables no pueden estar al principio
 * ni al final de la plantilla». No está en ninguna guía que hubiéramos leído y su
 * error es un «Invalid parameter» pelado. Se para aquí, que cuesta un intento
 * menos y no gasta el nombre.
 */
function huecoEnBorde(cuerpo: string): string | null {
  const t = cuerpo.trim()
  if (/^\{\{/.test(t)) {
    return 'El cuerpo no puede EMPEZAR por una variable. Meta lo rechaza: pon algo de texto delante.'
  }
  if (/\}\}$/.test(t)) {
    return 'El cuerpo no puede TERMINAR en una variable. Meta lo rechaza: añade algo de texto detrás, '
      + 'aunque sea un punto o una frase corta.'
  }
  return null
}

function nombradasDe(texto: string): string[] {
  const vistos: string[] = []
  for (const m of texto.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)) {
    if (!vistos.includes(m[1]!)) vistos.push(m[1]!)
  }
  return vistos
}

function componentes(
  cuerpo: string, ejemplos: string[], nombrados?: Record<string, string>,
): unknown[] {
  const body: Record<string, unknown> = { type: 'BODY', text: cuerpo }
  const conNombre = nombradasDe(cuerpo)
  if (conNombre.length > 0) {
    body.example = {
      body_text_named_params: conNombre.map((n) => ({
        param_name: n, example: (nombrados ?? {})[n] ?? n,
      })),
    }
  } else if (ejemplos.length > 0) {
    body.example = { body_text: [ejemplos] }
  }
  return [body]
}

/** Cuántos `{{n}}` distintos lleva el texto. Decide cuántos ejemplos hacen falta. */
function variablesDe(texto: string): number {
  const vistos = new Set<string>()
  for (const m of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) vistos.add(m[1]!)
  return vistos.size
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  let cuerpo: {
    accion?: string; page_id?: string; nombre?: string
    idioma?: string; texto?: string; ejemplos?: string[]
    /** Nombre → ejemplo, para los huecos con nombre. */
    ejemplos_nombrados?: Record<string, string>
  }
  try {
    cuerpo = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'cuerpo no válido' }), { status: 400 })
  }

  const pageId = (cuerpo.page_id ?? '').trim()
  if (!pageId) {
    return new Response(JSON.stringify({ error: 'falta la Página' }), { status: 400 })
  }

  try {
    const token = await tokenDePagina(pageId)
    const base = `https://graph.facebook.com/${V}/${encodeURIComponent(pageId)}/message_templates`

    // --- listar ---------------------------------------------------------------
    if (cuerpo.accion === 'listar' || !cuerpo.accion) {
      // `rejected_reason` SE PIDE POR SU NOMBRE. Meta no lo manda si no se
      // nombra, y sin él la pantalla enseña «Rechazada» y nada más — que es lo
      // que pasó el 24-ago: dos plantillas en rojo y ninguna pista. Los motivos
      // eran `INCORRECT_CATEGORY` y `INVALID_FORMAT`, y los dos se arreglan
      // solos en cuanto se leen.
      const campos = 'id,name,status,category,language,components,rejected_reason'
      const r = await fetch(`${base}?fields=${campos}&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await r.json() as { data?: Plantilla[]; error?: Record<string, unknown> }
      if (j.error) {
        return new Response(JSON.stringify({ error: motivoDeMeta(j.error) }), { status: 502 })
      }
      return new Response(JSON.stringify({ plantillas: j.data ?? [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }

    // --- crear ----------------------------------------------------------------
    if (cuerpo.accion === 'crear') {
      const nombre = (cuerpo.nombre ?? '').trim()
      const texto = (cuerpo.texto ?? '').trim()
      const idioma = (cuerpo.idioma ?? 'es_ES').trim()

      // El nombre lo fija Meta: minúsculas, dígitos y guion bajo. Se valida aquí
      // y no se «arregla» en silencio: si el operador escribe «Aviso de envío» y
      // Kavea lo convierte a `aviso_de_envio` sin decirlo, la plantilla que ve en
      // el panel de Meta no es la que él nombró.
      if (!/^[a-z][a-z0-9_]{1,60}$/.test(nombre)) {
        return new Response(JSON.stringify({
          error: 'El nombre solo admite minúsculas, números y guion bajo, y empieza por letra.',
        }), { status: 400 })
      }
      if (texto.length < 1 || texto.length > 1024) {
        return new Response(JSON.stringify({ error: 'El texto está vacío o pasa de 1024 caracteres.' }),
          { status: 400 })
      }

      // Se rechaza AQUÍ y no se deja que lo rechace Meta. Una plantilla creada
      // sin ejemplos nace REJECTED y hay que borrarla y volver a empezar con otro
      // nombre; un error antes de llamar cuesta un intento y no ensucia la Página.
      const ejemplos = (cuerpo.ejemplos ?? []).map((s) => String(s).trim()).filter(Boolean)
      const borde = huecoEnBorde(texto)
      if (borde) return new Response(JSON.stringify({ error: borde }), { status: 400 })

      const conNombre = nombradasDe(texto)
      const necesarias = variablesDe(texto)

      // Meta admite unos u otros, no los dos en el mismo cuerpo.
      if (conNombre.length > 0 && necesarias > 0) {
        return new Response(JSON.stringify({
          error: 'El texto mezcla huecos numerados y con nombre. Meta admite unos u otros.',
        }), { status: 400 })
      }
      if (conNombre.length === 0 && ejemplos.length < necesarias) {
        return new Response(JSON.stringify({
          error: `El texto usa ${necesarias} variable(s) y Meta exige un ejemplo para cada una. `
            + `Hay ${ejemplos.length}.`,
        }), { status: 400 })
      }

      const r = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre,
          language: idioma,
          category: 'UTILITY',
          ...(conNombre.length > 0 ? { parameter_format: 'NAMED' } : {}),
          components: componentes(
            texto, ejemplos.slice(0, necesarias), cuerpo.ejemplos_nombrados,
          ),
        }),
      })
      const j = await r.json() as Plantilla & { error?: Record<string, unknown> }
      if (j.error) {
        return new Response(JSON.stringify({ error: motivoDeMeta(j.error) }), { status: 502 })
      }
      return new Response(JSON.stringify({ creada: { id: j.id, status: j.status, category: j.category } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'acción desconocida' }), { status: 400 })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 300) }), { status: 500 })
  }
})
