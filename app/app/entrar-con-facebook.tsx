'use client'

import { useEffect, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/**
 * APAGADO EL 5-sep, EL MISMO DÍA QUE SE ENCENDIÓ. Meta no deja.
 *
 * El primer canje real contestó `Invalid Scopes: email`, y al buscar el caso de
 * uso que lo habilita —Use cases → Add use cases— resultó que **no está en la
 * lista**: los trece que ofrece esta app son de publicidad, Threads, Catálogo,
 * Fundraisers, Live Video, oEmbed, Páginas y App Events. Ninguno trae permisos
 * de identidad, porque es una app de Login for Business, y el propio diálogo lo
 * avisa: «not all use cases can be added to the same app. Create a new app if
 * use cases you want to add aren't available».
 *
 * Así que no hay clic que lo arregle, y dejarlo encendido era ofrecer un camino
 * muerto: a un developer le bloquea el diálogo y a un cliente le deja pasar SIN
 * correo, que es peor porque `registrarse` (0087) exige correo confirmado.
 *
 * Se apaga con `PUERTA_CON_FACEBOOK` y no se borra: el código está probado y
 * verificado contra el diálogo real —llega a Facebook, sin «URL Blocked»—, y lo
 * único que falta es una app de Meta que admita el login de consumo. Encenderlo
 * es cambiar esta constante y apuntar el proveedor de Supabase a esa app.
 *
 * Lo que NO cambia por esto: el arreglo del App Review no dependía de este
 * botón. El 7.a se remedia con el botón de Login for Business que ya existe en
 * Ajustes → Canales, haciéndolo encontrable y alcanzable por el revisor.
 */
export const PUERTA_CON_FACEBOOK = false

/**
 * «Continuar con Facebook»: la puerta que a Kavea le faltaba.
 *
 * POR QUÉ ESTÁ EN LA PUERTA Y NO SOLO EN AJUSTES. Meta rechazó Human Agent el
 * 4-sep-2026 con «Unable to Locate Facebook Login» (Platform Term 7.a, Web). El
 * revisor no encontró ningún botón de Facebook, y no por descuido suyo: el único
 * que existía vive tres clics dentro de Ajustes → Canales y además es solo del
 * propietario (`0040_equipo.sql:43`), mientras su cuenta tiene rol `agente`. No
 * podía llegar al diálogo ni con instrucciones perfectas. Un botón en la pantalla
 * de entrada es exactamente lo que esa comprobación busca.
 *
 * NO ES EL MISMO DIÁLOGO QUE CONECTAR CANALES, y la diferencia importa:
 *   - aquí: Facebook Login de consumo, y lo único que se pide es identidad;
 *   - en Ajustes → Canales: Facebook Login for Business con `config_id`, que es
 *     lo que da acceso a las Páginas y a los Instagram del negocio.
 * Por eso un cliente pulsa «Facebook» dos veces en su primer día. La pantalla
 * intermedia de F5 existe para explicarle el segundo.
 *
 * `arranqueAutomatico` lo usa el enlace del sitio público: allí el botón ya dice
 * Facebook, y hacer que el usuario lo pulse otra vez al llegar sería pedirle dos
 * veces lo mismo. El sitio público es estático y sin JavaScript a propósito, así
 * que no puede abrir el diálogo él mismo.
 */
export function EntrarConFacebook({
  texto = 'Continuar con Facebook',
  arranqueAutomatico = false,
}: {
  texto?: string
  arranqueAutomatico?: boolean
}) {
  const [yendo, setYendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function entrar() {
    setYendo(true)
    setError(null)

    const { error } = await crearClienteNavegador().auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        // Se vuelve al MISMO host desde el que se pulsó. El `uri_allow_list` del
        // proyecto ya cubre `https://*.kavea.ai/**`, así que vale igual para
        // `cuenta` que para el subdominio de un espacio.
        redirectTo: `${window.location.origin}/entrar/retorno`,
      },
    })

    // Si `signInWithOAuth` no devuelve error, el navegador ya se está yendo a
    // Facebook: no se restaura `yendo`, porque quitar el «Abriendo Facebook» a
    // mitad de la salida parpadea sin motivo.
    if (error) {
      setError('No se pudo abrir el diálogo de Facebook. Inténtalo otra vez.')
      setYendo(false)
    }
  }

  useEffect(() => {
    if (arranqueAutomatico) void entrar()
    // Una sola vez, al montar. `entrar` no cambia entre renders de forma que
    // importe y volver a lanzarla dejaría al usuario en un bucle de diálogos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arranqueAutomatico])

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        className="boton"
        onClick={entrar}
        disabled={yendo}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: '#1877F2',
          borderColor: '#1877F2',
          color: '#fff',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.25h3.32l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
        </svg>
        {yendo ? 'Abriendo Facebook' : texto}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  )
}
