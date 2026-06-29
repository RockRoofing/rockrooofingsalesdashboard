import { get } from '../../lib/db'

export default async function handler(req, res) {
  const payload = await get('webhook:last_payload')
  return res.status(200).json({ payload: payload ? JSON.parse(payload) : null })
}
