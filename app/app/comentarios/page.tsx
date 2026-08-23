import { redirect } from 'next/navigation'

/**
 * Comentarios dejó de ser un módulo propio: es una pestaña de la Bandeja.
 * Este redirect es para el enlace que alguien tenga guardado, no una ruta que
 * el producto siga ofreciendo — el sidebar ya no la enseña.
 */
export default function Comentarios() {
  redirect('/bandeja?vista=comentarios')
}
