import React, { useState } from 'react'

export default function Profile({ profile, onUpdate, onBack }){
  const [firstName, setFirstName] = useState(profile?.firstName || '')
  const [lastName, setLastName] = useState(profile?.lastName || '')
  const [country, setCountry] = useState(profile?.country || 'United States')
  const [phone, setPhone] = useState(profile?.phone || '')

  function submit(e){
    e.preventDefault()
    onUpdate({ firstName, lastName, country, phone })
  }

  return (
    <div className="profile-shell">
      <main className="profile-card">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">👤 Set up your profile</p>
            <h1>Set up your profile and get started in minutes.</h1>
          </div>
          <div className="profile-avatar">
            {(firstName?.charAt(0) || 'U').toUpperCase()}
          </div>
        </div>

        <form className="profile-form" onSubmit={submit}>
          <label>
            Firstname
            <input value={firstName} onChange={(e)=>setFirstName(e.target.value)} placeholder="e.g. John" required />
          </label>

          <label>
            Lastname
            <input value={lastName} onChange={(e)=>setLastName(e.target.value)} placeholder="e.g. Doe" required />
          </label>

          <label>
            Country
            <input value={country} onChange={(e)=>setCountry(e.target.value)} placeholder="United States" required />
          </label>

          <label>
            Phone Number
            <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="(+1) 000-000-000" required />
          </label>

          <div className="form-actions split">
            <button type="button" className="button-secondary" onClick={onBack}>Back</button>
            <button type="submit" className="button-primary">Next</button>
          </div>
        </form>
      </main>
    </div>
  )
}
