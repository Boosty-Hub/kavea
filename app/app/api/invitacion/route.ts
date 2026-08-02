import { NextResponse } from 'next/server'
import { crearClienteServicio } from '@/lib/supabase/servicio'

export const dynamic = 'force-dynamic'

/**
 * Aceptar una invitación: crea la cuenta y la mete en el equipo.
 *
 * Corre con la clave de servicio porque tiene que crear un usuario en Supabase
 * Auth, y eso solo lo puede hacer la API de administración. Es una de las tres
 * rutas del sistema que la usan, y por eso lleva estas guardas:
 *
 *   · El token es la ÚNICA autorización. No hay sesión: quien acepta todavía no
 *     tiene cuenta.
 *   · El token se valida contra el hash en la base, con caducidad y un solo uso.
 *   · El correo NO lo elige quien acepta: sale de la invitación. Si viniera del
 *     formulario, cualquiera con un enlace válido se daría de alta con el correo
 *     que quisiera y suplantaría a un compañero.
 *   · Nunca se dice si un correo ya existe. Sería un oráculo de enumeración.
 */
export async function POST(req: Request) {
  const { token, clave, nombre } = (await req.json()) as {
    token?: string; clave?: string; nombre?: string
  }

  if (!token || !clave) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })
  }
  if (clave.length < 10) {
    return NextResponse.json(
      { error: 'La contraseña necesita al menos 10 caracteres.' }, { status: 400 },
    )
  }

  const admin = crearClienteServicio()

  const { data: filas, error: errInv } = await admin
    .schema('private')
    .rpc('invitacion_por_token', { p_token: token })

  if (errInv) return NextResponse.json({ error: errInv.message }, { status: 500 })

  const inv = (filas as Array<{ id: string; correo: string; slug: string }> | null)?.[0]
  if (!inv) {
    return NextResponse.json(
      { error: 'Esa invitación no vale: puede haber caducado, haberse usado o haberse revocado.' },
      { status: 400 },
    )
  }

  // Puede que ya tenga cuenta —invitado a una segunda organización— así que
  // primero se intenta crear y, si el correo ya existe, se busca.
  let usuarioId: string | null = null

  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email: inv.correo,
    password: clave,
    email_confirm: true,
    user_metadata: nombre ? { nombre: nombre.trim().slice(0, 80) } : undefined,
  })

  if (creado?.user) {
    usuarioId = creado.user.id
  } else {
    // Ya existía. NO se le cambia la contraseña: quien tiene el enlace no es
    // necesariamente el dueño de esa cuenta, y dejarle reescribir la clave
    // convertiría una invitación en un secuestro de cuenta.
    const { data: lista } = await admin.auth.admin.listUsers()
    const existente = lista?.users?.find(
      (u) => u.email?.toLowerCase() === inv.correo.toLowerCase(),
    )
    if (!existente) {
      return NextResponse.json(
        { error: errCrear?.message ?? 'No se pudo crear el acceso.' }, { status: 400 },
      )
    }
    usuarioId = existente.id
    return NextResponse.json({
      ok: true,
      yaTenia: true,
      slug: inv.slug,
      aviso: 'Ya tenías cuenta en Kavea. Entra con tu contraseña de siempre.',
      ...(await unir(admin, token, usuarioId)),
    })
  }

  return NextResponse.json({ ok: true, slug: inv.slug, ...(await unir(admin, token, usuarioId)) })
}

async function unir(
  admin: ReturnType<typeof crearClienteServicio>, token: string, usuario: string,
) {
  const { error } = await admin.schema('private').rpc('aceptar_invitacion', {
    p_token: token, p_usuario: usuario,
  })
  return error ? { error: error.message } : {}
}
