import React, { useState } from 'react'
import Login from './components/Login'
import Org from './components/Org'
import Profile from './components/Profile'
import Plan from './components/Plan'
import Dashboard from './components/Dashboard'

export default function App(){
  const [route, setRoute] = useState('org')
  const [org, setOrg] = useState(null)
  const [profile, setProfile] = useState(null)
  const [plan, setPlan] = useState(null)

  function handleLogin(){
    setRoute('org')
  }

  function handleCreateOrg(o){
    setOrg(o)
    setRoute('profile')
  }

  function handleUpdateProfile(data){
    setProfile(data)
    setRoute('plan')
  }

  function handleSelectPlan(selected){
    setPlan(selected)
    setRoute('dashboard')
  }

  function handleSignOut(){
    setRoute('login')
    setOrg(null)
    setProfile(null)
    setPlan(null)
  }

  return (
    <div>
      {route === 'login' && <Login onLogin={handleLogin} />}
      {route === 'org' && <Org onCreate={handleCreateOrg} onBack={()=>setRoute('login')} />}
      {route === 'profile' && <Profile profile={profile} onUpdate={handleUpdateProfile} onBack={()=>setRoute('org')} />}
      {route === 'plan' && <Plan selectedPlan={plan} onSelect={setPlan} onNext={handleSelectPlan} onBack={()=>setRoute('profile')} />}
      {route === 'dashboard' && <Dashboard org={org} profile={profile} plan={plan} onSignOut={handleSignOut} />}
    </div>
  )
}
