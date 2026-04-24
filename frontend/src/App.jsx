import { useState, useEffect, useCallback, useRef } from 'react'
import { msalInstance } from './authConfig'
import AdminPage from './AdminPage'
import arvindLogo from './assets/arvind-logo.png'
import { logEvent } from './logger'
import './App.css'

const DATA_API = '/permissions-api'
const PAGE_SIZE = 50
const BLANK = '__blank__'

// ── Format cell value ────────────────────────────────────────────────────
function fmt(key, val, currencyCols, dateCol) {
  if (val == null || val === '') return '—'
  if (currencyCols.has(key))
    return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (key === dateCol)
    return String(val).slice(0, 10)
  return val
}

// ── Generic fetch helper ─────────────────────────────────────────────────
async function fabricLoad(path, body) {
  const res = await fetch(`${DATA_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Build export URL ─────────────────────────────────────────────────────
// fd_ = dropdown IN filter, ft_ = text LIKE filter, restrict_value = row restriction
function buildExportUrl(portalId, fromDate, toDate, restrictValues, filterValues, filterConfig) {
  const params = new URLSearchParams()
  params.set('portal_id', portalId)
  params.set('from_date',  fromDate)
  params.set('to_date',    toDate)
  restrictValues.forEach(v => params.append('restrict_value', v))

  filterConfig.forEach(({ key, type }) => {
    const val = filterValues[key]
    if (type === 'dropdown' && Array.isArray(val) && val.length > 0) {
      val.forEach(v => params.append(`fd_${key}`, v))
    } else if (type === 'text' && val && val.trim()) {
      params.set(`ft_${key}`, val.trim())
    }
  })

  return `/permissions-api/export?${params.toString()}`
}

// ── Multi-select dropdown ────────────────────────────────────────────────
function MultiDropdown({ portalId, column, fromDate, toDate, restrictValues, selected, onChange }) {
  const [open, setOpen]         = useState(false)
  const [options, setOptions]   = useState([])
  const [hasBlank, setHasBlank] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [fetched, setFetched]   = useState(false)
  const [search, setSearch]     = useState('')
  const ref = useRef()

  useEffect(() => { setFetched(false); setOptions([]) }, [fromDate, toDate])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open || fetched) return
    setLoading(true)
    const params = new URLSearchParams({ portal_id: portalId, column, from_date: fromDate, to_date: toDate })
    restrictValues.forEach(v => params.append('restrict_value', v))
    fetch(`/permissions-api/data/values?${params}`)
      .then(r => r.json())
      .then(data => { setOptions(data.values || []); setHasBlank(!!data.has_blank); setFetched(true) })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [open, fetched, portalId, column, fromDate, toDate])

  const toggle  = v => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const visible = options.filter(o => !search || String(o).toLowerCase().includes(search.toLowerCase()))

  const displayLabel = () => {
    if (selected.length === 0) return 'All'
    if (selected.length === 1) return selected[0] === BLANK ? '(Blank)' : selected[0]
    const hasBlankSel = selected.includes(BLANK)
    const others = selected.filter(v => v !== BLANK)
    const parts  = [...others, ...(hasBlankSel ? ['(Blank)'] : [])]
    return parts.length === 1 ? parts[0] : `${parts.length} selected`
  }

  return (
    <div className="fd" ref={ref}>
      <button
        className={`fd-trigger ${selected.length > 0 ? 'fd-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={selected.filter(v => v !== BLANK).join(', ') + (selected.includes(BLANK) ? ' (Blank)' : '')}
      >
        <span className="fd-label">{displayLabel()}</span>
        <span className="fd-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="fd-menu">
          {(options.length + (hasBlank ? 1 : 0)) > 8 && (
            <div className="fd-search-wrap">
              <input className="fd-search" placeholder="Search…" value={search}
                onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} autoFocus />
            </div>
          )}
          {loading && <div className="fd-info">Loading…</div>}
          {!loading && visible.length === 0 && !hasBlank && <div className="fd-info">No results</div>}
          {!loading && (
            <div className="fd-list">
              {!search && (
                <>
                  <div className={`fd-item ${selected.length === 0 ? 'fd-checked' : ''}`} onClick={() => onChange([])}>
                    <span className="fd-box">{selected.length === 0 ? '✓' : ''}</span> All
                  </div>
                  <div className="fd-sep" />
                </>
              )}
              {visible.map(o => (
                <div key={o} className={`fd-item ${selected.includes(o) ? 'fd-checked' : ''}`} onClick={() => toggle(o)}>
                  <span className="fd-box">{selected.includes(o) ? '✓' : ''}</span>
                  <span className="fd-opt-text">{o}</span>
                </div>
              ))}
              {hasBlank && !search && (
                <>
                  {visible.length > 0 && <div className="fd-sep" />}
                  <div className={`fd-item fd-blank ${selected.includes(BLANK) ? 'fd-checked' : ''}`} onClick={() => toggle(BLANK)}>
                    <span className="fd-box">{selected.includes(BLANK) ? '✓' : ''}</span>
                    <span className="fd-opt-text fd-blank-label">(Blank)</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App({ user, allowedBrands, portal, showAdmin, onBack }) {
  const isAdmin = allowedBrands.length === 0

  // Show Admin page (triggered from PortalHome)
  if (showAdmin && isAdmin) {
    return <AdminPage currentUser={user} onBack={onBack} />
  }

  // Portal must be provided
  if (!portal) return null

  // ── Derive config from portal prop ──────────────────────────────────
  const config       = portal.config || {}
  const FILTER_CONFIG = config.filters  || []
  const TABLE_COLUMNS = (config.columns || []).filter(c => c.show)
  const CURRENCY_COLS = new Set((config.columns || []).filter(c => c.currency).map(c => c.key))
  const GROUPS        = config.groups   || [...new Set(FILTER_CONFIG.map(f => f.group))]
  const dateCol       = (config.date_col  || 'INVOICE_DATE').toUpperCase()
  const restrictCol   = config.restrict_col || null
  const restrictValues = portal.restrict_values || []   // user's allowed values

  const today        = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'

  const [fromDate, setFromDate]         = useState(firstOfMonth)
  const [toDate, setToDate]             = useState(today)
  const [filterValues, setFilterValues] = useState({})
  const [panelOpen, setPanelOpen]       = useState(true)
  const [activeGroup, setActiveGroup]   = useState(GROUPS[0] || '')
  const [rows, setRows]                 = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [page, setPage]                 = useState(1)
  const [loaded, setLoaded]             = useState(false)
  const [dlState, setDlState]           = useState(null)
  const [totalCount, setTotalCount]     = useState(null)
  const [sortCol, setSortCol]           = useState(null)
  const [sortDir, setSortDir]           = useState('asc')

  const setFilter   = (key, val) => setFilterValues(prev => ({ ...prev, [key]: val }))
  const clearFilters = () => setFilterValues({})
  const activeCount = Object.values(filterValues).filter(v =>
    Array.isArray(v) ? v.length > 0 : v && v.trim()
  ).length

  const loadData = useCallback(async () => {
    if (!fromDate || !toDate) return
    setLoading(true); setError(null); setPage(1); setTotalCount(null)
    const t0 = Date.now()
    try {
      const filterCount = activeCount
      const dropdownFilters = {}
      const textFilters     = {}
      FILTER_CONFIG.forEach(({ key, type }) => {
        const val = filterValues[key]
        if (type === 'dropdown' && Array.isArray(val) && val.length > 0) dropdownFilters[key] = val
        else if (type === 'text' && val && val.trim()) textFilters[key] = val.trim()
      })

      const result = await fabricLoad('/data/load', {
        portal_id:       portal.id,
        from_date:       fromDate,
        to_date:         toDate,
        filters:         dropdownFilters,
        text_filters:    textFilters,
        restrict_values: restrictValues,
        limit:           50000,
      })

      const data = result.data || []
      setRows(data)
      setLoaded(true)
      setTotalCount(data.length)

      logEvent(user, 'load_data', {
        portal_id: portal.id, from_date: fromDate, to_date: toDate,
        filter_count: filterCount, row_count: data.length, duration_ms: Date.now() - t0,
      })

      // Background count query
      fabricLoad('/data/load', {
        portal_id: portal.id, from_date: fromDate, to_date: toDate,
        filters: dropdownFilters, text_filters: textFilters,
        restrict_values: restrictValues, count_only: true,
      })
        .then(r => { if (r.count > 0) setTotalCount(r.count) })
        .catch(() => {})

    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [fromDate, toDate, filterValues, portal.id, restrictValues])

  const handleDownload = useCallback(async () => {
    setDlState({ phase: 'preparing', pct: 0 })
    setError(null)
    try {
      const url = buildExportUrl(portal.id, fromDate, toDate, restrictValues, filterValues, FILTER_CONFIG)
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      setDlState({ phase: 'downloading', pct: 0 })
      const contentLength = Number(res.headers.get('content-length') || 0)
      let received = 0
      const reader = res.body.getReader()
      const chunks = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (contentLength > 0)
          setDlState({ phase: 'downloading', pct: Math.round((received / contentLength) * 100) })
      }

      setDlState({ phase: 'saving', pct: 100 })
      const blob   = new Blob(chunks, { type: 'application/zip' })
      const objUrl = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href = objUrl
      a.download = `${portal.id}_${fromDate}_to_${toDate}.zip`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000)

      setDlState({ phase: 'done', pct: 100 })
      setTimeout(() => setDlState(null), 1500)

      logEvent(user, 'csv_export', {
        portal_id: portal.id, from_date: fromDate, to_date: toDate, filter_count: activeCount,
      })
    } catch (e) {
      setError(`Download failed: ${e.message}`)
      setDlState(null)
    }
  }, [fromDate, toDate, filterValues, portal.id, restrictValues, activeCount])

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const sortedRows = sortCol ? [...rows].sort((a, b) => {
    const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
    const isNum = CURRENCY_COLS.has(sortCol)
    const cmp = isNum ? Number(av) - Number(bv) : String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  }) : rows

  const totalPages  = Math.ceil(sortedRows.length / PAGE_SIZE)
  const pageRows    = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const groupFilters = g => FILTER_CONFIG.filter(f => f.group === g)

  // Stats bar: show QUANTITY and NETAMT only if present in portal
  const hasQty  = TABLE_COLUMNS.some(c => c.key === 'QUANTITY')
  const hasNet  = TABLE_COLUMNS.some(c => c.key === 'NETAMT')

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          <img src={arvindLogo} alt="Arvind Fashions" className="logo-img" />
        </div>
        <button className="btn-back-portals" onClick={onBack} title="Back to portals">
          ← Portals
        </button>
        <div className="header-sub">{portal.name}</div>
        <div className="header-user">
          {restrictValues.length > 0 && (
            <span className="header-brand-badge">
              🔒 {restrictValues.join(' · ')}
            </span>
          )}
          <span className="header-name">{user.displayName}</span>
          {isAdmin && (
            <button className="btn-admin" onClick={onBack}>⚙ Admin</button>
          )}
          <button className="btn-signout" onClick={() => msalInstance.logoutRedirect()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        {/* ── Top bar ── */}
        <section className="top-bar">
          <div className="top-bar-left">
            <div className="filter-group">
              <label>From Date</label>
              <input type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>To Date</label>
              <input type="date" value={toDate} min={fromDate} max={today} onChange={e => setToDate(e.target.value)} />
            </div>
            <button className="panel-toggle" onClick={() => setPanelOpen(o => !o)}>
              {panelOpen ? '▲' : '▼'} Filters
              {activeCount > 0 && <span className="badge">{activeCount}</span>}
            </button>
            {activeCount > 0 && <button className="clear-btn" onClick={clearFilters}>✕ Clear all</button>}
          </div>
          <div className="top-bar-right">
            <button className="btn-primary" onClick={loadData} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Loading…' : 'Load Data'}
            </button>
            <button className="btn-download" onClick={handleDownload} disabled={!!dlState || !loaded}>
              {dlState ? (
                <>
                  <span className="spinner" />
                  {dlState.phase === 'preparing' ? 'Preparing…' :
                   dlState.phase === 'downloading' ? 'Downloading…' :
                   dlState.phase === 'saving' ? 'Saving…' : 'Done'}
                </>
              ) : '⬇ Download ZIP'}
            </button>
          </div>
        </section>

        {/* ── Filter panel ── */}
        {panelOpen && GROUPS.length > 0 && (
          <section className="filter-panel">
            <div className="group-tabs">
              {GROUPS.map(g => {
                const cnt = groupFilters(g).filter(f => {
                  const v = filterValues[f.key]
                  return Array.isArray(v) ? v.length > 0 : v && v.trim()
                }).length
                return (
                  <button key={g}
                    className={`group-tab ${activeGroup === g ? 'group-tab-active' : ''}`}
                    onClick={() => setActiveGroup(g)}>
                    {g}{cnt > 0 && <span className="tab-badge">{cnt}</span>}
                  </button>
                )
              })}
            </div>
            <div className="filters-grid">
              {groupFilters(activeGroup).map(({ key, label, type }) => (
                <div key={key} className="f-cell">
                  <label className="f-label">{label}</label>
                  {/* Row-restrict col is locked for restricted users */}
                  {key === restrictCol && restrictValues.length > 0 ? (
                    <div className="brand-chips-locked">
                      {restrictValues.map(b => <span key={b} className="brand-chip">🔒 {b}</span>)}
                    </div>
                  ) : type === 'dropdown' ? (
                    <MultiDropdown
                      portalId={portal.id}
                      column={key}
                      fromDate={fromDate}
                      toDate={toDate}
                      restrictValues={restrictValues}
                      selected={filterValues[key] || []}
                      onChange={val => setFilter(key, val)}
                    />
                  ) : (
                    <input
                      className={`f-text ${filterValues[key] ? 'f-text-active' : ''}`}
                      type="text" placeholder="contains…"
                      value={filterValues[key] || ''}
                      onChange={e => setFilter(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {error && <div className="error-bar"><strong>Error:</strong> {error}</div>}

        {/* ── Stats bar ── */}
        {loaded && !loading && (
          <div className="stats-bar">
            <span className="stat">
              <strong>{(totalCount || rows.length).toLocaleString('en-IN')}</strong> total rows
            </span>
            {(totalCount || rows.length) > rows.length && (
              <><span className="sdot">·</span>
              <span className="stat showing-badge">showing first <strong>{rows.length.toLocaleString('en-IN')}</strong></span></>
            )}
            <span className="sdot">·</span>
            <span className="stat">Page <strong>{page}</strong> / <strong>{totalPages || 1}</strong></span>
            {hasQty && (<>
              <span className="sdot">·</span>
              <span className="stat">Qty: <strong>{rows.reduce((s, r) => s + (Number(r['QUANTITY']) || 0), 0).toLocaleString('en-IN')}</strong></span>
            </>)}
            {hasNet && (<>
              <span className="sdot">·</span>
              <span className="stat">Net: <strong>₹{rows.reduce((s, r) => s + (Number(r['NETAMT']) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
            </>)}
          </div>
        )}

        {loading && <div className="loading-overlay"><div className="loading-spinner" /><p>Fetching data…</p></div>}
        {!loading && loaded && rows.length === 0 && <div className="empty-state">No data found for the selected filters.</div>}

        {/* ── Table ── */}
        {!loading && pageRows.length > 0 && (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {TABLE_COLUMNS.map(c => (
                      <th key={c.key} className="sortable" onClick={() => handleSort(c.key)}>
                        <span className="th-inner">
                          {c.label}
                          <span className="sort-icon">{sortCol === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr key={i}>
                      {TABLE_COLUMNS.map(c => (
                        <td key={c.key} className={CURRENCY_COLS.has(c.key) ? 'num' : ''}>
                          {fmt(c.key, row[c.key], CURRENCY_COLS, dateCol)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let p
                  if (totalPages <= 7) p = i + 1
                  else if (page <= 4) p = i + 1
                  else if (page >= totalPages - 3) p = totalPages - 6 + i
                  else p = page - 3 + i
                  return <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                })}
                <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            )}
          </>
        )}

        {!loaded && !loading && (
          <div className="welcome">
            <div className="welcome-icon">📊</div>
            <p>Select filters and click <strong>Load Data</strong> to get started.</p>
          </div>
        )}
      </main>

      {/* ── Download progress bar ── */}
      {dlState && (
        <div className="dl-bar">
          <div className="dl-bar-inner">
            <div className="dl-bar-icon">{dlState.phase === 'done' ? '✅' : '⬇'}</div>
            <div className="dl-bar-body">
              <div className="dl-bar-labels">
                <span className="dl-bar-phase">
                  {dlState.phase === 'preparing'   && '⏳ Preparing ZIP on server…'}
                  {dlState.phase === 'downloading' && (dlState.pct > 0 ? `⬇ Downloading… ${dlState.pct}%` : '⬇ Downloading…')}
                  {dlState.phase === 'saving'      && '💾 Saving file…'}
                  {dlState.phase === 'done'        && '✅ Download complete!'}
                </span>
                <span className="dl-bar-hint">
                  {dlState.phase === 'preparing'   && 'Querying Fabric and building the ZIP — please wait'}
                  {dlState.phase === 'downloading' && 'Do not close this tab'}
                  {dlState.phase === 'saving'      && 'Check your browser downloads bar'}
                </span>
              </div>
              <div className="dl-progress-track">
                <div className="dl-progress-fill" style={
                  dlState.phase === 'preparing' || (dlState.phase === 'downloading' && dlState.pct === 0)
                    ? { width: '100%', animation: 'dl-indeterminate 1.4s ease infinite' }
                    : { width: `${dlState.pct}%`, animation: 'none', transition: 'width 0.3s ease' }
                } />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
