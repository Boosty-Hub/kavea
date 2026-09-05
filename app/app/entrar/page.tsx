'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { EntrarConFacebook } from '../entrar-con-facebook'

export default function Entrar() {
  const router = useRouter()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // El aviso de vuelta del diálogo de Facebook se lee de la URL en un efecto y
  // no con `useSearchParams`, que obliga a envolver la página en un Suspense
  // para poder prerenderizarla y haría fallar el `build` de CI.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('fallo') === 'facebook') {
      setError('No se completó la entrada con Facebook. Prueba otra vez o usa tu correo.')
    }
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)

    const supabase = crearClienteNavegador()
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave })

    if (error) {
      // El error dice qué pasó y qué hacer, sin exponer la excepción cruda ni
      // distinguir "usuario no existe" de "contraseña incorrecta", que sería
      // un oráculo de enumeración de cuentas.
      setError('No se pudo entrar. Revisa el correo y la contraseña.')
      setEnviando(false)
      return
    }

    // En admin.kavea.ai la raíz redirige a /admin, así que basta con ir a la
    // raíz y dejar que el servidor decida según la superficie.
    router.refresh()
    router.push('/')
  }

  return (
    <main className="pagina" style={{ maxWidth: 420 }}>
      <p className="label">Kavea</p>
      <h1 style={{ marginBlock: '12px 24px' }}>Entrar</h1>

      <EntrarConFacebook />

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

      <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }}>
        <div>
          <label htmlFor="correo" className="label">Correo</label>
          <input
            id="correo"
            className="campo"
            type="email"
            autoComplete="username"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            style={{ marginTop: 6 }}
          />
        </div>

        <div>
          <label htmlFor="clave" className="label">Contraseña</label>
          <input
            id="clave"
            className="campo"
            type="password"
            autoComplete="current-password"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            style={{ marginTop: 6 }}
          />
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Entrando' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
