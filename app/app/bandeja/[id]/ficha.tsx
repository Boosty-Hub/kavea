'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import type { CampoDeFicha, CanalDePersona } from '@/lib/bandeja'
import type { Archivo, Documento, ResumenComercial } from '@/lib/comercial'
import { LogoCanal } from '@/lib/logos-canal'
import { etiquetaCanal, terminoSeguro, colorCanal } from '@/lib/ventana'
import { Archivos } from './archivos'
import { Compras } from './compras'

const CLAVE_COLAPSO = 'kavea:hilo-ficha-colapsada'

const PESTANAS = [
  { clave: 'datos', etiqueta: 'Datos' },
  { clave: 'archivos', etiqueta: 'Archivos' },
  { clave: 'compras', etiqueta: 'Compras' },
] as const

/**
 * La ficha de la tarjeta.
 *
 * Es el sitio donde el negocio guarda lo que sabe del asunto y donde se ve con
 * quién se está hablando y por dónde. Cuatro bloques: la persona y sus canales,
 * los campos del asunto, los campos de la persona, y unir con otra tarjeta.
 *
 * Todo lo que se escribe aquí pasa por RPC. No hay políticas de `insert` sobre
 * `campo_valores` ni sobre `contact_identities`: una política de tabla sería un
 * camino que escribe sin dejar actividad, y el requisito es que en la
 * conversación salga todo lo que hace el usuario.
 */
