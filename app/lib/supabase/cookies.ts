const RAIZ = process.env.NEXT_PUBLIC_DOMINIO_RAIZ ?? 'kavea.ai'

/**
 * Opciones de la cookie de sesión, en un solo sitio.
 *
 * La sesión vive en el dominio padre —`.kavea.ai`— porque cada cliente entra por
 * el subdominio de su espacio y sin eso habría que iniciar sesión una vez por
 * organización. En local se deja sin dominio: `.localhost` no acepta cookie de
 * dominio.
 *
 * POR QUÉ SE SACA A SU PROPIO FICHERO. Hasta hoy esto solo lo sabía el cliente de
 * navegador, y bastaba porque la sesión se creaba siempre desde el navegador
 * (`signInWithPassword` en un componente de cliente). El retorno del Facebook
 * Login la crea desde el SERVIDOR, en un route handler, y una cookie de host
 * escrita con el mismo nombre que una de dominio no la reemplaza: convive con
 * ella. El navegador manda las dos y cuál gana depende del orden, así que el
 * síntoma sería una sesión que se pierde a veces y sin dejar rastro en los
 * registros. Un solo origen de verdad evita esa clase de fallo.
 *
 * OJO, DEUDA CONOCIDA: `supabase/servidor.ts` y `middleware.ts` siguen creando
 * su cliente sin estas opciones, así que un refresco de sesión hecho en el
 * servidor todavía escribe cookie de host. Es el comportamiento que hay hoy en
 * producción y cambiarlo toca la autenticación de todo el producto, así que no
 * entra en la misma pasada que el arreglo del App Review.
 */
export function opcionesDeCookie() {
  return RAIZ === 'localhost'
    ? {}
    : { domain: `.${RAIZ}`, sameSite: 'lax' as const, secure: true }
}
