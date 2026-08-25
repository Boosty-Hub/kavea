'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * Las plantillas de WhatsApp, leídas de la WABA y creadas contra ella.
 *
 * POR QUÉ ESTA PANTALLA ES NUEVA. Kavea llevaba las plantillas de WhatsApp en su
 * propia tabla, rellenada A MANO «para llevar el registro de lo que ya está
 * aprobado allí» (0042). Un registro a mano de algo que decide otro se
 * desincroniza el primer día: Meta pausa o inhabilita una plantilla y Kavea sigue
 * enseñando lo que se tecleó en su día. Aquí se lee en vivo, como en Messenger.
 *
 * UNA PLANTILLA DE WHATSAPP NO ES UN TEXTO, y el formulario lo refleja: es una
 * categoría, un idioma, una cabecera opcional, un cuerpo, un pie opcional y hasta
 * diez botones. Cada pieza tiene su regla y Meta rechaza en el acto la que no la
 * cumple. Todo lo que se puede comprobar antes se comprueba antes, porque una
 * plantilla rechazada deja el nombre ocupado para siempre.
 *
 * LA CATEGORÍA VA PRIMERA Y EXPLICADA. `codigo_ingreso` se rechazó el 24-ago con
 * `INCORRECT_CATEGORY` por mandar un código de acceso como utilidad. Elegir a
 * ciegas entre tres palabras en inglés es cómo se repite ese error.
 */

type Componente = {
  type?: string
  format?: string
  text?: string
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>
}

type Plantilla = {
  id?: string
  name?: string
  language?: string
  status?: string
  category?: string
  components?: Componente[]
  rejected_reason?: string
}

const CARA: Record<string, { texto: string; fg: string; bg: string }> = {
  APPROVED: { texto: 'Aprobada', fg: 'var(--k-resuelta-fg)', bg: 'var(--k-resuelta-bg)' },
  PENDING: { texto: 'En revisión', fg: 'var(--k-esperando-fg)', bg: 'var(--k-esperando-bg)' },
  REJECTED: { texto: 'Rechazada', fg: 'var(--k-escalada-fg)', bg: 'var(--k-escalada-bg)' },
  PAUSED: { texto: 'Pausada', fg: 'var(--k-esperando-fg)', bg: 'var(--k-esperando-bg)' },
  DISABLED: { texto: 'Inhabilitada', fg: 'var(--k-escalada-fg)', bg: 'var(--k-escalada-bg)' },
}

const MOTIVO: Record<string, string> = {
  INCORRECT_CATEGORY:
    'Categoría equivocada. Los códigos de acceso son de autenticación y las promociones, de marketing.',
  INVALID_FORMAT:
    'Formato inválido. Casi siempre son los ejemplos: una plantilla con {{1}} y sin ejemplo se rechaza al crearse.',
  ABUSIVE_CONTENT: 'Contenido no permitido por las normas de Meta.',
  PROMOTIONAL: 'Es promocional y se envió como utilidad. Va en marketing.',
  TAG_CONTENT_MISMATCH: 'El contenido no encaja con la etiqueta declarada.',
  SCAM: 'Meta lo leyó como un intento de engaño.',
}

/**
 * Las tres categorías, con lo que significan de verdad.
 *
 * El texto no es de relleno: es la diferencia entre que Meta apruebe o rechace, y
 * es lo que la consola de Meta explica en una página aparte que nadie abre.
 */
const CATEGORIAS = [
  {
    valor: 'UTILITY',
    nombre: 'Utilidad',
    ayuda: 'Sobre algo que el cliente ya hizo: su pedido, su cita, su cuenta, su factura. '
      + 'No puede vender nada.',
  },
  {
    valor: 'MARKETING',
    nombre: 'Marketing',
    ayuda: 'Ofertas, novedades, recordatorios de carrito. El cliente puede darse de baja y '
      + 'Meta limita cuántas se mandan.',
  },
  {
    valor: 'AUTHENTICATION',
    nombre: 'Autenticación',
    ayuda: 'Códigos de un solo uso para entrar o verificar. Si el mensaje lleva un código, '
      + 'es esta y no utilidad.',
  },
] as const

const IDIOMAS = [
  { valor: 'es_ES', nombre: 'Español (España)' },
  { valor: 'es_MX', nombre: 'Español (México)' },
  { valor: 'es', nombre: 'Español' },
  { valor: 'en_US', nombre: 'Inglés (EE. UU.)' },
  { valor: 'pt_BR', nombre: 'Portugués (Brasil)' },
]

type Boton = { tipo: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; texto: string; url: string; telefono: string; ejemplo: string }

