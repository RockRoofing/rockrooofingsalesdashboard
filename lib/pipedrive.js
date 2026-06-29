const BASE = 'https://api.pipedrive.com/v1'
const KEY = () => process.env.PIPEDRIVE_API_KEY || process.env.Pipedrive_API_Key

// Fetch all deals from the Project pipeline with pagination
export async function fetchAllDeals(fieldMap = {}) {
  const allDeals = []
  let start = 0
  const limit = 100

  const pipelineId = await getProjectPipelineId()

  while (true) {
    const url = `${BASE}/deals?api_token=${KEY()}&limit=${limit}&start=${start}&status=all`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.success || !data.data) break

    const deals = data.data.filter(d => d.pipeline_id && d.pipeline_id === pipelineId)
    allDeals.push(...deals)

    if (!data.additional_data?.pagination?.more_items_in_collection) break
    start += limit
  }

  return allDeals.map(d => normaliseDeal(d, fieldMap))
}

let _pipelineId = null
export async function getProjectPipelineId() {
  if (_pipelineId) return _pipelineId
  const res = await fetch(`${BASE}/pipelines?api_token=${KEY()}`)
  const data = await res.json()
  const pipeline = data.data?.find(p => p.name.trim() === 'Project')
  _pipelineId = pipeline?.id || null
  return _pipelineId
}

// Auto-discover custom field keys by fetching deal fields
export async function discoverFieldMap() {
  const res = await fetch(`${BASE}/dealFields?api_token=${KEY()}&limit=200`)
  const data = await res.json()
  if (!data.success) return {}

  const map = {}
  const targets = {
    'Estimator Responsible': 'estimator',
    'Project Stage': 'projectStage',
    'Sales Person': 'salesPersonField',
    'Lead Source': 'leadSource',
    'Systems Priced': 'systemPriced',
    'Project Type': 'projectType',
    'Region': 'region',
    'Lost reason': 'lostReason',
    'Lost Reason': 'lostReason',
  }

  for (const field of data.data || []) {
    for (const [name, key] of Object.entries(targets)) {
      if (field.name.toLowerCase() === name.toLowerCase()) {
        map[key] = { key: field.key, options: {} }
        if (field.options) {
          for (const opt of field.options) {
            map[key].options[opt.id] = opt.label
          }
        }
      }
    }
  }

  return map
}

function resolveField(deal, fieldInfo) {
  if (!fieldInfo) return null
  const raw = deal[fieldInfo.key]
  if (raw == null) return null
  if (typeof raw === 'object' && raw.label) return raw.label
  if (Array.isArray(raw)) return raw.map(v => lookupOption(fieldInfo.options, v) || v).join(', ')
  // Handle comma-separated IDs (Pipedrive set fields)
  if (typeof raw === 'string' && raw.includes(',')) {
    return raw.split(',').map(id => lookupOption(fieldInfo.options, id.trim()) || id.trim()).join(', ')
  }
  if (fieldInfo.options) {
    const found = lookupOption(fieldInfo.options, raw)
    if (found != null) return found
  }
  return raw
}

function lookupOption(options, val) {
  if (!options) return null
  // Try as-is, as string, as number
  if (options[val] != null) return options[val]
  if (options[String(val)] != null) return options[String(val)]
  if (options[parseInt(val)] != null) return options[parseInt(val)]
  // Try converting options keys to strings
  const strKey = String(val)
  for (const [k, v] of Object.entries(options)) {
    if (String(k) === strKey) return v
  }
  return null
}

export function normaliseDeal(d, fieldMap) {
  return {
    id: d.id,
    title: d.title,
    value: d.value || 0,
    currency: d.currency,
    status: d.status,
    createdDate: d.add_time,
    closeTime: d.close_time,
    wonTime: d.won_time,
    lostTime: d.lost_time,
    expectedCloseDate: d.expected_close_date,
    organizationName: d.org_name || (typeof d.org_id === 'object' ? d.org_id?.name : '') || '',
    ownerName: d.owner_name || d.user_id?.name || '',
    stageId: d.stage_id,
    stageName: d.stage_name || '',
    pipelineId: d.pipeline_id,
    estimator: resolveField(d, fieldMap.estimator),
    projectStage: resolveField(d, fieldMap.projectStage),
    customerType: resolveField(d, fieldMap.customerType) || resolveField(d, fieldMap.prospectOrCustomer),
    leadSource: resolveField(d, fieldMap.leadSource),
    leadSource2: resolveField(d, fieldMap.leadSource2),
    variation: resolveField(d, fieldMap.variation),
    variationDetail: resolveField(d, fieldMap.variationDetail),
    systemPriced: resolveField(d, fieldMap.systemPriced),
    projectType: resolveField(d, fieldMap.projectType),
    region: resolveField(d, fieldMap.region),
    hasMCSec: resolveField(d, fieldMap.hasMCSec),
    hasMCUnsec: resolveField(d, fieldMap.hasMCUnsec),
    receivedDate: resolveField(d, fieldMap.receivedDate),
    reviewDate: resolveField(d, fieldMap.reviewDate),
    dealPriced: resolveField(d, fieldMap.dealPriced),
    lostReason: resolveField(d, fieldMap.lostReason),
    salesPerson: d.user_id?.name || d.owner_name || '',
    over200k: (d.value || 0) >= 200000,
  }
}
