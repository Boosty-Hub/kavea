import { NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { organizacionActual, usuarioActual } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

/**
 * Invitar a alguien al equipo.
 *
 * POR QUÉ PASA POR EL SERVIDOR Y NO LLAMA AL RPC DESDE EL NAVEGADOR
 *
 * `invitar_miembro` devuelve el token EN CLARO, una sola vez, para poder
 * ponerlo en el correo. Si lo llamara el navegador, ese token quedaría en la
 * pestaña de red del inspector, en cualquier extensión instalada y en el
 * historial de la consola. Aquí nace, se manda por correo y muere; el navegador
 * solo recibe «hecho».
 *
 * La comprobación de permisos NO se hace aquí: la hace el RPC, con la sesión de
 * quien llama. Comprobarla también en esta ruta sería tener la regla en dos
 * sitios y solo acordarse de actualizar uno.
 */
export async function POST(req: Request) {
  const usuario = await usuarioActual()
  if (!usuario) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const org = await organizacionActual()
  if (!org) return NextResponse.json({ error: 'sin organización' }, { status: 404 })

  const { correo, rol } = (await req.json()) as { correo?: string; rol?: string }
  if (!correo || !rol) {
    return NextResponse.json({ error: 'Faltan el correo o el rol.' }, { status: 400 })
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('invitar_miembro', {
    p_org: org.id, p_correo: correo, p_rol: rol,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const fila = (data as Array<{ invitacion_id: string; token: string }>)?.[0]
  if (!fila) return NextResponse.json({ error: 'No se pudo crear la invitación.' }, { status: 500 })

  const enlace = `https://${org.slug}.${process.env.NEXT_PUBLIC_DOMINIO_RAIZ}/invitacion/${fila.token}`
  const envio = await mandarCorreo(correo, org.nombre, enlace, usuario.email ?? '')

  // La invitación EXISTE aunque el correo falle. Se dice, y se devuelve el
  // enlace para que quien invita lo pueda pasar por otro medio: dejar la
  // invitación creada y en silencio sería lo peor de los dos mundos.
  return NextResponse.json({
    ok: true,
    correoEnviado: envio.ok,
    motivo: envio.motivo,
    enlace: envio.ok ? undefined : enlace,
  })
}

async function mandarCorreo(
  destino: string, organizacion: string, enlace: string, quien: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const clave = process.env.RESEND_API_KEY
  if (!clave) return { ok: false, motivo: 'No hay clave de Resend configurada.' }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Kavea <support@kavea.ai>',
        to: [destino],
        subject: `Te han invitado a ${organizacion} en Kavea`,
        text:
          `${quien} te ha invitado a ${organizacion} en Kavea.\n\n` +
          `Entra aquí para crear tu acceso:\n${enlace}\n\n` +
          `El enlace vale durante siete días y solo se puede usar una vez.\n` +
          `Si no esperabas esto, ignóralo: sin abrirlo no ocurre nada.\n`,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return { ok: false, motivo: `Resend respondió ${r.status}.` }
    return { ok: true }
  } catch {
    return { ok: false, motivo: 'No se pudo contactar con Resend.' }
  }
}