export function Ficha({
  organizacionId, tarjetaId, contactoId, contactoNombre, puedeConfigurar, canales, otras,
  camposTarjeta, camposContacto,
  etapas, etapaActual, valor, moneda, archivos, documentos, resumen, conversaciones,
}: {
  organizacionId: string
  tarjetaId: string
  contactoId: string | null
  /**
   * Quién puede DEFINIR campos, que no es lo mismo que rellenarlos. Rellenar es
   * de quien atiende; definir cambia la ficha de toda la organización, y eso lo
   * comprueba `definir_campo` de todas formas. Esto solo evita ofrecer un botón
   * que va a decir que no.
   */
  puedeConfigurar: boolean
  /**
   * El nombre de la persona, que hasta hoy no se podía escribir en ninguna
   * pantalla. Venía de Meta cuando Meta lo daba y, cuando no, la persona se
   * quedaba «Contacto sin nombre» para siempre —y cualquier plantilla que lo
   * pidiera se negaba a salir señalando algo que no se podía tocar.
   */
  contactoNombre: string | null
  /** Por dónde se puede mandar un archivo. Cada canal tiene SU ventana. */
  conversaciones: Array<{ id: string; canal: string; ventana: { clase: string; motivo: string | null } }>
  canales: CanalDePersona[]
  otras: Array<{ id: string; titulo: string | null; estado: string; preview_texto: string | null }>
  camposTarjeta: CampoDeFicha[]
  camposContacto: CampoDeFicha[]
  etapas: Array<{ id: string; nombre: string; embudo_id: string; embudos: { nombre: string } | null }>
  etapaActual: string | null
  valor: number | null
  moneda: string
  archivos: Archivo[]
  documentos: Documento[]
  resumen: ResumenComercial[]
}) {
  const router = useRouter()
  const ruta = usePathname()
  const parametros = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Colapsable para dejarle más ancho a la conversación. Preferencia del
  // aparato, mismo patrón que el sidebar y la cabecera del hilo: arranca
  // expandida hasta montar, para no producir una discordancia de hidratación.
  const [colapsada, setColapsada] = useState(false)
  const [montada, setMontada] = useState(false)
  useEffect(() => {
    try {
      setColapsada(window.localStorage.getItem(CLAVE_COLAPSO) === '1')
    } catch { /* modo privado: se queda expandida */ }
    setMontada(true)
  }, [])
  function alternarColapso() {
    const v = !colapsada
    setColapsada(v)
    try { window.localStorage.setItem(CLAVE_COLAPSO, v ? '1' : '0') } catch { /* ver arriba */ }
  }

  /**
   * La pestaña activa va en la URL, no en un useState.
   *
   * El refresco de tiempo real llega cuando entra un mensaje, en cualquier
   * momento. Con la pestaña en estado local, ese refresco devolvería al
   * operador a "Datos" mientras rellena un presupuesto en "Compras". Con la
   * pestaña en la URL, el refresco la respeta.
   */
  const activa = (PESTANAS.find((p) => p.clave === parametros.get('f'))?.clave) ?? 'datos'
  const irA = (clave: string) => {
    const p = new URLSearchParams(parametros.toString())
    if (clave === 'datos') p.delete('f'); else p.set('f', clave)
    router.replace(`${ruta}${p.size ? `?${p}` : ''}`, { scroll: false })
  }

  async function llamar(fn: string, args: Record<string, unknown>) {
    setOcupado(true); setError(null)
    const { error } = await crearClienteNavegador().rpc(fn, args)
    setOcupado(false)
    if (error) { setError(error.message); return false }
    router.refresh()
    return true
  }

  return (
    <aside
      className={`ficha${colapsada ? ' ficha--colapsada' : ''}`}
      aria-label="Ficha de la conversación"
      style={{ transition: montada ? 'flex-basis .14s ease, width .14s ease' : 'none' }}
    >
      <button
        type="button"
        onClick={alternarColapso}
        aria-expanded={!colapsada}
        title={colapsada ? 'Expandir la ficha' : 'Colapsar la ficha'}
        style={{
          border: '1px solid var(--k-border)',
          background: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--k-text-2)',
          font: 'inherit',
          fontSize: 13,
          padding: '4px 8px',
          lineHeight: 1,
          alignSelf: colapsada ? 'center' : 'flex-end',
        }}
      >
        {colapsada ? '‹' : '›'}
      </button>

      {colapsada ? null : (
      <>
      <div className="pestanas" role="tablist" aria-label="Secciones de la ficha">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            role="tab"
            type="button"
            aria-selected={activa === p.clave}
            className="pestana"
            onClick={() => irA(p.clave)}
          >
            {p.etiqueta}
            {p.clave === 'archivos' && archivos.length > 0 ? (
              <span className="pestana__n">{archivos.length}</span>
            ) : null}
            {p.clave === 'compras' && documentos.length > 0 ? (
              <span className="pestana__n">{documentos.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {activa === 'archivos' ? (
        <Archivos
          organizacionId={organizacionId}
          tarjetaId={tarjetaId}
          contactoId={contactoId}
          archivos={archivos}
          conversaciones={conversaciones}
        />
      ) : activa === 'compras' ? (
        <Compras
          contactoId={contactoId}
          tarjetaId={tarjetaId}
          documentos={documentos}
          resumen={resumen}
        />
      ) : null}

      {/* En línea y no como componente anidado: un componente definido dentro
          del render se remonta en cada pasada y los formularios de dentro
          perderían lo que el operador esté escribiendo. */}
      <div hidden={activa !== 'datos'} style={{ display: activa === 'datos' ? 'grid' : undefined, gap: 20 }}>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {etapas.length > 0 ? (
        <Embudo
          tarjetaId={tarjetaId}
          etapas={etapas}
          etapaActual={etapaActual}
          valor={valor}
          moneda={moneda}
          ocupado={ocupado}
          llamar={llamar}
        />
      ) : null}

      {contactoId ? (
        <NombreDePersona
          contactoId={contactoId}
          nombre={contactoNombre}
          ocupado={ocupado}
          llamar={llamar}
        />
      ) : null}

      <section className="ficha__bloque">
        <p className="ficha__titulo">Canales de esta persona</p>
        {canales.length === 0 ? (
          <p className="ficha__vacia">Sin identidades registradas.</p>
        ) : (
          canales.map((c) => (
            <div key={c.identidad_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: colorCanal(c.canal), display: 'inline-flex', flex: 'none' }}>
                <LogoCanal canal={c.canal} size={15} />
              </span>
              <span style={{ fontSize: 13, minWidth: 76 }}>{etiquetaCanal(c.canal)}</span>
              <span style={{ fontSize: 13, color: 'var(--k-text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.etiqueta}
              </span>
              {/* De dónde salió. Una identidad que escribió alguien y una que
                  trajo Meta no valen lo mismo: la segunda enruta mensajes. */}
              {c.origen === 'manual' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Quitar ${etiquetaCanal(c.canal)} de esta persona.`)) {
                      llamar('desvincular_identidad', { p_identidad: c.identidad_id })
                    }
                  }}
                  disabled={ocupado}
                  aria-label={`Quitar ${etiquetaCanal(c.canal)}`}
                  title="Añadida a mano. Se puede quitar."
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--k-text-2)', font: 'inherit' }}
                >
                  ×
                </button>
              ) : (
                <span
                  style={{ fontSize: 11, color: 'var(--k-text-2)' }}
                  title="La trajo Meta. Es la que enruta los mensajes entrantes, no se puede quitar."
                >
                  Meta
                </span>
              )}
            </div>
          ))
        )}
        {contactoId ? (
          <AnadirCanal contactoId={contactoId} ocupado={ocupado} llamar={llamar} />
        ) : null}
      </section>

      <Campos
        titulo="Datos de este asunto"
        campos={camposTarjeta}
        destino={tarjetaId}
        ambito="tarjeta"
        organizacionId={organizacionId}
        puedeConfigurar={puedeConfigurar}
        ocupado={ocupado}
        llamar={llamar}
      />

      {contactoId ? (
        <Campos
          titulo="Datos de la persona"
          campos={camposContacto}
          destino={contactoId}
          ambito="contacto"
          organizacionId={organizacionId}
          puedeConfigurar={puedeConfigurar}
          ocupado={ocupado}
          llamar={llamar}
        />
      ) : null}

      {otras.length > 0 ? (
        <section className="ficha__bloque">
          <p className="ficha__titulo">Otros asuntos de esta persona</p>
          {otras.map((o) => (
            <Link key={o.id} href={`/bandeja/${o.id}`} className="tarjeta-vieja">
              <strong style={{ fontWeight: 500 }}>{o.titulo ?? 'Sin título'}</strong>
              <span style={{ color: 'var(--k-text-2)' }}> · {o.estado}</span>
            </Link>
          ))}
        </section>
      ) : null}

      <Unir tarjetaId={tarjetaId} ocupado={ocupado} llamar={llamar} />
      </div>
      </>
      )}
    </aside>
  )
}

/**
 * Etapa y valor, dentro de la conversación.
 *
 * Mover de etapa sin salir del hilo es lo que evita el vaivén entre la bandeja
 * y el tablero: la etapa se decide leyendo lo que acaba de escribir el cliente,
 * no mirando un tablero.
 *
 * El estado de atención NO está aquí y no es un olvido: es el otro eje. Se
 * cambia desde la bandeja, y ninguna de las dos acciones toca a la otra.
 */
function Embudo({
  tarjetaId, etapas, etapaActual, valor, moneda, ocupado, llamar,
}: {
  tarjetaId: string
  etapas: Array<{ id: string; nombre: string; embudo_id: string; embudos: { nombre: string } | null }>
  etapaActual: string | null
  valor: number | null
  moneda: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const [importe, setImporte] = useState(valor != null ? String(valor) : '')

  // Agrupadas por embudo: mover una tarjeta de "Ventas" a una etapa de "Cobros"
  // es legítimo —se vendió y ahora toca cobrar— pero tiene que verse que se
  // está cambiando de proceso, no solo de columna.
  const porEmbudo = new Map<string, typeof etapas>()
  for (const e of etapas) {
    const l = porEmbudo.get(e.embudos?.nombre ?? 'Embudo') ?? []
    l.push(e)
    porEmbudo.set(e.embudos?.nombre ?? 'Embudo', l)
  }

  return (
    <section className="ficha__bloque">
      <p className="ficha__titulo">Embudo</p>

      <div className="ficha__campo">
        <label className="ficha__etiqueta" htmlFor="etapa">Etapa</label>
        <select
          id="etapa"
          className="campo"
          value={etapaActual ?? ''}
          disabled={ocupado}
          onChange={(e) => llamar('mover_etapa', { p_tarjeta: tarjetaId, p_etapa: e.target.value })}
        >
          {etapaActual === null ? <option value="">Sin etapa</option> : null}
          {[...porEmbudo.entries()].map(([nombre, lista]) => (
            <optgroup key={nombre} label={nombre}>
              {lista.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="ficha__campo">
        <label className="ficha__etiqueta" htmlFor="valor">Valor ({moneda})</label>
        <input
          id="valor"
          className="campo"
          type="number"
          min="0"
          step="0.01"
          value={importe}
          disabled={ocupado}
          onChange={(e) => setImporte(e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim()
            const n = v === '' ? null : Number(v)
            if (n === valor) return
            llamar('fijar_valor', { p_tarjeta: tarjetaId, p_valor: n, p_moneda: null })
          }}
        />
        <span className="ficha__ayuda">Lo que suma este asunto en la columna del tablero.</span>
      </div>
    </section>
  )
}

/**
 * El nombre de la persona.
 *
 * Guarda al salir del foco, igual que los campos personalizados: una ficha con
 * un botón por campo es una ficha que nadie rellena. Y la base no escribe si el
 * valor no cambió, porque cada guardado deja una línea en el hilo.
 *
 * VA APARTE DE `Campos` a propósito. Los otros son campos que la organización
 * define en Ajustes → Campos y viven en `campo_valores`; este es una columna de
 * `contacts` que Meta también escribe. Meterlo en la misma lista haría creer que
 * se puede archivar o renombrar como los demás.
 */
function NombreDePersona({
  contactoId, nombre, ocupado, llamar,
}: {
  contactoId: string
  nombre: string | null
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const inicial = nombre ?? ''
  const [texto, setTexto] = useState(inicial)

  return (
    <section className="ficha__bloque">
      <p className="ficha__titulo">La persona</p>
      <div className="ficha__campo">
        <label className="ficha__etiqueta" htmlFor="nombre-persona">Nombre</label>
        <input
          id="nombre-persona"
          className="campo"
          value={texto}
          disabled={ocupado}
          maxLength={120}
          placeholder="Sin nombre todavía"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (texto.trim() === inicial.trim()) return
            void llamar('renombrar_contacto', { p_contacto: contactoId, p_nombre: texto })
          }}
          onKeyDown={(e) => {
            // Enter guarda sin tener que salir del campo, que es lo que el dedo
            // espera en un campo de una sola línea.
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          }}
        />
        <span className="ficha__ayuda">
          Lo usan las plantillas que saludan por el nombre. Meta no siempre lo entrega.
        </span>
      </div>
    </section>
  )
}

/**
 * Crear un campo personalizado sin salir de la conversación.
 *
 * POR QUÉ AQUÍ Y NO SOLO EN AJUSTES. El momento en que uno descubre que le falta
 * un campo es mirando una ficha, no navegando por Ajustes: «esto necesitaría una
 * fecha de entrega» se piensa con el cliente delante. Mandar a otra pantalla, con
 * su formulario y su vuelta, es donde se pierde la idea.
 *
 * Y CADA CAMPO ES UNA VARIABLE DE PLANTILLA. `variables_disponibles` lee
 * `campos`, así que lo que se cree aquí aparece al momento en el selector de
 * campos de las plantillas. Eso se dice, porque no se adivina.
 *
 * LOS TIPOS CON OPCIONES NO SE HACEN AQUÍ. `seleccion` y `multiseleccion` exigen
 * una lista de opciones —lo obliga una restricción de la tabla— y pedirla en este
 * hueco de 260 píxeles saldría mal. Se dice dónde se hacen.
 */
function NuevoCampo({
  ambito, organizacionId, ocupado, llamar,
}: {
  ambito: 'tarjeta' | 'contacto'
  organizacionId: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const [abierto, setAbierto] = useState(false)
  const [etiqueta, setEtiqueta] = useState('')
  const [tipo, setTipo] = useState('texto')

  /**
   * La clave técnica, sacada de la etiqueta.
   *
   * No se pide: es un dato para la base —`campo.fecha_de_entrega` acaba dentro de
   * una plantilla— y pedirla obligaría a explicar qué es. Sin tildes, minúsculas,
   * y lo que no sea letra o número pasa a guion bajo, que es lo que la
   * restricción de la tabla admite.
   */
  const clave = etiqueta
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 39)

  const valida = /^[a-z][a-z0-9_]{1,38}$/.test(clave)

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{
          border: 0, background: 'transparent', color: 'var(--k-accent)',
          cursor: 'pointer', font: 'inherit', fontSize: 13, padding: 0,
          textAlign: 'left', marginTop: 4,
        }}
      >
        + Nuevo campo
      </button>
    )
  }

  return (
    <form
      style={{ display: 'grid', gap: 6, marginTop: 6 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valida) return
        const ok = await llamar('definir_campo', {
          p_org: organizacionId,
          p_clave: clave,
          p_etiqueta: etiqueta.trim(),
          p_tipo: tipo,
          p_ambito: ambito,
          p_opciones: null,
          p_ayuda: null,
          p_obligatorio: false,
        })
        if (ok) { setEtiqueta(''); setTipo('texto'); setAbierto(false) }
      }}
    >
      <input
        className="campo"
        placeholder="Cómo se llama el campo"
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        maxLength={60}
        required
        autoFocus
        aria-label="Nombre del campo"
      />
      <select
        className="campo"
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        aria-label="Tipo del campo"
      >
        <option value="texto">Texto corto</option>
        <option value="texto_largo">Texto largo</option>
        <option value="numero">Número</option>
        <option value="moneda">Importe</option>
        <option value="fecha">Fecha</option>
        <option value="booleano">Sí o no</option>
      </select>
      {etiqueta.trim() && !valida ? (
        <span className="error" role="alert" style={{ fontSize: 12 }}>
          Ese nombre no deja una clave válida. Empieza por una letra.
        </span>
      ) : null}
      <span className="ficha__ayuda">
        {valida ? <>Se podrá usar en plantillas como <code>{`{{campo_${clave}}}`}</code>. </> : null}
        Para listas de opciones, en <Link href="/ajustes/campos">Ajustes → Campos</Link>.
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn" style={{ fontSize: 13 }} disabled={ocupado || !valida}>
          Crear
        </button>
        <button
          type="button"
          className="operar__control"
          style={{ cursor: 'pointer', fontSize: 13 }}
          onClick={() => { setAbierto(false); setEtiqueta('') }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Campos({
  titulo, campos, destino, ambito, organizacionId, puedeConfigurar, ocupado, llamar,
}: {
  titulo: string
  campos: CampoDeFicha[]
  destino: string
  /** `tarjeta` o `contacto`: decide dónde nace el campo nuevo. */
  ambito: 'tarjeta' | 'contacto'
  organizacionId: string
  puedeConfigurar: boolean
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  return (
    <section className="ficha__bloque">
      <p className="ficha__titulo">{titulo}</p>
      {campos.length === 0 ? (
        <p className="ficha__vacia">
          Sin campos todavía.
          {puedeConfigurar ? ' Se crean aquí abajo.' : (
            <> Los crea quien administra la organización.</>
          )}
        </p>
      ) : (
        campos.map((c) => (
          <Campo key={c.campo_id} c={c} destino={destino} ocupado={ocupado} llamar={llamar} />
        ))
      )}
      {puedeConfigurar ? (
        <NuevoCampo
          ambito={ambito}
          organizacionId={organizacionId}
          ocupado={ocupado}
          llamar={llamar}
        />
      ) : null}
    </section>
  )
}

/**
 * Un campo.
 *
 * Guarda al salir del foco, no con un botón por campo: una ficha con doce
 * campos y doce botones es una ficha que nadie rellena. Y solo llama si el
 * valor cambió de verdad, porque cada guardado deja una línea de actividad en
 * el hilo y entrar y salir de un campo no es un cambio.
 */
function Campo({
  c, destino, ocupado, llamar,
}: {
  c: CampoDeFicha
  destino: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const inicial = aTexto(c.valor)
  const [texto, setTexto] = useState(inicial)

  async function guardar(valorBruto: string) {
    if (valorBruto === inicial) return
    await llamar('guardar_campo', {
      p_campo: c.campo_id,
      p_destino: destino,
      p_valor: aJson(valorBruto, c.tipo),
    })
  }

  const id = `campo-${c.campo_id}`
  const comun = {
    id,
    className: 'campo',
    disabled: ocupado,
    'aria-describedby': c.ayuda ? `${id}-ayuda` : undefined,
  }

  return (
    <div className="ficha__campo">
      <label className="ficha__etiqueta" htmlFor={id}>
        {c.etiqueta}
        {c.obligatorio ? <span style={{ color: 'var(--k-accent)' }}> ·</span> : null}
      </label>

      {c.tipo === 'texto_largo' ? (
        <textarea
          {...comun}
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={(e) => guardar(e.target.value)}
        />
      ) : c.tipo === 'seleccion' ? (
        <select
          {...comun}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); guardar(e.target.value) }}
        >
          <option value="">—</option>
          {(c.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : c.tipo === 'booleano' ? (
        <select
          {...comun}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); guardar(e.target.value) }}
        >
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input
          {...comun}
          type={entrada(c.tipo)}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={(e) => guardar(e.target.value)}
        />
      )}

      {c.ayuda ? <span id={`${id}-ayuda`} className="ficha__ayuda">{c.ayuda}</span> : null}
    </div>
  )
}

function entrada(tipo: string): string {
  switch (tipo) {
    case 'numero': case 'moneda': return 'number'
    case 'fecha': return 'date'
    case 'correo': return 'email'
    case 'url': return 'url'
    case 'telefono': return 'tel'
    default: return 'text'
  }
}

function aTexto(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

/**
 * El tipo se convierte AQUÍ además de validarse en la base.
 *
 * Un `<input type="number">` devuelve una cadena, y mandar "42" a un campo
 * numérico haría que el RPC lo rechazara con un mensaje correcto pero
 * desconcertante: el usuario escribió un número. La validación de la base es la
 * que manda; esta conversión es para no provocarla sin motivo.
 */
function aJson(texto: string, tipo: string): unknown {
  const t = texto.trim()
  if (t === '') return null
  switch (tipo) {
    case 'numero': case 'moneda': {
      const n = Number(t)
      return Number.isFinite(n) ? n : t
    }
    case 'booleano': return t === 'true'
    default: return t
  }
}

function AnadirCanal({
  contactoId, ocupado, llamar,
}: {
  contactoId: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const [abierto, setAbierto] = useState(false)
  const [canal, setCanal] = useState('whatsapp')
  const [valor, setValor] = useState('')
  const [etiqueta, setEtiqueta] = useState('')

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{ border: 0, background: 'transparent', color: 'var(--k-accent)', cursor: 'pointer', font: 'inherit', fontSize: 13, padding: 0, textAlign: 'left' }}
      >
        + Añadir canal
      </button>
    )
  }

  return (
    <form
      style={{ display: 'grid', gap: 6, marginTop: 4 }}
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await llamar('vincular_identidad', {
          p_contacto: contactoId, p_canal: canal, p_valor: valor, p_etiqueta: etiqueta || null,
        })
        if (ok) { setValor(''); setEtiqueta(''); setAbierto(false) }
      }}
    >
      <select className="campo" value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal">
        <option value="whatsapp">WhatsApp</option>
        <option value="instagram">Instagram</option>
        <option value="messenger">Messenger</option>
      </select>
      <input
        className="campo"
        placeholder={canal === 'whatsapp' ? '584125551122' : 'Identificador'}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        required
        aria-label="Identificador"
      />
      <input
        className="campo"
        placeholder="Etiqueta (opcional)"
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        aria-label="Etiqueta"
      />
      <span className="ficha__ayuda">
        Queda registrado junto a la persona. WhatsApp todavía no envía ni recibe.
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn" type="submit" disabled={ocupado} style={{ padding: '6px 14px', fontSize: 13 }}>
          Añadir
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)' }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * Unir dos tarjetas.
 *
 * Es la operación que resuelve "esta persona de WhatsApp es la misma que la de
 * Instagram". Si además son dos contactos distintos, unifica también la
 * persona: para quien atiende es un solo gesto y una sola palabra.
 */
function Unir({
  tarjetaId, ocupado, llamar,
}: {
  tarjetaId: string
  ocupado: boolean
  llamar: (fn: string, args: Record<string, unknown>) => Promise<boolean>
}) {
  const [abierto, setAbierto] = useState(false)
  const [termino, setTermino] = useState('')
  const [resultados, setResultados] = useState<Array<{ id: string; titulo: string | null; contacts: { nombre: string | null; username: string | null } | null }>>([])
  const [elegida, setElegida] = useState<{ id: string; nombre: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  /**
   * Se busca en dos pasos, y no en uno con `or`.
   *
   * PostgREST NO resuelve columnas de un recurso embebido dentro de `or=(...)`:
   * `contacts.nombre.ilike.%x%` ahí no filtra, devuelve cero y no da error, que
   * es la peor combinación posible. Comprobado en vivo: el buscador encontraba
   * cero tarjetas existiendo la que se buscaba.
   *
   * Así que primero se buscan las personas y luego las tarjetas por título o
   * por esas personas. Dos viajes, pero funciona y se entiende al leerlo.
   */
  async function buscar(t: string) {
    setTermino(t); setElegida(null)
    const limpio = terminoSeguro(t)
    if (limpio.length < 2) { setResultados([]); return }

    const supabase = crearClienteNavegador()
    const { data: personas } = await supabase
      .from('contacts')
      .select('id')
      .or(`nombre.ilike.%${limpio}%,username.ilike.%${limpio}%`)
      .limit(20)

    const ids = (personas ?? []).map((p: { id: string }) => p.id)
    const clausulas = [`titulo.ilike.%${limpio}%`]
    if (ids.length) clausulas.push(`contact_id.in.(${ids.join(',')})`)

    const { data } = await supabase
      .from('tarjetas')
      .select('id, titulo, contacts(nombre, username)')
      .neq('id', tarjetaId)
      .or(clausulas.join(','))
      .limit(8)
    setResultados((data ?? []) as never)
  }

  if (!abierto) {
    return (
      <section className="ficha__bloque">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          style={{ border: 0, background: 'transparent', color: 'var(--k-accent)', cursor: 'pointer', font: 'inherit', fontSize: 13, padding: 0, textAlign: 'left' }}
        >
          Es la misma persona que otra tarjeta
        </button>
      </section>
    )
  }

  return (
    <section className="ficha__bloque">
      <p className="ficha__titulo">Unir con otra tarjeta</p>
      <input
        className="campo"
        placeholder="Buscar por título, nombre o usuario"
        value={termino}
        onChange={(e) => buscar(e.target.value)}
        aria-label="Buscar tarjeta"
      />

      {resultados.length > 0 && !elegida
        ? resultados.map((r) => {
            const n = r.titulo ?? r.contacts?.nombre ?? r.contacts?.username ?? 'Sin título'
            return (
              <button
                key={r.id}
                type="button"
                className="tarjeta-vieja"
                style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left', width: '100%' }}
                onClick={() => setElegida({ id: r.id, nombre: n })}
              >
                {n}
              </button>
            )
          })
        : null}

      {elegida ? (
        <form
          style={{ display: 'grid', gap: 6 }}
          onSubmit={async (e) => {
            e.preventDefault()
            await llamar('unir_tarjetas', {
              p_superviviente: tarjetaId, p_absorbida: elegida.id, p_motivo: motivo,
            })
          }}
        >
          <p style={{ fontSize: 13, margin: 0 }}>
            Se absorberá <strong>{elegida.nombre}</strong>. Sus hilos pasan a esta tarjeta.
          </p>
          <input
            className="campo"
            placeholder="Motivo (mínimo 8 caracteres)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
            minLength={8}
            aria-label="Motivo de la unión"
          />
          <span className="ficha__ayuda">Queda escrito en el hilo y se puede deshacer.</span>
          <button className="btn" type="submit" disabled={ocupado} style={{ padding: '6px 14px', fontSize: 13 }}>
            Unir
          </button>
        </form>
      ) : null}

      <button
        type="button"
        onClick={() => { setAbierto(false); setElegida(null); setTermino(''); setResultados([]) }}
        style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 13, color: 'var(--k-text-2)', textAlign: 'left', padding: 0 }}
      >
        Cancelar
      </button>
    </section>
  )
}
