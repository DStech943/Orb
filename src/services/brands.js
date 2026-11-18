import { supabase } from '../lib/supabase'
import { hasOrbApi, listRemoteBrands } from './orbApi'

const BRAND_CACHE_MS = 30_000
let cachedBrands = null
let cachedAt = 0
let cachedForUser = ''
let brandRequest = null
const STAFF_ROLES = new Set(['admin', 'agent', 'pod_lead'])

async function currentBrandAccess() {
  if (!supabase) return { isStaff: false, brandIds: [], cacheKey: 'no-supabase' }
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData?.user
    if (authError || !user?.email) return { isStaff: false, brandIds: [], cacheKey: 'anonymous' }

    const email = String(user.email).trim().toLowerCase()
    const [profileResult, assignmentsResult] = await Promise.all([
      supabase.schema('cx_copilot').from('orb_profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.schema('cx_copilot').from('brand_assignments').select('brand_id, role').ilike('email', email),
    ])
    const profileRole = String(profileResult.data?.role || '').toLowerCase()
    const assignments = Array.isArray(assignmentsResult.data) ? assignmentsResult.data : []
    const isStaff = STAFF_ROLES.has(profileRole === 'team' ? 'agent' : profileRole)
      || assignments.some((assignment) => STAFF_ROLES.has(String(assignment.role || '').toLowerCase()))
    return {
      isStaff,
      brandIds: [...new Set(assignments.map((assignment) => assignment.brand_id).filter(Boolean))],
      cacheKey: String(user.id),
    }
  } catch {
    return { isStaff: false, brandIds: [], cacheKey: 'unavailable' }
  }
}

const scopeBrandsToCurrentUser = (brands, access) => {
  if (access.isStaff) return brands
  const assigned = new Set(access.brandIds)
  return brands.filter((brand) => assigned.has(brand.id))
}

async function listDirectBrands() {
  if (!supabase) return []
  try {
    // platform_config can contain provider credentials. The API-backed path
    // exposes the safe agent display name; direct fallback uses the default.
    const { data, error } = await supabase
      .schema('cx_copilot')
      .from('brands')
      // `cx_copilot.brands` exposes its display label as `name`. Selecting
      // legacy aliases here makes PostgREST reject the entire query when one
      // of those columns is absent (for example `brand_name`).
      .select('id, name')
    if (error) return []
    return (data || []).map((brand) => ({
      id: brand.id,
      name: brand.name || String(brand.id),
      ai_agent_name: '',
      ai_agent_configured: false,
    }))
  } catch { return [] }
}

export async function listBrands() {
  const access = await currentBrandAccess()
  if (cachedBrands && cachedForUser === access.cacheKey && Date.now() - cachedAt < BRAND_CACHE_MS) return cachedBrands
  if (brandRequest) return brandRequest
  brandRequest = (async () => {
    let brands = []
    if (hasOrbApi) {
      try {
        const result = await listRemoteBrands()
        if (Array.isArray(result?.brands) && result.brands.length) brands = result.brands
      } catch {
        // Local development can continue when the Python API is offline.
      }
    }
    if (!brands.length) brands = await listDirectBrands()
    cachedBrands = scopeBrandsToCurrentUser(brands, access)
    cachedAt = Date.now()
    cachedForUser = access.cacheKey
    return cachedBrands
  })()
  try {
    return await brandRequest
  } finally {
    brandRequest = null
  }
}

export function invalidateBrandCache() {
  cachedBrands = null
  cachedAt = 0
  cachedForUser = ''
}
