# Implementation Plan - POS Admin Panel Expansion

Expanding the Admin (Cashier) capabilities to configure menu items, table quantities, waiter credentials, and track staff performance (number of orders taken).

## Proposed Changes

### Core Refactoring
- Move `menuItems` and `tablesCount` from static imports in `mockData.js` into active State in `App.jsx` with persistent `localStorage` synchronization.
- Provide props `menuItems` and `tablesCount` to `WaiterInterface` and `CashierDashboard`.

### [MODIFY] [App.jsx](file:///c:/Users/admin/Desktop/POSGK/src/App.jsx)
- Set up state for `menuItems` (defaulting to mock list) and `tablesCount` (defaulting to 12).
- Count the number of completed/active orders taken by each waiter dynamically by analyzing the `orders` array, or storing an order count per waiter. (Doing it dynamically by matching `order.waiterName` is extremely robust and avoids manual sync errors!)
- Add state setters:
  - `saveMenuItems(newItems)`
  - `saveTablesCount(newCount)`
  - `saveWaiters(newWaiters)`

### [MODIFY] [WaiterInterface.jsx](file:///c:/Users/admin/Desktop/POSGK/src/components/WaiterInterface.jsx)
- Accept `tablesCount` and `menuItems` as props.
- Generate the table selection map dynamically based on `tablesCount`.
- Use the active `menuItems` array passed from props.

### [MODIFY] [CashierDashboard.jsx](file:///c:/Users/admin/Desktop/POSGK/src/components/CashierDashboard.jsx)
- Expand sub-tabs to include:
  1.  **Live Orders** (with revenue stats)
  2.  **Menu Builder** (Add, Edit, Delete items; change prices/descriptions)
  3.  **Staff Performance** (Add, edit waiter name/PIN, view total orders placed by each)
  4.  **Layout Settings** (Change total number of dining tables in the restaurant)
- Create forms for editing menu items and table configuration.

## Verification Plan

### Manual Verification
1.  **Menu Builder**: Log in as Cashier (`0000`). Go to "Menu Builder". Change "Margherita Pizza" price to `$16.50` or add a new drink "Espresso" at `$3.00`. Switch to Waiter Mode, verify changes are instantly visible.
2.  **Staff Management**: Rename waiter "Alex" to "Alexander" and change their PIN to `1212`. Verify `1111` no longer works and `1212` logs in as "Alexander".
3.  **Order Counter**: Log in as Maria (`2222`). Submit 2 orders. Log in as Cashier. Verify Maria's order count is exactly `2` under "Staff Performance".
4.  **Table Config**: Change total tables count to `15`. Go to Waiter Mode, verify tables `T1` through `T15` are visible.
