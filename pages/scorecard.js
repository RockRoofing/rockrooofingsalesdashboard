import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
const pct = (n) => n == null ? '—' : (n * 100).toFixed(1) + '%'
const monthLabel = (s) => s ? new Date(s + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : ''
const monthKey = (s) => s ? s.substring(0, 7) : null

function getLast12Months() {
  const months = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(d.toISOString().substring(0, 7))
  }
  return months
}

function getLastMonthKey() {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return d.toISOString().substring(0, 7)
}

function rag(actual, target, lowerIsBetter = false) {
  if (actual == null || target == null) return '#aaa'
  const ratio = actual / target
  if (lowerIsBetter) {
    if (ratio <= 1) return '#16a34a'
    if (ratio <= 1.2) return '#ca8a04'
    return '#e63946'
  }
  if (ratio >= 1) return '#16a34a'
  if (ratio >= 0.75) return '#ca8a04'
  return '#e63946'
}

function ragLabel(actual, target, lowerIsBetter = false) {
  if (actual == null || target == null) return '—'
  const ratio = actual / target
  if (lowerIsBetter) {
    if (ratio <= 1) return '●'
    if (ratio <= 1.2) return '●'
    return '●'
  }
  if (ratio >= 1) return '●'
  if (ratio >= 0.75) return '●'
  return '●'
}

const DEFAULT_TARGETS = {
  estimator: {
    strikeRateOverall: 0.25,
    strikeRateMCSecured: 0.30,
    strikeRateMCUnsecured: 0.05,
    valuePricedExisting: 300000,
    totalValuePriced: 667000,
    totalValueSecured: 133000,
    dealsSecuredOver200k: 1, // per quarter
  },
  sales: {
    gleniganReceived: 6,
    gleniganPriced: 3,
    gleniganScored5: 3,
    websiteReceived: 7,
    websitePriced: 4,
    strikeRateValue: 0.25,
    valuePricedExisting: 800000,
    totalValuePriced: 2000000,
    projectsPricedOver200k: 9, // per quarter
    totalValueSecured: 400000,
    projectsSecuredOver200k: 3, // per quarter
  }
}

