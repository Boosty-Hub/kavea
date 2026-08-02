import { NextResponse } from 'next/server'
import { usuarioActual } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

/**
 * Empujón al despachador.
 *
 * El cron lo despierta cada minuto, pero un operador que acaba de pulsar
 * «Enviar» no debería esperar hasta 60 segundos a que su mensaje salga. Esta
 * ruta le da un toque en cuanto se encola.
 *
 * NO recibe ningún parámetro y no decide QUÉ se envía: el despachador lee su
 * propia cola, que ya pasó por `encolar_envio` con la ventana comprobada. Lo
 * peor que puede hacer alguien llamando esto en bucle es despertar una función
 * que encuentra la cola vacía; aun así se exige sesión, porque una ruta abierta
 * es una forma gratuita de hacernos gastar invocaciones.
 *
 * La clave de servicio vive solo aquí, en el servidor. El navegador nunca la ve.
 */
export async function POST() {
  if (!(await usuarioActual())) {
    return NextResponse.json({ error: 'sin sesión' }, { status: 401 })
  }

  // Los nombres son los que ya usa el proyecto: `SUPABASE_SECRET_KEY` es el que
  // lee `crearClienteServicio`. Inventar aquí un nombre nuevo habría dejado dos
  // variables con la misma clave dentro y una de ellas sin rotar el día que
  // toque.
  const url = process.env.KAVEA_FUNCTIONS_URL
  const clave = process.env.SUPABASE_SECRET_KEY
  if (!url || !clave) {
    // Sin configuración no se rompe nada: el cron recoge la cola igual. Se
    // responde 202 porque el mensaje SÍ está encolado, que es lo que le importa
    // a quien llamó.
    return NextResponse.json({ empujado: false, motivo: 'sin configurar' }, { status: 202 })
  }

  try {
    const r = await fetch(`${url}/despachar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'compositor' }),
      signal: AbortSignal.timeout(20_000),
    })
    return NextResponse.json({ empujado: r.ok }, { status: 202 })
  } catch {
    // El cron lo recogerá. Un fallo aquí no puede parecer un fallo de envío.
    return NextResponse.json({ empujado: false }, { status: 202 })
  }
}
