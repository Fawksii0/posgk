-- Instant staff alerts: Postgres NOTIFY on new/updated tickets and waiter calls.

CREATE OR REPLACE FUNCTION public.gk_live_notify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload text;
  row_mode text;
  row_status text;
  row_id text;
  row_branch text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_id := OLD.id;
    row_status := OLD.status;
    row_branch := OLD.branch_id;
    IF TG_TABLE_NAME = 'orders' THEN row_mode := OLD.mode; END IF;
  ELSE
    row_id := NEW.id;
    row_status := NEW.status;
    row_branch := NEW.branch_id;
    IF TG_TABLE_NAME = 'orders' THEN row_mode := NEW.mode; END IF;
  END IF;
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', row_id,
    'mode', row_mode,
    'status', row_status,
    'branch_id', row_branch
  )::text;
  PERFORM pg_notify('gk_live', payload);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS orders_live_notify ON public.orders;
CREATE TRIGGER orders_live_notify
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.gk_live_notify();

DROP TRIGGER IF EXISTS waiter_calls_live_notify ON public.waiter_calls;
CREATE TRIGGER waiter_calls_live_notify
AFTER INSERT OR UPDATE ON public.waiter_calls
FOR EACH ROW EXECUTE FUNCTION public.gk_live_notify();
