import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react'
import ContentListPage from '../components/app/ContentListPage'
import { deleteProduct, listProducts, loadProductMetafields, loadProductThemeTemplates, loadProductVariantMetafields, saveProduct, saveProductMetafieldsToShopify, saveVariantMetafieldsToShopify, syncProductsForActiveBrand } from '../services/generation'
import { activeBrandId, activeBrandName, getShopifyCredentialStatus, getShopifyVariantMetafieldTracker, hasOrbApi } from '../services/orbApi'
import { saveTrackedVariantMetafield } from '../services/overviewBlocks'

const trackerStorageKey = (brandName) => `orb:variant-metafield-tracker:${String(brandName || '').trim().toLowerCase()}`
const fieldId = (field) => `${field?.namespace || ''}.${field?.key || ''}`
const truthyMetafieldValue = (value) => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase())

function VariantMetafieldTracker({ brandName, connected }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [selectedField, setSelectedField] = useState(null)
  const [mode, setMode] = useState('true')

  useEffect(() => {
    const saved = JSON.parse(window.localStorage.getItem(trackerStorageKey(brandName)) || 'null')
    setSelectedField(saved?.field || null)
    setMode(saved?.mode === 'nonempty' ? 'nonempty' : 'true')
    setData(null)
    setError('')
  }, [brandName])

  const load = async () => {
    if (!connected || !brandName) return
    setLoading(true); setError('')
    try { setData(await getShopifyVariantMetafieldTracker({ brandName })) } catch (loadError) { setError(loadError.message || 'Could not load variant metafields.') } finally { setLoading(false) }
  }
  useEffect(() => { if (open && !data && !loading) load() }, [open, brandName, connected]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectField = (event) => {
    const next = event.target.value || null
    setSelectedField(next)
    window.localStorage.setItem(trackerStorageKey(brandName), JSON.stringify({ field: next, mode }))
    saveTrackedVariantMetafield(activeBrandId(), { field: next, mode }).catch(() => {})
  }
  const selectMode = (event) => {
    const next = event.target.value
    setMode(next)
    window.localStorage.setItem(trackerStorageKey(brandName), JSON.stringify({ field: selectedField, mode: next }))
    saveTrackedVariantMetafield(activeBrandId(), { field: selectedField, mode: next }).catch(() => {})
  }
  const activeDefinition = data?.definitions?.find((field) => fieldId(field) === selectedField)
  const matchingVariants = (data?.variants || []).filter((variant) => {
    const value = variant.values?.[selectedField]
    return mode === 'true' ? truthyMetafieldValue(value) : Boolean(String(value || '').trim())
  })

  if (!connected) return null
  return <section className="mt-5 rounded-xl border-2 border-ink bg-white p-4 shadow-brutal">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand setting</p><h3 className="mt-1 flex items-center gap-2 text-lg font-extrabold text-ink"><SlidersHorizontal size={18} />Variant metafield tracker</h3><p className="mt-1 text-sm text-slate-600">Choose one Shopify variant metafield to track for {brandName}.</p></div><button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-md border-2 border-ink bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50" aria-expanded={open}>{open ? 'Hide tracker' : 'Configure tracker'}<ChevronDown size={16} className={open ? 'rotate-180' : ''} /></button></div>
    {open && <div className="mt-4 border-t-2 border-ink/10 pt-4">
      {loading ? <div className="flex items-center gap-2 py-4 text-sm text-slate-600"><Loader2 size={16} className="animate-spin text-purple" />Reading live Shopify variant metafields…</div> : error ? <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={load} className="font-bold underline">Retry</button></div> : <>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]"><label className="grid gap-1 text-sm font-bold text-ink">Metafield to track<select value={selectedField || ''} onChange={selectField} className="rounded-md border-2 border-ink bg-white px-3 py-2 text-sm font-medium"><option value="">Select a variant metafield…</option>{(data?.definitions || []).map((field) => <option key={fieldId(field)} value={fieldId(field)}>{field.name} ({field.namespace}.{field.key})</option>)}</select></label><label className="grid gap-1 text-sm font-bold text-ink">Show variants where<select value={mode} onChange={selectMode} className="rounded-md border-2 border-ink bg-white px-3 py-2 text-sm font-medium"><option value="true">Value is true</option><option value="nonempty">Metafield is not empty</option></select></label><button type="button" onClick={load} className="self-end inline-flex items-center justify-center gap-2 rounded-md border-2 border-ink bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50"><RefreshCw size={15} />Refresh</button></div>
        {!data?.definitions?.length ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No Shopify variant metafield definitions were found for this brand.</p> : null}
        {activeDefinition ? <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-extrabold text-ink">{activeDefinition.name}</p><p className="text-xs text-slate-500">{activeDefinition.namespace}.{activeDefinition.key} · {activeDefinition.type || 'Shopify metafield'}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800"><Check size={13} />{matchingVariants.length} matching variants</span></div><div className="mt-3 overflow-hidden rounded-lg border border-slate-200"><div className="grid grid-cols-[1.3fr_1fr_0.8fr] gap-3 bg-slate-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-500"><span>Product / variant</span><span>SKU</span><span>Value</span></div>{matchingVariants.length ? matchingVariants.map((variant) => <div key={variant.id} className="grid grid-cols-[1.3fr_1fr_0.8fr] gap-3 border-t border-slate-100 px-3 py-3 text-sm"><div className="min-w-0"><p className="truncate font-bold text-ink">{variant.product_title}</p><p className="truncate text-xs text-slate-500">{variant.title}</p></div><span className="truncate text-slate-600">{variant.sku || '—'}</span><span className="font-semibold text-emerald-700">{variant.values?.[selectedField]}</span></div>) : <p className="px-3 py-5 text-sm text-slate-500">No variants currently match this rule.</p>}</div></div> : <p className="mt-4 text-sm text-slate-600">Select a metafield to begin tracking it. This selection is saved separately for this brand.</p>}
      </>}
    </div>}
  </section>
}

