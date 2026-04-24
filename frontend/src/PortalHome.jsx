import { useState, useEffect } from 'react'
import { msalInstance } from './authConfig'
import arvindLogo from './assets/arvind-logo.png'
import './PortalHome.css'

export default function PortalHome({ user, onSelect, onAdmin }) {
  const [portals, setPortals]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const isAdmin = user.brands && user.brands.length === 0

  useEffect(() => {
    fetch(`/permissions-api/my-portals?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setPortals(data.portals || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user.email])

  return (
    <div className="ph-bg">
      {/* Header */}
      <header className="ph-header">
        <div className="ph-logo">
          <img src={arvindLogo} alt="Arvind Fashions" className="ph-logo-img" />
        </div>
        <div className="ph-header-title">Arvind Analytics</div>
        <div className="ph-header-right">
          <span className="ph-user">{user.displayName}</span>
          {isAdmin && (
            <button className="ph-btn-admin" onClick={onAdmin}>⚙ Admin</button>
          )}
          <button className="ph-btn-signout" onClick={() => msalInstance.logoutRedirect()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="ph-main">
        <div className="ph-hero">
          <h1 className="ph-hero-title">Data Download Portals</h1>
          <p className="ph-hero-sub">Select a portal to explore and export data</p>
        </div>

        {loading && (
          <div className="ph-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="ph-card ph-card-skeleton" />
            ))}
          </div>
        )}

        {error && (
          <div className="ph-error">
            <span>⚠ Could not load portals: {error}</span>
          </div>
        )}

        {!loading && !error && portals.length === 0 && (
          <div className="ph-empty">
            <div className="ph-empty-icon">🔒</div>
            <p>You don't have access to any portals yet.</p>
            <p className="ph-empty-hint">Contact your administrator to request access.</p>
          </div>
        )}

        {!loading && !error && portals.length > 0 && (
          <div className="ph-grid">
            {portals.map(portal => (
              <div key={portal.id} className="ph-card" onClick={() => onSelect(portal)}>
                <div className="ph-card-icon">📊</div>
                <div className="ph-card-body">
                  <div className="ph-card-name">{portal.name}</div>
                  {portal.description && (
                    <div className="ph-card-desc">{portal.description}</div>
                  )}
                  <div className="ph-card-meta">
                    <span className="ph-card-view">{portal.view_name}</span>
                    {portal.restrict_values && portal.restrict_values.length > 0 && (
                      <span className="ph-card-restrict">
                        🔒 {portal.restrict_values.join(' · ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ph-card-arrow">→</div>
              </div>
            ))}

            {/* Admin: Add new portal card */}
            {isAdmin && (
              <div className="ph-card ph-card-add" onClick={onAdmin}>
                <div className="ph-card-icon">➕</div>
                <div className="ph-card-body">
                  <div className="ph-card-name">Add Portal</div>
                  <div className="ph-card-desc">Configure a new Fabric view as a download portal</div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
