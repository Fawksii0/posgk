import { useState, useEffect, useRef } from 'react';
import Uicon from './Uicon';

const AdminPortal = ({ orders, waiters, syncStatus = 'local', onLogout }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [systemLogs, setSystemLogs] = useState(() => {
    const saved = localStorage.getItem('spark_admin_logs');
    return saved ? JSON.parse(saved) : [{ id: Date.now(), level: 'info', message: 'Admin portal accessed', timestamp: new Date().toLocaleTimeString() }];
  });
  const [cacheDetails, setCacheDetails] = useState({ items: [], totalBytes: 0, lastUpdated: new Date().toLocaleTimeString() });
  const [showCacheDetails, setShowCacheDetails] = useState(false);
  const prevOrdersCountRef = useRef(orders.length);
  const prevSyncStatusRef = useRef(syncStatus);

  const ADMIN_CODE = 'spark2024';

  const handleAccessCode = (e) => {
    e.preventDefault();
    if (accessCode === ADMIN_CODE) {
      setAuthenticated(true);
      setCodeError('');
      setAccessCode('');
      logAdminEvent('Admin access granted', 'success');
    } else {
      setCodeError('Invalid access code');
      setAccessCode('');
    }
  };

  const logAdminEvent = (message, level = 'info') => {
    const entry = { id: Date.now(), message, level, timestamp: new Date().toLocaleTimeString() };
    setSystemLogs((prev) => {
      const next = [entry, ...prev].slice(0, 100);
      localStorage.setItem('spark_admin_logs', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const keys = ['pos_orders', 'pos_waiters', 'pos_tables', 'pos_categories', 'pos_menu_items', 'pos_notifications', 'pos_accounts', 'pos_closure_records'];
    const items = keys.map((key) => {
      const value = localStorage.getItem(key);
      return {
        key,
        present: !!value,
        size: value ? value.length : 0,
      };
    });
    const totalBytes = items.reduce((acc, item) => acc + item.size, 0);
    setCacheDetails({ items, totalBytes, lastUpdated: new Date().toLocaleTimeString() });
  }, [orders, waiters]);

  useEffect(() => {
    if (prevOrdersCountRef.current !== orders.length) {
      const diff = orders.length - prevOrdersCountRef.current;
      const message = diff > 0
        ? `${diff} new order${diff === 1 ? '' : 's'} received`
        : `${-diff} order${diff === -1 ? '' : 's'} removed`;
      if (authenticated) {
        logAdminEvent(`${message}. Total orders: ${orders.length}.`, 'info');
      }
      prevOrdersCountRef.current = orders.length;
    }
  }, [orders, authenticated]);

  useEffect(() => {
    if (prevSyncStatusRef.current !== syncStatus) {
      if (authenticated) {
        logAdminEvent(`Sync status changed to ${syncStatus}.`, 'info');
      }
      prevSyncStatusRef.current = syncStatus;
    }
  }, [syncStatus, authenticated]);

  if (!authenticated) {
    return (
      <div className="admin-login-overlay">
        <div className="admin-login-card glass-card">
          <div className="admin-login-header">
            <Uicon icon="fi-rr-lock" className="admin-lock-icon" />
            <h2>Spark Admin Portal</h2>
            <p>Employees only</p>
          </div>

          <form onSubmit={handleAccessCode}>
            <div className="admin-input-group">
              <label htmlFor="admin-code">Access Code</label>
              <input
                id="admin-code"
                type="password"
                className="glass-input"
                placeholder="Enter access code"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  if (codeError) setCodeError('');
                }}
                autoFocus
              />
            </div>

            {codeError && <p className="admin-error">{codeError}</p>}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              <Uicon icon="fi-rr-arrow-right" /> Access Admin Panel
            </button>
          </form>

          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onLogout}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            <Uicon icon="fi-rr-arrow-left" /> Back
          </button>

          <style>{`
            .admin-login-overlay {
              position: fixed;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--card)) 100%);
              z-index: 9999;
            }

            .admin-login-card {
              width: 100%;
              max-width: 360px;
              padding: 2rem;
              border-radius: 20px;
              text-align: center;
            }

            .admin-login-header {
              margin-bottom: 2rem;
            }

            .admin-lock-icon {
              font-size: 2.5rem;
              margin-bottom: 1rem;
              opacity: 0.8;
            }

            .admin-login-header h2 {
              margin: 0.5rem 0 0 0;
              font-size: 1.5rem;
            }

            .admin-login-header p {
              margin: 0.25rem 0 0 0;
              opacity: 0.6;
              font-size: 0.9rem;
            }

            .admin-input-group {
              margin-bottom: 1.5rem;
              text-align: left;
            }

            .admin-input-group label {
              display: block;
              margin-bottom: 0.5rem;
              font-size: 0.9rem;
              font-weight: 500;
            }

            .admin-error {
              color: #ff6b6b;
              font-size: 0.85rem;
              margin-bottom: 1rem;
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-portal">
      <div className="admin-header glass">
        <h2 className="gradient-text">Spark Admin Portal</h2>
        <button className="btn btn-secondary" onClick={() => {
          setAuthenticated(false);
          onLogout();
        }}>
          <Uicon icon="fi-rr-sign-out" /> Logout
        </button>
      </div>

      <div className="admin-status-grid">
        <div className="glass-card admin-status-card">
          <div className="status-card-header"><Uicon icon="fi-rr-server" /> System Status</div>
          <p className="status-item"><strong>Cloud sync:</strong> {syncStatus === 'online' ? 'Online' : syncStatus === 'offline' ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : 'Local only'}</p>
          <p className="status-item"><strong>Cache keys tracked:</strong> {cacheDetails.items.length}</p>
          <p className="status-item"><strong>Cached size:</strong> {cacheDetails.totalBytes} bytes</p>
          <p className="status-item"><strong>Last cache update:</strong> {cacheDetails.lastUpdated}</p>
        </div>
        <div className="glass-card admin-status-card">
          <div className="status-card-header"><Uicon icon="fi-rr-briefcase" /> Orders Summary</div>
          <p className="status-item"><strong>Total orders:</strong> {orders.length}</p>
          <p className="status-item"><strong>Pending:</strong> {orders.filter(o => o.status !== 'paid').length}</p>
          <p className="status-item"><strong>Completed:</strong> {orders.filter(o => o.status === 'paid').length}</p>
          <p className="status-item"><strong>Active staff:</strong> {waiters.length}</p>
        </div>
      </div>

      <div className="admin-grid">
        <div className="glass-card admin-panel">
          <div className="panel-header">
            <h3>Real-time Orders</h3>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => window.location.reload()}>Refresh</button>
          </div>
          <div className="orders-table-wrapper">
            {orders.length === 0 ? (
              <p className="empty-notification">No active orders yet.</p>
            ) : (
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Waiter</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 12).map(order => (
                    <tr key={order.id}>
                      <td>{order.table}</td>
                      <td>{order.waiterName || 'Unknown'}</td>
                      <td>{order.status}</td>
                      <td>{order.total} MAD</td>
                      <td>{order.lastEditedAt || order.timestamp || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="glass-card admin-panel">
          <div className="panel-header">
            <h3>Cache Details</h3>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowCacheDetails(!showCacheDetails)}>
              {showCacheDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>
          <p>Local cache stored in browser storage.</p>
          {showCacheDetails && (
            <table className="cache-table">
              <thead>
                <tr><th>Key</th><th>Present</th><th>Size</th></tr>
              </thead>
              <tbody>
                {cacheDetails.items.map(item => (
                  <tr key={item.key}>
                    <td>{item.key}</td>
                    <td>{item.present ? 'Yes' : 'No'}</td>
                    <td>{item.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="glass-card admin-panel">
          <div className="panel-header">
            <h3>System Logs</h3>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => {
              localStorage.removeItem('spark_admin_logs');
              setSystemLogs([]);
              logAdminEvent('Logs cleared', 'info');
            }}>
              Clear Logs
            </button>
          </div>
          <div className="logs-list">
            {systemLogs.length === 0 ? (
              <p className="empty-notification">No logs yet.</p>
            ) : (
              systemLogs.slice(0, 20).map(log => (
                <div key={log.id} className={`log-entry ${log.level}`}>
                  <span className="log-timestamp">[{log.timestamp}]</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`
        .admin-portal {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
        }

        .admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          border-radius: 16px;
          margin-bottom: 1rem;
        }

        .admin-header h2 {
          margin: 0;
          font-size: 1.3rem;
        }

        .admin-status-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .admin-status-card {
          min-height: 180px;
          padding: 1rem;
          border-radius: 16px;
        }

        .status-card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
          font-weight: 600;
        }

        .admin-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        .admin-panel {
          padding: 1rem;
          border-radius: 16px;
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .panel-header h3 {
          margin: 0;
          font-size: 1.05rem;
        }

        .orders-table-wrapper,
        .logs-list {
          max-height: 320px;
          overflow: auto;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 16px;
          padding: 1rem;
          background: rgba(255,255,255,.04);
        }

        .orders-table,
        .cache-table {
          width: 100%;
          border-collapse: collapse;
        }

        .orders-table th,
        .orders-table td,
        .cache-table th,
        .cache-table td {
          border-bottom: 1px solid rgba(255,255,255,.08);
          padding: 0.85rem 0.75rem;
          text-align: left;
          font-size: 0.95rem;
        }

        .cache-table th {
          font-weight: 600;
        }

        .log-entry {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
          padding: 0.75rem;
          border-radius: 12px;
          margin-bottom: 0.65rem;
          background: rgba(255,255,255,.04);
        }

        .log-entry.info { border-left: 4px solid #7f8cff; }
        .log-entry.success { border-left: 4px solid #5cd859; }
        .log-entry.warning { border-left: 4px solid #f5b851; }
        .log-entry.danger { border-left: 4px solid #ff6b6b; }

        .log-timestamp {
          opacity: 0.7;
          min-width: 120px;
          font-size: 0.82rem;
        }

        .status-item {
          line-height: 1.55;
          margin: 0.35rem 0;
          font-size: 0.9rem;
        }

        .empty-notification {
          text-align: center;
          opacity: 0.6;
          padding: 1rem;
          margin: 0;
        }

        @media (max-width: 640px) {
          .admin-status-grid {
            grid-template-columns: 1fr;
          }

          .admin-header {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }

          .admin-header .btn {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminPortal;
