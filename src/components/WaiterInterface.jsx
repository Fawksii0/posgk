import { useState } from 'react';
import Uicon from './Uicon';

const WaiterInterface = ({
  onAddOrder,
  waiterName,
  tables,
  categories,
  menuItems,
  orders,
  notifications,
  unreadCount,
  onMarkNotificationAsRead
}) => {
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(categories && categories.length > 0 ? categories[0].id : '');
  const [currentOrder, setCurrentOrder] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');

  const renderIcon = (icon) => {
    if (!icon) return null;
    return typeof icon === 'string' && icon.includes('fi-')
      ? <Uicon icon={icon} className="cat-icon" />
      : <span className="cat-icon">{icon}</span>;
  };

  const addToOrder = (item) => {
    setCurrentOrder([...currentOrder, item]);
  };

  const removeFromOrder = (index) => {
    const newOrder = [...currentOrder];
    newOrder.splice(index, 1);
    setCurrentOrder(newOrder);
  };

  const calculateTotal = () => {
    return currentOrder.reduce((acc, item) => acc + item.price, 0).toFixed(2);
  };

  const submitOrder = () => {
    if (!selectedTable) {
      setOrderMessage('Please select a table first.');
      return;
    }
    if (currentOrder.length === 0) {
      setOrderMessage('Add at least one item before sending.');
      return;
    }

    const result = onAddOrder({
      table: selectedTable,
      items: currentOrder,
      total: calculateTotal(),
    });

    setCurrentOrder([]);
    setSelectedTable(null);
    setOrderMessage(result?.type === 'edit'
      ? `Items added to ${selectedTable} and cashier notified!`
      : `Order for ${selectedTable} sent to cashier!`
    );
  };

  const categoryExists = (categories || []).some(cat => cat.id === selectedCategory);
  const activeCategory = categoryExists ? selectedCategory : (categories && categories.length > 0 ? categories[0].id : '');
  const activeTableOrder = selectedTable
    ? (orders || []).find(order => order.table === selectedTable && order.status !== 'paid')
    : null;

  return (
    <div className="waiter-grid">
      <div className="waiter-notifications glass-card">
        <button
          className="notification-toggle"
          onClick={() => setShowNotifications(!showNotifications)}
          type="button"
        >
          <span>Notifications</span>
          <strong>{unreadCount || 0} new</strong>
        </button>

        {showNotifications && (
          <div className="waiter-notification-list">
            {(notifications || []).length === 0 ? (
              <p className="empty-msg">No ready orders yet</p>
            ) : (
              notifications.map(notif => (
                <button
                  key={notif.id}
                  className={`waiter-notification ${notif.read ? 'read' : 'unread'}`}
                  onClick={() => onMarkNotificationAsRead(notif.id)}
                  type="button"
                >
                  <span>{notif.title || `Ready - ${notif.table}`}</span>
                  <small>{notif.message} · {notif.timestamp}</small>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="tables-section glass-card">
        <h3>Select Table</h3>
        <select
          className="table-dropdown glass-input"
          value={selectedTable || ''}
          onChange={(e) => setSelectedTable(e.target.value)}
          aria-label="Select table"
        >
          <option value="">Select table</option>
          {(tables || []).map(table => (
            <option key={table.id} value={table.name}>{table.name}</option>
          ))}
        </select>
        <div className="table-map">
          {(tables || []).map(table => (
            <button
              key={table.id}
              className={`table-btn ${selectedTable === table.name ? 'active' : ''}`}
              onClick={() => setSelectedTable(table.name)}
              type="button"
            >
              <Uicon icon="fi-rr-tablet" className="uicon-sm" title="Table" />
              {table.name}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <div className="category-picker glass">
          <label>Menu Category</label>
          <div className="category-selector">
            {(categories || []).map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`category-choice ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <Uicon icon={cat.icon} className="category-icon" title={cat.name} />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="items-grid">
          {(menuItems || []).filter(item => item.category === activeCategory).map(item => (
            <button key={item.id} className="item-card glass-card" onClick={() => addToOrder(item)} type="button">
              {item.image && (
                <div className="item-image-wrapper">
                  <img src={item.image} alt={item.name} className="item-image" />
                </div>
              )}
              <div className="item-content-wrapper">
                <div className="item-header">
                  <h4>{item.name}</h4>
                  <span className="price">{item.price.toFixed(2)} MAD</span>
                </div>
                <p>{item.description}</p>
                <span className="btn btn-secondary add-btn">+</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="order-sidebar glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Current Order {selectedTable && <span className="table-tag">{selectedTable}</span>}</h3>
          <small style={{ opacity: 0.6 }}>Waiter: {waiterName}</small>
        </div>
        {activeTableOrder && (
          <div className="edit-hint">
            Adding to existing {activeTableOrder.status} order for {activeTableOrder.table}.
          </div>
        )}
        {orderMessage && (
          <div className="order-message">
            {orderMessage}
          </div>
        )}
        <div className="order-items">
          {currentOrder.length === 0 ? (
            <p className="empty-msg">No items selected</p>
          ) : (
            currentOrder.map((item, idx) => (
              <button key={idx} className="order-item" onClick={() => removeFromOrder(idx)} type="button">
                <span>{item.name}</span>
                <span>{item.price.toFixed(2)} MAD</span>
              </button>
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
            {activeTableOrder ? 'Add Items & Notify Cashier' : 'Send to Cashier'}
          </button>
        </div>
      </div>

      <style jsx>{`

        .waiter-grid {
          display: grid;
          grid-template-columns: 250px 1fr 300px;
          gap: 2rem;
          height: calc(100vh - var(--header-height) - 4rem);
          min-height: 0;
        }

        .waiter-notifications {
          grid-column: 1 / -1;
          padding: 0.85rem !important;
        }

        .table-dropdown {
          display: none;
          width: 100%;
          margin-bottom: 1rem;
        }

        .notification-toggle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          min-height: 44px;
          border: 0;
          background: transparent;
          color: white;
          font: inherit;
          cursor: pointer;
          text-align: left;
        }

        .notification-toggle strong {
          color: hsl(var(--accent));
        }

        .waiter-notification-list {
          display: grid;
          gap: 0.6rem;
          margin-top: 0.75rem;
        }

        .waiter-notification {
          display: grid;
          gap: 0.25rem;
          padding: 0.75rem;
          border-radius: 10px;
          border: 1px solid var(--glass-border);
          background: hsl(var(--card));
          color: white;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }

        .waiter-notification.unread {
          border-color: hsl(var(--accent));
          box-shadow: 0 0 14px hsl(var(--accent) / 0.2);
        }

        .waiter-notification small {
          opacity: 0.7;
          line-height: 1.35;
        }
        
        h3 { margin-bottom: 1.5rem; color: hsl(var(--accent)); }

        .category-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-top: 0.75rem;
        }

        .category-choice {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border: 1px solid var(--glass-border);
          color: hsl(var(--foreground));
          background: transparent;
          border-radius: 999px;
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 600;
          min-height: 44px;
        }

        .category-choice.active {
          background: #ff8a00;
          border-color: transparent;
          color: white;
          box-shadow: 0 10px 20px rgba(255, 138, 0, 0.16);
        }

        .category-icon {
          width: 1rem;
          height: 1rem;
          color: inherit;
        }

        .table-btn .uicon-sm {
          margin-right: 0.35rem;
        }

        /* Tables */
        .table-map {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
        }
        .table-btn {
          min-height: 54px;
          padding: 0.5rem;
          font-size: 0.85rem;
          word-break: break-word;
          border-radius: 12px;
          border: 1px solid var(--glass-border);
          background: var(--glass-bg);
          color: white;
          font-weight: 600;
          cursor: pointer;
          touch-action: manipulation;
          transition: all 0.2s;
        }
        .table-btn:hover { border-color: hsl(var(--accent)); }
        .table-btn.active { 
          background: #ff8a00;
          color: white;
          box-shadow: 0 12px 26px rgba(255, 138, 0, 0.16);
          border-color: transparent;
        }

        .btn-primary {
          background: #ff8a00;
          color: white;
          border-color: transparent;
          box-shadow: 0 12px 28px rgba(255, 138, 0, 0.14);
        }

        .submit-btn {
          width: 100%;
          padding: 1rem 1.25rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .add-btn {
          background: #ff8a00;
          color: white;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 24px rgba(255,138,0,0.12);
          pointer-events: none;
        }

        /* Menu */
        .menu-section { display: flex; flex-direction: column; gap: 1.5rem; overflow: hidden; }
        .category-picker {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem;
          border-radius: calc(var(--radius) / 1.5) !important;
        }

        .category-picker label {
          color: white;
          font-size: 0.86rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .category-select {
          width: 100%;
          min-height: 46px;
          padding: 0.55rem 2.25rem 0.55rem 0.8rem;
          border-radius: 10px;
          border: 1px solid var(--glass-border);
          background: hsl(var(--card));
          color: white;
          font: inherit;
          font-weight: 650;
        }
        
        .items-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); 
          gap: 1.25rem; 
          overflow-y: auto;
          padding-right: 0.5rem;
        }
        
        /* Premium Card Layout with Images */
        .item-card { 
          cursor: pointer; 
          padding: 0 !important; 
          position: relative; 
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--glass-border);
          color: inherit;
          text-align: left;
          width: 100%;
          touch-action: manipulation;
        }
        
        .item-image-wrapper {
          height: 130px;
          width: 100%;
          overflow: hidden;
          position: relative;
          border-bottom: 1px solid var(--glass-border);
        }
        
        .item-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s cubic-bezier(0.165, 0.84, 0.44, 1);
        }
        
        .item-card:hover .item-image {
          transform: scale(1.1);
        }
        
        .item-content-wrapper {
          padding: 1rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .item-card h4 { font-size: 1.05rem; font-weight: 700; color: white; }
        .item-card p { font-size: 0.8rem; opacity: 0.65; line-height: 1.35; flex: 1; }
        .item-header { display: flex; justify-content: space-between; align-items: start; gap: 0.5rem; }
        .price { font-weight: 750; color: hsl(var(--accent)); font-size: 1.05rem; }
        .add-btn {
          position: absolute;
          bottom: 1rem;
          right: 1rem;
          min-width: 34px;
          min-height: 34px;
          padding: 0;
          justify-content: center;
          font-size: 1rem;
          pointer-events: none;
        }

        /* Order Sidebar */
        .order-sidebar { display: flex; flex-direction: column; }
        .order-items { flex: 1; overflow-y: auto; margin-bottom: 1.5rem; }
        .order-item {
          display: flex;
          justify-content: space-between;
          width: 100%;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--glass-border);
          border-top: 0;
          border-left: 0;
          border-right: 0;
          background: transparent;
          color: white;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          touch-action: manipulation;
        }
        .order-item:hover { color: #ff6b6b; text-decoration: line-through; }
        .empty-msg { opacity: 0.5; text-align: center; margin-top: 2rem; }
        .order-footer { border-top: 1px solid var(--glass-border); padding-top: 1.5rem; }
        .edit-hint {
          margin-bottom: 0.85rem;
          padding: 0.65rem;
          border-radius: 9px;
          background: hsl(var(--accent) / 0.14);
          color: hsl(var(--accent));
          font-size: 0.82rem;
          font-weight: 700;
        }
        .order-message {
          margin-bottom: 0.85rem;
          padding: 0.65rem;
          border-radius: 9px;
          background: hsl(140 70% 35% / 0.22);
          color: hsl(140 70% 70%);
          font-size: 0.82rem;
          font-weight: 700;
        }
        .total { display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 700; color: white; margin-bottom: 1.5rem; }
        .submit-btn { width: 100%; justify-content: center; padding: 1rem; }
        .table-tag { 
          font-size: 0.8rem; 
          background: hsl(var(--accent) / 0.15); 
          color: hsl(var(--accent)); 
          padding: 0.2rem 0.5rem; 
          border-radius: 5px;
          margin-left: 0.5rem;
        }

        @media (max-width: 1024px) {
          .waiter-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 1rem;
            height: auto;
            padding-bottom: max(1rem, env(safe-area-inset-bottom));
          }

          .table-dropdown {
            display: block;
          }

          .tables-section {
            order: 2;
          }

          .menu-section {
            order: 3;
            overflow: visible;
          }

          .order-sidebar {
            order: 4;
            position: static;
            max-height: none;
            z-index: auto;
            width: 100%;
          }

          .waiter-notifications {
            order: 1;
          }

          .order-items {
            min-height: 70px;
          }

          .category-selector {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 0.35rem;
            -webkit-overflow-scrolling: touch;
          }

          .category-choice {
            flex: 0 0 auto;
          }
        }

        @media (max-width: 768px) {
          .waiter-grid {
            gap: 0.75rem;
          }

          h3 {
            margin-bottom: 0.75rem;
          }

          .tables-section {
            padding: 0.85rem !important;
          }

          .table-map {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: minmax(110px, 1fr);
            gap: 0.5rem;
            overflow-x: auto;
            padding-bottom: 0.5rem;
          }

          .table-btn {
            min-height: 48px;
            border-radius: 10px;
            font-size: 0.78rem;
            min-width: 110px;
            white-space: nowrap;
          }

          .category-picker {
            position: static;
            margin: 0;
            padding: 0.45rem 0;
            grid-template-columns: 1fr;
            gap: 0.35rem;
          }

          .category-selector {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 0.35rem;
          }

          .category-choice {
            flex: 0 0 auto;
          }

          .category-picker label {
            font-size: 0.78rem;
          }

          .category-select {
            font-size: 16px;
          }

          .items-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.7rem;
            overflow: visible;
            padding-right: 0;
          }

          .item-image-wrapper {
            height: 92px;
          }

          .item-content-wrapper {
            padding: 0.75rem;
            min-height: 132px;
          }

          .item-card h4 {
            font-size: 0.9rem;
            line-height: 1.15;
          }

          .item-card p {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            font-size: 0.74rem;
          }

          .price {
            font-size: 0.86rem;
          }

          .add-btn {
            bottom: 0.65rem;
            right: 0.65rem;
          }

          .order-sidebar {
            margin: 0 -0.25rem;
            border-radius: 14px 14px 0 0 !important;
          }
        }

        @media (max-width: 420px) {
          .table-map {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: minmax(100px, 1fr);
            overflow-x: auto;
            gap: 0.5rem;
            padding-bottom: 0.5rem;
          }

          .item-card {
            display: grid;
            grid-template-columns: 1fr;
          }

          .item-image-wrapper {
            height: 160px;
            min-height: auto;
            border-bottom: 1px solid var(--glass-border);
            border-right: 0;
          }

          .item-content-wrapper {
            min-height: 0;
          }

          .items-grid {
            grid-template-columns: 1fr;
          }

          .order-footer {
            gap: 0.75rem;
          }

          .submit-btn {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default WaiterInterface;
