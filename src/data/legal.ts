/**
 * Datos legales y de contacto de Kavea.
 *
 * Fuente única de verdad: las páginas legales leen de aquí, así que corregir
 * un dato es corregir un archivo y no cuatro documentos.
 *
 * ⚠ CAMPOS MARCADOS CON `porConfirmar` — se rellenaron con el valor más probable
 * para no dejar la web con huecos, pero hay que confirmarlos antes de enviar la
 * app a App Review. Meta rastrea estas páginas y los datos societarios tienen
 * que coincidir con los del portafolio de negocio verificado.
 */

export const legal = {
  producto: 'Kavea',
  dominio: 'kavea.ai',
  sitio: 'https://kavea.ai',

  /** Razón social titular del servicio. */
  razonSocial: 'Boosty Digital LLC',

  /** ⚠ porConfirmar — jurisdicción de constitución de la LLC. */
  jurisdiccion: 'Estado de Florida, Estados Unidos de América',

  /** ⚠ porConfirmar — domicilio que se publica en las páginas legales. */
  domicilio: 'Miami, Florida, Estados Unidos de América',

  /** ⚠ porConfirmar — hay que crear estos alias en el correo del dominio. */
  correos: {
    general: 'hola@kavea.ai',
    privacidad: 'privacidad@kavea.ai',
    legal: 'legal@kavea.ai',
    seguridad: 'seguridad@kavea.ai',
  },

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
