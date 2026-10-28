-- Waiters placing dine-in tickets must increment order_counters (WITH CHECK previously omitted waiter).
DROP POLICY IF EXISTS order_counters_branch_scope ON public.order_counters;
CREATE POLICY order_counters_branch_scope ON public.order_counters FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('dinein', 'client', 'cashier', 'chef', 'waiter', 'manager', 'admin', 'owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('dinein', 'client', 'admin', 'owner', 'manager', 'cashier', 'waiter', 'chef'));
