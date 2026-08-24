/**
 * Los campos de webhook a los que se suscribe una Página.
 *
 * VIVE AQUÍ Y NO EN CADA FUNCIÓN PORQUE LA DERIVA ES UN FALLO SILENCIOSO. Dos
 * sitios suscriben: el alta (`meta-canje`, al conectar) y el reconciliador
 * (`reconciliar-suscripciones`, cada quince minutos). Si las listas dejan de
 * coincidir, el reconciliador ve campos «que faltan» en cada pasada, vuelve a
 * hacer el POST, y la conexión aparece corrigiéndose eternamente sin que nada
 * esté roto. Una sola lista, importada por los dos.
 *
 * `comments` NO ESTÁ Y NO PUEDE ESTAR. Probado el 2-ago-2026: Meta rechaza el
 * POST entero de `subscribed_apps` si aparece. El POST es atómico, así que la
 * suscripción existente sobrevive, pero el reconciliador reportaba fallo cada
 * quince minutos mientras estuvo puesto.
 *
 * Y OJO CON LA CAPA: a nivel de APP el topic `instagram` sí lleva `comments`.
 * Lo que Meta rechaza es `comments` POR PÁGINA. Son dos suscripciones distintas
 * y confundirlas cuesta una tarde.
 */
export const CAMPOS_MESSENGER = [
  'messages',
  'messaging_postbacks',
  'message_echoes',
  'message_reads',
  'message_reactions',
  'messaging_referrals',
  'messaging_optins',
  'messaging_handovers',

  // Sonda de comentarios (2-ago-2026). Kavea todavía no procesa `changes[]`:
  // se guarda crudo en `webhook_events` y produce cero efectos, que es lo
  // correcto mientras nada lo consuma. Se suscribe para PODER MEDIR si llegan y
  // con qué forma, y así arrancar la fase de comentarios con el payload real en
  // la mano. Usa `pages_manage_metadata`, que ya está concedido, y no añade
  // ningún permiso al App Review pendiente — pedir scopes de más es causa
  // documentada de rechazo.
  'feed',
]
