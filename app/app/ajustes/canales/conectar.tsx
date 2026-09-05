import { LogoCanal } from '@/lib/logos-canal'

/**
 * Cómo se conecta un canal, dicho en tarjetas y en pasos.
 *
 * POR QUÉ EXISTE. Meta rechazó Human Agent el 4-sep-2026 con «Unable to Locate
 * Facebook Login»: su revisor no encontró el botón. Antes de esta pantalla lo
 * único que había era un botón azul suelto con una frase debajo, sin decir qué
 * canales entran por él, qué va a pedir Meta ni qué pasa después. Si un revisor
 * que viene a buscarlo no lo encuentra, un cliente que no sabe que existe
 * tampoco.
 *
 * LAS TARJETAS DICEN LA VERDAD, Y UNA DICE «NO». WhatsApp **no** entra por este
 * diálogo: `configDe()` en `lib/meta-oauth.ts` solo tiene `mensajeria`
 * —Messenger e Instagram, la configuración del 23-ago—, y `META_CONFIG_WHATSAPP`
 * no existe ni como variable en Netlify porque Embedded Signup sigue detrás de
 * la pantalla rota de Tech Provider. Una tarjeta de WhatsApp que llevara a este
 * botón sería una promesa falsa, así que dice quién lo conecta de verdad.
 *
 * UNA AUTORIZACIÓN, DOS CANALES: Instagram y Messenger cuelgan de la misma
 * Página, así que se autoriza una vez y se eligen después. Eso hay que decirlo
 * antes, o el segundo canal parece que falta.
 */

type Canal = {
  clave: string
  nombre: string
  que: string
  /** `aqui` entra por este diálogo; `asistido` lo conecta Boosty a mano. */
  via: 'aqui' | 'asistido'
  nota: string
}

const CANALES: Canal[] = [
  {
    clave: 'messenger',
    nombre: 'Messenger',
    que: 'Los mensajes que llegan a la Página de Facebook de tu negocio.',
    via: 'aqui',
    nota: 'Entra con la autorización de abajo',
  },
  {
    clave: 'instagram',
    nombre: 'Instagram',
    que: 'Los mensajes directos y los comentarios de tu cuenta profesional.',
    via: 'aqui',
    nota: 'La misma autorización, si tu cuenta está unida a esa Página',
  },
  {
    clave: 'whatsapp',
    nombre: 'WhatsApp',
    que: 'Las conversaciones del número de empresa que ya usas.',
    via: 'asistido',
    nota: 'Todavía lo conectamos nosotros: escríbenos y lo dejamos listo',
  },
]

