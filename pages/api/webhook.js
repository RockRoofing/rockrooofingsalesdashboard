import { getValueChanges, saveValueChanges, getCachedDeals, saveCachedDeals, set } from '../../lib/db'

const TRACKED_STAGES = ['MC Unsecured', 'MC Secured', 'Negotiating', 'Variations']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body = req.body
    const meta = body.meta || {}
    const current = body.current || {}
    const previous = body.previous || {}

    console.log('Webhook data:', JSON.stringify({ entity_id: meta.entity_id, current_value: current.value, previous_value: previous.value, current_stage: current.stage_id, previous_stage: previous.stage_id }))

    const dealId = String(meta.entity_id)
    const now = new Date().toISOString()
    const changeDate = now.split('T')[0]

    // Get cached deal for missing fields
    const deals = await getCachedDeals() || []
    const cachedDeal = deals.find(d => String(d.id) === dealId)

    const dealTitle = current.title || cachedDeal?.title || ''
    const organizationName = current.org_name || cachedDeal?.organizationName || ''
    const estimator = cachedDeal?.estimator || ''
    
    // Resolve stage name — use name if available, fall back to cached deal
    const currentStageId = current.stage_id
    const previousStageId = previous.stage_id
    const currentStage = current.stage_name || cachedDeal?.stageName || cachedDeal?.projectStage || ''
    const previousStage = previous.stage_name || ''

    // Handle value — treat null/undefined as no change
    const currentValue = current.value != null ? parseFloat(current.value) : null
    const previousValue = previous.value != null ? parseFloat(previous.value) : null

    const changes = await getValueChanges()
    const newEntries = []

    // 1. VALUE CHANGE — only if both values exist and are different
    if (currentValue !== null && previousValue !== null && currentValue !== previousValue) {
      const alreadyLogged = changes.some(c =>
        c.dealId === dealId &&
        c.oldValue === previousValue &&
        c.newValue === currentValue &&
        c.changeDate === changeDate
      )
      if (!alreadyLogged) {
        newEntries.push({
          id: `vc-${dealId}-${Date.now()}`,
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
          notes: 'Value change via Pipedrive',
          createdAt: now,
          source: 'webhook'
        })
      }
    }

    // 2. STAGE CHANGE
    if (previousStageId && currentStageId && currentStageId !== previousStageId) {
      const hasEverBeenInTrackedStage = changes.some(c => c.dealId === dealId) ||
        TRACKED_STAGES.includes(previousStage) ||
        TRACKED_STAGES.includes(currentStage)

      if (hasEverBeenInTrackedStage) {
        const alreadyLogged = changes.some(c =>
          c.dealId === dealId &&
          c.type === 'stage_change' &&
          c.fromStage === previousStage &&
          c.toStage === currentStage &&
          c.changeDate === changeDate
        )
        if (!alreadyLogged) {
          newEntries.push({
            id: `sc-${dealId}-${Date.now()}`,
            type: 'stage_change',
            dealId,
            dealTitle,
            organizationName,
            estimator,
            fromStage: previousStage,
            toStage: currentStage,
            currentValue: currentValue || 0,
            changeDate,
            stage: currentStage,
            notes: `Stage: ${previousStage} → ${currentStage}`,
            createdAt: now,
            source: 'webhook'
          })
        }

        // Entering a tracked stage
        if (TRACKED_STAGES.includes(currentStage) && !TRACKED_STAGES.includes(previousStage)) {
          const lastValueEntry = changes
            .filter(c => c.dealId === dealId && c.type === 'value_change')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
          const lastLoggedValue = lastValueEntry?.newValue

          if (!currentValue || currentValue === 0) {
            newEntries.push({
              id: `se-${dealId}-${Date.now() + 1}`,
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
              id: `se-${dealId}-${Date.now() + 1}`,
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
      // Update cached deal value
      if (currentValue !== null) {
        const updated = deals.map(d =>
          String(d.id) === dealId ? { ...d, value: currentValue, stageName: currentStage } : d
        )
        await saveCachedDeals(updated)
      }
    }

    return res.status(200).json({ ok: true, logged: newEntries.length })
  } catch (err) {
    console.error('Webhook error:', err)
    return res.status(500).json({ error: err.message })
  }
}
