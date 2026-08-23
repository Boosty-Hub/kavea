'use client'

import { useEffect, useRef, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * Alta self-service, paso 2 de 2: el espacio.
 *
 * Aquí llega el enlace de confirmación del correo, así que hay sesión y el
 * correo ya está confirmado — las dos cosas que `registrarse` exige. Si alguien
 * abre esta ruta sin sesión, se le manda a registrarse en vez de enseñarle un
 * formulario que va a fallar al final.
 *
 * EL SUBDOMINIO ES LA DECISIÓN IRREVERSIBLE de esta pantalla, y por eso se
 * comprueba mientras se escribe y se enseña el host entero debajo. `slug` es
 * único y cambiarlo rompe los enlaces que el cliente ya haya guardado; la
 * bitácora lo tiene como decisión abierta desde el 6-ago.
 *
 * La comprobación va contra `subdominio_libre`, que devuelve un booleano y
 * nada más: con un `select` sobre `organizations` se podría enumerar la lista
 * de clientes de Kavea.
 */

const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

/** Lo que se teclea no siempre es un subdominio; esto lo acerca sin pelearse. */
function aSlug(v: string) {
  return v
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // fuera acentos
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
}

export default function Crear() {
  const [sesion, setSesion] = useState<'mirando' | 'si' | 'no'>('mirando')
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [tocado, setTocado] = useState(false)
  const [libre, setLibre] = useState<boolean | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    crearClienteNavegador().auth.getSession().then(({ data }) => {
      setSesion(data.session ? 'si' : 'no')
    })
  }, [])

  // El slug sigue al nombre hasta que alguien lo toca a mano. A partir de ahí
  // manda la persona: sobrescribir lo que acaba de escribir es de las cosas que
  // más molestan de un formulario.
  useEffect(() => {
    if (!tocado) setSlug(aSlug(nombre).replace(/^-|-$/g, ''))
  }, [nombre, tocado])

  useEffect(() => {
    setLibre(null)
    if (slug.length < 3) return
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = setTimeout(async () => {
      const { data, error } = await crearClienteNavegador()
        .rpc('subdominio_libre', { p_slug: slug })
      if (!error) setLibre(Boolean(data))
    }, 350)
    return () => { if (reloj.current) clearTimeout(reloj.current) }
  }, [slug])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true); setError(null)

    const { data, error } = await crearClienteNavegador()
      .rpc('registrarse', { p_nombre: nombre.trim(), p_slug: slug })
      .single<{ organizacion_id: string; slug: string }>()

    if (error || !data) {
      // El mensaje de Postgres aquí SÍ se enseña: son frases escritas para que
      // las lea un cliente («ya hay un espacio con ese subdominio»), no
      // excepciones crudas. La 0087 las redacta una a una.
      setError(error?.message ?? 'No se pudo crear el espacio.')
      setEnviando(false)
      return
    }

    // A su casa. Con protocolo explícito porque se cambia de host y en local
    // no hay https.
    const protocolo = window.location.protocol
    const puerto = window.location.port ? `:${window.location.port}` : ''
    window.location.href = `${protocolo}//${data.slug}.${RAIZ}${puerto}/bandeja`
  }

  if (sesion === 'mirando') return <main className="pagina" />

  if (sesion === 'no') {
    return (
      <main className="pagina" style={{ maxWidth: 420 }}>
        <p className="label">Kavea</p>
        <h1 style={{ marginBlock: '12px 16px' }}>Este enlace ya no vale</h1>
        <p style={{ color: 'var(--k-text-2)', lineHeight: 1.6 }}>
          El enlace de confirmación caduca y solo sirve una vez.{' '}
          <a href="/registro">Vuelve a empezar</a> y te mandamos otro.
        </p>
      </main>
    )
  }

  const puedeEnviar = nombre.trim().length >= 2 && libre === true && !enviando

  return (
    <main className="pagina" style={{ maxWidth: 460 }}>
      <p className="label">Kavea</p>
      <h1 style={{ marginBlock: '12px 8px' }}>Tu espacio</h1>
      <p style={{ color: 'var(--k-text-2)', marginBottom: 24, lineHeight: 1.6 }}>
        Correo confirmado. Solo falta cómo se llama y por dónde se entra.
      </p>

      <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }}>
        <div>
          <label className="label" htmlFor="nombre">Nombre de la empresa</label>
          <input
            id="nombre" required minLength={2} autoFocus
            className="campo" value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="slug">Subdominio</label>
          <input
            id="slug" required className="campo" value={slug}
            onChange={(e) => { setTocado(true); setSlug(aSlug(e.target.value)) }}
          />
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--k-text-2)' }}>
            {slug.length < 3
              ? 'Tres caracteres o más.'
              : <>Tu panel será <strong>{slug}.{RAIZ}</strong></>}
          </p>
          {slug.length >= 3 && libre === false ? (
            <p style={{ fontSize: 13, marginTop: 4, color: 'var(--k-escalada-fg)' }}>
              Ese no se puede usar: o está cogido, o lo reserva la plataforma.
            </p>
          ) : null}
          {libre === true ? (
            <p style={{ fontSize: 13, marginTop: 4, color: 'var(--k-resuelta-fg)' }}>
              Libre.
            </p>
          ) : null}
          <p style={{ fontSize: 12, marginTop: 8, color: 'var(--k-text-2)' }}>
            Elígelo con calma: cambiarlo después rompe los enlaces que tengas guardados.
          </p>
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}

        <button type="submit" className="boton" disabled={!puedeEnviar}>
          {enviando ? 'Creando' : 'Crear mi espacio'}
        </button>
      </form>
    </main>
  )
}
