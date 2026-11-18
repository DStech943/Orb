/**
 * Commerce facts for the client portal.
 *
 * Only what Orb can really see: whether a Shopify store is connected and the brand's real
 * product catalog with its stock status. Revenue, order counts and AI-attributed sales are
 * NOT connected to any source, so they are not returned (and never estimated).
 *
 * A request that FAILS is never reported as "not connected": it throws, so the page can say
 * it could not check and offer a retry. "Not connected" is only returned when the catalog
 * loaded and is empty AND the store status was read and says there is no connection.
 */

import { listProducts } from './generation'
import { getBrandCatalogSummary, getShopifyCredentialStatus } from './orbApi'

// Only products that are for sale count: draft or archived products are not "out of stock".
const forSale = (product) => !product.status || ['active', 'published'].includes(String(product.status).toLowerCase())

// Stock comes from the variants' inventory. With no inventory figures at all, the product is not
// reported as out of stock (unknown is not zero).
const outOfStock = (product) => {
  const quantities = (Array.isArray(product.variants) ? product.variants : [])
    .map((variant) => Number(variant?.inventoryQuantity ?? variant?.inventory_quantity))
    .filter(Number.isFinite)
  if (quantities.length > 0) return quantities.reduce((sum, quantity) => sum + quantity, 0) <= 0
  return Boolean(product.shopify?.out_of_stock)
}

// The fast path: the API returns just name, handle and stock for each synced product.
async function lightCatalog(brandId) {
  if (!brandId) return null
  try {
    const summary = await getBrandCatalogSummary(brandId)
    if (summary?.source !== 'shopify') return null
    return summary.products.map((product) => ({
      id: product.id,
      name: product.name,
      handle: product.handle,
      price: '',
      imageUrl: null,
      isOutOfStock: Boolean(product.out_of_stock),
    }))
  } catch {
    // Fall back to the full listing below rather than reporting an empty catalog.
    return null
  }
}

// The slow path, for brands whose catalog is not a Shopify sync: every full product record.
async function fullCatalog() {
  const catalog = await listProducts()
  return (Array.isArray(catalog) ? catalog : []).filter(forSale).map((product) => ({
    id: product.id,
    name: product.name || product.title || 'Untitled product',
    handle: product.handle || '',
    price: product.price || '',
    imageUrl: product.featuredImage?.url || product.featuredImage?.src || null,
    isOutOfStock: outOfStock(product),
  }))
}

const checkStore = (brandName) =>
  brandName
    ? getShopifyCredentialStatus(brandName).then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error }))
    : Promise.resolve({ ok: true, value: null })

export async function getBusinessIntelligence(brandId, brandName) {
  const light = await lightCatalog(brandId)

  // Synced products already prove the store is connected, so the (slow) credential check is not
  // needed and nothing waits for it. Only the store's domain is lost, which is cosmetic.
  if (light && light.length > 0) {
    return { connected: true, storeDomain: '', catalogCount: light.length, products: light, outOfStock: light.filter((product) => product.isOutOfStock) }
  }

  const [status, full] = await Promise.all([checkStore(brandName), light ? Promise.resolve(light) : fullCatalog()])
  const products = full

  // With an empty catalog the store status decides, so a failed status check means "unknown".
  if (products.length === 0 && !status.ok) throw status.error || new Error('Could not check your store connection.')
  const credentials = status.ok ? status.value : null

  return {
    connected: products.length > 0 || Boolean(credentials?.domain && (credentials?.token_available || credentials?.valid)),
    storeDomain: credentials?.domain || '',
    catalogCount: products.length,
    products,
    outOfStock: products.filter((product) => product.isOutOfStock),
  }
}
