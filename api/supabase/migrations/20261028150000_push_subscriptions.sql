CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  user_id text,
  audience text NOT NULL CHECK (audience IN ('client', 'courier', 'staff', 'waiter')),
  app text,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at double precision NOT NULL,
  updated_at double precision NOT NULL
);

ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS branch_id text REFERENCES public.branches(id);
UPDATE public.push_subscriptions SET branch_id = 'gk-food' WHERE branch_id IS NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN branch_id SET NOT NULL;

DROP INDEX IF EXISTS public.push_subscriptions_endpoint_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_branch_endpoint_uidx ON public.push_subscriptions (branch_id, endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_audience_idx ON public.push_subscriptions (branch_id, audience, user_id);

DROP TRIGGER IF EXISTS push_subscriptions_branch_guard ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_api ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_branch_scope ON public.push_subscriptions;
CREATE POLICY push_subscriptions_branch_scope ON public.push_subscriptions FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id())
WITH CHECK (
  branch_id = public.gk_branch_id()
  AND user_id = public.gk_actor_id()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO gk_api;
