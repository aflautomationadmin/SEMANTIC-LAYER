import { useEffect, useState } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest, msalInstance } from './authConfig'
import { getBrandAccess } from './brandPermissions'
import './AuthWrapper.css'

// ── Microsoft logo (no external dependency) ──────────────────────────────
function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

// ── Login page ────────────────────────────────────────────────────────────
function LoginPage({ onLogin, loading }) {
  return (
    <div className="auth-bg">
      <div className="auth-split">

        {/* Left panel — branding */}
        <div className="auth-panel-left">
          <div className="auth-brand">
            <div className="auth-logo-wrap">
              <img src="/arvind-logo.png" alt="Arvind Fashions" className="auth-logo-img" />
            </div>
            <h1>Arvind Analytics</h1>
            <p>Enterprise sales intelligence platform</p>
          </div>
          <div className="auth-tagline">
            <div className="auth-feature">📊 POS &amp; AIL Sales Data</div>
            <div className="auth-feature">🔒 Role-Based Brand Access</div>
            <div className="auth-feature">⬇️ Bulk CSV Export</div>
          </div>
        </div>

        {/* Right panel — sign in */}
        <div className="auth-panel-right">
          <div className="auth-card">
            <div className="auth-card-logo">
              <img src="/arvind-logo.png" alt="Arvind Fashions" className="auth-card-logo-img" />
            </div>
            <h2 className="auth-title">Welcome back</h2>
            <p className="auth-subtitle">
              Sign in with your Arvind Fashions Microsoft account to continue.
            </p>

            <button
              className="ms-btn"
              onClick={onLogin}
              disabled={loading}
            >
              {loading
                ? <span className="auth-spinner" />
                : <MicrosoftIcon />}
              {loading ? 'Redirecting…' : 'Sign in with Microsoft'}
            </button>

            <p className="auth-footer">
              By signing in you agree to Arvind&apos;s data access policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Access denied page ────────────────────────────────────────────────────
function AccessDenied({ email }) {
  return (
    <div className="auth-bg">
      <div className="auth-center-card">
        <div className="auth-denied-icon">🚫</div>
        <h2>Access Denied</h2>
        <p>
          <strong>{email}</strong> is not authorised to access this application.
        </p>
        <p className="auth-denied-hint">
          Contact your administrator to request access.
        </p>
        <button
          className="ms-btn ms-btn-outline"
          onClick={() => msalInstance.logoutRedirect()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// ── Auth wrapper ──────────────────────────────────────────────────────────
export default function AuthWrapper({ children }) {
  const { accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [signing, setSigning]   = useState(false)
  const [rbac, setRbac]         = useState(undefined) // undefined=loading

  useEffect(() => {
    if (!isAuthenticated || !accounts.length) {
      setRbac(undefined)
      return
    }
    const account = accounts[0]
    setRbac({
      displayName: account.name ?? account.username,
      email:       account.username,
      brands:      getBrandAccess(account.username),
    })
  }, [isAuthenticated, accounts])

  if (!isAuthenticated) {
    return (
      <LoginPage
        loading={signing}
        onLogin={() => {
          setSigning(true)
          msalInstance.loginRedirect(loginRequest).catch(() => setSigning(false))
        }}
      />
    )
  }

  // Still resolving RBAC (instantaneous in practice)
  if (rbac === undefined) return null

  if (rbac.brands === null) {
    return <AccessDenied email={rbac.email} />
  }

  return children({ user: rbac, allowedBrands: rbac.brands })
}
