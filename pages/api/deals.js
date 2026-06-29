import { getCachedDeals, getLastSync } from '../../lib/db'

export default async function handler(req, res) {
  const deals = await getCachedDeals() || []
  const lastSync = await getLastSync()

  // Strip heavy unused fields to reduce payload size
  const lightweight = deals.map(d => ({
    id: d.id,
    title: d.title,
    value: d.value,
    status: d.status,
    createdDate: d.createdDate,
    closeTime: d.closeTime,
    wonTime: d.wonTime,
    lostTime: d.lostTime,
    organizationName: d.organizationName,
    salesPerson: d.salesPerson,
    ownerName: d.ownerName,
    estimator: d.estimator,
    projectStage: d.projectStage,
    customerType: d.customerType,
    leadSource: d.leadSource,
    leadSource2: d.leadSource2,
    variation: d.variation,
    systemPriced: d.systemPriced,
    projectType: d.projectType,
    region: d.region,
    hasMCSec: d.hasMCSec,
    hasMCUnsec: d.hasMCUnsec,
    receivedDate: d.receivedDate,
    reviewDate: d.reviewDate,
    dealPriced: d.dealPriced,
    lostReason: d.lostReason,
    stageName: d.stageName,
    over200k: d.over200k,
  }))

  return res.status(200).json({ deals: lightweight, lastSync })
}
