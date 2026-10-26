-- Dine-in QR menu: restaurant prices, table number, waiter calls.

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS dine_price double precision;
UPDATE public.menu_items SET dine_price = price WHERE dine_price IS NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_mode_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_mode_check CHECK (mode IN ('delivery', 'pickup', 'dinein'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_no integer;

CREATE TABLE IF NOT EXISTS public.waiter_calls (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  table_no integer NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'ack')),
  created_at double precision NOT NULL,
  updated_at double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS waiter_calls_branch_idx ON public.waiter_calls(branch_id, status, created_at);

DROP TRIGGER IF EXISTS waiter_calls_branch_guard ON public.waiter_calls;
CREATE TRIGGER waiter_calls_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.waiter_calls
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();

ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waiter_calls_scope ON public.waiter_calls;
CREATE POLICY waiter_calls_scope ON public.waiter_calls FOR ALL TO gk_api
USING (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('dinein', 'cashier', 'chef', 'waiter', 'manager', 'admin', 'owner')
  )
)
WITH CHECK (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('dinein', 'cashier', 'chef', 'waiter', 'manager', 'admin', 'owner')
  )
);

DROP POLICY IF EXISTS orders_branch_scope ON public.orders;
CREATE POLICY orders_branch_scope ON public.orders FOR ALL TO gk_api
USING (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('cashier', 'chef', 'waiter', 'manager', 'admin', 'owner')
    OR (public.gk_actor_role() = 'client' AND client_id = public.gk_actor_id())
    OR (public.gk_actor_role() = 'courier' AND (courier_id = public.gk_actor_id() OR offered_to = public.gk_actor_id()))
    OR (public.gk_actor_role() = 'dinein' AND mode = 'dinein')
  )
)
WITH CHECK (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('cashier', 'chef', 'waiter', 'manager', 'admin', 'owner')
    OR (public.gk_actor_role() = 'client' AND client_id = public.gk_actor_id())
    OR public.gk_actor_role() = 'courier'
    OR (public.gk_actor_role() = 'dinein' AND mode = 'dinein' AND client_id IS NULL)
  )
);

DROP POLICY IF EXISTS order_counters_branch_scope ON public.order_counters;
CREATE POLICY order_counters_branch_scope ON public.order_counters FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('dinein', 'client', 'cashier', 'chef', 'waiter', 'manager', 'admin', 'owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('dinein', 'client', 'admin', 'owner', 'manager', 'cashier'));

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO gk_api
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('dinein', 'client', 'courier', 'cashier', 'chef', 'waiter', 'manager', 'admin', 'owner'));

DROP POLICY IF EXISTS audit_insert ON public.audit_log;
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO gk_api
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('dinein', 'client', 'courier', 'cashier', 'chef', 'waiter', 'manager', 'admin', 'owner'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiter_calls TO gk_api;