export default function Scorecard() {
  const router = useRouter()
  const [person, setPerson] = useState('Roman')
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [targets, setTargets] = useState(null)
  const [editingTarget, setEditingTarget] = useState(null)
  const [editValue, setEditValue] = useState('')

  const ESTIMATORS = ['Roman', 'Niall', 'James']
  const last12 = getLast12Months()
  const lastMonth = getLastMonthKey()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('person')
    if (p) setPerson(p)
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [dr, tr] = await Promise.all([
        fetch('/api/deals'),
        fetch('/api/targets')
      ])
      const dd = await dr.json()
      setDeals(dd.deals || [])
      setLastSync(dd.lastSync)
      const td = await tr.json()
      setTargets(td.targets || DEFAULT_TARGETS)
    } catch(e) {
      console.error(e)
      setTargets(DEFAULT_TARGETS)
    }
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

  async function saveTarget(key, value, type) {
    const newTargets = { ...targets, [type]: { ...targets[type], [key]: parseFloat(value) } }
    setTargets(newTargets)
    await fetch('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: newTargets }) })
    setEditingTarget(null)
  }

  const navigateTo = (p) => {
    setPerson(p)
    const url = new URL(window.location)
    url.searchParams.set('person', p)
    window.history.pushState({}, '', url)
  }

  const shortDate = (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
  const s = { fontFamily: 'system-ui,-apple-system,sans-serif', fontSize: 14, color: '#1a1a19' }
  const tdS = { padding: '7px 10px', borderBottom: '0.5px solid #f0efec', verticalAlign: 'middle', fontSize: 13 }
  const thS = { padding: '8px 10px', fontWeight: 500, color: '#555', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #e1e0d9', fontSize: 13 }

  const isEstimator = ESTIMATORS.includes(person)
  const type = isEstimator ? 'estimator' : 'sales'
  const t = targets?.[type] || DEFAULT_TARGETS[type]

  // Filter deals for this person
  const personDeals = isEstimator
    ? deals.filter(d => d.estimator === person)
    : deals.filter(d => d.salesPerson === person || d.ownerName === person)

  // Rolling 6 months for strike rate
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0]
  const rolling6 = personDeals.filter(d => (d.status === 'won' || d.status === 'lost') && d.closeTime >= sixMonthsAgo)
  const rolling6Won = rolling6.filter(d => d.status === 'won')

  // Compute metrics per month
  function getEstimatorMetrics(m) {
    const monthDeals = personDeals.filter(d => monthKey(d.createdDate) === m)
    const monthClosed = personDeals.filter(d => (d.status === 'won' || d.status === 'lost') && monthKey(d.closeTime) === m)
    const monthWon = monthClosed.filter(d => d.status === 'won')
    const mcSecuredClosed = monthClosed.filter(d => ['MC Secured','Negotiating'].includes(d.projectStage))
    const mcSecuredWon = mcSecuredClosed.filter(d => d.status === 'won')
    const mcUnsecuredClosed = monthClosed.filter(d => d.projectStage === 'MC Unsecured')
    const mcUnsecuredWon = mcUnsecuredClosed.filter(d => d.status === 'won')

    // Value priced = value changes this month from Projects Priced
    const totalPriced = monthDeals.reduce((s,d) => s+d.value, 0)
    const existingPriced = monthDeals.filter(d => d.customerType === 'Existing').reduce((s,d) => s+d.value, 0)
    const totalSecured = monthWon.reduce((s,d) => s+d.value, 0)

    // Quarter check for deals ≥200K
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1).toISOString().split('T')[0]
    const dealsOver200kQtr = personDeals.filter(d => d.status === 'won' && d.over200k && d.wonTime >= qStart).length

    return {
      strikeRateOverall: monthClosed.length ? monthWon.reduce((s,d)=>s+d.value,0) / monthClosed.reduce((s,d)=>s+d.value,0) : null,
      strikeRateMCSecured: mcSecuredClosed.length ? mcSecuredWon.reduce((s,d)=>s+d.value,0) / mcSecuredClosed.reduce((s,d)=>s+d.value,0) : null,
      strikeRateMCUnsecured: mcUnsecuredClosed.length ? mcUnsecuredWon.reduce((s,d)=>s+d.value,0) / mcUnsecuredClosed.reduce((s,d)=>s+d.value,0) : null,
      valuePricedExisting: existingPriced,
      totalValuePriced: totalPriced,
      totalValueSecured: totalSecured,
      dealsSecuredOver200k: dealsOver200kQtr,
    }
  }

  function getSalesMetrics(m) {
    const isLastMonth = m === lastMonth
    const mStart = m + '-01'
    const mEnd = new Date(new Date(mStart).getFullYear(), new Date(mStart).getMonth() + 1, 0).toISOString().split('T')[0]

    const gleniganDeals = deals.filter(d => d.leadSource?.includes('Glenigan'))
    const websiteDeals = deals.filter(d => d.leadSource?.includes('Website'))

    const gleniganReceived = gleniganDeals.filter(d => monthKey(d.receivedDate) === m).length
    const gleniganPriced = gleniganDeals.filter(d => monthKey(d.receivedDate) === m && d.dealPriced === 'Yes').length
    const gleniganScored5 = gleniganDeals.filter(d => monthKey(d.receivedDate) === m && parseInt(d.label) >= 5).length

    const websiteReceived = websiteDeals.filter(d => monthKey(d.receivedDate) === m).length
    const websitePriced = websiteDeals.filter(d => monthKey(d.receivedDate) === m && d.dealPriced === 'Yes').length

    const monthClosed = deals.filter(d => (d.status === 'won' || d.status === 'lost') && monthKey(d.closeTime) === m)
    const monthWon = monthClosed.filter(d => d.status === 'won')
    const strikeRateValue = monthClosed.length ? monthWon.reduce((s,d)=>s+d.value,0) / monthClosed.reduce((s,d)=>s+d.value,0) : null

    const existingPriced = deals.filter(d => d.customerType === 'Existing' && monthKey(d.createdDate) === m).reduce((s,d)=>s+d.value,0)
    const totalPriced = deals.filter(d => monthKey(d.createdDate) === m).reduce((s,d)=>s+d.value,0)
    const totalSecured = monthWon.reduce((s,d)=>s+d.value,0)

    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1).toISOString().split('T')[0]
    const projectsPricedOver200k = deals.filter(d => d.over200k && d.createdDate >= qStart).length
    const projectsSecuredOver200k = deals.filter(d => d.status === 'won' && d.over200k && d.wonTime >= qStart).length

    return { gleniganReceived, gleniganPriced, gleniganScored5, websiteReceived, websitePriced, strikeRateValue, valuePricedExisting: existingPriced, totalValuePriced: totalPriced, projectsPricedOver200k, totalValueSecured: totalSecured, projectsSecuredOver200k }
  }

  const lastMonthMetrics = isEstimator ? getEstimatorMetrics(lastMonth) : getSalesMetrics(lastMonth)
  const allMonthMetrics = last12.map(m => ({ month: m, ...(isEstimator ? getEstimatorMetrics(m) : getSalesMetrics(m)) }))

  const estimatorMetricDefs = [
    { key: 'strikeRateOverall', label: 'Strike rate (overall)', format: pct, targetKey: 'strikeRateOverall', note: 'Rolling 6 months' },
    { key: 'strikeRateMCSecured', label: 'Strike rate (MC Secured/Negotiating)', format: pct, targetKey: 'strikeRateMCSecured' },
    { key: 'strikeRateMCUnsecured', label: 'Strike rate (MC Unsecured)', format: pct, targetKey: 'strikeRateMCUnsecured' },
    { key: 'valuePricedExisting', label: 'Value priced — existing customers', format: fmt, targetKey: 'valuePricedExisting' },
    { key: 'totalValuePriced', label: 'Total value of work priced', format: fmt, targetKey: 'totalValuePriced' },
    { key: 'totalValueSecured', label: 'Total value of work secured', format: fmt, targetKey: 'totalValueSecured' },
    { key: 'dealsSecuredOver200k', label: 'Deals secured ≥£200K', format: v => v, targetKey: 'dealsSecuredOver200k', note: 'Per quarter' },
  ]

  const salesMetricDefs = [
    { key: 'gleniganReceived', label: 'Glenigan enquiries received', format: v => v, targetKey: 'gleniganReceived' },
    { key: 'gleniganPriced', label: 'Glenigan enquiries priced', format: v => v, targetKey: 'gleniganPriced' },
    { key: 'gleniganScored5', label: 'Glenigan scored ≥5 priced', format: v => v, targetKey: 'gleniganScored5' },
    { key: 'websiteReceived', label: 'Website enquiries received', format: v => v, targetKey: 'websiteReceived' },
    { key: 'websitePriced', label: 'Website enquiries priced', format: v => v, targetKey: 'websitePriced' },
    { key: 'strikeRateValue', label: 'Strike rate (value)', format: pct, targetKey: 'strikeRateValue', note: 'Rolling 6 months' },
    { key: 'valuePricedExisting', label: 'Value priced — existing customers', format: fmt, targetKey: 'valuePricedExisting' },
    { key: 'totalValuePriced', label: 'Total value of work priced', format: fmt, targetKey: 'totalValuePriced' },
    { key: 'projectsPricedOver200k', label: 'Projects priced ≥£200K', format: v => v, targetKey: 'projectsPricedOver200k', note: 'Per quarter' },
    { key: 'totalValueSecured', label: 'Total value of work secured', format: fmt, targetKey: 'totalValueSecured' },
    { key: 'projectsSecuredOver200k', label: 'Projects secured ≥£200K', format: v => v, targetKey: 'projectsSecuredOver200k', note: 'Per quarter' },
  ]

  const metricDefs = isEstimator ? estimatorMetricDefs : salesMetricDefs

  const targetDisplay = (key) => {
    const val = t[key]
    if (val == null) return '—'
    if (val < 1 && val > 0) return pct(val)
    if (val >= 1000) return fmt(val)
    return val
  }

  return (
    <>
      <Head><title>Rock Roofing — Scorecards</title></Head>
      <div style={{ ...s, minHeight: '100vh', background: '#fafaf9' }}>
        {/* Header */}
        <div style={{ background: '#1a1a19', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 8, height: 52 }}>
          <a href="/" style={{ color: '#888', fontSize: 13, textDecoration: 'none', padding: '4px 10px', borderRadius: 6 }}>Sales Dashboard</a>
          <span style={{ color: '#444' }}>|</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: '#2a2a28' }}>Scorecards</span>
          <div style={{ flex: 1 }} />
          {lastSync && <span style={{ color: '#555', fontSize: 12 }}>Last sync: {new Date(lastSync).toLocaleDateString('en-GB')}</span>}
          <button onClick={doSync} disabled={syncing} style={{ fontSize: 12, padding: '5px 12px', border: '0.5px solid #444', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer', fontFamily: 'inherit' }}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>

        {/* Person tabs */}
        <div style={{ borderBottom: '0.5px solid #e1e0d9', background: '#fff', padding: '0 24px', display: 'flex' }}>
          {['Roman', 'Niall', 'James', 'Edita'].map(p => (
            <button key={p} onClick={() => navigateTo(p)} style={{ padding: '12px 20px', border: 'none', borderBottom: person === p ? '2px solid #1a1a19' : '2px solid transparent', background: 'transparent', fontSize: 13, fontWeight: person === p ? 500 : 400, color: person === p ? '#1a1a19' : '#888', cursor: 'pointer', fontFamily: 'inherit' }}>{p}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>{isEstimator ? 'Estimator scorecard' : 'Sales scorecard'}</span>
        </div>

        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
          {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Loading…</div> : (
            <>
              {/* KPI Cards — last full calendar month */}
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{person}</span>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>— {monthLabel(lastMonth)} (last full month)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 32 }}>
                {metricDefs.map(m => {
                  const actual = lastMonthMetrics[m.key]
                  const target = t[m.targetKey]
                  const color = rag(actual, target)
                  const isEditing = editingTarget === m.key
                  return (
                    <div key={m.key} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: `2px solid ${color}22`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, lineHeight: 1.3 }}>{m.label}{m.note && <span style={{ color: '#bbb' }}> ({m.note})</span>}</div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: '#1a1a19', marginBottom: 4 }}>{actual != null ? m.format(actual) : '—'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: 80, fontSize: 12, padding: '2px 6px', border: '1px solid #d0d0cc', borderRadius: 4, fontFamily: 'inherit' }} autoFocus onKeyDown={e => { if (e.key === 'Enter') saveTarget(m.key, editValue, type); if (e.key === 'Escape') setEditingTarget(null) }} />
                            <button onClick={() => saveTarget(m.key, editValue, type)} style={{ fontSize: 11, padding: '2px 6px', border: 'none', borderRadius: 4, background: '#1a1a19', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                            <button onClick={() => setEditingTarget(null)} style={{ fontSize: 11, padding: '2px 6px', border: '0.5px solid #d0d0cc', borderRadius: 4, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#aaa', cursor: 'pointer' }} onClick={() => { setEditingTarget(m.key); setEditValue(String(t[m.targetKey] || '')) }}>
                            Target: {targetDisplay(m.targetKey)} <span style={{ fontSize: 10 }}>✎</span>
                          </div>
                        )}
                        <span style={{ color, fontSize: 16 }}>●</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Trend table — last 12 months */}
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 12 }}>Trend — last 12 months</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e1e0d9' }}>
                      <th style={{ ...thS, minWidth: 220 }}>Metric</th>
                      <th style={{ ...thS, minWidth: 80 }}>Target</th>
                      {last12.map(m => <th key={m} style={{ ...thS, textAlign: 'right', minWidth: 80 }}>{monthLabel(m)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {metricDefs.map(md => (
                      <tr key={md.key} style={{ borderBottom: '0.5px solid #f0efec' }}>
                        <td style={tdS}>{md.label}{md.note && <span style={{ fontSize: 11, color: '#bbb' }}> ({md.note})</span>}</td>
                        <td style={{ ...tdS, color: '#888' }}>{targetDisplay(md.targetKey)}</td>
                        {allMonthMetrics.map(mm => {
                          const val = mm[md.key]
                          const color = rag(val, t[md.targetKey])
                          return (
                            <td key={mm.month} style={{ ...tdS, textAlign: 'right', color: val != null ? color : '#ddd', fontWeight: val != null ? 500 : 400 }}>
                              {val != null ? md.format(val) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
