import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ExternalLink,
  FileSpreadsheet,
  PackageX,
  Plus,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import { MOCK_STATES, useOverview } from '../services/overview'
import { activeBrandId, extendOperation, getBrandMastersheetUrl, getShopifyVariantMetafieldTracker } from '../services/orbApi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import { DEFAULT_OVERVIEW_BLOCKS, getOverviewBlocks, saveOverviewBlocks } from '../services/overviewBlocks'

const WELCOME_LINES = [
  'Good support is just consistency, repeated.',
  'Every approved answer is one less reply someone has to rewrite.',
  'Your agent is only as sharp as what it has been taught.',
  'Small updates beat big rewrites. Refresh one thing today.',
  'Clear answers mean fewer surprises for your customers.',
]

const DEV_STATES = MOCK_STATES || {}

const METRIC_CONFIG = [
  { key: 'sops', label: 'SOPs', noun: 'SOP', nouns: 'SOPs', milestones: [1, 10, 25, 50], listTo: '/app/brain?tab=sops', draftTo: '/app/brain?tab=sops&status=draft', createTo: '/app/brain?tab=sops' },
  { key: 'faqs', label: 'FAQs', noun: 'FAQ', nouns: 'FAQs', milestones: [1, 10, 25, 50], listTo: '/app/brain?tab=faqs', draftTo: '/app/brain?tab=faqs&status=draft', createTo: '/app/brain?tab=faqs' },
  { key: 'flows', label: 'Flows', noun: 'flow', nouns: 'flows', milestones: [1, 3, 5, 10], listTo: '/app/flows', draftTo: '/app/flows?status=draft', createTo: '/app/flows?create=1' },
]

const hasReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useCountUp(value, sessionKey) {
  const safeValue = Math.max(0, Number(value) || 0)
  const [display, setDisplay] = useState(() => (typeof window !== 'undefined' && window.sessionStorage.getItem(sessionKey) ? safeValue : 0))
  useEffect(() => {
    const hasPlayed = window.sessionStorage.getItem(sessionKey)
    if (hasPlayed || hasReducedMotion() || safeValue === 0) { setDisplay(safeValue); return }
    window.sessionStorage.setItem(sessionKey, 'shown')
    let frame
    const startedAt = performance.now()
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / 620)
      setDisplay(Math.round(safeValue * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [safeValue, sessionKey])
  return display
}

function useMilestoneBadge(brandName, type, published, milestones, noun, nouns) {
  const [badge, setBadge] = useState(null)
  const storageKey = `orb:overview:milestones:${brandName}:${type}`
  useEffect(() => {
    const shown = new Set(JSON.parse(window.localStorage.getItem(storageKey) || '[]'))
    const eligible = milestones.filter((milestone) => milestone <= published && !shown.has(milestone))
    if (eligible.length) {
      const milestone = eligible[eligible.length - 1]
      setBadge({ milestone, message: milestone === 1 ? `First ${noun} published.` : `${milestone} ${nouns} published.` })
    } else setBadge(null)
  }, [brandName, type, published, milestones, noun, nouns, storageKey])
  const dismiss = () => {
    if (!badge) return
    const shown = new Set(JSON.parse(window.localStorage.getItem(storageKey) || '[]'))
    milestones.filter((milestone) => milestone <= badge.milestone).forEach((milestone) => shown.add(milestone))
    window.localStorage.setItem(storageKey, JSON.stringify([...shown]))
    setBadge(null)
  }
  return [badge, dismiss]
}

function TilePile({ count, sessionKey }) {
  const tiles = Math.min(30, count)
  const [drop, setDrop] = useState(false)
  useEffect(() => {
    if (hasReducedMotion() || window.sessionStorage.getItem(sessionKey)) return
    window.sessionStorage.setItem(sessionKey, 'shown')
    setDrop(true)
  }, [sessionKey])
  if (!tiles) return null
  return <div aria-hidden="true" className="pointer-events-none absolute right-3 top-9 h-20 w-24 overflow-hidden">
    {Array.from({ length: tiles }, (_, index) => {
      const column = index % 5
      const row = Math.floor(index / 5)
      const color = ['#e9eaff', '#fff0e7', '#dff7ef', '#f7e8ff'][index % 4]
      return <i key={index} className={drop ? 'overview-tile' : 'overview-tile overview-tile--still'} style={{ backgroundColor: color, right: `${6 + column * 13}px`, bottom: `${4 + row * 9}px`, '--tile-rotation': `${((index * 17) % 18) - 9}deg`, animationDelay: `${index * 24}ms` }} />
    })}
    {count > 30 && <span className="absolute bottom-1 left-1 rounded-full border border-ink bg-white px-1.5 py-0.5 text-[10px] font-extrabold">+{count - 30}</span>}
  </div>
}

function MetricBox({ config, data, brandName }) {
  const published = Number(data?.published || 0)
  const drafts = Number(data?.drafts || 0)
  const display = useCountUp(published, `orb:overview:count:${brandName}:${config.key}`)
  const [badge, dismissBadge] = useMilestoneBadge(brandName, config.key, published, config.milestones, config.noun, config.nouns)
  const next = config.milestones.find((milestone) => milestone > published)
  const previous = [...config.milestones].reverse().find((milestone) => milestone <= published) || 0
  const progress = next ? Math.max(0, Math.min(100, ((published - previous) / (next - previous)) * 100)) : 100
  if (published === 0) return <section className="relative min-h-44 rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><p className="text-xs font-extrabold uppercase tracking-widest text-ink">{config.label}</p><Link to={config.createTo} className="mt-5 flex rounded-lg border-2 border-dashed border-ink/35 px-4 py-5 text-sm font-extrabold transition hover:border-primary hover:text-primary">Add your first {config.noun} <span className="ml-1">→</span></Link></section>
  return <section className="relative min-h-44 overflow-hidden rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><Link to={config.listTo} aria-label={`Open ${config.label}`} className="absolute inset-0 z-0" /><div className="relative z-10 pointer-events-none"><p className="text-xs font-extrabold uppercase tracking-widest text-ink">{config.label}</p><strong className="mt-4 block text-4xl font-extrabold tracking-tight">{display}</strong>{next && <><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs font-bold text-muted">{next - published} more to {next}</p></>}</div><TilePile count={published} sessionKey={`orb:overview:tiles:${brandName}:${config.key}`} />{drafts > 0 && <Link to={config.draftTo} className="absolute bottom-4 left-5 z-20 rounded-full border border-ink/20 bg-white px-2 py-1 text-[11px] font-extrabold hover:border-primary hover:text-primary">+{drafts} draft{drafts === 1 ? '' : 's'}</Link>}{badge && <div className="absolute right-3 top-3 z-20 flex max-w-40 items-center gap-1 rounded-md border border-ink bg-white px-2 py-1.5 text-[10px] font-extrabold shadow-sm"><span>{badge.message}</span><button type="button" aria-label="Dismiss milestone" onClick={dismissBadge} className="rounded p-0.5 hover:bg-ink/5"><X size={12} /></button></div>}</section>
}

function InlineBlockError({ label, onRetry }) {
  return <section className="rounded-xl border-2 border-ink bg-white p-4 shadow-brutal"><p className="text-sm font-extrabold">Could not load {label}</p><Button size="sm" variant="outline" className="mt-3" onClick={onRetry}><RefreshCw size={14} />Retry</Button></section>
}

function MetricGrid({ counts, brandName, status, onRetry }) {
  if (status === 'loading') return <section className="grid gap-5 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-44" />)}</section>
  if (status === 'error') return <InlineBlockError label="knowledge metrics" onRetry={onRetry} />
  return <section className="grid gap-5 md:grid-cols-3">{METRIC_CONFIG.map((config) => <MetricBox key={config.key} config={config} data={counts?.[config.key]} brandName={brandName} />)}</section>
}

