'use client'

import { useCallback, useEffect, useState } from 'react'
import { LogoCanal } from '@/lib/logos-canal'

/**
 * El contenido de una Página y de su Instagram, con la identidad delante.
 *
 * LA IDENTIDAD ARRIBA NO ES ADORNO. Meta rechazó `pages_read_engagement` porque
 * el vídeo no enseñaba «the rendered results in your app's UI with the Page
 * identity visibly displayed», e `instagram_basic` porque no se veía «the
 * selected Instagram professional account with its handle or ID visible». Por
 * eso la foto, el nombre y el handle encabezan cada bloque, y por eso el
 * identificador numérico también está a la vista: es lo que permite a un revisor
 * comprobar que lo que se pinta es de la cuenta que dice ser.
 *
 * DOS PESTAÑAS Y NO UNA COLUMNA. Página e Instagram son dos permisos distintos
 * que se revisan por separado; tenerlos en pestañas hace que cada uno se pueda
 * grabar sin que el otro estorbe en el encuadre.
 */

type Perfil = Record<string, unknown>
type Medio = {
  id: string
  media_type: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  caption?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
}
type Post = { id: string; message?: string; created_time?: string; permalink_url?: string; full_picture?: string }
type Foto = { id: string; name?: string; created_time?: string; link?: string; images?: Array<{ source: string }> }
type Evento = { id: string; name?: string; start_time?: string; place?: { name?: string } }

function fecha(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function Contenido({ conexion, tieneInstagram }: { conexion: string; tieneInstagram: boolean }) {
  const [pestana, setPestana] = useState<'pagina' | 'instagram'>('pagina')
  /**
   * El dato viaja CON la pestaña a la que pertenece.
   *
   * Sin eso hay una carrera de un fotograma: al pulsar «Instagram», React
   * repinta con `pestana` ya cambiada y `datos` todavía con la respuesta de la
   * Página, y el bloque de Instagram intenta leer `perfil.profile_picture_url`
   * sobre algo que no existe. Reventó en la primera prueba.
   */
  const [datos, setDatos] = useState<{ de: 'pagina' | 'instagram'; d: Record<string, any> } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (accion: 'pagina' | 'instagram') => {
    setCargando(true); setError(null); setDatos(null)
    try {
      const r = await fetch('/api/contenido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, conexion }),
      })
      const d = await r.json().catch(() => ({}))
      if (!d?.ok) setError(d?.error ?? 'No se pudo leer el contenido.')
      else setDatos({ de: accion, d })
    } catch {
      setError('No se pudo leer el contenido ahora mismo.')
    }
    setCargando(false)
  }, [conexion])

  useEffect(() => { void cargar(pestana) }, [cargar, pestana])

  return (
    <div style={{ marginTop: 24 }}>
      {tieneInstagram ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['pagina', 'instagram'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="operar__control"
              onClick={() => setPestana(p)}
              style={{
                cursor: 'pointer', fontSize: 13,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                borderColor: pestana === p ? 'var(--k-accent)' : undefined,
                color: pestana === p ? 'var(--k-accent)' : undefined,
              }}
            >
              <LogoCanal canal={p === 'pagina' ? 'messenger' : 'instagram'} size={14} />
              {p === 'pagina' ? 'Página' : 'Instagram'}
            </button>
          ))}
        </div>
      ) : null}

      {cargando ? <p className="ficha__vacia">Leyendo de Meta…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {datos?.de === 'instagram' && pestana === 'instagram' ? <BloqueInstagram d={datos.d} /> : null}
      {datos?.de === 'pagina' && pestana === 'pagina' ? <BloquePagina d={datos.d} /> : null}
    </div>
  )
}

