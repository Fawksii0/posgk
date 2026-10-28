ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dest_lat double precision;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dest_lng double precision;