function useProductDrop(brandName, count) {
  const [drop, setDrop] = useState(false)
  useEffect(() => {
    setDrop(false)
    if (!count || hasReducedMotion()) return undefined
    const frame = window.requestAnimationFrame(() => setDrop(true))
    return () => window.cancelAnimationFrame(frame)
  }, [brandName, count])
  return drop
}

function removeWhiteImageCanvas(image) {
  const maxSize = 900
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return ''
  context.drawImage(image, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height)
  const { data } = pixels
  const total = width * height
  const seen = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const isWhiteCanvas = (index) => {
    const offset = index * 4
    return data[offset + 3] > 12 && data[offset] > 240 && data[offset + 1] > 240 && data[offset + 2] > 240
  }
  const add = (index) => {
    if (seen[index] || !isWhiteCanvas(index)) return
    seen[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x += 1) {
    add(x)
    add((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(y * width)
    add(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    data[index * 4 + 3] = 0
    if (x) add(index - 1)
    if (x < width - 1) add(index + 1)
    if (y) add(index - width)
    if (y < height - 1) add(index + width)
  }
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

function ProductImage({ product, onUnavailable, onReady }) {
  const [failed, setFailed] = useState(false)
  const [source, setSource] = useState(product.imageUrl)
  const [withoutCors, setWithoutCors] = useState(false)
  const processed = useRef(false)
  useEffect(() => {
    setFailed(false)
    setSource(product.imageUrl)
    setWithoutCors(false)
    processed.current = false
  }, [product.id, product.imageUrl])
  if (!product.imageUrl || failed) return null
  const cleanBackground = (event) => {
    onReady()
    if (processed.current) return
    processed.current = true
    try {
      const cleaned = removeWhiteImageCanvas(event.currentTarget)
      if (cleaned) setSource(cleaned)
    } catch {
      // A non-CORS image can still render normally; it simply keeps its source canvas.
    }
  }
  const handleImageError = () => {
    // Keep valid non-CORS product images visible. They cannot be processed by
    // canvas, but still fall back to the normal image instead of disappearing.
    if (!withoutCors) {
      setWithoutCors(true)
      return
    }
    setFailed(true)
    onUnavailable(product.id)
  }
  return <img key={`${source}:${withoutCors ? 'plain' : 'cors'}`} crossOrigin={withoutCors ? undefined : 'anonymous'} src={source} alt="" onLoad={cleanBackground} onError={handleImageError} className="aspect-square w-full object-contain" />
}

function ProductCard({ product, index, drop, onUnavailable }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(false), [product.id, product.imageUrl])
  const style = { '--product-tilt': `${[-3, -1, 1, 3][index % 4]}deg`, '--wave-y': `${[18, 0, 20, 5][index % 4]}px`, '--float-delay': `${index * -0.8}s`, animationDelay: `${index * 90}ms` }
  const className = `overview-product-card ${drop && ready ? 'overview-product-card--drop' : ''} relative`
  const content = <span className="overview-product-art"><ProductImage product={product} onUnavailable={onUnavailable} onReady={() => setReady(true)} /></span>
  if (product.productUrl) return <a href={product.productUrl} target="_blank" rel="noreferrer" aria-label={`Open ${product.title || 'product'} on the store`} className={className} style={style}>{content}</a>
  return <Link to={`/app/products?product=${encodeURIComponent(product.id)}`} aria-label={`Open ${product.title || 'product'}`} className={className} style={style}>{content}</Link>
}

function ProductBlock({ products, productError, loading, brandName, onRetry }) {
  const [unavailableImageIds, setUnavailableImageIds] = useState([])
  const selected = useMemo(() => {
    const items = (products || []).filter((product) => product.imageUrl && !unavailableImageIds.includes(product.id))
    const hasBestSellers = items.some((product) => product.bestSellerScore !== null && product.bestSellerScore !== undefined)
    return items.sort((a, b) => {
      if (hasBestSellers) return Number(b.bestSellerScore || 0) - Number(a.bestSellerScore || 0)
      return String(b.newestAt || '').localeCompare(String(a.newestAt || ''))
    }).slice(0, 4)
  }, [products, unavailableImageIds])
  const drop = useProductDrop(brandName, selected.length)
  const hideUnavailableProduct = (id) => setUnavailableImageIds((current) => (current.includes(id) ? current : [...current, id]))
  if (loading) return <section aria-label="Loading featured products" className="overview-product-wave">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="overview-product-skeleton" />)}</section>
  if (productError) return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><p className="font-extrabold">Could not load products</p><Button size="sm" variant="outline" className="mt-4" onClick={onRetry}><RefreshCw size={14} />Retry</Button></section>
  if (!selected.length) return null
  return <section aria-label="Featured products" className="overview-product-wave">{selected.map((product, index) => <ProductCard key={product.id} product={product} index={index} drop={drop} onUnavailable={hideUnavailableProduct} />)}</section>
}

const DAY = 86_400_000
const expiryDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) date.setHours(23, 59, 59, 999)
  return date
}
const countdown = (value, now) => {
  const date = expiryDate(value)
  if (!date) return { label: 'no expiry', urgent: false, expired: false }
  if (date.getTime() < now) return { label: 'expired', urgent: false, expired: true }
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  if (date.getTime() <= endOfToday.getTime()) return { label: 'expires today', urgent: true, expired: false }
  const days = Math.ceil((date.getTime() - endOfToday.getTime()) / DAY)
  return { label: `expires in ${days} day${days === 1 ? '' : 's'}`, urgent: days <= 3, expired: false }
}

