import { supabase } from '../lib/supabase'

const localBrowser = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname)
const configuredApiUrl = import.meta.env.VITE_ORB_API_URL
// Set VITE_ORB_API_URL to the public API origin when the frontend and API are
// deployed separately (for example, Vercel -> Railway). An empty production
// value is only valid when `/api` is proxied through the same deployment.
const baseUrl = (configuredApiUrl || (localBrowser ? 'http://127.0.0.1:8000' : '')).replace(/\/$/, '')
const mockAuth = import.meta.env.VITE_AUTH_MODE === 'mock'
export const hasOrbApi = Boolean(configuredApiUrl || localBrowser || !import.meta.env.DEV)

const request = async (path, options = {}) => {
  if (!hasOrbApi) return null
  const { data } = await supabase?.auth.getSession()
  const token = data?.session?.access_token
  if (!token && !localBrowser && !mockAuth) throw new Error('Sign in again to access brand knowledge.')
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...(options.headers || {}) } })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Orb API request failed.')
  if (response.status === 204) return null
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Orb API returned a non-JSON response. Set VITE_ORB_API_URL to the public Railway orb-api domain and redeploy the frontend.')
  }
  return response.json()
}

export const activeBrandName = () => window.localStorage.getItem('orb_selected_brand_name') || ''
export const listRemoteBrands = () => request('/api/brands')
export const listBrandCategories = () => request('/api/categories')
export const setRemoteBrandCategory = (brandId, industryCategory) => request(`/api/brands/${encodeURIComponent(brandId)}/category`, { method: 'PATCH', body: JSON.stringify({ industry_category: industryCategory }) })
export const setRemoteBrandProfile = (brandId, profile) => request(`/api/brands/${encodeURIComponent(brandId)}/profile`, { method: 'PATCH', body: JSON.stringify(profile) })
export const askOrbGuide = (payload) => request('/api/orb-guide', { method: 'POST', body: JSON.stringify(payload) })
export const chatWithDeployedAgent = (brandId, payload) => request(`/api/brands/${encodeURIComponent(brandId)}/agent/chat`, { method: 'POST', body: JSON.stringify(payload) })
export const getBrandVoice = (brandId) => request(`/api/brands/${encodeURIComponent(brandId)}/voice`)
export const importBrandVoiceSource = (brandId, source) => request(`/api/brands/${encodeURIComponent(brandId)}/voice/sources`, { method: 'POST', body: JSON.stringify(source) })
export const deleteBrandVoiceSource = (brandId, sourceId) => request(`/api/brands/${encodeURIComponent(brandId)}/voice/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' })
export const generateBrandVoice = (brandId) => request(`/api/brands/${encodeURIComponent(brandId)}/voice/generate`, { method: 'POST' })
export const createManualBrandVoiceProfile = (brandId, profile) => request(`/api/brands/${encodeURIComponent(brandId)}/voice/profiles/manual`, { method: 'POST', body: JSON.stringify(profile) })
export const approveBrandVoice = (brandId, profileId, profile) => request(`/api/brands/${encodeURIComponent(brandId)}/voice/profiles/${encodeURIComponent(profileId)}/approve`, { method: 'PATCH', body: JSON.stringify(profile) })
export const listKnowledge = (kind, brandName = activeBrandName()) => brandName ? request(`/api/knowledge/${kind}?brand_name=${encodeURIComponent(brandName)}`) : Promise.resolve(null)
export const updateKnowledge = (kind, id, payload, brandName = activeBrandName()) => request(`/api/knowledge/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ brand_name: brandName, payload }) })
export const publishApprovedKnowledge = (kind, brandName = activeBrandName()) => request(`/api/knowledge/${kind}/publish-approved`, { method: 'POST', body: JSON.stringify({ brand_name: brandName }) })
export const deleteKnowledge = (kind, id, brandName = activeBrandName()) => request(`/api/knowledge/${kind}/${encodeURIComponent(id)}?brand_name=${encodeURIComponent(brandName)}`, { method: 'DELETE' })
export const listFlows = (brandName = activeBrandName()) => brandName ? request(`/api/flows?brand_name=${encodeURIComponent(brandName)}`) : Promise.resolve(null)
export const assistFlow = (prompt, brandName = activeBrandName()) => request('/api/flows/assist', { method: 'POST', body: JSON.stringify({ brand_name: brandName, prompt }) })
export const createFlow = (payload, brandName = activeBrandName()) => request('/api/flows', { method: 'POST', body: JSON.stringify({ brand_name: brandName, payload }) })
export const updateFlow = (id, payload, brandName = activeBrandName()) => request(`/api/flows/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ brand_name: brandName, payload }) })
export const deleteFlow = (id, brandName = activeBrandName()) => request(`/api/flows/${encodeURIComponent(id)}?brand_name=${encodeURIComponent(brandName)}`, { method: 'DELETE' })
export const createCrawlPipeline = ({ url, brandId, maxPages = 100, outputs = ['sops', 'faqs', 'products'] }) => request('/api/crawls', { method: 'POST', body: JSON.stringify({ start_url: url, brand_id: brandId || null, max_pages: maxPages, outputs }) })
export const listPipelines = (brandId) => request(`/api/pipelines?brand_id=${encodeURIComponent(brandId)}`)
export const getPipeline = (pipelineId) => request(`/api/pipelines/${encodeURIComponent(pipelineId)}`)
export const startPipelineGeneration = (pipelineId) => request(`/api/pipelines/${encodeURIComponent(pipelineId)}/generate`, { method: 'POST' })
export const pausePipeline = (pipelineId) => request(`/api/pipelines/${encodeURIComponent(pipelineId)}/pause`, { method: 'POST' })
export const resumePipeline = (pipelineId) => request(`/api/pipelines/${encodeURIComponent(pipelineId)}/resume`, { method: 'POST' })
export const cancelPipeline = (pipelineId) => request(`/api/pipelines/${encodeURIComponent(pipelineId)}/cancel`, { method: 'POST' })
export const getCrawl = (crawlJobId) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}`)
export const listCrawlUrls = (crawlJobId, { limit = 100, status } = {}) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}/urls?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ''}`)
export const listCrawlPages = (crawlJobId, { limit = 100 } = {}) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}/pages?limit=${limit}`)
export const getCrawlPageContent = (crawlJobId, url) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}/pages/content?url=${encodeURIComponent(url)}`)
export const pauseCrawl = (crawlJobId) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}/pause`, { method: 'POST' })
export const resumeCrawl = (crawlJobId) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}/resume`, { method: 'POST' })
export const cancelCrawl = (crawlJobId) => request(`/api/crawls/${encodeURIComponent(crawlJobId)}/cancel`, { method: 'POST' })
export const getShopifyCredentialStatus = (brandName) => request(`/api/shopify/credentials?brand_name=${encodeURIComponent(brandName)}`)
export const importShopifySource = ({ domain, accessToken, brandId, brandName, useVault = true, maximum = 100, outputs = ['sops', 'faqs', 'products'] }) => request('/api/shopify/import', { method: 'POST', body: JSON.stringify({ domain: domain || null, access_token: accessToken || null, brand_id: brandId || null, brand_name: brandName || null, use_vault: useVault, maximum, outputs }) })
export const syncShopifyProducts = ({ brandName, maximum = 250 }) => request('/api/shopify/products/sync', { method: 'POST', body: JSON.stringify({ brand_name: brandName, use_vault: true, maximum }) })
export const getShopifyProductTemplates = ({ brandName }) => request(`/api/shopify/products/theme-templates?brand_name=${encodeURIComponent(brandName)}`)
export const getShopifyVariantMetafields = ({ brandName, productId }) => request(`/api/shopify/products/${encodeURIComponent(productId)}/variant-metafields?brand_name=${encodeURIComponent(brandName)}`)
export const saveShopifyProductMetafields = ({ brandName, productId, ownerId, metafields, deletedMetafieldIds = [] }) => request('/api/shopify/products/metafields/save', { method: 'POST', body: JSON.stringify({ brand_name: brandName, product_id: productId, owner_id: ownerId || undefined, metafields, deleted_metafield_ids: deletedMetafieldIds, use_vault: true }) })
