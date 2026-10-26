ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee double precision NOT NULL DEFAULT 0;

INSERT INTO public.settings (branch_id, key, value)
SELECT b.id, 'serviceFee', '{"on":true,"base":2,"pct":4,"min":3,"max":10}'
FROM public.branches b
ON CONFLICT (branch_id, key) DO NOTHING;
