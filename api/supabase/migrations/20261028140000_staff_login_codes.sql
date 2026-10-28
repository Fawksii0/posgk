-- Floor staff (cashier / waiter / chef) log in with a unique 4-digit code.
-- Orders remember who took them so clôture can split chiffre d'affaires.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_code text;
CREATE UNIQUE INDEX IF NOT EXISTS users_login_code_uidx
  ON public.users (login_code) WHERE login_code IS NOT NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_id text;

UPDATE public.orders o
SET cashier_id = sub.staff_id
FROM (
  SELECT id,
    (
      SELECT elem->>'by'
      FROM jsonb_array_elements(CASE WHEN history ~ '^\s*\[' THEN history::jsonb ELSE '[]'::jsonb END) elem
      WHERE COALESCE(elem->>'by', '') LIKE 'u_%'
      LIMIT 1
    ) AS staff_id
  FROM public.orders
  WHERE cashier_id IS NULL
) sub
WHERE o.id = sub.id AND sub.staff_id IS NOT NULL AND o.cashier_id IS NULL;
