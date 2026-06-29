import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
const pct = (n) => n == null ? '—' : (n * 100).toFixed(1) + '%'
const shortDate = (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const monthKey = (s) => s ? s.substring(0, 7) : null
const monthLabel = (s) => s ? new Date(s + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : ''

const TRACKED_STAGES = ['MC Unsecured', 'MC Secured', 'Negotiating', 'Variations']
const NAV = ['Deals Researched','Tenders Received','Projects Priced','Work Secured','Strike Rate','Lost Reasons','Geo Sales Open','Geo Sales Won','Customer Details']
const STATUS_COLORS = { won: '#16a34a', lost: '#e63946', open: '#2a78d6' }

// Get last full calendar month date range
function getLastMonthRange() {
  const now = new Date()
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastOfLastMonth = new Date(firstOfThisMonth - 1)
  return {
    from: firstOfLastMonth.toISOString().split('T')[0],
    to: lastOfLastMonth.toISOString().split('T')[0]
  }
}

// Get last 12 months keys including current month
function getLast12Months() {
  const months = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(d.toISOString().substring(0, 7))
  }
  // Ensure current month is included
  const currentMonth = now.toISOString().substring(0, 7)
  if (!months.includes(currentMonth)) {
    months.push(currentMonth)
  }
  return months
}

// Linear trendline calculation
function calcTrendline(data, key) {
  const pts = data.map((d, i) => ({ x: i, y: d[key] || 0 })).filter(p => p.y > 0)
  if (pts.length < 2) return data.map(() => null)
  const n = pts.length
  const sumX = pts.reduce((s, p) => s + p.x, 0)
  const sumY = pts.reduce((s, p) => s + p.y, 0)
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return data.map((_, i) => Math.max(0, slope * i + intercept))
}

export default function Dashboard() {
  const lastMonth = getLastMonthRange()
  const [page, setPage] = useState('Deals Researched')
  const [deals, setDeals] = useState([])
  const [valueChanges, setValueChanges] = useState([])
  const [lastSync, setLastSync] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filters, setFilters] = useState({ customerType: 'All', estimator: 'All', projectStage: 'All', salesPerson: 'All', leadSource: 'All', variation: 'All', status: 'All', region: 'All' })
  const _now = new Date()
  const _twelveMonthsAgo = new Date(_now.getFullYear()-1, _now.getMonth(), _now.getDate())
  const _today = _now.toISOString().split('T')[0]
  const _yearAgo = _twelveMonthsAgo.toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(_yearAgo)
  const [dateTo, setDateTo] = useState(_today)
  const [showValueForm, setShowValueForm] = useState(false)
  const [vcForm, setVcForm] = useState({ dealId: '', dealTitle: '', organizationName: '', oldValue: '', newValue: '', changeDate: new Date().toISOString().split('T')[0], estimator: '', notes: '' })
  const [savingVc, setSavingVc] = useState(false)
  const [drCustName, setDrCustName] = useState('All')
  const [drSalesPerson, setDrSalesPerson] = useState('All')

  // Persist page in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('page')
    if (p && NAV.includes(p)) setPage(p)
  }, [])

  const navigateTo = (p) => {
    setPage(p)
    const url = new URL(window.location)
    url.searchParams.set('page', p)
    window.history.pushState({}, '', url)
  }

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

  async function doSync() {
    setSyncing(true)
    try {
      await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
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
    if (!confirm('Delete this entry?')) return
    await fetch('/api/value-changes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await loadData()
  }

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
    if (filters.status !== 'All' && d.status !== filters.status) return false
    if (filters.region !== 'All' && d.region !== filters.region) return false
    return true
  })

  const uniq = (arr, key) => ['All', ...new Set(arr.map(d => d[key]).filter(Boolean).flatMap(v => v.includes(',') ? v.split(',').map(s => s.trim()) : [v]))].sort()

  // Styles
  const s = { fontFamily: 'system-ui,-apple-system,sans-serif', fontSize: 14, color: '#1a1a19' }
  const tdS = { padding: '7px 10px', borderBottom: '0.5px solid #f0efec', verticalAlign: 'middle', fontSize: 13 }
  const thS = { padding: '8px 10px', fontWeight: 500, color: '#555', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #e1e0d9', fontSize: 13 }

  const filterBar = (
    <div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8f8f7', borderRadius: 8, border: '0.5px solid #e1e0d9' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {[
          { label: 'Customer type', key: 'customerType', opts: uniq(deals, 'customerType') },
          { label: 'Estimator', key: 'estimator', opts: uniq(deals, 'estimator') },
          { label: 'Stage', key: 'projectStage', opts: uniq(deals, 'projectStage') },
          { label: 'Status', key: 'status', opts: ['All','won','lost','open'] },
          { label: 'Lead source', key: 'leadSource', opts: uniq(deals, 'leadSource') },
          { label: 'Region', key: 'region', opts: uniq(deals, 'region') },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>{f.label}</label>
            <select value={filters[f.key]} onChange={e => setFilters(p => ({...p, [f.key]: e.target.value}))} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', fontFamily: 'inherit' }}>
              {f.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>Customer name</label>
          <select value={drCustName} onChange={e => setDrCustName(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', fontFamily: 'inherit', maxWidth: 160 }}>
            {['All', ...new Set(deals.map(d => d.organizationName).filter(Boolean))].sort().map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>Sales person</label>
          <select value={drSalesPerson} onChange={e => setDrSalesPerson(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', fontFamily: 'inherit' }}>
            {['All', ...new Set(deals.map(d => d.salesPerson).filter(Boolean))].sort().map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
        </div>
        <button onClick={() => { setFilters({ customerType:'All', estimator:'All', projectStage:'All', salesPerson:'All', leadSource:'All', variation:'All', status:'All', region:'All' }); const _r = new Date(); const _rf = new Date(_r.getFullYear()-1, _r.getMonth(), _r.getDate()); setDateFrom(_rf.toISOString().split('T')[0]); setDateTo(_r.toISOString().split('T')[0]); setDrCustName('All'); setDrSalesPerson('All') }} style={{ fontSize: 12, padding: '4px 10px', border: '0.5px solid #d0d0cc', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
      </div>
    </div>
  )

  const statCard = (label, value, sub, color) => (
    <div style={{ background: '#f8f8f7', borderRadius: 8, padding: '14px 18px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: color || '#1a1a19' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const dealTable = (cols, rows) => (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No data</td></tr>
            : rows.map((d, i) => (
              <tr key={d.id || i} style={{ background: d.status === 'won' ? '#f0fdf4' : d.status === 'lost' ? '#fef2f2' : '#fff' }}>
                <td style={tdS}>{d.title}</td>
                <td style={tdS}>{d.organizationName}</td>
                <td style={tdS}>{d.salesPerson}</td>
                <td style={tdS}>{d.estimator || '—'}</td>
                <td style={tdS}>{shortDate(d.createdDate)}</td>
                <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: (STATUS_COLORS[d.status] || '#888') + '22', color: STATUS_COLORS[d.status] || '#888' }}>{d.status}</span></td>
                <td style={{ ...tdS, textAlign: 'right' }}>{fmt(d.value)}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  )

  // Pivot table by month
  const pivotByMonth = (arr, valueKey, groupKey, months) => {
    const groups = [...new Set(arr.map(d => d[groupKey] || 'Unknown'))].sort()
    return groups.map(g => {
      const row = { group: g }
      let total = 0
      months.forEach(m => {
        const v = arr.filter(d => (d[groupKey] || 'Unknown') === g && monthKey(d.date || d.createdDate || d.wonTime || d.closeTime) === m).reduce((s, d) => s + (valueKey === 'count' ? 1 : (d.value || 0)), 0)
        row[m] = v
        total += v
      })
      row.total = total
      return row
    })
  }

  const trendChart = (data, valueKey, color = '#2a78d6') => {
    const trendData = data.map((d, i) => ({ ...d, trend: calcTrendline(data, valueKey)[i] }))
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0efec" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888' }} />
          <YAxis tick={{ fontSize: 11, fill: '#888' }} tickFormatter={v => valueKey === 'count' ? v : '£' + (v/1000).toFixed(0) + 'K'} />
          <Tooltip formatter={(v, n) => [n === 'trend' ? null : valueKey === 'count' ? v : fmt(v), n === 'trend' ? 'Trend' : 'Value']} />
          <Line type="monotone" dataKey={valueKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="trend" stroke={color} strokeWidth={1} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const last12 = getLast12Months()

  // ---- PAGE RENDERERS ----

  const pages = {

    'Deals Researched': () => {
      // Only deals that have ever been in 1st Contact, filtered by firstContactDate
      const base = deals.filter(d => d.everIn1stContact)
      
      const filtered = applyFilters(base.filter(d => {
        if (!d.firstContactDate) return false
        if (dateFrom && d.firstContactDate < dateFrom) return false
        if (dateTo && d.firstContactDate > dateTo) return false
        if (drCustName !== 'All' && d.organizationName !== drCustName) return false
        if (drSalesPerson !== 'All' && d.salesPerson !== drSalesPerson) return false
        return true
      }))

      const existing = filtered.filter(d => d.customerType === 'Existing').length
      const prospects = filtered.filter(d => d.customerType !== 'Existing').length

      // Build months from the date filter range directly
      function getMonthsBetween(fromStr, toStr) {
        const months = []
        // fromStr and toStr are already YYYY-MM format
        const [fy, fm] = fromStr.split('-').map(Number)
        const [ty, tm] = toStr.split('-').map(Number)
        let y = fy, m = fm
        while (y < ty || (y === ty && m <= tm)) {
          months.push(`${y}-${String(m).padStart(2,'0')}`)
          m++
          if (m > 12) { m = 1; y++ }
        }
        return months
      }
      const displayMonths = dateFrom && dateTo 
        ? getMonthsBetween(dateFrom.substring(0,7), dateTo.substring(0,7))
        : last12

      const monthData = displayMonths.map(m => ({
        month: monthLabel(m),
        count: filtered.filter(d => monthKey(d.firstContactDate) === m).length
      }))

      const pivotRows = [
        { group: 'Existing', ...Object.fromEntries(displayMonths.map(m => [m, filtered.filter(d => d.customerType === 'Existing' && monthKey(d.firstContactDate) === m).length])), total: existing },
        { group: 'Prospect', ...Object.fromEntries(displayMonths.map(m => [m, filtered.filter(d => d.customerType !== 'Existing' && monthKey(d.firstContactDate) === m).length])), total: prospects },
        { group: 'Total', ...Object.fromEntries(displayMonths.map(m => [m, filtered.filter(d => monthKey(d.firstContactDate) === m).length])), total: filtered.length },
      ]

      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows deals by the date they first entered 1st Contact stage. Captured via webhook from 29 Jun 2026 — historical data prior to this date is not available. Variations are excluded.</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Total deals', filtered.length)}
            {statCard('Existing customers', existing)}
            {statCard('Prospects', prospects)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary</div>
              <div style={{ minWidth: 600 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: '1px solid #e1e0d9', position: 'sticky', top: 0, background: '#fff' }}>
                    <th style={thS}>Customer type</th>
                    {displayMonths.map(m => <th key={m} style={{ ...thS, textAlign: 'right' }}>{monthLabel(m)}</th>)}
                    <th style={{ ...thS, textAlign: 'right' }}>Total</th>
                  </tr></thead>
                  <tbody>{pivotRows.map(r => (
                    <tr key={r.group} style={{ borderBottom: '0.5px solid #f0efec', fontWeight: r.group === 'Total' ? 600 : 400 }}>
                      <td style={tdS}>{r.group}</td>
                      {displayMonths.map(m => <td key={m} style={{ ...tdS, textAlign: 'right' }}>{r[m] || '—'}</td>)}
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{r.total}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Trend</div>
              {trendChart(monthData, 'count')}
            </div>
          </div>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Title','Organisation','Sales person','Estimator','1st Contact date','Customer type','Status','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
              <tbody>{filtered.map((d,i) => (
                <tr key={d.id || i} style={{ background: d.status === 'won' ? '#f0fdf4' : d.status === 'lost' ? '#fef2f2' : '#fff' }}>
                  <td style={tdS}>{d.title}</td>
                  <td style={tdS}>{d.organizationName}</td>
                  <td style={tdS}>{d.salesPerson}</td>
                  <td style={tdS}>{d.estimator || '—'}</td>
                  <td style={tdS}>{d.firstContactDate ? <span>{d.firstContactDate}{d.firstContactApproximate ? <span title="Approximate — based on created date" style={{color:'#aaa',fontSize:10,marginLeft:4}}>~</span> : ''}</span> : '—'}</td>
                  <td style={tdS}>{d.customerType || '—'}</td>
                  <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: (STATUS_COLORS[d.status] || '#888') + '22', color: STATUS_COLORS[d.status] || '#888' }}>{d.status}</span></td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{fmt(d.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )
    },

    'Tenders Received': () => {
      const filtered = applyFilters(filterDealsByDate(deals, 'receivedDate'))
      const existing = filtered.filter(d => d.customerType === 'Existing').length
      const newC = filtered.filter(d => d.customerType !== 'Existing').length
      const monthData = last12.map(m => ({
        month: monthLabel(m),
        count: filtered.filter(d => monthKey(d.receivedDate) === m).length
      }))
      const pivotRows = [
        { group: 'Existing', ...Object.fromEntries(last12.map(m => [m, filtered.filter(d => d.customerType === 'Existing' && monthKey(d.receivedDate) === m).length])), total: existing },
        { group: 'New', ...Object.fromEntries(last12.map(m => [m, filtered.filter(d => d.customerType !== 'Existing' && monthKey(d.receivedDate) === m).length])), total: newC },
        { group: 'Total', ...Object.fromEntries(last12.map(m => [m, filtered.filter(d => monthKey(d.receivedDate) === m).length])), total: filtered.length },
      ]
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows tenders received by date entered in the Received stage</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Tenders received', filtered.length)}
            {statCard('Existing customers', existing)}
            {statCard('New customers', newC)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: '1px solid #e1e0d9' }}>
                    <th style={thS}>Customer type</th>
                    {last12.map(m => <th key={m} style={{ ...thS, textAlign: 'right' }}>{monthLabel(m)}</th>)}
                    <th style={{ ...thS, textAlign: 'right' }}>Total</th>
                  </tr></thead>
                  <tbody>{pivotRows.map(r => (
                    <tr key={r.group} style={{ borderBottom: '0.5px solid #f0efec', fontWeight: r.group === 'Total' ? 600 : 400 }}>
                      <td style={tdS}>{r.group}</td>
                      {last12.map(m => <td key={m} style={{ ...tdS, textAlign: 'right' }}>{r[m] || '—'}</td>)}
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{r.total}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Trend</div>
              {trendChart(monthData, 'count')}
            </div>
          </div>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Title','Organisation','Sales person','Estimator','Received','Status','Stage','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
              <tbody>{filtered.map(d => (
                <tr key={d.id} style={{ background: d.status === 'won' ? '#f0fdf4' : d.status === 'lost' ? '#fef2f2' : '#fff' }}>
                  <td style={tdS}>{d.title}</td>
                  <td style={tdS}>{d.organizationName}</td>
                  <td style={tdS}>{d.salesPerson}</td>
                  <td style={tdS}>{d.estimator || '—'}</td>
                  <td style={tdS}>{shortDate(d.receivedDate)}</td>
                  <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: (STATUS_COLORS[d.status] || '#888') + '22', color: STATUS_COLORS[d.status] || '#888' }}>{d.status}</span></td>
                  <td style={tdS}>{d.projectStage}</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{fmt(d.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )
    },

    'Projects Priced': () => {
      const vcFiltered = valueChanges.filter(v => {
        if (!v.changeDate) return false
        if (dateFrom && v.changeDate < dateFrom) return false
        if (dateTo && v.changeDate > dateTo) return false
        return true
      })
      const zeroValueDeals = deals.filter(d => d.status === 'open' && TRACKED_STAGES.includes(d.projectStage) && (!d.value || d.value === 0))
      const totalValueChange = vcFiltered.reduce((s, v) => s + (v.valueChange || 0), 0)
      const uniqueDealsWithChanges = new Set(vcFiltered.map(v => v.dealId)).size
      const newlyPriced = vcFiltered.filter(v => !v.oldValue || v.oldValue === 0).length

      const monthData = last12.map(m => ({
        month: monthLabel(m),
        value: vcFiltered.filter(v => v.changeDate?.startsWith(m)).reduce((s, v) => s + (v.valueChange || 0), 0)
      }))

      const existingMonthData = last12.map(m => ({
        month: monthLabel(m),
        Customer: vcFiltered.filter(v => v.changeDate?.startsWith(m) && deals.find(d => String(d.id) === v.dealId)?.customerType === 'Existing').reduce((s, v) => s + (v.valueChange || 0), 0),
        Prospect: vcFiltered.filter(v => v.changeDate?.startsWith(m) && deals.find(d => String(d.id) === v.dealId)?.customerType !== 'Existing').reduce((s, v) => s + (v.valueChange || 0), 0),
      }))

      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows value changes to priced deals by date of change</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 2 }}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }} />
            </div>
            <button onClick={() => setShowValueForm(true)} style={{ fontSize: 13, padding: '6px 14px', border: 'none', borderRadius: 6, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>+ Log value change</button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Net value change', fmt(totalValueChange))}
            {statCard('Deals with changes', uniqueDealsWithChanges, 'unique projects')}
            {statCard('Newly priced', newlyPriced, 'first value entry')}
            {zeroValueDeals.length > 0 && statCard('⚠ Missing values', zeroValueDeals.length, 'need a value', '#c2410c')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary — Net value change</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>
                    <th style={thS}>Type</th>
                    {last12.map(m => <th key={m} style={{ ...thS, textAlign: 'right' }}>{monthLabel(m)}</th>)}
                    <th style={{ ...thS, textAlign: 'right' }}>Total</th>
                  </tr></thead>
                  <tbody>{['Customer','Prospect','Total'].map(type => {
                    const isTotal = type === 'Total'
                    const typeChanges = isTotal ? vcFiltered : vcFiltered.filter(v => {
                      const deal = deals.find(d => String(d.id) === v.dealId)
                      return type === 'Customer' ? deal?.customerType === 'Existing' : deal?.customerType !== 'Existing'
                    })
                    return (
                      <tr key={type} style={{ borderBottom: '0.5px solid #f0efec', fontWeight: isTotal ? 600 : 400 }}>
                        <td style={tdS}>{type}</td>
                        {last12.map(m => {
                          const v = typeChanges.filter(c => c.changeDate?.startsWith(m)).reduce((s, c) => s + (c.valueChange || 0), 0)
                          return <td key={m} style={{ ...tdS, textAlign: 'right', color: v < 0 ? '#e63946' : v > 0 ? '#16a34a' : '#aaa' }}>{v ? fmt(v) : '—'}</td>
                        })}
                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 600, color: typeChanges.reduce((s,c)=>s+(c.valueChange||0),0) < 0 ? '#e63946' : '#16a34a' }}>{fmt(typeChanges.reduce((s,c)=>s+(c.valueChange||0),0))}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Trend — Net value change</div>
              {trendChart(monthData, 'value', '#16a34a')}
            </div>
          </div>

          {showValueForm && (
            <div style={{ background: '#fff', border: '1px solid #e1e0d9', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ fontWeight: 500, marginBottom: 14 }}>Log value change</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                {[{ label: 'Deal title *', key: 'dealTitle', type: 'text' }, { label: 'Organisation', key: 'organizationName', type: 'text' }, { label: 'Old value (£)', key: 'oldValue', type: 'number' }, { label: 'New value (£) *', key: 'newValue', type: 'number' }, { label: 'Date *', key: 'changeDate', type: 'date' }].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>{f.label}</label>
                    <input type={f.type} value={vcForm[f.key]} onChange={e => setVcForm(p => ({...p, [f.key]: e.target.value}))} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '0.5px solid #d0d0cc', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Estimator</label>
                  <select value={vcForm.estimator} onChange={e => setVcForm(p => ({...p, estimator: e.target.value}))} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '0.5px solid #d0d0cc', borderRadius: 6, fontFamily: 'inherit' }}>
                    <option value=''>Select…</option>
                    {uniq(deals, 'estimator').filter(e => e !== 'All').map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
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

          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail — All value changes</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['','Title','Organisation','Estimator','Date','Stage','Old value','New value','Change','Notes',''].map((c,i) => <th key={i} style={{ ...thS, textAlign: i > 5 ? 'right' : 'left' }}>{c}</th>)}</tr></thead>
              <tbody>
                {[...vcFiltered, ...zeroValueDeals.map(d => ({ _isWarning: true, dealId: String(d.id), dealTitle: d.title, organizationName: d.organizationName, estimator: d.estimator, projectStage: d.projectStage, changeDate: null, oldValue: null, newValue: 0, valueChange: 0 }))].map((v, i) => {
                  const isWarning = v._isWarning
                  return (
                    <tr key={v.id || `w${i}`} style={{ background: isWarning ? '#fff7ed' : '#fff', borderBottom: isWarning ? '0.5px solid #fed7aa' : '0.5px solid #f0efec' }}>
                      <td style={{ ...tdS, width: 20 }}>{isWarning ? '⚠️' : ''}</td>
                      <td style={tdS}>{v.dealTitle}</td>
                      <td style={tdS}>{v.organizationName}</td>
                      <td style={tdS}>{v.estimator || '—'}</td>
                      <td style={tdS}>{v.changeDate ? shortDate(v.changeDate) : <span style={{ color: '#c2410c', fontSize: 11 }}>No date</span>}</td>
                      <td style={tdS}>{v.stage || v.projectStage || '—'}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{isWarning ? '—' : fmt(v.oldValue)}</td>
                      <td style={{ ...tdS, textAlign: 'right', color: isWarning ? '#c2410c' : undefined }}>{isWarning ? <span style={{ color: '#c2410c', fontWeight: 500 }}>£0 — needs value</span> : fmt(v.newValue)}</td>
                      <td style={{ ...tdS, textAlign: 'right', color: isWarning ? '#c2410c' : (v.valueChange || 0) >= 0 ? '#16a34a' : '#e63946', fontWeight: 500 }}>{isWarning ? '—' : fmt(v.valueChange)}</td>
                      <td style={{ ...tdS, color: '#888', fontSize: 12 }}>{isWarning ? `Stage: ${v.projectStage}` : v.notes}</td>
                      <td style={tdS}>{!isWarning && v.id && <button onClick={() => deleteValueChange(v.id)} style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid #e1e0d9', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#888' }}>×</button>}</td>
                    </tr>
                  )
                })}
                {vcFiltered.length === 0 && zeroValueDeals.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>No value changes in this period</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )
    },

    'Work Secured': () => {
      const secured = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'won'), 'wonTime'))
      const totalVal = secured.reduce((s,d) => s+d.value, 0)
      const avgVal = secured.length ? totalVal / secured.length : 0
      const over200 = secured.filter(d => d.over200k).length
      const monthData = last12.map(m => ({
        month: monthLabel(m),
        value: secured.filter(d => monthKey(d.wonTime) === m).reduce((s,d) => s+d.value, 0)
      }))
      const pivotRows = ['Existing','New','Total'].map(type => {
        const isTotal = type === 'Total'
        const arr = isTotal ? secured : secured.filter(d => type === 'Existing' ? d.customerType === 'Existing' : d.customerType !== 'Existing')
        return { group: type, ...Object.fromEntries(last12.map(m => [m, arr.filter(d => monthKey(d.wonTime) === m).reduce((s,d)=>s+d.value,0)])), total: arr.reduce((s,d)=>s+d.value,0) }
      })
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows won deals by decision date</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Deals won', secured.length)}
            {statCard('Avg won value', fmt(avgVal))}
            {statCard('Won ≥£200K', over200)}
            {statCard('Total value', fmt(totalVal))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>
                    <th style={thS}>Customer type</th>
                    {last12.map(m => <th key={m} style={{ ...thS, textAlign: 'right' }}>{monthLabel(m)}</th>)}
                    <th style={{ ...thS, textAlign: 'right' }}>Total</th>
                  </tr></thead>
                  <tbody>{pivotRows.map(r => (
                    <tr key={r.group} style={{ borderBottom: '0.5px solid #f0efec', fontWeight: r.group === 'Total' ? 600 : 400 }}>
                      <td style={tdS}>{r.group}</td>
                      {last12.map(m => <td key={m} style={{ ...tdS, textAlign: 'right' }}>{r[m] ? fmt(r[m]) : '—'}</td>)}
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{fmt(r.total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Trend</div>
              {trendChart(monthData, 'value', '#16a34a')}
            </div>
          </div>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Title','Organisation','Sales person','Estimator','Won date','Stage','≥£200K','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
              <tbody>{secured.map(d => (
                <tr key={d.id} style={{ background: '#f0fdf4' }}>
                  <td style={tdS}>{d.title}</td>
                  <td style={tdS}>{d.organizationName}</td>
                  <td style={tdS}>{d.salesPerson}</td>
                  <td style={tdS}>{d.estimator || '—'}</td>
                  <td style={tdS}>{shortDate(d.wonTime)}</td>
                  <td style={tdS}>{d.projectStage || '—'}</td>
                  <td style={tdS}>{d.over200k ? 'Yes' : 'No'}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontWeight: 500 }}>{fmt(d.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )
    },

    'Strike Rate': () => {
      const closed = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'won' || d.status === 'lost'), 'closeTime'))
      const won = closed.filter(d => d.status === 'won')
      const lost = closed.filter(d => d.status === 'lost')
      const srValue = closed.length ? won.reduce((s,d)=>s+d.value,0) / closed.reduce((s,d)=>s+d.value,0) : null
      const srCount = closed.length ? won.length / closed.length : null
      const monthData = last12.map(m => {
        const mClosed = closed.filter(d => monthKey(d.closeTime) === m)
        const mWon = mClosed.filter(d => d.status === 'won')
        return { month: monthLabel(m), count: mClosed.length ? mWon.length / mClosed.length * 100 : 0 }
      })
      const summaryRows = ['Existing','New','Total'].map(type => {
        const isTotal = type === 'Total'
        const arr = isTotal ? closed : closed.filter(d => type === 'Existing' ? d.customerType === 'Existing' : d.customerType !== 'Existing')
        const w = arr.filter(d => d.status === 'won')
        const l = arr.filter(d => d.status === 'lost')
        return { type, wonCount: w.length, lostCount: l.length, srCount: arr.length ? w.length/arr.length : null, wonVal: w.reduce((s,d)=>s+d.value,0), lostVal: l.reduce((s,d)=>s+d.value,0), srVal: arr.reduce((s,d)=>s+d.value,0) ? w.reduce((s,d)=>s+d.value,0)/arr.reduce((s,d)=>s+d.value,0) : null }
      })
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows strike rates for decided deals by decision date</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Strike rate (value)', srValue != null ? pct(srValue) : '—', 'Target: 25%')}
            {statCard('Strike rate (count)', srCount != null ? pct(srCount) : '—')}
            {statCard('Won', won.length)}
            {statCard('Lost', lost.length)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Customer type','Won','Lost','SR (count)','Won value','Lost value','SR (value)'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
                <tbody>{summaryRows.map(r => (
                  <tr key={r.type} style={{ borderBottom: '0.5px solid #f0efec', fontWeight: r.type === 'Total' ? 600 : 400 }}>
                    <td style={tdS}>{r.type}</td>
                    <td style={tdS}>{r.wonCount}</td>
                    <td style={tdS}>{r.lostCount}</td>
                    <td style={{ ...tdS, color: r.srCount >= 0.25 ? '#16a34a' : r.srCount >= 0.15 ? '#ca8a04' : '#e63946', fontWeight: 500 }}>{r.srCount != null ? pct(r.srCount) : '—'}</td>
                    <td style={tdS}>{fmt(r.wonVal)}</td>
                    <td style={tdS}>{fmt(r.lostVal)}</td>
                    <td style={{ ...tdS, color: r.srVal >= 0.25 ? '#16a34a' : r.srVal >= 0.15 ? '#ca8a04' : '#e63946', fontWeight: 500 }}>{r.srVal != null ? pct(r.srVal) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Trend — Strike rate (count %)</div>
              {trendChart(monthData, 'count', '#2a78d6')}
            </div>
          </div>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Title','Organisation','Customer type','Estimator','Decision date','Stage','Status','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
              <tbody>{closed.map(d => (
                <tr key={d.id} style={{ background: d.status === 'won' ? '#f0fdf4' : '#fef2f2' }}>
                  <td style={tdS}>{d.title}</td>
                  <td style={tdS}>{d.organizationName}</td>
                  <td style={tdS}>{d.customerType || '—'}</td>
                  <td style={tdS}>{d.estimator || '—'}</td>
                  <td style={tdS}>{shortDate(d.closeTime)}</td>
                  <td style={tdS}>{d.projectStage || '—'}</td>
                  <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: (STATUS_COLORS[d.status]) + '22', color: STATUS_COLORS[d.status] }}>{d.status}</span></td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{fmt(d.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )
    },

    'Lost Reasons': () => {
      const lost = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'lost'), 'lostTime'))
      const byReason = lost.reduce((acc, d) => {
        const r = d.lostReason || 'No reason given'
        const priced = d.dealPriced === 'Yes' || d.systemPriced ? 'Yes' : 'No'
        if (!acc[r]) acc[r] = { Yes: 0, No: 0, total: 0 }
        acc[r][priced]++
        acc[r].total++
        return acc
      }, {})
      const monthData = last12.map(m => ({ month: monthLabel(m), count: lost.filter(d => monthKey(d.lostTime) === m).length }))
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows lost reasons for projects marked as lost in the time period</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Total lost', lost.length)}
            {statCard('Lost value', fmt(lost.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Lost reason','Priced: No','Priced: Yes','Total'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
                <tbody>{Object.entries(byReason).sort((a,b)=>b[1].total-a[1].total).map(([r,v]) => (
                  <tr key={r} style={{ borderBottom: '0.5px solid #f0efec' }}>
                    <td style={tdS}>{r}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{v.No || '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{v.Yes || '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{v.total}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Trend</div>
              {trendChart(monthData, 'count', '#e63946')}
            </div>
          </div>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Title','Organisation','Estimator','Lost date','Lost reason','System priced','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
              <tbody>{lost.map(d => (
                <tr key={d.id} style={{ background: '#fef2f2' }}>
                  <td style={tdS}>{d.title}</td>
                  <td style={tdS}>{d.organizationName}</td>
                  <td style={tdS}>{d.estimator || '—'}</td>
                  <td style={tdS}>{shortDate(d.lostTime)}</td>
                  <td style={tdS}>{d.lostReason || '—'}</td>
                  <td style={tdS}>{d.systemPriced || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{fmt(d.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )
    },

    'Geo Sales Open': () => {
      const open = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'open'), 'createdDate'))
      const byRegion = open.reduce((acc,d) => { const r=d.region||'Unknown'; if(!acc[r]) acc[r]={count:0,value:0}; acc[r].count++; acc[r].value+=d.value; return acc },{})
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows priced, open deals by region and created date</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Open deals', open.length)}
            {statCard('Pipeline value', fmt(open.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary by region</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Region','Deals','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
                <tbody>{Object.entries(byRegion).sort((a,b)=>b[1].value-a[1].value).map(([r,v]) => (
                  <tr key={r} style={{ borderBottom: '0.5px solid #f0efec' }}>
                    <td style={tdS}>{r}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{v.count}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{fmt(v.value)}</td>
                  </tr>
                ))}<tr style={{ borderTop: '1px solid #e1e0d9', fontWeight: 600 }}>
                  <td style={tdS}>Total</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{open.length}</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{fmt(open.reduce((s,d)=>s+d.value,0))}</td>
                </tr></tbody>
              </table>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Title','Organisation','Sales person','Created','Region','Stage','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
                  <tbody>{open.map(d => (
                    <tr key={d.id}>
                      <td style={tdS}>{d.title}</td>
                      <td style={tdS}>{d.organizationName}</td>
                      <td style={tdS}>{d.salesPerson}</td>
                      <td style={tdS}>{shortDate(d.createdDate)}</td>
                      <td style={tdS}>{d.region || '—'}</td>
                      <td style={tdS}>{d.projectStage || '—'}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{fmt(d.value)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )
    },

    'Geo Sales Won': () => {
      const won = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'won'), 'wonTime'))
      const byRegion = won.reduce((acc,d) => { const r=d.region||'Unknown'; if(!acc[r]) acc[r]={count:0,value:0}; acc[r].count++; acc[r].value+=d.value; return acc },{})
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows won deals by region and decision date</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Won deals', won.length)}
            {statCard('Won value', fmt(won.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Summary by region</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Region','Deals','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
                <tbody>{Object.entries(byRegion).sort((a,b)=>b[1].value-a[1].value).map(([r,v]) => (
                  <tr key={r} style={{ borderBottom: '0.5px solid #f0efec' }}>
                    <td style={tdS}>{r}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{v.count}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{fmt(v.value)}</td>
                  </tr>
                ))}<tr style={{ borderTop: '1px solid #e1e0d9', fontWeight: 600 }}>
                  <td style={tdS}>Total</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{won.length}</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{fmt(won.reduce((s,d)=>s+d.value,0))}</td>
                </tr></tbody>
              </table>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Detail</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Title','Organisation','Sales person','Won date','Region','Value'].map(c => <th key={c} style={thS}>{c}</th>)}</tr></thead>
                  <tbody>{won.map(d => (
                    <tr key={d.id} style={{ background: '#f0fdf4' }}>
                      <td style={tdS}>{d.title}</td>
                      <td style={tdS}>{d.organizationName}</td>
                      <td style={tdS}>{d.salesPerson}</td>
                      <td style={tdS}>{shortDate(d.wonTime)}</td>
                      <td style={tdS}>{d.region || '—'}</td>
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 500 }}>{fmt(d.value)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )
    },

    'Customer Details': () => {
      const filtered = applyFilters(filterDealsByDate(deals.filter(d => d.status === 'won'), 'wonTime'))
      const variations = filtered.filter(d => d.projectStage === 'Variations')
      const originals = filtered.filter(d => d.projectStage !== 'Variations')
      const byOrg = filtered.reduce((acc,d) => {
        const o = d.organizationName || 'Unknown'
        if (!acc[o]) acc[o] = { origCount: 0, origVal: 0, varCount: 0, varVal: 0 }
        if (d.projectStage === 'Variations') { acc[o].varCount++; acc[o].varVal += d.value }
        else { acc[o].origCount++; acc[o].origVal += d.value }
        return acc
      }, {})
      return (
        <div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Shows top customers by value and count of won deals by won date</p>
          {filterBar}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {statCard('Organisations', Object.keys(byOrg).length)}
            {statCard('Original deals won', originals.length)}
            {statCard('Variations won', variations.length)}
            {statCard('Total won value', fmt(filtered.reduce((s,d)=>s+d.value,0)))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thS} rowSpan={2}>Organisation</th>
                  <th style={{ ...thS, textAlign: 'center', borderLeft: '1px solid #e1e0d9' }} colSpan={2}>Original deals</th>
                  <th style={{ ...thS, textAlign: 'center', borderLeft: '1px solid #e1e0d9' }} colSpan={2}>Variations</th>
                  <th style={{ ...thS, textAlign: 'center', borderLeft: '1px solid #e1e0d9' }} colSpan={2}>Total</th>
                </tr>
                <tr>
                  {['Value','Count','Value','Count','Value','Count'].map((c,i) => <th key={i} style={{ ...thS, textAlign: 'right', borderLeft: i % 2 === 0 ? '1px solid #e1e0d9' : 'none' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>{Object.entries(byOrg).sort((a,b) => (b[1].origVal+b[1].varVal)-(a[1].origVal+a[1].varVal)).map(([org,v]) => (
                <tr key={org} style={{ borderBottom: '0.5px solid #f0efec' }}>
                  <td style={tdS}>{org}</td>
                  <td style={{ ...tdS, textAlign: 'right', borderLeft: '1px solid #f0efec' }}>{fmt(v.origVal)}</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{v.origCount}</td>
                  <td style={{ ...tdS, textAlign: 'right', borderLeft: '1px solid #f0efec' }}>{fmt(v.varVal)}</td>
                  <td style={{ ...tdS, textAlign: 'right' }}>{v.varCount}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontWeight: 600, borderLeft: '1px solid #f0efec' }}>{fmt(v.origVal+v.varVal)}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{v.origCount+v.varCount}</td>
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
        <div style={{ background: '#1a1a19', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 24, height: 52 }}>
          <span style={{ color: '#fff', fontWeight: 500, fontSize: 15 }}>Rock Roofing</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: '#2a2a28' }}>Sales Dashboard</span>
          <span style={{ color: '#444' }}>|</span>
          <a href="/scorecard" style={{ color: '#888', fontSize: 13, textDecoration: 'none', padding: '4px 10px', borderRadius: 6 }}>Scorecards</a>
          <div style={{ flex: 1 }} />
          {lastSync && <span style={{ color: '#555', fontSize: 12 }}>Last sync: {shortDate(lastSync)}</span>}
          <button onClick={doSync} disabled={syncing} style={{ fontSize: 12, padding: '5px 12px', border: '0.5px solid #444', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer', fontFamily: 'inherit' }}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
        <div style={{ borderBottom: '0.5px solid #e1e0d9', background: '#fff', padding: '0 24px', overflowX: 'auto', display: 'flex' }}>
          {NAV.map(n => (
            <button key={n} onClick={() => navigateTo(n)} style={{ padding: '12px 16px', border: 'none', borderBottom: page === n ? '2px solid #1a1a19' : '2px solid transparent', background: 'transparent', fontSize: 13, fontWeight: page === n ? 500 : 400, color: page === n ? '#1a1a19' : '#888', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{n}</button>
          ))}
        </div>
        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
              {deals.length === 0 ? (
                <div>
                  <p style={{ marginBottom: 12 }}>No data yet. Run your first sync to pull from Pipedrive.</p>
                  <button onClick={doSync} disabled={syncing} style={{ fontSize: 13, padding: '8px 20px', border: 'none', borderRadius: 6, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{syncing ? 'Syncing…' : 'Run first sync'}</button>
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
