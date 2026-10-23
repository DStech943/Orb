import { supabase } from '../lib/supabase'

export async function listBrands() {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.schema('cx_copilot').from('brands').select('*')
    if (error) return []
    return (data || []).map((brand) => ({ id: brand.id, name: brand.name || brand.brand_name || brand.display_name || brand.slug || String(brand.id) }))
  } catch { return [] }
}
