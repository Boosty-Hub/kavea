/**
 * Plantillas de WhatsApp, contra la WABA y en vivo.
 *
 * POR QUÉ EXISTE. Hasta hoy Kavea llevaba las plantillas de WhatsApp en una
 * tabla propia —`plantillas` con `tipo = 'whatsapp'`— rellenada A MANO, «para
 * llevar el registro de lo que ya está aprobado allí», dice la 0042. Un registro
 * a mano de algo que decide otro se desincroniza el primer día: alguien aprueba,
 * pausa o inhabilita una plantilla en el panel de Meta y Kavea sigue enseñando lo
 * que se tecleó en su día. Esta función lee de la WABA cada vez, igual que
 * `plantillas-utilidad` hace con la Página.
 *
 * QUÉ SE PUEDE MANDAR Y QUÉ NO, y por qué el formulario tiene tantos campos:
 * una plantilla de WhatsApp no es un texto. Es una categoría, un idioma, una
 * cabecera opcional, un cuerpo, un pie opcional y hasta diez botones. Cada pieza
 * tiene sus reglas y Meta rechaza en el acto la que no las cumple, con un motivo
 * que hay que ir a buscar.
 *
 * LA CATEGORÍA NO ES UN ADORNO. `codigo_ingreso` se rechazó el 24-ago con
 * `INCORRECT_CATEGORY`: era un código de acceso mandado como UTILITY, y los
 * códigos son AUTHENTICATION. Por eso la categoría se elige y se explica, en vez
 * de fijarse por defecto y descubrirlo en el rechazo.
 *
 * LOS EJEMPLOS TAMPOCO. `aviso_de_pedido` se rechazó con `INVALID_FORMAT` por
 * no llevarlos. Se validan aquí, antes de llamar: una plantilla rechazada deja el
 * nombre ocupado y hay que empezar con otro.
 *
 * LO QUE ESTA VERSIÓN NO HACE: cabeceras de imagen, vídeo o documento. Meta no
 * las acepta por URL — exige subir el fichero por la API de subida reanudable y
 * pasar el `header_handle` que devuelve. Es un camino aparte con su propio
 * formulario, y prometerlo en la interfaz sin tenerlo sería peor que no ofrecerlo.
 */

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

/** Las categorías que Meta acepta hoy al crear. */
const CATEGORIAS = ['UTILITY', 'MARKETING', 'AUTHENTICATION']

/** Los botones que esta versión sabe construir. */
const BOTONES = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER']

type Boton = { tipo?: string; texto?: string; url?: string; telefono?: string; ejemplo?: string }

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

function tokenPortafolio(): string {
  const t = Deno.env.get('META_PORTFOLIO_TOKEN')
  if (!t) throw new Error('No hay token de portafolio configurado.')
  return t
}

/** Cuántos `{{n}}` distintos lleva un texto. */
function variablesDe(texto: string): number {
  const vistos = new Set<string>()
  for (const m of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) vistos.add(m[1]!)
  return vistos.size
}

/**
 * Los componentes, montados y validados.
 *
 * Devuelve el error en castellano en vez de dejar que lo rechace Meta: un
 * rechazo consume el nombre para siempre y obliga a inventar otro, así que cada
 * regla que se pueda comprobar antes se comprueba antes.
 */
