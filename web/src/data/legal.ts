/**
 * Datos legales y de contacto de Kavea.
 *
 * Fuente única de verdad: las páginas legales leen de aquí, así que corregir
 * un dato es corregir un archivo y no cuatro documentos.
 *
 * `jurisdiccion` y `domicilio` CONFIRMADOS POR GABRIEL el 3 de agosto de 2026.
 * Antes eran una estimación —Orlando, Capri Place— que nunca fue real. No se
 * vuelven a tocar sin una fuente societaria delante.
 *
 * Por qué importa tanto y antes de lo que parecía: la Access Verification, que
 * va antes del App Review, pregunta por la web de la empresa y dice literal que
 * debe mostrar «details of the business providing the service». Meta entra y
 * compara lo que ve con el portafolio verificado. Un domicilio inventado se le
 * está entregando para que lo contraste.
 *
 * ⚠ DISCREPANCIA DETECTADA EL 3 DE AGOSTO DE 2026: el pie de boosty.digital
 * decía «© 2026 Boosty International LLC», con *International* y no *Digital*.
 * El portafolio verificado es Boosty Digital LLC, ID 2167414613399354. Las dos
 * webs y el portafolio tienen que decir lo mismo: una razón social que no
 * coincide es motivo de rechazo en una verificación cuyo objeto es justamente
 * confirmar la identidad de la empresa.
 */

export const legal = {
  producto: 'Kavea',
  dominio: 'kavea.ai',
  sitio: 'https://kavea.ai',

  /** Razón social titular del servicio. */
  razonSocial: 'Boosty Digital LLC',

  /** Jurisdicción de constitución de la LLC. */
  jurisdiccion: 'Estado de Florida, Estados Unidos de América',

  /** Domicilio que se publica en las páginas legales. */
  domicilio: '4937 SW 135th Ave, Miramar, Florida 33027, Estados Unidos de América',

  /**
   * Dirección única de contacto para todo: soporte, privacidad, asuntos legales
   * y reporte de vulnerabilidades. Una sola dirección publicada es una sola
   * bandeja que vigilar, y ninguna que se quede sin leer.
   *
   * ⚠ Tiene que RECIBIR correo antes del App Review. Una dirección publicada en
   * una política de privacidad que rebota es motivo de rechazo.
   */
  contacto: 'support@kavea.ai',

  /** Fecha de la última revisión de los documentos legales. */
  vigenciaDesde: '2 de agosto de 2026',

  /** Mercados donde opera el servicio. Condiciona avisos legales por país. */
  mercados: ['Venezuela', 'República Dominicana', 'México', 'Estados Unidos'],

  /** Plazo comprometido para atender solicitudes de datos personales. */
  plazoRespuestaDatos: '30 días naturales',

  /**
   * Encargados y subencargados del tratamiento. Se publican por transparencia
   * y porque el App Review de Meta pregunta explícitamente con quién se comparte
   * la información. Mantener esta lista sincronizada con la infraestructura real.
   */
  subencargados: [
    {
      nombre: 'Meta Platforms, Inc.',
      proposito: 'Origen de los mensajes. WhatsApp Business Platform, Instagram Messaging API y Messenger Platform.',
      region: 'Estados Unidos e infraestructura global',
    },
    {
      nombre: 'Anthropic, PBC',
      proposito: 'Modelos de lenguaje que clasifican, redactan borradores de respuesta y deciden escalamiento.',
      region: 'Estados Unidos',
    },
    {
      nombre: 'Supabase, Inc.',
      proposito: 'Base de datos, autenticación y sincronización en tiempo real.',
      region: 'Según la región contratada por Kavea',
    },
    {
      nombre: 'Cloudflare, Inc.',
      proposito: 'Almacenamiento de archivos que Kavea genera o envía, y capa de red.',
      region: 'Infraestructura global',
    },
    {
      nombre: 'Netlify, Inc.',
      proposito: 'Alojamiento de este sitio público. No procesa datos de conversaciones.',
      region: 'Infraestructura global',
    },
  ],
} as const

export type Legal = typeof legal
