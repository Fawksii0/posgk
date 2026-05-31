import { useState } from 'react';
import Uicon from './Uicon';

const POSWaiterLayout = ({
  onAddOrder,
  waiterName,
  tables = [],
  categories = [],
  menuItems = [],
  orders,
  notifications,
  unreadCount,
  onMarkNotificationAsRead
}) => {
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(categories && categories.length > 0 ? categories[0].id : '');
  const [currentOrder, setCurrentOrder] = useState([]);

  // reference optional props to avoid eslint no-unused-vars when not yet used
  void orders;
  void notifications;
  void onMarkNotificationAsRead;

  const addToOrder = (item) => setCurrentOrder(prev => [...prev, item]);
  const removeFromOrder = (idx) => setCurrentOrder(prev => prev.filter((_, i) => i !== idx));
  const calculateTotal = () => currentOrder.reduce((acc, it) => acc + (Number(it.price) || 0), 0).toFixed(2);

  const renderIcon = (icon) => {
    if (!icon) return null;
    return typeof icon === 'string' && icon.includes('fi-')
      ? <Uicon icon={icon} className="cat-icon" />
      : <span className="cat-icon">{icon}</span>;
  };

  const submitOrder = () => {
    if (!selectedTable) return; // guard
    if (currentOrder.length === 0) return;
    onAddOrder({ table: selectedTable, items: currentOrder, total: calculateTotal() });
    setCurrentOrder([]);
    setSelectedTable(null);
  };

  return (
    <div className="waiter-grid pos-style">
      <aside className="left-nav">
        <div className="brand"><Uicon icon="fi-rr-bowl-food" className="brand-icon" title="Service menu" /></div>
        <nav className="nav-list">
          <button className="nav-item active">Menu</button>
        </nav>
        <div className="nav-footer">
          <div className="user-pill">{waiterName} {unreadCount ? `• ${unreadCount} new` : ''}</div>
        </div>
      </aside>

      <section className="center-panel">
        <div className="search-row">
          <input className="search-input" placeholder="Search product here..." />
          <div className="search-actions">
            <button className="btn btn-secondary"><Uicon icon="fi-rr-menu-burger" /></button>
          </div>
        </div>

        <div className="category-chips">
          {(categories || []).map(cat => (
            <button key={cat.id} className={`chip ${selectedCategory === cat.id ? 'active' : ''}`} onClick={() => setSelectedCategory(cat.id)}>{renderIcon(cat.icon)} {cat.name}</button>
          ))}
        </div>

        <div className="product-grid">
          {(menuItems || []).filter(item => item.category === selectedCategory).map(item => (
            <div key={item.id} className="product-card">
              {item.image && <img src={item.image} alt={item.name} className="product-img" />}
              <div className="product-body">
                <h4>{item.name}</h4>
                <p className="muted">{item.description}</p>
                <div className="product-meta">
                  <strong>{(Number(item.price) || 0).toFixed(2)} MAD</strong>
                  <button className="btn btn-primary add-small" onClick={() => addToOrder(item)}>Add</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="order-sidebar">
        <div className="order-header">
          <h3>Table {selectedTable || '-'}</h3>
          <small>Waiter: {waiterName}</small>
        </div>
        <div className="tables-quick">
          {(tables || []).map(t => (
            <button key={t.id} className={`table-btn ${selectedTable === t.name ? 'active' : ''}`} onClick={() => setSelectedTable(t.name)}>{t.name}</button>
          ))}
        </div>

        <div className="order-items">
          {currentOrder.length === 0 ? (
            <p className="empty-msg">No items selected</p>
          ) : (
            currentOrder.map((item, idx) => (
              <div key={idx} className="order-item">
                <span>{item.name}</span>
                <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                  <span>{(Number(item.price) || 0).toFixed(2)} MAD</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => removeFromOrder(idx)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="order-footer">
          <div className="total">
            <span>Total</span>
            <span>{calculateTotal()} MAD</span>
          </div>
          <button className="btn btn-primary submit-btn" onClick={submitOrder} disabled={!selectedTable || currentOrder.length === 0}>Place Order</button>
        </div>
      </aside>

      <style jsx>{`
        :root{ --bg: #f7f9fb; --card:#ffffff; --muted:#6b7280; --text:#111827; --accent: #0ea5a4; --surface-shadow: 0 6px 18px rgba(16,24,40,0.08)}
        .pos-style { display:grid; grid-template-columns: 140px 1fr 380px; gap:20px; padding:20px; background:var(--bg); min-height:100vh }
        .left-nav { display:flex; flex-direction:column; gap:18px; padding:18px; align-items:flex-start; background:transparent }
        .brand { font-weight:700; color:var(--text); font-size:18px }
        .nav-list { display:flex; flex-direction:column; gap:8px; width:100% }
        .nav-item { width:100%; text-align:left; padding:10px 12px; border-radius:12px; background:transparent; border:0; color:var(--text); font-weight:600 }
        .nav-item.active { background: linear-gradient(135deg, rgba(14,165,164,0.22), rgba(16,185,129,0.16)); color: var(--text); box-shadow: 0 10px 24px rgba(14,165,164,0.08) }
        .nav-footer { margin-top:auto; width:100%; display:flex; flex-direction:column; gap:6px }
        .user-pill { padding:8px 10px; border-radius:12px; background:var(--card); box-shadow: var(--surface-shadow); color:var(--text); font-size:13px }
        .center-panel { display:flex; flex-direction:column; gap:16px }
        .search-row { display:flex; gap:8px }
        .search-input { flex:1; padding:12px 14px; border-radius:12px; border:1px solid #e6e9ee; background:var(--card); color:var(--text); box-shadow: var(--surface-shadow) }
        .category-chips { display:flex; gap:8px; overflow:auto }
        .chip { padding:8px 12px; border-radius:999px; background:transparent; border:1px solid #eef2f7; color:hsl(var(--foreground)); font-weight:600 }
        .chip.active { background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary))); color:white; border:0; box-shadow: 0 12px 28px rgba(14,165,164,0.18) }
        .product-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:16px }
        .product-card { padding:12px; display:flex; flex-direction:column; gap:10px; background:var(--card); border-radius:12px; box-shadow: var(--surface-shadow); border:1px solid #f1f5f9 }
        .product-img { width:100%; height:140px; object-fit:cover; border-radius:10px; background:#f3f4f6 }
        .product-body h4 { margin:0; color:var(--text) }
        .product-body .muted { margin:0; color:var(--muted); font-size:13px }
        .product-meta { display:flex; justify-content:space-between; align-items:center }
        .add-small { padding:8px 10px; border-radius:8px; background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary))); color:white; border:0; box-shadow: 0 12px 28px rgba(14,165,164,0.18) }
        .order-sidebar { display:flex; flex-direction:column; gap:12px; padding:18px; background:var(--card); border-radius:12px; box-shadow: var(--surface-shadow); border:1px solid #f3f6fb }
        .tables-quick { display:flex; gap:8px; flex-wrap:wrap }
        .table-btn { padding:8px 10px; border-radius:10px; border:1px solid #eef2f7; background:transparent; color:hsl(var(--foreground)); font-weight:600 }
        .table-btn.active { background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary))); color: white; border-color: transparent; box-shadow: 0 14px 30px rgba(14,165,164,0.18) }
        .order-items { max-height:55vh; overflow:auto; display:grid; gap:10px }
        .order-item { display:flex; justify-content:space-between; padding:10px; border-radius:10px; background:#fbfdfe; border:1px solid #f3f6fb }
        .order-footer { margin-top:12px; display:flex; justify-content:space-between; align-items:center }
        .btn { padding:10px 14px; border-radius:10px; border:0; cursor:pointer }
        .btn-primary { background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary))); color:white; box-shadow: 0 14px 30px rgba(14,165,164,0.18) }
        .btn-secondary { background:transparent; border:1px solid #e8eef2; color:hsl(var(--foreground)) }
        .btn-sm { padding:6px 8px; font-size:13px }
        .muted { color:var(--muted) }
        @media (max-width: 900px) { .pos-style { grid-template-columns: 1fr; padding:12px } .left-nav { display:none } }
      `}</style>
    </div>
  );
}

export default POSWaiterLayout;
