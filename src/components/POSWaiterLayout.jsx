import { useState, useMemo } from 'react';
import Uicon from './Uicon';

const POSWaiterLayout = ({
  onAddOrder,
  onModifyOrder,
  onClearAllNotifications,
  waiterName,
  tables = [],
  categories = [],
  menuItems = [],
  orders = [],
  notifications = [],
  unreadCount,
  onMarkNotificationAsRead
}) => {
  const [activeSection, setActiveSection] = useState('menu');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(categories.length > 0 ? categories[0].id : '');
  const [currentOrder, setCurrentOrder] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const currentOrderLines = useMemo(() => currentOrder, [currentOrder]);

  const waiterOrders = useMemo(
    () => orders.filter(order => order.waiterName?.toLowerCase() === waiterName.toLowerCase()),
    [orders, waiterName]
  );
  )}

        
  <div className="order-footer">
  const selectedOrder = selectedOrderId ? orders.find(order => order.id === selectedOrderId) : null;

  const normalizeOrderLine = (item) => ({
    ...item,
    quantity: Number(item.quantity || 1),
  });

  const addToOrder = (item) => {
    setCurrentOrder(prev => {
      const existing = prev.find(line => line.id === item.id);
      if (existing) {
        return prev.map(line => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...prev, { ...normalizeOrderLine(item), quantity: 1 }];
    });
  };

  const updateItemQuantity = (itemId, delta) => {
    setCurrentOrder(prev => prev
      .map(line => line.id === itemId ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
      .filter(line => line.quantity > 0)
    );
  };

  const removeOrderLine = (itemId) => {
    setCurrentOrder(prev => prev.filter(line => line.id !== itemId));
  };

  const calculateTotal = () => currentOrder.reduce((acc, line) => acc + (Number(line.price) || 0) * (Number(line.quantity) || 1), 0).toFixed(2);

  const prepareOrderForEdit = (order) => {
    setActiveSection('myOrders');
    setSelectedOrderId(order.id);
    setSelectedTable(order.table);
    setCurrentOrder((order.items || []).map(normalizeOrderLine));
  };

  const clearEditState = () => {
    setSelectedOrderId(null);
    setCurrentOrder([]);
  };

  const submitOrder = () => {
    if (!selectedTable || currentOrder.length === 0) return;

    if (selectedOrder) {
      onModifyOrder({ orderId: selectedOrder.id, items: currentOrder });
    } else {
      onAddOrder({ table: selectedTable, items: currentOrder, total: calculateTotal() });
    }

    setSelectedTable(null);
    clearEditState();
    setActiveSection('menu');
  };

  const renderIcon = (icon) => {
    if (!icon) return null;
    return typeof icon === 'string' && icon.includes('fi-')
      ? <Uicon icon={icon} className="cat-icon" />
      : <span className="cat-icon">{icon}</span>;
  };

  const matchingMenuItems = useMemo(() => {
    return (menuItems || [])
      .filter(item => item.category === selectedCategory)
      .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [menuItems, selectedCategory, searchTerm]);

  return (
    <div className="waiter-grid pos-style">
      <aside className="left-nav">
        <div className="brand"><Uicon icon="fi-rr-bowl-food" className="brand-icon" title="Service menu" /> Waiter</div>
        <nav className="nav-list">
          <button className={`nav-item ${activeSection === 'menu' ? 'active' : ''}`} onClick={() => { setActiveSection('menu'); clearEditState(); }}>
            <Uicon icon="fi-rr-list" /> Menu
          </button>
          <button className={`nav-item ${activeSection === 'myOrders' ? 'active' : ''}`} onClick={() => { setActiveSection('myOrders'); clearEditState(); }}>
            <Uicon icon="fi-rr-browser" /> My Orders {activeOrders.length > 0 ? `(${activeOrders.length})` : ''}
          </button>
        </nav>
        <div className="nav-footer">
          <div className="user-pill">{waiterName} {unreadCount ? `• ${unreadCount} new` : ''}</div>
        </div>
      </aside>

      <section className="center-panel">
        <div className="tables-picker mobile-table-picker">
          <select
            className="table-dropdown glass-input"
            value={selectedTable || ''}
            onChange={(e) => setSelectedTable(e.target.value)}
            aria-label="Select table"
          >
            <option value="">Select table</option>
            {(tables || []).map(t => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          {(tables || []).map(t => (
            <button
              key={t.id}
              className={`table-btn ${selectedTable === t.name ? 'active' : ''}`}
              onClick={() => setSelectedTable(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="search-row">
          <input
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search product here..."
          />
          <div className="search-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setActiveSection('orders')} aria-label="Open orders">
              <Uicon icon="fi-rr-menu-burger" />
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowNotifications(prev => !prev)}
              aria-label="Toggle notifications"
              title="Notifications"
              style={{ marginLeft: 8, position: 'relative' }}
            >
              <Uicon icon="fi-rr-bell" />
              {unreadCount ? <span className="notif-badge">{unreadCount}</span> : null}
            </button>
          </div>
        </div>

        {activeSection === 'menu' ? (
          <>
            <select
              className="category-select glass-input"
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Select category"
            >
              <option value="">All categories</option>
              {(categories || []).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            <div className="category-chips">
              {(categories || []).map(cat => (
                <button
                  key={cat.id}
                  className={`chip ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {renderIcon(cat.icon)} {cat.name}
                </button>
              ))}
            </div>

            <div className="product-grid">
              {matchingMenuItems.map(item => {
                const quantity = currentOrder.find(line => line.id === item.id)?.quantity || 0;
                return (
                  <div key={item.id} className="product-card">
                    {item.image && <img src={item.image} alt={item.name} className="product-img" />}
                    <div className="product-body">
                      <h4>{item.name}</h4>
                      <p className="muted">{item.description}</p>
                      <div className="product-meta">
                        <strong>{(Number(item.price) || 0).toFixed(2)} MAD</strong>
                        <div className="quantity-control">
                          <button className="btn btn-secondary btn-sm" onClick={() => updateItemQuantity(item.id, -1)} disabled={quantity === 0}>-</button>
                          <span className="quantity-label">{quantity}</span>
                          <button className="btn btn-secondary btn-sm" onClick={() => addToOrder(item)}>+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {matchingMenuItems.length === 0 && (
                <p className="empty-msg">No menu items match your search.</p>
              )}
            </div>
          </>
        ) : (
          <div className="orders-list">
            {activeOrders.length === 0 ? (
              <div className="empty-msg">You have no active orders right now.</div>
            ) : activeOrders.map(order => (
              <div key={order.id} className={`order-card ${selectedOrderId === order.id ? 'selected' : ''}`}>
                <div>
                  <div className="order-card-title">{order.table}</div>
                  <div className="order-card-subtitle">{order.items?.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)} items • {order.status}</div>
                </div>
                <div className="order-card-meta">
                  <strong>{order.total} MAD</strong>
                  <button className="btn btn-secondary btn-sm" onClick={() => prepareOrderForEdit(order)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="order-sidebar">
        <div className="order-header">
          <div>
            <h3>{selectedOrder ? `Editing ${selectedOrder.table}` : `Table ${selectedTable || '-'}`}</h3>
            <small>Waiter: {waiterName}</small>
          </div>
          {selectedOrder && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={clearEditState}>Cancel</button>
          )}
        </div>

        <div className="tables-quick desktop-table-picker">
          {(tables || []).map(t => (
            <button
              key={t.id}
              className={`table-btn ${selectedTable === t.name ? 'active' : ''}`}
              onClick={() => setSelectedTable(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="order-items">
          {currentOrder.length === 0 ? (
            <p className="empty-msg">No items selected</p>
          ) : (
            currentOrder.map(item => (
              <div key={item.id} className="order-item">
                <div>
                  <div className="order-item-name">{item.name}</div>
                  <div className="order-item-meta">{item.quantity} x {(Number(item.price) || 0).toFixed(2)} MAD = {(Number(item.price) * item.quantity).toFixed(2)} MAD</div>
                </div>
                <div className="order-item-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => updateItemQuantity(item.id, -1)}>-</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => updateItemQuantity(item.id, 1)}>+</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => removeOrderLine(item.id)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>

        {showNotifications && (
        <div className="notification-box">
          <div className="notification-header">
            <h4>Notifications</h4>
            <button
              className="btn btn-link"
              type="button"
              onClick={onClearAllNotifications}
              disabled={!notifications.length}
            >
              Clear All
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="empty-msg">No notifications</p>
          ) : (
            notifications.map((note) => (
              <div key={note.id} className={`notification-item ${note.read ? 'read' : 'unread'}`} onClick={() => !note.read && onMarkNotificationAsRead(note.id)}>
                <div>
                  <strong>{note.title}</strong>
                  <p className="muted">{note.message}</p>
                </div>
                <small>{note.timestamp}</small>
              </div>
            ))
          )}
        </div>

        <div className="order-footer">
          <div className="total">
            <span>Total</span>
            <span>{calculateTotal()} MAD</span>
          </div>
          <button
            className="btn btn-primary submit-btn"
            onClick={submitOrder}
            disabled={!selectedTable || currentOrder.length === 0}
          >
            {selectedOrder ? 'Save Changes' : 'Place Order'}
          </button>
        </div>
      </aside>

      <style jsx>{`
        :root { --bg: #f7f9fb; --card: #ffffff; --muted: #6b7280; --text: #111827; --accent: #0ea5a4; --surface-shadow: 0 6px 18px rgba(16,24,40,0.08)}
        .pos-style { display: grid; grid-template-columns: 180px 1fr 380px; gap: 20px; padding: 20px; background: var(--bg); min-height: 100vh; }
        .left-nav { display: flex; flex-direction: column; gap: 18px; padding: 18px; align-items: flex-start; background: transparent; }
        .brand { font-weight: 700; color: var(--text); font-size: 18px; display: inline-flex; align-items: center; gap: 8px; }
        .nav-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .nav-item { width: 100%; text-align: left; padding: 12px 14px; border-radius: 12px; background: transparent; border: 0; color: var(--text); font-weight: 600; display: inline-flex; align-items: center; gap: 8px; }
        .nav-item.active { background: rgba(255,138,0,0.08); color: var(--text); box-shadow: 0 8px 18px rgba(255,138,0,0.06); }
        .nav-footer { margin-top: auto; width: 100%; display: flex; flex-direction: column; gap: 6px; }
        .user-pill { padding: 10px 12px; border-radius: 12px; background: var(--card); box-shadow: var(--surface-shadow); color: var(--text); font-size: 13px; }
        .center-panel { display: flex; flex-direction: column; gap: 16px; }
        .search-row { display: flex; gap: 8px; }
        .search-input { flex: 1; padding: 12px 14px; border-radius: 12px; border: 1px solid #e6e9ee; background: var(--card); color: var(--text); box-shadow: var(--surface-shadow); }
        .search-actions { display: flex; align-items: center; }
        .category-chips { display: flex; gap: 8px; overflow-x: auto; }
        .chip { padding: 8px 12px; border-radius: 999px; background: transparent; border: 1px solid #eef2f7; color: hsl(var(--foreground)); font-weight: 600; white-space: nowrap; }
        .chip.active { background: #ff8a00; color: white; border: 0; box-shadow: 0 10px 22px rgba(255,138,0,0.12); }
        .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
        .product-card { padding: 16px; display: flex; flex-direction: column; gap: 10px; background: var(--card); border-radius: 14px; box-shadow: var(--surface-shadow); border: 1px solid #f1f5f9; }
        .product-img { width: 100%; height: 140px; object-fit: cover; border-radius: 12px; background: #f3f4f6; }
        .product-body h4 { margin: 0; color: var(--text); }
        .product-body .muted { margin: 0; color: var(--muted); font-size: 13px; }
        .product-meta { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .quantity-control { display: inline-flex; align-items: center; gap: 6px; }
        .quantity-label { min-width: 24px; text-align: center; font-weight: 700; }
        .orders-list { display: grid; gap: 12px; }
        .order-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px; background: var(--card); border-radius: 14px; border: 1px solid #eef2f7; box-shadow: var(--surface-shadow); }
        .order-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(14,165,164,0.12); }
        .order-card-title { font-weight: 700; }
        .order-card-subtitle { color: var(--muted); font-size: 13px; margin-top: 4px; }
        .order-sidebar { display: flex; flex-direction: column; gap: 14px; padding: 18px; background: var(--card); border-radius: 14px; box-shadow: var(--surface-shadow); border: 1px solid #f3f6fb; }
        .order-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .tables-quick { display: flex; gap: 8px; flex-wrap: wrap; }
        .mobile-table-picker { display: none; }
        .desktop-table-picker { display: flex; }
        .table-btn { padding: 10px 12px; border-radius: 12px; border: 1px solid #eef2f7; background: transparent; color: hsl(var(--foreground)); font-weight: 600; }
        .table-btn.active { background: #ff8a00; color: white; border-color: transparent; box-shadow: 0 12px 26px rgba(255,138,0,0.14); }
        .order-items { max-height: 46vh; overflow: auto; display: grid; gap: 10px; }
        .order-item { display: flex; justify-content: space-between; gap: 12px; padding: 14px; border-radius: 14px; background: #fbfdfe; border: 1px solid #f3f6fb; align-items: center; }
        .order-item-name { font-weight: 700; }
        .order-item-meta { color: var(--muted); font-size: 13px; margin-top: 6px; }
        .order-item-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .notification-box { border-radius: 14px; border: 1px solid #eef2f7; background: #ffffff; padding: 14px; box-shadow: var(--surface-shadow); }
        .notification-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
        .notification-item { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7; cursor: pointer; }
        .notification-item.unread { background: #eef9ff; }
        .notification-item.read { opacity: 0.7; }
        .notification-item strong { display: block; }
        .notification-item p { margin: 0; font-size: 13px; color: var(--muted); }
        .order-footer { margin-top: 8px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .total { display: flex; flex-direction: column; gap: 4px; color: var(--text); }
        .btn-link { background: transparent; color: var(--accent); border: 0; padding: 0; cursor: pointer; font-weight: 700; }
        .empty-msg { color: var(--muted); padding: 20px 0; text-align: center; }
        .notif-badge { position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; font-size: 11px; padding: 2px 6px; border-radius: 999px; }
        .muted { color: var(--muted); }
        @media (max-width: 900px) {
          .pos-style { grid-template-columns: 1fr; padding: 12px; }
          .left-nav { display: none; }
          .order-sidebar { position: relative; width: 100%; }
          .desktop-table-picker { display: none; }
          .mobile-table-picker { display: flex; overflow-x: auto; gap: 0.5rem; padding-bottom: 0.5rem; flex-direction: column; }
          .mobile-table-picker .table-dropdown { width: 100%; margin-bottom: 0.75rem; }
          .mobile-table-picker .table-btn { min-width: 90px; white-space: nowrap; }
          .mobile-table-picker .table-btn { display: none; }
          .category-select { display: none; }
        }

        @media (max-width: 640px) {
          .search-row { flex-direction: column; align-items: stretch; }
          .search-actions { width: 100%; display: flex; justify-content: flex-end; }
          .search-input { width: 100%; }
          .category-chips { gap: 8px; overflow-x: auto; padding-bottom: 0.5rem; -webkit-overflow-scrolling: touch; }
          .category-select { display: block; width: 100%; margin-bottom: 0.5rem; }
          .category-chips { display: none; }
          .chip { flex: 0 0 auto; }
          .product-grid { grid-template-columns: 1fr; }
          .product-card { padding: 14px; }
          .product-img { height: 180px; }
          .order-header { flex-direction: column; align-items: stretch; gap: 10px; }
          .order-item-actions { flex-wrap: wrap; justify-content: flex-end; }
          .order-footer { flex-direction: column; align-items: stretch; }
          .order-footer .total { flex-direction: row; justify-content: space-between; }
          .order-footer .btn { width: 100%; }
          .mobile-table-picker { gap: 0.4rem; }
          .table-btn { min-width: 85px; }
        }
      `}</style>
    </div>
  );
};

export default POSWaiterLayout;
