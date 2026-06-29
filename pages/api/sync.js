import { saveCachedDeals, saveLastSync, saveFieldMap } from '../../lib/db'
import { fetchAllDeals, discoverFieldMap } from '../../lib/pipedrive'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    // Always refresh fields on every sync
    const fieldMap = await discoverFieldMap()
    await saveFieldMap(fieldMap)

    const deals = await fetchAllDeals(fieldMap)
    await saveCachedDeals(deals)
    await saveLastSync(new Date().toISOString())
    return res.status(200).json({ success: true, dealCount: deals.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