function Identidad({
  foto, titulo, subtitulo, id, campos,
}: {
  foto?: string
  titulo: string
  subtitulo?: string
  id: string
  campos: Array<[string, string | number | undefined]>
}) {
  return (
    <div className="tarjeta" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Sin `next/image`: la URL viene de un CDN de Meta que caduca y que no
            está en la lista de dominios permitidos. Una etiqueta normal no
            necesita configuración y aquí no hay que optimizar nada. */}
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto}
            alt=""
            width={56}
            height={56}
            style={{ borderRadius: '50%', objectFit: 'cover', flex: 'none' }}
          />
        ) : null}
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 17 }}>{titulo}</span>
          {subtitulo ? (
            <span style={{ color: 'var(--k-text-2)', fontSize: 14 }}>{subtitulo}</span>
          ) : null}
          {/* El id a la vista: es lo que deja comprobar de qué cuenta es esto. */}
          <span style={{ color: 'var(--k-text-2)', fontSize: 12 }}>ID {id}</span>
        </div>
      </div>

      <dl
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12, margin: 0,
        }}
      >
        {campos.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
          <div key={k}>
            <dt className="label" style={{ marginBottom: 2 }}>{k}</dt>
            <dd style={{ margin: 0, fontSize: 14 }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function BloqueInstagram({ d }: { d: Record<string, any> }) {
  const p = d.perfil as Perfil & Record<string, any>
  const medios = (d.medios ?? []) as Medio[]

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Identidad
        foto={p.profile_picture_url}
        titulo={`@${p.username}`}
        subtitulo={p.name}
        id={String(p.id)}
        campos={[
          ['Seguidores', p.followers_count],
          ['Siguiendo', p.follows_count],
          ['Publicaciones', p.media_count],
          ['Sitio web', p.website],
        ]}
      />

      {p.biography ? (
        <div>
          <p className="label">Biografía</p>
          <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 14 }}>{p.biography}</p>
        </div>
      ) : null}

      <div>
        {/* «labeled for that account», literal de la nota de rechazo. */}
        <p className="label">Publicaciones de @{p.username}</p>
        {d.aviso_medios ? (
          <p className="error" role="alert" style={{ marginTop: 8 }}>{d.aviso_medios}</p>
        ) : null}
        {medios.length === 0 && !d.aviso_medios ? (
          <p className="ficha__vacia" style={{ marginTop: 8 }}>Esta cuenta no tiene publicaciones.</p>
        ) : null}
        <ul
          style={{
            listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          }}
        >
          {medios.map((m) => (
            <li key={m.id} className="tarjeta" style={{ padding: 0, overflow: 'hidden' }}>
              <a
                href={m.permalink}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none', color: 'inherit', display: 'grid' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.thumbnail_url ?? m.media_url}
                  alt={m.caption ? m.caption.slice(0, 80) : 'Publicación de Instagram'}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                />
                <span style={{ padding: '8px 10px', display: 'grid', gap: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--k-text-2)' }}>
                    {m.media_type} · {fecha(m.timestamp)}
                  </span>
                  {m.caption ? (
                    <span
                      style={{
                        fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {m.caption}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, color: 'var(--k-text-2)' }}>
                    ♥ {m.like_count ?? 0} · 💬 {m.comments_count ?? 0}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function BloquePagina({ d }: { d: Record<string, any> }) {
  const p = d.pagina as Record<string, any>
  const posts = (d.publicaciones ?? []) as Post[]
  const fotos = (d.fotos ?? []) as Foto[]
  const eventos = (d.eventos ?? []) as Evento[]
  const avisos = (d.avisos ?? {}) as Record<string, string | null>

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Identidad
        foto={p.picture?.data?.url ?? p.picture?.url}
        titulo={p.name}
        subtitulo={p.category}
        id={String(p.id)}
        campos={[
          ['Seguidores', p.followers_count],
          ['Me gusta', p.fan_count],
          ['Usuario', p.username ? `@${p.username}` : undefined],
        ]}
      />

      {p.about ? (
        <div>
          <p className="label">Sobre la Página</p>
          <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 14 }}>{p.about}</p>
        </div>
      ) : null}

      <Seccion titulo={`Publicaciones de ${p.name}`} aviso={avisos.publicaciones} vacio={posts.length === 0}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {posts.map((x) => (
            <li key={x.id} className="tarjeta" style={{ padding: 12, display: 'flex', gap: 12 }}>
              {x.full_picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={x.full_picture}
                  alt=""
                  width={64}
                  height={64}
                  style={{ borderRadius: 6, objectFit: 'cover', flex: 'none' }}
                />
              ) : null}
              <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>{fecha(x.created_time)}</span>
                <span style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {x.message ?? '(sin texto)'}
                </span>
                {x.permalink_url ? (
                  <a href={x.permalink_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Ver en Facebook
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo={`Fotos de ${p.name}`} aviso={avisos.fotos} vacio={fotos.length === 0}>
        <ul
          style={{
            listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          }}
        >
          {fotos.map((f) => (
            <li key={f.id}>
              <a href={f.link} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.images?.[f.images.length - 1]?.source ?? f.images?.[0]?.source}
                  alt={f.name ?? 'Foto de la Página'}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, display: 'block' }}
                />
              </a>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo={`Eventos de ${p.name}`} aviso={avisos.eventos} vacio={eventos.length === 0}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {eventos.map((e) => (
            <li key={e.id} className="tarjeta" style={{ padding: 12 }}>
              <span style={{ fontWeight: 500 }}>{e.name}</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--k-text-2)' }}>
                {fecha(e.start_time)}{e.place?.name ? ` · ${e.place.name}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  )
}

/**
 * Una sección con su propio estado.
 *
 * «Sin eventos» y «no se pudieron leer los eventos» se ven igual si nadie lo
 * dice, y son cosas muy distintas: una es un hecho del negocio y la otra un
 * permiso que falta.
 */
function Seccion({
  titulo, aviso, vacio, children,
}: {
  titulo: string
  aviso?: string | null
  vacio: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="label">{titulo}</p>
      {aviso ? (
        <p style={{ fontSize: 13, color: 'var(--k-escalada-fg)', margin: '6px 0 0' }}>
          No se pudo leer: {aviso}
        </p>
      ) : vacio ? (
        <p className="ficha__vacia" style={{ marginTop: 8 }}>No hay nada aquí.</p>
      ) : (
        <div style={{ marginTop: 10 }}>{children}</div>
      )}
    </div>
  )
}
