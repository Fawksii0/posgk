import { useState } from 'react';

const CashierDashboard = ({ 
  orders, 
  waiters, 
  tables, 
  categories,
  menuItems, 
  notifications,
  unreadCount,
  onUpdateWaiters, 
  onUpdateTables, 
  onUpdateCategories,
  onUpdateMenuItems, 
  onUpdateStatus, 
  onDeleteOrder,
  onMarkNotificationAsRead,
  onSendWhatsAppNotification
}) => {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'menu' | 'staff' | 'settings'
  const [menuSubTab, setMenuSubTab] = useState('items'); // 'items' | 'categories'
  const [showNotifications, setShowNotifications] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'dine_in' | 'delivery_direct' | 'glovo' | 'phone'
  
  // Waiter states
  const [newWaiterName, setNewWaiterName] = useState('');
  const [newWaiterPin, setNewWaiterPin] = useState('');
  const [editingWaiter, setEditingWaiter] = useState(null); // Waiter object being edited
  const [waiterError, setWaiterError] = useState('');

  // Menu item states
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('starters');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [editingMenuItem, setEditingMenuItem] = useState(null); // Menu item being edited
  const [menuError, setMenuError] = useState('');

  // Category states
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🍽️');
  const [editingCategory, setEditingCategory] = useState(null); // Category being edited
  const [categoryError, setCategoryError] = useState('');
  const [categorySuccess, setCategorySuccess] = useState('');

  // Table states
  const [newTableName, setNewTableName] = useState('');
  const [editingTable, setEditingTable] = useState(null); // Table object being edited
  const [tableError, setTableError] = useState('');
  const [tableSuccess, setTableSuccess] = useState('');

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'var(--accent)';
      case 'ready': return 'var(--primary)';
      case 'paid': return 'hsl(140, 70%, 50%)';
      default: return 'gray';
    }
  };

  const sendToWhatsApp = (order) => {
    const itemsText = order.items.map(item => `- ${item.name} (${item.price.toFixed(2)} MAD)`).join('%0A');
    const message = `*Order Confirmation - Table: ${order.table}*%0A%0AServed by Waiter: ${order.waiterName || 'Staff'}%0A%0AItems:%0A${itemsText}%0A%0A*Total: ${order.total} MAD*%0AStatus: ${order.status.toUpperCase()}`;
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  // Waiter CRUD
  const handleAddWaiter = (e) => {
    e.preventDefault();
    if (!newWaiterName || !newWaiterPin) {
      setWaiterError('Please fill out all fields.');
      return;
    }
    if (newWaiterPin.length !== 4 || isNaN(newWaiterPin)) {
      setWaiterError('PIN must be exactly 4 numbers.');
      return;
    }
    if (waiters.some(w => w.pin === newWaiterPin)) {
      setWaiterError('This PIN is already assigned to another waiter.');
      return;
    }

    const newWaiter = {
      id: Date.now(),
      name: newWaiterName,
      pin: newWaiterPin,
      ordersCount: 0
    };

    onUpdateWaiters([...waiters, newWaiter]);
    setNewWaiterName('');
    setNewWaiterPin('');
    setWaiterError('');
  };

  const handleUpdateWaiter = (e) => {
    e.preventDefault();
    if (!editingWaiter.name || !editingWaiter.pin) {
      setWaiterError('Please fill out all fields.');
      return;
    }
    if (editingWaiter.pin.length !== 4 || isNaN(editingWaiter.pin)) {
      setWaiterError('PIN must be exactly 4 numbers.');
      return;
    }
    if (waiters.some(w => w.pin === editingWaiter.pin && w.id !== editingWaiter.id)) {
      setWaiterError('This PIN is already assigned to another waiter.');
      return;
    }

    const updated = waiters.map(w => w.id === editingWaiter.id ? editingWaiter : w);
    onUpdateWaiters(updated);
    setEditingWaiter(null);
    setWaiterError('');
  };

  const handleDeleteWaiter = (id) => {
    if (confirm('Are you sure you want to remove this waiter?')) {
      onUpdateWaiters(waiters.filter(w => w.id !== id));
      if (editingWaiter && editingWaiter.id === id) {
        setEditingWaiter(null);
      }
    }
  };

  // Menu CRUD
  const handleAddMenuItem = (e) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) {
      setMenuError('Please enter a name and price.');
      return;
    }
    const priceNum = parseFloat(newItemPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setMenuError('Please enter a valid price.');
      return;
    }

    const newItem = {
      id: Date.now(),
      category: newItemCategory,
      name: newItemName,
      price: priceNum,
      description: newItemDescription || 'No description provided.',
      image: newItemImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'
    };

    onUpdateMenuItems([...menuItems, newItem]);
    setNewItemName('');
    setNewItemPrice('');
    setNewItemDescription('');
    setNewItemImage('');
    setMenuError('');
  };

  const handleUpdateMenuItem = (e) => {
    e.preventDefault();
    if (!editingMenuItem.name || !editingMenuItem.price) {
      setMenuError('Please enter a name and price.');
      return;
    }
    const priceNum = parseFloat(editingMenuItem.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setMenuError('Please enter a valid price.');
      return;
    }

    const updatedItem = {
      ...editingMenuItem,
      price: priceNum
    };

    const updated = menuItems.map(item => item.id === editingMenuItem.id ? updatedItem : item);
    onUpdateMenuItems(updated);
    setEditingMenuItem(null);
    setMenuError('');
  };

  const handleDeleteMenuItem = (id) => {
    if (confirm('Are you sure you want to remove this menu item?')) {
      onUpdateMenuItems(menuItems.filter(item => item.id !== id));
      if (editingMenuItem && editingMenuItem.id === id) {
        setEditingMenuItem(null);
      }
    }
  };

  // Category CRUD
  const handleAddCategory = (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      setCategoryError('Please enter a category name.');
      return;
    }
    if (categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      setCategoryError('A category with this name already exists.');
      return;
    }

    const newCategory = {
      id: newCategoryName.trim().toLowerCase().replace(/\s+/g, '_'),
      name: newCategoryName.trim(),
      icon: newCategoryIcon || '🍽️'
    };

    onUpdateCategories([...categories, newCategory]);
    setNewCategoryName('');
    setNewCategoryIcon('🍽️');
    setCategoryError('');
    setCategorySuccess('Category added successfully!');
    setTimeout(() => setCategorySuccess(''), 3000);
  };

  const handleUpdateCategory = (e) => {
    e.preventDefault();
    if (!editingCategory.name.trim()) {
      setCategoryError('Please enter a category name.');
      return;
    }
    if (categories.some(c => c.name.toLowerCase() === editingCategory.name.trim().toLowerCase() && c.id !== editingCategory.id)) {
      setCategoryError('A category with this name already exists.');
      return;
    }

    const updated = categories.map(c => c.id === editingCategory.id ? { ...editingCategory, name: editingCategory.name.trim() } : c);
    onUpdateCategories(updated);
    setEditingCategory(null);
    setCategoryError('');
    setCategorySuccess('Category updated successfully!');
    setTimeout(() => setCategorySuccess(''), 3000);
  };

  const handleDeleteCategory = (id) => {
    if (confirm('Are you sure you want to delete this category? Items in this category will not be deleted.')) {
      onUpdateCategories(categories.filter(c => c.id !== id));
      if (editingCategory && editingCategory.id === id) {
        setEditingCategory(null);
      }
    }
  };

  // Dynamic Table CRUD
  const handleAddTable = (e) => {
    e.preventDefault();
    if (!newTableName.trim()) {
      setTableError('Please enter a table name/number.');
      return;
    }
    if (tables.some(t => t.name.toLowerCase() === newTableName.trim().toLowerCase())) {
      setTableError('A table with this name already exists.');
      return;
    }

    const newTable = {
      id: Date.now(),
      name: newTableName.trim()
    };

    onUpdateTables([...tables, newTable]);
    setNewTableName('');
    setTableError('');
    setTableSuccess('Table added successfully!');
    setTimeout(() => setTableSuccess(''), 3000);
  };

  const handleUpdateTable = (e) => {
    e.preventDefault();
    if (!editingTable.name.trim()) {
      setTableError('Please enter a table name/number.');
      return;
    }
    if (tables.some(t => t.name.toLowerCase() === editingTable.name.trim().toLowerCase() && t.id !== editingTable.id)) {
      setTableError('A table with this name already exists.');
      return;
    }

    const updated = tables.map(t => t.id === editingTable.id ? { ...editingTable, name: editingTable.name.trim() } : t);
    onUpdateTables(updated);
    setEditingTable(null);
    setTableError('');
    setTableSuccess('Table updated successfully!');
    setTimeout(() => setTableSuccess(''), 3000);
  };

  const handleDeleteTable = (id) => {
    if (confirm('Are you sure you want to remove this table?')) {
      onUpdateTables(tables.filter(t => t.id !== id));
      if (editingTable && editingTable.id === id) {
        setEditingTable(null);
      }
    }
  };

  return (
    <div className="cashier-container">
      <div className="dashboard-header-tabs">
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Live Orders ({orders.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'menu' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu')}
          >
            Menu Builder
          </button>
          <button 
            className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            Staff Performance
          </button>
          <button 
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Dining Layout
          </button>
        </div>

        {activeTab === 'orders' && (
          <div className="stats">
            <div className="stat-card glass">
              <small>Total Revenue</small>
              <p>{orders.filter(o => o.status === 'paid').reduce((acc, o) => acc + parseFloat(o.total), 0).toFixed(2)} MAD</p>
            </div>
            <div className="stat-card glass" style={{ cursor: 'pointer' }} onClick={() => setShowNotifications(!showNotifications)}>
              <small>🔔 Notifications</small>
              <p>{unreadCount} New</p>
            </div>
          </div>
        )}
      </div>

      {/* TABS CONTENT */}
      {activeTab === 'orders' && (
        <>
          {/* Notifications Panel */}
          {showNotifications && (
            <div className="notifications-panel glass-card">
              <div className="notifications-header">
                <h3>📬 Order Notifications ({notifications.length})</h3>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setShowNotifications(false)}
                >
                  ✕ Close
                </button>
              </div>
              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <p className="empty-notification">No new notifications</p>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={`notification-item ${notif.read ? 'read' : 'unread'}`}
                      onClick={() => !notif.read && onMarkNotificationAsRead(notif.id)}
                    >
                      <div className="notification-content">
                        <div className="notification-title">
                          {notif.type === 'order_edit' ? '✎ Edited Order' : '🍽️ New Order'}: <strong>{notif.table}</strong>
                        </div>
                        <div className="notification-meta">
                          <span>👤 {notif.waiterName}</span>
                          <span>⏰ {notif.timestamp}</span>
                        </div>
                        <div className="notification-items">
                          {(notif.items || []).map((item, idx) => (
                            <span key={idx} className="notification-item-tag">
                              {item.name} ({item.price.toFixed(2)} MAD)
                            </span>
                          ))}
                        </div>
                        <div className="notification-total">
                          💰 Total: <strong>{notif.total} MAD</strong>
                        </div>
                      </div>
                      <div className="notification-actions">
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSendWhatsAppNotification(notif);
                          }}
                        >
                          📱 Send WhatsApp
                        </button>
                        {!notif.read && (
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkNotificationAsRead(notif.id);
                            }}
                          >
                            ✓ Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Order Source Filter */}
          <div className="order-filter-bar glass-card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button 
              className={`btn ${sourceFilter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSourceFilter('all')}
            >
              📊 All
            </button>
            <button 
              className={`btn ${sourceFilter === 'dine_in' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSourceFilter('dine_in')}
            >
              🍽️ Dine-in
            </button>
            <button 
              className={`btn ${sourceFilter === 'delivery_direct' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSourceFilter('delivery_direct')}
            >
              🚗 Direct Delivery
            </button>
            <button 
              className={`btn ${sourceFilter === 'glovo' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSourceFilter('glovo')}
            >
              🟢 Glovo
            </button>
            <button 
              className={`btn ${sourceFilter === 'phone' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSourceFilter('phone')}
            >
              ☎️ Phone
            </button>
          </div>

          {/* Live Orders Grid */}
          <div className="orders-grid">
          {orders.length === 0 ? (
            <div className="empty-state glass-card">
              <p>No active orders at the moment.</p>
            </div>
          ) : (
            orders
              .filter(order => {
                if (sourceFilter === 'all') return true;
                return (order.source || 'dine_in') === sourceFilter;
              })
              .map(order => (
              <div key={order.id} className="order-card glass-card" style={{ borderLeft: `4px solid ${getStatusColor(order.status)}` }}>
                <div className="order-card-header">
                  <div>
                    <h3>{order.table}</h3>
                    <small className="waiter-name">Waiter: {order.waiterName}</small>
                    {order.source && (
                      <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: 'var(--accent)' }}>
                        📌 {order.sourceLabel || (order.source === 'dine_in' ? 'Dine-in' : order.source === 'delivery_direct' ? 'Direct Delivery' : order.source === 'glovo' ? 'Glovo' : order.source === 'phone' ? 'Phone' : order.source)}
                      </div>
                    )}
                  </div>
                  <span className="timestamp">{order.timestamp}</span>
                </div>
                
                <div className="order-items-list">
                  {order.items.map((item, i) => (
                    <div key={i} className="order-item-row">
                      <span>{item.name}</span>
                      <span>{item.price.toFixed(2)} MAD</span>
                    </div>
                  ))}
                </div>

                <div className="order-card-footer">
                  <div className="order-total">
                    <span>Total</span>
                    <span>{order.total} MAD</span>
                  </div>
                  
                  <div className="status-badge" style={{ backgroundColor: `${getStatusColor(order.status)}22`, color: getStatusColor(order.status) }}>
                    {order.status.toUpperCase()}
                  </div>

                  <div className="actions">
                    {order.status === 'pending' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => onUpdateStatus(order.id, 'ready')}>Ready</button>
                    )}
                    {order.status === 'ready' && (
                      <button className="btn btn-primary btn-sm" onClick={() => onUpdateStatus(order.id, 'paid')}>Paid</button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => sendToWhatsApp(order)}>
                      WhatsApp 📱
                    </button>
                    {order.status === 'paid' && (
                      <button className="btn btn-secondary btn-sm delete-btn" onClick={() => onDeleteOrder(order.id)}>Clear</button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        </>
      )}

      {activeTab === 'menu' && (
        <div className="menu-builder-container">
          {/* Menu Sub-tabs */}
          <div className="menu-subtabs" style={{ marginBottom: '1.5rem' }}>
            <button 
              className={`menu-subtab-btn ${menuSubTab === 'items' ? 'active' : ''}`}
              onClick={() => setMenuSubTab('items')}
            >
              📋 Menu Items
            </button>
            <button 
              className={`menu-subtab-btn ${menuSubTab === 'categories' ? 'active' : ''}`}
              onClick={() => setMenuSubTab('categories')}
            >
              🏷️ Categories
            </button>
          </div>

          {/* Items Management */}
          {menuSubTab === 'items' && (
            <div className="admin-grid">
              {/* Menu Builder Form */}
              <div className="form-column glass-card">
            {editingMenuItem ? (
              <div>
                <h3>Edit Menu Item</h3>
                <form onSubmit={handleUpdateMenuItem}>
                  <div className="form-group">
                    <label>Item Name</label>
                    <input 
                      type="text" 
                      value={editingMenuItem.name} 
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, name: e.target.value })} 
                      className="glass-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select 
                      value={editingMenuItem.category} 
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, category: e.target.value })} 
                      className="glass-input"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Price (MAD)</label>
                    <input 
                      type="text" 
                      value={editingMenuItem.price} 
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, price: e.target.value })} 
                      className="glass-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={editingMenuItem.description} 
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, description: e.target.value })} 
                      className="glass-input"
                      rows={3}
                    />
                  </div>
                  <div className="form-group">
                    <label>Image URL</label>
                    <input 
                      type="text" 
                      value={editingMenuItem.image || ''} 
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, image: e.target.value })} 
                      placeholder="https://example.com/image.jpg"
                      className="glass-input"
                    />
                  </div>
                  {menuError && <p className="error-text">{menuError}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary submit-btn">Save Changes</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditingMenuItem(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <h3>Add New Menu Item</h3>
                <form onSubmit={handleAddMenuItem}>
                  <div className="form-group">
                    <label>Item Name</label>
                    <input 
                      type="text" 
                      value={newItemName} 
                      onChange={(e) => setNewItemName(e.target.value)} 
                      placeholder="e.g. Alfredo Pasta"
                      className="glass-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select 
                      value={newItemCategory} 
                      onChange={(e) => setNewItemCategory(e.target.value)} 
                      className="glass-input"
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Price (MAD)</label>
                    <input 
                      type="text" 
                      value={newItemPrice} 
                      onChange={(e) => setNewItemPrice(e.target.value)} 
                      placeholder="e.g. 15.99"
                      className="glass-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea 
                      value={newItemDescription} 
                      onChange={(e) => setNewItemDescription(e.target.value)} 
                      placeholder="Enter description..."
                      className="glass-input"
                      rows={3}
                    />
                  </div>
                  <div className="form-group">
                    <label>Image URL</label>
                    <input 
                      type="text" 
                      value={newItemImage} 
                      onChange={(e) => setNewItemImage(e.target.value)} 
                      placeholder="https://example.com/image.jpg"
                      className="glass-input"
                    />
                  </div>
                  {menuError && <p className="error-text">{menuError}</p>}
                  <button type="submit" className="btn btn-primary submit-btn">Add to Menu</button>
                </form>
              </div>
            )}
              </div>

              {/* Menu Items List */}
              <div className="list-column glass-card">
                <h3>Current Restaurant Menu</h3>
                <div className="scrollable-list">
                  {menuItems.map(item => (
                <div key={item.id} className="menu-editor-item glass">
                  <div className="menu-editor-info">
                    <span className="cat-bullet">
                      {categories.find(c => c.id === item.category)?.icon || '🍽️'}
                    </span>
                    <div>
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      <small className="price-tag">{parseFloat(item.price).toFixed(2)} MAD</small>
                    </div>
                  </div>
                  <div className="crud-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingMenuItem(item)}>
                      Edit
                    </button>
                    <button className="btn btn-secondary btn-sm remove-staff" onClick={() => handleDeleteMenuItem(item.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
                </div>
              </div>
            </div>
          )}

          {/* Categories Management */}
          {menuSubTab === 'categories' && (
            <div className="admin-grid">
              {/* Category Form */}
              <div className="form-column glass-card">
                {editingCategory ? (
                  <div>
                    <h3>Edit Category</h3>
                    <form onSubmit={handleUpdateCategory}>
                      <div className="form-group">
                        <label>Category Name</label>
                        <input 
                          type="text" 
                          value={editingCategory.name} 
                          onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })} 
                          className="glass-input"
                        />
                      </div>
                      <div className="form-group">
                        <label>Icon/Emoji</label>
                        <input 
                          type="text" 
                          value={editingCategory.icon} 
                          onChange={(e) => setEditingCategory({ ...editingCategory, icon: e.target.value })} 
                          placeholder="🍽️"
                          className="glass-input"
                          maxLength={5}
                        />
                      </div>
                      {categoryError && <p className="error-text">{categoryError}</p>}
                      {categorySuccess && <p className="success-text">{categorySuccess}</p>}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" className="btn btn-primary submit-btn">Save Changes</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditingCategory(null)}>Cancel</button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div>
                    <h3>Add New Category</h3>
                    <form onSubmit={handleAddCategory}>
                      <div className="form-group">
                        <label>Category Name</label>
                        <input 
                          type="text" 
                          value={newCategoryName} 
                          onChange={(e) => setNewCategoryName(e.target.value)} 
                          placeholder="e.g. Appetizers"
                          className="glass-input"
                        />
                      </div>
                      <div className="form-group">
                        <label>Icon/Emoji</label>
                        <input 
                          type="text" 
                          value={newCategoryIcon} 
                          onChange={(e) => setNewCategoryIcon(e.target.value)} 
                          placeholder="🍽️"
                          className="glass-input"
                          maxLength={5}
                        />
                      </div>
                      {categoryError && <p className="error-text">{categoryError}</p>}
                      {categorySuccess && <p className="success-text">{categorySuccess}</p>}
                      <button type="submit" className="btn btn-primary submit-btn">Add Category</button>
                    </form>
                  </div>
                )}
              </div>

              {/* Categories List */}
              <div className="list-column glass-card">
                <h3>Existing Categories ({categories.length})</h3>
                <div className="scrollable-list">
                  {categories.map(cat => (
                    <div key={cat.id} className="menu-editor-item glass">
                      <div className="menu-editor-info">
                        <span className="cat-bullet">{cat.icon}</span>
                        <div>
                          <h4>{cat.name}</h4>
                          <small style={{ opacity: 0.5 }}>ID: {cat.id}</small>
                        </div>
                      </div>
                      <div className="crud-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingCategory(cat)}>
                          Edit
                        </button>
                        <button className="btn btn-secondary btn-sm remove-staff" onClick={() => handleDeleteCategory(cat.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="admin-grid">
          {/* Waiter Editor Form */}
          <div className="form-column glass-card">
            {editingWaiter ? (
              <div>
                <h3>Edit Waiter Credentials</h3>
                <form onSubmit={handleUpdateWaiter}>
                  <div className="form-group">
                    <label>Waiter Name</label>
                    <input 
                      type="text" 
                      value={editingWaiter.name} 
                      onChange={(e) => setEditingWaiter({ ...editingWaiter, name: e.target.value })} 
                      className="glass-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Access PIN (4 digits)</label>
                    <input 
                      type="text" 
                      maxLength={4}
                      value={editingWaiter.pin} 
                      onChange={(e) => setEditingWaiter({ ...editingWaiter, pin: e.target.value })} 
                      className="glass-input"
                    />
                  </div>
                  {waiterError && <p className="error-text">{waiterError}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary submit-btn">Update Profile</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditingWaiter(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <h3>Add New Waiter</h3>
                <form onSubmit={handleAddWaiter}>
                  <div className="form-group">
                    <label>Waiter Name</label>
                    <input 
                      type="text" 
                      value={newWaiterName} 
                      onChange={(e) => setNewWaiterName(e.target.value)} 
                      placeholder="e.g. Alex Smith"
                      className="glass-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Access PIN (4 digits)</label>
                    <input 
                      type="password" 
                      maxLength={4}
                      value={newWaiterPin} 
                      onChange={(e) => setNewWaiterPin(e.target.value)} 
                      placeholder="e.g. 1111"
                      className="glass-input"
                    />
                  </div>
                  {waiterError && <p className="error-text">{waiterError}</p>}
                  <button type="submit" className="btn btn-primary submit-btn">Create Profile</button>
                </form>
              </div>
            )}
          </div>

          {/* Waiters List & Performance */}
          <div className="list-column glass-card">
            <h3>Staff Performance & PINs</h3>
            <div className="scrollable-list">
              {waiters.map(waiter => (
                <div key={waiter.id} className="staff-editor-card glass">
                  <div className="staff-editor-info">
                    <span className="staff-avatar">�‍💼</span>
                    <div>
                      <h4>{waiter.name}</h4>
                      <p>Access Code: <code>{waiter.pin}</code></p>
                      <small className="orders-taken-badge">
                        📊 Orders Placed: {waiter.ordersCount || 0}
                      </small>
                    </div>
                  </div>
                  <div className="crud-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingWaiter(waiter)}>
                      Edit
                    </button>
                    <button className="btn btn-secondary btn-sm remove-staff" onClick={() => handleDeleteWaiter(waiter.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="admin-grid">
          {/* Table configuration */}
          <div className="form-column glass-card">
            {editingTable ? (
              <div>
                <h3>Edit Table Name</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '0.5rem 0 1.5rem' }}>
                  Rename this table to any alphanumeric description.
                </p>
                <form onSubmit={handleUpdateTable}>
                  <div className="form-group">
                    <label>Table Name/No.</label>
                    <input 
                      type="text" 
                      value={editingTable.name} 
                      onChange={(e) => setEditingTable({ ...editingTable, name: e.target.value })} 
                      className="glass-input"
                      placeholder="e.g. VIP Booth 2"
                    />
                  </div>
                  {tableError && <p className="error-text">{tableError}</p>}
                  {tableSuccess && <p className="success-text">{tableSuccess}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary submit-btn">Update Table</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditingTable(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <h3>Add Dining Table</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.6, margin: '0.5rem 0 1.5rem' }}>
                  Create a custom named dining table (e.g. "Terrace 3", "Bar 1").
                </p>
                <form onSubmit={handleAddTable}>
                  <div className="form-group">
                    <label>Table Name/No.</label>
                    <input 
                      type="text" 
                      value={newTableName} 
                      onChange={(e) => setNewTableName(e.target.value)} 
                      placeholder="e.g. VIP Booth" 
                      className="glass-input"
                    />
                  </div>
                  {tableError && <p className="error-text">{tableError}</p>}
                  {tableSuccess && <p className="success-text">{tableSuccess}</p>}
                  <button type="submit" className="btn btn-primary submit-btn">Add Table</button>
                </form>
              </div>
            )}
          </div>

          {/* Tables List & Preview */}
          <div className="list-column glass-card">
            <h3>Active Dining Room Tables ({tables.length})</h3>
            <div className="scrollable-list">
              {tables.map(table => (
                <div key={table.id} className="menu-editor-item glass">
                  <div className="menu-editor-info">
                    <span className="cat-bullet">🍽️</span>
                    <div>
                      <h4>{table.name}</h4>
                      <small style={{ opacity: 0.5 }}>Table ID: {table.id}</small>
                    </div>
                  </div>
                  <div className="crud-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingTable(table)}>
                      Rename
                    </button>
                    <button className="btn btn-secondary btn-sm remove-staff" onClick={() => handleDeleteTable(table.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .cashier-container { animation: fadeIn 0.5s ease-out; }
        
        .dashboard-header-tabs { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 2rem; 
          border-bottom: 1px solid var(--glass-border);
          padding-bottom: 1rem;
        }

        .tabs {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding-bottom: 0.25rem;
        }

        .tab-btn {
          background: transparent;
          border: none;
          color: hsl(var(--foreground));
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: var(--radius);
          transition: all 0.2s;
          opacity: 0.6;
          white-space: nowrap;
        }

        .tab-btn.active {
          opacity: 1;
          background: var(--glass-bg);
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          border: 1px solid var(--glass-border);
        }

        /* Menu Builder Sub-tabs */
        .menu-builder-container {
          width: 100%;
        }

        .menu-subtabs {
          display: flex;
          gap: 0.5rem;
          border-bottom: 2px solid var(--glass-border);
          padding-bottom: 0.5rem;
        }

        .menu-subtab-btn {
          background: transparent;
          border: none;
          color: hsl(var(--foreground));
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border-radius: var(--radius);
          transition: all 0.2s;
          opacity: 0.5;
          border-bottom: 3px solid transparent;
        }

        .menu-subtab-btn.active {
          opacity: 1;
          border-bottom-color: hsl(var(--primary));
          background: hsl(var(--primary) / 0.1);
        }

        .menu-subtab-btn:hover {
          opacity: 0.8;
        }
        
        .stat-card { padding: 0.75rem 1.25rem; border-radius: 12px !important; }
        .stat-card p { font-size: 1.25rem; font-weight: 700; color: hsl(var(--primary)); }

        .orders-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); 
          gap: 1.5rem; 
        }

        .order-card { display: flex; flex-direction: column; gap: 1rem; }
        .order-card-header { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.75rem; }
        .waiter-name { display: block; font-size: 0.8rem; opacity: 0.6; margin-top: 0.2rem; }
        .timestamp { font-size: 0.8rem; opacity: 0.5; }

        .order-items-list { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
        .order-item-row { display: flex; justify-content: space-between; font-size: 0.9rem; }

        .order-card-footer { border-top: 1px solid var(--glass-border); padding-top: 1rem; display: flex; flex-direction: column; gap: 1rem; }
        .order-total { display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem; }
        
        .status-badge { 
          align-self: flex-start; 
          padding: 0.25rem 0.6rem; 
          border-radius: 6px; 
          font-size: 0.7rem; 
          font-weight: 800; 
          letter-spacing: 0.05em;
        }

        .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; }
        .delete-btn:hover { background: #ff4757; color: white; border-color: #ff4757; }

        .empty-state { grid-column: 1 / -1; text-align: center; padding: 4rem !important; opacity: 0.6; }

        /* Admin Grid layouts for Builders */
        .admin-grid {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 2rem;
          animation: fadeIn 0.3s ease-out;
          align-items: start;
        }

        .form-column {
          position: sticky;
          top: calc(var(--header-height) + 1.5rem);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }

        .form-group label {
          font-size: 0.85rem;
          font-weight: 600;
          opacity: 0.8;
        }

        .glass-input {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          color: white;
          padding: 0.75rem 1rem;
          border-radius: calc(var(--radius) / 1.5);
          outline: none;
          transition: all 0.2s;
          width: 100%;
          font-family: inherit;
        }

        .glass-input:focus {
          border-color: hsl(var(--primary));
          box-shadow: 0 0 10px hsl(var(--primary) / 0.3);
        }

        select.glass-input {
          cursor: pointer;
        }
        select.glass-input option {
          background-color: hsl(var(--card));
          color: white;
        }

        .submit-btn {
          width: 100%;
          justify-content: center;
          padding: 0.75rem;
        }

        .error-text {
          color: #ff4757;
          font-size: 0.8rem;
          margin-bottom: 1rem;
        }

        .success-text {
          color: hsl(140, 70%, 50%);
          font-size: 0.85rem;
          margin-bottom: 1rem;
          animation: fadeIn 0.2s ease-out;
        }

        /* Scroll lists for items */
        .scrollable-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 60vh;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .menu-editor-item, .staff-editor-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem !important;
          border-radius: 12px !important;
          transition: all 0.2s;
        }

        .menu-editor-item:hover, .staff-editor-card:hover {
          background: var(--glass-border) !important;
        }

        .menu-editor-info, .staff-editor-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
        }

        .cat-bullet, .staff-avatar {
          font-size: 1.5rem;
          background: var(--glass-border);
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .menu-editor-info h4, .staff-editor-info h4 {
          margin: 0 0 0.15rem;
          font-size: 1rem;
        }

        .menu-editor-info p {
          font-size: 0.75rem;
          opacity: 0.6;
          margin-bottom: 0.25rem;
        }

        .price-tag {
          font-weight: 700;
          color: hsl(var(--secondary));
          background: hsl(var(--secondary) / 0.15);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }

        .orders-taken-badge {
          background: hsl(var(--primary) / 0.15);
          color: hsl(var(--primary));
          font-weight: 600;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }

        .staff-editor-info code {
          background: rgba(255,255,255,0.1);
          padding: 0.1rem 0.3rem;
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .crud-actions {
          display: flex;
          gap: 0.5rem;
        }

        .remove-staff:hover {
          background: rgba(255, 71, 87, 0.2) !important;
          color: #ff4757 !important;
          border-color: #ff4757 !important;
        }

        @media (max-width: 1024px) {
          .dashboard-header-tabs {
            align-items: stretch;
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 1rem;
          }

          .tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            overflow: visible;
          }

          .tab-btn {
            min-height: 48px;
            padding: 0.65rem 0.55rem;
            font-size: 0.88rem;
            white-space: normal;
            text-align: center;
          }

          .stats {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
          }

          .stat-card {
            padding: 0.75rem !important;
          }

          .orders-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 1rem;
          }

          .admin-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 1rem;
          }

          .form-column {
            position: relative;
            top: 0;
          }
        }

        @media (max-width: 768px) {
          .cashier-container {
            padding-bottom: max(1rem, env(safe-area-inset-bottom));
          }

          .dashboard-header-tabs {
            border-bottom: 0;
            padding-bottom: 0;
          }

          .tabs {
            position: sticky;
            top: 0;
            z-index: 35;
            padding: 0.35rem;
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            background: hsl(var(--card));
          }

          .tab-btn {
            border-radius: 9px;
            font-size: 0.78rem;
          }

          .stats {
            grid-template-columns: 1fr;
          }

          .stat-card p {
            font-size: 1.05rem;
          }

          .notifications-panel {
            padding: 0.85rem !important;
          }

          .notifications-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .notification-item {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .notification-actions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }

          .order-card {
            padding: 0.9rem !important;
          }

          .order-card-header,
          .order-card-footer {
            gap: 0.75rem;
          }

          .actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .actions .btn {
            justify-content: center;
            min-height: 42px;
            white-space: normal;
          }

          .menu-subtabs {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            border-bottom: 0;
            padding: 0.35rem;
            border-radius: 12px;
            background: hsl(var(--card));
          }

          .menu-subtab-btn {
            min-height: 46px;
            padding: 0.55rem;
            border-radius: 9px;
            border-bottom: 0;
            white-space: normal;
          }

          .form-column,
          .list-column {
            padding: 0.9rem !important;
          }

          .scrollable-list {
            max-height: none;
            overflow: visible;
            padding-right: 0;
          }

          .menu-editor-item,
          .staff-editor-card {
            align-items: stretch;
            flex-direction: column;
            gap: 0.85rem;
          }

          .menu-editor-info,
          .staff-editor-info {
            align-items: flex-start;
          }

          .crud-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .crud-actions .btn {
            justify-content: center;
            min-height: 42px;
          }

          .glass-input {
            font-size: 16px;
            min-height: 46px;
          }
        }

        @media (max-width: 420px) {
          .tabs {
            grid-template-columns: 1fr;
          }

          .actions,
          .crud-actions {
            grid-template-columns: 1fr;
          }

          .order-card-header {
            flex-direction: column;
          }

          .order-item-row,
          .order-total {
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CashierDashboard;
