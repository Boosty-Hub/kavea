'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

export function Aceptar({ token, correo }: { token: string; correo: string }) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true); setError(null); setAviso(null)

    const r = await fetch('/api/invitacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, clave, nombre }),
    })
    const j = await r.json()

    if (!r.ok || j.error) {
      setEnviando(false)
      setError(j.error ?? 'No se pudo completar la invitación.')
      return
    }

    if (j.yaTenia) {
      // Ya tenía cuenta: se le añadió al equipo pero no se le toca la
      // contraseña. Cambiarla desde aquí convertiría una invitación en un
      // secuestro de cuenta.
      setEnviando(false)
      setAviso(j.aviso)
      return
    }

    // Se inicia sesión desde aquí para que no tenga que escribir dos veces lo
    // que acaba de escribir.
    const { error: errEntrar } = await crearClienteNavegador()
      .auth.signInWithPassword({ email: correo, password: clave })

    setEnviando(false)
    if (errEntrar) { setAviso('Ya puedes entrar con ese correo y contraseña.'); return }

    router.refresh()
    router.push('/bandeja')
  }

  if (aviso) {
    return (
      <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
        <p style={{ margin: 0 }}>{aviso}</p>
        <a className="btn" href="/entrar" style={{ justifySelf: 'start', textDecoration: 'none' }}>
          Entrar
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 16, marginTop: 24 }}>
      <div>
        <label htmlFor="nombre" className="label">Cómo te llamas</label>
        <input
          id="nombre"
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
          maxLength={80}
          autoComplete="name"
          style={{ marginTop: 6 }}
        />
        <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
          Es lo que verán tus compañeros en el registro de cada conversación.
        </span>
      </div>

      <div>
        <label htmlFor="clave" className="label">Contraseña</label>
        <input
          id="clave"
          className="campo"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          required
          minLength={10}
          autoComplete="new-password"
          style={{ marginTop: 6 }}
        />
        <span style={{ fontSize: 12, color: 'var(--k-text-2)' }}>
          Diez caracteres como mínimo.
        </span>
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <button className="btn" type="submit" disabled={enviando} style={{ justifySelf: 'start' }}>
        {enviando ? 'Creando el acceso' : 'Entrar en el equipo'}
      </button>
    </form>
  )
}
