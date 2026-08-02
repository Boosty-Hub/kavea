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

import { etiquetaCanal } from './ventana'

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

export function describirActividad(x: EntradaActividad): string {
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
    case 'tarjeta.estado': return `cambió el estado de ${d.de} a ${d.a}`
    case 'conversacion.cerrada':
    case 'tarjeta.cerrada': return 'cerró la conversación'
    case 'tarjeta.titulo': return `cambió el título a "${d.a ?? ''}"`
    case 'nota.añadida': return `añadió una nota: ${d.texto ?? ''}`
    case 'breakglass.abierto': return 'abrió un acceso temporal al contenido'

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
        d.vence_en ? ` para el ${new Date(String(d.vence_en)).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''
      }`
    case 'tarea.completada': return `completó la tarea "${d.titulo}"`
    case 'tarea.reabierta': return `reabrió la tarea "${d.titulo}"`
    case 'tarea.borrada': return `borró la tarea "${d.titulo}"`

    // --- Envío ---
    // No hay `mensaje.fallido`: un envío que falla ya lo dice su propia burbuja
    // con `envio_estado`. Una línea de actividad sería decirlo dos veces.
    case 'mensaje.encolado':
      return d.fuera_de_ventana
        ? 'respondió fuera de la ventana de 24 horas, como intervención humana'
        : 'respondió'

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

    // --- Configuración de la organización ---
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
