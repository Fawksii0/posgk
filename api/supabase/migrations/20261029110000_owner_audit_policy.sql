DROP POLICY IF EXISTS owner_audit_service_only ON public.owner_audit;
DROP POLICY IF EXISTS owner_audit_insert ON public.owner_audit;
DROP POLICY IF EXISTS owner_audit_owner_read ON public.owner_audit;

CREATE POLICY owner_audit_insert ON public.owner_audit FOR INSERT TO gk_api
WITH CHECK (true);

CREATE POLICY owner_audit_owner_read ON public.owner_audit FOR SELECT TO gk_api
USING (public.gk_actor_role() = 'owner');
