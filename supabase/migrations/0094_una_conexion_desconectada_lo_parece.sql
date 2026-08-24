-- 0094_una_conexion_desconectada_lo_parece.sql
--
-- Al desconectar «Centromarca Mercedes» la pantalla siguió ofreciendo
-- «Desconectar» y «Volver a comprobar» sobre una conexión ya desconectada. Sus
-- canales sí decían «Inactivo», así que la misma tarjeta afirmaba dos cosas
-- distintas a diez píxeles de distancia.
--
-- El motivo es que `estado_de_conexion` no expone `estado`. El panel no lo
-- ocultaba: no podía saberlo. Y un botón que ofrece deshacer algo ya deshecho no
-- es solo ruido — invita a pulsarlo y a dudar de si la primera vez funcionó.

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
    c.invalidado_en AS cambiada_en,
    c.token_invalid_since AS token_invalido_desde,
    c.estado
   FROM meta_connections c
     LEFT JOIN verificaciones v ON v.meta_connection_id = c.id
  GROUP BY c.organization_id, c.id, c.page_name, c.page_id, c.ig_username,
           c.invalidado_en, c.token_invalid_since, c.estado;
