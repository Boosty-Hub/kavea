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
  const [listo, setListo] = useState<{ slug: string; avisoMeta: boolean } | null>(null)
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

    // EL SUBDOMINIO NO EXISTE HASTA QUE NETLIFY LO SABE. La zona de kavea.ai
    // lleva un registro por host y no hay comodín, así que sin este paso el
    // cliente aterrizaría en un host muerto y el alta habría dicho «hecho».
    // Es la lección de la 0059 —un espacio al que no puede entrar nadie— una
    // capa más arriba.
    const prov = await fetch('/api/subdominio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizacion: data.organizacion_id }),
    }).then((r) => r.json()).catch(() => ({ error: 'sin respuesta' }))

    // NO SE REDIRIGE. Y no es prudencia de más: medido el 23-ago-2026, que
    // Netlify acepte el alias NO significa que el host resuelva. `cuenta` y
    // `conectar` respondieron en segundos; `demostracion`, dado de alta de la
    // misma forma y con su registro ya listado en la zona, seguía sin existir
    // para el servidor autoritativo quince minutos después. No sé explicar la
    // diferencia, así que el código no la da por buena: mandar al cliente a su
    // host recién creado es mandarlo a un error de DNS la mitad de las veces.
    //
    // El certificado del sitio es `*.kavea.ai`, así que TLS nunca es el
    // problema; lo que tarda es el DNS. Y el comodín DNS sigue bloqueado por
    // Netlify —`422 invalid site`, comprobado el mismo día—, que es lo que
    // obliga a un alias por inquilino.
    setListo({ slug: data.slug, avisoMeta: prov?.ok !== true })
    setEnviando(false)
  }

  if (listo) {
    const url = `https://${listo.slug}.${RAIZ}`
    return (
      <main className="pagina" style={{ maxWidth: 480 }}>
        <p className="label">Kavea</p>
        <h1 style={{ marginBlock: '12px 16px' }}>Tu espacio ya existe</h1>
        <p style={{ color: 'var(--k-text-2)', lineHeight: 1.6 }}>
          Se llama <strong>{listo.slug}</strong> y eres su propietario. Se entra por:
        </p>
        <p style={{ margin: '14px 0' }}>
          <a href={url} style={{ fontSize: 18 }}>{listo.slug}.{RAIZ}</a>
        </p>
        <p style={{ color: 'var(--k-text-2)', fontSize: 13, lineHeight: 1.6 }}>
          {listo.avisoMeta
            ? 'El enrutado del subdominio no se pudo confirmar. Guarda esta dirección: si todavía no abre, vuelve a intentarlo en unos minutos.'
            : 'La dirección puede tardar unos minutos en responder la primera vez, mientras se propaga el DNS. Guárdala.'}
        </p>
      </main>
    )
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
