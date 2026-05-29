import { useState, useEffect } from 'react';
import WaiterInterface from './components/WaiterInterface';
import CashierDashboard from './components/CashierDashboard';
import LoginScreen from './components/LoginScreen';
import ManagerPortal from './components/ManagerPortal';
import { MENU_ITEMS, CATEGORIES } from './mockData';

function App() {
  const [currentUser, setCurrentUser] = useState(null); // { name, role }
  const [view, setView] = useState('waiter'); // 'waiter' or 'cashier' or 'manager'
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [waiters, setWaiters] = useState([
    { id: 1, name: 'Alex', pin: '1111', ordersCount: 0 },
    { id: 2, name: 'Maria', pin: '2222', ordersCount: 0 }
  ]);
  const adminCode = '0000';

  // Set dark theme on mount (black & gold only)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    // Load persisted data from localStorage
    const savedOrders = localStorage.getItem('pos_orders');
    const savedWaiters = localStorage.getItem('pos_waiters');
    const savedTables = localStorage.getItem('pos_tables');
    const savedCategories = localStorage.getItem('pos_categories');
    const savedMenuItems = localStorage.getItem('pos_menu_items');
    const savedUser = localStorage.getItem('pos_current_user');

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedOrders) setOrders(JSON.parse(savedOrders));
    if (savedWaiters) {
      setWaiters(JSON.parse(savedWaiters));
    } else {
      const defaultWaiters = [
        { id: 1, name: 'Alex', pin: '1111', ordersCount: 0 },
        { id: 2, name: 'Maria', pin: '2222', ordersCount: 0 }
      ];
      setWaiters(defaultWaiters);
      localStorage.setItem('pos_waiters', JSON.stringify(defaultWaiters));
    }

    if (savedTables) {
      setTables(JSON.parse(savedTables));
    } else {
      const defaultTables = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Table ${i + 1}` }));
      setTables(defaultTables);
      localStorage.setItem('pos_tables', JSON.stringify(defaultTables));
    }

    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    } else {
      setCategories(CATEGORIES);
      localStorage.setItem('pos_categories', JSON.stringify(CATEGORIES));
    }

    if (savedMenuItems) {
      setMenuItems(JSON.parse(savedMenuItems));
    } else {
      setMenuItems(MENU_ITEMS);
      localStorage.setItem('pos_menu_items', JSON.stringify(MENU_ITEMS));
    }

    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      if (parsedUser.role === 'manager') {
        setView('manager');
      } else {
        setView(parsedUser.role === 'cashier' ? 'cashier' : 'waiter');
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pos_orders', JSON.stringify(orders));
  }, [orders]);

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
      const activeWaiterObj = waiters.find(w => w.name.toLowerCase() === user.name.toLowerCase() || waiters.some(waiter => waiter.pin === user.pin));
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
    const orderWithMeta = {
      ...newOrder,
      id: Date.now(),
      status: 'pending',
      timestamp: new Date().toLocaleTimeString(),
      orderDate: new Date().toISOString(),
      waiterName,
    };
    setOrders([orderWithMeta, ...orders]);

    // Increment lifetime ordersCount
    const updatedWaiters = waiters.map(w => 
      w.name.toLowerCase() === waiterName.toLowerCase()
        ? { ...w, ordersCount: (w.ordersCount || 0) + 1 }
        : w
    );
    saveWaiters(updatedWaiters);
  };

  const updateOrderStatus = (orderId, newStatus) => {
    setOrders(orders.map(order => 
      order.id === orderId ? { ...order, status: newStatus } : order
    ));
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

  if (!currentUser) {
    return (
      <LoginScreen 
        waiters={waiters} 
        adminCode={adminCode} 
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
          />
        ) : (
          <CashierDashboard 
            orders={orders} 
            waiters={waiters}
            tables={tables}
            categories={categories}
            menuItems={menuItems}
            onUpdateWaiters={saveWaiters}
            onUpdateTables={saveTables}
            onUpdateCategories={saveCategories}
            onUpdateMenuItems={saveMenuItems}
            onUpdateStatus={updateOrderStatus}
            onDeleteOrder={deleteOrder}
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
      `}</style>
    </div>
  );
}

export default App;
