import { supabase } from '../lib/supabase'
import { hasOrbApi, listRemoteBrands } from './orbApi'

async function listDirectBrands() {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.schema('cx_copilot').from('brands').select('*')
    if (error) return []
    return (data || []).map((brand) => ({ id: brand.id, name: brand.name || brand.brand_name || brand.display_name || brand.slug || String(brand.id) }))
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
