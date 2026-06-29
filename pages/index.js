import { useState, useEffect } from 'react'
import Head from 'next/head'

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
const pct = (n) => n == null ? '—' : (n * 100).toFixed(1) + '%'
const shortDate = (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const STAGES_NEEDING_VALUE = ['MC Unsecured', 'MC Secured', 'Negotiating']

const NAV = ['Deals Researched','Tenders Received','Projects Priced','Work Secured','Strike Rate','Lost Reasons','Geo Sales Open','Geo Sales Won','Customer Details']

const STATUS_COLORS = { Won: '#16a34a', Lost: '#e63946', Open: '#2a78d6' }

export default function Dashboard() {
  const [page, setPage] = useState('Deals Researched')
  const [deals, setDeals] = useState([])
  const [valueChanges, setValueChanges] = useState([])
  const [lastSync, setLastSync] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filters, setFilters] = useState({ customerType: 'All', estimator: 'All', projectStage: 'All', salesPerson: 'All', leadSource: 'All', variation: 'All', status: 'All', region: 'All' })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // No default date filter — show all deals on load
  const [showValueForm, setShowValueForm] = useState(false)
  const [vcForm, setVcForm] = useState({ dealId: '', dealTitle: '', organizationName: '', oldValue: '', newValue: '', changeDate: new Date().toISOString().split('T')[0], estimator: '', notes: '' })
  const [dealSearch, setDealSearch] = useState('')
  const [savingVc, setSavingVc] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [dr, vc] = await Promise.all([fetch('/api/deals'), fetch('/api/value-changes')])
      const dd = await dr.json()
      const vd = await vc.json()
      setDeals(dd.deals || [])
      setLastSync(dd.lastSync)
      setValueChanges(vd.changes || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function doSync(refreshFields = false) {
    setSyncing(true)
    try {
      await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshFields }) })
      await loadData()
    } catch(e) { console.error(e) }
    setSyncing(false)
  }

  async function saveValueChange() {
    if (!vcForm.dealTitle || !vcForm.newValue) return
    setSavingVc(true)
    await fetch('/api/value-changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...vcForm, oldValue: parseFloat(vcForm.oldValue) || 0, newValue: parseFloat(vcForm.newValue) }) })
    await loadData()
    setShowValueForm(false)
    setVcForm({ dealId: '', dealTitle: '', organizationName: '', oldValue: '', newValue: '', changeDate: new Date().toISOString().split('T')[0], estimator: '', notes: '' })
    setSavingVc(false)
  }

  async function deleteValueChange(id) {
    if (!confirm('Delete this value change entry?')) return
    await fetch('/api/value-changes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await loadData()
  }

  // Filter helpers
  const filterDealsByDate = (arr, dateField) => {
    if (!dateFrom && !dateTo) return arr
    return arr.filter(d => {
      const v = d[dateField]
      if (!v) return true
      if (dateFrom && v < dateFrom) return false
      if (dateTo && v > dateTo + 'T99') return false
      return true
    })
  }

  const applyFilters = (arr) => arr.filter(d => {
    if (filters.customerType !== 'All' && d.customerType !== filters.customerType) return false
    if (filters.estimator !== 'All' && d.estimator !== filters.estimator) return false
    if (filters.projectStage !== 'All' && d.projectStage !== filters.projectStage) return false
    if (filters.salesPerson !== 'All' && d.salesPerson !== filters.salesPerson) return false
    if (filters.leadSource !== 'All' && d.leadSource !== filters.leadSource) return false
    if (filters.variation !== 'All' && d.variation !== filters.variation) return false
    if (filters.status !== 'All' && d.status !== filters.status.toLowerCase()) return false
    if (filters.region !== 'All' && d.region !== filters.region) return false
    return true
  })

  const uniq = (arr, key) => ['All', ...new Set(arr.map(d => d[key]).filter(Boolean))].sort()

  // Won/Lost deals for strike rate
  const closedDeals = deals.filter(d => d.status === 'won' || d.status === 'lost')
  const dateFilteredClosed = filterDealsByDate(closedDeals, 'closeTime')
  const filteredClosed = applyFilters(dateFilteredClosed)
  const wonDeals = filteredClosed.filter(d => d.status === 'won')
  const lostDeals = filteredClosed.filter(d => d.status === 'lost')
  const strikeRateValue = filteredClosed.length ? wonDeals.reduce((s, d) => s + d.value, 0) / filteredClosed.reduce((s, d) => s + d.value, 0) : null
  const strikeRateCount = filteredClosed.length ? wonDeals.length / filteredClosed.length : null

  // Zero value warning deals
  const zeroValueDeals = deals.filter(d => d.status === 'open' && STAGES_NEEDING_VALUE.includes(d.projectStage) && (!d.value || d.value === 0))

  // Value changes this month
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const vcThisMonth = valueChanges.filter(v => v.changeDate && v.changeDate.startsWith(thisMonth))
  const vcDateFiltered = dateFrom || dateTo ? valueChanges.filter(v => {
    if (dateFrom && v.changeDate < dateFrom) return false
    if (dateTo && v.changeDate > dateTo) return false
    return true
  }) : vcThisMonth

  const totalValueChange = vcDateFiltered.reduce((s, v) => s + (v.valueChange || 0), 0)
  const uniqueDealsWithChanges = new Set(vcDateFiltered.map(v => v.dealId)).size

  const s = { fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 14, color: '#1a1a19' }

  const filterBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, padding: '12px 16px', background: '#f8f8f7', borderRadius: 8, border: '0.5px solid #e1e0d9' }}>
      {[
        { label: 'Customer', key: 'customerType', opts: uniq(deals, 'customerType') },
        { label: 'Estimator', key: 'estimator', opts: uniq(deals, 'estimator') },
        { label: 'Stage', key: 'projectStage', opts: uniq(deals, 'projectStage') },
        { label: 'Status', key: 'status', opts: ['All','won','lost','open'] },
        { label: 'Lead source', key: 'leadSource', opts: uniq(deals, 'leadSource') },
        { label: 'Variation', key: 'variation', opts: uniq(deals, 'variation') },
        { label: 'Region', key: 'region', opts: uniq(deals, 'region') },
      ].map(f => (
        <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{f.label}</label>
          <select value={filters[f.key]} onChange={e => setFilters(p => ({...p, [f.key]: e.target.value}))} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', color: '#1a1a19', fontFamily: 'inherit' }}>
            {f.opts.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>Date from</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>Date to</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button onClick={() => { setFilters({ customerType:'All', estimator:'All', projectStage:'All', salesPerson:'All', leadSource:'All', variation:'All', status:'All', region:'All' }); setDateFrom(''); setDateTo('') }} style={{ fontSize: 12, padding: '4px 10px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
      </div>
    </div>
  )

  const statCard = (label, value, sub) => (
    <div style={{ background: '#f8f8f7', borderRadius: 8, padding: '14px 18px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const table = (cols, rows, rowRenderer) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e1e0d9' }}>
            {cols.map(c => <th key={c} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No data</td></tr> : rows.map(rowRenderer)}
        </tbody>
      </table>
    </div>
  )

  const tdStyle = { padding: '7px 10px', borderBottom: '0.5px solid #f0efec', verticalAlign: 'middle' }

  // Page renderers
  const pages = {
    'Deals Researched': () => {
      const filtered = applyFilters(filterDealsByDate(deals, 'createdDate'))
      const existing = filtered.filter(d => d.customerType === 'Existing').length
      const newC = filtered.filter(d => d.customerType !== 'Existing').length
      return (
        <div>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Total deals', filtered.length)}
            {statCard('Existing customers', existing)}
            {statCard('New customers', newC)}
          </div>
          {table(['Title','Organisation','Sales person','Estimator','Created','Status','Value'],filtered,(d) => (
            <tr key={d.id} style={{ background: d.status === 'won' ? '#f0fdf4' : d.status === 'lost' ? '#fef2f2' : '#fff' }}>
              <td style={tdStyle}>{d.title}</td>
              <td style={tdStyle}>{d.organizationName}</td>
              <td style={tdStyle}>{d.salesPerson}</td>
              <td style={tdStyle}>{d.estimator}</td>
              <td style={tdStyle}>{shortDate(d.createdDate)}</td>
              <td style={tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: STATUS_COLORS[d.status === 'won' ? 'Won' : d.status === 'lost' ? 'Lost' : 'Open'] + '22', color: STATUS_COLORS[d.status === 'won' ? 'Won' : d.status === 'lost' ? 'Lost' : 'Open'] }}>{d.status}</span></td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Tenders Received': () => {
      const filtered = applyFilters(filterDealsByDate(deals, 'receivedDate'))
      const existing = filtered.filter(d => d.customerType === 'Existing').length
      const newC = filtered.filter(d => d.customerType !== 'Existing').length
      return (
        <div>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Tenders received', filtered.length)}
            {statCard('Existing customers', existing)}
            {statCard('New customers', newC)}
          </div>
          {table(['Title','Organisation','Sales person','Estimator','Received','Status','Stage','Value'],filtered,(d) => (
            <tr key={d.id}>
              <td style={tdStyle}>{d.title}</td>
              <td style={tdStyle}>{d.organizationName}</td>
              <td style={tdStyle}>{d.salesPerson}</td>
              <td style={tdStyle}>{d.estimator}</td>
              <td style={tdStyle}>{shortDate(d.receivedDate)}</td>
              <td style={tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: STATUS_COLORS[d.status === 'won' ? 'Won' : d.status === 'lost' ? 'Lost' : 'Open'] + '22', color: STATUS_COLORS[d.status === 'won' ? 'Won' : d.status === 'lost' ? 'Lost' : 'Open'] }}>{d.status}</span></td>
              <td style={tdStyle}>{d.projectStage}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Projects Priced': () => {
      // Merge value change entries with zero-value warning deals
      const warningDeals = zeroValueDeals.map(d => ({ _isWarning: true, dealId: d.id, dealTitle: d.title, organizationName: d.organizationName, estimator: d.estimator, projectStage: d.projectStage, changeDate: null, oldValue: null, newValue: 0, valueChange: 0 }))
      const allRows = [...vcDateFiltered, ...warningDeals]
      const newlyPriced = vcDateFiltered.filter(v => !v.oldValue || v.oldValue === 0).length

      return (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>Date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>Date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={() => setShowValueForm(true)} style={{ fontSize: 13, padding: '6px 14px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>+ Log value change</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Total value change', fmt(totalValueChange), dateFrom || dateTo ? `${dateFrom||'start'} – ${dateTo||'today'}` : 'This month')}
            {statCard('Deals with changes', uniqueDealsWithChanges, 'unique projects')}
            {statCard('Newly priced', newlyPriced, 'first value entry')}
            {zeroValueDeals.length > 0 && (
              <div style={{ background: '#fff7ed', border: '0.5px solid #fed7aa', borderRadius: 8, padding: '14px 18px', minWidth: 140 }}>
                <div style={{ fontSize: 12, color: '#c2410c', marginBottom: 4, fontWeight: 500 }}>⚠ Missing values</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: '#c2410c' }}>{zeroValueDeals.length}</div>
                <div style={{ fontSize: 11, color: '#c2410c', marginTop: 2 }}>deals need a value</div>
              </div>
            )}
          </div>

          {showValueForm && (
            <div style={{ background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 500, marginBottom: 14 }}>Log value change</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                {[
                  { label: 'Deal title *', key: 'dealTitle', type: 'text' },
                  { label: 'Organisation', key: 'organizationName', type: 'text' },
                  { label: 'Old value (£)', key: 'oldValue', type: 'number' },
                  { label: 'New value (£) *', key: 'newValue', type: 'number' },
                  { label: 'Date *', key: 'changeDate', type: 'date' },
                  { label: 'Estimator', key: 'estimator', type: 'text' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>{f.label}</label>
                    {f.key === 'estimator' ? (
                      <select value={vcForm.estimator} onChange={e => setVcForm(p => ({...p, estimator: e.target.value}))} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }}>
                        <option value=''>Select…</option>
                        {uniq(deals, 'estimator').filter(e => e !== 'All').map(e => <option key={e}>{e}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} value={vcForm[f.key]} onChange={e => setVcForm(p => ({...p, [f.key]: e.target.value}))} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '0.5px solid #d0d0cc', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Notes</label>
                <input type="text" value={vcForm.notes} onChange={e => setVcForm(p => ({...p, notes: e.target.value}))} placeholder="Reason for change…" style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '0.5px solid #d0d0cc', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveValueChange} disabled={savingVc} style={{ fontSize: 13, padding: '6px 16px', border: 'none', borderRadius: 6, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{savingVc ? 'Saving…' : 'Save'}</button>
                <button onClick={() => setShowValueForm(false)} style={{ fontSize: 13, padding: '6px 16px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e1e0d9' }}>
                  {['','Title','Organisation','Estimator','Date','Old value','New value','Change','Notes',''].map((c,i) => <th key={i} style={{ textAlign: i > 4 ? 'right' : 'left', padding: '8px 10px', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {allRows.length === 0 ? <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No value changes logged{dateFrom||dateTo?' for this period':' this month'}</td></tr> : allRows.map((v, i) => {
                  const isWarning = v._isWarning
                  const rowBg = isWarning ? '#fff7ed' : '#fff'
                  const rowBorder = isWarning ? '0.5px solid #fed7aa' : '0.5px solid #f0efec'
                  return (
                    <tr key={v.id || `w-${i}`} style={{ background: rowBg, borderBottom: rowBorder }}>
                      <td style={{ ...tdStyle, width: 24 }}>{isWarning ? '⚠️' : ''}</td>
                      <td style={tdStyle}>{v.dealTitle}</td>
                      <td style={tdStyle}>{v.organizationName}</td>
                      <td style={tdStyle}>{v.estimator}</td>
                      <td style={tdStyle}>{v.changeDate ? shortDate(v.changeDate) : <span style={{ color: '#c2410c', fontSize: 11 }}>No date</span>}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{isWarning ? '—' : fmt(v.oldValue)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: isWarning ? '#c2410c' : undefined }}>{isWarning ? <span style={{ fontWeight: 500, color: '#c2410c' }}>£0 — needs value</span> : fmt(v.newValue)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: isWarning ? '#c2410c' : v.valueChange >= 0 ? '#16a34a' : '#e63946', fontWeight: 500 }}>{isWarning ? '—' : fmt(v.valueChange)}</td>
                      <td style={{ ...tdStyle, color: '#888' }}>{isWarning ? `Stage: ${v.projectStage}` : v.notes}</td>
                      <td style={tdStyle}>{!isWarning && <button onClick={() => deleteValueChange(v.id)} style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid #e1e0d9', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#888' }}>×</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )
    },

    'Work Secured': () => {
      const secured = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'won'), 'wonTime'))
      const totalVal = secured.reduce((s,d) => s+d.value, 0)
      const over200 = secured.filter(d => d.over200k).length
      const existing = secured.filter(d => d.customerType === 'Existing').reduce((s,d) => s+d.value, 0)
      return (
        <div>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Total secured', fmt(totalVal))}
            {statCard('No. of deals', secured.length)}
            {statCard('Deals ≥ £200K', over200)}
            {statCard('Existing customer value', fmt(existing))}
          </div>
          {table(['Title','Organisation','Sales person','Estimator','Won date','Stage history','Value'], secured, d => (
            <tr key={d.id}>
              <td style={tdStyle}>{d.title}</td>
              <td style={tdStyle}>{d.organizationName}</td>
              <td style={tdStyle}>{d.salesPerson}</td>
              <td style={tdStyle}>{d.estimator}</td>
              <td style={tdStyle}>{shortDate(d.wonTime)}</td>
              <td style={tdStyle}><span style={{ fontSize: 11, color: '#888' }}>{[d.hasMCSec && 'MC Secured', d.hasMCUnsec && 'MC Unsecured'].filter(Boolean).join(' / ') || '—'}</span></td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Strike Rate': () => {
      const existingWon = wonDeals.filter(d => d.customerType === 'Existing')
      const existingLost = lostDeals.filter(d => d.customerType === 'Existing')
      const newWon = wonDeals.filter(d => d.customerType !== 'Existing')
      const newLost = lostDeals.filter(d => d.customerType !== 'Existing')
      const srExistingVal = (existingWon.length + existingLost.length) ? existingWon.reduce((s,d)=>s+d.value,0) / [...existingWon,...existingLost].reduce((s,d)=>s+d.value,0) : null
      const srNewVal = (newWon.length + newLost.length) ? newWon.reduce((s,d)=>s+d.value,0) / [...newWon,...newLost].reduce((s,d)=>s+d.value,0) : null
      return (
        <div>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Strike rate (value)', strikeRateValue != null ? pct(strikeRateValue) : '—', 'Target: 25%')}
            {statCard('Strike rate (count)', strikeRateCount != null ? pct(strikeRateCount) : '—')}
            {statCard('Won', wonDeals.length)}
            {statCard('Lost', lostDeals.length)}
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid #e1e0d9' }}>{['Customer type','Won (count)','Lost (count)','Strike rate (count)','Won (value)','Lost (value)','Strike rate (value)'].map(c => <th key={c} style={{ padding: '8px 10px', fontWeight: 500, color: '#555', textAlign: 'left' }}>{c}</th>)}</tr></thead>
              <tbody>
                {[
                  { label: 'Existing', won: existingWon, lost: existingLost, srVal: srExistingVal },
                  { label: 'New', won: newWon, lost: newLost, srVal: srNewVal },
                  { label: 'Total', won: wonDeals, lost: lostDeals, srVal: strikeRateValue },
                ].map(row => (
                  <tr key={row.label} style={{ borderBottom: '0.5px solid #f0efec', fontWeight: row.label === 'Total' ? 500 : 400 }}>
                    <td style={tdStyle}>{row.label}</td>
                    <td style={tdStyle}>{row.won.length}</td>
                    <td style={tdStyle}>{row.lost.length}</td>
                    <td style={tdStyle}>{row.won.length + row.lost.length ? pct(row.won.length / (row.won.length + row.lost.length)) : '—'}</td>
                    <td style={tdStyle}>{fmt(row.won.reduce((s,d)=>s+d.value,0))}</td>
                    <td style={tdStyle}>{fmt(row.lost.reduce((s,d)=>s+d.value,0))}</td>
                    <td style={{ ...tdStyle, color: row.srVal >= 0.25 ? '#16a34a' : row.srVal >= 0.15 ? '#ca8a04' : '#e63946', fontWeight: 500 }}>{row.srVal != null ? pct(row.srVal) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table(['Title','Organisation','Estimator','Decision date','Status','Had MC Secured','Value'], filteredClosed, d => (
            <tr key={d.id} style={{ background: d.status === 'won' ? '#f0fdf4' : '#fef2f2' }}>
              <td style={tdStyle}>{d.title}</td>
              <td style={tdStyle}>{d.organizationName}</td>
              <td style={tdStyle}>{d.estimator}</td>
              <td style={tdStyle}>{shortDate(d.closeTime)}</td>
              <td style={tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: (d.status === 'won' ? '#16a34a' : '#e63946') + '22', color: d.status === 'won' ? '#16a34a' : '#e63946' }}>{d.status}</span></td>
              <td style={tdStyle}>{d.hasMCSec || '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Lost Reasons': () => {
      const lost = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'lost'), 'lostTime'))
      const byReason = lost.reduce((acc, d) => { const r = d.lostReason || 'Unknown'; acc[r] = (acc[r] || 0) + 1; return acc }, {})
      return (
        <div>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Total lost', lost.length)}
            {statCard('Lost value', fmt(lost.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            {Object.entries(byReason).sort((a,b) => b[1]-a[1]).map(([r,c]) => (
              <div key={r} style={{ background: '#fef2f2', border: '0.5px solid #fecaca', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
                <div style={{ fontSize: 11, color: '#e63946', marginBottom: 2 }}>{r}</div>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{c}</div>
              </div>
            ))}
          </div>
          {table(['Title','Organisation','Estimator','Lost date','Lost reason','Value'], lost, d => (
            <tr key={d.id}>
              <td style={tdStyle}>{d.title}</td>
              <td style={tdStyle}>{d.organizationName}</td>
              <td style={tdStyle}>{d.estimator}</td>
              <td style={tdStyle}>{shortDate(d.lostTime)}</td>
              <td style={tdStyle}>{d.lostReason || '—'}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Geo Sales Open': () => {
      const open = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'open'), 'createdDate'))
      const byRegion = open.reduce((acc,d) => { const r = d.region||'Unknown'; if(!acc[r]) acc[r]={count:0,value:0}; acc[r].count++; acc[r].value+=d.value; return acc }, {})
      return (
        <div>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Open deals', open.length)}
            {statCard('Open pipeline value', fmt(open.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ overflowX:'auto', marginBottom: 20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ borderBottom:'1px solid #e1e0d9' }}>{['Region','Deals','Total value'].map(c=><th key={c} style={{ padding:'8px 10px', fontWeight:500, color:'#555', textAlign:'left' }}>{c}</th>)}</tr></thead>
              <tbody>{Object.entries(byRegion).sort((a,b)=>b[1].value-a[1].value).map(([r,v])=>(
                <tr key={r} style={{ borderBottom:'0.5px solid #f0efec' }}>
                  <td style={tdStyle}>{r}</td><td style={tdStyle}>{v.count}</td><td style={tdStyle}>{fmt(v.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {table(['Title','Organisation','Region','Estimator','Created','Stage','Value'], open, d=>(
            <tr key={d.id}>
              <td style={tdStyle}>{d.title}</td><td style={tdStyle}>{d.organizationName}</td><td style={tdStyle}>{d.region||'—'}</td><td style={tdStyle}>{d.estimator}</td><td style={tdStyle}>{shortDate(d.createdDate)}</td><td style={tdStyle}>{d.projectStage}</td><td style={{...tdStyle,textAlign:'right'}}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Geo Sales Won': () => {
      const won = applyFilters(filterDealsByDate(deals.filter(d=>d.status==='won'), 'wonTime'))
      const byRegion = won.reduce((acc,d)=>{ const r=d.region||'Unknown'; if(!acc[r]) acc[r]={count:0,value:0}; acc[r].count++; acc[r].value+=d.value; return acc },{})
      return (
        <div>
          {filterBar}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
            {statCard('Won deals', won.length)}
            {statCard('Won value', fmt(won.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ overflowX:'auto', marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ borderBottom:'1px solid #e1e0d9' }}>{['Region','Deals','Total value'].map(c=><th key={c} style={{ padding:'8px 10px', fontWeight:500, color:'#555', textAlign:'left' }}>{c}</th>)}</tr></thead>
              <tbody>{Object.entries(byRegion).sort((a,b)=>b[1].value-a[1].value).map(([r,v])=>(
                <tr key={r} style={{ borderBottom:'0.5px solid #f0efec' }}>
                  <td style={tdStyle}>{r}</td><td style={tdStyle}>{v.count}</td><td style={tdStyle}>{fmt(v.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {table(['Title','Organisation','Region','Estimator','Won date','Value'], won, d=>(
            <tr key={d.id}>
              <td style={tdStyle}>{d.title}</td><td style={tdStyle}>{d.organizationName}</td><td style={tdStyle}>{d.region||'—'}</td><td style={tdStyle}>{d.estimator}</td><td style={tdStyle}>{shortDate(d.wonTime)}</td><td style={{...tdStyle,textAlign:'right',fontWeight:500}}>{fmt(d.value)}</td>
            </tr>
          ))}
        </div>
      )
    },

    'Customer Details': () => {
      const filtered = applyFilters(filterDealsByDate(deals, 'closeTime'))
      const byOrg = filtered.reduce((acc,d)=>{ const o=d.organizationName||'Unknown'; if(!acc[o]) acc[o]={count:0,wonValue:0,deals:[]}; acc[o].count++; if(d.status==='won') acc[o].wonValue+=d.value; acc[o].deals.push(d); return acc },{})
      return (
        <div>
          {filterBar}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
            {statCard('Organisations', Object.keys(byOrg).length)}
            {statCard('Total won value', fmt(Object.values(byOrg).reduce((s,o)=>s+o.wonValue,0)))}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ borderBottom:'1px solid #e1e0d9' }}>{['Organisation','Deals','Won value','Variation'].map(c=><th key={c} style={{ padding:'8px 10px', fontWeight:500, color:'#555', textAlign:'left' }}>{c}</th>)}</tr></thead>
              <tbody>{Object.entries(byOrg).sort((a,b)=>b[1].wonValue-a[1].wonValue).map(([org,data])=>(
                <tr key={org} style={{ borderBottom:'0.5px solid #f0efec' }}>
                  <td style={tdStyle}>{org}</td>
                  <td style={tdStyle}>{data.count}</td>
                  <td style={tdStyle}>{fmt(data.wonValue)}</td>
                  <td style={tdStyle}>{data.deals.find(d=>d.variation) ? data.deals.find(d=>d.variation).variation : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )
    },
  }

  return (
    <>
      <Head><title>Rock Roofing — Sales Dashboard</title></Head>
      <div style={{ ...s, minHeight: '100vh', background: '#fafaf9' }}>
        {/* Header */}
        <div style={{ background: '#1a1a19', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 24, height: 52 }}>
          <span style={{ color: '#fff', fontWeight: 500, fontSize: 15 }}>Rock Roofing</span>
          <span style={{ color: '#666', fontSize: 13 }}>Sales Dashboard</span>
          <div style={{ flex: 1 }} />
          {lastSync && <span style={{ color: '#666', fontSize: 12 }}>Last sync: {shortDate(lastSync)}</span>}
          <button onClick={() => doSync(false)} disabled={syncing} style={{ fontSize: 12, padding: '5px 12px', border: '0.5px solid #444', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer', fontFamily: 'inherit' }}>{syncing ? 'Syncing…' : 'Sync now'}</button>
          <button onClick={() => doSync(true)} disabled={syncing} style={{ fontSize: 12, padding: '5px 12px', border: '0.5px solid #444', borderRadius: 6, background: 'transparent', color: '#888', cursor: 'pointer', fontFamily: 'inherit' }}>Refresh fields</button>
        </div>

        {/* Nav */}
        <div style={{ borderBottom: '0.5px solid #e1e0d9', background: '#fff', padding: '0 24px', overflowX: 'auto', display: 'flex', gap: 0 }}>
          {NAV.map(n => (
            <button key={n} onClick={() => setPage(n)} style={{ padding: '12px 16px', border: 'none', borderBottom: page === n ? '2px solid #1a1a19' : '2px solid transparent', background: 'transparent', fontSize: 13, fontWeight: page === n ? 500 : 400, color: page === n ? '#1a1a19' : '#888', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{n}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
              {deals.length === 0 ? (
                <div>
                  <p style={{ marginBottom: 12 }}>No data yet. Run your first sync to pull from Pipedrive.</p>
                  <button onClick={() => doSync(true)} disabled={syncing} style={{ fontSize: 13, padding: '8px 20px', border: 'none', borderRadius: 6, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{syncing ? 'Syncing…' : 'Run first sync'}</button>
                </div>
              ) : 'Loading…'}
            </div>
          ) : (
            pages[page]?.() || <div style={{ color: '#888' }}>Page not found</div>
          )}
        </div>
      </div>
    </>
  )
}
