// A small, per-brand, per-browser record of the test conversations someone has run.
//
// The agent API keeps conversation history per session id but cannot list sessions, so
// the playground remembers the ids it created. Nothing sensitive is stored: just the id,
// a short title and timestamps. The history itself is always re-fetched from the API,
// which enforces brand access.

const KEY = (brandId) => `orb:test-sessions:${brandId}`
const MAX_SESSIONS = 30

const read = (brandId) => {
  if (!brandId) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY(brandId)) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string') : []
  } catch {
    return []
  }
}

const write = (brandId, sessions) => {
  try {
    window.localStorage.setItem(KEY(brandId), JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
  } catch {
    // Storage unavailable: the playground still works, it just will not remember sessions.
  }
}

export const listTestSessions = (brandId) => read(brandId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

export function touchTestSession(brandId, id, patch = {}) {
  if (!brandId || !id) return
  const sessions = read(brandId)
  const now = Date.now()
  const existing = sessions.find((item) => item.id === id)
  if (existing) Object.assign(existing, patch, { updatedAt: now })
  else sessions.unshift({ id, title: 'New test', createdAt: now, updatedAt: now, messageCount: 0, ...patch })
  write(brandId, sessions)
  window.dispatchEvent(new CustomEvent('orb:test-sessions-changed', { detail: { brandId } }))
}

export function removeTestSession(brandId, id) {
  write(brandId, read(brandId).filter((item) => item.id !== id))
  window.dispatchEvent(new CustomEvent('orb:test-sessions-changed', { detail: { brandId } }))
}
