import { useState, useMemo } from 'react';

const ManagerPortal = ({ orders, waiters, tables, onLogout, categories, menuItems, onUpdateCategories, onUpdateMenuItems }) => {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'sales' | 'staff' | 'closing' | 'menu'
  const [selectedPeriod, setSelectedPeriod] = useState(7); // 7, 15, or 30 days
  const [closureRecords, setClosureRecords] = useState(() => {
    const saved = localStorage.getItem('pos_closure_records');
    return saved ? JSON.parse(saved) : [];
  });
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closureNote, setClosureNote] = useState('');
  const [menuSubTab, setMenuSubTab] = useState('items');
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('starters');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [editingMenuItem, setEditingMenuItem] = useState(null);
  const [menuError, setMenuError] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📋');
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryError, setCategoryError] = useState('');
  const [categorySuccess, setCategorySuccess] = useState('');

  const salesData = useMemo(() => {
    const calculateSalesByPeriod = (days) => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      return orders.filter(order => {
        if (order.status !== 'paid') return false;
        try {
          // Parse timestamp like "HH:MM:SS"
          const orderDate = order.orderDate ? new Date(order.orderDate) : new Date();
          return orderDate >= periodStart && orderDate <= now;
        } catch {
          return false;
        }
      });
    };

    const paidOrders = calculateSalesByPeriod(selectedPeriod);
    const revenue = paidOrders.reduce((acc, order) => acc + parseFloat(order.total || 0), 0);
    const avgOrder = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
    
    return {
      totalOrders: paidOrders.length,
      totalRevenue: revenue,
      avgOrderValue: avgOrder,
      orders: paidOrders
    };
  }, [selectedPeriod, orders]);

  // Staff performance
  const staffPerformance = useMemo(() => {
    return waiters.map(waiter => {
      const waiterOrders = orders.filter(o => o.waiterName === waiter.name && o.status === 'paid');
      const revenue = waiterOrders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
      return {
        ...waiter,
        completedOrders: waiterOrders.length,
        revenue: revenue,
        avgOrderValue: waiterOrders.length > 0 ? revenue / waiterOrders.length : 0
      };
    });
  }, [waiters, orders]);

  // Current cash register status
  const cashRegisterStatus = useMemo(() => {
    const totalRevenue = orders
      .filter(o => o.status === 'paid')
      .reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
    
    const pendingRevenue = orders
      .filter(o => o.status !== 'paid')
      .reduce((acc, o) => acc + parseFloat(o.total || 0), 0);

    return {
      totalRevenue,
      pendingRevenue,
      totalOrders: orders.length,
      paidOrders: orders.filter(o => o.status === 'paid').length,
      canClose: orders.every(o => o.status === 'paid' || o.status === 'ready')
    };
  }, [orders]);

  // Handle closure
  const handleClosure = () => {
    const now = new Date();
    const newClosure = {
      id: Date.now(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      totalRevenue: cashRegisterStatus.totalRevenue,
      totalOrders: cashRegisterStatus.paidOrders,
      note: closureNote,
      closedBy: 'Manager'
    };

    const updated = [...closureRecords, newClosure];
    setClosureRecords(updated);
    localStorage.setItem('pos_closure_records', JSON.stringify(updated));
    setShowClosureModal(false);
    setClosureNote('');
  };

  // Menu Management Functions
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

  // Category Management
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
      icon: newCategoryIcon || '📋'
    };

    onUpdateCategories([...categories, newCategory]);
    setNewCategoryName('');
    setNewCategoryIcon('📋');
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

  return (
    <div className="manager-portal">
      {/* Header */}
      <div className="manager-header glass">
        <h2 className="gradient-text">Manager Portal</h2>
        <button className="btn btn-secondary" onClick={onLogout}>
          Logout ⪢
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="manager-tabs">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          ⊞ Dashboard
        </button>
        <button 
          className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          ▤ Sales Analytics
        </button>
        <button 
          className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          ◎ Staff Performance
        </button>
        <button 
          className={`tab-btn ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          ≡ Menu Builder
        </button>
        <button 
          className={`tab-btn ${activeTab === 'closing' ? 'active' : ''}`}
          onClick={() => setActiveTab('closing')}
        >
          ◉ Font de Caisse
        </button>
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="dashboard-grid">
          <div className="stat-card glass-card">
            <div className="stat-icon">◆</div>
            <div className="stat-content">
              <small>Today's Revenue</small>
              <h3>{cashRegisterStatus.totalRevenue.toFixed(2)} MAD</h3>
              <p className="stat-meta">{cashRegisterStatus.paidOrders} completed orders</p>
            </div>
          </div>

          <div className="stat-card glass-card">
            <div className="stat-icon">⌛</div>
            <div className="stat-content">
              <small>Pending Revenue</small>
              <h3>{cashRegisterStatus.pendingRevenue.toFixed(2)} MAD</h3>
              <p className="stat-meta">{cashRegisterStatus.totalOrders - cashRegisterStatus.paidOrders} unpaid orders</p>
            </div>
          </div>

          <div className="stat-card glass-card">
            <div className="stat-icon">◎</div>
            <div className="stat-content">
              <small>Active Staff</small>
              <h3>{waiters.length}</h3>
              <p className="stat-meta">Waiters on duty</p>
            </div>
          </div>

          <div className="stat-card glass-card">
            <div className="stat-icon">▢</div>
            <div className="stat-content">
              <small>Dining Tables</small>
              <h3>{tables.length}</h3>
              <p className="stat-meta">Available capacity</p>
            </div>
          </div>

          {/* Recent Orders Summary */}
          <div className="glass-card full-width">
            <h3>Recent Orders Summary</h3>
            <div className="orders-summary">
              {orders.slice(0, 5).map(order => (
                <div key={order.id} className="summary-row">
                  <span className="table-name">{order.table}</span>
                  <span className="waiter-info">{order.waiterName}</span>
                  <span className="amount">{order.total} MAD</span>
                  <span className={`badge ${order.status}`}>{order.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SALES ANALYTICS TAB */}
      {activeTab === 'sales' && (
        <div className="sales-analytics">
          <div className="period-selector glass-card">
            <label>Select Period:</label>
            <div className="period-buttons">
              <button 
                className={`period-btn ${selectedPeriod === 7 ? 'active' : ''}`}
                onClick={() => setSelectedPeriod(7)}
              >
                Last 7 Days
              </button>
              <button 
                className={`period-btn ${selectedPeriod === 15 ? 'active' : ''}`}
                onClick={() => setSelectedPeriod(15)}
              >
                Last 15 Days
              </button>
              <button 
                className={`period-btn ${selectedPeriod === 30 ? 'active' : ''}`}
                onClick={() => setSelectedPeriod(30)}
              >
                Last 30 Days
              </button>
            </div>
          </div>

          {/* Sales Stats */}
          <div className="sales-stats-grid">
            <div className="stat-card glass-card">
              <small>Total Revenue</small>
              <h2>{salesData.totalRevenue.toFixed(2)} MAD</h2>
            </div>
            <div className="stat-card glass-card">
              <small>Completed Orders</small>
              <h2>{salesData.totalOrders}</h2>
            </div>
            <div className="stat-card glass-card">
              <small>Average Order Value</small>
              <h2>{salesData.avgOrderValue.toFixed(2)} MAD</h2>
            </div>
            <div className="stat-card glass-card">
              <small>Daily Average</small>
              <h2>{(salesData.totalRevenue / (selectedPeriod || 1)).toFixed(2)} MAD</h2>
            </div>
          </div>

          {/* Detailed Sales Table */}
          <div className="glass-card sales-table-container">
            <h3>Detailed Sales Report - Last {selectedPeriod} Days</h3>
            <div className="scrollable-list">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Table</th>
                    <th>Waiter</th>
                    <th>Items Count</th>
                    <th>Amount</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.orders.length > 0 ? (
                    salesData.orders.map(order => (
                      <tr key={order.id}>
                        <td>#{order.id.toString().slice(-4)}</td>
                        <td>{order.table}</td>
                        <td>{order.waiterName}</td>
                        <td>{order.items.length}</td>
                        <td className="amount">{order.total} MAD</td>
                        <td>{order.timestamp}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="no-data">No sales data for this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAFF PERFORMANCE TAB */}
      {activeTab === 'staff' && (
        <div className="staff-performance">
          <div className="glass-card">
            <h3>Staff Performance Metrics</h3>
            <div className="staff-grid">
              {staffPerformance.map(staff => (
                <div key={staff.id} className="staff-card glass">
                  <div className="staff-header">
                    <h4>{staff.name}</h4>
                    <small>PIN: {staff.pin}</small>
                  </div>
                  <div className="staff-metrics">
                    <div className="metric">
                      <span className="metric-label">Total Orders</span>
                      <span className="metric-value">{staff.ordersCount}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Completed</span>
                      <span className="metric-value">{staff.completedOrders}</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Revenue Generated</span>
                      <span className="metric-value">{staff.revenue.toFixed(2)} MAD</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Avg Order Value</span>
                      <span className="metric-value">{staff.avgOrderValue.toFixed(2)} MAD</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MENU BUILDER TAB */}
      {activeTab === 'menu' && (
        <div className="menu-builder-container">
          {/* Menu Sub-tabs */}
          <div className="menu-subtabs" style={{ marginBottom: '1.5rem' }}>
            <button 
              className={`menu-subtab-btn ${menuSubTab === 'items' ? 'active' : ''}`}
              onClick={() => setMenuSubTab('items')}
            >
              ≡ Menu Items
            </button>
            <button 
              className={`menu-subtab-btn ${menuSubTab === 'categories' ? 'active' : ''}`}
              onClick={() => setMenuSubTab('categories')}
            >
              ▬ Categories
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
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                          {item.image && (
                            <img src={item.image} alt={item.name} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                          )}
                          <div style={{ flex: 1 }}>
                            <h4>{item.name}</h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0' }}>{item.description}</p>
                            <small style={{ fontWeight: '600', color: 'hsl(200, 70%, 45%)' }}>{parseFloat(item.price).toFixed(2)} MAD</small>
                          </div>
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
                          placeholder="📋"
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
                          placeholder="📋"
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
                <h3>Menu Categories</h3>
                <div className="scrollable-list">
                  {categories.map(category => (
                    <div key={category.id} className="menu-editor-item glass">
                      <div className="menu-editor-info">
                        <span style={{ fontSize: '1.5rem', marginRight: '1rem' }}>{category.icon}</span>
                        <div>
                          <h4>{category.name}</h4>
                          <small style={{ color: 'var(--text-secondary)' }}>ID: {category.id}</small>
                        </div>
                      </div>
                      <div className="crud-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingCategory(category)}>
                          Edit
                        </button>
                        <button className="btn btn-secondary btn-sm remove-staff" onClick={() => handleDeleteCategory(category.id)}>
                          Remove
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

      {/* FONT DE CAISSE TAB */}
      {activeTab === 'closing' && (
        <div className="font-de-caisse">
          {/* Current Status */}
          <div className="register-status glass-card">
            <h3>Current Cash Register Status</h3>
            <div className="status-grid">
              <div className="status-item">
                <label>Total Revenue</label>
                <h2>{cashRegisterStatus.totalRevenue.toFixed(2)} MAD</h2>
              </div>
              <div className="status-item">
                <label>Pending Amount</label>
                <h2 style={{ color: 'var(--accent)' }}>{cashRegisterStatus.pendingRevenue.toFixed(2)} MAD</h2>
              </div>
              <div className="status-item">
                <label>Status</label>
                <h2 style={{ color: cashRegisterStatus.canClose ? 'green' : 'orange' }}>
                  {cashRegisterStatus.canClose ? '✓ Ready' : '⚠ Pending Orders'}
                </h2>
              </div>
            </div>

            {/* Closure Button */}
            <button 
              className="btn btn-primary closure-btn"
              onClick={() => setShowClosureModal(true)}
              disabled={!cashRegisterStatus.canClose}
            >
              {cashRegisterStatus.canClose ? '� Close Register (Cloture)' : '⏱ Waiting for all orders to be paid'}
            </button>
          </div>

          {/* Previous Closures */}
          <div className="glass-card closures-history">
            <h3>Closure Records</h3>
            {closureRecords.length === 0 ? (
              <p className="no-data">No closure records yet.</p>
            ) : (
              <div className="scrollable-list">
                {closureRecords.map((closure, idx) => (
                  <div key={closure.id} className="closure-record glass">
                    <div className="closure-info">
                      <h4>Closure #{closureRecords.length - idx}</h4>
                      <small>{closure.date} at {closure.time}</small>
                    </div>
                    <div className="closure-amounts">
                      <span>{closure.totalRevenue.toFixed(2)} MAD</span>
                      <small>{closure.totalOrders} orders</small>
                    </div>
                    {closure.note && <p className="closure-note">{closure.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Closure Modal */}
      {showClosureModal && (
        <div className="modal-overlay" onClick={() => setShowClosureModal(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Cash Register Closure</h3>
            <div className="closure-summary">
              <p><strong>Total Revenue:</strong> {cashRegisterStatus.totalRevenue.toFixed(2)} MAD</p>
              <p><strong>Completed Orders:</strong> {cashRegisterStatus.paidOrders}</p>
              <p><strong>Closing Date/Time:</strong> {new Date().toLocaleString()}</p>
            </div>
            <div className="form-group">
              <label>Closing Notes (Optional)</label>
              <textarea 
                value={closureNote}
                onChange={(e) => setClosureNote(e.target.value)}
                placeholder="Enter any notes about this closure..."
                className="glass-input"
                rows={4}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleClosure}>
                ✓ Confirm Closure
              </button>
              <button className="btn btn-secondary" onClick={() => setShowClosureModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .manager-portal {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          padding: 1rem;
        }

        .manager-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-radius: var(--radius);
        }

        .manager-header h2 {
          margin: 0;
        }

        .manager-tabs {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          padding: 0.5rem;
          background: transparent;
          border-radius: var(--radius);
          border-bottom: 2px solid hsl(var(--border));
        }

        .tab-btn {
          padding: 0.75rem 1.25rem;
          border: none;
          background: transparent;
          color: hsl(var(--foreground));
          cursor: pointer;
          border-radius: 6px 6px 0 0;
          transition: all 0.25s ease;
          font-weight: 600;
          font-size: 0.95rem;
          border-bottom: 3px solid transparent;
          position: relative;
          margin-bottom: -2px;
        }

        .tab-btn:hover {
          background: hsla(var(--primary), 0.08);
          color: hsl(var(--primary));
        }

        .tab-btn.active {
          background: hsla(var(--primary), 0.12);
          color: hsl(var(--primary));
          border-bottom-color: hsl(var(--primary));
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          padding: 1.5rem;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          border-radius: 10px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          transition: all 0.25s ease;
        }

        .stat-card:hover {
          border-color: hsl(var(--primary));
          box-shadow: 0 4px 12px hsla(var(--primary), 0.1);
          transform: translateY(-2px);
        }

        .stat-icon {
          font-size: 2rem;
          min-width: 3rem;
          text-align: center;
          color: hsl(var(--primary));
        }

        .stat-content {
          flex: 1;
        }

        .stat-content small {
          display: block;
          color: hsl(var(--foreground), 0.65);
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .stat-content h3 {
          margin: 0;
          font-size: 1.75rem;
          color: hsl(var(--foreground));
        }

        .stat-meta {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        .full-width {
          grid-column: 1 / -1;
        }

        .orders-summary {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 300px;
          overflow-y: auto;
        }

        .summary-row {
          display: grid;
          grid-template-columns: 1fr 1.5fr 1fr 1fr;
          gap: 1rem;
          padding: 0.75rem;
          background: var(--background);
          border-radius: 8px;
          align-items: center;
        }

        .table-name {
          font-weight: 600;
        }

        .waiter-info {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .amount {
          font-weight: 600;
          color: var(--primary);
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .badge.paid {
          background: hsl(140, 70%, 50%, 0.2);
          color: hsl(140, 70%, 50%);
        }

        .badge.pending {
          background: var(--accent, 0.2);
          color: var(--accent);
        }

        /* Sales Analytics */
        .sales-analytics {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .period-selector {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1.5rem;
          border-radius: var(--radius);
        }

        .period-buttons {
          display: flex;
          gap: 1rem;
        }

        .period-btn {
          padding: 0.6rem 1.2rem;
          border: 2px solid var(--primary);
          background: transparent;
          color: var(--primary);
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .period-btn:hover,
        .period-btn.active {
          background: var(--primary);
          color: var(--card);
        }

        .sales-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .sales-table-container {
          padding: 1.5rem;
          border-radius: var(--radius);
          overflow: hidden;
        }

        .sales-table {
          width: 100%;
          border-collapse: collapse;
        }

        .sales-table th {
          background: var(--primary);
          color: var(--card);
          padding: 1rem;
          text-align: left;
          font-weight: 600;
        }

        .sales-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--card);
        }

        .sales-table tr:hover {
          background: var(--background);
        }

        .sales-table .amount {
          color: var(--primary);
          font-weight: 600;
        }

        .no-data {
          text-align: center;
          color: var(--text-secondary);
          padding: 2rem;
        }

        /* Staff Performance */
        .staff-performance {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .staff-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .staff-card {
          padding: 1.5rem;
          border-radius: var(--radius);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .staff-header h4 {
          margin: 0;
          font-size: 1.2rem;
        }

        .staff-header small {
          color: var(--text-secondary);
        }

        .staff-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        .metric {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .metric-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .metric-value {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--primary);
        }

        /* Font de Caisse */
        .font-de-caisse {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .register-status {
          padding: 2rem;
          border-radius: var(--radius);
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          margin: 1.5rem 0;
        }

        .status-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .status-item label {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .status-item h2 {
          margin: 0;
        }

        .closure-btn {
          margin-top: 1.5rem;
          padding: 1rem 2rem;
          font-size: 1rem;
          width: 100%;
        }

        .closure-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .closures-history {
          padding: 1.5rem;
          border-radius: var(--radius);
        }

        .closure-record {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          margin-bottom: 0.75rem;
          border-radius: 8px;
          background: var(--background);
        }

        .closure-info h4 {
          margin: 0;
        }

        .closure-info small {
          color: var(--text-secondary);
          display: block;
        }

        .closure-amounts {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .closure-amounts span {
          font-weight: 600;
          color: var(--primary);
        }

        .closure-note {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 0.5rem;
          font-style: italic;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          max-width: 500px;
          width: 90%;
          padding: 2rem;
          border-radius: var(--radius);
          animation: slideUp 0.3s ease-out;
        }

        .closure-summary {
          background: var(--background);
          padding: 1.5rem;
          border-radius: 8px;
          margin: 1.5rem 0;
        }

        .closure-summary p {
          margin: 0.5rem 0;
        }

        .modal-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .modal-actions button {
          flex: 1;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .manager-portal {
            gap: 1rem;
            padding: 0;
            padding-bottom: max(1rem, env(safe-area-inset-bottom));
          }

          .manager-header {
            align-items: center;
            padding: 0.85rem;
          }

          .manager-header h2 {
            font-size: 1.05rem;
          }

          .manager-tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            position: sticky;
            top: 0;
            z-index: 35;
            padding: 0.35rem;
            border: 1px solid hsl(var(--border));
            border-radius: 12px;
            background: hsl(var(--card));
          }

          .tab-btn {
            width: 100%;
            min-height: 48px;
            padding: 0.55rem;
            border-radius: 9px;
            border-bottom: 0;
            font-size: 0.78rem;
            white-space: normal;
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
            gap: 0.85rem;
            margin-bottom: 1rem;
          }

          .stat-card {
            padding: 1rem;
          }

          .stat-icon {
            min-width: 2.25rem;
            font-size: 1.5rem;
          }

          .summary-row {
            grid-template-columns: 1fr;
            gap: 0.35rem;
          }

          .period-selector {
            align-items: stretch;
            flex-direction: column;
            gap: 0.75rem;
            padding: 1rem;
          }

          .period-buttons {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }

          .period-btn {
            min-height: 44px;
            width: 100%;
          }

          .sales-stats-grid {
            grid-template-columns: 1fr;
            gap: 0.85rem;
          }

          .sales-table-container {
            padding: 1rem;
            overflow-x: auto;
          }

          .sales-table {
            min-width: 640px;
          }

          .staff-grid {
            grid-template-columns: 1fr;
            gap: 0.85rem;
          }

          .staff-card {
            padding: 1rem;
          }

          .staff-metrics {
            grid-template-columns: 1fr;
          }

          .status-grid {
            grid-template-columns: 1fr;
            gap: 0.85rem;
          }

          .register-status,
          .closures-history,
          .glass-card {
            padding: 1rem;
          }

          .closure-record {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.6rem;
          }

          .closure-amounts {
            text-align: left;
          }

          .modal-content {
            width: calc(100% - 1rem);
            padding: 1rem;
          }

          .modal-actions {
            flex-direction: column;
          }

          .admin-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .form-column {
            position: relative;
            top: 0;
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

          .scrollable-list {
            max-height: none;
            overflow: visible;
            padding-right: 0;
          }

          .menu-editor-item {
            align-items: stretch;
            flex-direction: column;
            gap: 0.85rem;
          }

          .menu-editor-info {
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
          .manager-tabs {
            grid-template-columns: 1fr;
          }

          .manager-header {
            flex-direction: column;
            align-items: stretch;
          }

          .manager-header .btn {
            justify-content: center;
          }

          .crud-actions,
          .menu-subtabs {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ManagerPortal;
