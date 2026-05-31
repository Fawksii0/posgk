import { useRef, useState, useEffect } from 'react';
import WaiterInterface from './components/WaiterInterface';
import CashierDashboard from './components/CashierDashboard';
import LoginScreen from './components/LoginScreen';
import ManagerPortal from './components/ManagerPortal';
import { MENU_ITEMS, CATEGORIES } from './mockData';
import { isCloudSyncEnabled, readCloudState, writeCloudState } from './services/posSync';

const DEFAULT_WAITERS = [
  { id: 1, name: 'Alex', pin: '1111', ordersCount: 0 },
  { id: 2, name: 'Maria', pin: '2222', ordersCount: 0 }
];

const DEFAULT_TABLES = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Table ${i + 1}` }));

const STORAGE_KEYS = {
  orders: 'pos_orders',
  waiters: 'pos_waiters',
  tables: 'pos_tables',
  categories: 'pos_categories',
  menuItems: 'pos_menu_items',
  notifications: 'pos_notifications',
};

const readLocalJson = (key, fallback) => {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
};

const saveLocalJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('pos_current_user');
    return savedUser ? JSON.parse(savedUser) : null;
  }); // { name, role }
  const [view, setView] = useState(() => {
    const savedUser = localStorage.getItem('pos_current_user');
    if (!savedUser) return 'waiter';
    const parsedUser = JSON.parse(savedUser);
    if (parsedUser.role === 'manager') return 'manager';
    return parsedUser.role === 'cashier' ? 'cashier' : 'waiter';
  }); // 'waiter' or 'cashier' or 'manager'
  const [orders, setOrders] = useState(() => readLocalJson(STORAGE_KEYS.orders, []));
  const [tables, setTables] = useState(() => readLocalJson(STORAGE_KEYS.tables, DEFAULT_TABLES));
  const [menuItems, setMenuItems] = useState(() => readLocalJson(STORAGE_KEYS.menuItems, MENU_ITEMS));
  const [categories, setCategories] = useState(() => readLocalJson(STORAGE_KEYS.categories, CATEGORIES));
  const [waiters, setWaiters] = useState(() => readLocalJson(STORAGE_KEYS.waiters, DEFAULT_WAITERS));
  const [notifications, setNotifications] = useState(() => readLocalJson(STORAGE_KEYS.notifications, [])); // { id, targetRole, waiterName, orderId, message, timestamp, read }
  const [syncStatus, setSyncStatus] = useState(isCloudSyncEnabled ? 'syncing' : 'local');
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const hasHydratedRef = useRef(false);
  const isApplyingCloudRef = useRef(false);
  const syncSnapshotRef = useRef('');
  const notificationIdRef = useRef(0);
  const adminCode = '0000';

  // Set dark theme on mount (black & gold only)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    const localState = {
      orders: readLocalJson(STORAGE_KEYS.orders, []),
      waiters: readLocalJson(STORAGE_KEYS.waiters, DEFAULT_WAITERS),
      tables: readLocalJson(STORAGE_KEYS.tables, DEFAULT_TABLES),
      categories: readLocalJson(STORAGE_KEYS.categories, CATEGORIES),
      menuItems: readLocalJson(STORAGE_KEYS.menuItems, MENU_ITEMS),
      notifications: readLocalJson(STORAGE_KEYS.notifications, []),
    };

    Object.entries(STORAGE_KEYS).forEach(([stateKey, storageKey]) => {
      saveLocalJson(storageKey, localState[stateKey]);
    });

    const hydrateFromCloud = async () => {
      if (!isCloudSyncEnabled) {
        hasHydratedRef.current = true;
        setSyncStatus('local');
        return;
      }

      try {
        const cloudState = await readCloudState();
        const hasCloudData = Object.keys(cloudState).length > 0;
        const nextState = hasCloudData ? { ...localState, ...cloudState } : localState;

        isApplyingCloudRef.current = true;
        setOrders(nextState.orders || []);
        setWaiters(nextState.waiters || DEFAULT_WAITERS);
        setTables(nextState.tables || DEFAULT_TABLES);
        setCategories(nextState.categories || CATEGORIES);
        setMenuItems(nextState.menuItems || MENU_ITEMS);
        setNotifications(nextState.notifications || []);

        Object.entries(STORAGE_KEYS).forEach(([stateKey, storageKey]) => {
          saveLocalJson(storageKey, nextState[stateKey] || []);
        });

        if (!hasCloudData) {
          await writeCloudState(Object.entries(nextState));
        }

        syncSnapshotRef.current = JSON.stringify(nextState);
        setSyncStatus('online');
      } catch (error) {
        console.warn(error);
        setSyncStatus('offline');
      } finally {
        isApplyingCloudRef.current = false;
        hasHydratedRef.current = true;
      }
    };

    hydrateFromCloud();
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current || isApplyingCloudRef.current) return;

    const nextState = {
      orders,
      waiters,
      tables,
      categories,
      menuItems,
      notifications,
    };

    Object.entries(STORAGE_KEYS).forEach(([stateKey, storageKey]) => {
      saveLocalJson(storageKey, nextState[stateKey]);
    });

    syncSnapshotRef.current = JSON.stringify(nextState);

    if (!isCloudSyncEnabled) return;

    writeCloudState(Object.entries(nextState))
      .then(() => setSyncStatus('online'))
      .catch((error) => {
        console.warn(error);
        setSyncStatus('offline');
      });
  }, [orders, waiters, tables, categories, menuItems, notifications]);

  useEffect(() => {
    if (!isCloudSyncEnabled) return undefined;

    const intervalId = setInterval(async () => {
      if (!hasHydratedRef.current) return;

      try {
        const cloudState = await readCloudState();
        if (Object.keys(cloudState).length === 0) return;

        const nextState = {
          orders: cloudState.orders || [],
          waiters: cloudState.waiters || DEFAULT_WAITERS,
          tables: cloudState.tables || DEFAULT_TABLES,
          categories: cloudState.categories || CATEGORIES,
          menuItems: cloudState.menuItems || MENU_ITEMS,
          notifications: cloudState.notifications || [],
        };
        const nextSnapshot = JSON.stringify(nextState);

        if (nextSnapshot === syncSnapshotRef.current) {
          setSyncStatus('online');
          return;
        }

        isApplyingCloudRef.current = true;
        setOrders(nextState.orders);
        setWaiters(nextState.waiters);
        setTables(nextState.tables);
        setCategories(nextState.categories);
        setMenuItems(nextState.menuItems);
        setNotifications(nextState.notifications);

        Object.entries(STORAGE_KEYS).forEach(([stateKey, storageKey]) => {
          saveLocalJson(storageKey, nextState[stateKey]);
        });

        syncSnapshotRef.current = nextSnapshot;
        setSyncStatus('online');
      } catch (error) {
        console.warn(error);
        setSyncStatus('offline');
      } finally {
        isApplyingCloudRef.current = false;
      }
    }, 2500);

    return () => clearInterval(intervalId);
  }, []);

  const saveWaiters = (newWaiters) => {
    setWaiters(newWaiters);
    localStorage.setItem('pos_waiters', JSON.stringify(newWaiters));
  };

  const saveTables = (newTables) => {
    setTables(newTables);
    localStorage.setItem('pos_tables', JSON.stringify(newTables));
  };

  const saveCategories = (newCategories) => {
    setCategories(newCategories);
    localStorage.setItem('pos_categories', JSON.stringify(newCategories));
  };

  const saveMenuItems = (newItems) => {
    setMenuItems(newItems);
    localStorage.setItem('pos_menu_items', JSON.stringify(newItems));
  };

  const handleLogin = (user) => {
    if (user.role === 'waiter') {
      const activeWaiterObj = waiters.find(w => w.name.toLowerCase() === user.name.toLowerCase());
      const officialName = activeWaiterObj ? activeWaiterObj.name : user.name;
      const updatedUser = { ...user, name: officialName };
      setCurrentUser(updatedUser);
      localStorage.setItem('pos_current_user', JSON.stringify(updatedUser));
    } else {
      setCurrentUser(user);
      localStorage.setItem('pos_current_user', JSON.stringify(user));
    }
    if (user.role === 'manager') {
      setView('manager');
    } else {
      setView(user.role === 'cashier' ? 'cashier' : 'waiter');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('pos_current_user');
  };

  const addOrder = (newOrder) => {
    const waiterName = currentUser ? currentUser.name : 'Unknown Waiter';
    const createdAt = new Date();
    const orderId = createdAt.getTime();
    const activeOrder = orders.find(order => order.table === newOrder.table && order.status !== 'paid');

    if (activeOrder) {
      const updatedItems = [...activeOrder.items, ...newOrder.items];
      const updatedTotal = updatedItems.reduce((acc, item) => acc + Number(item.price || 0), 0).toFixed(2);
      const updatedOrder = {
        ...activeOrder,
        items: updatedItems,
        total: updatedTotal,
        status: 'pending',
        lastEditedAt: createdAt.toISOString(),
        lastEditedBy: waiterName,
      };

      setOrders(orders.map(order => order.id === activeOrder.id ? updatedOrder : order));

      addNotification({
        targetRole: 'cashier',
        type: 'order_edit',
        orderId: activeOrder.id,
        table: newOrder.table,
        waiterName,
        items: newOrder.items,
        total: updatedTotal,
        title: `Order edited - ${newOrder.table}`,
        message: `${waiterName} added ${newOrder.items.length} item(s) to ${newOrder.table}. New total: ${updatedTotal} MAD.`,
        timestamp: createdAt.toLocaleTimeString(),
      });

      return { type: 'edit', table: newOrder.table };
    }

    const orderWithMeta = {
      ...newOrder,
      id: orderId,
      status: 'pending',
      timestamp: createdAt.toLocaleTimeString(),
      orderDate: createdAt.toISOString(),
      waiterName,
      source: 'dine_in',
      sourceLabel: 'Dine-in',
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      deliveryNotes: null,
      externalOrderId: null,
    };
    setOrders([orderWithMeta, ...orders]);

    // Increment lifetime ordersCount
    const updatedWaiters = waiters.map(w => 
      w.name.toLowerCase() === waiterName.toLowerCase()
        ? { ...w, ordersCount: (w.ordersCount || 0) + 1 }
        : w
    );
    saveWaiters(updatedWaiters);

    // Create a notification for the cashier
    const notificationMessage = `🆕 NEW ORDER\n📍 Table: ${newOrder.table}\n👤 Waiter: ${waiterName}\n📦 Items: ${newOrder.items.length}\n💰 Total: $${newOrder.total}`;
    addNotification({
      targetRole: 'cashier',
      type: 'new_order',
      orderId: orderWithMeta.id,
      message: notificationMessage,
      title: `New order - ${newOrder.table}`,
      table: newOrder.table,
      waiterName: waiterName,
      items: newOrder.items,
      total: newOrder.total,
      timestamp: createdAt.toLocaleTimeString(),
    });

    return { type: 'new', table: newOrder.table };
  };

  const addNotification = (notification) => {
    notificationIdRef.current += 1;
    const newNotification = {
      id: `${notification.type}-${notification.orderId}-${notificationIdRef.current}`,
      read: false,
      ...notification,
    };
    setNotifications(prev => [newNotification, ...prev]);
    return newNotification;
  };



  const markNotificationAsRead = (notificationId) => {
    setNotifications(notifications.map(notif => 
      notif.id === notificationId ? { ...notif, read: true } : notif
    ));
  };

  const updateOrderStatus = (orderId, newStatus) => {
    const orderToUpdate = orders.find(order => order.id === orderId);
    setOrders(orders.map(order =>
      order.id === orderId ? { ...order, status: newStatus } : order
    ));

    if (orderToUpdate && newStatus === 'ready') {
      const createdAt = new Date();
      addNotification({
        targetRole: 'waiter',
        type: 'order_ready',
        orderId,
        table: orderToUpdate.table,
        waiterName: orderToUpdate.waiterName,
        items: orderToUpdate.items,
        total: orderToUpdate.total,
        title: `Ready - ${orderToUpdate.table}`,
        message: `${orderToUpdate.table} is ready for pickup.`,
        timestamp: createdAt.toLocaleTimeString(),
      });
    }
  };

  const deleteOrder = (orderId) => {
    setOrders(orders.filter(order => order.id !== orderId));
  };

  // Find updated name for active user if they were edited while logged in
  const getActiveUserName = () => {
    if (!currentUser) return '';
    if (currentUser.role === 'cashier') return 'Cashier (Admin)';
    if (currentUser.role === 'manager') return 'Manager';
    const waiterObj = waiters.find(w => w.name.toLowerCase() === currentUser.name.toLowerCase());
    return waiterObj ? waiterObj.name : currentUser.name;
  };

  const getRoleDisplay = () => {
    switch(currentUser?.role) {
      case 'cashier': return 'Cashier';
      case 'manager': return 'Manager';
      case 'waiter': return 'Waiter';
      default: return '';
    }
  };

  const cashierNotifications = notifications.filter(notif => !notif.targetRole || notif.targetRole === 'cashier');
  const cashierUnreadCount = cashierNotifications.filter(notif => !notif.read).length;
  const activeWaiterName = getActiveUserName();
  const waiterNotifications = notifications.filter(notif =>
    notif.targetRole === 'waiter' && notif.waiterName?.toLowerCase() === activeWaiterName.toLowerCase()
  );
  const waiterUnreadCount = waiterNotifications.filter(notif => !notif.read).length;

  if (!currentUser) {
    return (
      <LoginScreen 
        onLogin={handleLogin} 
      />
    );
  }

  return (
    <div className="app-container">
      <header className="glass">
        <div className="header-content">
          <div className="header-left">
            <h1 className="gradient-text">G&K POS</h1>
            <span className={`sync-badge ${syncStatus}`}>
              {syncStatus === 'online' ? 'Synced' : syncStatus === 'offline' ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : 'Local'}
            </span>
            <span className="user-badge">
              ◎ {getActiveUserName()} ({getRoleDisplay()})
            </span>
          </div>

          <nav>
            {currentUser.role === 'cashier' ? (
              <>
                <button 
                  className={`btn ${view === 'waiter' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setView('waiter')}
                >
                  Waiter Mode
                </button>
                <button 
                  className={`btn ${view === 'cashier' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setView('cashier')}
                >
                  Cashier Dashboard
                </button>
              </>
            ) : currentUser.role === 'manager' ? (
              <span className="nav-info">Manager Portal</span>
            ) : (
              <span className="nav-info">Waiter Mode Active</span>
            )}
          </nav>

          <div className="header-right">
            {currentUser.role === 'cashier' && (
              <div className="notification-dropdown-wrapper" style={{ position: 'relative' }}>
                <button 
                  className="btn btn-secondary notification-btn" 
                  title="Order Notifications"
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                >
                  🔔 {cashierUnreadCount > 0 && <span className="badge">{cashierUnreadCount}</span>}
                </button>
                {showNotificationDropdown && (
                  <div className="notification-dropdown glass-card">
                    <div className="notification-dropdown-header">
                      <h4>Notifications ({notifications.filter(n => n.targetRole === 'cashier').length})</h4>
                    </div>
                    <div className="notification-dropdown-content">
                      {notifications.filter(n => n.targetRole === 'cashier').length === 0 ? (
                        <p className="empty-notification">No notifications yet</p>
                      ) : (
                        notifications.filter(n => n.targetRole === 'cashier').map(notif => (
                          <div 
                            key={notif.id}
                            className={`notification-item ${notif.read ? 'read' : 'unread'}`}
                            onClick={() => !notif.read && markNotificationAsRead(notif.id)}
                          >
                            <div className="notification-info">
                              <div className="notification-title">
                                {notif.type === 'order_edit' ? '✎ Edited' : '🍽️ New'}: <strong>{notif.table}</strong>
                              </div>
                              <div className="notification-time">⏰ {notif.timestamp}</div>
                              <div className="notification-items-mini">
                                {(notif.items || []).map((item, idx) => (
                                  <span key={idx}>{item.name}</span>
                                )).slice(0, 2)}
                                {(notif.items || []).length > 2 && <span>...</span>}
                              </div>
                              <div className="notification-total">Total: {notif.total} MAD</div>
                            </div>
                            {!notif.read && <div className="unread-dot"></div>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button className="btn btn-secondary logout-btn" onClick={handleLogout}>
              Logout →
            </button>
          </div>
        </div>
      </header>

      <main>
        {currentUser.role === 'manager' ? (
          <ManagerPortal 
            orders={orders} 
            waiters={waiters}
            tables={tables}
            categories={categories}
            menuItems={menuItems}
            onUpdateCategories={saveCategories}
            onUpdateMenuItems={saveMenuItems}
            adminCode={adminCode}
            onLogout={handleLogout}
          />
        ) : view === 'waiter' ? (
          <WaiterInterface 
            onAddOrder={addOrder} 
            waiterName={getActiveUserName()} 
            tables={tables}
            categories={categories}
            menuItems={menuItems}
            orders={orders}
            notifications={waiterNotifications}
            unreadCount={waiterUnreadCount}
            onMarkNotificationAsRead={markNotificationAsRead}
          />
        ) : (
          <CashierDashboard 
            orders={orders} 
            waiters={waiters}
            tables={tables}
            categories={categories}
            menuItems={menuItems}
            notifications={cashierNotifications}
            unreadCount={cashierUnreadCount}
            onUpdateWaiters={saveWaiters}
            onUpdateTables={saveTables}
            onUpdateCategories={saveCategories}
            onUpdateMenuItems={saveMenuItems}
            onUpdateStatus={updateOrderStatus}
            onDeleteOrder={deleteOrder}
            onMarkNotificationAsRead={markNotificationAsRead}
          />
        )}
      </main>

      <style jsx>{`
        .app-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        header {
          position: sticky;
          top: 0;
          z-index: 100;
          height: var(--header-height);
          margin-bottom: 2rem;
          border-radius: 0 0 var(--radius) var(--radius) !important;
          border-top: none !important;
        }
        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
        }
        .header-left, .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .user-badge {
          font-size: 0.8rem;
          background: var(--glass-border);
          padding: 0.3rem 0.6rem;
          border-radius: 20px;
          font-weight: 500;
        }
        .sync-badge {
          font-size: 0.72rem;
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          padding: 0.25rem 0.55rem;
          color: hsl(var(--foreground));
          background: hsl(var(--card));
          white-space: nowrap;
        }
        .sync-badge.online {
          color: hsl(140 70% 65%);
          border-color: hsl(140 70% 35%);
        }
        .sync-badge.offline {
          color: #ffb3b3;
          border-color: #ff6b6b;
        }
        h1 {
          font-size: 1.5rem;
        }
        nav {
          display: flex;
          gap: 1rem;
        }
        .nav-info {
          font-size: 0.9rem;
          opacity: 0.7;
          font-weight: 500;
        }
        main {
          flex: 1;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          padding: 0 2rem 2rem;
          animation: fadeIn 0.5s ease-out;
        }
        .theme-toggle {
          padding: 0.5rem;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        }
        .logout-btn:hover {
          background: rgba(255, 71, 87, 0.2) !important;
          color: #ff4757 !important;
          border-color: #ff4757 !important;
        }

        .notification-dropdown-wrapper {
          position: relative;
        }

        .notification-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          width: 320px;
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          z-index: 1000;
        }

        .notification-dropdown-header {
          padding: 0.75rem;
          border-bottom: 1px solid var(--glass-border);
          font-weight: bold;
          font-size: 0.9rem;
        }

        .notification-dropdown-header h4 {
          margin: 0;
          color: hsl(var(--accent));
        }

        .notification-dropdown-content {
          padding: 0.5rem;
        }

        .notification-dropdown-content .notification-item {
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          background: hsl(var(--card) / 0.5);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .notification-dropdown-content .notification-item:hover {
          background: hsl(var(--card));
          border-color: hsl(var(--accent) / 0.5);
        }

        .notification-dropdown-content .notification-item.unread {
          border-color: hsl(var(--accent));
          background: hsl(var(--accent) / 0.1);
        }

        .notification-info {
          flex: 1;
          min-width: 0;
        }

        .notification-title {
          font-weight: bold;
          font-size: 0.85rem;
          color: white;
        }

        .notification-time {
          font-size: 0.75rem;
          color: hsl(var(--accent));
          margin-top: 0.25rem;
        }

        .notification-items-mini {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
          margin-top: 0.25rem;
          display: flex;
          gap: 0.25rem;
          flex-wrap: wrap;
        }

        .notification-items-mini span {
          background: hsl(var(--accent) / 0.2);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .notification-total {
          font-size: 0.8rem;
          color: hsl(var(--accent));
          margin-top: 0.25rem;
          font-weight: bold;
        }

        .unread-dot {
          width: 8px;
          height: 8px;
          background: hsl(var(--accent));
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 0.25rem;
        }

        .empty-notification {
          padding: 1rem;
          text-align: center;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.9rem;
        }

        @media (max-width: 768px) {
          header {
            height: auto;
            margin-bottom: 0.75rem;
          }

          .header-content {
            min-height: var(--header-height);
            flex-wrap: wrap;
            align-items: center;
            gap: 0.55rem;
            padding: 0.65rem 0.85rem;
          }

          .header-left {
            flex: 1 1 auto;
            min-width: 0;
            gap: 0.5rem;
          }

          h1 {
            font-size: 1.05rem;
            white-space: nowrap;
          }

          .user-badge {
            max-width: 46vw;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 0.72rem;
          }

          .sync-badge {
            font-size: 0.68rem;
            padding: 0.22rem 0.45rem;
          }

          nav {
            order: 3;
            width: 100%;
            justify-content: center;
          }

          .nav-info {
            font-size: 0.78rem;
          }

          .header-right {
            gap: 0.45rem;
          }

          .logout-btn {
            padding: 0.5rem 0.7rem;
          }

          main {
            padding: 0 0.75rem 1rem;
          }
        }

        @media (max-width: 420px) {
          .header-content {
            padding: 0.55rem 0.7rem;
          }

          .user-badge {
            max-width: 38vw;
          }

          .logout-btn {
            padding: 0.45rem 0.6rem;
          }

          main {
            padding: 0 0.55rem 0.8rem;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
