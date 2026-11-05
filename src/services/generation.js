import { emptyOrbData, sampleData } from '../data/mock/generation'
import { deleteKnowledge, getShopifyProductTemplates, getShopifyVariantMetafields, hasOrbApi, listKnowledge, publishApprovedKnowledge, saveShopifyProductMetafields, syncShopifyProducts, updateKnowledge } from './orbApi'
const KEY = 'orb_generation_data_v1'
const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))
const read = () => { try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; return { sources: Array.isArray(saved.sources) ? saved.sources : [], sops: Array.isArray(saved.sops) ? saved.sops : [], faqs: Array.isArray(saved.faqs) ? saved.faqs : [], products: Array.isArray(saved.products) ? saved.products : [], jobs: Array.isArray(saved.jobs) ? saved.jobs : [], generations: Array.isArray(saved.generations) ? saved.generations : [] } } catch { return clone(emptyOrbData) } }
const write = (data) => { localStorage.setItem(KEY, JSON.stringify(data)); return clone(data) }
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const updateJob = (job) => { const elapsed = Date.now() - job.startedAt; const outputs = job.outputs.map((entry, index) => { const name = typeof entry === 'string' ? entry : entry.name; const stage = Math.max(0, Math.min(3, Math.floor((elapsed - index * 900) / 2200))); const status = stage === 0 ? 'Queued' : stage < 3 ? 'Running' : 'Done'; return { name, status, progress: status === 'Queued' ? 0 : status === 'Running' ? Math.min(88, 24 + Math.floor((elapsed - index * 900) / 55)) : 100, count: status === 'Done' ? '40 of 40 pages read' : `${Math.max(0, Math.min(39, Math.floor(elapsed / 160)))} of 40 pages read` } }); return { ...job, outputs: outputs, status: outputs.every((item) => item.status === 'Done') ? 'Done' : 'Running' } }
const createGeneratedContent = (data, job) => { if (job.createdContent) return data; const next = clone(data); if (job.requested.includes('SOPs')) next.sops.push({ id: uid('sop'), title: 'Respond to a new customer', category: 'Support', lifecycle: 'Customer', status: 'Draft', source: job.sources[0]?.label || 'Added source', updated: 'Just now', situation: 'A new customer needs help.', checkFirst: 'Check their account details.', whatToDo: 'Give the next clear step.', whatToSay: 'Here is the quickest way forward.', escalateTo: 'Support lead' }); if (job.requested.includes('FAQs')) next.faqs.push({ id: uid('faq'), question: 'Where can I get help?', answer: 'Contact our support team from your workspace.', category: 'Support', status: 'Draft', source: job.sources[0]?.label || 'Added source', updated: 'Just now' }); if (job.requested.includes('Products')) next.products.push({ id: uid('prd'), name: 'New product', price: '—', url: '', description: 'Generated from your source.' }); next.generations.unshift({ id: uid('gen'), source: job.sources[0]?.label || 'Added source', date: 'Just now', outputs: job.requested, status: 'Done' }); next.jobs = next.jobs.map((item) => item.id === job.id ? { ...job, createdContent: true } : item); return next }
export async function startGeneration({ sources, outputs }) { await wait(); const data = read(); const job = { id: uid('job'), startedAt: Date.now(), requested: outputs, sources, status: 'Queued', outputs: outputs.map((name) => ({ name, status: 'Queued', progress: 0, count: '0 of 40 pages read' })), createdContent: false }; data.jobs = [job, ...data.jobs]; write(data); return { jobId: job.id } }
export async function getJobStatus(jobId) { await wait(120); let data = read(); const job = data.jobs.find((item) => item.id === jobId); if (!job) return null; const nextJob = updateJob(job); data.jobs = data.jobs.map((item) => item.id === jobId ? nextJob : item); if (nextJob.status === 'Done') data = createGeneratedContent(data, nextJob); write(data); return clone(nextJob) }
const mapSop = ({ id, payload = {}, source }) => ({ id, title: payload.title || payload.situation || 'Untitled SOP', situation: payload.situation || '', category: payload.category || 'Uncategorised', lifecycle: payload.lifecycle_stage || payload.lifecycle || '—', status: payload.status || 'Draft', source: source || payload.source || 'Orb generation', updated: payload.updated_at || payload.updated || '—', updatedBy: payload.updated_by || payload.updatedBy || payload.updated_by_name || payload.updatedByName || '', checkFirst: payload.check_first || payload.checkFirst || '', whatToDo: payload.what_to_do || payload.whatToDo || '', whatToSay: payload.what_to_say || payload.whatToSay || '', escalateTo: payload.escalate_to || payload.escalateTo || '' })
const mapFaq = ({ id, payload = {}, source }) => ({ id, question: payload.question || payload.title || 'Untitled FAQ', answer: payload.answer || payload.what_to_say || '', category: payload.category || 'Uncategorised', status: payload.status || 'Draft', source: source || payload.source || 'Orb generation', updated: payload.updated_at || payload.updated || '—' })
const mapSopWithPayload = (record, source) => ({ ...mapSop({ ...record, source }), sourcePayload: record.payload || {} })
const productCurrency = (payload = {}, shopify = {}) => payload.currency || payload.currency_code || payload.currencyCode || shopify._orb_currency || graphNodes(shopify.variants)[0]?.price?.currencyCode || ''
const formatProductPrice = (payload = {}, fallbackCurrency = '') => {
  const rawPrice = payload.price ?? payload.price_amount ?? payload.amount ?? ''
  const currency = payload.currency || payload.currency_code || payload.currencyCode || fallbackCurrency
  if (rawPrice === '' || rawPrice === null || rawPrice === undefined) return ''
  if (!currency || typeof rawPrice === 'string' && /[^\d.,\s-]/.test(rawPrice)) return String(rawPrice)
  const amount = Number(rawPrice)
  if (!Number.isFinite(amount)) return `${currency} ${rawPrice}`
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) } catch { return `${currency} ${amount}` }
}
const graphNodes = (value) => Array.isArray(value) ? value : Array.isArray(value?.nodes) ? value.nodes : []
const mapProduct = ({ id, payload = {} }) => {
  const shopify = payload.shopify || payload.shopify_admin || payload.structured?.shopify_admin || {}
  const currency = productCurrency(payload, shopify)
  return {
    id,
    name: payload.title || payload.name || shopify.title || 'Untitled product',
    price: formatProductPrice(payload, currency),
    currency,
    url: payload.product_url || payload.url || '',
    description: payload.description || '',
    handle: payload.handle || shopify.handle || '',
    status: payload.status || shopify.status || '',
    vendor: payload.vendor || shopify.vendor || '',
    productType: payload.product_type || payload.productType || shopify.productType || '',
    tags: Array.isArray(payload.tags) ? payload.tags : Array.isArray(shopify.tags) ? shopify.tags : [],
    templateSuffix: payload.template_suffix || payload.templateSuffix || shopify.templateSuffix || '',
    seo: payload.seo || shopify.seo || {},
    featuredImage: payload.featured_image || payload.featuredImage || shopify.featuredImage || {},
    media: graphNodes(payload.media || shopify.media),
    variants: graphNodes(payload.variants || shopify.variants),
    metafields: graphNodes(payload.metafields || shopify.metafields),
    shopify,
  }
}
const sopPayload = (sop) => ({ title: sop.title, situation: sop.situation, category: sop.category, lifecycle_stage: sop.lifecycle, status: sop.status, updated_by: sop.updatedBy || '', check_first: sop.checkFirst, what_to_do: sop.whatToDo, what_to_say: sop.whatToSay, escalate_to: sop.escalateTo })
const faqPayload = (faq) => ({ question: faq.question, answer: faq.answer, category: faq.category, status: faq.status })
const productPayload = (product) => {
  const shopify = {
    ...(product.shopify || {}),
    handle: product.handle || '', status: product.status || '', vendor: product.vendor || '', productType: product.productType || '',
    tags: Array.isArray(product.tags) ? product.tags : [], templateSuffix: product.templateSuffix || '', seo: product.seo || {},
    variants: { nodes: Array.isArray(product.variants) ? product.variants : [] },
    metafields: { nodes: Array.isArray(product.metafields) ? product.metafields : [] },
  }
  return {
    title: product.name, name: product.name, price: product.price, currency: product.currency || '', product_url: product.url, url: product.url,
    description: product.description, handle: product.handle || '', status: product.status || '', vendor: product.vendor || '',
    product_type: product.productType || '', tags: Array.isArray(product.tags) ? product.tags : [], template_suffix: product.templateSuffix || '',
    seo: product.seo || {}, featured_image: product.featuredImage || {}, media: Array.isArray(product.media) ? product.media : [], variants: Array.isArray(product.variants) ? product.variants : [],
    metafields: Array.isArray(product.metafields) ? product.metafields : [], shopify,
  }
}
export async function listSops() { if (hasOrbApi) { const result = await listKnowledge('sops'); return result ? result.points.map((record) => mapSopWithPayload(record, result.source === 'qdrant' ? 'Qdrant' : undefined)) : [] } await wait(); return read().sops || [] }
export async function updateSop(sop) { if (hasOrbApi) { await updateKnowledge('sops', sop.id, sopPayload(sop)); return sop } await wait(); const data = read(); data.sops = data.sops.map((item) => item.id === sop.id ? { ...item, ...sop, updated: 'Just now' } : item); write(data); return sop }
export async function publishApprovedSops() { if (!hasOrbApi) return { published: 0 }; return publishApprovedKnowledge('sops') }
export async function deleteSop(id) { if (hasOrbApi) return deleteKnowledge('sops', id); await wait(); const data = read(); data.sops = data.sops.filter((item) => item.id !== id); write(data) }
export async function listFaqs() { if (hasOrbApi) { const result = await listKnowledge('faqs'); return result ? result.points.map((record) => mapFaq({ ...record, source: result.source === 'qdrant' ? 'Qdrant' : undefined })) : [] } await wait(); return read().faqs || [] }
export async function updateFaq(faq) { if (hasOrbApi) { await updateKnowledge('faqs', faq.id, faqPayload(faq)); return faq } await wait(); const data = read(); data.faqs = data.faqs.map((item) => item.id === faq.id ? { ...item, ...faq, updated: 'Just now' } : item); write(data); return faq }
export async function publishApprovedFaqs() { if (!hasOrbApi) return { published: 0 }; return publishApprovedKnowledge('faqs') }
export async function deleteFaq(id) { if (hasOrbApi) return deleteKnowledge('faqs', id); await wait(); const data = read(); data.faqs = data.faqs.filter((item) => item.id !== id); write(data) }
export async function listProducts() { if (hasOrbApi) { const result = await listKnowledge('products'); return result ? result.points.map(mapProduct) : [] } await wait(); return read().products || [] }
export async function syncProductsForActiveBrand(brandName) { if (!hasOrbApi) throw new Error('Connect the Orb API before syncing Shopify products.'); if (!brandName) throw new Error('Choose a brand before syncing Shopify products.'); return syncShopifyProducts({ brandName }) }
export async function loadProductVariantMetafields(product, brandName, variantId) {
  if (!hasOrbApi || !brandName || !product?.id || !variantId) throw new Error('Choose a connected Shopify variant first.')
  return getShopifyVariantMetafields({ brandName, productId: product.id, variantId })
}
export async function loadProductThemeTemplates(brandName) {
  if (!hasOrbApi || !brandName) throw new Error('Choose a connected Shopify brand first.')
  return getShopifyProductTemplates({ brandName })
}
export async function saveProductMetafieldsToShopify(product, brandName) {
  if (!hasOrbApi) throw new Error('Connect the Orb API before saving to Shopify.')
  if (!brandName || !product?.id) throw new Error('Choose a Shopify product before saving.')
  const metafields = (Array.isArray(product.metafields) ? product.metafields : []).map(({ namespace, key, type, value }) => ({ namespace, key, type, value: String(value ?? '') }))
  const deletedMetafieldIds = Array.isArray(product.deletedMetafieldIds) ? product.deletedMetafieldIds : []
  if (!metafields.length && !deletedMetafieldIds.length) throw new Error('This product has no metafield changes to save.')
  return saveShopifyProductMetafields({ brandName, productId: product.id, metafields, deletedMetafieldIds })
}
export async function saveVariantMetafieldsToShopify(product, variant, brandName) {
  if (!hasOrbApi) throw new Error('Connect the Orb API before saving to Shopify.')
  if (!brandName || !product?.id || !variant?.id) throw new Error('Choose a Shopify variant before saving.')
  const metafields = (Array.isArray(variant.metafields) ? variant.metafields : []).map(({ namespace, key, type, value, is_set }) => ({ namespace, key, type, value: String(value ?? ''), is_set: Boolean(is_set) }))
  if (!metafields.length) throw new Error('This variant has no metafields to save.')
  return saveShopifyProductMetafields({ brandName, productId: product.id, ownerId: variant.id, metafields })
}
export async function saveProduct(product) { if (hasOrbApi) { if (!product.id) throw new Error('Products are read from Qdrant. Add new products in the source collection.'); await updateKnowledge('products', product.id, productPayload(product)); return product } await wait(); const data = read(); const item = product.id ? product : { ...product, id: uid('prd') }; data.products = product.id ? data.products.map((value) => value.id === product.id ? item : value) : [...data.products, item]; write(data); return item }
export async function deleteProduct(id) { if (hasOrbApi) return deleteKnowledge('products', id); await wait(); const data = read(); data.products = data.products.filter((item) => item.id !== id); write(data) }
export async function listSources() { await wait(); return read().sources || [] }
export async function addSource(source) { await wait(); const data = read(); const item = { ...source, id: uid('src'), status: 'Ready', lastSynced: 'Just now' }; data.sources.push(item); write(data); return item }
export async function removeSource(id) { await wait(); const data = read(); data.sources = data.sources.filter((item) => item.id !== id); write(data) }
export async function getOverviewData() { await wait(); const data = read(); return { sops: data.sops, faqs: data.faqs, products: data.products, sources: data.sources, generations: data.generations } }
export async function seedSampleData() { await wait(); write(clone(sampleData)); return clone(sampleData) }
