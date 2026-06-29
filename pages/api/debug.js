export default async function handler(req, res) {
  const KEY = process.env.PIPEDRIVE_API_KEY || process.env.Pipedrive_API_Key

  try {
    // Check pipelines
    const pRes = await fetch(`https://api.pipedrive.com/v1/pipelines?api_token=${KEY}`)
    const pData = await pRes.json()

    // Check deal count
    const dRes = await fetch(`https://api.pipedrive.com/v1/deals?api_token=${KEY}&limit=5&status=all`)
    const dData = await dRes.json()

    return res.status(200).json({
      pipelines: pData.data?.map(p => ({ id: p.id, name: p.name })),
      sampleDeals: dData.data?.slice(0,3).map(d => ({ id: d.id, title: d.title, pipeline_id: d.pipeline_id })),
      dealCount: dData.additional_data?.pagination?.total_count
    })
  } catch(err) {
    return res.status(500).json({ error: err.message })
  }
}