/**
 * El nombre con el que un campo de Kavea viaja a Meta.
 *
 * Meta no admite puntos en el nombre de un hueco, así que
 * `campo.presupuesto_estimado` se escribe `{{campo_presupuesto_estimado}}`. La
 * vuelta la hace la base (0110) con la lista cerrada de ámbitos, así que la
 * conversión es reversible y no hay que guardar un mapeo aparte.
 */
function nombreMeta(clave: string): string {
  return clave.replace(/\./g, '_')
}

/**
 * Una variable al principio o al final es un rechazo seguro.
 *
 * Regla de Meta, comprobada contra la WABA el 25-ago: «Las variables no pueden
 * estar al principio ni al final de la plantilla» (subcódigo 2388299). No está en
 * ninguna guía que hubiéramos leído y su error es un «Invalid parameter» pelado,
 * así que se dice aquí mientras se escribe: llegar hasta Meta para esto cuesta el
 * nombre de la plantilla, que no se puede reutilizar.
 */
function bordeDe(cuerpo: string): string | null {
  const t = cuerpo.trim()
  if (/^\{\{/.test(t)) return 'no puede EMPEZAR por una variable'
  if (/\}\}$/.test(t)) return 'no puede TERMINAR en una variable'
  return null
}

/** Los huecos con nombre de un texto, en orden y sin repetir. */
function nombradasDe(texto: string): string[] {
  const vistos: string[] = []
  for (const m of texto.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)) {
    if (!vistos.includes(m[1]!)) vistos.push(m[1]!)
  }
  return vistos
}

function variablesDe(texto: string): number {
  const vistos = new Set<string>()
  for (const m of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) vistos.add(m[1]!)
  return vistos.size
}

function botonVacio(): Boton {
  return { tipo: 'QUICK_REPLY', texto: '', url: '', telefono: '', ejemplo: '' }
}

/**
 * De dónde salen los valores de los huecos.
 *
 * Meta sabe que una plantilla tiene `{{1}}`. NO SABE —ni puede saber— que ese
 * hueco es el nombre del contacto. Ese emparejamiento es de Kavea, se guarda en
 * `plantillas.variables` y es lo que convierte una plantilla aprobada en algo
 * que se puede mandar sin escribir nada a mano.
 *
 * Las opciones salen de `variables_disponibles`, que ya incluye los campos
 * propios del espacio: los que se crean en Ajustes → Campos aparecen aquí como
 * `campo.loquesea` sin tocar nada más.
 */
