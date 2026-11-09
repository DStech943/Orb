import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ContentListPage from '../components/app/ContentListPage'
import { deleteProduct, listProducts, loadProductThemeTemplates, loadProductVariantMetafields, saveProduct, saveProductMetafieldsToShopify, saveVariantMetafieldsToShopify, syncProductsForActiveBrand } from '../services/generation'
import { activeBrandName, getShopifyCredentialStatus, hasOrbApi } from '../services/orbApi'

export default function Products() {
  const [search] = useSearchParams()
  const [brandName, setBrandName] = useState(() => activeBrandName())
  const [shopifyConnected, setShopifyConnected] = useState(false)
  const assistantDraft = useMemo(() => ({ message: search.get('draft') || '', target: search.get('target') || '' }), [search])

  useEffect(() => {
    let active = true
    const checkConnection = async () => {
      const nextBrand = activeBrandName()
      setBrandName(nextBrand)
      if (!hasOrbApi || !nextBrand) { if (active) setShopifyConnected(false); return }
      try {
        const result = await getShopifyCredentialStatus(nextBrand)
        if (active) setShopifyConnected(Boolean(result?.token_available && result?.domain))
      } catch { if (active) setShopifyConnected(false) }
    }
    checkConnection()
    window.addEventListener('orb:brand-changed', checkConnection)
    return () => { active = false; window.removeEventListener('orb:brand-changed', checkConnection) }
  }, [])

  return <ContentListPage kind="product" list={listProducts} update={saveProduct} remove={deleteProduct} assistantDraft={assistantDraft.message ? assistantDraft : null} syncProducts={shopifyConnected ? () => syncProductsForActiveBrand(brandName) : null} saveProductMetafields={shopifyConnected ? (product) => saveProductMetafieldsToShopify(product, brandName) : null} saveVariantMetafields={shopifyConnected ? (product, variant) => saveVariantMetafieldsToShopify(product, variant, brandName) : null} loadVariantMetafields={shopifyConnected ? (product, variantId) => loadProductVariantMetafields(product, brandName, variantId) : null} loadThemeTemplates={shopifyConnected ? () => loadProductThemeTemplates(brandName) : null} />
}
