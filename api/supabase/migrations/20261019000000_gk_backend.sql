DO $$
BEGIN
  CREATE ROLE gk_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE gk_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END
$$;
GRANT gk_api TO service_role;
GRANT USAGE ON SCHEMA public TO gk_api;

CREATE TABLE public.branches (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  cuisine text NOT NULL,
  address text NOT NULL DEFAULT '',
  active smallint NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT INTO public.branches (id, slug, name, cuisine) VALUES
  ('gk-food', 'gk-food', 'G&K Food', 'Main cuisine'),
  ('gk-shawarma-crispy', 'gk-shawarma-crispy', 'G&K Shawarma & Crispy', 'Shawarma & Crispy');

CREATE TABLE public.users (
  id text PRIMARY KEY,
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('client','courier','cashier','chef','waiter','manager','admin','owner')),
  name text NOT NULL,
  email text,
  phone text,
  password_hash text,
  pin_hash text,
  branch_id text REFERENCES public.branches(id),
  active smallint NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  blocked smallint NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  must_change smallint NOT NULL DEFAULT 0 CHECK (must_change IN (0, 1)),
  token_version integer NOT NULL DEFAULT 0,
  created_at double precision NOT NULL,
  created_by text,
  last_login double precision
);
CREATE UNIQUE INDEX users_email_idx ON public.users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_role_idx ON public.users(phone, role) WHERE phone IS NOT NULL;
CREATE INDEX users_role_idx ON public.users(role);
CREATE INDEX users_branch_idx ON public.users(branch_id, role);

CREATE TABLE public.couriers (
  user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES public.branches(id),
  vehicle text NOT NULL DEFAULT '',
  online smallint NOT NULL DEFAULT 0 CHECK (online IN (0, 1)),
  lat double precision,
  lng double precision,
  last_seen double precision
);
CREATE INDEX couriers_branch_idx ON public.couriers(branch_id);

CREATE TABLE public.login_attempts (
  key text PRIMARY KEY,
  fails integer NOT NULL DEFAULT 0,
  locked_until double precision NOT NULL DEFAULT 0,
  updated_at double precision NOT NULL
);

CREATE TABLE public.menu_categories (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX menu_categories_name_idx ON public.menu_categories(branch_id, lower(name));

CREATE TABLE public.menu_items (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  category_id text REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price double precision NOT NULL,
  discount integer NOT NULL DEFAULT 0,
  sizes text NOT NULL DEFAULT '[]',
  extras text NOT NULL DEFAULT '[]',
  image_url text NOT NULL DEFAULT '',
  available smallint NOT NULL DEFAULT 1,
  visible smallint NOT NULL DEFAULT 1,
  created_at double precision NOT NULL,
  updated_at double precision NOT NULL
);
CREATE INDEX menu_items_branch_idx ON public.menu_items(branch_id, created_at);

CREATE TABLE public.zones (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  name text NOT NULL,
  fee double precision NOT NULL DEFAULT 0,
  min_order double precision NOT NULL DEFAULT 0,
  eta_min integer NOT NULL DEFAULT 20,
  eta_max integer NOT NULL DEFAULT 40,
  free_from double precision,
  enabled smallint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX zones_name_idx ON public.zones(branch_id, lower(name));

CREATE TABLE public.promos (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('pct','mad')),
  value double precision NOT NULL,
  min_order double precision NOT NULL DEFAULT 0,
  expiry text,
  active smallint NOT NULL DEFAULT 1,
  uses integer NOT NULL DEFAULT 0,
  UNIQUE(branch_id, code)
);

CREATE TABLE public.orders (
  id text PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  seq integer NOT NULL,
  client_id text REFERENCES public.users(id),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('delivery','pickup')),
  status text NOT NULL,
  items text NOT NULL,
  subtotal double precision NOT NULL,
  fee double precision NOT NULL DEFAULT 0,
  discount double precision NOT NULL DEFAULT 0,
  promo text,
  total double precision NOT NULL,
  payment text NOT NULL,
  zone_id text,
  zone_name text,
  address text NOT NULL DEFAULT '',
  address_label text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  delivery_code text NOT NULL,
  eta_min integer,
  prep_minutes integer,
  promised_at double precision,
  accepted_at double precision,
  ready_at double precision,
  picked_up_at double precision,
  delivered_at double precision,
  courier_id text REFERENCES public.users(id),
  dispatch_state text NOT NULL DEFAULT 'none',
  offered_to text,
  offered_at double precision,
  offer_expires double precision,
  tried text NOT NULL DEFAULT '[]',
  dispatch_km double precision,
  dispatch_manual smallint NOT NULL DEFAULT 0,
  courier_step integer NOT NULL DEFAULT 0,
  courier_earning double precision NOT NULL DEFAULT 0,
  cash_settled smallint NOT NULL DEFAULT 0,
  refused_reason text,
  cancel_reason text,
  history text NOT NULL DEFAULT '[]',
  created_at double precision NOT NULL,
  updated_at double precision NOT NULL,
  UNIQUE(branch_id, seq)
);
CREATE INDEX orders_client_idx ON public.orders(client_id, created_at);
CREATE INDEX orders_status_idx ON public.orders(branch_id, status, updated_at);
CREATE INDEX orders_updated_idx ON public.orders(branch_id, updated_at);
CREATE INDEX orders_courier_idx ON public.orders(courier_id);
CREATE INDEX orders_offer_idx ON public.orders(offered_to);

