import { useState } from 'react';

const WaiterInterface = ({ onAddOrder, waiterName, tables, categories, menuItems }) => {
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(categories && categories.length > 0 ? categories[0].id : '');
  const [currentOrder, setCurrentOrder] = useState([]);

  // Auto-correct category selection if categories state was loaded late or updated
  useState(() => {
    if (categories && categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories]);

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
      alert('Please select a table first!');
      return;
    }
    if (currentOrder.length === 0) {
      alert('Order is empty!');
      return;
    }

    onAddOrder({
      table: selectedTable,
      items: currentOrder,
      total: calculateTotal(),
    });

    setCurrentOrder([]);
    setSelectedTable(null);
    alert(`Order for ${selectedTable} sent to cashier!`);
  };

  const activeCategory = selectedCategory || (categories && categories.length > 0 ? categories[0].id : '');

  return (
    <div className="waiter-grid">
      <div className="tables-section glass-card">
        <h3>Select Table</h3>
        <div className="table-map">
          {(tables || []).map(table => (
            <button
              key={table.id}
              className={`table-btn ${selectedTable === table.name ? 'active' : ''}`}
              onClick={() => setSelectedTable(table.name)}
            >
              {table.name}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <div className="categories glass">
          {(categories || []).map(cat => (
            <button
              key={cat.id}
              className={`cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span>{cat.icon}</span> {cat.name}
            </button>
          ))}
        </div>
        
        <div className="items-grid">
          {(menuItems || []).filter(item => item.category === activeCategory).map(item => (
            <div key={item.id} className="item-card glass-card" onClick={() => addToOrder(item)}>
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
                <button className="btn btn-secondary add-btn">+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="order-sidebar glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Current Order {selectedTable && <span className="table-tag">T{selectedTable}</span>}</h3>
          <small style={{ opacity: 0.6 }}>Waiter: {waiterName}</small>
        </div>
        <div className="order-items">
          {currentOrder.length === 0 ? (
            <p className="empty-msg">No items selected</p>
          ) : (
            currentOrder.map((item, idx) => (
              <div key={idx} className="order-item" onClick={() => removeFromOrder(idx)}>
                <span>{item.name}</span>
                <span>{item.price.toFixed(2)} MAD</span>
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
            Send to Cashier
          </button>
        </div>
      </div>

      <style jsx>{`
        .waiter-grid {
          display: grid;
          grid-template-columns: 250px 1fr 300px;
          gap: 2rem;
          height: calc(100vh - var(--header-height) - 4rem);
        }
        
        h3 { margin-bottom: 1.5rem; color: hsl(var(--accent)); }

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
          transition: all 0.2s;
        }
        .table-btn:hover { border-color: hsl(var(--accent)); }
        .table-btn.active { 
          background: hsl(var(--accent)); 
          color: hsl(var(--background));
          box-shadow: 0 0 15px hsl(var(--accent) / 0.5);
          border-color: hsl(var(--accent));
        }

        /* Menu */
        .menu-section { display: flex; flex-direction: column; gap: 1.5rem; overflow: hidden; }
        .categories { 
          display: flex; 
          gap: 0.5rem; 
          padding: 0.5rem; 
          border-radius: calc(var(--radius) / 1.5) !important;
          overflow-x: auto;
        }
        .cat-btn {
          padding: 0.5rem 1rem;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: white;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: 0.2s;
        }
        .cat-btn.active { background: var(--glass-border); border: 1px solid hsla(38, 75%, 55%, 0.3); }
        
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
        .add-btn { position: absolute; bottom: 1rem; right: 1rem; padding: 0.25rem 0.6rem; font-size: 0.9rem; }

        /* Order Sidebar */
        .order-sidebar { display: flex; flex-direction: column; }
        .order-items { flex: 1; overflow-y: auto; margin-bottom: 1.5rem; }
        .order-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--glass-border);
          font-size: 0.9rem;
          cursor: pointer;
        }
        .order-item:hover { color: #ff6b6b; text-decoration: line-through; }
        .empty-msg { opacity: 0.5; text-align: center; margin-top: 2rem; }
        .order-footer { border-top: 1px solid var(--glass-border); padding-top: 1.5rem; }
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
          .waiter-grid { grid-template-columns: 1fr; height: auto; }
          .order-sidebar { position: fixed; bottom: 1rem; right: 2rem; left: 2rem; height: 300px; z-index: 50; }
        }
      `}</style>
    </div>
  );
};

export default WaiterInterface;
