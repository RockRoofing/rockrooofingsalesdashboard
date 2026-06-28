import { getCachedDeals, getLastSync } from '../../lib/db'

export default async function handler(req, res) {
  const deals = await getCachedDeals() || []
  const lastSync = await getLastSync()
  return res.status(200).json({ deals, lastSync })
}