CREATE TABLE public.settings (
  branch_id text NOT NULL REFERENCES public.branches(id),
  key text NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (branch_id, key)
);

CREATE TABLE public.order_counters (
  branch_id text PRIMARY KEY REFERENCES public.branches(id),
  value integer NOT NULL
);

CREATE TABLE public.notifications (
  id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  audience text NOT NULL CHECK (audience IN ('client','courier','staff')),
  user_id text,
  title text NOT NULL,
  text text NOT NULL DEFAULT '',
  order_id text,
  created_at double precision NOT NULL,
  read smallint NOT NULL DEFAULT 0
);
CREATE INDEX notif_user_idx ON public.notifications(branch_id, audience, user_id, id);

CREATE TABLE public.audit_log (
  id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  branch_id text NOT NULL REFERENCES public.branches(id),
  at double precision NOT NULL,
  actor_id text,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  target_id text,
  target_role text
);
CREATE INDEX audit_at_idx ON public.audit_log(branch_id, at);

CREATE TABLE public.owner_audit (
  id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  at double precision NOT NULL,
  outcome text NOT NULL,
  ip text,
  user_agent text
);

CREATE FUNCTION public.gk_actor_id() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('gk.actor_id', true), '') $$;
CREATE FUNCTION public.gk_actor_role() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT coalesce(nullif(current_setting('gk.actor_role', true), ''), 'anonymous') $$;
CREATE FUNCTION public.gk_branch_id() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('gk.branch_id', true), '') $$;

