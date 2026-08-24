-- 0090_un_diagnostico_viejo_no_es_un_diagnostico.sql
--
-- La pantalla de canales presenta el último diagnóstico guardado como si fuera
-- el estado actual. No lo es en cuanto algo cambia debajo.
--
-- EL CASO QUE LO DESTAPÓ, el 24-ago: se reconectó la Página de Boosty por el
-- diálogo de Meta y la pantalla siguió diciendo «esta conexión se creó sin pasar
-- por el diálogo». No era falso cuando se escribió: V2 se calcula sobre `tasks`,
-- que hasta ese canje no existía. Era un veredicto del día anterior presentado
-- como si fuera de ahora. Un alta correcta se leyó como fallida.
--
-- `meta-canje` ya rediagnostica al terminar (paso 8), pero eso solo cubre el
-- alta. Pausar un canal, desconectarlo, rotar un token o marcarlo inválido
-- también invalidan el veredicto, y ninguno de esos caminos rediagnostica. Que
-- la pantalla pueda DECIR que lo que enseña es viejo no depende de acordarse en
-- cada sitio: se deriva de comparar dos fechas que ya existen.
--
-- Se añaden a la vista, y ninguna es un dato nuevo:
--   · `cambiada_en`        — `meta_connections.updated_at`, para comparar.
--   · `token_invalido_desde` — para el botón «Reconectar». Vive en `public` a
--      propósito desde la 0003: la interfaz necesita saber que hay que reconectar
--      sin tener que leer ningún token.
--
-- La vista se reemplaza con `create or replace`, que conserva permisos y
-- políticas. Las columnas nuevas van AL FINAL porque Postgres no deja cambiar el
-- tipo ni el orden de las existentes en un replace.

create or replace view public.estado_de_conexion as
 SELECT c.organization_id,
    c.id AS meta_connection_id,
    c.page_name,
    c.page_id,
    c.ig_username,
    count(*) FILTER (WHERE v.resultado = 'ok'::text) AS en_verde,
    count(*) FILTER (WHERE v.resultado = 'fallo'::text) AS en_rojo,
    count(*) FILTER (WHERE v.resultado = 'no_verificable'::text) AS sin_saber,
    count(*) FILTER (WHERE v.resultado = 'sin_probar'::text) AS sin_probar,
    bool_or(v.resultado = 'fallo'::text AND v.bloquea) AS bloqueada,
    max(v.verificado_en) AS ultima_pasada,
    c.updated_at AS cambiada_en,
    c.token_invalid_since AS token_invalido_desde
   FROM meta_connections c
     LEFT JOIN verificaciones v ON v.meta_connection_id = c.id
  GROUP BY c.organization_id, c.id, c.page_name, c.page_id, c.ig_username,
           c.updated_at, c.token_invalid_since;

comment on view public.estado_de_conexion is
  'El estado derivado de las siete comprobaciones, mas dos fechas para saber si '
  'ese veredicto sigue valiendo: cambiada_en (updated_at de la conexion) contra '
  'ultima_pasada. Si la conexion cambio despues del ultimo diagnostico, lo que '
  'se enseña es viejo y hay que decirlo.';
