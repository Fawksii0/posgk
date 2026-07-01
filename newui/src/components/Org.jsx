import React, {useState} from 'react'

export default function Org({onCreate, onBack}){
  const [name,setName]=useState('')
  const [location,setLocation]=useState('')
  const [currency,setCurrency]=useState('USD')
  const [tz,setTz]=useState('UTC')

  function submit(e){
    e.preventDefault()
    if(!name) return alert('Organization name is required')
    onCreate({name,location,currency,tz})
  }

  return (
    <div className="org-shell">
      <main className="org-panel">
        <div className="org-card">
          <div className="org-header">
            <img src={`${import.meta.env.BASE_URL}assets/spark-black.png`} alt="Spark logo" className="org-logo" />
            <p className="panel-eyebrow">🏢 Create your organization</p>
            <h1>Set up your restaurant or organization</h1>
            <p className="org-sub">Start with a single location. Free tier allows one organization per account.</p>
          </div>

          <form className="org-form" onSubmit={submit}>
            <label>
              Organization name
              <input value={name} onChange={(e)=>setName(e.target.value)} required placeholder="e.g. Sunrise Cafe" />
            </label>

            <label>
              Location / Address (optional)
              <input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="City, State or full address" />
            </label>

            <div className="org-grid">
              <label>
                Primary currency
                <select value={currency} onChange={(e)=>setCurrency(e.target.value)}>
                  <option value="USD">United States Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="GBP">British Pound (GBP)</option>
                </select>
              </label>

              <label>
                Timezone
                <select value={tz} onChange={(e)=>setTz(e.target.value)}>
                  <option>UTC</option>
                  <option>America/New_York</option>
                  <option>Europe/London</option>
                </select>
              </label>
            </div>

            <div className="org-actions split">
              <button type="button" className="button-secondary" onClick={onBack}>Back</button>
              <button type="submit" className="button-primary">Create organization</button>
            </div>
          </form>

          <div className="org-note">You can add more locations later if you upgrade. For the free tier, you're limited to one organization per account.</div>
        </div>
      </main>
    </div>
  )
}
