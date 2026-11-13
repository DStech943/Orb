import { supabase } from '../lib/supabase'

export const DEFAULT_OVERVIEW_BLOCKS = ['flows', 'out_of_stock', 'near_out_of_stock', 'operations']
const storageKey = (brandName) => `orb:overview:blocks:${String(brandName || 'default').toLowerCase()}`

const storedBlocks = (brandName) => {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(brandName)) || 'null')
    return Array.isArray(value) ? value : DEFAULT_OVERVIEW_BLOCKS
  } catch { return DEFAULT_OVERVIEW_BLOCKS }
}

export async function getOverviewBlocks(brandId, brandName) {
  const fallback = storedBlocks(brandName)
  if (!supabase || !brandId) return fallback
  const { data, error } = await supabase.schema('cx_copilot').from('orb_overview_block_settings').select('blocks').eq('brand_id', brandId).maybeSingle()
  if (error || !Array.isArray(data?.blocks)) return fallback
  window.localStorage.setItem(storageKey(brandName), JSON.stringify(data.blocks))
  return data.blocks
}

export async function saveOverviewBlocks(brandId, brandName, blocks) {
  const next = Array.isArray(blocks) ? blocks : DEFAULT_OVERVIEW_BLOCKS
  window.localStorage.setItem(storageKey(brandName), JSON.stringify(next))
  if (!supabase || !brandId) return next
  const { error } = await supabase.schema('cx_copilot').from('orb_overview_block_settings').upsert({ brand_id: brandId, blocks: next, updated_at: new Date().toISOString() })
  if (error) throw error
  return next
}

export async function saveTrackedVariantMetafield(brandId, tracker) {
  if (!supabase || !brandId) return
  await supabase.schema('cx_copilot').from('orb_overview_block_settings').upsert({ brand_id: brandId, tracked_variant_metafield: tracker || {}, updated_at: new Date().toISOString() })
}

export async function getDailySlackReport(brandId) {
  if (!supabase || !brandId) return { enabled: false, hour: 9, timezone: 'Asia/Kolkata' }
  const { data } = await supabase.schema('cx_copilot').from('orb_overview_block_settings').select('daily_slack_report').eq('brand_id', brandId).maybeSingle()
  return { enabled: false, hour: 9, timezone: 'Asia/Kolkata', ...(data?.daily_slack_report || {}) }
}

export async function saveDailySlackReport(brandId, report) {
  if (!supabase || !brandId) return report
  const { error } = await supabase.schema('cx_copilot').from('orb_overview_block_settings').upsert({ brand_id: brandId, daily_slack_report: report, updated_at: new Date().toISOString() })
  if (error) throw error
  return report
}
