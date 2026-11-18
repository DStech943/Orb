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
import { useOverview } from '../services/overview'
import ClientOverview from '../components/overview/ClientOverview'
import AgentHome from '../components/overview/AgentHome'
import Panel from '../components/ui/Panel'
import { activeBrandId, extendOperation, getBrandMastersheetUrl, getShopifyVariantMetafieldTracker } from '../services/orbApi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/ui/Modal'
import { DEFAULT_OVERVIEW_BLOCKS, getOverviewBlocks, saveOverviewBlocks } from '../services/overviewBlocks'

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
  const [modalOpen, setModalOpen] = useState(false)

  if (status === 'loading') {
    return (
      <section className="rounded-card border border-line bg-white p-4 shadow-card">
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

  const visibleItems = outOfStockItems.slice(0, 3)
  const hasMore = outOfStockItems.length > 3

  return (
    <>
      <Panel
        title={near ? 'Near out of stock' : 'Out of stock products'}
        count={outOfStockItems.length}
        countTone={outOfStockItems.length ? (near ? 'warning' : 'danger') : 'success'}
        action={{ to: '/app/products', label: 'View catalog' }}
      >

        {outOfStockItems.length > 0 ? (
          <>
            <div className="mt-3 divide-y divide-line">
              {visibleItems.map((item) => {
                const timeAgo = formatDaysAgo(item.outOfStockSince)
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex items-center gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover bg-canvas"
                        />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-subtle text-fg-muted">
                          <PackageX size={18} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
                          {item.price && <span>{item.price}</span>}
                          {timeAgo && (
                            <>
                              <span>•</span>
                              <span className="text-danger font-semibold">
                                {near ? `${item.totalInventory} left` : `Out of stock: ${timeAgo}`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <Link
                      to={`/app/products?product=${encodeURIComponent(item.id)}`}
                      className="shrink-0 text-xs font-medium text-fg-muted hover:text-primary transition"
                      title="Inspect product"
                    >
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-3 w-full rounded-lg border border-line bg-canvas py-2 text-center text-xs font-medium text-ink hover:bg-subtle hover:border-primary/40 transition"
              >
                View all {outOfStockItems.length} {near ? 'near out of stock' : 'out of stock'} products →
              </button>
            )}
          </>
        ) : (
          <div className="mt-5 flex items-center gap-2 text-sm font-medium text-fg-muted">
            <Check size={17} className="text-success" />
            {near ? 'No active product has fewer than 7 items left.' : 'All active products have available inventory.'}
          </div>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={near ? `Near out of stock products (${outOfStockItems.length})` : `Out of stock products (${outOfStockItems.length})`}
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1 divide-y divide-line">
          {outOfStockItems.map((item) => {
            const timeAgo = formatDaysAgo(item.outOfStockSince)
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex items-center gap-3">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover bg-canvas"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-subtle text-fg-muted">
                      <PackageX size={18} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {item.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
                      {item.price && <span>{item.price}</span>}
                      {timeAgo && (
                        <>
                          <span>•</span>
                          <span className="text-danger font-semibold">
                            {near ? `${item.totalInventory} left` : `Out of stock: ${timeAgo}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <Link
                  to={`/app/products?product=${encodeURIComponent(item.id)}`}
                  onClick={() => setModalOpen(false)}
                  className="shrink-0 text-xs font-medium text-primary hover:underline flex items-center gap-1"
                  title="Inspect product"
                >
                  <span>Inspect</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            )
          })}
        </div>
      </Modal>
    </>
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
  { id: 'out_of_stock', label: 'Out of stock products', description: 'Active products with no inventory.' },
  { id: 'near_out_of_stock', label: 'Near out of stock products', description: 'Active products with fewer than 7 items left.' },
  { id: 'operations', label: 'Active operations', description: 'Offers, notices, and restock updates currently used by the agent.' },
]

function OverviewBlockCustomizer({ blocks, onChange, saving }) {
  return <details className="absolute right-0 top-0 z-20"><summary aria-label="Customize overview blocks" title="Customize overview blocks" className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-ink/10 bg-white/60 text-ink/30 shadow-sm transition hover:border-primary/40 hover:text-primary hover:bg-white"><SlidersHorizontal size={13} /></summary><div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-ink/15 bg-white p-3 shadow-lg"><p className="text-xs leading-5 text-muted">Choose which blocks appear for this brand.</p><div className="mt-3 grid gap-2">{OVERVIEW_BLOCK_OPTIONS.map((option) => <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-ink/10 p-2.5 hover:border-primary/40"><input type="checkbox" checked={blocks.includes(option.id)} onChange={(event) => onChange(option.id, event.target.checked)} disabled={saving} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block text-sm font-bold">{option.label}</span><span className="mt-0.5 block text-xs leading-4 text-muted">{option.description}</span></span></label>)}</div>{saving ? <p className="mt-3 text-xs font-bold text-muted">Saving layout…</p> : null}</div></details>
}

function MastersheetBanner({ brandName, canConfigure }) {
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
    <section className="rounded-card border border-line bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-success-tint text-success">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-medium text-ink">
                Brand Mastersheet
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
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
          {!isConfigured && canConfigure && (
            <Link
              to="/app/tools"
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line-strong bg-white px-3 text-xs font-medium text-ink shadow-card transition hover:border-primary/40 hover:bg-subtle"
            >
              <span>Configure in Tools</span>
            </Link>
          )}
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-3.5 text-xs font-medium text-white shadow-card transition hover:bg-primary-dark"
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
  if (status === 'loading') return <section className="rounded-card border border-line bg-white p-4 shadow-card"><Skeleton className="h-5 w-32" /><Skeleton className="mt-5 h-16" /><Skeleton className="mt-3 h-16" /></section>
  if (status === 'error') return <InlineBlockError label="operations" onRetry={onRetry} />
  const sorted = [...(operations || [])].sort((a, b) => {
    const first = expiryDate(a.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY
    const second = expiryDate(b.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY
    return first - second
  })
  const active = sorted.filter((operation) => !countdown(operation.expiresAt, now).expired).slice(0, 5)
  const expired = sorted.filter((operation) => countdown(operation.expiresAt, now).expired)
  return <><Panel title="Active operations" count={active.length} countTone={active.length ? 'success' : 'neutral'} action={isAdmin ? { to: '/app/operations', label: 'View all' } : undefined}>{active.length ? <div className="mt-3 divide-y divide-line">{active.map((operation) => { const state = countdown(operation.expiresAt, now); return <article key={operation.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{operation.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium"><span className="rounded-full border border-line px-2 py-0.5 capitalize">{operation.kind || 'notice'}</span><span className={state.urgent ? 'text-primary' : 'text-fg-muted'}>{state.label}</span></div></div>{isAdmin && <button type="button" onClick={() => setExtending(operation)} className="shrink-0 text-xs font-semibold text-primary hover:underline">Extend</button>}</div><p className="mt-2 text-xs leading-5 text-fg-muted">{operation.agentBehaviour || 'The agent uses this update while it is active.'}</p></article> })}</div> : <p className="mt-5 text-sm leading-6 text-fg-muted">No active operations.</p>}{expired.length > 0 && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-xs font-semibold text-fg-muted">Recently expired ({expired.length})</summary><div className="mt-2 divide-y divide-line">{expired.map((operation) => <div key={operation.id} className="py-2"><p className="text-sm font-medium text-fg-muted">{operation.title}</p><p className="mt-1 text-xs text-fg-muted">No longer used by the agent.</p></div>)}</div></details>}</Panel><ExtendOperationModal operation={extending} onClose={() => setExtending(null)} onSaved={(newExpiresAt) => onExtended(extending.id, newExpiresAt)} /></>
}

function BrandOverview({ overview, onRetry }) {
  const { isAdmin } = useAuth()
  const brandName = overview.brand?.name || 'Your brand'
  const [now, setNow] = useState(() => Date.now())
  const [operations, setOperations] = useState(overview.operations || [])
  const [blocks, setBlocks] = useState(DEFAULT_OVERVIEW_BLOCKS)
  const [savingBlocks, setSavingBlocks] = useState(false)
  const { showToast } = useToast()
  const brandId = overview.brand?.id || activeBrandId()

  useEffect(() => { setOperations(overview.operations || []) }, [overview.operations])
  useEffect(() => {
    let active = true
    getOverviewBlocks(brandId, brandName).then((next) => { if (active) setBlocks(next) }).catch(() => { if (active) setBlocks(DEFAULT_OVERVIEW_BLOCKS) })
    return () => { active = false }
  }, [brandId, brandName])
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
    const hasOperationalBlocks = blocks.some((block) => ['out_of_stock', 'near_out_of_stock', 'operations'].includes(block))

  return <div className="mx-auto w-full max-w-7xl">
    <AgentHome overview={overview} onRetry={onRetry} middle={(
    <section aria-labelledby="business-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="business-title" className="font-display text-lg font-medium">Business <em>snapshot</em></h3>
        {isAdmin && <div className="relative h-7 w-7"><OverviewBlockCustomizer blocks={blocks} onChange={updateBlocks} saving={savingBlocks} /></div>}
      </div>
      <div className="grid gap-5">
        <MastersheetBanner brandName={brandName} canConfigure={isAdmin} />
        {/* Equal-height row: every panel stretches to the tallest, so there is never a blank band between cards. */}
        {hasOperationalBlocks && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {blocks.includes('out_of_stock') && <div className="h-full [&>section]:h-full"><InventoryProducts products={overview.products} status={overview.blockStatus?.products} onRetry={onRetry} /></div>}
          {blocks.includes('near_out_of_stock') && <div className="h-full [&>section]:h-full"><InventoryProducts near products={overview.products} status={overview.blockStatus?.products} onRetry={onRetry} /></div>}
          {blocks.includes('operations') && <div className="h-full [&>section]:h-full"><ActiveOperations operations={operations} now={now} isAdmin={isAdmin} onExtended={extend} status={overview.blockStatus?.operations} onRetry={onRetry} /></div>}
        </div>}
      </div>
    </section>
    )} />
  </div>
}

// The Operations & Knowledge view is the only place that needs the SOP, FAQ, flow and product
// data, so it is loaded here and nowhere else. (It used to load for every visitor, which made
// the client dashboard wait on, and compete with, five requests it never displayed.)
function OpsOverview() {
  const { data: overview, loading, error, reload } = useOverview()

  if (loading && !overview) {
    return (
      <div className="mx-auto grid w-full max-w-7xl gap-5" aria-busy="true">
        <Skeleton className="h-44" />
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-28" />
      </div>
    )
  }

  if (error && !overview) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="We couldn’t load this workspace."
        description="Check your connection and try again."
        action="Try again"
        onAction={reload}
      />
    )
  }

  if (!overview) return null
  return <BrandOverview overview={overview} onRetry={reload} />
}

export default function Overview() {
  const { user } = useAuth()
  const isClient = user?.role === 'client'
  const [adminViewMode, setAdminViewMode] = useState('client') // 'client' or 'ops'

  // Clients always see the client-facing AI Performance & Business Overview, and none of the
  // operations data is fetched for them.
  if (isClient) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <ClientOverview />
      </div>
    )
  }

  // If admin/staff user, allow toggling between the Client Experience and Internal Operations
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary-tint/60 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Sparkles size={14} />
          <span>Staff Workspace View</span>
        </div>
        <div className="flex rounded-control border border-primary/30 bg-white p-0.5 shadow-xs">
          <button
            type="button"
            onClick={() => setAdminViewMode('client')}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
              adminViewMode === 'client' ? 'bg-primary text-white shadow-xs' : 'text-fg-muted hover:text-ink'
            }`}
          >
            Client Portal (Performance & BI)
          </button>
          <button
            type="button"
            onClick={() => setAdminViewMode('ops')}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
              adminViewMode === 'ops' ? 'bg-primary text-white shadow-xs' : 'text-fg-muted hover:text-ink'
            }`}
          >
            Operations & Knowledge
          </button>
        </div>
      </div>

      {adminViewMode === 'client' ? <ClientOverview /> : <OpsOverview />}
    </div>
  )
}
