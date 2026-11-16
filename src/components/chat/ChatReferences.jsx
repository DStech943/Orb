import React, { useEffect, useMemo, useState } from 'react'
import { ClipboardList, FileSpreadsheet, Package, Search, Workflow, X } from 'lucide-react'
import { listProducts } from '../../services/generation'
import { getBrandMastersheetUrl, listFlows, listMessageTemplates, listOperationalUpdates, searchShopifyOrders } from '../../services/orbApi'

const COMMANDS = [
  { id: 'products', label: '/products', hint: 'Search a product' }, { id: 'oos', label: '/oos', hint: 'Add all out-of-stock products' }, { id: 'nos', label: '/nos', hint: 'Add products with fewer than 7 in stock' }, { id: 'flows', label: '/flows', hint: 'Search a flow' }, { id: 'operation', label: '/operation', hint: 'Search active operations' }, { id: 'template', label: '/template', hint: 'Search a brand template' }, { id: 'sheet', label: '/sheet refunds', hint: 'Link a master-sheet tab' }, { id: 'order', label: '/order 1234', hint: 'Shopify order (internal only)', internal: true },
]
const stock = (product) => (Array.isArray(product?.variants) ? product.variants : []).map((variant) => Number(variant?.inventoryQuantity)).filter(Number.isFinite).reduce((total, quantity) => total + quantity, 0)
const imageFor = (product) => product?.featuredImage?.url || product?.media?.find((item) => item?.image?.url)?.image?.url || ''
const isInternal = (role) => ['admin', 'team', 'agent', 'pod_lead'].includes(String(role || '').toLowerCase())
const expiry = (value) => { if (!value) return 'No expiry'; const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); return days <= 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}` }

export function ChatReferenceCapsules({ references = [], tone = 'light', onRemove }) {
  if (!references.length) return null
  const inverse = tone === 'dark'
  return <div className="mt-2 flex flex-wrap gap-2">{references.map((reference) => {
    const content = <><span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100 text-slate-500">{reference.image ? <img src={reference.image} alt="" className="h-full w-full object-cover" /> : reference.type === 'flow' ? <Workflow size={14} /> : reference.type === 'sheet' ? <FileSpreadsheet size={14} /> : reference.type === 'operation' ? <ClipboardList size={14} /> : <Package size={14} />}</span><span className="min-w-0"><span className="block max-w-48 truncate text-xs font-bold">{reference.title}</span><span className={`block max-w-48 truncate text-[10px] ${inverse ? 'text-white/70' : 'text-slate-500'}`}>{reference.subtitle}</span></span></>
    const classes = `group/reference inline-flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${inverse ? 'border-white/25 bg-white/10 hover:bg-white/20' : 'border-slate-200 bg-slate-50 hover:border-primary/35 hover:bg-primary/5'}`
    return <div key={reference.id || `${reference.type}-${reference.title}`} className="relative max-w-full">{reference.href ? <a href={reference.href} target={reference.external ? '_blank' : undefined} rel={reference.external ? 'noreferrer' : undefined} className={classes}>{content}</a> : <div className={classes}>{content}</div>}{onRemove ? <button type="button" onClick={() => onRemove(reference)} aria-label={`Remove ${reference.title}`} className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-slate-700 text-white shadow-sm hover:bg-black"><X size={10} /></button> : null}</div>
  })}</div>
}

export default function ChatReferenceCommands({ value, brandName, role, onChoose }) {
  const [data, setData] = useState({ products: [], flows: [], operations: [], templates: [], sheetUrl: '', orders: [], loaded: {} })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const match = String(value || '').match(/^\/(\w*)(?:\s+(.*))?$/)
  const command = match?.[1]?.toLowerCase() || ''
  const query = match?.[2]?.toLowerCase().trim() || ''
  const commands = COMMANDS.filter((item) => !item.internal || isInternal(role))
  const active = commands.find((item) => item.id === command)

  useEffect(() => { setData({ products: [], flows: [], operations: [], templates: [], sheetUrl: '', orders: [], loaded: {} }) }, [brandName])

  useEffect(() => {
    if (!active || loading || active.id === 'order') return
    const resource = ['products', 'oos', 'nos'].includes(active.id) ? 'products' : active.id === 'flows' ? 'flows' : active.id === 'operation' ? 'operations' : active.id === 'template' ? 'templates' : 'sheet'
    if (data.loaded?.[resource]) return
    let live = true; setLoading(true); setError('')
    const load = resource === 'products' ? listProducts() : resource === 'flows' ? listFlows(brandName) : resource === 'operations' ? listOperationalUpdates(brandName) : resource === 'templates' ? listMessageTemplates(brandName) : getBrandMastersheetUrl(brandName)
    Promise.resolve(load)
      .then((result) => { if (!live) return; setData((current) => ({ ...current, ...(resource === 'products' ? { products: Array.isArray(result) ? result : [] } : resource === 'flows' ? { flows: result?.points || [] } : resource === 'operations' ? { operations: result?.updates || [] } : resource === 'templates' ? { templates: result?.templates || [] } : { sheetUrl: result || '' }), loaded: { ...current.loaded, [resource]: true } })) })
      .catch((reason) => { if (live) setError(reason.message || 'Could not load references.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [active, brandName, data.loaded, loading])

  useEffect(() => {
    if (command !== 'order' || !query || !isInternal(role)) return undefined
    let live = true
    const timer = window.setTimeout(() => {
      setLoading(true); setError('')
      searchShopifyOrders(brandName, query)
        .then((result) => { if (live) setData((current) => ({ ...current, orders: result?.orders || [] })) })
        .catch((reason) => { if (live) setError(reason.message || 'Could not search Shopify orders.') })
        .finally(() => { if (live) setLoading(false) })
    }, 220)
    return () => { live = false; window.clearTimeout(timer) }
  }, [brandName, command, query, role])

  const options = useMemo(() => {
    if (!active) return []
    const has = (item) => String(item || '').toLowerCase().includes(query)
    if (command === 'products') return data.products.filter((item) => has(item.name)).slice(0, 6).map((item) => ({ type: 'product', id: item.id, title: item.name, subtitle: item.price || 'Product', image: imageFor(item), href: item.url || '/app/products', external: Boolean(item.url) }))
    if (command === 'oos' || command === 'nos') { const products = data.products.filter((item) => command === 'oos' ? stock(item) === 0 : stock(item) > 0 && stock(item) < 7); return [{ type: 'product-set', id: command, title: command === 'oos' ? `Add ${products.length} out-of-stock products` : `Add ${products.length} near-out-of-stock products`, subtitle: command === 'oos' ? 'Inventory is 0' : 'Inventory below 7', products }] }
    if (command === 'flows') return data.flows.filter((item) => has(item.title || item.name)).slice(0, 6).map((item) => ({ type: 'flow', id: item.id, title: item.title || item.name || 'Untitled flow', subtitle: `${item.status || 'Draft'} · ${(item.steps || item.nodes || []).length} steps`, href: '/app/flows' }))
    if (command === 'operation') return data.operations.filter((item) => (!item.expires_at || new Date(item.expires_at) >= new Date()) && has(item.title || item.message)).slice(0, 6).map((item) => ({ type: 'operation', id: item.id, title: item.title || item.message || 'Operational update', subtitle: expiry(item.expires_at), href: '/app/operations' }))
    if (command === 'template') return data.templates.filter((item) => has(item.name || item.title)).slice(0, 6).map((item) => ({ type: 'template', id: item.id, title: item.name || item.title || 'Untitled template', subtitle: item.category || item.type || 'Template', href: '/app/templates' }))
    if (command === 'sheet') return ['refunds', 'replacements', 'cancellations', 'oos'].filter(has).map((tab) => ({ type: 'sheet', id: tab, title: `${tab.charAt(0).toUpperCase()}${tab.slice(1)} sheet`, subtitle: 'Master sheet link', href: data.sheetUrl, external: true }))
    if (command === 'order') return data.orders.map((item) => ({ type: 'order', id: item.id, title: item.name, subtitle: `${item.fulfillment_status} · ${item.payment_status}`, href: item.url, external: true }))
    return []
  }, [active, command, data, query])

  const commandOptions = commands.filter((item) => item.label.slice(1).startsWith(command)).slice(0, 7)
  const menuItems = active ? options : commandOptions
  const chooseMenuItem = (item) => onChoose(active ? 'reference' : 'command', active ? item : item.id)

  useEffect(() => { setSelectedIndex(0) }, [command, query, active?.id, menuItems.length])
  useEffect(() => {
    if (!match || loading || error || !menuItems.length) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation()
        setSelectedIndex((current) => event.key === 'ArrowDown' ? (current + 1) % menuItems.length : (current - 1 + menuItems.length) % menuItems.length)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation()
        chooseMenuItem(menuItems[selectedIndex] || menuItems[0])
      } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation()
        onChoose('command', '')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, error, loading, match, menuItems, onChoose, selectedIndex])

  if (!match) return null
  if (!active) return <Menu>{commandOptions.map((item, index) => <button key={item.id} type="button" onClick={() => chooseMenuItem(item)} className={`menu-item ${index === selectedIndex ? 'bg-primary/10' : ''}`}><b>{item.label}</b><span>{item.hint}</span></button>)}</Menu>
  return <Menu>{loading ? <p className="px-3 py-3 text-xs text-slate-500">Loading {active.label.slice(1)}…</p> : error ? <p className="px-3 py-3 text-xs text-red-600">{error}</p> : options.length ? options.map((item) => <button key={item.id} type="button" onClick={() => onChoose('reference', item)} className="menu-item"><Search size={14} className="text-primary" /><span className="min-w-0"><b className="block truncate">{item.title}</b><span className="block truncate">{item.subtitle}</span></span></button>) : <p className="px-3 py-3 text-xs text-slate-500">No matches found.</p>}</Menu>
}

function Menu({ children }) { return <div className="absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl [&_.menu-item]:flex [&_.menu-item]:w-full [&_.menu-item]:items-center [&_.menu-item]:justify-between [&_.menu-item]:gap-3 [&_.menu-item]:border-b [&_.menu-item]:border-slate-100 [&_.menu-item]:px-3 [&_.menu-item]:py-2.5 [&_.menu-item]:text-left [&_.menu-item]:text-xs [&_.menu-item]:hover:bg-primary/5 [&_.menu-item_b]:font-extrabold [&_.menu-item_b]:text-primary [&_.menu-item_span]:text-[11px] [&_.menu-item_span]:text-slate-500">{children}</div> }
