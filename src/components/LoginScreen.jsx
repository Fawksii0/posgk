import { useState } from 'react';

const LoginScreen = ({ waiters, adminCode, onLogin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const managerCode = '9999'; // Manager PIN

  const handleKeyPress = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        validatePin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const validatePin = (inputPin) => {
    if (inputPin === managerCode) {
      onLogin({ role: 'manager', name: 'Manager' });
      return;
    }

    if (inputPin === adminCode) {
      onLogin({ role: 'cashier', name: 'Cashier (Admin)' });
      return;
    }

    const waiter = waiters.find(w => w.pin === inputPin);
    if (waiter) {
      onLogin({ role: 'waiter', name: waiter.name });
    } else {
      setError('Invalid PIN code. Please try again.');
      setPin('');
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card glass-card">
        <div className="login-header">
          <div className="logo-glow"></div>
          <h1 className="gradient-text">G&K POS</h1>
          <p className="subtitle">Enter your 4-digit staff PIN to access</p>
        </div>

        <div className="pin-display">
          <div className={`dots ${error ? 'shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`dot ${pin.length > i ? 'active' : ''}`}></span>
            ))}
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button key={num} className="key-btn" onClick={() => handleKeyPress(num)}>
              {num}
            </button>
          ))}
          <button className="key-btn action-key" onClick={handleClear}>C</button>
          <button className="key-btn" onClick={() => handleKeyPress(0)}>0</button>
          <button className="key-btn action-key" onClick={handleDelete}>⌫</button>
        </div>

        <div className="helper-info">
          <small>Demo PINs: Manager <code>9999</code> | Cashier <code>0000</code> | Waiter <code>1111</code> or <code>2222</code></small>
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
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 2.5rem !important;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          border-radius: 24px !important;
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

        .pin-display {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          min-height: 50px;
        }

        .dots {
          display: flex;
          gap: 1.25rem;
        }

        .dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid var(--glass-border);
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .dot.active {
          background: hsl(var(--primary));
          border-color: hsl(var(--primary));
          box-shadow: 0 0 12px hsl(var(--primary));
          transform: scale(1.2);
        }

        .error-text {
          color: #ff4757;
          font-size: 0.8rem;
          animation: fadeIn 0.3s ease-out;
        }

        .shake {
          animation: shake 0.3s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        .keypad {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          width: 100%;
        }

        .key-btn {
          aspect-ratio: 1.2;
          border-radius: 16px;
          border: 1px solid var(--glass-border);
          background: var(--glass-bg);
          color: hsl(var(--foreground));
          font-size: 1.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .key-btn:hover {
          background: var(--glass-border);
          border-color: hsl(var(--primary) / 0.5);
          transform: translateY(-2px);
        }

        .key-btn:active {
          transform: scale(0.95);
        }

        .action-key {
          font-size: 1.1rem;
          opacity: 0.7;
        }

        .helper-info {
          font-size: 0.75rem;
          opacity: 0.4;
          text-align: center;
        }

        code {
          background: rgba(255, 255, 255, 0.1);
          padding: 0.1rem 0.3rem;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default LoginScreen;
