import { set } from '../../lib/db'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  
  // Save the raw payload so we can inspect it
  await set('webhook:last_payload', JSON.stringify(req.body))
  console.log('Webhook payload:', JSON.stringify(req.body, null, 2))
  
  return res.status(200).json({ ok: true, received: true })
}
