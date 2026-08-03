/**
 * El formulario de /demo.
 *
 * VIVE EN `public/` Y NO DENTRO DEL .astro, y no es una preferencia de estilo.
 *
 * La CSP del sitio es `script-src 'self'`, sin `unsafe-inline`. Un `<script>`
 * dentro del componente lo inlina Astro cuando es pequeño, el navegador lo
 * bloquea, y el formulario no hace absolutamente nada: sin error visible, sin
 * aviso, sin nada. Un fichero de `public/` se sirve tal cual desde el propio
 * dominio y no hay forma de que acabe inline.
 *
 * La alternativa era abrir la CSP a 'unsafe-inline'. Aflojar una defensa real de
 * una página pública para ahorrarse un fichero es un mal cambio.
 *
 * La configuración llega en atributos `data-` del formulario. La clave es
 * publicable a propósito: sin sesión no abre nada más que este procedimiento.
 */
const form = document.getElementById('demo')
if (form) {
  const aviso = document.getElementById('aviso')
  const boton = form.querySelector('button[type=submit]')
  const url = form.dataset.url
  const clave = form.dataset.clave

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const d = new FormData(form)

    // Validación mínima aquí; la de verdad está en la base. Esto solo evita
    // hacer viajar un formulario que ya sabemos incompleto.
    if (!String(d.get('nombre') ?? '').trim() || !String(d.get('correo') ?? '').includes('@')) {
      aviso.textContent = 'Hacen falta al menos tu nombre y un correo.'
      aviso.dataset.mal = ''
      return
    }

    if (!url || !clave) {
      aviso.dataset.mal = ''
      aviso.textContent = 'El formulario no está configurado. Escríbenos a hola@kavea.ai.'
      return
    }

    boton.disabled = true
    aviso.removeAttribute('data-mal')
    aviso.textContent = 'Enviando…'

    try {
      const r = await fetch(`${url}/rest/v1/rpc/pedir_demo`, {
        method: 'POST',
        headers: {
          apikey: clave,
          Authorization: `Bearer ${clave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_nombre: d.get('nombre'),
          p_correo: d.get('correo'),
          p_negocio: d.get('negocio') || null,
          p_telefono: d.get('telefono') || null,
          p_canales: d.getAll('canales'),
          p_mensaje: d.get('mensaje') || null,
          p_origen: document.referrer ? new URL(document.referrer).hostname : 'directo',
          p_trampa: d.get('empresa_web') || null,
        }),
      })

      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.message ?? `error ${r.status}`)
      }

      // Se sustituye el formulario entero. Dejarlo en pantalla con un «gracias»
      // encima invita a pulsar otra vez, y la segunda pulsación no hace nada
      // —hay tope por correo— con lo que parecería que la primera falló.
      form.innerHTML =
        '<p class="lead" style="margin:0">Recibido. Te escribimos hoy o mañana temprano,'
        + ' desde una dirección de kavea.ai.</p>'
    } catch (err) {
      aviso.dataset.mal = ''
      aviso.textContent =
        `No se pudo enviar (${String(err.message).slice(0, 120)}). `
        + 'Escríbenos directamente y lo resolvemos.'
      boton.disabled = false
    }
  })
}
