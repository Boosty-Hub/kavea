-- 0053 — la actividad de verificación pasa por `registrar_actividad`.
--
-- POR QUÉ ESTA MIGRACIÓN EXISTE
--
-- 0050 escribía la actividad con un `insert into public.actividades` directo. El
-- resultado era correcto y aun así estaba mal, por una razón que solo se ve
-- desde fuera: `scripts/comprobar-actividades.mjs` reconoce los tipos que se
-- escriben MIRANDO LAS LLAMADAS a `registrar_actividad`. Un insert directo es
-- invisible para él.
--
-- Es decir: el guardián que existe precisamente porque cuatro veces llegó a
-- producción un identificador técnico sin traducir se habría callado. El fallo
-- no fue la actividad; fue haber salido del único camino que está vigilado.
--
-- El guardián también se amplía en el mismo commit para ver los inserts
-- directos, porque la próxima vez el atajo lo tomará otra persona.
create or replace function private.anotar_verificacion(
  p_org       uuid,
  p_conexion  uuid,
  p_codigo    text,
  p_titulo    text,
  p_resultado text,
  p_causa     text default null,
  p_crudo     jsonb default null,
  p_bloquea   boolean default true
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_antes text;
begin
  select resultado into v_antes
    from public.verificaciones
   where meta_connection_id = p_conexion and codigo = p_codigo;

  insert into public.verificaciones
    (organization_id, meta_connection_id, codigo, titulo, resultado, causa, crudo, bloquea)
  values (p_org, p_conexion, p_codigo, p_titulo, p_resultado, p_causa, p_crudo, p_bloquea)
  on conflict (meta_connection_id, codigo) do update
    set titulo = excluded.titulo,
        resultado = excluded.resultado,
        causa = excluded.causa,
        crudo = excluded.crudo,
        bloquea = excluded.bloquea,
        verificado_en = now();

  -- Solo el cambio. Una pasada del cron que confirma lo de siempre no es un
  -- acontecimiento; que una conexión se caiga de madrugada, sí.
  if v_antes is distinct from p_resultado then
    perform private.registrar_actividad(
      p_org, 'conexion.verificacion', 'sistema', null, null,
      jsonb_build_object('codigo', p_codigo, 'titulo', p_titulo,
                         'de', v_antes, 'a', p_resultado, 'causa', p_causa));
  end if;
end $$;
