ALTER TABLE public.zones
  ADD COLUMN IF NOT EXISTS radius_from_km double precision,
  ADD COLUMN IF NOT EXISTS radius_to_km double precision;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dest_lat double precision,
  ADD COLUMN IF NOT EXISTS dest_lng double precision;

UPDATE public.zones SET enabled = 0
WHERE branch_id = 'gk-food' AND radius_from_km IS NULL;

INSERT INTO public.zones (id, branch_id, name, fee, min_order, eta_min, eta_max, free_from, enabled, radius_from_km, radius_to_km)
VALUES
  ('z_gk-food_r0_3', 'gk-food', '0–3 km', 10, 0, 15, 30, NULL, 1, 0, 3),
  ('z_gk-food_r3_6', 'gk-food', '3–6 km', 15, 0, 20, 35, NULL, 1, 3, 6),
  ('z_gk-food_r6_10', 'gk-food', '6–10 km', 20, 0, 25, 45, NULL, 1, 6, 10),
  ('z_gk-food_r10_15', 'gk-food', '10–15 km', 30, 0, 30, 50, NULL, 1, 10, 15)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  fee = EXCLUDED.fee,
  min_order = EXCLUDED.min_order,
  eta_min = EXCLUDED.eta_min,
  eta_max = EXCLUDED.eta_max,
  free_from = EXCLUDED.free_from,
  enabled = EXCLUDED.enabled,
  radius_from_km = EXCLUDED.radius_from_km,
  radius_to_km = EXCLUDED.radius_to_km;

INSERT INTO public.settings (branch_id, key, value)
VALUES ('gk-food', 'maxDeliveryKm', '15')
ON CONFLICT (branch_id, key) DO UPDATE SET value = EXCLUDED.value;