export function ConectarUnCanal({
  puedeConectar,
  yaAutorizo,
  autorizacionMuerta,
  hayConexiones,
}: {
  puedeConectar: boolean
  yaAutorizo: boolean
  autorizacionMuerta: boolean
  hayConexiones: boolean
}) {
  const autorizado = yaAutorizo && !autorizacionMuerta

  return (
    <section className="tarjeta" style={{ marginBottom: 28, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '22px 24px 4px' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>
          {hayConexiones ? 'Conectar otro canal' : 'Conecta tu primer canal'}
        </h2>
        <p style={{ color: 'var(--k-text-2)', fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' }}>
          Estos son los canales que Kavea atiende. Messenger e Instagram entran con una sola
          autorización de Facebook, porque cuelgan de la misma Página.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
          padding: '18px 24px 22px',
        }}
      >
        {CANALES.map((c) => (
          <article
            key={c.clave}
            style={{
              border: '1px solid var(--k-border)',
              borderRadius: 12,
              padding: 16,
              display: 'grid',
              gap: 10,
              alignContent: 'start',
              // El canal que no entra por aquí se pinta apagado: la jerarquía
              // dice a qué se puede dar antes de leer una palabra.
              background: c.via === 'aqui' ? 'var(--k-surface)' : 'transparent',
              opacity: c.via === 'aqui' ? 1 : 0.75,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoCanal canal={c.clave} size={26} />
              <strong style={{ fontSize: 15 }}>{c.nombre}</strong>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--k-text-2)', lineHeight: 1.55 }}>
              {c.que}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.5,
                color: c.via === 'aqui' ? 'var(--k-resuelta-fg)' : 'var(--k-text-2)',
              }}
            >
              {c.via === 'aqui' ? '● ' : '○ '}
              {c.nota}
            </p>
          </article>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--k-border)', padding: '20px 24px 24px' }}>
        <p className="label" style={{ marginBottom: 12 }}>
          {autorizado ? 'Ya autorizaste. Queda un paso' : 'Cómo se conecta, en tres pasos'}
        </p>

        <ol style={{ margin: '0 0 20px', padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
          <Paso n={1} hecho={autorizado} titulo="Autorizas con Facebook">
            Se abre el diálogo de Meta, entras con tu cuenta y eliges el portafolio de empresa
            donde están tus Páginas. Kavea no ve tu contraseña en ningún momento.
          </Paso>
          <Paso n={2} hecho={false} titulo="Eliges qué conectar, dentro de Kavea">
            Te listamos tus Páginas y las cuentas de Instagram unidas a ellas. Marcas las que
            quieras atender; lo que no marques se queda fuera.
          </Paso>
          <Paso n={3} hecho={false} titulo="Empiezan a entrar los mensajes">
            Kavea se suscribe a los avisos de Meta y las conversaciones aparecen en la bandeja en
            segundos. Lo anterior a la conexión no se puede recuperar: Meta no lo entrega.
          </Paso>
        </ol>

        {puedeConectar ? (
          autorizado ? (
            <>
              <a className="boton" href="/ajustes/canales/elegir">Elegir qué conectar</a>
              <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '10px 0 0', lineHeight: 1.6 }}>
                Desde ahí activas las Páginas e Instagram que quieras sin volver a pasar por Meta.{' '}
                <a href="/api/meta/oauth/start?canal=mensajeria">Autorizar otra cuenta</a> si las
                Páginas que buscas están en otro portafolio.
              </p>
            </>
          ) : (
            <>
              {/* AZUL DE META Y CON SU LOGO, no el terracota de Kavea. No es
                  cosmética: lo que Meta rechazó el 4-sep es que su revisor no
                  encontrara el botón de Facebook Login, y un botón que no parece
                  de Facebook no se encuentra buscando uno de Facebook. Vale
                  igual para un cliente, que reconoce el azul antes de leer. */}
              <a
                className="boton"
                href="/api/meta/oauth/start?canal=mensajeria"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: '#1877F2', borderColor: '#1877F2', color: '#fff',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.25h3.32l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
                </svg>
                Conectar con Facebook
              </a>
              <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: '10px 0 0', lineHeight: 1.6 }}>
                Al pulsar sales a Facebook. Te pedirá permiso para leer y responder los mensajes de
                las Páginas que elijas, y volverás aquí para marcarlas.
              </p>
            </>
          )
        ) : (
          // El 403 no se ofrece: conectar es solo del propietario
          // (`0040_equipo.sql:43`), así que aquí se dice a quién pedírselo.
          <p style={{ fontSize: 13, color: 'var(--k-text-2)', margin: 0, lineHeight: 1.6 }}>
            Conectar canales es cosa del <strong>propietario</strong> del espacio, porque toca las
            credenciales del negocio. Pídeselo y esta pantalla se llenará sola.
          </p>
        )}
      </div>
    </section>
  )
}

function Paso({
  n, titulo, hecho, children,
}: {
  n: number
  titulo: string
  hecho: boolean
  children: React.ReactNode
}) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 12, alignItems: 'start' }}>
      <span
        aria-hidden="true"
        style={{
          width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
          fontSize: 13, fontWeight: 500,
          border: hecho ? 'none' : '1px solid var(--k-border)',
          background: hecho ? 'var(--k-resuelta-fg)' : 'transparent',
          color: hecho ? '#fff' : 'var(--k-text-2)',
        }}
      >
        {hecho ? '✓' : n}
      </span>
      <div>
        <strong style={{ fontSize: 14, display: 'block' }}>{titulo}</strong>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--k-text-2)', lineHeight: 1.6 }}>
          {children}
        </p>
      </div>
    </li>
  )
}
