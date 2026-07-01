import React, { useState } from 'react'

const plans = [
  { id: 'starter', title: '🚀 Starter', description: 'Great for restaurants launching quickly.', price: 'Free', features: ['One location', 'Basic reports', 'Staff login'] },
  { id: 'pro', title: '⭐ Pro', description: 'Includes menu and inventory tools for growing kitchens.', price: '$29 / mo', features: ['Unlimited locations', 'Advanced analytics', 'Priority support'] }
]

export default function Plan({ selectedPlan, onSelect, onNext, onBack }){
  const [planId, setPlanId] = useState(selectedPlan?.id || 'starter')

  function submit(e){
    e.preventDefault()
    const plan = plans.find(item=>item.id===planId)
    onNext(plan)
  }

  return (
    <div className="plan-shell">
      <main className="plan-card">
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">💰 Get started in minutes</p>
            <h1>Choose your plan.</h1>
            <p className="panel-sub">Select the plan that powers your kitchen.</p>
          </div>
        </div>

        <form className="plan-grid" onSubmit={submit}>
          {plans.map((plan)=>(
            <label key={plan.id} className={`plan-option ${planId===plan.id ? 'selected' : ''}`}>
              <input type="radio" name="plan" value={plan.id} checked={planId===plan.id} onChange={()=>setPlanId(plan.id)} />
              <div className="plan-content">
                <div>
                  <strong>{plan.title}</strong>
                  <p>{plan.description}</p>
                </div>
                <div className="plan-price">{plan.price}</div>
              </div>
              <ul className="plan-features">
                {plan.features.map(feature=> <li key={feature}>{feature}</li>)}
              </ul>
            </label>
          ))}

          <div className="form-actions split full-width">
            <button type="button" className="button-secondary" onClick={onBack}>Back</button>
            <button type="submit" className="button-primary">Next</button>
          </div>
        </form>
      </main>
    </div>
  )
}
