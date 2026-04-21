import { useState, useEffect, useCallback, useRef } from 'react'
import { msalInstance } from './authConfig'
import AdminPage from './AdminPage'
import arvindLogo from './assets/arvind-logo.png'
import { logEvent } from './logger'
// JSZip removed — downloads are now server-side via /permissions-api/export
import './App.css'

const DATA_API = '/permissions-api'   // Flask API — queries Fabric directly

// ── Filter config — keys are SQL column names (match ui.V_D365_SALES) ────
// type: 'dropdown' → multi-select (values fetched from /data/values)
// type: 'text'     → free-text contains search
const FILTER_CONFIG = [
  // Store / Location
  { key: 'COMPANY',             label: 'Company',             type: 'dropdown', group: 'Store' },
  { key: 'REGION',              label: 'Region',              type: 'dropdown', group: 'Store' },
  { key: 'STATE',               label: 'State',               type: 'dropdown', group: 'Store' },
  { key: 'AIL_ORDER_STATE',     label: 'AIL Order State',     type: 'dropdown', group: 'Store' },
  { key: 'CHANNEL',             label: 'Channel',             type: 'dropdown', group: 'Store' },
  { key: 'STORE_TYPE',          label: 'Store Type',          type: 'dropdown', group: 'Store' },
  { key: 'OWNERSHIP_TYPE',      label: 'Ownership Type',      type: 'dropdown', group: 'Store' },
  { key: 'SAP_STORECODE',       label: 'SAP Store Code',      type: 'text',     group: 'Store' },
  { key: 'XSTORE_STORECODE',    label: 'Xstore Code',         type: 'text',     group: 'Store' },
  { key: 'NAME',                label: 'Store Name',          type: 'text',     group: 'Store' },
  // Invoice
  { key: 'INVOICENO',           label: 'Invoice No',          type: 'text',     group: 'Invoice' },
  { key: 'AIL_ORDER_ID',        label: 'AIL Order ID',        type: 'text',     group: 'Invoice' },
  { key: 'INVOICETYPE',         label: 'Invoice Type',        type: 'dropdown', group: 'Invoice' },
  { key: 'DAY',                 label: 'Day',                 type: 'dropdown', group: 'Invoice' },
  { key: 'EXTERNAL_SYSTEM',     label: 'External System',     type: 'dropdown', group: 'Invoice' },
  { key: 'ISSALESORDERCREATED', label: 'SO Created',          type: 'dropdown', group: 'Invoice' },
  // Product
  { key: 'BRAND',               label: 'Brand',               type: 'dropdown', group: 'Product' },
  { key: 'SUBBRAND',            label: 'Sub-Brand',           type: 'dropdown', group: 'Product' },
  { key: 'DIVISION',            label: 'Division',            type: 'dropdown', group: 'Product' },
  { key: 'CATEGORY',            label: 'Category',            type: 'dropdown', group: 'Product' },
  { key: 'CLASS',               label: 'Class',               type: 'dropdown', group: 'Product' },
  { key: 'SUBCLASS',            label: 'Sub-Class',           type: 'dropdown', group: 'Product' },
  { key: 'SEASON',              label: 'Season',              type: 'dropdown', group: 'Product' },
  { key: 'COLOR',               label: 'Color',               type: 'dropdown', group: 'Product' },
  { key: 'GENDER',              label: 'Gender',              type: 'dropdown', group: 'Product' },
  { key: 'SLEEVE',              label: 'Sleeve',              type: 'dropdown', group: 'Product' },
  { key: 'MATERIAL_TYPE',       label: 'Material Type',       type: 'dropdown', group: 'Product' },
  { key: 'QUALITY',             label: 'Quality',             type: 'dropdown', group: 'Product' },
  { key: 'FIT_DESC',            label: 'Fit Desc',            type: 'dropdown', group: 'Product' },
  { key: 'BASICCORE',           label: 'Basic/Core',          type: 'dropdown', group: 'Product' },
  { key: 'SUPPLIERSTYLE',       label: 'Supplier Style',      type: 'text',     group: 'Product' },
  { key: 'STYLECODE',           label: 'Style Code',          type: 'text',     group: 'Product' },
  { key: 'ITEM_ID',             label: 'Item ID',             type: 'text',     group: 'Product' },
  { key: 'ITEM_DESCRIPTION',    label: 'Item Description',    type: 'text',     group: 'Product' },
  { key: 'BARCODE',             label: 'Barcode',             type: 'text',     group: 'Product' },
  { key: 'ITEMSIZE',            label: 'Size',                type: 'text',     group: 'Product' },
  { key: 'HSN_CODE',            label: 'HSN Code',            type: 'text',     group: 'Product' },
  { key: 'RPC',                 label: 'RPC',                 type: 'text',     group: 'Product' },
  // Scheme / Discount
  { key: 'SCHEME_CODE',         label: 'Scheme Code',         type: 'text',     group: 'Scheme' },
  { key: 'SCHEME_DESCRIPTION',  label: 'Scheme Description',  type: 'text',     group: 'Scheme' },
  { key: 'MANUAL_DISC_REASON',  label: 'Manual Disc Reason',  type: 'dropdown', group: 'Scheme' },
  // Tax / GST
  { key: 'GSTNO',               label: 'GST No',              type: 'text',     group: 'Tax' },
  { key: 'QC_PASSED',           label: 'QC Passed',           type: 'dropdown', group: 'Tax' },
  // Other
  { key: 'ORDERS',              label: 'Orders',              type: 'text',     group: 'Other' },
  { key: 'OMUNIITEMID',         label: 'OmniChannel Item ID', type: 'text',     group: 'Other' },
]

