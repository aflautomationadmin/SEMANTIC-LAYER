import { useEffect, useMemo, useState } from 'react'
import { msalInstance } from './authConfig'
import arvindLogo from './assets/arvind-logo.png'
import { logEvent } from './logger'
import './KpiInputPortal.css'

const API = '/permissions-api'

const formatMonth = date =>
  `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`

const monthOptions = () => {
  const now = new Date()
  return [-1, 0, 1].map(offset => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const value = formatMonth(date)
    const label = offset === -1 ? 'Previous' : offset === 0 ? 'Current' : 'Next'
    return { label, value }
  })
}

export default function KpiInputPortal({ user, portal, onBack }) {
  const [template, setTemplate] = useState(null)
  const periodOptions = useMemo(() => monthOptions(), [])
  const [period, setPeriod] = useState(periodOptions[1].value)
  const [activeBrand, setActiveBrand] = useState('')
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingValues, setLoadingValues] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/kpi-template?portal_id=${encodeURIComponent(portal.id)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setTemplate(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [portal.id])

  const brandSections = useMemo(() => {
    const groups = {}
    ;(template?.sheets || []).forEach(sheet => {
      const brand = sheet.brand || 'UNASSIGNED'
      if (!groups[brand]) groups[brand] = []
      groups[brand].push(sheet)
    })
    return Object.entries(groups).map(([brand, sheets]) => ({ brand, sheets }))
  }, [template])

  useEffect(() => {
    if (brandSections.length && !brandSections.some(section => section.brand === activeBrand)) {
      setActiveBrand(brandSections[0].brand)
    }
  }, [activeBrand, brandSections])

  const activeSection = brandSections.find(section => section.brand === activeBrand) || brandSections[0]

  useEffect(() => {
    if (!template || !period) return
    const ctrl = new AbortController()
    setLoadingValues(true)
    setError('')
    fetch(`${API}/kpi-inputs?portal_id=${encodeURIComponent(portal.id)}&period=${encodeURIComponent(period)}`, {
      signal: ctrl.signal,
    })
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error([data.error, data.hint].filter(Boolean).join(' ') || 'Could not load existing KPI values')
        setValues(data.values || {})
        setSaved(data.rows_loaded ? `${data.rows_loaded} existing target${data.rows_loaded === 1 ? '' : 's'} loaded for ${period}.` : '')
      })
      .catch(e => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingValues(false)
      })
    return () => ctrl.abort()
  }, [period, portal.id, template])

  const rowKey = (sheetId, idx) => `${sheetId}::${idx}`

  const rowValue = (key, field) => {
    const val = values[key]
    if (val && typeof val === 'object') return val[field] || ''
    return field === 'target' ? (val || '') : ''
  }

  const setRowValue = (sheetId, idx, field, val) =>
    setValues(prev => {
      const key = rowKey(sheetId, idx)
      const current = prev[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { target: prev[key] || '', actual: '' }
      return { ...prev, [key]: { ...current, [field]: val } }
    })

  const entries = () => {
    const result = []
    ;(activeSection?.sheets || []).forEach(sheet => {
      ;(sheet.rows || []).forEach((row, idx) => {
        const key = rowKey(sheet.id, idx)
        const target = rowValue(key, 'target').trim()
        const actual = rowValue(key, 'actual').trim()
        result.push({
          sheet_id: sheet.id,
          brand: sheet.brand,
          category: row.category,
          kpi: row.kpi,
          target,
          actual,
        })
      })
    })
    return result
  }

  const submit = async () => {
    const payload = entries()
    if (!period.trim()) { setError('Enter a month.'); return }
    if (payload.length === 0) { setError('No KPI rows found.'); return }

    setSaving(true); setError(''); setSaved('')
    try {
      const res = await fetch(`${API}/kpi-inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_id: portal.id,
          period: period.trim(),
          entries: payload,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = [data.error, data.hint].filter(Boolean).join(' ')
        throw new Error(detail || 'Save failed')
      }
      setSaved(`${data.saved} KPI row${data.saved === 1 ? '' : 's'} saved to Fabric. ${data.verified ?? data.saved} verified in table.${data.null_targets ? ` ${data.null_targets} NULL target${data.null_targets === 1 ? '' : 's'}.` : ''}${data.null_actuals ? ` ${data.null_actuals} NULL actual${data.null_actuals === 1 ? '' : 's'}.` : ''}`)
      logEvent(user, 'kpi_input_submit', {
        portal_id: portal.id,
        portal_name: portal.name,
        brand: activeSection?.brand,
        period: period.trim(),
        rows: data.saved,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kpi-page">
      <header className="kpi-header">
        <div className="kpi-header-left">
          <img src={arvindLogo} alt="Arvind Fashions" className="kpi-logo" />
          <button className="btn-back-portals" onClick={onBack}>Back to Portals</button>
          <div>
            <div className="kpi-title">{portal.name}</div>
            <div className="kpi-subtitle">Targets save to prd.DIM_UI_KPI_TRACKER_THCK</div>
          </div>
        </div>
        <div className="kpi-header-right">
          <span className="kpi-user">{user.displayName}</span>
          <button className="btn-signout" onClick={() => msalInstance.logoutRedirect()}>Sign out</button>
        </div>
      </header>

      <main className="kpi-main">
        <section className="kpi-toolbar">
          <label className="kpi-period">
            <span>Month</span>
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              {periodOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.value}
                </option>
              ))}
            </select>
          </label>
          <div className="kpi-actions">
            {saved && <span className="kpi-saved">{saved}</span>}
            <button className="btn-primary" onClick={submit} disabled={saving || loading || loadingValues}>
              {saving ? 'Saving...' : loadingValues ? 'Loading...' : 'Save Targets'}
            </button>
          </div>
        </section>

        {loading && <div className="kpi-state">Loading KPI template...</div>}
        {loadingValues && <div className="kpi-state">Loading existing KPI targets...</div>}
        {error && <div className="error-bar"><strong>Error:</strong> {error}</div>}

        {!loading && !loadingValues && template && (
          <div className="kpi-workspace">
            <div className="kpi-tabs" role="tablist" aria-label="Brands">
              {brandSections.map(section => (
                <button
                  key={section.brand}
                  type="button"
                  role="tab"
                  aria-selected={section.brand === activeBrand}
                  className={`kpi-tab ${section.brand === activeBrand ? 'active' : ''}`}
                  onClick={() => setActiveBrand(section.brand)}
                >
                  {section.brand}
                </button>
              ))}
            </div>

            {activeSection && (
              <section className="kpi-panel">
                <div className="kpi-panel-head">
                  <div>
                    <h2>{activeSection.brand}</h2>
                    <p>Enter numeric target and actual values. Text is cleaned to uppercase before saving.</p>
                  </div>
                  <span className="kpi-count">
                    {activeSection.sheets.reduce((sum, s) => sum + s.rows.length, 0)} KPIs
                  </span>
                </div>

                <div className="kpi-table-wrap">
                  <table className="kpi-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>KPI</th>
                        <th>Target</th>
                        <th>Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSection.sheets.flatMap(sheet =>
                        sheet.rows.map((row, idx) => {
                          const key = rowKey(sheet.id, idx)
                          return (
                            <tr key={key}>
                              <td className="kpi-category">{row.category}</td>
                              <td className="kpi-name">{row.kpi}</td>
                              <td>
                                <input
                                  className="kpi-input"
                                  value={rowValue(key, 'target')}
                                  onChange={e => setRowValue(sheet.id, idx, 'target', e.target.value)}
                                  placeholder="Enter target"
                                  inputMode="decimal"
                                />
                              </td>
                              <td>
                                <input
                                  className="kpi-input"
                                  value={rowValue(key, 'actual')}
                                  onChange={e => setRowValue(sheet.id, idx, 'actual', e.target.value)}
                                  placeholder="Enter actual"
                                  inputMode="decimal"
                                />
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
