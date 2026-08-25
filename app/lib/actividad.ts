/**
 * Cómo se lee cada actividad, en un solo sitio.
 *
 * Lo usan el hilo de la conversación y el módulo de actividad de la
 * organización. Vivía dentro de `app/bandeja/[id]/page.tsx`, y en cuanto una
 * segunda pantalla lo necesitó había que copiarlo o moverlo: copiarlo garantiza
 * que uno de los dos se quede atrás.
 *
 * Módulo sin dependencias de servidor: lo importan componentes de los dos lados.
 *
 * `scripts/comprobar-actividades.mjs` comprueba en CI que todo tipo que las
 * migraciones escriben tenga aquí su `case`. Van cuatro veces que una actividad
 * nueva llegó a producción mostrando su identificador técnico.
 */

import { ESTADOS, etiquetaCanal } from './ventana'
import { fechaHora } from './fechas'

/**
 * Los estados se guardan como `en_curso` y se leen como «En curso».
 *
 * La actividad decía «cambió el estado de en_curso a esperando»: el
 * identificador de la base saliendo tal cual a una pantalla. Es el mismo fallo
 * que persigue `comprobar-actividades.mjs`, una capa más adentro.
 */
function nombreEstado(v: unknown): string {
  const k = String(v ?? '')
  return (ESTADOS as Record<string, { etiqueta: string }>)[k]?.etiqueta.toLowerCase() ?? k
}

/**
 * El detalle es `jsonb`: puede traer cualquier cosa.
 *
 * Se tipa como `unknown` y no como una unión de primitivos porque eso es la
 * verdad, y porque `EntradaHilo.detalle` ya es `Record<string, unknown>`:
 * declararlo más estrecho aquí obligaba a un cast en cada llamada, que es la
 * forma elegante de mentirse.
 */
export type EntradaActividad = {
  tipo: string
  detalle: Record<string, unknown>
}