const GROUPS = ['Store', 'Invoice', 'Product', 'Scheme', 'Tax', 'Other']

// ── All columns — keys match SQL column names from ui.V_D365_SALES ────────
const TABLE_COLUMNS = [
  { key: 'COMPANY',             label: 'Company'             },
  { key: 'REGION',              label: 'Region'              },
  { key: 'STATE',               label: 'State'               },
  { key: 'AIL_ORDER_STATE',     label: 'AIL Order State'     },
  { key: 'CHANNEL',             label: 'Channel'             },
  { key: 'STORE_TYPE',          label: 'Store Type'          },
  { key: 'OWNERSHIP_TYPE',      label: 'Ownership Type'      },
  { key: 'SAP_STORECODE',       label: 'SAP Store Code'      },
  { key: 'XSTORE_STORECODE',    label: 'Xstore Code'         },
  { key: 'NAME',                label: 'Store Name'          },
  { key: 'INVOICENO',           label: 'Invoice No'          },
  { key: 'AIL_ORDER_ID',        label: 'AIL Order ID'        },
  { key: 'INVOICE_DATE',        label: 'Invoice Date'        },
  { key: 'DAY',                 label: 'Day'                 },
  { key: 'BRAND',               label: 'Brand'               },
  { key: 'SUBBRAND',            label: 'Sub-Brand'           },
  { key: 'CLASS',               label: 'Class'               },
  { key: 'SUBCLASS',            label: 'Sub-Class'           },
  { key: 'SUPPLIERSTYLE',       label: 'Supplier Style'      },
  { key: 'ITEMSIZE',            label: 'Size'                },
  { key: 'QUALITY',             label: 'Quality'             },
  { key: 'MATERIAL_TYPE',       label: 'Material Type'       },
  { key: 'SEASON',              label: 'Season'              },
  { key: 'COLOR',               label: 'Color'               },
  { key: 'GENDER',              label: 'Gender'              },
  { key: 'BARCODE',             label: 'Barcode'             },
  { key: 'SLEEVE',              label: 'Sleeve'              },
  { key: 'BASICCORE',           label: 'Basic/Core'          },
  { key: 'INVOICETYPE',         label: 'Invoice Type'        },
  { key: 'ITEM_ID',             label: 'Item ID'             },
  { key: 'STYLECODE',           label: 'Style Code'          },
  { key: 'MANUAL_DISC_REASON',  label: 'Manual Disc Reason'  },
  { key: 'EXTERNAL_SYSTEM',     label: 'External System'     },
  { key: 'ORDERS',              label: 'Orders'              },
  { key: 'DIVISION',            label: 'Division'            },
  { key: 'CATEGORY',            label: 'Category'            },
  { key: 'FIT_DESC',            label: 'Fit Desc'            },
  { key: 'ITEM_DESCRIPTION',    label: 'Item Description'    },
  { key: 'HSN_CODE',            label: 'HSN Code'            },
  { key: 'GSTNO',               label: 'GST No'              },
  { key: 'RPC',                 label: 'RPC'                 },
  { key: 'QC_PASSED',           label: 'QC Passed'           },
  { key: 'SCHEME_CODE',         label: 'Scheme Code'         },
  { key: 'SCHEME_DESCRIPTION',  label: 'Scheme Description'  },
  { key: 'ISSALESORDERCREATED', label: 'SO Created'          },
  { key: 'OMUNIITEMID',         label: 'OmniChannel Item ID' },
  { key: 'UNITMRP',             label: 'Unit MRP'            },
  { key: 'QUANTITY',            label: 'Quantity'            },
  { key: 'TOTAL_MRP',           label: 'Total MRP'           },
  { key: 'TOTAL_DISCOUNT',      label: 'Total Discount'      },
  { key: 'DISCOUNT_EXCL',       label: 'Discount Excl.'      },
  { key: 'GST_REBATE',          label: 'GST Rebate'          },
  { key: 'GWP_DISC',            label: 'GWP Disc'            },
  { key: 'TAXABLE_AMOUNT',      label: 'Taxable Amount'      },
  { key: 'TAXRATE',             label: 'Tax Rate'            },
  { key: 'SGST',                label: 'SGST'                },
  { key: 'CGST',                label: 'CGST'                },
  { key: 'IGST',                label: 'IGST'                },
  { key: 'CESS',                label: 'CESS'                },
  { key: 'TAXAMT',              label: 'Tax Amount'          },
  { key: 'NETAMT',              label: 'Net Amount'          },
]

