import { listTestSessions } from './testSessions'
import { listBrandAgentFeedback } from '../services/orbApi'

/**
 * Loads feedback and issue reports for one brand.
 *
 * The brand-wide queue is limited to admins by the API. Everyone else sees the feedback
 * from the test conversations they ran in this browser, fetched session by session.
 * Returns `{ items, scope }` where scope is 'brand' or 'sessions' so the UI can say which.
 */
export async function loadFeedback(brandId, isAdmin) {
  if (isAdmin) {
    try {
      const result = await listBrandAgentFeedback(brandId)
      return { items: Array.isArray(result?.feedback) ? result.feedback : [], scope: 'brand' }
    } catch {
      // Fall through to the per-session view.
    }
  }
  const sessions = listTestSessions(brandId).slice(0, 15)
  const settled = await Promise.allSettled(sessions.map((session) => listBrandAgentFeedback(brandId, session.id)))
  const items = settled.flatMap((entry) => (entry.status === 'fulfilled' && Array.isArray(entry.value?.feedback) ? entry.value.feedback : []))
  items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  return { items, scope: 'sessions' }
}
