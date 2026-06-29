import { getValueChanges, saveValueChanges, getCachedDeals, saveCachedDeals } from '../../lib/db'

const TRACKED_STAGES = ['MC Unsecured', 'MC Secured', 'Negotiating', 'Variations']

function generateId(dealId, timestamp, type) {
  return `${type}-${dealId}-${timestamp}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const event = req.body
    const current = event.current
    const previous = event.previous

    if (!current) return res.status(200).json({ ok: true })

    const dealId = String(current.id)
    const dealTitle = current.title || ''
    const organizationName = current.org_name || current.org_id?.name || ''
    const estimator = current.estimator_responsible || ''
    const currentStage = current.stage_name || ''
    const previousStage = previous?.stage_name || ''
    const currentValue = parseFloat(current.value) || 0
    const previousValue = parseFloat(previous?.value) || 0
    const now = new Date().toISOString()
    const changeDate = now.split('T')[0]

    const changes = await getValueChanges()
    const newEntries = []

    // 1. VALUE CHANGE — any deal, any stage
    if (previous && currentValue !== previousValue) {
      const id = generateId(dealId, Date.now(), 'vc')
      // Check not already logged (dedup)
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

    // 2. STAGE CHANGE — track full journey once deal has touched a tracked stage
    if (previous && currentStage !== previousStage) {
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

        // 3. ENTERING A TRACKED STAGE — log opening value or flag warning
        if (TRACKED_STAGES.includes(currentStage) && !TRACKED_STAGES.includes(previousStage)) {
          // Check if we already have this value logged for this deal
          const lastValueEntry = [...changes, ...newEntries]
            .filter(c => c.dealId === dealId && c.type === 'value_change')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]

          const lastLoggedValue = lastValueEntry?.newValue

          if (currentValue === 0 || currentValue == null) {
            // No value — flag as warning (stage_entry with no value)
            const id = generateId(dealId, Date.now() + 2, 'se')
            newEntries.push({
              id,
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
            // Has value and it's different from last logged — log opening entry
            const id = generateId(dealId, Date.now() + 2, 'se')
            newEntries.push({
              id,
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

    // Update cached deal value if changed
    if (previous && currentValue !== previousValue) {
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
