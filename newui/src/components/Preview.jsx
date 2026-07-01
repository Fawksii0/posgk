import React from 'react'

export default function Preview({org,onBack}){
  return (
    <div className="preview-shell">
      <main className="preview-card">
        <h1>Dashboard (Preview)</h1>
        {org ? <p>Organization: <strong>{org.name}</strong> ({org.currency})</p> : <p>No organization</p>}
        <p>This is a placeholder dashboard to show successful organization creation.</p>
        <button onClick={onBack}>Sign out</button>
      </main>
    </div>
  )
}
