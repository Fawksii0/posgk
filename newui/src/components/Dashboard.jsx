import React from 'react'

const navItems = [
  { label: 'Dashboard', icon: `${import.meta.env.BASE_URL}assets/home-icon.png` },
  { label: 'Sales Analytics', icon: `${import.meta.env.BASE_URL}assets/analysis-icon.png` },
  { label: 'Staff Performance', icon: `${import.meta.env.BASE_URL}assets/staff-icon.png` },
  { label: 'Menu Builder', icon: `${import.meta.env.BASE_URL}assets/menu-icon.png` },
  { label: 'Inventory', icon: `${import.meta.env.BASE_URL}assets/inventory-icon.png` },
]

const secondaryItems = [
  { label: 'Support', icon: `${import.meta.env.BASE_URL}assets/support-icon.png` },
  { label: 'Settings', icon: `${import.meta.env.BASE_URL}assets/settings-icon (2).png` },
]

export default function Dashboard({ org, profile, plan, onSignOut }){
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="brand-block">
          <img src={`${import.meta.env.BASE_URL}assets/spark-black.png`} alt="Spark" style={{width: '48px', height: '48px'}} />
          <span className="beta-tag">BETA</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.label} title={item.label}>
              <img src={item.icon} alt={item.label} style={{width: '20px', height: '20px', opacity: 0.7}} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-secondary">
          {secondaryItems.map(item => (
            <button key={item.label} title={item.label}>
              <img src={item.icon} alt={item.label} style={{width: '20px', height: '20px', opacity: 0.7}} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <button 
          className="button-secondary" 
          onClick={onSignOut}
          style={{marginTop: 'auto', width: '100%', justifyContent: 'center'}}
        >
          Sign out
        </button>
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <p className="panel-eyebrow">Welcome back</p>
            <h1>{org?.name || 'Your organization'} HQ</h1>
            <p className="panel-sub">Preview your performance and manage your first location from one clean workspace.</p>
          </div>
        </div>

        <div className="metrics-grid">
          <section className="metric-card">
            <h2>📋 Current plan</h2>
            <p>{plan?.title || 'Starter'}</p>
            <small>{plan?.price || 'Free'}</small>
          </section>
          <section className="metric-card">
            <h2>📍 Location</h2>
            <p>{org?.location || 'Single location'}</p>
            <small>{org?.currency} • {org?.tz}</small>
          </section>
          <section className="metric-card wide-card">
            <h2>👤 Profile</h2>
            <p>{profile?.firstName} {profile?.lastName}</p>
            <small>{profile?.country} • {profile?.phone}</small>
          </section>
        </div>

        <div className="dashboard-panels">
          <section className="panel-block">
            <h2>📊 Sales overview</h2>
            <div className="placeholder-block">Chart visualization coming soon</div>
          </section>
          <section className="panel-block">
            <h2>👥 Staff performance</h2>
            <div className="placeholder-block">Performance metrics coming soon</div>
          </section>
        </div>
      </main>
    </div>
  )
}
