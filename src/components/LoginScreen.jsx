import { useState } from 'react';
import loginLogo from '../../assests/icon.png';
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
      onLogin({ role: 'cashier', name: 'Cashier' });
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
      <div className="login-shell">
        <aside className="brand-side">
          <div className={`brand-panel ${isLogin ? 'slide-up' : 'slide-down'}`}>
            <div className="brand-copy">
              <div className="brand-logo-display">
                <span className="version-badge">BETA</span>
                <img src={loginLogo} alt="Point of Sale logo" className="brand-copy-logo" />
              </div>
              <h2>Point of Sale System</h2>
              <p>Fast, modern restaurant order management for staff and managers.</p>
            </div>
          </div>
        </aside>

        <aside className="auth-side">
          <div className="login-card glass-card">
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

            <div className="auth-panel-header">
              <div className="brand-mini">
                <img src={loginLogo} alt="Point of Sale logo" className="login-logo-sm" />
              </div>
              <h3>{isLogin ? 'Sign in' : 'Create account'}</h3>
            </div>

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

              </form>
            ) : (
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
        </aside>
      </div>

      <style jsx>{`
        .login-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: hsl(0 0% 98%);
          overflow-y: auto;
          z-index: 50;
        }

        .login-shell {
          display: grid;
          grid-template-columns: 1fr minmax(380px, 460px);
          gap: 2.5rem;
          width: min(100%, 1100px);
          margin: 0 auto;
          padding: 1rem;
          align-items: center;
          min-height: 100vh;
        }

        .brand-side {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-panel {
          width: 100%;
          max-width: 380px;
          margin: 0 auto;
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(255, 167, 57, 0.28);
          border-radius: 24px;
          padding: 1.4rem 1.2rem;
          box-shadow: 0 16px 48px rgba(37, 34, 15, 0.07);
          display: grid;
          gap: 0.9rem;
          text-align: center;
          transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s;
          z-index: 1;
        }

        .brand-panel.slide-up {
          transform: translateY(-40px);
        }

        .brand-panel.slide-down {
          transform: translateY(0);
        }

        .brand-logo-wrap {
          width: clamp(160px, 26vw, 260px);
          height: clamp(160px, 26vw, 260px);
          margin: 0 auto;
          padding: 0;
          border-radius: 0;
          background: transparent;
          border: none;
          display: grid;
          place-items: center;
          box-shadow: none;
        }

        .brand-logo-display {
          margin-bottom: 0.5rem;
          animation: fadeInScale 0.6s ease-out;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.8rem;
        }

        .version-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ff8a00;
          color: white;
          font-size: 0.75rem;
          font-weight: 800;
          padding: 0.35rem 0.6rem;
          border-radius: 6px;
          letter-spacing: 0.5px;
          box-shadow: 0 6px 14px rgba(255, 138, 0, 0.18);
          text-transform: uppercase;
        }

        .brand-copy-logo {
          width: clamp(140px, 22vw, 200px);
          max-height: 25vh;
          height: auto;
          display: block;
          object-fit: contain;
          transform-origin: center center;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.06));
        }

        .brand-copy h2 {
          margin: 0;
          font-size: clamp(1.2rem, 1.5vw, 1.5rem);
          line-height: 1.05;
          letter-spacing: -0.02em;
          color: hsl(var(--foreground));
          font-weight: 700;
        }

        .brand-copy p {
          margin: 0;
          color: hsl(var(--foreground) / 0.7);
          font-size: 0.9rem;
          line-height: 1.5;
          font-weight: 500;
        }

        .auth-side {
          width: 100%;
        }

        .login-card {
          width: 100%;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 28px;
          box-shadow: 0 24px 72px rgba(33, 34, 34, 0.09);
          padding: 2rem 1.8rem;
          display: grid;
          gap: 1.3rem;
          color: hsl(var(--foreground));
          position: relative;
          z-index: 4;
        }

        .auth-panel-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.4rem 0 0.8rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.5);
        }

        .brand-mini {
          width: clamp(90px, 10vw, 120px);
          height: clamp(90px, 10vw, 120px);
          display: grid;
          place-items: center;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.98);
          border: 1.5px solid rgba(255, 167, 57, 0.2);
          flex-shrink: 0;
          z-index: 3;
          box-shadow: 0 6px 18px rgba(255, 173, 61, 0.08);
        }

        .login-logo-sm {
          width: clamp(60px, 8vw, 90px);
          height: clamp(60px, 8vw, 90px);
          object-fit: contain;
        }

        .auth-panel-header h3 {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 700;
          color: hsl(var(--foreground));
        }

        .auth-tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.7rem;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          border: 1.5px solid rgba(255, 255, 255, 0.75);
          padding: 0.4rem;
          margin-bottom: 0.3rem;
        }

        .tab-btn {
          border: none;
          background: transparent;
          color: hsl(var(--foreground) / 0.6);
          font-weight: 700;
          border-radius: 14px;
          padding: 0.8rem 0.9rem;
          cursor: pointer;
          transition: all 0.25s ease;
          font-size: 0.9rem;
        }

        .tab-btn:hover {
          color: hsl(var(--foreground) / 0.8);
          background: rgba(255, 173, 61, 0.08);
        }

        .tab-btn.active {
          background: hsl(var(--primary) / 0.12);
          color: hsl(var(--foreground));
          box-shadow: 0 4px 16px rgba(255, 146, 31, 0.15);
          font-weight: 800;
        }

        .auth-form {
          display: grid;
          gap: 1rem;
        }

        .form-group {
          display: grid;
          gap: 0.5rem;
        }

        .form-group label {
          font-size: 0.9rem;
          font-weight: 700;
          color: hsl(var(--foreground) / 0.85);
          letter-spacing: -0.01em;
        }

        .form-group input {
          width: 100%;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          border: 1.5px solid rgba(23, 23, 23, 0.1);
          background: rgba(255, 255, 255, 0.95);
          color: hsl(var(--foreground));
          transition: all 0.25s ease;
          font-size: 0.92rem;
          font-weight: 500;
        }

        .form-group input::placeholder {
          color: hsl(var(--foreground) / 0.5);
          font-weight: 400;
        }

        .form-group input:hover {
          border-color: rgba(255, 173, 61, 0.3);
          background: rgba(255, 255, 255, 0.98);
        }

        .form-group input:focus {
          outline: none;
          border-color: rgba(255, 173, 61, 0.9);
          box-shadow: 0 0 0 8px rgba(255, 173, 61, 0.12);
          background: rgba(255, 255, 255, 1);
        }

        .btn-full {
          width: 100%;
          border-radius: 16px;
          padding: 1rem 1.1rem;
          font-weight: 700;
          font-size: 0.95rem;
          box-shadow: 0 10px 28px rgba(255, 146, 31, 0.2);
          transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          border: none;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .btn-primary {
          background: #ff8a00;
          color: white;
        }

        .btn-primary:hover {
          box-shadow: 0 14px 36px rgba(255, 146, 31, 0.3);
          transform: translateY(-2px);
        }

        .btn-primary:active {
          transform: translateY(0);
        }

        .demo-accounts {
          display: grid;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.68);
          border: 1px solid rgba(255, 255, 255, 0.72);
        }

        .demo-title {
          margin: 0;
          color: hsl(var(--foreground) / 0.75);
          font-size: 0.88rem;
          font-weight: 700;
        }

        .demo-list {
          display: grid;
          gap: 0.6rem;
        }

        .demo-item {
          padding: 0.9rem 1rem;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.85);
          color: hsl(var(--foreground) / 0.82);
        }

        .demo-item strong {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.96rem;
        }

        .demo-item code {
          display: block;
          font-size: 0.82rem;
          padding: 0.4rem 0.65rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.9);
          color: hsl(var(--foreground) / 0.7);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
        }

        .auth-footer {
          text-align: center;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.5);
        }

        .auth-footer p {
          margin: 0;
          color: hsl(var(--foreground) / 0.75);
          font-size: 0.95rem;
          font-weight: 500;
        }

        .link-btn {
          border: none;
          background: none;
          color: hsl(var(--primary));
          cursor: pointer;
          font-weight: 800;
          text-decoration: none;
          transition: all 0.2s ease;
          padding: 0;
          margin: 0;
        }

        .link-btn:hover {
          opacity: 0.8;
          text-decoration: underline;
        }

        .error-message,
        .success-message {
          margin: 0;
          padding: 1rem 1.2rem;
          border-radius: 14px;
          font-size: 0.93rem;
          line-height: 1.5;
          font-weight: 500;
          animation: slideDown 0.3s ease;
        }

        .error-message {
          background: rgba(255, 81, 102, 0.12);
          border: 1.5px solid rgba(255, 81, 102, 0.25);
          color: #d63d52;
        }

        .success-message {
          background: rgba(63, 181, 201, 0.12);
          border: 1.5px solid rgba(63, 181, 201, 0.3);
          color: #1d7e97;
        }

        @media (max-width: 1024px) {
          .login-shell {
            grid-template-columns: 1fr;
            gap: 1.5rem;
            padding: 1rem;
            min-height: auto;
          }

          .brand-side {
            justify-content: center;
          }

          .brand-panel {
            padding: 1.5rem;
            border-radius: 24px;
            transform: translateY(0) !important;
          }

          .brand-copy-logo {
            width: clamp(100px, 28vw, 220px);
            max-height: 28vh;
          }

          .brand-mini {
            display: none;
          }

          .login-card {
            padding: 2rem 1.5rem;
          }
        }

        @media (max-width: 640px) {
          .login-shell {
            gap: 1rem;
          }

          .login-card {
            padding: 1.6rem 1.2rem;
            border-radius: 24px;
          }

          .auth-panel-header {
            gap: 0.8rem;
          }

          .auth-panel-header h3 {
            font-size: 1.25rem;
          }

          .auth-tabs {
            grid-template-columns: 1fr;
            gap: 0.6rem;
          }

          .demo-accounts {
            padding: 0.9rem;
          }

          .btn-full {
            padding: 0.95rem 1rem;
            font-size: 0.9rem;
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default LoginScreen;