const formatDaysAgo = (dateValue) => {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

function InventoryProducts({ products = [], status, onRetry, near = false }) {
  if (status === 'loading') {
    return (
      <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-5 h-12" />
        <Skeleton className="mt-3 h-12" />
      </section>
    )
  }
  if (status === 'error') {
    return <InlineBlockError label={near ? 'near out of stock products' : 'out of stock products'} onRetry={onRetry} />
  }

  // Filter for active products that are currently out of stock
  const outOfStockItems = (products || []).filter((product) => {
    const isActive = String(product?.status || 'active').toLowerCase() === 'active'
    if (!isActive) return false
    return near ? Number(product.variantCount || 0) > 0 && Number(product.totalInventory) > 0 && Number(product.totalInventory) < 7 : Boolean(product.isOutOfStock)
  })

  return (
    <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
            {near ? 'Near out of stock' : 'Out of stock products'}
          </p>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-600 border border-rose-200">
            {outOfStockItems.length}
          </span>
        </div>
        <Link to="/app/products" className="text-xs font-extrabold text-primary hover:underline">
          View catalog
        </Link>
      </div>

      {outOfStockItems.length > 0 ? (
        <div className="mt-3 divide-y divide-ink/10">
          {outOfStockItems.slice(0, 5).map((item) => {
            const timeAgo = formatDaysAgo(item.outOfStockSince)
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex items-center gap-3">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover bg-slate-50"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                      <PackageX size={18} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-ink">
                      {item.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      {item.price && <span>{item.price}</span>}
                      {timeAgo && (
                        <>
                          <span>•</span>
                          <span className="text-rose-600 font-semibold">
                            {near ? `${item.totalInventory} left` : `Out of stock: ${timeAgo}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <Link
                  to={`/app/products?product=${encodeURIComponent(item.id)}`}
                  className="shrink-0 text-xs font-bold text-slate-500 hover:text-primary transition"
                  title="Inspect product"
                >
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-muted">
          <Check size={17} className="text-emerald-600" />
          {near ? 'No active product has fewer than 7 items left.' : 'All active products have available inventory.'}
        </div>
      )}
    </section>
  )
}

function TrackedVariantMetafield({ brandName }) {
  const [state, setState] = useState({ loading: true, error: '', data: null, tracked: null })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const load = async () => {
      let tracked = null
      try { tracked = JSON.parse(window.localStorage.getItem(`orb:variant-metafield-tracker:${String(brandName || '').toLowerCase()}`) || 'null') } catch {}
      if (!tracked?.field) { if (active) setState({ loading: false, error: '', data: null, tracked: null }); return }
      try {
        const data = await getShopifyVariantMetafieldTracker({ brandName })
        if (active) setState({ loading: false, error: '', data, tracked })
      } catch (error) { if (active) setState({ loading: false, error: error.message || 'Could not load tracked metafield.', data: null, tracked }) }
    }
    load(); return () => { active = false }
  }, [brandName, retry])
  if (state.loading) return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><Skeleton className="h-5 w-52" /><Skeleton className="mt-4 h-10" /></section>
  if (!state.tracked) return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Tracked variant metafield</p><p className="mt-3 text-sm text-muted">Choose a variant metafield to track in Products, then add this block to see it here.</p><Link to="/app/products" className="mt-3 inline-flex text-sm font-extrabold text-primary hover:underline">Configure tracker</Link></section>
  if (state.error) return <InlineBlockError label="tracked variant metafield" onRetry={() => setRetry((value) => value + 1)} />
  const definition = state.data?.definitions?.find((field) => `${field.namespace}.${field.key}` === state.tracked.field)
  const matches = (state.data?.variants || []).filter((variant) => state.tracked.mode === 'nonempty' ? Boolean(String(variant.values?.[state.tracked.field] || '').trim()) : ['true', '1', 'yes'].includes(String(variant.values?.[state.tracked.field] || '').trim().toLowerCase()))
  return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Tracked variant metafield</p><h2 className="mt-1 text-lg font-extrabold">{definition?.name || state.tracked.field}</h2></div><Link to="/app/products" className="text-xs font-extrabold text-primary hover:underline">Manage</Link></div><p className="mt-1 text-xs text-muted">{state.tracked.mode === 'nonempty' ? 'Variants with a value' : 'Variants marked true'} · {matches.length} found</p>{matches.length ? <div className="mt-3 divide-y divide-ink/10">{matches.slice(0, 5).map((variant) => <div key={variant.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-bold">{variant.product_title}</p><p className="truncate text-xs text-muted">{variant.title}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-700">{variant.values?.[state.tracked.field]}</span></div>)}</div> : <p className="mt-4 text-sm text-muted">No variants match this rule.</p>}</section>
}

const OVERVIEW_BLOCK_OPTIONS = [
  { id: 'flows', label: 'Flows', description: 'Published and draft flow count.' },
  { id: 'out_of_stock', label: 'Out of stock products', description: 'Active products with no inventory.' },
  { id: 'near_out_of_stock', label: 'Near out of stock products', description: 'Active products with fewer than 7 items left.' },
  { id: 'operations', label: 'Active operations', description: 'Offers, notices, and restock updates currently used by the agent.' },
  { id: 'faqs', label: 'FAQs', description: 'Published FAQ count and drafts.' },
  { id: 'sops', label: 'SOPs', description: 'Published SOP count and drafts.' },
  { id: 'tracked_variant_metafield', label: 'Tracked variant metafield', description: 'The Shopify variant metafield selected in Products.' },
]

function OverviewBlockCustomizer({ blocks, onChange, saving }) {
  return <details className="absolute right-0 top-0 z-20"><summary aria-label="Customize overview blocks" title="Customize overview blocks" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-ink/15 bg-white text-ink shadow-sm transition hover:border-primary hover:text-primary"><SlidersHorizontal size={16} /></summary><div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-ink/15 bg-white p-3 shadow-lg"><p className="text-xs leading-5 text-muted">Choose which blocks appear for this brand.</p><div className="mt-3 grid gap-2">{OVERVIEW_BLOCK_OPTIONS.map((option) => <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-ink/10 p-2.5 hover:border-primary/40"><input type="checkbox" checked={blocks.includes(option.id)} onChange={(event) => onChange(option.id, event.target.checked)} disabled={saving} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block text-sm font-bold">{option.label}</span><span className="mt-0.5 block text-xs leading-4 text-muted">{option.description}</span></span></label>)}</div>{saving ? <p className="mt-3 text-xs font-bold text-muted">Saving layout…</p> : null}</div></details>
}

function DailySlackReportControl({ brandId, brandName }) {
  const { showToast } = useToast()
  const [report, setReport] = useState({ enabled: false, hour: 9, timezone: 'Asia/Kolkata' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  useEffect(() => { let active = true; getDailySlackReport(brandId).then((next) => { if (active) setReport(next) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [brandId])
  const update = async (patch) => { const next = { ...report, ...patch }; setReport(next); setSaving(true); try { await saveDailySlackReport(brandId, next) } catch (error) { setReport(report); showToast(error.message || 'Could not save daily report settings.', 'error') } finally { setSaving(false) } }
  const sendTest = async () => { setSending(true); try { await sendDailySlackReport(brandName); showToast('Daily report sent to the configured Slack channel.') } catch (error) { showToast(error.message || 'Could not send the daily report.', 'error') } finally { setSending(false) } }
  return <section className="mt-4 rounded-lg border border-ink/15 bg-white/80 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold">Daily Slack report</p><p className="mt-0.5 text-xs text-muted">Out of stock, low stock, active operations, and the tracked variant metafield.</p></div><label className="inline-flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={report.enabled} onChange={(event) => update({ enabled: event.target.checked })} disabled={loading || saving} className="h-4 w-4 accent-primary" />Enabled</label></div>{report.enabled && <div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-xs font-bold">Send at <select value={report.hour} onChange={(event) => update({ hour: Number(event.target.value) })} className="ml-1 rounded border border-ink/20 bg-white px-2 py-1 text-sm">{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select> IST</label><Button size="sm" variant="outline" onClick={sendTest} disabled={sending}>{sending ? 'Sending…' : 'Send test report'}</Button><span className="text-[11px] text-muted">Railway cron must call the daily-report endpoint at this time.</span></div>}</section>
}

function MastersheetBanner({ brandName }) {
  const [liveUrl, setLiveUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const fetchUrl = async () => {
      setLoading(true)
      try {
        const url = await getBrandMastersheetUrl(brandName)
        if (active) setLiveUrl(url)
      } catch {
        if (active) setLiveUrl(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchUrl()
    const handleUpdate = (e) => {
      // Only react if event is for this brand or general update
      if (!e.detail?.brandName || e.detail.brandName.toLowerCase() === (brandName || '').toLowerCase()) {
        if (e.detail?.url !== undefined) setLiveUrl(e.detail.url)
        else fetchUrl()
      }
    }
    window.addEventListener('orb:mastersheet-updated', handleUpdate)
    return () => {
      active = false
      window.removeEventListener('orb:mastersheet-updated', handleUpdate)
    }
  }, [brandName])

  const targetUrl = liveUrl || 'https://docs.google.com/spreadsheets/'
  const isConfigured = Boolean(liveUrl)

  return (
    <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-emerald-50 text-emerald-700 shadow-2xs">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-ink tracking-tight">
                Brand Mastersheet
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                isConfigured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {loading ? 'Checking...' : isConfigured ? 'Vault Configured' : 'Needs Setup'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted max-w-xl">
              {isConfigured
                ? `Central master inventory, operations, and support tracking spreadsheet for ${brandName}.`
                : `Connect ${brandName}'s Google Sheets Mastersheet in Tools to link live inventory and orders.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {!isConfigured && (
            <Link
              to="/app/tools"
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-white px-3 py-2 text-xs font-bold text-ink shadow-brutal hover:bg-slate-50 transition"
            >
              <span>Configure in Tools</span>
            </Link>
          )}
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive-brutal inline-flex items-center gap-2 rounded-md border-2 border-ink bg-emerald-100 px-4 py-2.5 text-xs font-bold text-emerald-950 shadow-brutal hover:bg-emerald-200 transition"
          >
            <span>Open Mastersheet</span>
            <ExternalLink size={14} className="text-emerald-800" />
          </a>
        </div>
      </div>
    </section>
  )
}

function ExtendOperationModal({ operation, onClose, onSaved }) {
  const { showToast } = useToast()
  const [value, setValue] = useState(() => operation?.expiresAt ? String(operation.expiresAt).slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(operation?.expiresAt ? String(operation.expiresAt).slice(0, 10) : ''), [operation])
  const submit = async (event) => {
    event.preventDefault()
    if (!value) return
    setSaving(true)
    try {
      const result = await extendOperation(operation.id, new Date(`${value}T23:59:59`).toISOString())
      onSaved(result.expires_at)
      showToast('Operation extended.')
      onClose()
    } catch (error) { showToast(error.message || 'Could not extend this operation.', 'error') } finally { setSaving(false) }
  }
  return <Modal open={Boolean(operation)} onClose={onClose} title="Extend operation"><form onSubmit={submit} className="grid gap-4"><p className="text-sm text-muted">Choose the new date until which the agent should use this update.</p><label className="grid gap-1.5 text-sm font-bold">New expiry date<input required type="date" value={value} onChange={(event) => setValue(event.target.value)} className="rounded-md border border-ink/20 px-3 py-2 font-normal outline-none focus:border-primary" /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="purple" size="sm" disabled={saving || !value}>{saving ? 'Extending…' : 'Extend'}</Button></div></form></Modal>
}

function ActiveOperations({ operations, now, isAdmin, onExtended, status, onRetry }) {
  const [extending, setExtending] = useState(null)
  if (status === 'loading') return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><Skeleton className="h-5 w-32" /><Skeleton className="mt-5 h-16" /><Skeleton className="mt-3 h-16" /></section>
  if (status === 'error') return <InlineBlockError label="operations" onRetry={onRetry} />
  const sorted = [...(operations || [])].sort((a, b) => {
    const first = expiryDate(a.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY
    const second = expiryDate(b.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY
    return first - second
  })
  const active = sorted.filter((operation) => !countdown(operation.expiresAt, now).expired).slice(0, 5)
  const expired = sorted.filter((operation) => countdown(operation.expiresAt, now).expired)
  return <><section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Active operations</p><Link to="/app/operations" className="text-xs font-extrabold text-primary hover:underline">View all</Link></div>{active.length ? <div className="mt-3 divide-y divide-ink/10">{active.map((operation) => { const state = countdown(operation.expiresAt, now); return <article key={operation.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{operation.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold"><span className="rounded-full border border-ink/15 px-2 py-0.5 capitalize">{operation.kind || 'notice'}</span><span className={state.urgent ? 'text-primary' : 'text-muted'}>{state.label}</span></div></div>{isAdmin && <button type="button" onClick={() => setExtending(operation)} className="shrink-0 text-xs font-extrabold text-primary hover:underline">Extend</button>}</div><p className="mt-2 text-xs leading-5 text-muted">{operation.agentBehaviour || 'The agent uses this update while it is active.'}</p></article> })}</div> : <p className="mt-5 text-sm leading-6 text-muted">No active operations. Add an offer or restock date so the agent can use it.</p>}{expired.length > 0 && <details className="mt-4 border-t border-ink/10 pt-3"><summary className="cursor-pointer text-xs font-extrabold text-muted">Recently expired ({expired.length})</summary><div className="mt-2 divide-y divide-ink/10">{expired.map((operation) => <div key={operation.id} className="py-2"><p className="text-sm font-bold text-muted">{operation.title}</p><p className="mt-1 text-xs text-muted">No longer used by the agent.</p></div>)}</div></details>}</section><ExtendOperationModal operation={extending} onClose={() => setExtending(null)} onSaved={(newExpiresAt) => onExtended(extending.id, newExpiresAt)} /></>
}

function deriveSetupSteps(overview) {
  const counts = overview.counts || {}
  const sops = counts.sops || {}
  const faqs = counts.faqs || {}
  const flows = counts.flows || {}
  const draftsAndPublished = [sops, faqs, flows].reduce((total, item) => total + Number(item.drafts || 0) + Number(item.published || 0), 0)
  const steps = [
    { key: 'source', label: 'Add a knowledge source', why: 'Give Orb reliable material to learn from.', done: Number(overview.flags?.sourceCount || 0) > 0, to: '/app/workspace?tab=source' },
    { key: 'generate', label: 'Generate your first drafts', why: 'Turn your source into editable customer knowledge.', done: draftsAndPublished > 0, to: '/app/workspace?tab=source' },
    { key: 'review', label: 'Review a draft', why: 'Check that the response is accurate and on-brand.', done: Number(sops.approved || 0) + Number(faqs.approved || 0) > 0, to: '/app/brain?tab=sops&status=draft' },
    { key: 'publish', label: 'Publish your first SOP or FAQ', why: 'Make approved knowledge available to the agent.', done: Number(sops.published || 0) + Number(faqs.published || 0) > 0, to: '/app/brain?tab=sops' },
    { key: 'flow', label: 'Create your first flow', why: 'Document the decisions your team repeats most often.', done: Number(flows.published || 0) + Number(flows.drafts || 0) > 0, to: '/app/flows?create=1' },
  ]
  if (overview.brand?.platform === 'shopify' && !overview.brand?.shopifyConnected) steps.push({ key: 'shopify', label: 'Connect Shopify', why: 'Keep products and availability current for the agent.', done: false, to: '/app/tools' })
  return steps
}

function SpringCheck({ animated }) {
  return <svg className={`setup-check ${animated ? 'setup-check--draw' : ''}`} viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 3.5 3.5L16 5.8" /></svg>
}

function SetupChecklist({ steps = [], large = false }) {
  const previous = useRef(null)
  const [drawn, setDrawn] = useState({})
  useEffect(() => {
    if (!previous.current) { previous.current = Object.fromEntries(steps.map((step) => [step.key, step.done])); return undefined }
    const next = {}
    steps.forEach((step) => { if (!previous.current[step.key] && step.done) next[step.key] = true })
    previous.current = Object.fromEntries(steps.map((step) => [step.key, step.done]))
    if (!Object.keys(next).length) return undefined
    setDrawn(next)
    const timer = window.setTimeout(() => setDrawn({}), 700)
    return () => window.clearTimeout(timer)
  }, [steps])
  const firstIncomplete = steps.find((step) => !step.done)?.key
  return <section className={`${large ? 'mt-8 p-7 sm:p-9' : 'p-5'} rounded-xl border-2 border-ink bg-white shadow-brutal`}><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Next steps</p><h2 className={`${large ? 'mt-2 text-2xl' : 'mt-1 text-lg'} font-extrabold`}>{large ? 'Set up your support workspace' : 'Finish setting up Orb'}</h2><div className="mt-5 grid gap-2">{steps.map((step) => <Link key={step.key} to={step.to} className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition hover:border-primary/50 ${!step.done && step.key === firstIncomplete ? 'border-primary bg-primary-tint/35' : 'border-ink/10 bg-white'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${step.done ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-ink/25 text-muted'}`}>{step.done ? <SpringCheck animated={Boolean(drawn[step.key])} /> : <span className="text-xs font-extrabold">{steps.indexOf(step) + 1}</span>}</span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{step.label}</span><span className="mt-0.5 block text-xs leading-5 text-muted">{step.why}</span></span><ArrowUpRight size={16} className="shrink-0 text-muted" /></Link>)}</div></section>
}

function NewBrandSetup({ steps }) {
  return <section className="mt-8 rounded-2xl border border-ink/15 bg-white p-8 shadow-sm sm:p-10"><div className="max-w-2xl"><span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-tint text-primary"><Sparkles size={22} /></span><h2 className="mt-5 text-2xl font-extrabold tracking-tight">Start building your agent's brain</h2><p className="mt-2 text-sm leading-6 text-muted">Add a website, document, or product source. Orb will turn it into support knowledge your team can review.</p><Link to="/app/workspace?tab=source" className="mt-6 inline-flex"><Button variant="purple"><Plus size={16} />Add your first source</Button></Link></div><SetupChecklist steps={steps} large /></section>
}

function BrandOverview({ overview, onRetry }) {
  const { isAdmin } = useAuth()
  const totalDrafts = Object.values(overview.counts || {}).reduce((total, item) => total + Number(item?.drafts || 0), 0)
  const sourceCount = Number(overview.flags?.sourceCount || 0)
  const isNewBrand = (overview.blockStatus?.metrics || 'ready') === 'ready' && sourceCount === 0 && totalDrafts === 0 && Object.values(overview.counts || {}).every((item) => Number(item?.published || 0) === 0)
  const brandName = overview.brand?.name || 'Your brand'
  const setupSteps = useMemo(() => deriveSetupSteps(overview), [overview])
  const setupComplete = setupSteps.every((step) => step.done)
  const setupStorageKey = `orb:overview:setup-completed:${brandName}`
  const sessionKey = `orb:overview-welcome:${brandName}`
  const [welcome, setWelcome] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [operations, setOperations] = useState(overview.operations || [])
  const [setupHidden, setSetupHidden] = useState(false)
  const [setupCelebrating, setSetupCelebrating] = useState(false)
  const [blocks, setBlocks] = useState(DEFAULT_OVERVIEW_BLOCKS)
  const [savingBlocks, setSavingBlocks] = useState(false)
  const { showToast } = useToast()
  const brandId = overview.brand?.id || activeBrandId()

  useEffect(() => {
    const saved = window.sessionStorage.getItem(sessionKey)
    if (saved) { setWelcome(saved); return }
    const selected = WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)]
    window.sessionStorage.setItem(sessionKey, selected)
    setWelcome(selected)
  }, [sessionKey])

  useEffect(() => { setOperations(overview.operations || []) }, [overview.operations])
  useEffect(() => {
    let active = true
    getOverviewBlocks(brandId, brandName).then((next) => { if (active) setBlocks(next) }).catch(() => { if (active) setBlocks(DEFAULT_OVERVIEW_BLOCKS) })
    return () => { active = false }
  }, [brandId, brandName])
  useEffect(() => {
    if (window.localStorage.getItem(setupStorageKey)) { setSetupHidden(true); setSetupCelebrating(false); return undefined }
    if (!setupComplete) { setSetupHidden(false); setSetupCelebrating(false); return undefined }
    setSetupCelebrating(true)
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(setupStorageKey, new Date().toISOString())
      setSetupHidden(true)
      setSetupCelebrating(false)
    }, 1450)
    return () => window.clearTimeout(timer)
  }, [setupComplete, setupStorageKey])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])
  const extend = (id, newExpiresAt) => setOperations((items) => items.map((operation) => operation.id === id ? { ...operation, expiresAt: newExpiresAt } : operation))
  const updateBlocks = async (block, enabled) => {
    const next = enabled ? [...blocks, block] : blocks.filter((value) => value !== block)
    setBlocks(next); setSavingBlocks(true)
    try { await saveOverviewBlocks(brandId, brandName, next) } catch (error) { setBlocks(blocks); showToast(error.message || 'Could not save this Overview layout.', 'error') } finally { setSavingBlocks(false) }
  }
  const flowConfig = METRIC_CONFIG.find((config) => config.key === 'flows')
  const optionalMetric = (key) => METRIC_CONFIG.find((config) => config.key === key)

  return <div className="mx-auto max-w-6xl"><header className="overview-welcome"><p className="text-xs font-extrabold uppercase tracking-widest text-primary">{brandName}</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome, {overview.user?.firstName || 'there'}</h1><p className="mt-3 text-sm text-muted">{totalDrafts > 0 ? `${totalDrafts} draft${totalDrafts === 1 ? '' : 's'} are waiting for you.` : welcome}</p>{!isNewBrand && <ProductBlock products={overview.products} productError={overview.blockErrors?.products || overview.productError} loading={overview.blockStatus?.products === 'loading'} brandName={brandName} onRetry={onRetry} />}{isAdmin && <><OverviewBlockCustomizer blocks={blocks} onChange={updateBlocks} saving={savingBlocks} /><DailySlackReportControl brandId={brandId} brandName={brandName} /></>}</header>
    {isNewBrand ? <NewBrandSetup steps={setupSteps} /> : <main className="mt-8 grid gap-5">
      <MastersheetBanner brandName={brandName} />
      <div className="grid gap-5 lg:grid-cols-2">
        {blocks.includes('flows') && <MetricBox config={flowConfig} data={overview.counts?.flows} brandName={brandName} />}
        {blocks.includes('out_of_stock') && <InventoryProducts products={overview.products} status={overview.blockStatus?.products} onRetry={onRetry} />}
        {blocks.includes('near_out_of_stock') && <InventoryProducts near products={overview.products} status={overview.blockStatus?.products} onRetry={onRetry} />}
        {blocks.includes('operations') && <ActiveOperations operations={operations} now={now} isAdmin={isAdmin} onExtended={extend} status={overview.blockStatus?.operations} onRetry={onRetry} />}
        {blocks.includes('faqs') && <MetricBox config={optionalMetric('faqs')} data={overview.counts?.faqs} brandName={brandName} />}
        {blocks.includes('sops') && <MetricBox config={optionalMetric('sops')} data={overview.counts?.sops} brandName={brandName} />}
        {blocks.includes('tracked_variant_metafield') && <TrackedVariantMetafield brandName={brandName} />}
      </div>
    </main>}
  </div>
}

export default function Overview() {
  const { data, loading, error, reload } = useOverview()
  const [devState, setDevState] = useState('live')
  const overview = useMemo(() => devState === 'live' ? data : DEV_STATES[devState], [data, devState])
  if (loading && !overview) return <div className="mx-auto grid max-w-6xl gap-5"><Skeleton className="h-28" /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-64" />)}</section><Skeleton className="h-48" /></div>
  if (error && !overview) return <EmptyState title="Could not load this brand overview." action="Retry" onAction={reload} />
  return <>{import.meta.env.DEV && <label className="mb-5 flex w-fit items-center gap-2 rounded-lg border border-dashed border-ink/20 bg-white/70 px-3 py-2 text-xs font-bold text-muted">Preview state <select value={devState} onChange={(event) => setDevState(event.target.value)} className="bg-transparent text-ink outline-none"><option value="live">Live data</option><option value="new">New brand</option><option value="partial">Partial setup</option><option value="complete">Complete setup</option><option value="nonShopify">Non-Shopify brand</option></select></label>}{overview && <BrandOverview overview={overview} onRetry={reload} />}</>
}
