import { useState, useEffect } from 'react'
import { ALL_BRANDS, loadPermissions, savePermissions } from './brandPermissions'
import arvindLogo from './assets/arvind-logo.png'
import './AdminPage.css'

// ── Helpers ───────────────────────────────────────────────────────────────
function getAllUsers(config) {
  const set = new Set(config.admins.map(e => e.toLowerCase()))
  Object.values(config.brands).forEach(users =>
    users.forEach(u => set.add(u.toLowerCase()))
  )
  // preserve original casing from admins + brand lists
  const caseMap = {}
  config.admins.forEach(e => { caseMap[e.toLowerCase()] = e })
  Object.values(config.brands).forEach(users =>
    users.forEach(u => { if (!caseMap[u.toLowerCase()]) caseMap[u.toLowerCase()] = u })
  )
  return [...set].sort().map(e => caseMap[e])
}

function getUserAccess(config, email) {
  const e = email.toLowerCase()
  if (config.admins.some(a => a.toLowerCase() === e)) return { type: 'admin', brands: [] }
  const brands = Object.entries(config.brands)
    .filter(([, users]) => users.some(u => u.toLowerCase() === e))
    .map(([b]) => b)
  return { type: 'brand', brands }
}

// ── Brand checkbox group ──────────────────────────────────────────────────
function BrandCheckboxes({ selected, onChange }) {
  const toggle = b => onChange(
    selected.includes(b) ? selected.filter(x => x !== b) : [...selected, b]
  )
  return (
    <div className="brand-checkboxes">
      {ALL_BRANDS.map(b => (
        <label key={b} className={`brand-check-item ${selected.includes(b) ? 'checked' : ''}`}>
          <input
            type="checkbox"
            checked={selected.includes(b)}
            onChange={() => toggle(b)}
          />
          {b}
        </label>
      ))}
    </div>
  )
}

