import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Loader2, RefreshCw, Wrench } from 'lucide-react'
import ContentListPage from '../components/app/ContentListPage'
import Modal from '../components/ui/Modal'
import { deleteProduct, listProducts, loadProductMetafields, loadProductThemeTemplates, loadProductVariantMetafields, saveProduct, saveProductMetafieldsToShopify, saveVariantMetafieldsToShopify, syncProductsForActiveBrand } from '../services/generation'
import { activeBrandId, activeBrandName, getShopifyCredentialStatus, getShopifyVariantMetafieldTracker, hasOrbApi } from '../services/orbApi'
import { saveTrackedVariantMetafield } from '../services/overviewBlocks'

const BACKGROUND_SYNC_MIN_MS = 15 * 60 * 1000
const themeTemplateCache = new Map()
const trackerStorageKey =(brandName) => `orb:variant-metafield-tracker:${String(brandName || '').trim().toLowerCase()}`
const fieldId = (field) => `${field?.namespace || ''}.${field?.key || ''}`
const truthyMetafieldValue = (value) => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase())
const readTrackedMetafield = (brandName) => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(trackerStorageKey(brandName)) || 'null')
    return stored?.field ? { field: stored.field, mode: stored.mode === 'nonempty' ? 'nonempty' : 'true', label: stored.label || stored.field } : null
  } catch { return null }
}

