/**
 * Los roles, para pintar.
 *
 * Módulo sin dependencias a propósito: lo importan componentes de cliente y de
 * servidor. Vivía en `lib/equipo.ts`, que importa el cliente de servidor de
 * Supabase, y bastaba con que la pantalla de equipo importara esta constante
 * para arrastrar `next/headers` al bundle del navegador y romper el build.
 *
 * Es la TERCERA vez que pasa lo mismo —`terminoSeguro`, `colorEtapa`, y esto—,
 * así que los módulos de datos llevan ahora `import 'server-only'` en la primera
 * línea: no evita el fallo, pero convierte una traza confusa sobre
 * `next/headers` en un error que dice exactamente lo que pasa.
 *
 * La lista de aquí es SOLO para la interfaz. Quién puede qué lo decide
 * `public.puede(org, accion)` en Postgres, y esa es la única fuente de verdad:
 * si estas descripciones se quedan desfasadas, mienten en la pantalla pero no
 * abren ningún permiso.
 */
export type Rol = 'owner' | 'admin' | 'agente'

export const ROLES: Array<{ v: Rol; n: string; que: string }> = [
  {
    v: 'owner',
    n: 'Propietario',
    que: 'Todo, incluido conectar canales y nombrar a otro propietario',
  },
  {
    v: 'admin',
    n: 'Administrador',
    que: 'Atiende y configura campos, embudos y plantillas. Gestiona el equipo',
  },
  {
    v: 'agente',
    n: 'Agente',
    que: 'Atiende conversaciones: responde, mueve de etapa y rellena la ficha',
  },
]

export const NOMBRE_ROL: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.v, r.n]),
)
