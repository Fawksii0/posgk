CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id text PRIMARY KEY,
  user_id text,
  audience text NOT NULL CHECK (audience IN ('client', 'courier', 'staff', 'waiter')),
  app text,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at double precision NOT NULL,
  updated_at double precision NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uidx ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_audience_idx ON public.push_subscriptions (audience, user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_api ON public.push_subscriptions;
CREATE POLICY push_subscriptions_api ON public.push_subscriptions FOR ALL TO gk_api USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO gk_api;