export default function Products() {
  const [search] = useSearchParams()
  const [brandName, setBrandName] = useState(() => activeBrandName())
  const [shopifyConnected, setShopifyConnected] = useState(false)
  const backgroundSyncInFlight = useRef(false)
  const assistantDraft = useMemo(() => ({ message: search.get('draft') || '', target: search.get('target') || '', fieldHint: search.get('field') || '' }), [search])

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

  // Refresh Shopify data when Products is opened, then once per hour for as
  // long as this screen is mounted. Failures stay quiet so browsing products
  // is never interrupted; the existing manual Sync button remains available.
  useEffect(() => {
    if (!shopifyConnected || !brandName) return undefined
    let active = true
    const syncInBackground = async () => {
      if (backgroundSyncInFlight.current) return
      backgroundSyncInFlight.current = true
      try {
        await syncProductsForActiveBrand(brandName)
        if (active) window.dispatchEvent(new CustomEvent('orb:products-synced', { detail: { brandName } }))
      } catch (error) {
        console.warn('Background Shopify product sync failed:', error)
      } finally {
        backgroundSyncInFlight.current = false
      }
    }

    syncInBackground()
    const interval = window.setInterval(syncInBackground, 60 * 60 * 1000)
    return () => { active = false; window.clearInterval(interval) }
  }, [brandName, shopifyConnected])

  return <><VariantMetafieldTracker brandName={brandName} connected={shopifyConnected} /><ContentListPage kind="product" list={listProducts} update={saveProduct} remove={deleteProduct} assistantDraft={assistantDraft.message ? assistantDraft : null} syncProducts={shopifyConnected ? () => syncProductsForActiveBrand(brandName) : null} saveProductMetafields={shopifyConnected ? (product) => saveProductMetafieldsToShopify(product, brandName) : null} saveVariantMetafields={shopifyConnected ? (product, variant) => saveVariantMetafieldsToShopify(product, variant, brandName) : null} loadProductMetafields={shopifyConnected ? (product) => loadProductMetafields(product, brandName) : null} loadVariantMetafields={shopifyConnected ? (product, variantId) => loadProductVariantMetafields(product, brandName, variantId) : null} loadThemeTemplates={shopifyConnected ? () => loadProductThemeTemplates(brandName) : null} /></>
}
