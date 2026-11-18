/**
 * AI performance analytics for the client portal.
 *
 * Every number comes from the API, which reads the live conversation tables for ONE brand.
 * Nothing is simulated, estimated or filled in: when a figure has no real source (customer
 * satisfaction, revenue) the API lists it under
 * `availability` and the pages show "Not available" instead of a value.
 */

import { getBrandAnalytics } from './orbApi'

export const DATE_RANGES = [
  { id: 'today', label: 'Last 24 hours', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
]

export async function getAiPerformanceMetrics(brandId, rangeId = '30d') {
  if (!brandId) throw new Error('Choose a brand to see its analytics.')
  const data = await getBrandAnalytics(brandId, rangeId)
  if (!data) throw new Error('The Orb API is not connected, so analytics are unavailable.')
  return data
}
