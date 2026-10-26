DROP POLICY IF EXISTS categories_branch_scope ON public.menu_categories;
CREATE POLICY categories_branch_scope ON public.menu_categories FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','dinein','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager'));

DROP POLICY IF EXISTS items_branch_scope ON public.menu_items;
CREATE POLICY items_branch_scope ON public.menu_items FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','dinein','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager'));

DROP POLICY IF EXISTS settings_branch_scope ON public.settings;
CREATE POLICY settings_branch_scope ON public.settings FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','dinein','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager','cashier'));
