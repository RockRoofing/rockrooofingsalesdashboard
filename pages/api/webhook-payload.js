import { get } from '../../lib/db'

export default async function handler(req, res) {
  const payload = await get('webhook:last_debug')
  return res.status(200).json({ debug: payload ? JSON.parse(payload) : null })
}
