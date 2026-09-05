'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { EntrarConFacebook } from '../entrar-con-facebook'

/**
 * Alta self-service, paso 1 de 2: la cuenta.
 *
 * POR QUÉ DOS PASOS Y NO UNO. El espacio no se puede crear aquí: `registrarse`
 * exige el correo confirmado, y sin esa exigencia el primero que pase se sienta
 * encima de los subdominios que le apetezcan con correos que no existen. Así
 * que este paso solo crea la cuenta y manda el correo; el espacio se elige en
 * `/crear`, adonde lleva el enlace de confirmación, ya con sesión.
 *
 * DÓNDE VIVE. En `cuenta.kavea.ai`, que es la superficie sin inquilino: quien
 * se registra todavía no tiene subdominio, así que no puede estar en el suyo.
 * `lib/dominio.ts` la marca como reservada y por eso no resuelve a ninguna
 * organización.
 *
 * NO SE DISTINGUE «ya existe» DE «se envió». La respuesta es la misma tanto si
 * el correo es nuevo como si ya tenía cuenta: decir cuál es sería un oráculo
 * para enumerar clientes de Kavea, el mismo criterio que ya usa `/entrar`.
 */
export default function Registro() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [desdeElSitio, setDesdeElSitio] = useState(false)

  // `?con=facebook` lo pone el botón del sitio público, que es estático y no
  // puede abrir el diálogo él mismo. Quien llega así ya pulsó un botón que decía
  // Facebook: pedirle que pulse otro igual sería cobrarle el clic dos veces.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    // `sin-correo` lo pone `/entrar/retorno` cuando Facebook autentica pero no
    // entrega correo. No se reintenta solo con Facebook: acabaría en el mismo
    // sitio. Se le deja el alta por correo, que es la que sí funciona.
    if (q.get('fallo') === 'sin-correo') {
      setError(
        'Facebook no nos dio tu correo, y sin correo no podemos crear tu espacio. ' +
        'Créala aquí con tu correo, o revisa en Facebook que tu cuenta tenga uno.',
      )
      return
    }
    setDesdeElSitio(q.get('con') === 'facebook')
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    // El `minLength` del campo ya frena esto antes de llegar aquí; se repite
    // porque un formulario enviado por programa se lo salta.
    //
    // Y CONVIENE SABER QUE EL SERVIDOR ES MÁS FLOJO QUE ESTA PANTALLA: el
    // proyecto de Supabase tiene `password_min_length: 6`, así que quien se
    // salte el navegador puede registrar una de seis. Ocho es lo que Kavea
    // pide; seis es lo que Kavea acepta. Se arregla en la configuración del
    // proyecto, no aquí, y queda anotado en la bitácora.
    if (clave.length < 8) {
      setError('La contraseña necesita al menos 8 caracteres.')
      return
    }
    setEnviando(true); setError(null)

    const { error } = await crearClienteNavegador().auth.signUp({
      email: correo.trim(),
      password: clave,
      // A dónde lleva el enlace del correo. Tiene que estar en la lista de
      // redirecciones permitidas del proyecto de Supabase o el enlace acaba en
      // `site_url` y el usuario aterriza en cualquier sitio menos aquí.
      options: { emailRedirectTo: `${window.location.origin}/crear` },
    })

    setEnviando(false)
    if (error) {
      setError('No se pudo crear la cuenta ahora mismo. Inténtalo en un minuto.')
      return
    }
    setEnviado(true)
  }

  if (enviado) {
    return (
      <main className="pagina" style={{ maxWidth: 460 }}>
        <p className="label">Kavea</p>
        <h1 style={{ marginBlock: '12px 16px' }}>Revisa tu correo</h1>
        <p style={{ color: 'var(--k-text-2)', lineHeight: 1.6 }}>
          Si <strong>{correo.trim()}</strong> no tenía cuenta, le acaba de llegar un enlace
          para confirmarla. Al abrirlo eliges el nombre y el subdominio de tu espacio.
        </p>
        <p style={{ color: 'var(--k-text-2)', marginTop: 16, fontSize: 13 }}>
          El enlace caduca. Si no llega en unos minutos, mira en spam.
        </p>
      </main>
    )
  }

  return (
    <main className="pagina" style={{ maxWidth: 420 }}>
      <p className="label">Kavea</p>
      <h1 style={{ marginBlock: '12px 8px' }}>Crear una cuenta</h1>
      <p style={{ color: 'var(--k-text-2)', marginBottom: 24, lineHeight: 1.6 }}>
        Después eliges tu subdominio y conectas WhatsApp e Instagram desde el propio panel.
      </p>

      <EntrarConFacebook texto="Crear cuenta con Facebook" arranqueAutomatico={desdeElSitio} />
      <p style={{ color: 'var(--k-text-2)', fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
        Con Facebook no hay que confirmar el correo: Meta ya lo da verificado, así que se entra
        directo a elegir el nombre del espacio.
      </p>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          margin: '20px 0', color: 'var(--k-text-2)', fontSize: 13,
        }}
      >
        <span style={{ flex: 1, borderTop: '1px solid var(--k-border)' }} />
        o con tu correo
        <span style={{ flex: 1, borderTop: '1px solid var(--k-border)' }} />
      </div>

      <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
        <div>
          <label className="label" htmlFor="correo">Correo</label>
          <input
            id="correo" type="email" required autoComplete="email"
            className="campo" value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="clave">Contraseña</label>
          <input
            id="clave" type="password" required autoComplete="new-password" minLength={8}
            className="campo" value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <p style={{ color: 'var(--k-text-2)', fontSize: 12, marginTop: 6 }}>
            Ocho caracteres o más.
          </p>
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}

        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Creando' : 'Crear cuenta'}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 13, color: 'var(--k-text-2)' }}>
        ¿Ya tienes espacio? <Link href="/entrar">Entrar</Link>
      </p>
    </main>
  )
}
