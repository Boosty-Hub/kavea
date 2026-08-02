-- 0052_tareas_de_pagina.sql — donde se guardan las tareas de la Página.
--
-- MEDIDO EL 2 DE AGOSTO DE 2026, no leído. Pedir el campo `tasks` sobre el nodo
-- de la Página con un Page Access Token devuelve:
--
--   (#100) Tried accessing nonexisting field (tasks) on node type (Page)
--
-- El array `tasks` SOLO existe en la lista de cuentas del diálogo de OAuth, que
-- necesita un token de usuario. Una conexión ya establecida no puede volver a
-- preguntarlo.
--
-- Consecuencia de diseño: se guarda lo que se vio AL CONECTAR. Sin esta columna,
-- V2 sería `no_verificable` para siempre en toda conexión existente, que es
-- decir «no lo sé» cuando sí se supo y no se apuntó.
alter table public.meta_connections
  add column if not exists tasks text[];

comment on column public.meta_connections.tasks is
  'El array tasks tal cual lo devolvio la lista de cuentas AL CONECTAR. No se '
  'puede releer: con un Page Access Token el campo no existe en el nodo Page '
  '(medido el 2026-08-02, error #100). Nulo en las conexiones sembradas a mano.';
