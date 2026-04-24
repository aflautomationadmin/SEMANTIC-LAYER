import { useEffect, useState } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest, msalInstance } from './authConfig'
import { getBrandAccess } from './brandPermissions'
import { logEvent } from './logger'
import PortalHome from './PortalHome'
import arvindLogo from './assets/arvind-logo.png'
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
              <img src={arvindLogo} alt="Arvind Fashions" className="auth-logo-img" />
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
              <img src={arvindLogo} alt="Arvind Fashions" className="auth-card-logo-img" />
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
  const [signing, setSigning]       = useState(false)
  const [rbac, setRbac]             = useState(undefined) // undefined=loading
  const [activePortal, setActivePortal] = useState(null)
  const [showAdmin, setShowAdmin]   = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !accounts.length) {
      setRbac(undefined)
      return
    }
    const account = accounts[0]
    getBrandAccess(account.username).then(brands => {
      const rbac = {
        displayName: account.name ?? account.username,
        email:       account.username,
        brands,
      }
      setRbac(rbac)
      logEvent(rbac, 'login', {
        brands: brands === null ? 'denied' : brands.length === 0 ? 'all' : brands,
      })
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

  if (rbac === undefined) return null

  if (rbac.brands === null) {
    return <AccessDenied email={rbac.email} />
  }

  // Show portal home if no portal selected
  if (!activePortal && !showAdmin) {
    return (
      <PortalHome
        user={rbac}
        onSelect={portal => { setActivePortal(portal); setShowAdmin(false) }}
        onAdmin={() => { setShowAdmin(true); setActivePortal(null) }}
      />
    )
  }

  // Pass selected portal + back handler to children
  return children({
    user:         rbac,
    allowedBrands: rbac.brands,          // legacy compat (admin check)
    portal:       activePortal,
    showAdmin,
    onBack:       () => { setActivePortal(null); setShowAdmin(false) },
  })
}
