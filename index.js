let store = {}

async function getRedis() {
  try {
    const { Redis } = await import('@upstash/redis')
    const url = process.env.kv_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.kv_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) return null
    return new Redis({ url, token })
  } catch {
    return null
  }
}

export async function get(key) {
  const redis = await getRedis()
  if (redis) return await redis.get(key)
  return store[key] || null
}

export async function set(key, value) {
  const redis = await getRedis()
  if (redis) await redis.set(key, value)
  else store[key] = value
}

export async function keys(pattern) {
  const redis = await getRedis()
  if (redis) return await redis.keys(pattern)
  return Object.keys(store).filter(k => {
    const p = pattern.replace('*', '')
    return k.startsWith(p)
  })
}

export async function getCachedDeals() {
  return await get('pipedrive:deals')
}

export async function saveCachedDeals(deals) {
  await set('pipedrive:deals', deals)
}

export async function getLastSync() {
  return await get('pipedrive:last_sync')
}

export async function saveLastSync(ts) {
  await set('pipedrive:last_sync', ts)
}

export async function getFieldMap() {
  return await get('pipedrive:field_map')
}

export async function saveFieldMap(map) {
  await set('pipedrive:field_map', map)
}

export async function getValueChanges() {
  return await get('value_changes:all') || []
}

export async function saveValueChanges(changes) {
  await set('value_changes:all', changes)
}

export async function getScorecardEntries() {
  return await get('scorecard:entries') || []
}

export async function saveScorecardEntries(entries) {
  await set('scorecard:entries', entries)
}
