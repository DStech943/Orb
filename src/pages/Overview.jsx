import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Check, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import { MOCK_STATES, useOverview } from '../services/overview'
import { extendOperation } from '../services/orbApi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'

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

function QuickActions({ overview, now, isAdmin, status, onRetry }) {
  if (status === 'loading') return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><Skeleton className="h-5 w-28" /><Skeleton className="mt-5 h-12" /><Skeleton className="mt-3 h-12" /></section>
  if (status === 'error') return <InlineBlockError label="quick actions" onRetry={onRetry} />
  const drafts = Object.values(overview.counts || {}).reduce((total, item) => total + Number(item?.drafts || 0), 0)
  const approved = Object.values(overview.counts || {}).reduce((total, item) => total + Number(item?.approved || 0), 0)
  const expiring = (overview.operations || []).find((operation) => {
    const state = countdown(operation.expiresAt, now)
    return !state.expired && state.urgent && operation.expiresAt
  })
  const syncedAt = overview.flags?.lastSyncedAt ? new Date(overview.flags.lastSyncedAt) : null
  const daysOld = syncedAt && !Number.isNaN(syncedAt.getTime()) ? Math.floor((now - syncedAt.getTime()) / DAY) : null
  const actions = [
    overview.flags?.failedPages > 0 && isAdmin && { label: `Fix ${overview.flags.failedPages} failed pages`, to: '/app/workspace?tab=source' },
    expiring && isAdmin && { label: `Extend ${expiring.title}`, to: '/app/operations' },
    drafts > 0 && { label: `Review ${drafts} drafts`, to: '/app/brain?tab=sops&status=draft' },
    approved > 0 && isAdmin && { label: `Publish ${approved} approved items`, to: '/app/brain?tab=sops' },
    daysOld !== null && daysOld > 14 && isAdmin && { label: `Re-sync website (${daysOld} days old)`, to: '/app/workspace?tab=source' },
    overview.flags?.sourceCount === 0 && isAdmin && { label: 'Add a source', to: '/app/workspace?tab=source' },
    overview.flags?.sourceCount > 0 && isAdmin && { label: 'Update knowledge source', to: '/app/workspace?tab=source' },
  ].filter(Boolean).slice(0, 4)
  return <section className="rounded-xl border-2 border-ink bg-white p-5 shadow-brutal"><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Quick actions</p>{actions.length ? <div className="mt-3 divide-y divide-ink/10">{actions.map((action) => <Link key={action.label} to={action.to} className="flex items-center justify-between gap-3 py-3 text-sm font-bold transition hover:text-primary"><span>{action.label}</span><ArrowUpRight size={16} className="shrink-0" /></Link>)}</div> : <div className="mt-5 flex items-center gap-2 text-sm font-bold text-muted"><Check size={17} className="text-emerald-600" />Nothing needs attention.</div>}</section>
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

  useEffect(() => {
    const saved = window.sessionStorage.getItem(sessionKey)
    if (saved) { setWelcome(saved); return }
    const selected = WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)]
    window.sessionStorage.setItem(sessionKey, selected)
    setWelcome(selected)
  }, [sessionKey])

  useEffect(() => { setOperations(overview.operations || []) }, [overview.operations])
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

  return <div className="mx-auto max-w-6xl"><header className="overview-welcome"><p className="text-xs font-extrabold uppercase tracking-widest text-primary">{brandName}</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome, {overview.user?.firstName || 'there'}</h1><p className="mt-3 text-sm text-muted">{totalDrafts > 0 ? `${totalDrafts} draft${totalDrafts === 1 ? '' : 's'} are waiting for you.` : welcome}</p>{!isNewBrand && <ProductBlock products={overview.products} productError={overview.blockErrors?.products || overview.productError} loading={overview.blockStatus?.products === 'loading'} brandName={brandName} onRetry={onRetry} />}</header>
    {isNewBrand ? <NewBrandSetup steps={setupSteps} /> : <main className="mt-8 grid gap-5">
      <MetricGrid counts={overview.counts} brandName={brandName} status={overview.blockStatus?.metrics} onRetry={onRetry} />
      <div className="grid gap-5 lg:grid-cols-2"><QuickActions overview={overview} now={now} isAdmin={isAdmin} status={overview.blockStatus?.metrics} onRetry={onRetry} /><ActiveOperations operations={operations} now={now} isAdmin={isAdmin} onExtended={extend} status={overview.blockStatus?.operations} onRetry={onRetry} /></div>
      {!setupHidden && (setupCelebrating ? <section className="rounded-xl border-2 border-ink bg-white p-6 text-center shadow-brutal"><span className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-emerald-500 bg-emerald-50 text-emerald-600"><SpringCheck animated /></span><h2 className="mt-3 text-xl font-extrabold">Setup complete</h2><p className="mt-1 text-sm text-muted">Orb is ready for your team.</p></section> : <SetupChecklist steps={setupSteps} />)}
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
