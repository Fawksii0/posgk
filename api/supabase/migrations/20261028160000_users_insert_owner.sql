DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY users_insert ON public.users FOR INSERT TO gk_api WITH CHECK (
  (role = 'client' AND auth_user_id::text = public.gk_actor_id())
  OR (role = 'courier' AND branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('manager','admin','owner'))
  OR (role IN ('cashier','chef','waiter','manager') AND branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner'))
  OR (role IN ('admin','owner') AND public.gk_actor_role() IN ('admin','owner'))
);
