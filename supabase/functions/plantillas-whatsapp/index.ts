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
 * LAS CABECERAS DE MEDIA NO VAN POR URL, y ese es todo el trabajo extra. Meta no
 * acepta un enlace: exige subir el fichero por su **API de subida reanudable**
 * —`POST /{app-id}/uploads` para abrir sesión, luego el binario a la sesión— y
 * usar el `h` que devuelve como `example.header_handle`. Tres llamadas donde
 * parecía haber un campo de texto.
 *
 * EL HANDLE ES DE UN SOLO USO Y NO SE GUARDA. Sirve para crear la plantilla y ya:
 * el fichero queda dentro de la plantilla en Meta. Guardarlo para «reutilizarlo»
 * sería guardar algo que caduca sin avisar.
 */

const V = Deno.env.get('GRAPH_API_VERSION') ?? 'v26.0'

/** Las categorías que Meta acepta hoy al crear. */
const CATEGORIAS = ['UTILITY', 'MARKETING', 'AUTHENTICATION']

/**
 * Los formatos de cabecera de media, con lo que Meta acepta en cada uno.
 *
 * Los tamaños son los suyos y se comprueban ANTES de subir: descubrir que un
 * vídeo pasa de 16 MB después de haberlo mandado entero es tirar la subida y el
 * tiempo del operador.
 */
const MEDIA: Record<string, { mime: RegExp; topeMb: number }> = {
  IMAGE:    { mime: /^image\/(jpeg|png)$/,                                   topeMb: 5 },
  VIDEO:    { mime: /^video\/(mp4|3gpp)$/,                                   topeMb: 16 },
  DOCUMENT: { mime: /^application\/pdf$/,                                    topeMb: 100 },
}

/**
 * Los componentes de una plantilla de AUTENTICACIÓN, que no se parecen a nada.
 *
 * NO SE ESCRIBE EL TEXTO. Meta lo genera él, traducido a cada idioma, y solo deja
 * decidir tres cosas: si añade la línea de «no compartas este código», a los
 * cuántos minutos caduca, y qué botón lleva. Mandar un `text` propio en el BODY
 * de una autenticación es un rechazo seguro.
 *
 * Por eso el formulario de esta categoría es otro y no una variante del de
 * utilidad: enseñar un campo de texto que Meta va a ignorar —o peor, por el que
 * va a rechazar— es prometer un control que no existe.
 */
function componentesAutenticacion(c: {
  recomendacion: boolean
  caducidad?: number
  botonTexto: string
  otpTipo: string
}): { ok: true; valor: unknown[]; nombrada: boolean } | { ok: false; error: string } {
  const texto = (c.botonTexto ?? '').trim()
  if (!texto) return { ok: false, error: 'El botón necesita su texto.' }
  if (texto.length > 25) return { ok: false, error: 'El texto del botón pasa de 25 caracteres.' }
  if (!['COPY_CODE', 'ONE_TAP'].includes(c.otpTipo)) {
    return { ok: false, error: `Tipo de código no admitido: ${c.otpTipo}` }
  }
  if (c.caducidad !== undefined && (c.caducidad < 1 || c.caducidad > 90)) {
    return { ok: false, error: 'La caducidad va entre 1 y 90 minutos, que es el rango de Meta.' }
  }

  const fuera: unknown[] = [
    { type: 'BODY', add_security_recommendation: c.recomendacion },
  ]
  // El pie SOLO existe para la caducidad, y solo si se pide: un FOOTER sin
  // `code_expiration_minutes` en una autenticación es un componente vacío.
  if (c.caducidad !== undefined) {
    fuera.push({ type: 'FOOTER', code_expiration_minutes: c.caducidad })
  }
  fuera.push({ type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: c.otpTipo, text: texto }] })
  return { ok: true, valor: fuera, nombrada: false }
}

/** Los botones que esta versión sabe construir. */
const BOTONES = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER']

type Boton = { tipo?: string; texto?: string; url?: string; telefono?: string; ejemplo?: string }