function VariantMetafieldTrackerModal({ open, onClose, brandName, connected, onTrackerChange }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [selectedField, setSelectedField] = useState(null)
  const [mode, setMode] = useState('true')

  useEffect(() => {
    const saved = JSON.parse(window.localStorage.getItem(trackerStorageKey(brandName)) || 'null')
    const tracker = readTrackedMetafield(brandName)
    setSelectedField(tracker?.field || null)
    setMode(tracker?.mode || 'true')
    setData(null)
    setError('')
  }, [brandName])

  const load = async () => {
    if (!connected || !brandName) return
    setLoading(true); setError('')
    try { setData(await getShopifyVariantMetafieldTracker({ brandName })) } catch (loadError) { setError(loadError.message || 'Could not load variant metafields.') } finally { setLoading(false) }
  }
  useEffect(() => { if (open && !data && !loading) load() }, [open, brandName, connected]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistTracker = (field, nextMode, definitions = data?.definitions || []) => {
    const definition = definitions.find((item) => fieldId(item) === field)
    const next = field ? { field, mode: nextMode, label: definition?.name || field } : null
    if (next) window.localStorage.setItem(trackerStorageKey(brandName), JSON.stringify(next))
    else window.localStorage.removeItem(trackerStorageKey(brandName))
    onTrackerChange?.(next)
    saveTrackedVariantMetafield(activeBrandId(), next || {}).catch(() => {})
  }
  const selectField = (event) => {
    const next = event.target.value || null
    setSelectedField(next)
    persistTracker(next, mode)
  }
  const selectMode = (event) => {
    const next = event.target.value
    setMode(next)
    persistTracker(selectedField, next)
  }
  const activeDefinition = data?.definitions?.find((field) => fieldId(field) === selectedField)
  const matchingVariants = (data?.variants || []).filter((variant) => {
    const value = variant.values?.[selectedField]
    return mode === 'true' ? truthyMetafieldValue(value) : Boolean(String(value || '').trim())
  })

  if (!connected) return null

  return (
    <Modal open={open} onClose={onClose} title="Variant metafield tracker">
      <div className="max-h-[75vh] overflow-y-auto pr-1">
        <p className="text-sm text-slate-600 mb-4">
          Choose one Shopify variant metafield to track for {brandName}.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin text-purple" />
            Reading live Shopify variant metafields…
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={load} className="font-bold underline">Retry</button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <label className="grid gap-1 text-xs font-bold text-ink">
                Metafield to track
                <select
                  value={selectedField || ''}
                  onChange={selectField}
                  className="rounded-md border-2 border-ink bg-white px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="">Select a variant metafield…</option>
                  {(data?.definitions || []).map((field) => (
                    <option key={fieldId(field)} value={fieldId(field)}>
                      {field.name} ({field.namespace}.{field.key})
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-ink">
                Show variants where
                <select
                  value={mode}
                  onChange={selectMode}
                  className="rounded-md border-2 border-ink bg-white px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="true">Value is true</option>
                  <option value="nonempty">Metafield is not empty</option>
                </select>
              </label>
              <button
                type="button"
                onClick={load}
                className="self-end inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-ink bg-white px-2.5 py-1.5 text-xs font-bold hover:bg-slate-50"
                title="Refresh definitions"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            {!data?.definitions?.length ? (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                No Shopify variant metafield definitions were found for this brand.
              </p>
            ) : null}

            {activeDefinition ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-extrabold text-sm text-ink">{activeDefinition.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {activeDefinition.namespace}.{activeDefinition.key} · {activeDefinition.type || 'Shopify metafield'}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                    <Check size={12} />
                    {matchingVariants.length} matching variants
                  </span>
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[1.3fr_1fr_0.8fr] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                    <span>Product / variant</span>
                    <span>SKU</span>
                    <span>Value</span>
                  </div>
                  {matchingVariants.length ? (
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {matchingVariants.map((variant) => (
                        <div key={variant.id} className="grid grid-cols-[1.3fr_1fr_0.8fr] gap-3 px-3 py-2.5 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink">{variant.product_title}</p>
                            <p className="truncate text-[11px] text-slate-500">{variant.title}</p>
                          </div>
                          <span className="truncate text-slate-600">{variant.sku || '—'}</span>
                          <span className="font-semibold text-emerald-700">{variant.values?.[selectedField]}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-4 text-xs text-slate-500">No variants currently match this rule.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-600">
                Select a metafield to begin tracking it. This selection is saved separately for this brand.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Products() {
  const [search] = useSearchParams()
  const [brandName, setBrandName] = useState(() => activeBrandName())
  const [shopifyConnected, setShopifyConnected] = useState(false)
  const [trackerModalOpen, setTrackerModalOpen] = useState(false)
  const [trackedMetafield, setTrackedMetafield] = useState(() => readTrackedMetafield(activeBrandName()))
  const [trackerVariants, setTrackerVariants] = useState([])
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

  useEffect(() => {
    setTrackedMetafield(readTrackedMetafield(brandName))
  }, [brandName])

  useEffect(() => {
    let active = true
    if (!shopifyConnected || !brandName || !trackedMetafield?.field) { setTrackerVariants([]); return undefined }
    getShopifyVariantMetafieldTracker({ brandName })
      .then((result) => { if (active) setTrackerVariants(Array.isArray(result?.variants) ? result.variants : []) })
      .catch(() => { if (active) setTrackerVariants([]) })
    return () => { active = false }
  }, [brandName, shopifyConnected, trackedMetafield?.field])

  // Refresh Shopify data when Products is opened, then once per hour for as
  // long as this screen is mounted. Failures stay quiet so browsing products
  // is never interrupted; the existing manual Sync button remains available.
  useEffect(() => {
    if (!shopifyConnected || !brandName) return undefined
    let active = true
    const syncInBackground = async () => {
      if (backgroundSyncInFlight.current) return
      // A full Shopify sync is slow and competes with the page's own requests, so opening
      // Products repeatedly must not re-run it. The manual Sync button always works.
      const stampKey = `orb:products-last-sync:${String(brandName).trim().toLowerCase()}`
      try {
        const last = Number(window.localStorage.getItem(stampKey) || 0)
        if (Date.now() - last < BACKGROUND_SYNC_MIN_MS) return
        window.localStorage.setItem(stampKey, String(Date.now()))
      } catch { /* storage unavailable: just sync */ }
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

  // Stable callbacks: the editor reloads theme templates whenever this function's identity changes.
  const syncProducts = useCallback(() => syncProductsForActiveBrand(brandName), [brandName])
  const saveProductMetafields = useCallback((product) => saveProductMetafieldsToShopify(product, brandName), [brandName])
  const saveVariantMetafields = useCallback((product, variant) => saveVariantMetafieldsToShopify(product, variant, brandName), [brandName])
  const loadProductMetafieldsFor = useCallback((product) => loadProductMetafields(product, brandName), [brandName])
  const loadVariantMetafieldsFor = useCallback((product, variantId) => loadProductVariantMetafields(product, brandName, variantId), [brandName])
  const loadThemeTemplatesFor = useCallback(() => {
    const cached = themeTemplateCache.get(brandName)
    if (cached) return cached
    const request = Promise.resolve(loadProductThemeTemplates(brandName)).catch((error) => { themeTemplateCache.delete(brandName); throw error })
    themeTemplateCache.set(brandName, request)
    return request
  }, [brandName])
  const trackedForList = useMemo(() => (trackedMetafield ? { ...trackedMetafield, variants: trackerVariants } : null), [trackedMetafield, trackerVariants])

  const spannerAction = shopifyConnected ? (
    <button
      type="button"
      onClick={() => setTrackerModalOpen(true)}
      title="Configure variant metafield tracker"
      aria-label="Configure variant metafield tracker"
      className="flex h-10 w-10 items-center justify-center rounded-md border-2 border-ink bg-white text-ink transition hover:bg-slate-50 hover:text-primary active:translate-y-0.5 shrink-0"
    >
      <Wrench size={16} />
    </button>
  ) : null

  return (
    <>
      <VariantMetafieldTrackerModal
        open={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        brandName={brandName}
        connected={shopifyConnected}
        onTrackerChange={(next) => { setTrackedMetafield(next); setTrackerVariants([]) }}
      />
      <ContentListPage
        kind="product"
        list={listProducts}
        update={saveProduct}
        remove={deleteProduct}
        extraFilterAction={spannerAction}
        trackedVariantMetafield={trackedForList}
        assistantDraft={assistantDraft.message ? assistantDraft : null}
        syncProducts={shopifyConnected ? syncProducts : null}
        saveProductMetafields={shopifyConnected ? saveProductMetafields : null}
        saveVariantMetafields={shopifyConnected ? saveVariantMetafields : null}
        loadProductMetafields={shopifyConnected ? loadProductMetafieldsFor : null}
        loadVariantMetafields={shopifyConnected ? loadVariantMetafieldsFor : null}
        loadThemeTemplates={shopifyConnected ? loadThemeTemplatesFor : null}
      />
    </>
  )
}
