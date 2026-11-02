import { supabase } from '../lib/supabase'
import { hasOrbApi, listRemoteBrands } from './orbApi'

async function listDirectBrands() {
  if (!supabase) return []
  try {
    // platform_config can contain provider credentials. The API-backed path
    // exposes the safe agent display name; direct fallback uses the default.
    const { data, error } = await supabase
      .schema('cx_copilot')
      .from('brands')
      .select('id, name, brand_name, display_name, slug')
    if (error) return []
    return (data || []).map((brand) => ({
      id: brand.id,
      name: brand.name || brand.brand_name || brand.display_name || brand.slug || String(brand.id),
      ai_agent_name: '',
    }))
  } catch { return [] }
}

export async function listBrands() {
  if (hasOrbApi) {
    try {
      const result = await listRemoteBrands()
      if (Array.isArray(result?.brands) && result.brands.length) return result.brands
    } catch {
      // Local development can continue when the Python API is offline.
    }
  }
  return listDirectBrands()
}
