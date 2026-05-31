import { useState } from 'react';
import { isCloudSyncEnabled, getUserByEmail, createUser, verifyPassword } from '../services/posSync';

const LoginScreen = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  const getStoredAccounts = () => {
    // If cloud sync is enabled, return empty (use cloud instead)
    if (isCloudSyncEnabled) return [];
    const stored = localStorage.getItem('pos_accounts');
    return stored ? JSON.parse(stored) : [];
  };

  const saveAccount = (account) => {
    // If cloud sync is enabled, don't save to localStorage
    if (isCloudSyncEnabled) return;
    const accounts = getStoredAccounts();
    accounts.push(account);
    localStorage.setItem('pos_accounts', JSON.stringify(accounts));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    // Check demo accounts
    if (loginEmail === 'manager@gk.com' && loginPassword === 'manager123') {
      onLogin({ role: 'manager', name: 'Manager' });
      return;
    }

    if (loginEmail === 'cashier@gk.com' && loginPassword === 'cashier123') {
      onLogin({ role: 'cashier', name: 'Cashier (Admin)' });
      return;
    }

    if (loginEmail === 'waiter@gk.com' && loginPassword === 'waiter123') {
      onLogin({ role: 'waiter', name: 'Alex' });
      return;
    }

    // If cloud sync enabled, check cloud
    if (isCloudSyncEnabled) {
      getUserByEmail(loginEmail)
        .then(user => {
          if (!user) {
            setError('Invalid email or password.');
            setLoginPassword('');
            return;
          }

          // Check password (plain text for now)
          if (!verifyPassword(loginPassword, user.password_hash)) {
            setError('Invalid email or password.');
            setLoginPassword('');
            return;
          }

          // Check status
          if (user.status === 'pending') {
            setError('Your account is pending. A manager must assign your role before you can access the system.');
            return;
          }

          if (user.status === 'banned') {
            setError('Your account has been banned from the system.');
            return;
          }

          if (user.status === 'paused') {
            setError('Your account has been paused. Contact the manager to resume.');
            return;
          }

          if (!user.role) {
            setError('Your role has not been assigned yet. Please contact the manager.');
            return;
          }

          onLogin({ role: user.role, name: user.name });
        })
        .catch(() => {
          setError('Failed to verify credentials. Please check your connection.');
        });
      return;
    }

    // Fallback to localStorage
    const accounts = getStoredAccounts();
    const account = accounts.find(acc => acc.email === loginEmail && acc.password === loginPassword);
    
    if (!account) {
      setError('Invalid email or password.');
      setLoginPassword('');
      return;
    }

    // Check account status
    if (account.status === 'pending') {
      setError('Your account is pending. A manager must assign your role before you can access the system.');
      return;
    }

    if (account.status === 'banned') {
      setError('Your account has been banned from the system.');
      return;
    }

    if (account.status === 'paused') {
      setError('Your account has been paused. Contact the manager to resume.');
      return;
    }

    // Check if role is assigned
    if (!account.role) {
      setError('Your role has not been assigned yet. Please contact the manager.');
      return;
    }

    onLogin({ role: account.role, name: account.name });
  };

  const handleSignup = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (signupPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!signupEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (isCloudSyncEnabled) {
      // Create user in Supabase
      createUser(signupName.trim(), signupEmail.trim(), signupPassword)
        .then(() => {
          setSuccess('Account created! A manager must assign your role before you can access the system.');
          setSignupName('');
          setSignupEmail('');
          setSignupPassword('');
          setSignupConfirmPassword('');
          
          setTimeout(() => {
            setIsLogin(true);
            setSuccess('');
            setLoginEmail(signupEmail);
          }, 2000);
        })
        .catch((err) => {
          if (err.message.includes('duplicate')) {
            setError('This email is already registered.');
          } else {
            setError('Failed to create account. Please check your connection.');
          }
        });
      return;
    }

    // Fallback to localStorage
    const accounts = getStoredAccounts();
    if (accounts.some(acc => acc.email === signupEmail)) {
      setError('This email is already registered.');
      return;
    }

    const newAccount = {
      name: signupName.trim(),
      email: signupEmail.trim(),
      password: signupPassword,
      role: null,
      status: 'pending'
    };

    saveAccount(newAccount);
    setSuccess('Account created! A manager must assign your role before you can access the system.');
    
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupConfirmPassword('');
    
    setTimeout(() => {
      setIsLogin(true);
      setSuccess('');
      setLoginEmail(signupEmail);
    }, 2000);
  };

  const resetForm = () => {
    setError('');
    setSuccess('');
    setLoginEmail('');
    setLoginPassword('');
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupConfirmPassword('');
  };

  const toggleMode = () => {
    resetForm();
    setIsLogin(!isLogin);
  };

  return (
    <div className="login-overlay">
      <div className="login-card glass-card">
        <div className="login-header">
          <div className="logo-glow"></div>
          <h1 className="gradient-text">G&K POS</h1>
          <p className="subtitle">Restaurant Management System</p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button 
            className={`tab-btn ${isLogin ? 'active' : ''}`}
            onClick={() => { resetForm(); setIsLogin(true); }}
          >
            Login
          </button>
          <button 
            className={`tab-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => { resetForm(); setIsLogin(false); }}
          >
            Sign Up
          </button>
        </div>

        {/* Login Form */}
        {isLogin ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">{success}</p>}

            <button type="submit" className="btn btn-primary btn-full">
              Sign In
            </button>

            <div className="demo-accounts">
              <p className="demo-title">Demo Accounts:</p>
              <div className="demo-list">
                <div className="demo-item">
                  <strong>Manager</strong>
                  <code>manager@gk.com</code>
                  <code>manager123</code>
                </div>
                <div className="demo-item">
                  <strong>Cashier</strong>
                  <code>cashier@gk.com</code>
                  <code>cashier123</code>
                </div>
                <div className="demo-item">
                  <strong>Waiter</strong>
                  <code>waiter@gk.com</code>
                  <code>waiter123</code>
                </div>
              </div>
            </div>
          </form>
        ) : (
          /* Signup Form */
          <form onSubmit={handleSignup} className="auth-form">
            <div className="form-group">
              <label htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-email">Email Address</label>
              <input
                id="signup-email"
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm">Confirm Password</label>
              <input
                id="signup-confirm"
                type="password"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            {error && <p className="error-message">{error}</p>}
            {success && <p className="success-message">{success}</p>}

            <button type="submit" className="btn btn-primary btn-full">
              Create Account
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="link-btn" onClick={toggleMode}>
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>

      <style jsx>{`
        .login-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: radial-gradient(circle at center, hsl(var(--card)) 0%, hsl(var(--background)) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.4s ease-out;
          padding: 1rem;
          overflow-y: auto;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 2.5rem !important;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          border-radius: 24px !important;
          margin: auto;
        }

        .login-header {
          text-align: center;
          position: relative;
          width: 100%;
        }

        .logo-glow {
          position: absolute;
          top: -20px;
          left: 50%;
          transform: translateX(-50%);
          width: 80px;
          height: 80px;
          background: radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%);
          filter: blur(10px);
          z-index: -1;
        }

        h1 {
          font-size: 2.2rem;
          margin-bottom: 0.25rem;
        }

        .subtitle {
          font-size: 0.85rem;
          opacity: 0.6;
        }

        .auth-tabs {
          display: flex;
          gap: 1rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.5rem;
          border-radius: 12px;
          border: 1px solid var(--glass-border);
        }

        .tab-btn {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          background: transparent;
          color: hsl(var(--foreground) / 0.6);
          font-weight: 600;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s ease;
          font-size: 0.95rem;
        }

        .tab-btn:hover {
          color: hsl(var(--foreground) / 0.8);
        }

        .tab-btn.active {
          background: hsl(var(--primary) / 0.2);
          color: hsl(var(--primary));
          box-shadow: 0 0 12px hsl(var(--primary) / 0.2);
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-size: 0.9rem;
          font-weight: 600;
          color: hsl(var(--foreground) / 0.9);
        }

        .form-group input,
        .form-group select {
          padding: 0.875rem;
          border: 1px solid var(--glass-border);
          background: rgba(255, 255, 255, 0.05);
          color: hsl(var(--foreground));
          border-radius: 8px;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          font-family: inherit;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: hsl(var(--primary) / 0.5);
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 12px hsl(var(--primary) / 0.15);
        }

        .form-group input::placeholder {
          color: hsl(var(--foreground) / 0.4);
        }

        .form-group select option {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }

        .error-message {
          color: #ff4757;
          font-size: 0.85rem;
          padding: 0.75rem;
          background: rgba(255, 71, 87, 0.1);
          border-radius: 8px;
          border-left: 3px solid #ff4757;
          margin-top: -0.5rem;
        }

        .success-message {
          color: #2ecc71;
          font-size: 0.85rem;
          padding: 0.75rem;
          background: rgba(46, 204, 113, 0.1);
          border-radius: 8px;
          border-left: 3px solid #2ecc71;
          margin-top: -0.5rem;
        }

        .btn-full {
          width: 100%;
          padding: 0.95rem;
          font-size: 1rem;
          font-weight: 600;
        }

        .demo-accounts {
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          margin-top: 0.5rem;
        }

        .demo-title {
          font-size: 0.8rem;
          font-weight: 600;
          opacity: 0.6;
          margin-bottom: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .demo-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .demo-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.75rem;
        }

        .demo-item strong {
          opacity: 0.7;
        }

        .demo-item code {
          background: rgba(255, 255, 255, 0.08);
          padding: 0.25rem 0.4rem;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          opacity: 0.6;
        }

        .auth-footer {
          text-align: center;
          font-size: 0.9rem;
        }

        .auth-footer p {
          margin: 0;
          opacity: 0.7;
        }

        .link-btn {
          background: none;
          border: none;
          color: hsl(var(--primary));
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
          padding: 0;
          transition: opacity 0.2s ease;
        }

        .link-btn:hover {
          opacity: 0.8;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 1.5rem !important;
            max-width: 100%;
          }

          h1 {
            font-size: 1.8rem;
          }

          .subtitle {
            font-size: 0.75rem;
          }

          .demo-accounts {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default LoginScreen;
