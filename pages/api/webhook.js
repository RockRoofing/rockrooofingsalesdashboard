import { getValueChanges, saveValueChanges, getCachedDeals, saveCachedDeals, set } from '../../lib/db'

const TRACKED_STAGES = ['MC Unsecured', 'MC Secured', 'Negotiating', 'Variations']

function generateId(dealId, timestamp, type) {
  return `${type}-${dealId}-${timestamp}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    // Save raw payload for debugging
    await set('webhook:last_payload', JSON.stringify(req.body))

    const event = req.body

    // Pipedrive sends data in different structures - handle both
    const current = event.current || event.data
    const previous = event.previous || event.meta?.previous

    if (!current) return res.status(200).json({ ok: true, reason: 'no current data' })

    const dealId = String(current.id)
    const dealTitle = current.title || ''
    const organizationName = current.org_name || current.org_id?.name || ''
    const estimator = current.estimator_responsible || ''
    const currentStage = current.stage_name || current.stage_id || ''
    const previousStage = previous?.stage_name || previous?.stage_id || ''
    const currentValue = parseFloat(current.value) || 0
    const previousValue = parseFloat(previous?.value) ?? null
    const now = new Date().toISOString()
    const changeDate = now.split('T')[0]

    const changes = await getValueChanges()
    const newEntries = []

    // 1. VALUE CHANGE — any deal, any stage
    if (previousValue !== null && currentValue !== previousValue) {
      const id = generateId(dealId, Date.now(), 'vc')
      const alreadyLogged = changes.some(c =>
        c.dealId === dealId &&
        c.oldValue === previousValue &&
        c.newValue === currentValue &&
        c.changeDate === changeDate
      )
      if (!alreadyLogged) {
        newEntries.push({
          id,
          type: 'value_change',
          dealId,
          dealTitle,
          organizationName,
          estimator,
          oldValue: previousValue,
          newValue: currentValue,
          valueChange: currentValue - previousValue,
          changeDate,
          stage: currentStage,
          notes: `Value change via Pipedrive`,
          createdAt: now,
          source: 'webhook'
        })
      }
    }

    // 2. STAGE CHANGE
    if (previousStage && currentStage !== previousStage) {
      const hasEverBeenInTrackedStage = changes.some(c => c.dealId === dealId) ||
        TRACKED_STAGES.includes(previousStage) ||
        TRACKED_STAGES.includes(currentStage)

      if (hasEverBeenInTrackedStage) {
        const id = generateId(dealId, Date.now() + 1, 'sc')
        const alreadyLogged = changes.some(c =>
          c.dealId === dealId &&
          c.type === 'stage_change' &&
          c.fromStage === previousStage &&
          c.toStage === currentStage &&
          c.changeDate === changeDate
        )

        if (!alreadyLogged) {
          newEntries.push({
            id,
            type: 'stage_change',
            dealId,
            dealTitle,
            organizationName,
            estimator,
            fromStage: previousStage,
            toStage: currentStage,
            currentValue,
            changeDate,
            stage: currentStage,
            notes: `Stage: ${previousStage} → ${currentStage}`,
            createdAt: now,
            source: 'webhook'
          })
        }

        // 3. ENTERING A TRACKED STAGE
        if (TRACKED_STAGES.includes(currentStage) && !TRACKED_STAGES.includes(previousStage)) {
          const lastValueEntry = changes
            .filter(c => c.dealId === dealId && c.type === 'value_change')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]

          const lastLoggedValue = lastValueEntry?.newValue

          if (!currentValue || currentValue === 0) {
            newEntries.push({
              id: generateId(dealId, Date.now() + 2, 'se'),
              type: 'stage_entry',
              dealId,
              dealTitle,
              organizationName,
              estimator,
              oldValue: null,
              newValue: 0,
              valueChange: 0,
              changeDate,
              stage: currentStage,
              noValue: true,
              notes: `Entered ${currentStage} with no value`,
              createdAt: now,
              source: 'webhook'
            })
          } else if (currentValue !== lastLoggedValue) {
            newEntries.push({
              id: generateId(dealId, Date.now() + 2, 'se'),
              type: 'stage_entry',
              dealId,
              dealTitle,
              organizationName,
              estimator,
              oldValue: lastLoggedValue || 0,
              newValue: currentValue,
              valueChange: currentValue - (lastLoggedValue || 0),
              changeDate,
              stage: currentStage,
              notes: `Entered ${currentStage}`,
              createdAt: now,
              source: 'webhook'
            })
          }
        }
      }
    }

    if (newEntries.length > 0) {
      await saveValueChanges([...changes, ...newEntries])
    }

    // Update cached deal
    if (previousValue !== null && currentValue !== previousValue) {
      const deals = await getCachedDeals() || []
      const updated = deals.map(d =>
        String(d.id) === dealId ? { ...d, value: currentValue, stageName: currentStage } : d
      )
      await saveCachedDeals(updated)
    }

    return res.status(200).json({ ok: true, logged: newEntries.length })
  } catch (err) {
    console.error('Webhook error:', err)
    return res.status(500).json({ error: err.message })
  }
}
