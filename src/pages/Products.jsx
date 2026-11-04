import React, { useEffect, useState } from 'react'
import ContentListPage from '../components/app/ContentListPage'
import { deleteProduct, listProducts, loadProductThemeTemplates, loadProductVariantMetafields, saveProduct, saveProductMetafieldsToShopify, syncProductsForActiveBrand } from '../services/generation'
import { activeBrandName, getShopifyCredentialStatus, hasOrbApi } from '../services/orbApi'

export default function Products() {
  const [brandName, setBrandName] = useState(() => activeBrandName())
  const [shopifyConnected, setShopifyConnected] = useState(false)

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

  return <ContentListPage kind="product" list={listProducts} update={saveProduct} remove={deleteProduct} syncProducts={shopifyConnected ? () => syncProductsForActiveBrand(brandName) : null} saveProductMetafields={shopifyConnected ? (product) => saveProductMetafieldsToShopify(product, brandName) : null} loadVariantMetafields={shopifyConnected ? (product) => loadProductVariantMetafields(product, brandName) : null} loadThemeTemplates={shopifyConnected ? () => loadProductThemeTemplates(brandName) : null} />
}
