import React from 'react'

export default function Login({onLogin}){
  return (
    <div className="login-shell single-panel">
      <section className="login-panel">
        <div className="login-card">
          <div className="login-header">
            <img src={`${import.meta.env.BASE_URL}assets/spark-black.png`} alt="Spark wordmark logo" className="login-wordmark" />
            <p className="login-eyebrow">🔐 Sign in securely</p>
            <h2>Welcome back</h2>
          </div>

          <form className="login-form" onSubmit={(e)=>{e.preventDefault(); onLogin();}}>
            <label>
              Email address
              <input type="email" placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input type="password" placeholder="Enter your password" />
            </label>

            <div className="login-actions">
              <label className="checkbox-label">
                <input type="checkbox" /> Remember me
              </label>
              <a href="#">Forgot password?</a>
            </div>

            <button type="submit">Continue</button>
          </form>

          <div className="login-footer">
            <p>New here? <a href="#">Create an account</a></p>
          </div>
        </div>
      </section>
    </div>
  )
}