export function textoValor(v: unknown): string {
  if (v === null || v === undefined) return 'vacío'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

function nombreRol(rol: string): string {
  return rol === 'owner' ? 'propietario'
    : rol === 'admin' ? 'administrador'
    : rol === 'agente' ? 'agente' : rol
}

/**
 * El `huso` es obligatorio porque hay fechas dentro de algunos detalles, y una
 * fecha formateada con el huso del entorno sale distinta en el servidor y en el
 * navegador. Ver `lib/fechas.ts`.
 */
export function describirActividad(x: EntradaActividad, huso: string): string {
  const d = x.detalle
  switch (x.tipo) {
    // --- Lo que hace el contacto o Meta ---
    case 'evento.read': return 'leyó la conversación'
    case 'evento.reaction': return `reaccionó ${d.emoji ?? ''}`.trim()
    case 'evento.delivery': return 'recibió el mensaje'
    case 'evento.postback': return 'pulsó un botón'

    // --- La tarjeta ---
    case 'conversacion.asignada':
    case 'tarjeta.asignada': return `asignó la conversación a ${d.a_nombre ?? 'alguien'}`
    case 'conversacion.desasignada':
    case 'tarjeta.desasignada': return 'quitó la asignación'
    case 'conversacion.estado':
    case 'tarjeta.estado': return `cambió el estado de ${nombreEstado(d.de)} a ${nombreEstado(d.a)}`
    case 'conversacion.cerrada':
    case 'tarjeta.cerrada': return 'cerró la conversación'
    case 'tarjeta.titulo': return `cambió el título a "${d.a ?? ''}"`
    case 'nota.añadida': return `añadió una nota: ${d.texto ?? ''}`
    case 'breakglass.abierto': return 'abrió un acceso temporal al contenido'
    // Se registra en el hilo DEL CLIENTE, no solo en el nuestro: la
    // transparencia del break-glass es hacia quien tiene los datos.
    case 'breakglass.revocado':
      return `cortó un acceso temporal antes de que caducara${d.motivo ? ` · ${d.motivo}` : ''}`
    case 'espacio.creado': return `creó este espacio (${d.slug})`
    case 'canal.conectado':
      return `conectó la Página ${d.pagina}${d.instagram ? ` y @${d.instagram}` : ''}`
    case 'canal.pausado':
      return `pausó ${etiquetaCanal(String(d.canal ?? ''))}${d.motivo ? ` · ${d.motivo}` : ''}`
    case 'canal.reanudado': return `reanudó ${etiquetaCanal(String(d.canal ?? ''))}`
    // Sin embudo = volvió al predeterminado, y se dice así en vez de «a null».
    case 'canal.embudo':
      return d.embudo
        ? `mandó ${etiquetaCanal(String(d.canal ?? ''))}${d.nombre ? ` (${d.nombre})` : ''} al embudo ${d.embudo}`
        : `devolvió ${etiquetaCanal(String(d.canal ?? ''))}${d.nombre ? ` (${d.nombre})` : ''} al embudo predeterminado`
    case 'conexion.desconectada':
      return `desconectó ${d.nombre ?? 'un canal'}${d.motivo ? ` · ${d.motivo}` : ''}`

    // --- La persona y sus canales ---
    case 'identidad.vinculada':
      return `vinculó ${etiquetaCanal(String(d.canal ?? ''))} (${d.etiqueta ?? ''}) a esta persona`
    case 'identidad.desvinculada':
      return `quitó ${etiquetaCanal(String(d.canal ?? ''))} (${d.etiqueta ?? ''}) de esta persona`
    case 'tarjetas.unidas':
      return `unió otra tarjeta con esta · ${d.motivo ?? ''}`
    case 'tarjetas.separadas': return 'deshizo la unión de tarjetas'
    case 'contacto.fusionado':
      return `unió a ${d.absorbido ?? 'otro contacto'} con esta persona · ${d.motivo ?? ''}`
    case 'contacto.separado': return 'deshizo la unión de contactos'
    // El detalle trae [antes, después] por cada campo tocado. Se dice de qué a
    // qué: «cambió algo» no sirve para auditar nada.
    case 'contacto.editado': {
      const partes = Object.entries(d)
        .filter(([, v]) => Array.isArray(v))
        .map(([campo, v]) => {
          const [antes, ahora] = v as [unknown, unknown]
          return antes
            ? `${campo} de "${textoValor(antes)}" a "${textoValor(ahora)}"`
            : `${campo} a "${textoValor(ahora)}"`
        })
      return partes.length ? `cambió el ${partes.join(' y el ')} del contacto` : 'editó el contacto'
    }

    // --- El embudo ---
    case 'tarjeta.etapa': {
      const parado = d.dias_en_etapa_anterior != null && Number(d.dias_en_etapa_anterior) >= 1
        ? ` · ${d.dias_en_etapa_anterior} días en la anterior` : ''
      return d.de
        ? `movió la tarjeta de ${d.de} a ${d.a}${parado}`
        : `puso la tarjeta en ${d.a}`
    }
    case 'tarjeta.embudo': return `cambió el embudo de ${d.de ?? 'ninguno'} a ${d.a}`
    case 'tarjeta.valor': {
      const a = d.a != null ? `${d.a} ${d.moneda ?? ''}`.trim() : 'sin valor'
      return d.de != null ? `cambió el valor de ${d.de} a ${a}` : `puso el valor en ${a}`
    }
    case 'campo.valor':
      return `cambió ${d.etiqueta ?? 'un campo'}${d.de != null ? ` de "${textoValor(d.de)}"` : ''} a "${textoValor(d.a)}"`

    // --- Archivos y documentos ---
    case 'archivo.subido':
      return `subió ${d.nombre ?? 'un archivo'}${d.enviable === false ? ', que no se podrá enviar por Meta' : ''}`
    case 'archivo.borrado': return `borró el archivo ${d.nombre ?? ''}`.trim()
    case 'documento.registrado':
      return `registró un ${d.tipo ?? 'documento'}: ${d.concepto ?? ''} por ${d.total ?? ''} ${d.moneda ?? ''}`.trim()
    case 'documento.estado':
      return `pasó ${d.concepto ?? 'el documento'} de ${d.de} a ${d.a}`
    case 'documento.borrado': return `borró el documento ${d.concepto ?? ''}`.trim()

    // --- Tareas ---
    case 'tarea.creada':
      return `creó la tarea "${d.titulo}"${
        d.vence_en ? ` para el ${fechaHora(String(d.vence_en), huso)}` : ''
      }`
    case 'tarea.completada': return `completó la tarea "${d.titulo}"`
    case 'tarea.reabierta': return `reabrió la tarea "${d.titulo}"`
    case 'tarea.borrada': return `borró la tarea "${d.titulo}"`

    // --- Comentarios ---
    // Se dice «en público» siempre. En el registro, igual que en la pantalla,
    // la diferencia entre responder un mensaje y responder un comentario no es
    // de canal: es de quién lo lee.
    case 'comentario.respondido':
      return `respondió en público a un comentario de ${d.canal === 'messenger' ? 'Facebook' : 'Instagram'}`
    // El ciclo de moderación de la 0097. Se dice qué comentario, no su id:
    // el identificador de Meta no le dice nada a quien lee la actividad.
    // Soltar la cuenta entera (0101). Se dice cuántos canales cayó por delante,
    // porque es la diferencia entre esto y desconectar uno.
    case 'meta.desautorizada':
      return typeof d.conexiones === 'number' && d.conexiones > 0
        ? `desconectó la cuenta de Facebook y con ella ${d.conexiones} ${d.conexiones === 1 ? 'conexión' : 'conexiones'}`
        : 'desconectó la cuenta de Facebook'
    case 'comentario.oculto':
      return 'ocultó un comentario'
    case 'comentario.mostrado':
      return 'volvió a mostrar un comentario'
    case 'comentario.editado':
      return 'cambió el texto de un comentario publicado desde Kavea'
    case 'comentario.borrado':
      return 'borró un comentario publicado desde Kavea'
    case 'comentario.marcado':
      return d.estado === 'ignorado' ? 'ignoró un comentario' : 'reabrió un comentario'

    // --- Envío ---
    // No hay `mensaje.fallido`: un envío que falla ya lo dice su propia burbuja
    // con `envio_estado`. Una línea de actividad sería decirlo dos veces.
    case 'mensaje.encolado': {
      const fuera = d.fuera_de_ventana
        ? ' fuera de la ventana de 24 horas, como intervención humana' : ''
      if (d.corazon) return `mandó un corazón${fuera}`
      return d.archivo ? `envió el archivo ${d.archivo}${fuera}` : `respondió${fuera}`
    }

    // --- El equipo. No cuelgan de ninguna conversación: salen en el registro
    //     de la organización, no en un hilo. ---
    case 'equipo.invitado':
      return `invitó a ${d.correo} como ${nombreRol(String(d.rol ?? ''))}`
    case 'equipo.invitacion_revocada':
      return `revocó la invitación de ${d.correo}`
    case 'equipo.entro':
      return `entró en el equipo como ${nombreRol(String(d.rol ?? ''))}`
    case 'equipo.rol':
      return `cambió a ${d.persona} de ${nombreRol(String(d.de ?? ''))} a ${nombreRol(String(d.a ?? ''))}`
    case 'equipo.quitado':
      return `quitó a ${d.persona} del equipo`
    case 'reparto.encendido': return 'encendió el reparto por turnos'
    case 'reparto.apagado': return 'apagó el reparto por turnos'
    case 'reparto.dentro': return `metió a ${d.persona} en el turno`
    case 'reparto.fuera': return `sacó a ${d.persona} del turno`

    // --- Los canales ---
    // Solo se escribe cuando el resultado CAMBIA: una pasada del cron que
    // confirma lo de siempre no es un acontecimiento, y siete filas diarias por
    // conexión enterrarían el único evento que alguien quiere ver.
    case 'conexion.verificacion': {
      const nombre = { ok: 'funciona', fallo: 'no funciona', no_verificable: 'no se pudo comprobar', sin_probar: 'sin probar' }
      const a = nombre[String(d.a) as keyof typeof nombre] ?? String(d.a)
      return d.de
        ? `${d.titulo}: pasó de ${nombre[String(d.de) as keyof typeof nombre] ?? d.de} a ${a}`
        : `${d.titulo}: ${a}`
    }

    // --- Configuración de la organización ---
    // El huso se dice con el antes y el después SIEMPRE: cambiarlo reinterpreta
    // toda la historia —los mensajes de ayer pasan a leerse a otra hora— y sin
    // esta línea, quien lo note después no tiene forma de saber qué pasó.
    case 'organizacion.editada': {
      const partes: string[] = []
      const n = d.nombre as [string, string] | undefined
      const h = d.huso as [string, string] | undefined
      if (n) partes.push(`el nombre de "${n[0]}" a "${n[1]}"`)
      if (h) partes.push(`la zona horaria de ${h[0] ?? 'ninguna'} a ${h[1]}`)
      return partes.length ? `cambió ${partes.join(' y ')}` : 'editó la organización'
    }
    case 'campo.definido':
      return `creó el campo ${d.etiqueta} (${d.tipo}) en ${d.ambito === 'contacto' ? 'la persona' : 'el asunto'}`
    case 'campo.archivado': return `archivó el campo ${d.clave}`
    case 'embudo.definido': return `creó el embudo ${d.nombre}`
    case 'etapa.definida': return `creó la etapa ${d.nombre}`
    case 'etapa.archivada': return `archivó la etapa ${d.nombre}`
    case 'plantilla.creada':
      return `creó la plantilla ${d.nombre}${d.tipo === 'whatsapp' ? ' de WhatsApp' : ''}`
    case 'plantilla.editada': return `editó la plantilla ${d.nombre}`
    case 'plantilla.archivada': return `archivó la plantilla ${d.nombre}`
    case 'plantilla.estado':
      return `marcó la plantilla ${d.nombre} como ${d.a} en Meta`
    // Cambiar el texto de una plantilla aprobada la invalida allí, y eso hay
    // que poder rastrearlo: Meta revisó un texto y el que se enviaría es otro.
    case 'plantilla.invalidada':
      return `cambió el texto de ${d.nombre}, que estaba aprobada: vuelve a borrador`

    default: return x.tipo.replace(/[._]/g, ' ')
  }
}