/**
 * Sube un fichero por la API reanudable y devuelve el `handle`.
 *
 * DOS LLAMADAS Y UNA CABECERA RARA. La primera abre sesión y devuelve un id con
 * el prefijo `upload:`. La segunda manda el binario A ESE ID, y su autorización
 * NO es `Bearer`: es `OAuth {token}`, que es la única arista de Graph que lo pide
 * así. Con `Bearer` responde 400 sin explicar por qué.
 *
 * Va con el token de APP —`{id}|{secreto}`— y no con el del portafolio: la sesión
 * de subida pertenece a la aplicación, no a un negocio.
 */
async function subirMedia(
  bytes: Uint8Array, nombre: string, tipo: string,
): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  const appId = Deno.env.get('META_APP_ID') ?? ''
  const secreto = Deno.env.get('META_APP_SECRET') ?? ''
  if (!appId || !secreto) return { ok: false, error: 'faltan las credenciales de la app' }
  const token = `${appId}|${secreto}`

  const abrir = await fetch(
    `https://graph.facebook.com/${V}/${encodeURIComponent(appId)}/uploads` +
    `?file_name=${encodeURIComponent(nombre)}&file_length=${bytes.byteLength}` +
    `&file_type=${encodeURIComponent(tipo)}&access_token=${encodeURIComponent(token)}`,
    { method: 'POST', signal: AbortSignal.timeout(20_000) },
  )
  const sesion = await abrir.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!sesion.id) {
    return { ok: false, error: sesion.error?.message ?? 'Meta no abrió la sesión de subida.' }
  }

  const enviar = await fetch(`https://graph.facebook.com/${V}/${sesion.id}`, {
    method: 'POST',
    headers: {
      // `OAuth`, no `Bearer`. Ver la cabecera de esta función.
      Authorization: `OAuth ${token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    // `ArrayBuffer` y no el `Uint8Array` directamente: el tipado de `fetch` en
    // Deno no acepta la vista, y `.slice()` devuelve una copia con su propio
    // búfer, sin arrastrar el resto del original.
    body: bytes.slice().buffer as ArrayBuffer,
    signal: AbortSignal.timeout(120_000),
  })
  const fin = await enviar.json().catch(() => ({})) as { h?: string; error?: { message?: string } }
  if (!fin.h) return { ok: false, error: fin.error?.message ?? 'Meta no devolvió el identificador del fichero.' }
  return { ok: true, handle: fin.h }
}

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

/**
 * Los huecos CON NOMBRE de un texto, en el orden en que aparecen y sin repetir.
 *
 * Meta los admite con `parameter_format: 'NAMED'`, y está comprobado contra las dos
 * superficies: Messenger aprobó una en segundos, y WhatsApp la aceptó en cuanto el
 * texto fue lo bastante largo —su primer rechazo era «demasiadas variables en
 * relación con la longitud», que es otra regla suya, no un no al formato—.
 *
 * CON NOMBRES EL TEXTO ES EL MAPEO. Con `{{1}}` hacía falta una lista aparte que
 * dijera qué campo va en cada posición, y esa lista puede discrepar del cuerpo:
 * reordena las variables en el texto y el mapeo sigue apuntando a las posiciones
 * viejas, sin error, mandando el presupuesto donde iba el nombre.
 *
 * El nombre no admite puntos, así que `campo.presupuesto_estimado` viaja como
 * `campo_presupuesto_estimado`; la vuelta la hace `clave_desde_nombre_meta` (0110).
 */
function nombradasDe(texto: string): string[] {
  const vistos: string[] = []
  for (const m of texto.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)) {
    if (!vistos.includes(m[1]!)) vistos.push(m[1]!)
  }
  return vistos
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
  mediaFormato?: string
  mediaHandle?: string
  cuerpo: string
  ejemplos: string[]
  /** Nombre → ejemplo, para los huecos con nombre. */
  ejemplosNombrados?: Record<string, string>
  pie?: string
  botones: Boton[]
}): { ok: true; valor: unknown[]; nombrada: boolean } | { ok: false; error: string } {
  const fuera: unknown[] = []

  // --- CABECERA DE MEDIA. Manda sobre la de texto: son excluyentes en Meta y
  //     ofrecer las dos a la vez sería dejar elegir algo que se descarta solo.
  if (c.mediaFormato && c.mediaHandle) {
    fuera.push({
      type: 'HEADER',
      format: c.mediaFormato,
      // El fichero va como EJEMPLO, no como contenido: la plantilla queda con
      // ese medio de muestra y en cada envío se manda el de verdad.
      example: { header_handle: [c.mediaHandle] },
    })
  } else if (c.cabecera) {
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
  const conNombre = nombradasDe(c.cuerpo)
  const necesarias = variablesDe(c.cuerpo)

  // LAS DOS FORMAS NO SE MEZCLAN. Meta admite `{{1}}` o `{{nombre}}`, no ambas en
  // el mismo cuerpo, y el error que da para eso no se entiende.
  if (conNombre.length > 0 && necesarias > 0) {
    return {
      ok: false,
      error: 'El cuerpo mezcla huecos numerados y con nombre. Meta admite unos u otros, no los dos.',
    }
  }

  const body: Record<string, unknown> = { type: 'BODY', text: c.cuerpo }
  if (conNombre.length > 0) {
    const faltan = conNombre.filter((n) => !(c.ejemplosNombrados ?? {})[n])
    if (faltan.length) return { ok: false, error: `Faltan los ejemplos de: ${faltan.join(', ')}` }
    body.example = {
      body_text_named_params: conNombre.map((n) => ({
        param_name: n, example: (c.ejemplosNombrados ?? {})[n],
      })),
    }
  } else if (necesarias > 0) {
    if (c.ejemplos.length < necesarias) {
      return {
        ok: false,
        error: `El cuerpo usa ${necesarias} variable(s) y Meta exige un ejemplo para cada una. `
          + `Hay ${c.ejemplos.length}.`,
      }
    }
    body.example = { body_text: [c.ejemplos.slice(0, necesarias)] }
  }
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

  return { ok: true, valor: fuera, nombrada: nombradasDe(c.cuerpo).length > 0 }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  let c: {
    accion?: string; waba_id?: string
    nombre?: string; idioma?: string; categoria?: string
    cabecera?: string; ejemplo_cabecera?: string
    media_formato?: string; media_datos?: string; media_nombre?: string; media_tipo?: string
    /** Nombre → ejemplo, para los huecos con nombre. */
    ejemplos_nombrados?: Record<string, string>
    // Solo para AUTHENTICATION. Ver `componentesAutenticacion`.
    recomendacion?: boolean; caducidad?: number; boton_texto?: string; otp_tipo?: string
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

      /**
       * LA CABECERA DE MEDIA, si la hay: se sube ANTES de montar nada.
       *
       * El fichero llega en base64 dentro del JSON. No es elegante, pero un
       * multipart tendría que atravesar la ruta de Next y la de Supabase con dos
       * límites de cuerpo distintos, y el tope real acaba siendo el más pequeño
       * de los dos igualmente. Se comprueba tamaño y tipo aquí, antes de gastar
       * la subida.
       */
      let mediaHandle: string | undefined
      const mf = (c.media_formato ?? '').trim().toUpperCase()
      if (mf) {
        const regla = MEDIA[mf]
        if (!regla) return json({ error: `Formato de cabecera no admitido: ${mf}` }, 400)
        if (!c.media_datos) return json({ error: 'Falta el fichero de la cabecera.' }, 400)
        if (!regla.mime.test(c.media_tipo ?? '')) {
          return json({
            error: `Para una cabecera ${mf}, Meta admite ${regla.mime.source
              .replace(/[\\^$]/g, '').replace('/(', '/').replace(')', '')} y llegó «${c.media_tipo}».`,
          }, 400)
        }
        let bytes: Uint8Array
        try {
          const limpio = String(c.media_datos).replace(/^data:[^;]+;base64,/, '')
          bytes = Uint8Array.from(atob(limpio), (ch) => ch.charCodeAt(0))
        } catch {
          return json({ error: 'El fichero no llegó en un base64 válido.' }, 400)
        }
        if (bytes.byteLength > regla.topeMb * 1024 * 1024) {
          return json({
            error: `El fichero ocupa ${(bytes.byteLength / 1048576).toFixed(1)} MB y el tope de `
              + `Meta para ${mf} es ${regla.topeMb} MB.`,
          }, 400)
        }
        const subida = await subirMedia(bytes, c.media_nombre ?? 'cabecera', c.media_tipo ?? '')
        if (!subida.ok) return json({ error: `No se pudo subir el fichero: ${subida.error}` }, 502)
        mediaHandle = subida.handle
      }

      // AUTENTICACIÓN VA POR SU CAMINO. Ver `componentesAutenticacion`.
      const piezas = categoria === 'AUTHENTICATION'
        ? componentesAutenticacion({
            recomendacion: Boolean(c.recomendacion),
            caducidad: typeof c.caducidad === 'number' ? c.caducidad : undefined,
            botonTexto: (c.boton_texto ?? 'Copiar código').trim(),
            otpTipo: (c.otp_tipo ?? 'COPY_CODE').trim().toUpperCase(),
          })
        : componentes({
        cabecera: (c.cabecera ?? '').trim() || undefined,
        ejemploCabecera: (c.ejemplo_cabecera ?? '').trim() || undefined,
        mediaFormato: mf || undefined,
        mediaHandle,
        cuerpo: (c.cuerpo ?? '').trim(),
        ejemplos: (c.ejemplos ?? []).map((s) => String(s).trim()).filter(Boolean),
        ejemplosNombrados: c.ejemplos_nombrados ?? {},
        pie: (c.pie ?? '').trim() || undefined,
        botones: (c.botones ?? []).filter((b) => (b.texto ?? '').trim()),
      })
      if (!piezas.ok) return json({ error: piezas.error }, 400)

      const r = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre, language: idioma, category: categoria,
          // Solo cuando el cuerpo lo usa: declarar NAMED con huecos numerados es
          // una contradicción y Meta la rechaza.
          ...(piezas.nombrada ? { parameter_format: 'NAMED' } : {}),
          components: piezas.valor,
        }),
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

    // --- editar ---------------------------------------------------------------
    //
    // Meta deja editar una plantilla YA APROBADA, con límites suyos: no se puede
    // cambiar el nombre, ni el idioma, ni —salvo en algunos casos— la categoría.
    // Lo que sí se puede es el contenido, y al hacerlo **vuelve a revisión**.
    //
    // SE EDITA POR ID, no por nombre. El nombre identifica a la familia entera de
    // traducciones; el id, a una sola. Editar por nombre cambiaría la versión en
    // inglés al retocar la española.
    if (c.accion === 'editar') {
      const id = (c.plantilla_id ?? '').trim()
      if (!id) return json({ error: 'falta el identificador de la plantilla' }, 400)

      const categoria = (c.categoria ?? '').trim().toUpperCase()
      const piezas = categoria === 'AUTHENTICATION'
        ? componentesAutenticacion({
            recomendacion: Boolean(c.recomendacion),
            caducidad: typeof c.caducidad === 'number' ? c.caducidad : undefined,
            botonTexto: (c.boton_texto ?? 'Copiar código').trim(),
            otpTipo: (c.otp_tipo ?? 'COPY_CODE').trim().toUpperCase(),
          })
        : componentes({
            cabecera: (c.cabecera ?? '').trim() || undefined,
            ejemploCabecera: (c.ejemplo_cabecera ?? '').trim() || undefined,
            cuerpo: (c.cuerpo ?? '').trim(),
            ejemplos: (c.ejemplos ?? []).map((x) => String(x).trim()).filter(Boolean),
            ejemplosNombrados: c.ejemplos_nombrados ?? {},
            pie: (c.pie ?? '').trim() || undefined,
            botones: (c.botones ?? []).filter((b) => (b.texto ?? '').trim()),
          })
      if (!piezas.ok) return json({ error: piezas.error }, 400)

      const r = await fetch(`https://graph.facebook.com/${V}/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ components: piezas.valor }),
      })
      const j = await r.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
      if (j.error) return json({ error: j.error.message }, 502)
      return json({ editada: Boolean(j.success) })
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
