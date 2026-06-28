import { getCachedDeals, getLastSync, saveFieldMap, saveCachedDeals, saveLastSync, getFieldMap } from '../../lib/db'
import { fetchAllDeals, discoverFieldMap } from '../../lib/pipedrive'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    let fieldMap = await getFieldMap()
    if (!fieldMap || req.body?.refreshFields) {
      fieldMap = await discoverFieldMap()
      await saveFieldMap(fieldMap)
    }
    const deals = await fetchAllDeals(fieldMap)
    await saveCachedDeals(deals)
    await saveLastSync(new Date().toISOString())
    return res.status(200).json({ success: true, dealCount: deals.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