export function PlantillasDeWhatsApp({
  puedeConfigurar, organizacionId, variables,
}: {
  puedeConfigurar: boolean
  organizacionId: string
  variables: Array<{ clave: string; etiqueta: string; ejemplo: string | null }>
}) {
  const [mapeando, setMapeando] = useState<string | null>(null)
  const [mapa, setMapa] = useState<string[]>([])
  const [vinculando, setVinculando] = useState(false)
  const [lista, setLista] = useState<Plantilla[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<string>('UTILITY')
  const [idioma, setIdioma] = useState('es_ES')
  const [cabecera, setCabecera] = useState('')
  const [ejemploCabecera, setEjemploCabecera] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [ejemplos, setEjemplos] = useState<string[]>([])
  const [pie, setPie] = useState('')
  const [botones, setBotones] = useState<Boton[]>([])
  /**
   * La cabecera de media. Excluyente con la de texto: Meta admite una u otra, y
   * ofrecer las dos a la vez sería dejar elegir algo que se descarta solo.
   */
  const [formato, setFormato] = useState<'TEXTO' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('TEXTO')
  /**
   * Solo para AUTENTICACIÓN. Meta escribe el texto él, traducido a cada idioma, y
   * solo deja decidir estas tres cosas. Un cuerpo propio en esa categoría es un
   * rechazo seguro, así que el formulario ni lo ofrece.
   */
  const [recomendacion, setRecomendacion] = useState(true)
  const [caducidad, setCaducidad] = useState('10')
  const [botonOtp, setBotonOtp] = useState('Copiar código')
  const [otpTipo, setOtpTipo] = useState<'COPY_CODE' | 'ONE_TAP'>('COPY_CODE')
  /** Id de la plantilla que se está editando, o null si es nueva. */
  const [editando, setEditando] = useState<string | null>(null)
  const [fichero, setFichero] = useState<{ nombre: string; tipo: string; datos: string; mb: number } | null>(null)

  const necesarias = variablesDe(cuerpo)
  const cabeceraVariable = variablesDe(cabecera) === 1
  /** Los campos que el cuerpo pide por nombre, y si mezcla las dos formas. */
  const conNombre = nombradasDe(cuerpo)
  const mezcla = conNombre.length > 0 && necesarias > 0
  const borde = bordeDe(cuerpo)
  const cajaCuerpo = useRef<HTMLTextAreaElement | null>(null)

  /**
   * Insertar un campo DONDE ESTÁ EL CURSOR, no al final.
   *
   * Escribir el mensaje y luego tener que mover a mano cada variable al hueco que
   * le toca es peor que teclearla: quien redacta piensa la frase entera y coloca
   * el dato al pasar por él.
   */
  function insertarCampo(clave: string) {
    const marca = `{{${nombreMeta(clave)}}}`
    const caja = cajaCuerpo.current
    if (!caja) { setCuerpo((c) => c + marca); return }
    const i = caja.selectionStart ?? cuerpo.length
    const j = caja.selectionEnd ?? i
    const nuevo = cuerpo.slice(0, i) + marca + cuerpo.slice(j)
    setCuerpo(nuevo)
    requestAnimationFrame(() => {
      caja.focus()
      caja.setSelectionRange(i + marca.length, i + marca.length)
    })
  }

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/plantillas-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'listar' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'No se pudo leer de Meta.'); setLista([]); return }
      setLista(j.plantillas ?? [])
    } catch {
      setError('No se pudo leer de Meta ahora mismo.')
      setLista([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  function limpiar() {
    setNombre(''); setCategoria('UTILITY'); setIdioma('es_ES')
    setCabecera(''); setEjemploCabecera(''); setCuerpo('')
    setEjemplos([]); setPie(''); setBotones([])
    setFormato('TEXTO'); setFichero(null)
    setRecomendacion(true); setCaducidad('10'); setBotonOtp('Copiar código'); setOtpTipo('COPY_CODE')
    setEditando(null)
  }

  /**
   * Abrir una existente para editarla.
   *
   * Meta permite cambiar el CONTENIDO de una plantilla aprobada; el nombre y el
   * idioma no. Por eso esos dos campos se rellenan y se bloquean en vez de
   * ocultarse: quien edita tiene que ver sobre qué está trabajando.
   */
  function abrirParaEditar(p: Plantilla) {
    const cab = p.components?.find((x) => x.type === 'HEADER')
    const body = p.components?.find((x) => x.type === 'BODY')?.text ?? ''
    const foot = p.components?.find((x) => x.type === 'FOOTER')?.text ?? ''
    const btns = p.components?.find((x) => x.type === 'BUTTONS')?.buttons ?? []
    limpiar()
    setEditando(p.id ?? null)
    setNombre(p.name ?? ''); setIdioma(p.language ?? 'es_ES')
    setCategoria(p.category ?? 'UTILITY')
    if (cab?.format && cab.format !== 'TEXT') setFormato(cab.format as 'IMAGE' | 'VIDEO' | 'DOCUMENT')
    else setCabecera(cab?.text ?? '')
    setCuerpo(body); setPie(foot)
    setBotones(btns.filter((b) => b.type !== 'OTP').map((b) => ({
      tipo: (b.type as Boton['tipo']) ?? 'QUICK_REPLY',
      texto: b.text ?? '', url: b.url ?? '', telefono: b.phone_number ?? '', ejemplo: '',
    })))
    setAbierto(true)
    setAviso(null); setError(null)
  }

  /**
   * El fichero se lee a base64 EN EL NAVEGADOR y viaja dentro del JSON.
   *
   * No es elegante, pero un multipart tendría que atravesar la ruta de Next y la
   * de Supabase con dos límites de cuerpo distintos, y el tope real acabaría
   * siendo el más pequeño de los dos igualmente. El aviso de tamaño se da aquí,
   * antes de subir nada: base64 infla un tercio, y descubrir el tope después de
   * mandar diez megas es tirar el tiempo del operador.
   */
  function elegirFichero(f: File | null) {
    if (!f) { setFichero(null); return }
    const mb = f.size / 1048576
    if (mb > 4) {
      setError(`El fichero ocupa ${mb.toFixed(1)} MB. Por esta vía el tope práctico son 4 MB.`)
      setFichero(null)
      return
    }
    const lector = new FileReader()
    lector.onload = () => {
      setError(null)
      setFichero({ nombre: f.name, tipo: f.type, datos: String(lector.result ?? ''), mb })
    }
    lector.readAsDataURL(f)
  }

  async function crear(ev: React.FormEvent) {
    ev.preventDefault()
    setGuardando(true); setError(null); setAviso(null)
    try {
      const r = await fetch('/api/plantillas-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: editando ? 'editar' : 'crear',
          plantilla_id: editando ?? undefined,
          nombre, categoria, idioma,
          recomendacion,
          caducidad: caducidad ? Number(caducidad) : undefined,
          boton_texto: botonOtp,
          otp_tipo: otpTipo,
          cabecera: formato === 'TEXTO' ? cabecera : '',
          ejemplo_cabecera: formato === 'TEXTO' ? ejemploCabecera : '',
          media_formato: formato === 'TEXTO' ? '' : formato,
          media_datos: fichero?.datos ?? '',
          media_nombre: fichero?.nombre ?? '',
          media_tipo: fichero?.tipo ?? '',
          cuerpo, ejemplos, pie,
          // El ejemplo de cada hueco con nombre sale de la propia variable. Meta
          // los exige y pedirlos a mano cuando ya se conocen es trabajo inventado.
          ejemplos_nombrados: Object.fromEntries(
            conNombre.map((n) => {
              const v = variables.find((x) => nombreMeta(x.clave) === n)
              return [n, v?.ejemplo || v?.etiqueta || n]
            }),
          ),
          botones: botones.map((b) => ({
            tipo: b.tipo, texto: b.texto, url: b.url, telefono: b.telefono, ejemplo: b.ejemplo,
          })),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'Meta no aceptó la plantilla.'); return }

      /**
       * NACE RECHAZADA CON FRECUENCIA, y la llamada sale bien.
       *
       * Meta devuelve 200 con `status: REJECTED`. Decir «creada» y callar el
       * estado es cómo alguien descubre el rechazo tres días después, cuando va a
       * mandarla. Se dice en el momento.
       */
      if (editando) {
        // Editar devuelve la plantilla a revisión: Meta aprobó otra cosa.
        setAviso('Cambio enviado. Meta la vuelve a revisar, así que pasa a «En revisión».')
        setAbierto(false); limpiar(); await cargar()
        return
      }
      const estado = j.creada?.status
      setAviso(estado === 'REJECTED'
        ? `Meta la creó y la rechazó en el acto. Revisa la categoría y los ejemplos: el nombre «${nombre}» ya queda ocupado.`
        : estado === 'APPROVED'
          ? 'Aprobada. Ya se puede usar.'
          : 'Enviada. Meta suele tardar unos minutos en revisarla.')
      setAbierto(false)
      limpiar()
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Guardar el emparejamiento. No manda nada a Meta: la plantilla ya está
   * aprobada allí y esto es puramente de Kavea.
   */
  async function vincular(p: Plantilla, cuerpoTexto: string, huecos: number) {
    if (mapa.slice(0, huecos).some((v) => !v)) {
      setError('Cada hueco necesita su variable.')
      return
    }
    setVinculando(true); setError(null); setAviso(null)
    const { error } = await crearClienteNavegador().rpc('vincular_plantilla_whatsapp', {
      p_org: organizacionId,
      p_meta_nombre: p.name,
      p_idioma: p.language,
      p_categoria: p.category,
      p_cuerpo: cuerpoTexto,
      p_variables: mapa.slice(0, huecos),
    })
    setVinculando(false)
    if (error) { setError(error.message); return }
    setMapeando(null); setMapa([])
    setAviso(`«${p.name}» ya se puede elegir en el compositor de WhatsApp.`)
  }

  async function borrar(p: Plantilla) {
    if (!p.name) return
    // Meta borra POR NOMBRE y se lleva todas las traducciones. Se dice antes.
    if (!confirm(
      `Borrar «${p.name}» en Meta.\n\n`
      + 'Se borran todas sus traducciones, no solo la de este idioma, y no se puede deshacer.',
    )) return
    setBorrando(p.name); setError(null); setAviso(null)
    try {
      const r = await fetch('/api/plantillas-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'borrar', nombre: p.name }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? 'Meta no aceptó el borrado.'); return }
      await cargar()
    } finally {
      setBorrando(null)
    }
  }

  const cat = CATEGORIAS.find((c) => c.valor === categoria)

  return (
    <section style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Plantillas de WhatsApp</h2>
        <button
          type="button"
          className="operar__control"
          style={{ cursor: 'pointer', marginLeft: 'auto', fontSize: 13 }}
          onClick={() => void cargar()}
        >
          Volver a leer
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '6px 0 0', maxWidth: 640 }}>
        Las que viven en la cuenta de WhatsApp del negocio. Las aprueba Meta, no Kavea, y su estado
        se lee de Meta cada vez que se abre esta pantalla. Hacen falta para escribir a alguien
        <strong> fuera de las 24 horas</strong>; dentro de la ventana se responde con texto normal.
      </p>

      {error ? <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
      {aviso ? <p className="exito" role="status" style={{ marginTop: 12 }}>{aviso}</p> : null}

      <div className="tarjeta" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
        {lista === null ? (
          <p className="ficha__vacia" style={{ padding: 16 }}>Leyendo de Meta…</p>
        ) : lista.length === 0 ? (
          <p className="ficha__vacia" style={{ padding: 16 }}>
            Esta cuenta de WhatsApp no tiene ninguna plantilla todavía.
          </p>
        ) : (
          lista.map((p) => {
            const cara = CARA[p.status ?? ''] ?? { texto: p.status ?? '—', fg: 'var(--k-text-2)', bg: 'var(--k-surface-2)' }
            const cab = p.components?.find((c) => c.type === 'HEADER')
            const body = p.components?.find((c) => c.type === 'BODY')?.text ?? ''
            const foot = p.components?.find((c) => c.type === 'FOOTER')?.text ?? ''
            const btns = p.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? []
            const motivo = p.status === 'REJECTED' && p.rejected_reason && p.rejected_reason !== 'NONE'
              ? (MOTIVO[p.rejected_reason] ?? p.rejected_reason)
              : null
            return (
              <div key={p.id ?? p.name} className="miembro" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    <code>{p.name}</code>
                    <span style={{ fontWeight: 400, color: 'var(--k-text-2)' }}>
                      {' · '}{p.language}
                      {p.category ? ` · ${CATEGORIAS.find((c) => c.valor === p.category)?.nombre ?? p.category}` : ''}
                    </span>
                  </div>
                  {cab?.text ? (
                    <div style={{ fontSize: 13, fontWeight: 500, marginTop: 3 }}>{cab.text}</div>
                  ) : null}
                  {body ? (
                    <div style={{ fontSize: 13, color: 'var(--k-text-2)', marginTop: 2 }}>{body}</div>
                  ) : null}
                  {foot ? (
                    <div style={{ fontSize: 12, color: 'var(--k-text-2)', marginTop: 2, opacity: .8 }}>{foot}</div>
                  ) : null}
                  {btns.length ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {btns.map((b, i) => (
                        <span key={i} className="pildora" style={{ background: 'var(--k-surface-2)', fontSize: 12 }}>
                          {b.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {motivo ? (
                    <div style={{ fontSize: 13, color: 'var(--k-escalada-fg)', marginTop: 4 }}>{motivo}</div>
                  ) : null}

                  {/* EL EMPAREJAMIENTO, solo sobre las aprobadas: preparar una
                      rechazada sería ofrecer un envío que Meta va a rechazar. */}
                  {puedeConfigurar && p.status === 'APPROVED' ? (
                    mapeando === p.name ? (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8, maxWidth: 460 }}>
                        {Array.from({ length: variablesDe(body) }, (_, i) => (
                          <label key={i} style={{ display: 'grid', gap: 4 }}>
                            <span className="label">{`Qué rellena {{${i + 1}}}`}</span>
                            <select
                              className="campo"
                              value={mapa[i] ?? ''}
                              onChange={(e) => { const v = [...mapa]; v[i] = e.target.value; setMapa(v) }}
                            >
                              <option value="">Elige un dato de la ficha…</option>
                              {variables.map((v) => (
                                <option key={v.clave} value={v.clave}>
                                  {v.etiqueta}{v.ejemplo ? ` — ${v.ejemplo}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                        {variablesDe(body) === 0 ? (
                          <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: 0 }}>
                            Esta plantilla no tiene huecos: se manda tal cual.
                          </p>
                        ) : null}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button" className="btn" style={{ fontSize: 13 }}
                            disabled={vinculando}
                            onClick={() => void vincular(p, body, variablesDe(body))}
                          >
                            {vinculando ? 'Guardando' : 'Dejar lista para usar'}
                          </button>
                          <button
                            type="button" className="operar__control" style={{ cursor: 'pointer', fontSize: 13 }}
                            onClick={() => { setMapeando(null); setMapa([]) }}
                          >
                            Cancelar
                          </button>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
                          Los datos salen de la ficha del contacto. Para tener más, créalos en{' '}
                          <a href="/ajustes/campos">Ajustes → Campos</a> y aparecerán aquí.
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="operar__control"
                        style={{ cursor: 'pointer', fontSize: 12, marginTop: 8 }}
                        onClick={() => { setMapeando(p.name ?? null); setMapa([]); setError(null) }}
                      >
                        {variablesDe(body) > 0
                          ? `Emparejar sus ${variablesDe(body)} hueco${variablesDe(body) > 1 ? 's' : ''} con la ficha`
                          : 'Dejar lista para usar'}
                      </button>
                    )
                  ) : null}
                </div>
                <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pildora" style={{ background: cara.bg, color: cara.fg }}>{cara.texto}</span>
                  {puedeConfigurar ? (
                    <>
                      {/* Editar devuelve la plantilla a revisión, así que no se
                          ofrece sobre una que ya está esperando: sería pedir dos
                          revisiones de lo mismo. */}
                      {p.status !== 'PENDING' ? (
                        <button
                          type="button"
                          className="operar__control"
                          style={{ cursor: 'pointer', fontSize: 12 }}
                          onClick={() => abrirParaEditar(p)}
                        >
                          Editar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="operar__control"
                        style={{ cursor: 'pointer', fontSize: 12 }}
                        disabled={borrando === p.name}
                        onClick={() => void borrar(p)}
                      >
                        {borrando === p.name ? 'Borrando' : 'Borrar'}
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            )
          })
        )}
      </div>

      {!puedeConfigurar ? null : !abierto ? (
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setAbierto(true)}>
          Nueva plantilla de WhatsApp
        </button>
      ) : (
        <form onSubmit={crear} className="tarjeta" style={{ marginTop: 12, display: 'grid', gap: 14 }}>
          {/* LA CATEGORÍA, PRIMERO Y EXPLICADA. Es lo que más rechazos causa. */}
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="label">Categoría</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  className="operar__control"
                  aria-pressed={categoria === c.valor}
                  style={{
                    cursor: 'pointer', fontSize: 13,
                    borderColor: categoria === c.valor ? 'var(--k-accent)' : undefined,
                    color: categoria === c.valor ? 'var(--k-accent)' : undefined,
                  }}
                  onClick={() => setCategoria(c.valor)}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
            {cat ? (
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>{cat.ayuda}</span>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, flex: '1 1 220px' }}>
              <span className="label">Nombre en Meta</span>
              <input
                className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="pedido_en_camino" required
                /* Al editar, ni el nombre ni el idioma se pueden cambiar en Meta.
                   Se enseñan bloqueados en vez de ocultarse: quien edita tiene que
                   ver sobre qué está trabajando. */
                readOnly={!!editando}
                style={editando ? { opacity: .6 } : undefined}
              />
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                Minúsculas, números y guion bajo. Si Meta la rechaza, ese nombre queda ocupado.
              </span>
            </label>
            <label style={{ display: 'grid', gap: 4, flex: '0 1 200px' }}>
              <span className="label">Idioma</span>
              <select
                className="campo" value={idioma} disabled={!!editando}
                onChange={(e) => setIdioma(e.target.value)}
              >
                {IDIOMAS.map((i) => <option key={i.valor} value={i.valor}>{i.nombre}</option>)}
              </select>
            </label>
          </div>

          {categoria === 'AUTHENTICATION' ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {/* EL TEXTO NO SE ESCRIBE. Meta lo genera y lo traduce; lo único que
                  se decide es esto. Ofrecer un cuerpo aquí sería ofrecer un campo
                  que Meta ignora, o por el que rechaza. */}
              <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: 0 }}>
                En autenticación el texto lo escribe Meta y lo traduce a cada idioma. Aquí solo se
                decide qué lleva alrededor.
              </p>

              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input
                  type="checkbox" checked={recomendacion}
                  onChange={(e) => setRecomendacion(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 14 }}>
                  Añadir la advertencia de seguridad
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--k-text-2)' }}>
                    «No compartas este código con nadie», con las palabras de Meta.
                  </span>
                </span>
              </label>

              <label style={{ display: 'grid', gap: 4, maxWidth: 260 }}>
                <span className="label">Caduca a los (minutos)</span>
                <input
                  className="campo" type="number" min={1} max={90}
                  value={caducidad} onChange={(e) => setCaducidad(e.target.value)}
                />
                <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                  Entre 1 y 90, que es el rango de Meta. Déjalo vacío para no mostrar caducidad.
                </span>
              </label>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'grid', gap: 4, flex: '0 1 220px' }}>
                  <span className="label">Botón</span>
                  <select
                    className="campo" value={otpTipo}
                    onChange={(e) => setOtpTipo(e.target.value as 'COPY_CODE' | 'ONE_TAP')}
                  >
                    <option value="COPY_CODE">Copiar el código</option>
                    <option value="ONE_TAP">Autorrellenar en la app</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4, flex: '1 1 200px' }}>
                  <span className="label">Texto del botón</span>
                  <input
                    className="campo" value={botonOtp} maxLength={25}
                    onChange={(e) => setBotonOtp(e.target.value)} required
                  />
                </label>
              </div>
              {otpTipo === 'ONE_TAP' ? (
                <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
                  Autorrellenar necesita que la app del cliente esté registrada en Meta con su
                  firma. Si no lo está, WhatsApp cae a «copiar el código» solo.
                </p>
              ) : null}
            </div>
          ) : (
          <>
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="label">Cabecera (opcional)</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                ['TEXTO', 'Texto'], ['IMAGE', 'Imagen'], ['VIDEO', 'Vídeo'], ['DOCUMENT', 'PDF'],
              ] as const).map(([v, n]) => (
                <button
                  key={v} type="button" className="operar__control"
                  aria-pressed={formato === v}
                  style={{
                    cursor: 'pointer', fontSize: 13,
                    borderColor: formato === v ? 'var(--k-accent)' : undefined,
                    color: formato === v ? 'var(--k-accent)' : undefined,
                  }}
                  onClick={() => { setFormato(v); setFichero(null) }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {formato === 'TEXTO' ? (
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="label">Texto de la cabecera</span>
              <input
                className="campo" value={cabecera} onChange={(e) => setCabecera(e.target.value)}
                placeholder="Su pedido {{1}}" maxLength={60}
              />
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                Hasta 60 caracteres y una variable como mucho, por regla de Meta.
              </span>
            </label>
          ) : (
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="label">
                {formato === 'IMAGE' ? 'Imagen de muestra'
                  : formato === 'VIDEO' ? 'Vídeo de muestra' : 'PDF de muestra'}
              </span>
              <input
                className="campo"
                type="file"
                accept={formato === 'IMAGE' ? 'image/jpeg,image/png'
                  : formato === 'VIDEO' ? 'video/mp4,video/3gpp' : 'application/pdf'}
                onChange={(e) => elegirFichero(e.target.files?.[0] ?? null)}
                required={!fichero}
              />
              {fichero ? (
                <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                  {fichero.nombre} · {fichero.mb.toFixed(1)} MB
                </span>
              ) : null}
              {/* Que es una MUESTRA y no el contenido es lo que más se malentiende
                  de esto: Meta aprueba la plantilla con este fichero delante, y en
                  cada envío se manda el de verdad. */}
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                Es la muestra que Meta revisa. En cada envío se manda el fichero de verdad, no este.
                {formato === 'IMAGE' ? ' JPG o PNG.' : formato === 'VIDEO' ? ' MP4 o 3GP.' : ' PDF.'}
                {' '}Tope práctico por esta vía: 4 MB.
              </span>
            </label>
          )}

          {formato === 'TEXTO' && cabeceraVariable ? (
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="label">Ejemplo para la variable de la cabecera</span>
              <input
                className="campo" value={ejemploCabecera}
                onChange={(e) => setEjemploCabecera(e.target.value)} required
              />
            </label>
          ) : null}

          <label style={{ display: 'grid', gap: 4 }}>
            <span className="label">Cuerpo</span>
            <textarea
              ref={cajaCuerpo}
              className="campo" rows={3} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Hola {{contacto_nombre}}, su pedido ya va en camino."
              required maxLength={1024}
            />
          </label>

          {/* LOS CAMPOS DEL SISTEMA, para pulsar en vez de teclear.
              Meta admite huecos con nombre —`parameter_format: NAMED`— así que el
              cuerpo puede llevar el campo de verdad y no un {{1}} que hay que
              mapear aparte. Con nombres el texto ES el mapeo: no hay dos sitios
              que puedan discrepar cuando se reordenan las variables. */}
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="label">Insertar un dato de la ficha</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {variables.map((v) => (
                <button
                  key={v.clave}
                  type="button"
                  className="operar__control"
                  style={{ cursor: 'pointer', fontSize: 12 }}
                  title={`Se escribe {{${nombreMeta(v.clave)}}}${v.ejemplo ? ` — ejemplo: ${v.ejemplo}` : ''}`}
                  onClick={() => insertarCampo(v.clave)}
                >
                  {v.etiqueta}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
              Se rellenan solos con la ficha de cada contacto. Para tener más, créalos en{' '}
              <a href="/ajustes/campos">Ajustes → Campos</a>. También puedes usar huecos numerados
              —<code>{'{{1}}'}</code>— pero entonces hay que decir aparte qué va en cada uno.
            </span>
            {mezcla ? (
              <span className="error" role="alert" style={{ fontSize: 12 }}>
                El cuerpo mezcla huecos con nombre y numerados. Meta admite unos u otros, no los dos.
              </span>
            ) : null}
            {borde ? (
              <span className="error" role="alert" style={{ fontSize: 12 }}>
                El cuerpo {borde}: Meta lo rechaza. Escribe algo de texto{' '}
                {borde.includes('EMPEZAR') ? 'delante' : 'detrás'} —aunque sea una frase corta.
              </span>
            ) : null}
            {conNombre.length > 0 ? (
              <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
                {conNombre.length === 1 ? 'Un hueco' : `${conNombre.length} huecos`} con nombre. Los
                ejemplos que Meta pide se sacan solos de cada campo: no hay que escribirlos.
              </span>
            ) : null}
          </div>

          {/* Un ejemplo por hueco. Sin ellos Meta rechaza al crear. */}
          {/* Los ejemplos a mano SOLO para los numerados: los de nombre salen del
              propio campo, que ya trae su ejemplo. */}
          {Array.from({ length: conNombre.length > 0 ? 0 : necesarias }, (_, i) => (
            <label key={i} style={{ display: 'grid', gap: 4 }}>
              <span className="label">{`Ejemplo para {{${i + 1}}}`}</span>
              <input
                className="campo" value={ejemplos[i] ?? ''} required
                onChange={(e) => { const v = [...ejemplos]; v[i] = e.target.value; setEjemplos(v) }}
              />
            </label>
          ))}
          {necesarias > 0 && conNombre.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--k-text-2)', margin: 0 }}>
              Meta exige un ejemplo por hueco. Sin ellos rechaza la plantilla nada más crearla
              —motivo <code>INVALID_FORMAT</code>—.
            </p>
          ) : null}

          <label style={{ display: 'grid', gap: 4 }}>
            <span className="label">Pie (opcional)</span>
            <input
              className="campo" value={pie} onChange={(e) => setPie(e.target.value)}
              placeholder="Boosty Digital" maxLength={60}
            />
            <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
              Hasta 60 caracteres y sin variables, por regla de Meta.
            </span>
          </label>

          {/* BOTONES */}
          <div style={{ display: 'grid', gap: 8 }}>
            <span className="label">Botones (opcional)</span>
            {botones.map((b, i) => (
              <div key={i} className="tarjeta" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ display: 'grid', gap: 4, flex: '0 1 180px' }}>
                    <span className="label">Tipo</span>
                    <select
                      className="campo" value={b.tipo}
                      onChange={(e) => {
                        const v = [...botones]; v[i] = { ...b, tipo: e.target.value as Boton['tipo'] }; setBotones(v)
                      }}
                    >
                      <option value="QUICK_REPLY">Respuesta rápida</option>
                      <option value="URL">Abrir un enlace</option>
                      <option value="PHONE_NUMBER">Llamar</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, flex: '1 1 180px' }}>
                    <span className="label">Texto del botón</span>
                    <input
                      className="campo" value={b.texto} maxLength={25} required
                      onChange={(e) => { const v = [...botones]; v[i] = { ...b, texto: e.target.value }; setBotones(v) }}
                    />
                  </label>
                  <button
                    type="button" className="operar__control" style={{ cursor: 'pointer', fontSize: 13 }}
                    onClick={() => setBotones(botones.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </button>
                </div>
                {b.tipo === 'URL' ? (
                  <>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span className="label">Enlace</span>
                      <input
                        className="campo" value={b.url} placeholder="https://kavea.ai/pedido/{{1}}" required
                        onChange={(e) => { const v = [...botones]; v[i] = { ...b, url: e.target.value }; setBotones(v) }}
                      />
                    </label>
                    {variablesDe(b.url) > 0 ? (
                      <label style={{ display: 'grid', gap: 4 }}>
                        <span className="label">Ejemplo del enlace completo</span>
                        <input
                          className="campo" value={b.ejemplo} required
                          placeholder="https://kavea.ai/pedido/A-1042"
                          onChange={(e) => { const v = [...botones]; v[i] = { ...b, ejemplo: e.target.value }; setBotones(v) }}
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
                {b.tipo === 'PHONE_NUMBER' ? (
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span className="label">Teléfono</span>
                    <input
                      className="campo" value={b.telefono} placeholder="+13213931397" required
                      onChange={(e) => { const v = [...botones]; v[i] = { ...b, telefono: e.target.value }; setBotones(v) }}
                    />
                  </label>
                ) : null}
              </div>
            ))}
            {botones.length < 10 ? (
              <button
                type="button" className="operar__control" style={{ cursor: 'pointer', fontSize: 13, justifySelf: 'start' }}
                onClick={() => setBotones([...botones, botonVacio()])}
              >
                Añadir botón
              </button>
            ) : null}
          </div>

          </>
          )}

          {/* EL MOTIVO, JUNTO AL BOTÓN QUE LO PROVOCÓ.
              El aviso de arriba queda a más de mil píxeles del botón cuando el
              formulario está abierto: se pulsa «Crear y enviar a Meta», Meta
              contesta y no se ve nada. Se repite aquí, donde está la mirada. */}
          {error ? (
            <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn" disabled={guardando}>
              {guardando
                ? 'Enviando a Meta'
                : editando ? 'Guardar el cambio en Meta' : 'Crear y enviar a Meta'}
            </button>
            <button
              type="button" className="operar__control" style={{ cursor: 'pointer' }}
              onClick={() => { setAbierto(false); limpiar() }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
