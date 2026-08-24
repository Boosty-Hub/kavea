import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { usuarioActual } from '@/lib/organizacion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { COOKIE_NONCE, uriDeRetorno, verificarEstado } from '@/lib/meta-oauth'

export const dynamic = 'force-dynamic'

const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

/**
 * El retorno del diálogo de Meta. Vive en `conectar.kavea.ai` y solo ahí.
 *
 * Strict Mode está en Yes, así que Meta acepta UNA URI literal para toda la
 * plataforma. De ahí que esta ruta no sepa de qué inquilino viene por el Host
 * —siempre es el mismo— y tenga que sacarlo del `state` firmado.
 *
 * QUE ESTE HOST VEA LA SESIÓN NO ES CASUALIDAD: la cookie de Supabase se fija en
 * `.kavea.ai` (`lib/supabase/navegador.ts`), así que aquí hay usuario. Eso
 * permite la comprobación que de verdad cierra el agujero: no basta con que el
 * `state` sea válido, tiene que seguir siendo válido PARA QUIEN ESTÁ SENTADO
 * DELANTE. Entre el clic y el retorno pueden pasar minutos, y en ese hueco cabe
 * que a alguien le hayan quitado el rol.
 *
 * EL APP SECRET NO ESTÁ AQUÍ. El canje del código lo hace la función de borde
 * `meta-canje`; esta ruta autoriza y encamina. Es la misma frontera que ya usa
 * `/api/subdominio` con el token de Netlify: la aplicación pide, el borde decide.
 */

/** Vuelta al panel del cliente con un motivo legible en la URL. */
function aCanales(slug: string, params: Record<string, string>) {
  const destino = new URL(`https://${slug}.${RAIZ}/ajustes/canales`)
  for (const [k, v] of Object.entries(params)) destino.searchParams.set(k, v)
  return NextResponse.redirect(destino.toString(), 302)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')

  // 1. El `state` primero, siempre. Todo lo demás de esta petición lo escribió
  //    un tercero, incluido el mensaje de error: hasta que la firma no cuadre no
  //    se sabe ni a qué subdominio devolver a nadie.
  const v = verificarEstado(state)
  if (!v.ok) {
    // Sin `state` válido no hay a dónde redirigir: se responde aquí mismo.
    const texto = {
      formato: 'La respuesta de Meta no trae un identificador de sesión válido.',
      firma: 'La respuesta de Meta no trae un identificador de sesión válido.',
      caducado: 'El enlace de conexión caducó. Vuelve a empezar desde Ajustes → Canales.',
    }[v.motivo]
    return NextResponse.json({ error: texto }, { status: 400 })
  }
  const { org, slug, canal, cfg, nonce } = v.estado

  // 2. La cookie. La firma prueba que el `state` lo emitió Kavea; la cookie
  //    prueba que se lo emitió a ESTE navegador. Y como se borra al usarla, un
  //    `state` reenviado por segunda vez ya no encuentra con qué compararse.
  const tarro = await cookies()
  const guardado = tarro.get(COOKIE_NONCE)?.value
  if (!guardado || guardado !== nonce) {
    return aCanales(slug, {
      conexion: 'error',
      motivo: 'La conexión se abrió en otro navegador o la ventana caducó. Inténtalo otra vez.',
    })
  }

  // 3. El cliente pulsó «Cancelar», o Meta se negó. Es un camino normal, no un
  //    fallo: se limpia y se le devuelve sin dramatismo.
  const errMeta = url.searchParams.get('error')
  if (errMeta || !code) {
    // NO SE REPITE EL TEXTO DE META. Al pulsar «Cancelar», Meta devuelve
    // `error_description=Permissions error`, que en pantalla es peor que no
    // decir nada: está en inglés, suena a avería y describe un permiso que
    // nadie denegó. Lo que pasó es que la persona cambió de opinión, y eso se
    // dice en una frase.
    const r = aCanales(slug, {
      conexion: 'cancelada',
      motivo: 'No se completó la autorización en Meta. No se conectó nada.',
    })
    r.cookies.delete({ name: COOKIE_NONCE, domain: `.${RAIZ}`, path: '/' })
    return r
  }

  // 4. ¿Sigue pudiendo? Sesión y rol se vuelven a mirar AHORA, no cuando se
  //    firmó el `state`.
  const usuario = await usuarioActual()
  if (!usuario) {
    return aCanales(slug, {
      conexion: 'error',
      motivo: 'Se cerró la sesión durante la conexión. Entra otra vez y repite.',
    })
  }
  const supabase = await crearClienteServidor()
  const { data: puede } = await supabase.rpc('puede', { org, accion: 'conectar' })
  if (puede !== true) {
    return aCanales(slug, {
      conexion: 'error',
      motivo: 'Solo el propietario del espacio puede conectar canales.',
    })
  }

  // 5. El canje, en el borde. `redirect_uri` viaja porque Meta la exige idéntica
  //    en el POST de canje que en el diálogo; si difiere en un carácter, falla.
  const base = process.env.KAVEA_FUNCTIONS_URL
  const secreto = process.env.SUPABASE_SECRET_KEY
  if (!base || !secreto) {
    return aCanales(slug, { conexion: 'error', motivo: 'Kavea no está configurada para conectar canales.' })
  }

  let resultado: { ok?: boolean; error?: string; paso?: string; detalle?: string }
  try {
    const r = await fetch(`${base}/meta-canje`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code, organizacion: org, canal, config_id: cfg,
        redirect_uri: uriDeRetorno(), usuario: usuario.id,
      }),
      // El canje son cinco llamadas a Graph encadenadas. Se le da aire, pero no
      // infinito: si Meta se atasca, el cliente merece una pantalla antes de que
      // el proxy corte por su cuenta con un 502 sin explicación.
      signal: AbortSignal.timeout(55_000),
    })
    resultado = await r.json().catch(() => ({ error: 'respuesta ilegible del borde' }))
  } catch {
    resultado = { error: 'Meta tardó demasiado en responder. Vuelve a intentarlo.' }
  }

  // AUTORIZAR NO ES CONECTAR. El diálogo concede acceso al portafolio entero;
  // qué se activa lo elige el cliente en Kavea, con la lista delante. Por eso
  // el retorno correcto lleva a la pantalla de elegir y no a la de canales.
  const r = resultado?.ok === true
    ? NextResponse.redirect(`https://${slug}.${RAIZ}/ajustes/canales/elegir`, 302)
    : aCanales(slug, {
        conexion: 'error',
        // El paso concreto viaja a la interfaz: la fase 5 §T6 lo pide
        // explícitamente, porque «no se pudo conectar» no le sirve a nadie para
        // saber si el problema es el permiso, la Página o los webhooks.
        motivo: [resultado?.paso && `Falló en: ${resultado.paso}.`, resultado?.error]
          .filter(Boolean)
          .join(' ') || 'No se pudo completar la conexión.',
      })

  r.cookies.delete({ name: COOKIE_NONCE, domain: `.${RAIZ}`, path: '/' })
  return r
}
