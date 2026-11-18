/**
 * AI performance analytics for the client portal.
 *
 * Every number comes from the API, which reads the live conversation tables for ONE brand.
 * Nothing is simulated, estimated or filled in: when a figure has no real source (customer
 * satisfaction, revenue) the API lists it under
 * `availability` and the pages show "Not available" instead of a value.
 */

import { getBrandAnalytics, getBrandSupportKpis } from './orbApi'

// Presets are calendar days in the workspace timezone: "Today" is midnight until now,
// "Yesterday" is the whole previous day, and "Last N days" ends today. A custom range is a
// from and to date, both days included.
export const DATE_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '15d', label: 'Last 15 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
]
export const MAX_CUSTOM_DAYS = 180
export const DEFAULT_RANGE = { id: '30d' }

export async function getAiPerformanceMetrics(brandId, range = DEFAULT_RANGE) {
  if (!brandId) throw new Error('Choose a brand to see its analytics.')
  const data = await getBrandAnalytics(brandId, range)
  if (!data) throw new Error('The Orb API is not connected, so analytics are unavailable.')
  return data
}

export async function getSupportPerformance(brandId, range = DEFAULT_RANGE) {
  if (!brandId) throw new Error('Choose a brand to see its support performance.')
  const data = await getBrandSupportKpis(brandId, range)
  if (!data) throw new Error('The Orb API is not connected, so support performance is unavailable.')
  return data
}