function componentes(c: {
  cabecera?: string
  ejemploCabecera?: string
  cuerpo: string
  ejemplos: string[]
  pie?: string
  botones: Boton[]
}): { ok: true; valor: unknown[] } | { ok: false; error: string } {
  const fuera: unknown[] = []

  // --- CABECERA. Solo texto en esta versión, y con UNA variable como mucho:
  //     es el límite de Meta y no una simplificación nuestra.
  if (c.cabecera) {
    if (c.cabecera.length > 60) {
      return { ok: false, error: 'La cabecera pasa de 60 caracteres.' }
    }
    const n = variablesDe(c.cabecera)
    if (n > 1) return { ok: false, error: 'La cabecera admite una variable como mucho.' }
    const h: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: c.cabecera }
    if (n === 1) {
      if (!c.ejemploCabecera) {
        return { ok: false, error: 'La cabecera lleva una variable y necesita su ejemplo.' }
      }
      h.example = { header_text: [c.ejemploCabecera] }
    }
    fuera.push(h)
  }

  // --- CUERPO. Obligatorio.
  if (c.cuerpo.length < 1 || c.cuerpo.length > 1024) {
    return { ok: false, error: 'El cuerpo está vacío o pasa de 1024 caracteres.' }
  }
  const necesarias = variablesDe(c.cuerpo)
  if (c.ejemplos.length < necesarias) {
    return {
      ok: false,
      error: `El cuerpo usa ${necesarias} variable(s) y Meta exige un ejemplo para cada una. `
        + `Hay ${c.ejemplos.length}.`,
    }
  }
  const body: Record<string, unknown> = { type: 'BODY', text: c.cuerpo }
  if (necesarias > 0) body.example = { body_text: [c.ejemplos.slice(0, necesarias)] }
  fuera.push(body)

  // --- PIE. Sin variables, por regla de Meta.
  if (c.pie) {
    if (c.pie.length > 60) return { ok: false, error: 'El pie pasa de 60 caracteres.' }
    if (variablesDe(c.pie) > 0) return { ok: false, error: 'El pie no admite variables.' }
    fuera.push({ type: 'FOOTER', text: c.pie })
  }

  // --- BOTONES.
  if (c.botones.length > 0) {
    if (c.botones.length > 10) return { ok: false, error: 'Como mucho diez botones.' }
    const lista: unknown[] = []
    for (const b of c.botones) {
      const tipo = (b.tipo ?? '').toUpperCase()
      const texto = (b.texto ?? '').trim()
      if (!BOTONES.includes(tipo)) return { ok: false, error: `Tipo de botón no admitido: ${tipo}` }
      if (!texto) return { ok: false, error: 'Cada botón necesita su texto.' }
      if (texto.length > 25) return { ok: false, error: `El texto del botón «${texto}» pasa de 25 caracteres.` }

      if (tipo === 'QUICK_REPLY') {
        lista.push({ type: 'QUICK_REPLY', text: texto })
      } else if (tipo === 'URL') {
        const url = (b.url ?? '').trim()
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: `La URL de «${texto}» tiene que empezar por http:// o https://` }
        const boton: Record<string, unknown> = { type: 'URL', text: texto, url }
        // Una URL con `{{1}}` al final es una URL dinámica, y Meta pide su ejemplo.
        if (variablesDe(url) > 0) {
          if (!b.ejemplo) return { ok: false, error: `La URL de «${texto}» lleva una variable y necesita su ejemplo.` }
          boton.example = [b.ejemplo]
        }
        lista.push(boton)
      } else {
        const tel = (b.telefono ?? '').trim()
        if (!/^\+?[0-9]{6,20}$/.test(tel)) return { ok: false, error: `El teléfono de «${texto}» no parece un número.` }
        lista.push({ type: 'PHONE_NUMBER', text: texto, phone_number: tel })
      }
    }
    fuera.push({ type: 'BUTTONS', buttons: lista })
  }

  return { ok: true, valor: fuera }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  let c: {
    accion?: string; waba_id?: string
    nombre?: string; idioma?: string; categoria?: string
    cabecera?: string; ejemplo_cabecera?: string
    cuerpo?: string; ejemplos?: string[]; pie?: string
    botones?: Boton[]
    plantilla_id?: string
  }
  try { c = await req.json() } catch { return json({ error: 'cuerpo no válido' }, 400) }

  const waba = (c.waba_id ?? '').trim()
  if (!waba) return json({ error: 'falta la cuenta de WhatsApp' }, 400)

  try {
    const token = tokenPortafolio()
    const base = `https://graph.facebook.com/${V}/${encodeURIComponent(waba)}/message_templates`

    // --- listar -------------------------------------------------------------
    //
    // Se piden `rejected_reason` y `quality_score` EXPLÍCITAMENTE. Sin nombrarlos
    // Meta no los manda, y la pantalla acaba enseñando «Rechazada» sin decir por
    // qué — que es exactamente lo que pasó el 24-ago con las de Messenger.
    if (c.accion === 'listar' || !c.accion) {
      const campos = 'id,name,status,category,language,components,rejected_reason'
      const r = await fetch(`${base}?limit=200&fields=${campos}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await r.json() as { data?: unknown[]; error?: { message?: string } }
      if (j.error) return json({ error: j.error.message }, 502)
      return json({ plantillas: j.data ?? [] })
    }

    // --- crear --------------------------------------------------------------
    if (c.accion === 'crear') {
      const nombre = (c.nombre ?? '').trim()
      const idioma = (c.idioma ?? 'es_ES').trim()
      const categoria = (c.categoria ?? '').trim().toUpperCase()

      if (!/^[a-z][a-z0-9_]{1,60}$/.test(nombre)) {
        return json({
          error: 'El nombre solo admite minúsculas, números y guion bajo, y empieza por letra.',
        }, 400)
      }
      if (!CATEGORIAS.includes(categoria)) {
        return json({ error: `Categoría no admitida: ${categoria || '(vacía)'}` }, 400)
      }

      const piezas = componentes({
        cabecera: (c.cabecera ?? '').trim() || undefined,
        ejemploCabecera: (c.ejemplo_cabecera ?? '').trim() || undefined,
        cuerpo: (c.cuerpo ?? '').trim(),
        ejemplos: (c.ejemplos ?? []).map((s) => String(s).trim()).filter(Boolean),
        pie: (c.pie ?? '').trim() || undefined,
        botones: (c.botones ?? []).filter((b) => (b.texto ?? '').trim()),
      })
      if (!piezas.ok) return json({ error: piezas.error }, 400)

      const r = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, language: idioma, category: categoria, components: piezas.valor }),
      })
      const j = await r.json() as {
        id?: string; status?: string; category?: string; error?: { message?: string }
      }
      if (j.error) return json({ error: j.error.message }, 502)

      // Nace REJECTED con frecuencia y la llamada «funciona». Se devuelve el
      // estado para que la pantalla lo diga en el momento, no en la siguiente
      // lectura.
      return json({ creada: { id: j.id, status: j.status, category: j.category } })
    }

    // --- borrar -------------------------------------------------------------
    //
    // Por NOMBRE, que es como Meta borra plantillas: se lleva todas las
    // traducciones de ese nombre. Se dice en la interfaz, porque quien borra
    // «recordatorio» en español no espera perder la versión en inglés.
    if (c.accion === 'borrar') {
      const nombre = (c.nombre ?? '').trim()
      if (!nombre) return json({ error: 'falta el nombre' }, 400)
      const r = await fetch(`${base}?name=${encodeURIComponent(nombre)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await r.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
      if (j.error) return json({ error: j.error.message }, 502)
      return json({ borrada: Boolean(j.success) })
    }

    return json({ error: 'acción desconocida' }, 400)
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
