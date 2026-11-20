import { listTestSessions } from './testSessions'
import { listBrandAgentFeedback } from '../services/orbApi'
import { supabase } from './supabase'

function formatEmailLocalPart(email) {
  if (!email || typeof email !== 'string') return ''
  const local = email.split('@')[0] || ''
  return local.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function enrichFeedbackUsers(items, brandId) {
  if (!Array.isArray(items) || !items.length) return items
  if (!supabase) return items

  try {
    // 1. Get current auth user if available
    let currentAuth = null
    try {
      const { data: authData } = await supabase.auth.getUser()
      currentAuth = authData?.user || null
    } catch {
      // Ignore auth error
    }

    // 2. Fetch orb_profiles for all submitters
    const userIds = Array.from(new Set(items.map((i) => i?.submitted_by).filter(Boolean)))
    const profilesMap = new Map()
    if (userIds.length) {
      try {
        const { data: profiles } = await supabase
          .schema('cx_copilot')
          .from('orb_profiles')
          .select('id, full_name, email')
          .in('id', userIds)
        if (Array.isArray(profiles)) {
          for (const p of profiles) {
            profilesMap.set(p.id, p)
          }
        }
      } catch {
        // Fallback if RLS or query fails
      }
    }

    // 3. Query brand_assignments and admins for authoritative member names
    const emailToName = new Map()
    try {
      let query = supabase.schema('cx_copilot').from('brand_assignments').select('name, email')
      if (brandId) {
        query = query.eq('brand_id', brandId)
      }
      const { data: assignments } = await query
      if (Array.isArray(assignments)) {
        for (const a of assignments) {
          if (a?.email && a?.name) {
            emailToName.set(a.email.trim().toLowerCase(), a.name.trim())
          }
        }
      }
    } catch {
      // Ignore
    }

    try {
      const { data: admins } = await supabase.schema('cx_copilot').from('admins').select('name, email')
      if (Array.isArray(admins)) {
        for (const a of admins) {
          const em = (a?.email || '').trim().toLowerCase()
          if (em && a?.name && !emailToName.has(em)) {
            emailToName.set(em, a.name.trim())
          }
        }
      }
    } catch {
      // Ignore
    }

    // 4. Enrich each item with resolved name and email
    return items.map((item) => {
      const uid = item?.submitted_by
      const p = uid ? profilesMap.get(uid) : null
      const isCurrent = currentAuth && uid === currentAuth.id

      const email =
        item.submitted_by_email ||
        p?.email ||
        (isCurrent ? currentAuth.email : '') ||
        ''
      const emailLower = email.toLowerCase()

      const authMetaName = isCurrent
        ? (currentAuth.user_metadata?.full_name || currentAuth.user_metadata?.name || '')
        : ''

      const resolvedName =
        (item.submitted_by_name && item.submitted_by_name !== 'Workspace member' && item.submitted_by_name !== 'Google Account'
          ? item.submitted_by_name
          : '') ||
        emailToName.get(emailLower) ||
        p?.full_name ||
        authMetaName ||
        formatEmailLocalPart(email)

      return {
        ...item,
        submitted_by_name: resolvedName || item.submitted_by_name || '',
        submitted_by_email: email,
      }
    })
  } catch {
    return items
  }
}

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
      const rawItems = Array.isArray(result?.feedback) ? result.feedback : []
      const items = await enrichFeedbackUsers(rawItems, brandId)
      return { items, scope: 'brand' }
    } catch {
      // If the brand-wide endpoint is unreachable, avoid spamming per-session requests
      return { items: [], scope: 'offline' }
    }
  }
  const sessions = listTestSessions(brandId).slice(0, 5)
  try {
    const settled = await Promise.allSettled(sessions.map((session) => listBrandAgentFeedback(brandId, session.id)))
    const rawItems = settled.flatMap((entry) => (entry.status === 'fulfilled' && Array.isArray(entry.value?.feedback) ? entry.value.feedback : []))
    rawItems.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    const items = await enrichFeedbackUsers(rawItems, brandId)
    return { items, scope: 'sessions' }
  } catch {
    return { items: [], scope: 'sessions' }
  }
}
