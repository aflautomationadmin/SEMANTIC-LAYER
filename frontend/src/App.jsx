import { useState, useEffect, useCallback, useRef } from 'react'
import { msalInstance } from './authConfig'
import AdminPage from './AdminPage'
import arvindLogo from './assets/arvind-logo.png'
import './App.css'

const CUBE_API = '/cubejs-api/v1'   // proxied by Apache → localhost:4000
const CUBE_TOKEN = import.meta.env.VITE_CUBEJS_TOKEN || 'dev'

// ── Filter config: all categorical dimensions ─────────────────────────────
// type: 'dropdown' → multi-select fetched from Cube.js
// type: 'text'     → free-text contains search
const FILTER_CONFIG = [
  // Store / Location
  { key: 'FactPosAilSales.company',             label: 'Company',             type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.region',              label: 'Region',              type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.state',               label: 'State',               type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.ail_order_state',     label: 'AIL Order State',     type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.channel',             label: 'Channel',             type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.store_type',          label: 'Store Type',          type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.ownership_type',      label: 'Ownership Type',      type: 'dropdown', group: 'Store' },
  { key: 'FactPosAilSales.sap_storecode',       label: 'SAP Store Code',      type: 'text',     group: 'Store' },
  { key: 'FactPosAilSales.xstore_storecode',    label: 'Xstore Code',         type: 'text',     group: 'Store' },
  { key: 'FactPosAilSales.name',                label: 'Store Name',          type: 'text',     group: 'Store' },
  // Invoice
  { key: 'FactPosAilSales.invoiceno',           label: 'Invoice No',          type: 'text',     group: 'Invoice' },
  { key: 'FactPosAilSales.ail_order_id',        label: 'AIL Order ID',        type: 'text',     group: 'Invoice' },
  { key: 'FactPosAilSales.invoicetype',         label: 'Invoice Type',        type: 'dropdown', group: 'Invoice' },
  { key: 'FactPosAilSales.day',                 label: 'Day',                 type: 'dropdown', group: 'Invoice' },
  { key: 'FactPosAilSales.external_system',     label: 'External System',     type: 'dropdown', group: 'Invoice' },
  { key: 'FactPosAilSales.issalesordercreated', label: 'SO Created',          type: 'dropdown', group: 'Invoice' },
  // Product
  { key: 'FactPosAilSales.brand',               label: 'Brand',               type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.subbrand',            label: 'Sub-Brand',           type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.division',            label: 'Division',            type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.category',            label: 'Category',            type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.class',               label: 'Class',               type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.subclass',            label: 'Sub-Class',           type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.season',              label: 'Season',              type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.color',               label: 'Color',               type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.gender',              label: 'Gender',              type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.sleeve',              label: 'Sleeve',              type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.material_type',       label: 'Material Type',       type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.quality',             label: 'Quality',             type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.fit_desc',            label: 'Fit Desc',            type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.basiccore',           label: 'Basic/Core',          type: 'dropdown', group: 'Product' },
  { key: 'FactPosAilSales.supplierstyle',       label: 'Supplier Style',      type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.stylecode',           label: 'Style Code',          type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.item_id',             label: 'Item ID',             type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.item_description',    label: 'Item Description',    type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.barcode',             label: 'Barcode',             type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.itemsize',            label: 'Size',                type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.hsn_code',            label: 'HSN Code',            type: 'text',     group: 'Product' },
  { key: 'FactPosAilSales.rpc',                 label: 'RPC',                 type: 'text',     group: 'Product' },
  // Scheme / Discount
  { key: 'FactPosAilSales.scheme_code',         label: 'Scheme Code',         type: 'text',     group: 'Scheme' },
  { key: 'FactPosAilSales.scheme_description',  label: 'Scheme Description',  type: 'text',     group: 'Scheme' },
  { key: 'FactPosAilSales.manual_disc_reason',  label: 'Manual Disc Reason',  type: 'dropdown', group: 'Scheme' },
  // Tax / GST
  { key: 'FactPosAilSales.gstno',               label: 'GST No',              type: 'text',     group: 'Tax' },
  { key: 'FactPosAilSales.qc_passed',           label: 'QC Passed',           type: 'dropdown', group: 'Tax' },
  // Other
  { key: 'FactPosAilSales.rtrans_lineitm_seq',  label: 'Line Seq',            type: 'text',     group: 'Other' },
  { key: 'FactPosAilSales.orders',              label: 'Orders',              type: 'text',     group: 'Other' },
  { key: 'FactPosAilSales.omuniitemid',         label: 'OmniChannel Item ID', type: 'text',     group: 'Other' },
]

const GROUPS = ['Store', 'Invoice', 'Product', 'Scheme', 'Tax', 'Other']

// ── All columns in exact SQL SELECT order ─────────────────────────────────
const TABLE_COLUMNS = [
  { key: 'FactPosAilSales.company',             label: 'Company',             dim: true  },
  { key: 'FactPosAilSales.region',              label: 'Region',              dim: true  },
  { key: 'FactPosAilSales.state',               label: 'State',               dim: true  },
  { key: 'FactPosAilSales.ail_order_state',     label: 'AIL Order State',     dim: true  },
  { key: 'FactPosAilSales.channel',             label: 'Channel',             dim: true  },
  { key: 'FactPosAilSales.store_type',          label: 'Store Type',          dim: true  },
  { key: 'FactPosAilSales.ownership_type',      label: 'Ownership Type',      dim: true  },
  { key: 'FactPosAilSales.sap_storecode',       label: 'SAP Store Code',      dim: true  },
  { key: 'FactPosAilSales.xstore_storecode',    label: 'Xstore Code',         dim: true  },
  { key: 'FactPosAilSales.name',                label: 'Store Name',          dim: true  },
  { key: 'FactPosAilSales.invoiceno',           label: 'Invoice No',          dim: true  },
  { key: 'FactPosAilSales.ail_order_id',        label: 'AIL Order ID',        dim: true  },
  { key: 'FactPosAilSales.invoice_date',        label: 'Invoice Date',        dim: true  },
  { key: 'FactPosAilSales.day',                 label: 'Day',                 dim: true  },
  { key: 'FactPosAilSales.brand',               label: 'Brand',               dim: true  },
  { key: 'FactPosAilSales.subbrand',            label: 'Sub-Brand',           dim: true  },
  { key: 'FactPosAilSales.class',               label: 'Class',               dim: true  },
  { key: 'FactPosAilSales.subclass',            label: 'Sub-Class',           dim: true  },
  { key: 'FactPosAilSales.supplierstyle',       label: 'Supplier Style',      dim: true  },
  { key: 'FactPosAilSales.itemsize',            label: 'Size',                dim: true  },
  { key: 'FactPosAilSales.quality',             label: 'Quality',             dim: true  },
  { key: 'FactPosAilSales.material_type',       label: 'Material Type',       dim: true  },
  { key: 'FactPosAilSales.season',              label: 'Season',              dim: true  },
  { key: 'FactPosAilSales.color',               label: 'Color',               dim: true  },
  { key: 'FactPosAilSales.gender',              label: 'Gender',              dim: true  },
  { key: 'FactPosAilSales.barcode',             label: 'Barcode',             dim: true  },
  { key: 'FactPosAilSales.sleeve',              label: 'Sleeve',              dim: true  },
  { key: 'FactPosAilSales.basiccore',           label: 'Basic/Core',          dim: true  },
  { key: 'FactPosAilSales.invoicetype',         label: 'Invoice Type',        dim: true  },
  { key: 'FactPosAilSales.item_id',             label: 'Item ID',             dim: true  },
  { key: 'FactPosAilSales.stylecode',           label: 'Style Code',          dim: true  },
  { key: 'FactPosAilSales.rtrans_lineitm_seq',  label: 'Line Seq',            dim: true  },
  { key: 'FactPosAilSales.manual_disc_reason',  label: 'Manual Disc Reason',  dim: true  },
  { key: 'FactPosAilSales.external_system',     label: 'External System',     dim: true  },
  { key: 'FactPosAilSales.orders',              label: 'Orders',              dim: true  },
  { key: 'FactPosAilSales.division',            label: 'Division',            dim: true  },
  { key: 'FactPosAilSales.category',            label: 'Category',            dim: true  },
  { key: 'FactPosAilSales.fit_desc',            label: 'Fit Desc',            dim: true  },
  { key: 'FactPosAilSales.item_description',    label: 'Item Description',    dim: true  },
  { key: 'FactPosAilSales.hsn_code',            label: 'HSN Code',            dim: true  },
  { key: 'FactPosAilSales.gstno',               label: 'GST No',              dim: true  },
  { key: 'FactPosAilSales.rpc',                 label: 'RPC',                 dim: true  },
  { key: 'FactPosAilSales.qc_passed',           label: 'QC Passed',           dim: true  },
  { key: 'FactPosAilSales.scheme_code',         label: 'Scheme Code',         dim: true  },
  { key: 'FactPosAilSales.scheme_description',  label: 'Scheme Description',  dim: true  },
  { key: 'FactPosAilSales.issalesordercreated', label: 'SO Created',          dim: true  },
  { key: 'FactPosAilSales.omuniitemid',         label: 'OmniChannel Item ID', dim: true  },
  { key: 'FactPosAilSales.unitmrp',             label: 'Unit MRP',            dim: false },
  { key: 'FactPosAilSales.quantity',            label: 'Quantity',            dim: false },
  { key: 'FactPosAilSales.total_mrp',           label: 'Total MRP',           dim: false },
  { key: 'FactPosAilSales.total_discount',      label: 'Total Discount',      dim: false },
  { key: 'FactPosAilSales.discount_excl',       label: 'Discount Excl.',      dim: false },
  { key: 'FactPosAilSales.gst_rebate',          label: 'GST Rebate',          dim: false },
  { key: 'FactPosAilSales.gwp_disc',            label: 'GWP Disc',            dim: false },
  { key: 'FactPosAilSales.taxable_amount',      label: 'Taxable Amount',      dim: false },
  { key: 'FactPosAilSales.taxrate',             label: 'Tax Rate',            dim: false },
  { key: 'FactPosAilSales.sgst',                label: 'SGST',                dim: false },
  { key: 'FactPosAilSales.cgst',                label: 'CGST',                dim: false },
  { key: 'FactPosAilSales.igst',                label: 'IGST',                dim: false },
  { key: 'FactPosAilSales.cess',                label: 'CESS',                dim: false },
  { key: 'FactPosAilSales.taxamt',              label: 'Tax Amount',          dim: false },
  { key: 'FactPosAilSales.netamt',              label: 'Net Amount',          dim: false },
]

const CURRENCY_COLS = new Set([
  'FactPosAilSales.unitmrp', 'FactPosAilSales.total_mrp', 'FactPosAilSales.total_discount',
  'FactPosAilSales.discount_excl', 'FactPosAilSales.gst_rebate', 'FactPosAilSales.gwp_disc',
  'FactPosAilSales.taxable_amount', 'FactPosAilSales.taxrate', 'FactPosAilSales.sgst',
  'FactPosAilSales.cgst', 'FactPosAilSales.igst', 'FactPosAilSales.cess',
  'FactPosAilSales.taxamt', 'FactPosAilSales.netamt',
])

const PAGE_SIZE = 50

function fmt(key, val) {
  if (val == null || val === '') return '—'
  if (CURRENCY_COLS.has(key))
    return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (key === 'FactPosAilSales.quantity')
    return Number(val).toLocaleString('en-IN')
  if (key === 'FactPosAilSales.invoice_date')
    return String(val).slice(0, 10)
  return val
}

async function cubeLoad(query) {
  const res = await fetch(`${CUBE_API}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: CUBE_TOKEN },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return (await res.json()).data || []
}

const CUBE_PAGE      = 50_000    // rows per Cube.js request
const MAX_ROWS_FILE  = 1_000_000 // max rows per CSV file (10 lakh)
const CSV_HEADER     = TABLE_COLUMNS.map(c => c.label).join(',')

function rowToCSVLine(row) {
  return TABLE_COLUMNS.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
}

function triggerDownload(lines, fileIndex, dateStr) {
  const content = [CSV_HEADER, ...lines].join('\n')
  const blob    = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url     = URL.createObjectURL(blob)
  const a       = document.createElement('a')
  a.href        = url
  a.download    = `pos_sales_${dateStr}_part${fileIndex}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Fetches ALL matching rows from Cube.js in pages, splits into ≤10L-row CSV files.
async function downloadAll(baseQuery, onProgress) {
  const dateStr  = new Date().toISOString().slice(0, 10)
  let offset     = 0
  let fileIndex  = 1
  let fileLines  = []   // lines for the current file
  let totalRows  = 0

  while (true) {
    const page = await cubeLoad({ ...baseQuery, limit: CUBE_PAGE, offset })
    if (!page.length) break

    for (const row of page) {
      fileLines.push(rowToCSVLine(row))
      totalRows++

      // When current file hits 10L rows, flush it and start a new one
      if (fileLines.length >= MAX_ROWS_FILE) {
        triggerDownload(fileLines, fileIndex, dateStr)
        fileIndex++
        fileLines = []
      }
    }

    onProgress(totalRows)

    // If fewer rows than requested, we've reached the last page
    if (page.length < CUBE_PAGE) break
    offset += CUBE_PAGE
  }

  // Flush the last (possibly partial) file
  if (fileLines.length > 0) {
    triggerDownload(fileLines, fileIndex, dateStr)
  }

  return { totalRows, files: fileIndex }
}

// ── Multi-select dropdown (lazy loads options from Cube.js) ───────────────
function MultiDropdown({ memberKey, selected, onChange }) {
  const [open, setOpen]         = useState(false)
  const [options, setOptions]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [fetched, setFetched]   = useState(false)
  const [search, setSearch]     = useState('')
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open || fetched) return
    setLoading(true)
    cubeLoad({
      dimensions: [memberKey],
      measures:   ['FactPosAilSales.count'],
      order:      { [memberKey]: 'asc' },
      filters:    [{ member: memberKey, operator: 'set' }],
    })
      .then(data => { setOptions(data.map(r => r[memberKey]).filter(Boolean)); setFetched(true) })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [open, fetched, memberKey])

  const toggle = v => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const visible = options.filter(o => !search || String(o).toLowerCase().includes(search.toLowerCase()))
  const label   = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`

  return (
    <div className="fd" ref={ref}>
      <button
        className={`fd-trigger ${selected.length > 0 ? 'fd-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={selected.length > 0 ? selected.join(', ') : ''}
      >
        <span className="fd-label">{label}</span>
        <span className="fd-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="fd-menu">
          {options.length > 8 && (
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
          {!loading && visible.length === 0 && <div className="fd-info">No results</div>}
          {!loading && visible.length > 0 && (
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
  const [dlState, setDlState]   = useState(null)  // null | { fetched, files }
  const [totalCount, setTotalCount] = useState(null)

  const setFilter = (key, val) => setFilterValues(prev => ({ ...prev, [key]: val }))

  const activeCount = Object.values(filterValues).filter(v =>
    Array.isArray(v) ? v.length > 0 : v && v.trim()
  ).length

  const clearFilters = () => setFilterValues({})

  const buildFilters = () => {
    const filters = [{
      member: 'FactPosAilSales.invoice_date',
      operator: 'inDateRange',
      values: [fromDate, toDate],
    }]
    // RBAC: mandatory brand restriction when user is not full-access
    if (allowedBrands && allowedBrands.length > 0) {
      filters.push({ member: 'FactPosAilSales.brand', operator: 'equals', values: allowedBrands })
    }
    FILTER_CONFIG.forEach(({ key, type }) => {
      // Skip brand if RBAC lock is active (already injected above)
      if (key === 'FactPosAilSales.brand' && allowedBrands.length > 0) return
      const val = filterValues[key]
      if (type === 'dropdown' && Array.isArray(val) && val.length > 0)
        filters.push({ member: key, operator: 'equals', values: val })
      else if (type === 'text' && val && val.trim())
        filters.push({ member: key, operator: 'contains', values: [val.trim()] })
    })
    return filters
  }

  const loadData = useCallback(async () => {
    if (!fromDate || !toDate) return
    setLoading(true); setError(null); setPage(1); setTotalCount(null)
    try {
      const filters = buildFilters()
      const [data, countResult] = await Promise.all([
        cubeLoad({
          dimensions: TABLE_COLUMNS.filter(c => c.dim).map(c => c.key),
          measures:   TABLE_COLUMNS.filter(c => !c.dim).map(c => c.key),
          filters,
          order: { 'FactPosAilSales.invoice_date': 'desc' },
          limit: 50000,
        }),
        cubeLoad({
          measures: ['FactPosAilSales.count'],
          filters,
        }),
      ])
      setRows(data)
      setTotalCount(Number(countResult[0]?.['FactPosAilSales.count'] ?? 0))
      setLoaded(true)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [fromDate, toDate, filterValues])

  const handleDownload = useCallback(async () => {
    setDlState({ fetched: 0, files: 0 })
    setError(null)
    try {
      const baseQuery = {
        dimensions: TABLE_COLUMNS.filter(c => c.dim).map(c => c.key),
        measures:   TABLE_COLUMNS.filter(c => !c.dim).map(c => c.key),
        filters:    buildFilters(),
        order:      { 'FactPosAilSales.invoice_date': 'desc' },
      }
      const { totalRows, files } = await downloadAll(
        baseQuery,
        fetched => setDlState({ fetched, files: Math.ceil(fetched / MAX_ROWS_FILE) })
      )
      setDlState(null)
      if (totalRows === 0) setError('No data to download for the selected filters.')
    } catch (e) {
      setDlState(null)
      setError(e.message)
    }
  }, [fromDate, toDate, filterValues])

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
    const isNum = CURRENCY_COLS.has(sortCol) || sortCol === 'FactPosAilSales.quantity'
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
            <button className="btn-outline" onClick={handleDownload}
              disabled={!!dlState || !loaded}>
              {dlState
                ? `↓ ${dlState.fetched.toLocaleString('en-IN')} rows…`
                : '↓ Download CSV'}
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
                  {key === 'FactPosAilSales.brand' && allowedBrands.length > 0 ? (
                    <div className="brand-chips-locked">
                      {allowedBrands.map(b => (
                        <span key={b} className="brand-chip">🔒 {b}</span>
                      ))}
                    </div>
                  ) : type === 'dropdown' ? (
                    <MultiDropdown
                      memberKey={key}
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
              <strong>{totalCount?.toLocaleString('en-IN') ?? rows.length.toLocaleString('en-IN')}</strong> total rows
            </span>
            {totalCount > rows.length && (
              <>
                <span className="sdot">·</span>
                <span className="stat showing-badge">showing first <strong>{rows.length.toLocaleString('en-IN')}</strong></span>
              </>
            )}
            <span className="sdot">·</span>
            <span className="stat">Page <strong>{page}</strong> / <strong>{totalPages || 1}</strong></span>
            <span className="sdot">·</span>
            <span className="stat">
              Qty: <strong>{rows.reduce((s, r) => s + (Number(r['FactPosAilSales.quantity']) || 0), 0).toLocaleString('en-IN')}</strong>
            </span>
            <span className="sdot">·</span>
            <span className="stat">
              Net: <strong>₹{rows.reduce((s, r) => s + (Number(r['FactPosAilSales.netamt']) || 0), 0)
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
                          className={CURRENCY_COLS.has(c.key) || c.key === 'FactPosAilSales.quantity' ? 'num' : ''}>
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
    </div>
  )
}