CREATE FUNCTION public.gk_assign_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE selected_branch text := nullif(current_setting('gk.branch_id', true), '');
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.role IN ('client', 'owner', 'admin') THEN
      NEW.branch_id := NULL;
    ELSE
      IF NEW.branch_id IS NULL THEN NEW.branch_id := selected_branch; END IF;
      IF NEW.branch_id IS NULL OR NEW.branch_id <> selected_branch THEN
        RAISE EXCEPTION 'branch scope required or mismatched' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    IF NEW.branch_id IS NULL THEN NEW.branch_id := selected_branch; END IF;
    IF NEW.branch_id IS NULL OR NEW.branch_id <> selected_branch THEN
      RAISE EXCEPTION 'branch scope required or mismatched' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER users_branch_guard BEFORE INSERT OR UPDATE OF role, branch_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER couriers_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.couriers
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER categories_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER items_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER zones_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.zones
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER promos_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.promos
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER orders_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER settings_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER order_counters_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.order_counters
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER notifications_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();
CREATE TRIGGER audit_branch_guard BEFORE INSERT OR UPDATE OF branch_id ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.gk_assign_branch();

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY branches_read_active ON public.branches FOR SELECT TO gk_api USING (active = 1);
CREATE POLICY users_read ON public.users FOR SELECT TO gk_api USING (
  id = public.gk_actor_id()
  OR auth_user_id::text = public.gk_actor_id()
  OR public.gk_actor_role() IN ('admin','owner')
  OR (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('cashier','chef','waiter','manager'))
  OR (public.gk_actor_role() = 'anonymous' AND role IN ('owner','courier'))
);
CREATE POLICY users_insert ON public.users FOR INSERT TO gk_api WITH CHECK (
  (role = 'client' AND auth_user_id::text = public.gk_actor_id())
  OR (role = 'courier' AND branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('manager','admin','owner'))
  OR (role IN ('cashier','chef','waiter','manager') AND branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner'))
  OR (role IN ('admin','owner') AND public.gk_actor_role() = 'admin')
);
CREATE POLICY users_update ON public.users FOR UPDATE TO gk_api
USING (
  id = public.gk_actor_id()
  OR public.gk_actor_role() IN ('admin','owner')
  OR (branch_id = public.gk_branch_id() AND role = 'courier' AND public.gk_actor_role() = 'manager')
)
WITH CHECK (
  id = public.gk_actor_id()
  OR public.gk_actor_role() IN ('admin','owner')
  OR (branch_id = public.gk_branch_id() AND role = 'courier' AND public.gk_actor_role() = 'manager')
);
CREATE POLICY users_delete ON public.users FOR DELETE TO gk_api
USING (public.gk_actor_role() IN ('admin','owner') OR (branch_id = public.gk_branch_id() AND role = 'courier' AND public.gk_actor_role() = 'manager'));

CREATE POLICY couriers_branch_scope ON public.couriers FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND (public.gk_actor_role() IN ('admin','owner','cashier','manager') OR user_id = public.gk_actor_id()))
WITH CHECK (branch_id = public.gk_branch_id() AND (public.gk_actor_role() IN ('admin','owner','cashier','manager') OR (public.gk_actor_role() = 'courier' AND user_id = public.gk_actor_id())));

CREATE POLICY categories_branch_scope ON public.menu_categories FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager'));
CREATE POLICY items_branch_scope ON public.menu_items FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager'));
CREATE POLICY zones_branch_scope ON public.zones FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager'));
CREATE POLICY promos_branch_scope ON public.promos FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('client','admin','owner','manager'));
CREATE POLICY orders_branch_scope ON public.orders FOR ALL TO gk_api
USING (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('cashier','chef','waiter','manager','admin','owner')
    OR (public.gk_actor_role() = 'client' AND client_id = public.gk_actor_id())
    OR (public.gk_actor_role() = 'courier' AND (courier_id = public.gk_actor_id() OR offered_to = public.gk_actor_id()))
  )
)
WITH CHECK (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('cashier','chef','waiter','manager','admin','owner')
    OR (public.gk_actor_role() = 'client' AND client_id = public.gk_actor_id())
    OR public.gk_actor_role() = 'courier'
  )
);
CREATE POLICY settings_branch_scope ON public.settings FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('anonymous','client','courier','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('admin','owner','manager','cashier'));
CREATE POLICY order_counters_branch_scope ON public.order_counters FOR ALL TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('client','cashier','chef','waiter','manager','admin','owner'))
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('client','admin','owner','manager'));
CREATE POLICY notifications_branch_scope ON public.notifications FOR SELECT TO gk_api
USING (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('cashier','chef','waiter','manager','admin','owner')
    OR (public.gk_actor_role() IN ('client','courier') AND user_id = public.gk_actor_id())
  )
);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO gk_api
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('client','courier','cashier','chef','waiter','manager','admin','owner'));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO gk_api
USING (
  branch_id = public.gk_branch_id()
  AND (
    public.gk_actor_role() IN ('cashier','chef','waiter','manager','admin','owner')
    OR (public.gk_actor_role() IN ('client','courier') AND user_id = public.gk_actor_id())
  )
)
WITH CHECK (branch_id = public.gk_branch_id());
CREATE POLICY audit_read ON public.audit_log FOR SELECT TO gk_api
USING (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('manager','admin','owner'));
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO gk_api
WITH CHECK (branch_id = public.gk_branch_id() AND public.gk_actor_role() IN ('client','courier','cashier','chef','waiter','manager','admin','owner'));

CREATE POLICY attempts_service_only ON public.login_attempts FOR ALL TO gk_api USING (true) WITH CHECK (true);
CREATE POLICY owner_audit_service_only ON public.owner_audit FOR ALL TO gk_api USING (true) WITH CHECK (true);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gk_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gk_api;
