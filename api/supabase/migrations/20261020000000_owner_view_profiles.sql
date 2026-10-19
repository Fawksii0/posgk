-- Lets the API create the owner's personal "view as client" profile (id prefix u_ov_).
DROP POLICY IF EXISTS users_insert_owner_view ON public.users;
CREATE POLICY users_insert_owner_view ON public.users FOR INSERT TO gk_api WITH CHECK (
  role = 'client'
  AND id = 'u_ov_client'
  AND auth_user_id IS NULL
  AND public.gk_actor_role() IN ('admin', 'owner')
);