const CURRENCY_COLS = new Set([
  'UNITMRP','TOTAL_MRP','TOTAL_DISCOUNT','DISCOUNT_EXCL','GST_REBATE','GWP_DISC',
  'TAXABLE_AMOUNT','TAXRATE','SGST','CGST','IGST','CESS','TAXAMT','NETAMT',
])

const PAGE_SIZE = 50

function fmt(key, val) {
  if (val == null || val === '') return '—'
  if (CURRENCY_COLS.has(key))
    return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (key === 'QUANTITY')
    return Number(val).toLocaleString('en-IN')
  if (key === 'INVOICE_DATE')
    return String(val).slice(0, 10)
  return val
}

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

// Build the server-side export URL from current filters.
// Flask /export queries Fabric directly — no Cube.js involved.
// fd_ prefix = dropdown (IN filter), ft_ prefix = text (LIKE contains filter)
function buildExportUrl(fromDate, toDate, allowedBrands, filterValues) {
  const params = new URLSearchParams()
  params.set('from_date', fromDate)
  params.set('to_date',   toDate)

  // RBAC brand restriction
  allowedBrands.forEach(b => params.append('brand', b))

  FILTER_CONFIG.forEach(({ key, type }) => {
    const val = filterValues[key]
    if (type === 'dropdown' && Array.isArray(val) && val.length > 0) {
      val.forEach(v => params.append(`fd_${key}`, v))   // fd_ = dropdown / IN
    } else if (type === 'text' && val && val.trim()) {
      params.set(`ft_${key}`, val.trim())                // ft_ = text / LIKE
    }
  })

  return `/permissions-api/export?${params.toString()}`
}

// Sentinel value representing NULL / blank rows in the dataset
const BLANK = '__blank__'

