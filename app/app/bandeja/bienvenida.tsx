import Link from 'next/link'

/**
 * Lo primero que ve un espacio recién creado.
 *
 * POR QUÉ NO ES UN SPLASH QUE SE DESCARTA. Conectar un canal falla a medias con
 * frecuencia —un portafolio sin Páginas, un permiso que Meta rechaza, un token
 * que se invalida—, y un cartel de una sola vez deja a quien lo cerró en una
 * bandeja vacía sin ningún camino de vuelta. Vive en el estado vacío de la
 * bandeja: mientras falte algo se ve, cuando esté hecho desaparece solo, y no
 * hay una ruta más que se pueda perder.
 *
 * POR QUÉ EXISTE. Hasta hoy el estado vacío decía que las conversaciones
 * «aparecerán en cuanto alguien escriba por un canal conectado», que en un
 * espacio sin conexiones es mandar esperar a quien tiene trabajo por hacer.
 *
 * Y EL RAMAL DEL QUE NO ES PROPIETARIO no es un detalle de cortesía: conectar
 * canales es solo del `owner` (`0040_equipo.sql:43`), así que a un `agente` un
 * botón de conectar le daría un 403. Se le dice a quién pedírselo.
 */
export function Bienvenida({
  nombre,
  hayCanal,
  puedeConectar,
}: {
  nombre: string
  hayCanal: boolean
  puedeConectar: boolean
}) {
  return (
    <div style={{ padding: '32px 24px', display: 'grid', gap: 20 }}>
      <div>
        <p className="label">{nombre}</p>
        <h2 style={{ fontSize: 19, marginBlock: '6px 8px' }}>
          {hayCanal ? 'Esperando el primer mensaje' : 'Conecta tu primer canal'}
        </h2>
        <p style={{ color: 'var(--k-text-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {hayCanal ? (
            <>
              Ya hay un canal encendido. Las conversaciones entran aquí solas en cuanto alguien
              escriba. Lo anterior a la conexión no se puede recuperar: Meta no lo entrega.
            </>
          ) : puedeConectar ? (
            <>
              Kavea reúne WhatsApp, Instagram y Messenger en esta bandeja. Todavía no hay ningún
              canal conectado, así que aquí no puede entrar nada.
            </>
          ) : (
            <>
              Todavía no hay ningún canal conectado, así que aquí no puede entrar nada. Conectar
              canales es cosa del propietario del espacio: pídeselo y esta pantalla se llenará
              sola.
            </>
          )}
        </p>
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        <Paso hecho={hayCanal} texto="Conectar tus canales" />
        <Paso hecho={false} texto="Invitar a tu equipo" />
      </ol>

      {puedeConectar ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {hayCanal ? (
            <Link href="/ajustes/equipo" className="boton">Invitar a mi equipo</Link>
          ) : (
            <Link href="/ajustes/canales" className="boton">Conectar mis canales</Link>
          )}
          <Link
            href={hayCanal ? '/ajustes/canales' : '/ajustes/equipo'}
            className="boton"
            style={{ background: 'transparent', color: 'var(--k-text)' }}
          >
            {hayCanal ? 'Ver mis canales' : 'Invitar a mi equipo'}
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function Paso({ hecho, texto }: { hecho: boolean; texto: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
      <span
        aria-hidden="true"
        style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center', fontSize: 12,
          border: hecho ? 'none' : '1px solid var(--k-border)',
          background: hecho ? 'var(--k-resuelta-fg)' : 'transparent',
          color: hecho ? '#fff' : 'var(--k-text-2)',
        }}
      >
        {hecho ? '✓' : ''}
      </span>
      <span style={{ color: hecho ? 'var(--k-text-2)' : 'var(--k-text)' }}>
        {texto}
      </span>
      {hecho ? <span className="label" style={{ fontSize: 11 }}>hecho</span> : null}
    </li>
  )
}
