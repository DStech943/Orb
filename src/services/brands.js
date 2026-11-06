import { supabase } from '../lib/supabase'
import { hasOrbApi, listRemoteBrands } from './orbApi'

const BRAND_CACHE_MS = 30_000
let cachedBrands = null
let cachedAt = 0
let brandRequest = null

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
    }))
  } catch { return [] }
}

export async function listBrands() {
  if (cachedBrands && Date.now() - cachedAt < BRAND_CACHE_MS) return cachedBrands
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
    cachedBrands = brands
    cachedAt = Date.now()
    return brands
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
}