// ── Edit User Modal ───────────────────────────────────────────────────────
function EditModal({ user, config, onSave, onClose }) {
  const current = getUserAccess(config, user)
  const [accessType, setAccessType] = useState(current.type)
  const [brands, setBrands]         = useState(current.brands)

  const save = () => {
    const c = structuredClone(config)
    const e = user.toLowerCase()

    // Remove from admins
    c.admins = c.admins.filter(a => a.toLowerCase() !== e)
    // Remove from all brand lists
    Object.keys(c.brands).forEach(b => {
      c.brands[b] = c.brands[b].filter(u => u.toLowerCase() !== e)
    })

    if (accessType === 'admin') {
      c.admins.push(user)
    } else {
      brands.forEach(b => {
        if (!c.brands[b]) c.brands[b] = []
        c.brands[b].push(user)
      })
    }
    onSave(c)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Access</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-email">{user}</div>

        <div className="modal-section">
          <label className="modal-label">Access Level</label>
          <div className="access-type-row">
            <label className={`access-type-btn ${accessType === 'admin' ? 'active' : ''}`}>
              <input type="radio" name="type" value="admin"
                checked={accessType === 'admin'}
                onChange={() => setAccessType('admin')} />
              👑 Full Access (Admin)
            </label>
            <label className={`access-type-btn ${accessType === 'brand' ? 'active' : ''}`}>
              <input type="radio" name="type" value="brand"
                checked={accessType === 'brand'}
                onChange={() => setAccessType('brand')} />
              🏷️ Brand Specific
            </label>
          </div>
        </div>

        {accessType === 'brand' && (
          <div className="modal-section">
            <label className="modal-label">Allowed Brands</label>
            <BrandCheckboxes selected={brands} onChange={setBrands} />
            {brands.length === 0 && (
              <p className="modal-warn">⚠ No brands selected — user will have no access.</p>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={save}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}

// ── Add User Form ─────────────────────────────────────────────────────────
function AddUserForm({ config, onSave }) {
  const [email, setEmail]           = useState('')
  const [accessType, setAccessType] = useState('brand')
  const [brands, setBrands]         = useState([])
  const [error, setError]           = useState('')

  const submit = () => {
    // Parse comma-separated emails
    const emails = email.split(',').map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) { setError('Enter at least one email.'); return }

    const invalid = emails.find(e => !e.includes('@'))
    if (invalid) { setError(`Invalid email: ${invalid}`); return }

    if (accessType === 'brand' && brands.length === 0) {
      setError('Select at least one brand.'); return
    }

    const existingUsers = getAllUsers(config).map(u => u.toLowerCase())
    const duplicates = emails.filter(e => existingUsers.includes(e.toLowerCase()))
    if (duplicates.length > 0) {
      setError(`Already exists: ${duplicates.join(', ')}`); return
    }

    const c = structuredClone(config)
    emails.forEach(e => {
      if (accessType === 'admin') {
        c.admins.push(e)
      } else {
        brands.forEach(b => {
          if (!c.brands[b]) c.brands[b] = []
          c.brands[b].push(e)
        })
      }
    })
    onSave(c)
    setEmail(''); setBrands([]); setAccessType('brand'); setError('')
  }

  return (
    <div className="add-user-card">
      <h3 className="add-user-title">Add New User</h3>

      <div className="add-user-row">
        <div className="add-field">
          <label className="field-label">Email Address <span style={{fontWeight:400,color:'#888'}}>(comma-separated for multiple)</span></label>
          <input
            className="field-input"
            type="text"
            placeholder="user1@arvindfashions.com, user2@arvindfashions.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        <div className="add-field">
          <label className="field-label">Access Level</label>
          <div className="access-type-row">
            <label className={`access-type-btn ${accessType === 'admin' ? 'active' : ''}`}>
              <input type="radio" name="new-type" value="admin"
                checked={accessType === 'admin'}
                onChange={() => setAccessType('admin')} />
              👑 Full Access
            </label>
            <label className={`access-type-btn ${accessType === 'brand' ? 'active' : ''}`}>
              <input type="radio" name="new-type" value="brand"
                checked={accessType === 'brand'}
                onChange={() => setAccessType('brand')} />
              🏷️ Brand Specific
            </label>
          </div>
        </div>
      </div>

      {accessType === 'brand' && (
        <div className="add-field">
          <label className="field-label">Allowed Brands</label>
          <BrandCheckboxes selected={brands} onChange={setBrands} />
        </div>
      )}

      {error && <p className="add-error">{error}</p>}

      <button className="btn-add" onClick={submit}>+ Add User</button>
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────
export default function AdminPage({ currentUser, onBack }) {
  const [config, setConfig] = useState(null)
  const [editUser, setEditUser] = useState(null)
  const [tab, setTab]       = useState('users')  // 'users' | 'brands'
  const [search, setSearch] = useState('')
  const [saved, setSaved]   = useState(false)

  // Load permissions from API on mount
  useEffect(() => {
    loadPermissions().then(setConfig)
  }, [])

  const persist = async (newConfig) => {
    setConfig(newConfig)
    await savePermissions(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Show loading state while config is fetching
  if (!config) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontSize:14, color:'#888' }}>
        Loading permissions…
      </div>
    )
  }

  const removeUser = (email) => {
    const c = structuredClone(config)
    const e = email.toLowerCase()
    c.admins = c.admins.filter(a => a.toLowerCase() !== e)
    Object.keys(c.brands).forEach(b => {
      c.brands[b] = c.brands[b].filter(u => u.toLowerCase() !== e)
    })
    persist(c)
  }

  const users = getAllUsers(config).filter(u =>
    u.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="admin-page">
      {/* ── Header ── */}
      <header className="admin-header">
        <div className="admin-header-left">
          <img src={arvindLogo} alt="Arvind" className="admin-logo" />
          <div className="admin-title-wrap">
            <span className="admin-title">Access Management</span>
            <span className="admin-sub">Brand-level RBAC</span>
          </div>
        </div>
        <div className="admin-header-right">
          {saved && <span className="save-toast">✓ Saved</span>}
          <span className="admin-user">{currentUser.displayName}</span>
          <button className="btn-back" onClick={onBack}>← Dashboard</button>
        </div>
      </header>

      <div className="admin-body">
        {/* ── Tabs ── */}
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
            onClick={() => setTab('users')}>
            👥 Users
            <span className="tab-count">{getAllUsers(config).length}</span>
          </button>
          <button className={`admin-tab ${tab === 'brands' ? 'active' : ''}`}
            onClick={() => setTab('brands')}>
            🏷️ Brands
            <span className="tab-count">{ALL_BRANDS.length}</span>
          </button>
          <button className={`admin-tab ${tab === 'logs' ? 'active' : ''}`}
            onClick={() => setTab('logs')}>
            📋 Activity Log
          </button>
        </div>

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div className="admin-content">
            <div className="users-section">
              <div className="users-toolbar">
                <input
                  className="search-input"
                  placeholder="Search users…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <span className="users-count">{users.length} user{users.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Access Level</th>
                      <th>Brands</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => {
                      const access = getUserAccess(config, user)
                      const isMe = user.toLowerCase() === currentUser.email.toLowerCase()
                      return (
                        <tr key={user} className={isMe ? 'row-me' : ''}>
                          <td className="cell-email">
                            {user}
                            {isMe && <span className="you-badge">you</span>}
                          </td>
                          <td>
                            {access.type === 'admin'
                              ? <span className="badge-admin">👑 Full Access</span>
                              : <span className="badge-brand">🏷️ Brand Specific</span>}
                          </td>
                          <td className="cell-brands">
                            {access.type === 'admin'
                              ? <span className="brand-pill all-pill">All Brands</span>
                              : access.brands.length === 0
                                ? <span className="brand-pill no-pill">No Access</span>
                                : access.brands.map(b => (
                                    <span key={b} className="brand-pill">{b}</span>
                                  ))}
                          </td>
                          <td className="cell-actions">
                            <button className="btn-edit" onClick={() => setEditUser(user)}>Edit</button>
                            {!isMe && (
                              <button className="btn-remove"
                                onClick={() => removeUser(user)}>Remove</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {users.length === 0 && (
                      <tr><td colSpan={4} className="empty-row">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <AddUserForm config={config} onSave={persist} />
          </div>
        )}

        {/* ── Brands tab ── */}
        {tab === 'brands' && (
          <div className="admin-content">
            <div className="brands-grid">
              {ALL_BRANDS.map(brand => {
                const brandUsers = (config.brands[brand] || [])
                const adminUsers = config.admins
                return (
                  <div key={brand} className="brand-card">
                    <div className="brand-card-header">
                      <span className="brand-card-name">{brand}</span>
                      <span className="brand-user-count">
                        {brandUsers.length} user{brandUsers.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="brand-card-body">
                      {/* Admins always have access */}
                      {adminUsers.map(u => (
                        <div key={u} className="brand-user-row admin-row">
                          <span className="bu-email">{u}</span>
                          <span className="bu-badge">👑 Admin</span>
                        </div>
                      ))}

                      {brandUsers.map(u => (
                        <div key={u} className="brand-user-row">
                          <span className="bu-email">{u}</span>
                          <button className="bu-remove"
                            onClick={() => {
                              const c = structuredClone(config)
                              c.brands[brand] = c.brands[brand].filter(
                                x => x.toLowerCase() !== u.toLowerCase()
                              )
                              persist(c)
                            }}>✕</button>
                        </div>
                      ))}

                      {brandUsers.length === 0 && adminUsers.length === 0 && (
                        <p className="brand-empty">No users assigned.</p>
                      )}
                    </div>

                    {/* Quick-add user to this brand */}
                    <QuickAddUser
                      brand={brand}
                      config={config}
                      onSave={persist}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Logs tab ── */}
        {tab === 'logs' && (
          <div className="admin-content">
            <LogsTab />
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {editUser && (
        <EditModal
          user={editUser}
          config={config}
          onSave={c => { persist(c); setEditUser(null) }}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  )
}

// ── Quick add user to a specific brand ───────────────────────────────────
function QuickAddUser({ brand, config, onSave }) {
  const [email, setEmail] = useState('')
  const [err, setErr]     = useState('')

  const add = () => {
    const emails = email.split(',').map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) { setErr('Enter an email'); return }

    const invalid = emails.find(e => !e.includes('@'))
    if (invalid) { setErr(`Invalid: ${invalid}`); return }

    const existing = (config.brands[brand] || []).map(u => u.toLowerCase())
    const dupes = emails.filter(e => existing.includes(e.toLowerCase()))
    if (dupes.length > 0) { setErr(`Already added: ${dupes.join(', ')}`); return }

    const c = structuredClone(config)
    if (!c.brands[brand]) c.brands[brand] = []
    emails.forEach(e => c.brands[brand].push(e))
    onSave(c)
    setEmail(''); setErr('')
  }

  return (
    <div className="quick-add">
      <input
        className="quick-input"
        placeholder="email1, email2…"
        value={email}
        onChange={e => { setEmail(e.target.value); setErr('') }}
        onKeyDown={e => e.key === 'Enter' && add()}
      />
      <button className="quick-btn" onClick={add}>+</button>
      {err && <span className="quick-err">{err}</span>}
    </div>
  )
}

// ── Activity Logs Tab ─────────────────────────────────────────────────────
const ACTION_LABELS = {
  login:      { label: 'Login',       cls: 'badge-login'  },
  load_data:  { label: 'Load Data',   cls: 'badge-load'   },
  csv_export: { label: 'CSV Export',  cls: 'badge-export' },
}

function fmtTs(ts) {
  if (!ts) return '—'
  const d = new Date(ts + 'Z')  // UTC → local
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDetails(action, details) {
  if (!details || Object.keys(details).length === 0) return '—'
  if (action === 'login') {
    const b = details.brands
    if (b === 'all')    return 'Full access'
    if (b === 'denied') return 'Access denied'
    if (Array.isArray(b)) return b.length ? b.join(', ') : 'No brands'
  }
  if (action === 'load_data') {
    return `${details.from_date} → ${details.to_date}  ·  ${Number(details.row_count ?? 0).toLocaleString('en-IN')} rows  ·  ${details.filter_count ?? 0} filters  ·  ${details.duration_ms ?? 0}ms`
  }
  if (action === 'csv_export') {
    return `${details.from_date} → ${details.to_date}  ·  ${Number(details.total_rows ?? 0).toLocaleString('en-IN')} rows  ·  ${details.files ?? 1} file(s)`
  }
  return JSON.stringify(details)
}

function LogsTab() {
  const today        = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'

  const [logs,         setLogs]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(false)
  const [filterAction, setFilterAction] = useState('')
  const [filterEmail,  setFilterEmail]  = useState('')
  const [fromDate,     setFromDate]     = useState(firstOfMonth)
  const [toDate,       setToDate]       = useState(today)
  const [page,         setPage]         = useState(1)
  const PAGE = 50

  const fetchLogs = () => {
    setLoading(true)
    const params = new URLSearchParams({
      limit:  PAGE,
      offset: (page - 1) * PAGE,
      ...(filterAction && { action: filterAction }),
      ...(filterEmail  && { email:  filterEmail  }),
      ...(fromDate     && { from_date: fromDate   }),
      ...(toDate       && { to_date:   toDate     }),
    })
    fetch(`/permissions-api/logs?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setTotal(d.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLogs() }, [page, filterAction, filterEmail, fromDate, toDate])

  const totalPages = Math.ceil(total / PAGE)

  const clearLogs = () => {
    if (!window.confirm('Delete all activity logs? This cannot be undone.')) return
    fetch('/permissions-api/logs', { method: 'DELETE' })
      .then(() => { setLogs([]); setTotal(0); setPage(1) })
      .catch(() => {})
  }

  const exportCSV = () => {
    const header = 'Timestamp,User,Email,Action,Details'
    const rows = logs.map(l =>
      [`"${fmtTs(l.ts)}"`, `"${l.name}"`, `"${l.email}"`, `"${l.action}"`, `"${fmtDetails(l.action, l.details).replace(/"/g, '""')}"`].join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `activity_logs_${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="logs-section">
      {/* Toolbar */}
      <div className="log-toolbar">
        <div className="log-filters">
          <select
            className="log-select"
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(1) }}
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="load_data">Load Data</option>
            <option value="csv_export">CSV Export</option>
          </select>

          <input
            className="search-input"
            placeholder="Filter by email…"
            value={filterEmail}
            onChange={e => { setFilterEmail(e.target.value); setPage(1) }}
            style={{ width: 220 }}
          />

          <input type="date" className="log-date" value={fromDate} max={toDate}
            onChange={e => { setFromDate(e.target.value); setPage(1) }} />
          <span style={{ color: '#888', fontSize: 12 }}>→</span>
          <input type="date" className="log-date" value={toDate} min={fromDate} max={today}
            onChange={e => { setToDate(e.target.value); setPage(1) }} />
        </div>

        <div className="log-actions">
          <span className="users-count">{total.toLocaleString('en-IN')} events</span>
          <button className="btn-edit" onClick={exportCSV} disabled={logs.length === 0}>
            ↓ Export CSV
          </button>
          <button className="btn-remove" onClick={clearLogs}>
            Clear All
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="users-table-wrap">
        <table className="users-table log-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Email</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="empty-row">Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} className="empty-row">No activity logs found.</td></tr>
            )}
            {!loading && logs.map(l => {
              const badge = ACTION_LABELS[l.action] || { label: l.action, cls: '' }
              return (
                <tr key={l.id}>
                  <td className="log-ts">{fmtTs(l.ts)}</td>
                  <td className="cell-email">{l.name || '—'}</td>
                  <td style={{ fontSize: 12, color: '#555' }}>{l.email}</td>
                  <td><span className={`badge-action ${badge.cls}`}>{badge.label}</span></td>
                  <td className="log-detail">{fmtDetails(l.action, l.details)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination" style={{ padding: '12px 16px' }}>
          <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
          <span style={{ padding: '0 12px', fontSize: 13, color: '#555' }}>
            Page {page} / {totalPages}
          </span>
          <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
          <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      )}
    </div>
  )
}
