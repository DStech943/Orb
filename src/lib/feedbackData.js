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
  if (!brandId) return { items: [], scope: 'sessions' }
  if (isAdmin) {
    try {
      const result = await listBrandAgentFeedback(brandId)
      return { items: Array.isArray(result?.feedback) ? result.feedback : [], scope: 'brand' }
    } catch {
      // If the brand-wide endpoint is unreachable, avoid spamming per-session requests
      return { items: [], scope: 'offline' }
    }
  }
  const sessions = listTestSessions(brandId).slice(0, 5)
  try {
    const settled = await Promise.allSettled(sessions.map((session) => listBrandAgentFeedback(brandId, session.id)))
    const items = settled.flatMap((entry) => (entry.status === 'fulfilled' && Array.isArray(entry.value?.feedback) ? entry.value.feedback : []))
    items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return { items, scope: 'sessions' }
  } catch {
    return { items: [], scope: 'sessions' }
  }
}
