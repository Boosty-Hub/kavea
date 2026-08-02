-- 0013_semilla_boosty.sql — la organización de arranque.
-- Fuente: T17.
--
-- UUID fijo para que pruebas y scripts la referencien sin buscarla. Meter datos
-- en una migración de esquema es discutible en general; aquí se justifica porque
-- es una fila de arranque, es la misma en los tres entornos, y así se reproduce
-- con `db reset` sin un paso manual que alguien olvide.
--
-- El USUARIO no va aquí: auth.users es propiedad de Supabase Auth y una
-- inserción directa exige coherencia con auth.identities y con el formato de
-- encrypted_password. Se crea con la API de administración desde scripts/.

insert into public.organizations (id, nombre, slug)
values ('00000000-0000-4000-8000-000000000001', 'Boosty Digital', 'boosty')
on conflict (slug) do nothing;
