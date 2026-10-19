import Uicon from './Uicon';

const LandingPage = ({ onGetStarted, onLogin }) => {
  return (
    <div className="landing-page">
      <header className="landing-header glass-card">
        <div className="landing-brand">
          <img src="/gk-emblem.png" alt="G&K emblem" className="landing-logo" />
          <div>
            <div className="landing-brand-title">Spark</div>
            <div className="landing-brand-subtitle">Restaurant Management</div>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={onLogin}>Sign in</button>
      </header>

      <section className="hero-section glass-card">
        <div className="hero-copy">
          <span className="hero-pill">Built for restaurants</span>
          <h1>Fast restaurant management that keeps your team moving.</h1>
          <p>
            Spark helps restaurants serve faster, manage staff, and simplify orders with one elegant platform.
            Launch orders, track tables, and scale from a single location to multi-store operations.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onGetStarted}>Start free trial</button>
            <button className="btn btn-secondary" onClick={onLogin}>Sign in</button>
          </div>
        </div>
        <div className="hero-features">
          <div className="feature-card">
            <Uicon icon="fi-rr-bell" className="feature-icon" />
            <h3>Order flow</h3>
            <p>Speed up table service with instant order updates for waiters and cashiers.</p>
          </div>
          <div className="feature-card">
            <Uicon icon="fi-rr-users" className="feature-icon" />
            <h3>Team roles</h3>
            <p>Manager, cashier and waiter roles keep workflows organized and secure.</p>
          </div>
          <div className="feature-card">
            <Uicon icon="fi-rr-wallet" className="feature-icon" />
            <h3>Pricing plans</h3>
            <p>Choose the right Spark plan for your restaurant — scaling from core operations to full service.</p>
          </div>
        </div>
      </section>

      <section className="pricing-section">
        <div className="pricing-card glass-card featured">
          <div className="pricing-header">Spark Plus</div>
          <div className="pricing-price">$29<span>/mo</span></div>
          <div className="pricing-meta">Ideal for small restaurants and cafes</div>
          <ul>
            <li>Unlimited menu items</li>
            <li>Waiter & cashier workflows</li>
            <li>Live order notifications</li>
            <li>Email support</li>
          </ul>
          <button className="btn btn-primary" onClick={onGetStarted}>Choose Spark Plus</button>
        </div>
        <div className="pricing-card glass-card">
          <div className="pricing-header">Spark Pro</div>
          <div className="pricing-price">$69<span>/mo</span></div>
          <div className="pricing-meta">Perfect for full-service restaurants and small chains</div>
          <ul>
            <li>Everything in Spark Plus</li>
            <li>Manager portal and user approvals</li>
            <li>Advanced menu builder</li>
            <li>Priority support</li>
          </ul>
          <button className="btn btn-secondary" onClick={onGetStarted}>Choose Spark Pro</button>
        </div>
      </section>

      <section className="landing-cta glass-card">
        <div>
          <h2>One platform for your restaurant team</h2>
          <p>From front-of-house to back-office, Spark keeps your restaurant running with clarity and speed.</p>
        </div>
        <button className="btn btn-primary" onClick={onGetStarted}>Start free trial</button>
      </section>

      <style>{`
        .landing-page {
          min-height: 100vh;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .landing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          backdrop-filter: blur(16px);
        }
        .landing-brand {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .landing-logo {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          object-fit: contain;
        }
        .landing-brand-title {
          font-size: 1.25rem;
          font-weight: 700;
        }
        .landing-brand-subtitle {
          font-size: 0.95rem;
          color: rgba(17,24,39,0.72);
        }
        .hero-section {
          display: grid;
          grid-template-columns: 1.25fr 1fr;
          gap: 2rem;
          padding: 2rem;
        }
        .hero-copy h1 {
          margin: 0;
          font-size: clamp(2.5rem, 4vw, 4rem);
          line-height: 1.02;
        }
        .hero-copy p {
          max-width: 620px;
          margin: 1rem 0 1.5rem;
          color: rgba(17,24,39,0.75);
          font-size: 1rem;
          line-height: 1.7;
        }
        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .hero-features {
          display: grid;
          gap: 1rem;
        }
        .feature-card {
          padding: 1.25rem;
          border-radius: 24px;
          background: rgba(255,255,255,0.85);
          border: 1px solid rgba(17,24,39,0.07);
          min-height: 130px;
        }
        .feature-icon {
          font-size: 1.5rem;
          color: hsl(var(--primary));
        }
        .feature-card h3 {
          margin: 0.75rem 0 0.5rem;
        }
        .feature-card p {
          margin: 0;
          color: rgba(17,24,39,0.65);
          font-size: 0.96rem;
          line-height: 1.6;
        }
        .hero-pill {
          display: inline-flex;
          padding: 0.45rem 0.85rem;
          border-radius: 999px;
          background: hsl(var(--secondary));
          color: hsl(var(--icon-color));
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 0.76rem;
          margin-bottom: 1rem;
        }
        .pricing-section {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.5rem;
        }
        .pricing-card {
          padding: 1.75rem;
          border-radius: 24px;
          border: 1px solid rgba(17,24,39,0.08);
          min-height: 420px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .featured {
          background: linear-gradient(180deg, hsl(var(--primary) / 0.18), rgba(255, 255, 255, 0.8));
          border-color: hsl(var(--primary) / 0.45);
        }
        .pricing-header {
          font-size: 1.2rem;
          font-weight: 700;
        }
        .pricing-price {
          font-size: 3rem;
          font-weight: 800;
          line-height: 1;
        }
        .pricing-price span {
          font-size: 1rem;
          font-weight: 600;
          color: rgba(17,24,39,0.7);
        }
        .pricing-meta {
          color: rgba(17,24,39,0.7);
          font-size: 0.95rem;
        }
        .pricing-card ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.85rem;
          flex: 1;
        }
        .pricing-card li {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          color: rgba(17,24,39,0.75);
          line-height: 1.6;
        }
        .pricing-card li::before {
          content: '•';
          color: hsl(var(--icon-color));
          font-weight: 700;
          display: inline-block;
          width: 1rem;
        }
        .landing-cta {
          padding: 1.75rem;
          border-radius: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          background: rgba(255,255,255,0.9);
          border: 1px solid rgba(17,24,39,0.08);
        }
        .landing-cta h2 {
          margin: 0;
          font-size: 1.55rem;
        }
        .landing-cta p {
          margin: 0.55rem 0 0;
          color: rgba(17,24,39,0.75);
        }

        @media (max-width: 960px) {
          .hero-section, .pricing-section {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 680px) {
          .landing-page {
            padding: 1rem;
          }
          .landing-header, .hero-section, .landing-cta {
            padding: 1rem;
          }
          .hero-copy h1 {
            font-size: 2.25rem;
          }
          .landing-brand-title {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
