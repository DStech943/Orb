import { supabase } from '../lib/supabase'

const localBrowser = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const baseUrl = (import.meta.env.VITE_ORB_API_URL || (localBrowser ? 'http://127.0.0.1:8000' : '')).replace(/\/$/, '')
export const hasOrbApi = Boolean(baseUrl && (import.meta.env.VITE_AUTH_MODE === 'supabase' || localBrowser))

const request = async (path, options = {}) => {
  if (!baseUrl) return null
  const { data } = await supabase?.auth.getSession()
  const token = data?.session?.access_token
  if (!token && !localBrowser) throw new Error('Sign in again to access brand knowledge.')
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...(options.headers || {}) } })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Orb API request failed.')
  return response.json()
}

export const activeBrandName = () => window.localStorage.getItem('orb_selected_brand_name') || ''
export const listRemoteBrands = () => request('/api/brands')
export const listBrandCategories = () => request('/api/categories')
export const setRemoteBrandCategory = (brandId, industryCategory) => request(`/api/brands/${encodeURIComponent(brandId)}/category`, { method: 'PATCH', body: JSON.stringify({ industry_category: industryCategory }) })
export const listKnowledge = (kind, brandName = activeBrandName()) => brandName ? request(`/api/knowledge/${kind}?brand_name=${encodeURIComponent(brandName)}`) : Promise.resolve(null)
export const updateKnowledge = (kind, id, payload, brandName = activeBrandName()) => request(`/api/knowledge/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ brand_name: brandName, payload }) })
export const deleteKnowledge = (kind, id, brandName = activeBrandName()) => request(`/api/knowledge/${kind}/${encodeURIComponent(id)}?brand_name=${encodeURIComponent(brandName)}`, { method: 'DELETE' })