// ── Multi-select dropdown (lazy loads options from Fabric via /data/values) ──
function MultiDropdown({ column, fromDate, toDate, allowedBrands, selected, onChange }) {
  const [open, setOpen]         = useState(false)
  const [options, setOptions]   = useState([])  // non-null values
  const [hasBlank, setHasBlank] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [fetched, setFetched]   = useState(false)
  const [search, setSearch]     = useState('')
  const ref = useRef()

  // Reset fetch cache whenever date range changes so options stay relevant
  useEffect(() => { setFetched(false); setOptions([]) }, [fromDate, toDate])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open || fetched) return
    setLoading(true)
    const params = new URLSearchParams({ column, from_date: fromDate, to_date: toDate })
    allowedBrands.forEach(b => params.append('brand', b))
    fetch(`/permissions-api/data/values?${params}`)
      .then(r => r.json())
      .then(data => {
        setOptions(data.values || [])
        setHasBlank(!!data.has_blank)
        setFetched(true)
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [open, fetched, column, fromDate, toDate])

  const toggle = v => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  // Search filters non-blank options; "(Blank)" always shows when exists and no search term
  const visible = options.filter(o => !search || String(o).toLowerCase().includes(search.toLowerCase()))

  const displayLabel = () => {
    if (selected.length === 0) return 'All'
    if (selected.length === 1) return selected[0] === BLANK ? '(Blank)' : selected[0]
    const hasBlankSel = selected.includes(BLANK)
    const others = selected.filter(v => v !== BLANK)
    const parts = [...others, ...(hasBlankSel ? ['(Blank)'] : [])]
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
              <input
                className="fd-search"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
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
              {/* Blank option — always at the bottom, hidden when searching */}
              {hasBlank && !search && (
                <>
                  {visible.length > 0 && <div className="fd-sep" />}
                  <div
                    className={`fd-item fd-blank ${selected.includes(BLANK) ? 'fd-checked' : ''}`}
                    onClick={() => toggle(BLANK)}
                  >
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
export default function App({ user, allowedBrands }) {
  const [showAdmin, setShowAdmin] = useState(false)
  const isAdmin = allowedBrands.length === 0  // empty = full access admin
  const today        = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'

  const [fromDate, setFromDate]     = useState(firstOfMonth)
  const [toDate, setToDate]         = useState(today)
  const [filterValues, setFilterValues] = useState({})   // key → [] (dropdown) or string (text)
  const [panelOpen, setPanelOpen]   = useState(true)
  const [activeGroup, setActiveGroup] = useState('Store')

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [page, setPage]         = useState(1)
  const [loaded, setLoaded]     = useState(false)
  const [dlState, setDlState]   = useState(null)  // null | { phase, fetched, zipPct }
  const [totalCount, setTotalCount] = useState(null)

  const setFilter = (key, val) => setFilterValues(prev => ({ ...prev, [key]: val }))

  const activeCount = Object.values(filterValues).filter(v =>
    Array.isArray(v) ? v.length > 0 : v && v.trim()
  ).length

  const clearFilters = () => setFilterValues({})

  const loadData = useCallback(async () => {
    if (!fromDate || !toDate) return
    setLoading(true); setError(null); setPage(1); setTotalCount(null)
    const t0 = Date.now()
    try {
      const filterCount = Object.values(filterValues).filter(v =>
        Array.isArray(v) ? v.length > 0 : v && v.trim()
      ).length

      // Build filter dicts for the Flask API — keys are SQL column names
      const dropdownFilters = {}
      const textFilters = {}
      FILTER_CONFIG.forEach(({ key, type }) => {
        const val = filterValues[key]
        if (type === 'dropdown' && Array.isArray(val) && val.length > 0) {
          dropdownFilters[key] = val
        } else if (type === 'text' && val && val.trim()) {
          textFilters[key] = val.trim()
        }
      })

      // ── Primary data query (blocks UI while loading) ──────────────────────
      const result = await fabricLoad('/data/load', {
        from_date:      fromDate,
        to_date:        toDate,
        filters:        dropdownFilters,
        text_filters:   textFilters,
        allowed_brands: allowedBrands,
        limit:          50000,
      })

      const data = result.data || []
      setRows(data)
      setLoaded(true)
      // Show row count immediately from what we fetched — count query updates it
      setTotalCount(data.length)

      logEvent(user, 'load_data', {
        from_date:    fromDate,
        to_date:      toDate,
        filter_count: filterCount,
        row_count:    data.length,
        duration_ms:  Date.now() - t0,
      })

      // ── Count query — non-blocking, runs in background ────────────────────
      // Updates the total count so users know the true result set size even
      // when data is capped at 50 000 rows.
      fabricLoad('/data/load', {
        from_date:      fromDate,
        to_date:        toDate,
        filters:        dropdownFilters,
        text_filters:   textFilters,
        allowed_brands: allowedBrands,
        count_only:     true,
      })
        .then(r => { if (r.count > 0) setTotalCount(r.count) })
        .catch(() => { /* keep data.length shown above */ })

    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [fromDate, toDate, filterValues, allowedBrands])

  const handleDownload = useCallback(async () => {
    const filterCount = Object.values(filterValues).filter(v =>
      Array.isArray(v) ? v.length > 0 : v && v.trim()
    ).length

    setDlState({ phase: 'preparing', pct: 0 })
    setError(null)

    try {
      const url = buildExportUrl(fromDate, toDate, allowedBrands, filterValues)

      // Phase 1 — server is querying Fabric and building the ZIP
      const res = await fetch(url)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      // Phase 2 — ZIP is ready, browser is receiving bytes
      setDlState({ phase: 'downloading', pct: 0 })

      // Stream the response with progress tracking
      const contentLength = Number(res.headers.get('content-length') || 0)
      let received = 0
      const reader  = res.body.getReader()
      const chunks  = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (contentLength > 0) {
          setDlState({ phase: 'downloading', pct: Math.round((received / contentLength) * 100) })
        }
      }

      // Phase 3 — trigger browser save
      setDlState({ phase: 'saving', pct: 100 })
      const blob   = new Blob(chunks, { type: 'application/zip' })
      const objUrl = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href     = objUrl
      a.download = `pos_sales_${fromDate}_to_${toDate}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000)

      // Brief "done" flash before dismissing
      setDlState({ phase: 'done', pct: 100 })
      setTimeout(() => setDlState(null), 1500)

      logEvent(user, 'csv_export', {
        from_date:    fromDate,
        to_date:      toDate,
        filter_count: filterCount,
      })
    } catch (e) {
      setError(`Download failed: ${e.message}`)
      setDlState(null)
    }
  }, [fromDate, toDate, filterValues, allowedBrands])

  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const sortedRows = sortCol ? [...rows].sort((a, b) => {
    const av = a[sortCol] ?? ''
    const bv = b[sortCol] ?? ''
    const isNum = CURRENCY_COLS.has(sortCol) || sortCol === 'QUANTITY'
    const cmp = isNum ? Number(av) - Number(bv) : String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  }) : rows

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE)
  const pageRows   = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const groupFilters = g => FILTER_CONFIG.filter(f => f.group === g)

  if (showAdmin && isAdmin) {
    return <AdminPage currentUser={user} onBack={() => setShowAdmin(false)} />
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          <img src={arvindLogo} alt="Arvind Fashions" className="logo-img" />
        </div>
        <div className="header-sub">POS / AIL Sales Explorer</div>
        <div className="header-user">
          {allowedBrands.length > 0 && (
            <span className="header-brand-badge">
              🔒 {allowedBrands.join(' · ')}
            </span>
          )}
          <span className="header-name">{user.displayName}</span>
          {isAdmin && (
            <button className="btn-admin" onClick={() => setShowAdmin(true)}>
              ⚙ Admin
            </button>
          )}
          <button className="btn-signout" onClick={() => msalInstance.logoutRedirect()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        {/* ── Top bar: date + actions ── */}
        <section className="top-bar">
          <div className="top-bar-left">
            <div className="filter-group">
              <label>From Date</label>
              <input type="date" value={fromDate} max={toDate}
                onChange={e => setFromDate(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>To Date</label>
              <input type="date" value={toDate} min={fromDate} max={today}
                onChange={e => setToDate(e.target.value)} />
            </div>
            <button
              className="panel-toggle"
              onClick={() => setPanelOpen(o => !o)}
            >
              {panelOpen ? '▲' : '▼'} Filters
              {activeCount > 0 && <span className="badge">{activeCount}</span>}
            </button>
            {activeCount > 0 && (
              <button className="clear-btn" onClick={clearFilters}>✕ Clear all</button>
            )}
          </div>
          <div className="top-bar-right">
            <button className="btn-primary" onClick={loadData} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Loading…' : 'Load Data'}
            </button>
            <button className="btn-download" onClick={handleDownload}
              disabled={!!dlState || !loaded}>
              {dlState ? (
                <>
                  <span className="spinner" />
                  {dlState.phase === 'preparing'   ? 'Preparing…'  :
                   dlState.phase === 'downloading' ? 'Downloading…' :
                   dlState.phase === 'saving'      ? 'Saving…'     : 'Done'}
                </>
              ) : '⬇ Download ZIP'}
            </button>
          </div>
        </section>

        {/* ── Filter panel ── */}
        {panelOpen && (
          <section className="filter-panel">
            {/* Group tabs */}
            <div className="group-tabs">
              {GROUPS.map(g => {
                const cnt = groupFilters(g).filter(f => {
                  const v = filterValues[f.key]
                  return Array.isArray(v) ? v.length > 0 : v && v.trim()
                }).length
                return (
                  <button
                    key={g}
                    className={`group-tab ${activeGroup === g ? 'group-tab-active' : ''}`}
                    onClick={() => setActiveGroup(g)}
                  >
                    {g}
                    {cnt > 0 && <span className="tab-badge">{cnt}</span>}
                  </button>
                )
              })}
            </div>

            {/* Filters grid for active group */}
            <div className="filters-grid">
              {groupFilters(activeGroup).map(({ key, label, type }) => (
                <div key={key} className="f-cell">
                  <label className="f-label">{label}</label>
                  {key === 'BRAND' && allowedBrands.length > 0 ? (
                    <div className="brand-chips-locked">
                      {allowedBrands.map(b => (
                        <span key={b} className="brand-chip">🔒 {b}</span>
                      ))}
                    </div>
                  ) : type === 'dropdown' ? (
                    <MultiDropdown
                      column={key}
                      fromDate={fromDate}
                      toDate={toDate}
                      allowedBrands={allowedBrands}
                      selected={filterValues[key] || []}
                      onChange={val => setFilter(key, val)}
                    />
                  ) : (
                    <input
                      className={`f-text ${filterValues[key] ? 'f-text-active' : ''}`}
                      type="text"
                      placeholder="contains…"
                      value={filterValues[key] || ''}
                      onChange={e => setFilter(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Error ── */}
        {error && <div className="error-bar"><strong>Error:</strong> {error}</div>}

        {/* ── Stats bar ── */}
        {loaded && !loading && (
          <div className="stats-bar">
            <span className="stat">
              <strong>{(totalCount || rows.length).toLocaleString('en-IN')}</strong> total rows
            </span>
            {(totalCount || rows.length) > rows.length && (
              <>
                <span className="sdot">·</span>
                <span className="stat showing-badge">showing first <strong>{rows.length.toLocaleString('en-IN')}</strong></span>
              </>
            )}
            <span className="sdot">·</span>
            <span className="stat">Page <strong>{page}</strong> / <strong>{totalPages || 1}</strong></span>
            <span className="sdot">·</span>
            <span className="stat">
              Qty: <strong>{rows.reduce((s, r) => s + (Number(r['QUANTITY']) || 0), 0).toLocaleString('en-IN')}</strong>
            </span>
            <span className="sdot">·</span>
            <span className="stat">
              Net: <strong>₹{rows.reduce((s, r) => s + (Number(r['NETAMT']) || 0), 0)
                .toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>Fetching data…</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && loaded && rows.length === 0 && (
          <div className="empty-state">No data found for the selected filters.</div>
        )}

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
                          <span className="sort-icon">
                            {sortCol === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr key={i}>
                      {TABLE_COLUMNS.map(c => (
                        <td key={c.key}
                          className={CURRENCY_COLS.has(c.key) || c.key === 'QUANTITY' ? 'num' : ''}>
                          {fmt(c.key, row[c.key])}
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

      {/* ── Download progress bar (fixed bottom) ── */}
      {dlState && (
        <div className="dl-bar">
          <div className="dl-bar-inner">
            <div className="dl-bar-icon">
              {dlState.phase === 'done' ? '✅' : '⬇'}
            </div>
            <div className="dl-bar-body">
              <div className="dl-bar-labels">
                <span className="dl-bar-phase">
                  {dlState.phase === 'preparing'   && '⏳ Preparing ZIP on server…'}
                  {dlState.phase === 'downloading' && (
                    dlState.pct > 0
                      ? `⬇ Downloading… ${dlState.pct}%`
                      : '⬇ Downloading…'
                  )}
                  {dlState.phase === 'saving'      && '💾 Saving file…'}
                  {dlState.phase === 'done'        && '✅ Download complete!'}
                </span>
                <span className="dl-bar-hint">
                  {dlState.phase === 'preparing'   && 'Querying Fabric and building the ZIP — please wait'}
                  {dlState.phase === 'downloading' && 'Do not close this tab'}
                  {dlState.phase === 'saving'      && 'Check your browser downloads bar'}
                  {dlState.phase === 'done'        && ''}
                </span>
              </div>
              <div className="dl-progress-track">
                <div
                  className="dl-progress-fill"
                  style={
                    dlState.phase === 'preparing' || (dlState.phase === 'downloading' && dlState.pct === 0)
                      ? { width: '100%', animation: 'dl-indeterminate 1.4s ease infinite' }
                      : { width: `${dlState.pct}%`, animation: 'none', transition: 'width 0.3s ease' }
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
