-- EN-108: "¿Este plan te sirve?" en Plan de pagos (Happiness del GSM).
--
-- Se corre una sola vez en Supabase > SQL Editor. Crea la tabla donde se
-- guarda la respuesta de cada usuario, una por mes, con RLS para que cada
-- quien solo vea y cambie la suya.
--
-- La app (IngresosGastos/datos.js) usa:
--   obtenerOpinionPlan(periodo)        select ... where periodo = '2026-11'
--   guardarOpinionPlan(periodo, sirve) upsert on conflict (usuario_id, periodo)

create table if not exists public.opiniones_plan (
  id         bigint generated always as identity primary key,
  -- Al eliminar la cuenta (eliminar_cuenta) la respuesta se borra con el usuario
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  -- Mes del plan que se califica, 'AAAA-MM', igual que el periodo de la app
  periodo    text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  sirve      boolean not null,
  creado_en  timestamptz not null default now(),
  -- Una respuesta por usuario y mes: si cambia de opinion se actualiza
  unique (usuario_id, periodo)
);

alter table public.opiniones_plan enable row level security;

-- El upsert necesita las tres: leer, crear y actualizar. No hay politica de
-- borrar: la app nunca borra respuestas.
create policy "opiniones_plan: ver las propias"
  on public.opiniones_plan for select to authenticated
  using (usuario_id in (select id from public.usuarios where auth_id = auth.uid()));

create policy "opiniones_plan: crear las propias"
  on public.opiniones_plan for insert to authenticated
  with check (usuario_id in (select id from public.usuarios where auth_id = auth.uid()));

create policy "opiniones_plan: cambiar las propias"
  on public.opiniones_plan for update to authenticated
  using (usuario_id in (select id from public.usuarios where auth_id = auth.uid()))
  with check (usuario_id in (select id from public.usuarios where auth_id = auth.uid()));


-- ---------------------------------------------------------------------------
-- Consulta del GSM: % de usuarios a los que el plan les sirve, por mes.
-- Se corre en el SQL Editor (ahi no aplica RLS y se ven todas las respuestas).
-- ---------------------------------------------------------------------------
--
-- select periodo,
--        count(*)                                                as respuestas,
--        count(*) filter (where sirve)                           as si,
--        round(100.0 * count(*) filter (where sirve) / count(*), 1) as porcentaje_si
--   from public.opiniones_plan
--  group by periodo
--  order by periodo desc;
