import { saveCachedDeals, saveLastSync, saveFieldMap } from '../../../lib/db'
import { fetchAllDeals, discoverFieldMap } from '../../../lib/pipedrive'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const isManual = req.query.secret === process.env.SYNC_SECRET
  if (!isVercelCron && !isManual) return res.status(401).json({ error: 'Unauthorized' })

  try {
    // Always refresh field map first so new estimators, regions etc. appear automatically
    const fieldMap = await discoverFieldMap()
    await saveFieldMap(fieldMap)

    const deals = await fetchAllDeals(fieldMap)
    await saveCachedDeals(deals)
    await saveLastSync(new Date().toISOString())

    return res.status(200).json({ success: true, dealCount: deals.length })
  } catch (err) {
    console.error('Pipedrive sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}
