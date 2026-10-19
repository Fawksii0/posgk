# G&K Food Mobile

GKMobile is the client ordering front end for the G&K Supabase backend. Clients use one account, choose a restaurant after signing in, and can switch restaurants later. Each restaurant has its own menu, prices, availability, hours, delivery zones, and orders. The app does not include sample dishes, demo accounts, or simulated orders.

## Local startup

1. Follow the Supabase local setup in [`api/README.md`](../api/README.md).
2. From the repository root, serve the apps with `python -m http.server 8800`.
3. Open `http://localhost:8800/GKMobile/`.

On localhost, the shared API client defaults to the local Supabase Edge Function at `http://127.0.0.1:54321/functions/v1/gk-api`. For a deployed project, configure `window.GK_SUPABASE_URL` before loading `../shared/gk-api.js`, or set `window.GK_API_URL` to the function URL. Never place the Supabase service-role key in a front-end file.

No sample menu, customer, or order data is seeded. The two G&K restaurant records are created by the G&K Supabase migration; configure branch details, menus, and delivery zones in GKAdmin before enabling ordering.

## Client functionality

- The restaurant list loads from `GET /api/branches`. After signing in, the client selects a restaurant; the selected branch scopes the menu, zones, settings, promotions, and order submission. Changing restaurants clears the cart and requires the client to reselect a delivery address.
- Public menu, visible items, availability, zones and restaurant settings load from `GET /api/menu` and `GET /api/zones` for the selected branch. An empty backend menu remains empty in GKMobile.
- Account creation asks for name, phone, e-mail and password; sign-in accepts e-mail or phone plus the password. There is no SMS or e-mail verification step.
- Checkout sends orders to `POST /api/orders`; the account's order list, detail and cancellation use the authenticated client order endpoints. Promo codes are validated by `POST /api/promos/validate` using the entered code and current cart subtotal.
- Cash on delivery is the only available payment method. GKMobile does not collect card details or process card payments. The API does not provide live courier GPS in the client order response.

## Project structure

- `index.html` — app shell and shared API client
- `styles.css` — mobile layout
- `data.js` — icon set and empty dynamic menu containers
- `store.js` — client-side cart/preferences and API-backed state
- `app.js` — views, API integration and interactions
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA files
- `assets/`, `references/` — visual assets
