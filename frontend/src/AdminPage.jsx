import { useState, useEffect, useRef } from 'react'
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

// ── Restrict-values multi-select dropdown ─────────────────────────────────
function RestrictMultiSelect({ values, selected, onChange, loading = false }) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 0 })
  const controlRef  = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef   = useRef(null)

  // Close on outside click (control + dropdown are separate DOM trees)
  useEffect(() => {
    const handler = e => {
      if (
        controlRef.current  && !controlRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const openDropdown = () => {
    if (loading) return
    if (open) { setOpen(false); setSearch(''); return }
    // Calculate fixed position from control rect — escapes any overflow container
    const rect = controlRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    setOpen(true)
    setSearch('')
  }

  const toggle = v =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  const filtered = values.filter(v =>
    v.toLowerCase().includes(search.toLowerCase())
  )

  const label = selected.length === 0
    ? <span className="rms-placeholder">All rows (no restriction)</span>
    : selected.map(v => (
        <span key={v} className="rms-tag">
          {v}
          <span className="rms-tag-x" onClick={e => { e.stopPropagation(); toggle(v) }}>×</span>
        </span>
      ))

  return (
    <div className="rms-wrap" ref={controlRef}>
      {/* Control (trigger) */}
      <div className={`rms-control ${open ? 'open' : ''} ${loading ? 'rms-loading' : ''}`}
        onClick={openDropdown}>
        <div className="rms-tags">
          {loading ? <span className="rms-placeholder">Loading values…</span> : label}
        </div>
        {loading
          ? <span className="rms-spinner" />
          : <span className="rms-arrow">{open ? '▲' : '▼'}</span>
        }
      </div>

      {/* Dropdown — rendered with fixed position to escape overflow parents */}
      {open && (
        <div
          ref={dropdownRef}
          className="rms-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        >
          {/* Search */}
          <div className="rms-search-wrap">
            <input
              ref={searchRef}
              className="rms-search"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Loading state */}
          {loading && (
            <div className="rms-empty">
              <span className="rms-spinner" style={{marginRight:8}} />Loading…
            </div>
          )}

          {/* Options */}
          {!loading && (
            <>
              <label className="rms-option rms-all"
                onClick={() => { onChange([]); setOpen(false); setSearch('') }}>
                <input type="checkbox" readOnly checked={selected.length === 0} onChange={() => {}} />
                <span>All rows (no restriction)</span>
              </label>
              {filtered.length === 0 && (
                <div className="rms-empty">No matches for "{search}"</div>
              )}
              {filtered.map(v => (
                <label key={v} className="rms-option">
                  <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
                  <span>{v}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Users Tab (portal-specific access) ───────────────────────────────────
function UsersTab({ currentUser }) {
  const [portals,      setPortals]      = useState([])
  const [selId,        setSelId]        = useState('')
  const [access,       setAccess]       = useState([])
  const [loading,      setLoading]      = useState(false)
  const [colVals,      setColVals]      = useState([])   // distinct values for restrict_col
  const [colValsLoading, setColValsLoading] = useState(false)
  const [editEmail,    setEditEmail]    = useState(null) // email being edited
  const [editSel,      setEditSel]      = useState([])   // selected values in edit
  const [newEmail,     setNewEmail]     = useState('')
  const [newSel,       setNewSel]       = useState([])
  const [err,          setErr]          = useState('')
  const [saving,       setSaving]       = useState(false)

  const selPortal   = portals.find(p => p.id === selId)
  const restrictCol = selPortal?.config?.restrict_col || null

  // Standalone fetchers — take explicit id to avoid stale-closure bugs
  const fetchAccess = (id) => {
    if (!id) return
    setLoading(true)
    fetch(`/permissions-api/portals/${id}/access`)
      .then(r => r.json())
      .then(d => setAccess(d.access || []))
      .catch(() => setAccess([]))
      .finally(() => setLoading(false))
  }

  const fetchColVals = (id) => {
    if (!id) return
    setColVals([])
    setColValsLoading(true)
    // Always hit the endpoint — backend returns [] when no restrict_col is set
    fetch(`/permissions-api/portals/${id}/restrict-values`)
      .then(r => r.json())
      .then(d => setColVals(d.values || []))
      .catch(() => setColVals([]))
      .finally(() => setColValsLoading(false))
  }

  // Load portals once; immediately kick off data fetches for first portal
  useEffect(() => {
    fetch('/permissions-api/portals')
      .then(r => r.json())
      .then(d => {
        const ps = (d.portals || []).filter(p => p.is_active)
        setPortals(ps)
        if (ps.length) {
          setSelId(ps[0].id)
          fetchAccess(ps[0].id)
          fetchColVals(ps[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Re-fetch when user manually picks a different portal
  useEffect(() => {
    if (!selId) return
    setEditEmail(null); setNewEmail(''); setNewSel([]); setErr('')
    fetchAccess(selId)
    fetchColVals(selId)
  }, [selId])

  const saveAccess = async (email, vals) => {
    await fetch(`/permissions-api/portals/${selId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, restrict_values: vals }),
    })
  }

  const addUser = async () => {
    const emails = newEmail.split(',').map(e => e.trim()).filter(Boolean)
    if (!emails.length)  { setErr('Enter at least one email'); return }
    const bad = emails.find(e => !e.includes('@'))
    if (bad)             { setErr(`Invalid email: ${bad}`); return }
    const existing = access.map(a => a.email.toLowerCase())
    const dupes = emails.filter(e => existing.includes(e.toLowerCase()))
    if (dupes.length)    { setErr(`Already added: ${dupes.join(', ')}`); return }

    setSaving(true)
    try {
      for (const email of emails) await saveAccess(email, newSel)
      setNewEmail(''); setNewSel([]); setErr('')
      fetchAccess(selId)
    } finally { setSaving(false) }
  }

  const removeUser = async (email) => {
    await fetch(`/permissions-api/portals/${selId}/access/${encodeURIComponent(email)}`, { method: 'DELETE' })
    fetchAccess(selId)
  }

  const commitEdit = async () => {
    await saveAccess(editEmail, editSel)
    setEditEmail(null)
    fetchAccess(selId)
  }

  return (
    <div className="admin-content">
      {/* ── Portal selector bar ── */}
      <div className="portal-sel-bar">
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <label className="field-label" style={{ margin:0, whiteSpace:'nowrap' }}>Portal:</label>
          <select className="log-select portal-sel-select"
            value={selId}
            onChange={e => setSelId(e.target.value)}>
            {portals.length === 0 && <option value="">— no portals —</option>}
            {portals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {selPortal && <span className="portal-view-badge">{selPortal.view_name}</span>}
          {restrictCol
            ? <span className="restrict-col-pill">🔒 Restrict by: <strong>{restrictCol}</strong>
                {colValsLoading && <span style={{marginLeft:6,opacity:.6}}>loading values…</span>}
              </span>
            : selPortal && <span className="no-restrict-pill">No column restriction</span>
          }
        </div>
        <span className="users-count">{access.length} user{access.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── User table ── */}
      <div className="users-section">
        {loading && <div className="empty-row" style={{padding:28,textAlign:'center',color:'#aaa'}}>Loading…</div>}
        {!loading && (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>{restrictCol ? `${restrictCol} Access` : 'Access'}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {access.length === 0 && (
                  <tr><td colSpan={3} className="empty-row">No users have access to this portal yet.</td></tr>
                )}
                {access.map(a => {
                  const isMe      = a.email.toLowerCase() === currentUser.email.toLowerCase()
                  const isEditing = editEmail === a.email
                  return (
                    <tr key={a.email} className={isMe ? 'row-me' : ''}>
                      <td className="cell-email">
                        {a.email}{isMe && <span className="you-badge">you</span>}
                      </td>

                      <td style={{minWidth: 260}}>
                        {isEditing && restrictCol ? (
                          <div style={{display:'flex', gap:6, alignItems:'center'}}>
                            <div style={{flex:1}}>
                              <RestrictMultiSelect
                                values={colVals}
                                loading={colValsLoading}
                                selected={editSel}
                                onChange={setEditSel}
                              />
                            </div>
                            <button className="btn-save"
                              style={{height:30,padding:'0 10px',fontSize:12,flexShrink:0}}
                              onClick={commitEdit}>✓ Save</button>
                            <button className="btn-ghost"
                              style={{height:30,padding:'0 8px',fontSize:12,flexShrink:0}}
                              onClick={() => setEditEmail(null)}>✕</button>
                          </div>
                        ) : (
                          <div className="restrict-vals-wrap">
                            {!restrictCol
                              ? <span className="brand-pill all-pill">Full access</span>
                              : (a.restrict_values || []).length
                                ? (a.restrict_values || []).map(v => <span key={v} className="brand-pill">{v}</span>)
                                : <span className="brand-pill all-pill">All rows</span>
                            }
                          </div>
                        )}
                      </td>

                      <td className="cell-actions">
                        {restrictCol && !isEditing && (
                          <button className="btn-edit" onClick={() => {
                            setEditEmail(a.email)
                            setEditSel(a.restrict_values || [])
                          }}>Edit</button>
                        )}
                        {!isMe && (
                          <button className="btn-remove" onClick={() => removeUser(a.email)}>Remove</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add user form ── */}
      {selPortal && (
        <div className="add-user-card">
          <h3 className="add-user-title">Add User to {selPortal.name}</h3>
          <div className="add-user-row" style={{alignItems:'flex-end'}}>
            <div className="add-field" style={{flex:2}}>
              <label className="field-label">
                Email <span style={{fontWeight:400,color:'#888'}}>(comma-separated for multiple)</span>
              </label>
              <input className="field-input"
                placeholder="user@arvindfashions.com"
                value={newEmail}
                onChange={e => { setNewEmail(e.target.value); setErr('') }}
                onKeyDown={e => e.key === 'Enter' && addUser()}
              />
            </div>

            {restrictCol && (
              <div className="add-field" style={{flex:2}}>
                <label className="field-label">
                  {restrictCol}{' '}
                  <span style={{fontWeight:400,color:'#888'}}>(leave empty = all rows)</span>
                </label>
                <RestrictMultiSelect
                  values={colVals}
                  loading={colValsLoading}
                  selected={newSel}
                  onChange={setNewSel}
                  placeholder="All rows (no restriction)"
                />
              </div>
            )}

            <div className="add-field">
              <button className="btn-add" onClick={addUser} disabled={saving} style={{height:38}}>
                {saving ? '…' : '+ Add User'}
              </button>
            </div>
          </div>
          {err && <p className="add-error">{err}</p>}
        </div>
      )}
    </div>
  )
}

// ── Admins Tab (who gets the Admin button) ────────────────────────────────
function AdminsTab({ config, persist, currentUser }) {
  const [email, setEmail] = useState('')
  const [err,   setErr]   = useState('')

  const admins = config.admins || []

  const add = () => {
    const e = email.trim().toLowerCase()
    if (!e)              { setErr('Enter an email'); return }
    if (!e.includes('@')){ setErr('Invalid email'); return }
    if (admins.some(a => a.toLowerCase() === e)) { setErr('Already an admin'); return }
    const c = structuredClone(config)
    c.admins.push(email.trim())
    persist(c)
    setEmail(''); setErr('')
  }

  const remove = (addr) => {
    const c = structuredClone(config)
    c.admins = c.admins.filter(a => a.toLowerCase() !== addr.toLowerCase())
    persist(c)
  }

  return (
    <div className="admin-content">
      <div className="admins-info-box">
        <strong>👑 Admins</strong> can see all portals, access this Admin panel, create new portals,
        and manage all users. Grant this role carefully.
      </div>

      <div className="users-section">
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 && (
                <tr><td colSpan={3} className="empty-row">No admins configured.</td></tr>
              )}
              {admins.map(a => {
                const isMe = a.toLowerCase() === currentUser.email.toLowerCase()
                return (
                  <tr key={a} className={isMe ? 'row-me' : ''}>
                    <td className="cell-email">
                      {a}{isMe && <span className="you-badge">you</span>}
                    </td>
                    <td><span className="badge-admin">👑 Full Admin Access</span></td>
                    <td className="cell-actions">
                      {!isMe && (
                        <button className="btn-remove" onClick={() => remove(a)}>Remove</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="add-user-card">
        <h3 className="add-user-title">Add Admin</h3>
        <div className="add-user-row">
          <div className="add-field" style={{flex:1}}>
            <label className="field-label">Email Address</label>
            <input className="field-input"
              placeholder="user@arvindfashions.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && add()}
            />
          </div>
          <div className="add-field" style={{justifyContent:'flex-end'}}>
            <label className="field-label">&nbsp;</label>
            <button className="btn-add" onClick={add}>+ Add Admin</button>
          </div>
        </div>
        {err && <p className="add-error">{err}</p>}
      </div>
    </div>
  )
}

// ── Portals Tab ───────────────────────────────────────────────────────────
const GROUP_OPTIONS = ['Store', 'Invoice', 'Product', 'Date', 'Customer', 'Other']
const FILTER_TYPE_OPTIONS = ['none', 'dropdown', 'text']

// Step indicator
function WizardSteps({ step }) {
  const steps = ['Info', 'Columns']
  return (
    <div className="wiz-steps">
      {steps.map((s, i) => (
        <div key={s} className={`wiz-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
          <div className="wiz-dot">{step > i + 1 ? '✓' : i + 1}</div>
          <span>{s}</span>
          {i < steps.length - 1 && <div className="wiz-line" />}
        </div>
      ))}
    </div>
  )
}

// Step 1 — Portal Info
function Step1Info({ draft, setDraft, onDiscover, discovering, discoverError }) {
  return (
    <div className="wiz-body">
      <div className="wiz-field">
        <label className="field-label">Portal Name <span className="req">*</span></label>
        <input className="field-input" placeholder="e.g. POS Sales"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
      </div>
      <div className="wiz-field">
        <label className="field-label">Description</label>
        <input className="field-input" placeholder="Short description visible to users"
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
      </div>
      <div className="wiz-field">
        <label className="field-label">Fabric View Name <span className="req">*</span></label>
        <div className="discover-row">
          <input className="field-input" placeholder="e.g. ui.V_MY_VIEW"
            value={draft.view_name}
            onChange={e => setDraft(d => ({ ...d, view_name: e.target.value }))} />
          <button className="btn-discover" onClick={onDiscover} disabled={discovering || !draft.view_name.trim()}>
            {discovering ? '…' : 'Discover Columns →'}
          </button>
        </div>
        {discoverError && <span className="wiz-error">{discoverError}</span>}
        {draft.columns.length > 0 && (
          <span className="wiz-ok">✓ {draft.columns.length} columns discovered</span>
        )}
      </div>
      <div className="wiz-field">
        <label className="field-label">Date Column <span className="req">*</span></label>
        {draft.columns.length > 0
          ? (
            <select className="log-select" value={draft.date_col}
              onChange={e => setDraft(d => ({ ...d, date_col: e.target.value }))}>
              <option value="">— select —</option>
              {draft.columns.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
          )
          : (
            <input className="field-input" placeholder="e.g. INVOICE_DATE"
              value={draft.date_col}
              onChange={e => setDraft(d => ({ ...d, date_col: e.target.value }))} />
          )
        }
      </div>
      <div className="wiz-field">
        <label className="field-label">Restrict Column <span className="field-hint">(optional — column used for row-level restriction)</span></label>
        {draft.columns.length > 0
          ? (
            <select className="log-select" value={draft.restrict_col}
              onChange={e => setDraft(d => ({ ...d, restrict_col: e.target.value }))}>
              <option value="">— none —</option>
              {draft.columns.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
          )
          : (
            <input className="field-input" placeholder="e.g. BRAND (leave blank if not needed)"
              value={draft.restrict_col}
              onChange={e => setDraft(d => ({ ...d, restrict_col: e.target.value }))} />
          )
        }
      </div>
    </div>
  )
}

// Step 2 — Column configurator
function Step2Columns({ draft, setDraft }) {
  const toggleAll = (field, val) =>
    setDraft(d => ({ ...d, columns: d.columns.map(c => ({ ...c, [field]: val })) }))

  const updateCol = (idx, patch) =>
    setDraft(d => {
      const cols = [...d.columns]
      cols[idx] = { ...cols[idx], ...patch }
      return { ...d, columns: cols }
    })

  return (
    <div className="wiz-body">
      <div className="col-toolbar">
        <span className="users-count">{draft.columns.length} columns</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-edit" onClick={() => toggleAll('show', true)}>Show All</button>
          <button className="btn-edit" onClick={() => toggleAll('show', false)}>Hide All</button>
        </div>
      </div>
      <div className="col-table-wrap">
        <table className="col-table">
          <thead>
            <tr>
              <th>Column Key</th>
              <th>Label</th>
              <th>Show</th>
              <th>Filter Type</th>
              <th>Group</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {draft.columns.map((col, idx) => (
              <tr key={col.key} className={[
                !col.show ? 'col-hidden' : '',
                col.filter && col.filter !== 'none' ? 'col-filtered' : ''
              ].join(' ').trim()}>
                <td className="col-key">{col.key}</td>
                <td>
                  <input className="col-label-input"
                    value={col.label}
                    onChange={e => updateCol(idx, { label: e.target.value })} />
                </td>
                <td className="col-center">
                  <input type="checkbox" checked={col.show}
                    onChange={e => updateCol(idx, { show: e.target.checked })} />
                </td>
                <td>
                  <select className={`col-select ${col.filter && col.filter !== 'none' ? 'col-select-active' : ''}`}
                    value={col.filter || 'none'}
                    onChange={e => updateCol(idx, { filter: e.target.value })}>
                    {FILTER_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td>
                  <select className="col-select"
                    value={col.group || 'Other'}
                    onChange={e => updateCol(idx, { group: e.target.value })}>
                    {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                <td className="col-center">
                  <input type="checkbox" checked={!!col.currency}
                    onChange={e => updateCol(idx, { currency: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Configured Filters summary ── */}
      <div className="filter-summary">
        <div className="filter-summary-header">
          <span className="filter-summary-title">🔍 Configured Filters</span>
          <span className="filter-summary-hint">Columns that will appear as filter controls in the portal</span>
        </div>
        {(() => {
          const filterCols = draft.columns.filter(c => c.filter && c.filter !== 'none')
          if (filterCols.length === 0) {
            return (
              <div className="filter-summary-empty">
                No filters configured yet. Set <strong>Filter Type</strong> to{' '}
                <em>dropdown</em> or <em>text</em> on any column above.
              </div>
            )
          }
          return (
            <div className="filter-cards">
              {filterCols.map((c, i) => (
                <div key={c.key} className="filter-card">
                  <span className="filter-card-num">{i + 1}</span>
                  <span className="filter-card-label">{c.label || c.key}</span>
                  <span className="filter-card-key">{c.key}</span>
                  <span className={`filter-card-type ${c.filter === 'dropdown' ? 'type-dropdown' : 'type-text'}`}>
                    {c.filter === 'dropdown' ? '▼ dropdown' : '✏ text'}
                  </span>
                  <span className="filter-card-group">{c.group || 'Other'}</span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}



// Portal Wizard (create / edit)
function PortalWizard({ editing, onClose, onSaved }) {
  const isNew = !editing

  const [step, setStep]           = useState(1)
  const [discovering, setDisc]    = useState(false)
  const [discoverError, setDiscErr] = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  const blankDraft = {
    id:           '',
    name:         '',
    description:  '',
    view_name:    '',
    date_col:     '',
    restrict_col: '',
    columns:      [],
  }

  const [draft, setDraft] = useState(() => {
    if (!editing) return blankDraft
    const cfg = editing.config || {}
    return {
      id:           editing.id,
      name:         editing.name,
      description:  editing.description || '',
      view_name:    editing.view_name,
      date_col:     cfg.date_col || '',
      restrict_col: cfg.restrict_col || '',
      columns:      cfg.columns || [],
    }
  })

  // Discover columns from Fabric
  const handleDiscover = async () => {
    if (!draft.view_name.trim()) return
    setDisc(true); setDiscErr('')
    try {
      const r = await fetch(
        `/permissions-api/portals/new/discover?view=${encodeURIComponent(draft.view_name.trim())}`
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Discover failed')
      // Merge with existing columns to preserve settings on re-discover
      const existing = Object.fromEntries((draft.columns || []).map(c => [c.key, c]))
      const merged = data.columns.map(c => existing[c.key]
        ? { ...c, ...existing[c.key] }
        : { ...c, filter: 'none', group: 'Other' }
      )
      setDraft(d => ({ ...d, columns: merged }))
    } catch(e) {
      setDiscErr(e.message)
    } finally {
      setDisc(false)
    }
  }

  // Build portal config JSON from draft
  const buildConfig = () => {
    const filters = draft.columns
      .filter(c => c.filter && c.filter !== 'none')
      .map(c => ({
        key:   c.key,
        label: c.label,
        type:  c.filter === 'dropdown' ? 'dropdown' : 'text',
        group: c.group || 'Other',
      }))
    const groups = [...new Set(filters.map(f => f.group))]
    return {
      filters,
      columns:      draft.columns,
      groups,
      date_col:     draft.date_col,
      restrict_col: draft.restrict_col || null,
    }
  }

  const save = async () => {
    if (!draft.name.trim())      { setSaveError('Portal name is required.'); return }
    if (!draft.view_name.trim()) { setSaveError('Fabric view name is required.'); return }
    if (!draft.date_col)         { setSaveError('Date column is required.'); return }
    if (draft.columns.length === 0) { setSaveError('Discover columns first.'); return }

    setSaving(true); setSaveError('')
    try {
      const body = {
        name:        draft.name.trim(),
        description: draft.description.trim(),
        view_name:   draft.view_name.trim(),
        config:      buildConfig(),
      }
      if (!isNew) body.id = draft.id

      const url    = isNew ? '/permissions-api/portals' : `/permissions-api/portals/${draft.id}`
      const method = isNew ? 'POST' : 'PUT'
      const r      = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Save failed')
      onSaved()
      onClose()
    } catch(e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const canNext = () =>
    draft.name.trim() && draft.view_name.trim() && draft.columns.length > 0 && draft.date_col

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wiz-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isNew ? '➕ New Portal' : `✏️ Edit: ${editing.name}`}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <WizardSteps step={step} />

        {step === 1 && (
          <Step1Info
            draft={draft} setDraft={setDraft}
            onDiscover={handleDiscover}
            discovering={discovering}
            discoverError={discoverError}
          />
        )}
        {step === 2 && <Step2Columns draft={draft} setDraft={setDraft} />}

        {saveError && <div className="wiz-save-error">{saveError}</div>}

        <div className="modal-footer">
          {step > 1
            ? <button className="btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
            : <button className="btn-ghost" onClick={onClose}>Cancel</button>
          }
          {step < 2
            ? <button className="btn-save" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                Next →
              </button>
            : <button className="btn-save" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : (isNew ? 'Create Portal' : 'Save Changes')}
              </button>
          }
        </div>
      </div>
    </div>
  )
}

// Portals Tab
function PortalsTab() {
  const [portals,   setPortals]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [editing,   setEditing]   = useState(undefined) // undefined=closed, null=new, obj=edit
  const [toggling,  setToggling]  = useState(null)       // id being activated/deactivated
  const [deleting,  setDeleting]  = useState(null)       // id being permanently deleted

  const load = () => {
    setLoading(true)
    fetch('/permissions-api/portals')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setPortals(d.portals || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (id, makeActive) => {
    if (!makeActive && !window.confirm('Deactivate this portal? Users will no longer see it.')) return
    setToggling(id)
    try {
      await fetch(`/permissions-api/portals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: makeActive }),
      })
      load()
    } catch(e) {
      alert(`Failed: ` + e.message)
    } finally {
      setToggling(null)
    }
  }

  const permanentDelete = async (id, name) => {
    if (!window.confirm(
      `Permanently delete "${name}"?\n\nThis removes the portal and ALL user access records and cannot be undone.`
    )) return
    setDeleting(id)
    try {
      const r = await fetch(`/permissions-api/portals/${id}?permanent=true`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      load()
    } catch(e) {
      alert('Delete failed: ' + e.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="admin-content">
      <div className="portals-toolbar">
        <span className="users-count">{portals.length} portal{portals.length !== 1 ? 's' : ''}</span>
        <button className="btn-add" onClick={() => setEditing(null)} style={{ height: 36 }}>
          + New Portal
        </button>
      </div>

      <div className="users-section">
        {loading && (
          <div className="empty-row" style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>
            Loading portals…
          </div>
        )}
        {error && (
          <div className="empty-row" style={{ padding: 32, color: '#C8102E' }}>
            ⚠ {error}
          </div>
        )}
        {!loading && !error && (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Fabric View</th>
                  <th>Restrict Col</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portals.length === 0 && (
                  <tr><td colSpan={6} className="empty-row">No portals yet. Create one!</td></tr>
                )}
                {portals.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-email">{p.name}</div>
                      {p.description && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.description}</div>}
                    </td>
                    <td>
                      <span className="portal-view-badge">{p.view_name}</span>
                    </td>
                    <td>
                      {p.restrict_col
                        ? <span className="brand-pill">{p.restrict_col}</span>
                        : <span style={{ color: '#aaa', fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      <span className="users-count">{p.user_count ?? '—'} user{p.user_count !== 1 ? 's' : ''}</span>
                    </td>
                    <td>
                      <span className={`badge-action ${p.is_active ? 'badge-login' : 'badge-inactive'}`}>
                        {p.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className="cell-actions">
                      {p.is_active ? (
                        <>
                          <button className="btn-edit" onClick={() => setEditing(p)}>Edit</button>
                          <button className="btn-remove"
                            disabled={toggling === p.id}
                            onClick={() => toggleActive(p.id, false)}>
                            {toggling === p.id ? '…' : 'Deactivate'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn-activate"
                            disabled={toggling === p.id}
                            onClick={() => toggleActive(p.id, true)}>
                            {toggling === p.id ? '…' : '▶ Activate'}
                          </button>
                          <button className="btn-delete"
                            disabled={deleting === p.id}
                            onClick={() => permanentDelete(p.id, p.name)}>
                            {deleting === p.id ? '…' : '🗑 Delete'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wizard modal */}
      {editing !== undefined && (
        <PortalWizard
          editing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────────────────
export default function AdminPage({ currentUser, onBack }) {
  const [config, setConfig] = useState(null)
  const [tab, setTab]       = useState('users')
  const [saved, setSaved]   = useState(false)

  useEffect(() => { loadPermissions().then(setConfig) }, [])

  const persist = async (newConfig) => {
    setConfig(newConfig)
    await savePermissions(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!config) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontSize:14, color:'#888' }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="admin-page">
      {/* ── Header ── */}
      <header className="admin-header">
        <div className="admin-header-left">
          <img src={arvindLogo} alt="Arvind" className="admin-logo" />
          <div className="admin-title-wrap">
            <span className="admin-title">Access Management</span>
            <span className="admin-sub">Portal-level access control</span>
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
          </button>
          <button className={`admin-tab ${tab === 'admins' ? 'active' : ''}`}
            onClick={() => setTab('admins')}>
            👑 Admins
            <span className="tab-count">{(config.admins || []).length}</span>
          </button>
          <button className={`admin-tab ${tab === 'portals' ? 'active' : ''}`}
            onClick={() => setTab('portals')}>
            🗂️ Portals
          </button>
          <button className={`admin-tab ${tab === 'logs' ? 'active' : ''}`}
            onClick={() => setTab('logs')}>
            📋 Activity Log
          </button>
        </div>

        {/* ── Users tab ── */}
        {tab === 'users'  && <UsersTab currentUser={currentUser} />}

        {/* ── Admins tab ── */}
        {tab === 'admins' && <AdminsTab config={config} persist={persist} currentUser={currentUser} />}

        {/* ── Portals tab ── */}
        {tab === 'portals' && <PortalsTab />}

        {/* ── Logs tab ── */}
        {tab === 'logs' && (
          <div className="admin-content">
            <LogsTab />
          </div>
        )}
      </div>

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
