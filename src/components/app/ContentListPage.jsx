import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import DataTable from '../ui/DataTable'
import Drawer from '../ui/Drawer'
import EmptyState from '../ui/EmptyState'
import Input from '../ui/Input'
import KnowledgeAccessState from './KnowledgeAccessState'
import Select from '../ui/Select'
import OrbLoader from '../ui/OrbLoader'
import StatusChip from '../ui/StatusChip'
import Textarea from '../ui/Textarea'
import SopFlow from './SopFlow'
import useAsync from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const titles = { sop: 'SOPs', faq: 'FAQs', product: 'Products' }

const productThumbnail = (product = {}) => product.featuredImage?.url
  || (Array.isArray(product.media) ? product.media.map((asset) => asset?.image?.url || asset?.preview?.image?.url).find(Boolean) : '')
  || ''
const productInventory = (product = {}) => {
  const quantities = (Array.isArray(product.variants) ? product.variants : [])
    .map((variant) => variant?.inventoryQuantity)
    .filter((quantity) => quantity !== null && quantity !== undefined && quantity !== '')
    .map(Number)
    .filter(Number.isFinite)
  return quantities.length ? `${quantities.reduce((total, quantity) => total + quantity, 0)} in stock` : '—'
}
const productPrice = (product = {}) => {
  const value = String(product.price ?? '').trim()
  if (!value || value === '—') return '—'
  const currency = String(product.currency || '').trim()
  return currency && !value.toUpperCase().includes(currency) && !/[^\d.,\s-]/.test(value) ? `${value} ${currency}` : value
}
const productPriceAmount = (product = {}) => {
  const amount = Number(String(product.price ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

const formatUpdatedAt = (value) => {
  if (!value || value === '—') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((values, part) => ({ ...values, [part.type]: part.value }), {})
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`
}

const updatedByLabel = (item = {}) => item.updatedBy || item.updated_by || (String(item.source || '').toLowerCase().includes('orb') || String(item.source || '').toLowerCase().includes('qdrant') ? 'Orb' : 'Unknown')

function ProductEditor({ product, onChange }) {
  const metafields = Array.isArray(product.metafields) ? product.metafields : []
  const variants = Array.isArray(product.variants) ? product.variants : []
  const storedMedia = Array.isArray(product.media) ? product.media : []
  const media = storedMedia.length ? storedMedia : product.featuredImage?.url ? [{ id: 'featured-image', alt: product.featuredImage.altText || '', image: product.featuredImage }] : []
  const update = (key, value) => onChange({ ...product, [key]: value })
  const updateMeta = (index, patch) => update('metafields', metafields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))
  const updateVariant = (index, patch) => update('variants', variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, ...patch } : variant))
  const updateMedia = (index, patch) => update('media', media.map((asset, assetIndex) => assetIndex === index ? { ...asset, ...patch, image: { ...(asset.image || asset.preview?.image || {}), ...(patch.image || {}) } } : asset))
  const updateMoney = (index, key, amount) => {
    const variant = variants[index] || {}
    updateVariant(index, { [key]: { ...(variant[key] || {}), amount } })
  }
  return <div className="grid gap-6">
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-extrabold tracking-tight">{product.name || 'Untitled product'}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${String(product.status || '').toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{product.status || 'Draft'}</span></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4"><Input label="Title" value={product.name || ''} onChange={(event) => update('name', event.target.value)} /><Textarea label="Description" value={product.description || ''} onChange={(event) => update('description', event.target.value)} /><div className="grid gap-4 md:grid-cols-2"><Input label="Price" value={product.price || ''} onChange={(event) => update('price', event.target.value)} /><Input label="Product URL" type="url" value={product.url || ''} onChange={(event) => update('url', event.target.value)} /></div></div></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold">Media</h3><p className="mt-1 text-xs text-muted">Imported from Shopify and saved with this product record.</p></div><Button type="button" variant="outline" size="sm" onClick={() => update('media', [...media, { alt: '', image: { url: '', altText: '' } }])}><Plus size={14} />Add image</Button></div>{media.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{media.map((asset, index) => { const image = asset.image || asset.preview?.image || {}; const src = image.url || ''; return <div key={asset.id || `${src}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><div className="aspect-square bg-slate-100">{src ? <img src={src} alt={asset.alt || image.altText || product.name || ''} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-semibold text-slate-400">Image URL</div>}</div><div className="grid gap-2 p-2"><Input aria-label="Image URL" value={src} placeholder="https://..." onChange={(event) => updateMedia(index, { image: { ...image, url: event.target.value } })} /><Input aria-label="Image alt text" value={asset.alt || image.altText || ''} placeholder="Alt text" onChange={(event) => updateMedia(index, { alt: event.target.value, image: { ...image, altText: event.target.value } })} /><Button type="button" variant="outline" size="sm" onClick={() => update('media', media.filter((_, assetIndex) => assetIndex !== index))}><Trash2 size={13} />Remove</Button></div></div> })}</div> : <p className="mt-4 text-sm text-muted">No product media was returned yet. Run Sync to import Shopify media.</p>}</section>
    <section className="rounded-lg border border-slate-200 p-4"><h4 className="font-extrabold">Shopify details</h4><p className="mt-1 text-xs text-muted">These fields are stored in Orb’s product knowledge. A later Sync refreshes them from Shopify.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Input label="Handle" value={product.handle || ''} onChange={(event) => update('handle', event.target.value)} /><Input label="Vendor" value={product.vendor || ''} onChange={(event) => update('vendor', event.target.value)} /><Input label="Product type" value={product.productType || ''} onChange={(event) => update('productType', event.target.value)} /><Input label="Status" value={product.status || ''} onChange={(event) => update('status', event.target.value)} /><Input className="md:col-span-2" label="Tags (comma separated)" value={(product.tags || []).join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} /></div></section>
    <section className="rounded-lg border border-slate-200 p-4"><h4 className="font-extrabold">Search preview</h4><div className="mt-4 grid gap-4"><Input label="SEO title" value={product.seo?.title || ''} onChange={(event) => update('seo', { ...(product.seo || {}), title: event.target.value })} /><Textarea label="SEO description" value={product.seo?.description || ''} onChange={(event) => update('seo', { ...(product.seo || {}), description: event.target.value })} /></div></section>
    <section className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><h4 className="font-extrabold">Metafields</h4><p className="mt-1 text-xs text-muted">Extra Shopify fields available to support and flows.</p></div><Button type="button" variant="outline" size="sm" onClick={() => update('metafields', [...metafields, { namespace: 'custom', key: '', type: 'single_line_text_field', value: '', description: '' }])}><Plus size={14} />Add field</Button></div>{metafields.length ? <div className="mt-4 grid gap-3">{metafields.map((field, index) => <div key={field.id || `${field.namespace}-${field.key}-${index}`} className="rounded-md border border-slate-200 p-3"><div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"><Input label="Namespace" value={field.namespace || ''} onChange={(event) => updateMeta(index, { namespace: event.target.value })} /><Input label="Key" value={field.key || ''} onChange={(event) => updateMeta(index, { key: event.target.value })} /><Input label="Type" value={field.type || ''} onChange={(event) => updateMeta(index, { type: event.target.value })} /><Button type="button" variant="outline" size="sm" className="self-end" aria-label={`Remove metafield ${field.key || index + 1}`} onClick={() => update('metafields', metafields.filter((_, fieldIndex) => fieldIndex !== index))}><Trash2 size={14} /></Button></div><Textarea className="mt-3" label="Value" value={field.value || ''} onChange={(event) => updateMeta(index, { value: event.target.value })} /></div>)}</div> : <p className="mt-4 text-sm text-muted">No metafields were returned by Shopify.</p>}</section>
    <section className="rounded-lg border border-slate-200 p-4"><h4 className="font-extrabold">Variants</h4>{variants.length ? <div className="mt-4 grid gap-3">{variants.map((variant, index) => <div key={variant.id || `${variant.title}-${index}`} className="rounded-md border border-slate-200 p-3"><div className="grid gap-3 md:grid-cols-2"><Input label="Title" value={variant.title || ''} onChange={(event) => updateVariant(index, { title: event.target.value })} /><Input label="SKU" value={variant.sku || ''} onChange={(event) => updateVariant(index, { sku: event.target.value })} /><Input label="Barcode" value={variant.barcode || ''} onChange={(event) => updateVariant(index, { barcode: event.target.value })} /><Input label="Inventory quantity" value={variant.inventoryQuantity ?? ''} onChange={(event) => updateVariant(index, { inventoryQuantity: event.target.value === '' ? null : Number(event.target.value) })} /><Input label="Price" value={variant.price?.amount || ''} onChange={(event) => updateMoney(index, 'price', event.target.value)} /><Input label="Compare-at price" value={variant.compareAtPrice?.amount || ''} onChange={(event) => updateMoney(index, 'compareAtPrice', event.target.value)} /></div></div>)}</div> : <p className="mt-4 text-sm text-muted">No variants were returned by Shopify.</p>}</section>
  </div>
}

const metafieldDisplayName = (field = {}) => field.definition?.name || String(field.key || 'Metafield').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const metafieldReferences = (field = {}) => {
  const listed = Array.isArray(field.references?.nodes) ? field.references.nodes : []
  return [...(field.reference ? [field.reference] : []), ...listed].filter(Boolean)
}
const metafieldReferenceLabel = (reference = {}) => reference.displayName || reference.title || reference.alt || reference.image?.altText || reference.preview?.image?.altText || reference.handle || (reference.url ? reference.url.split('/').pop()?.split('?')[0] : '') || 'Linked Shopify item'
const metafieldReferenceImage = (reference = {}) => reference.image?.url || reference.preview?.image?.url || reference.featuredImage?.url || ''
const metafieldPreview = (field = {}) => {
  const raw = String(field.value || '').trim()
  if (!raw) return 'No value set in Shopify.'
  const referenceCount = (raw.match(/gid:\/\/shopify\//g) || []).length
  if (referenceCount) {
    const type = String(field.type || '').toLowerCase()
    const noun = type.includes('media') || type.includes('file') ? 'media item' : type.includes('product') ? 'product' : 'entry'
    const plural = noun === 'entry' ? 'entries' : `${noun}s`
    return `${referenceCount} linked ${referenceCount === 1 ? noun : plural}`
  }
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      const text = []
      const collect = (value) => {
        if (Array.isArray(value)) value.forEach(collect)
        else if (value && typeof value === 'object') {
          if (typeof value.value === 'string') text.push(value.value)
          if (Array.isArray(value.children)) value.children.forEach(collect)
        } else if (typeof value === 'string') text.push(value)
      }
      collect(JSON.parse(raw))
      const preview = text.map((value) => value.trim()).filter(Boolean).join(' · ')
      if (preview) return preview
    } catch { /* Keep Shopify's original raw value available below. */ }
  }
  return raw
}

const metafieldEditableText = (field = {}) => {
  const raw = String(field.value || '')
  const type = String(field.type || '').toLowerCase()
  if (type === 'rich_text_field') {
    try {
      const lines = []
      const read = (node) => {
        if (Array.isArray(node)) node.forEach(read)
        else if (node && typeof node === 'object') {
          if (typeof node.value === 'string') lines.push(node.value)
          if (Array.isArray(node.children)) {
            node.children.forEach(read)
            if (node.type === 'paragraph') lines.push('')
          }
        }
      }
      read(JSON.parse(raw))
      return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    } catch { return raw }
  }
  if (type.startsWith('list.')) {
    try {
      const values = JSON.parse(raw)
      return Array.isArray(values) ? values.map(String).join(', ') : raw
    } catch { return raw }
  }
  return raw
}

const metafieldValueFromText = (field = {}, text = '') => {
  const type = String(field.type || '').toLowerCase()
  if (type === 'rich_text_field') {
    const children = String(text).split(/\n\s*\n/).map((paragraph) => ({
      type: 'paragraph',
      children: paragraph.split('\n').filter(Boolean).map((value) => ({ type: 'text', value })),
    })).filter((paragraph) => paragraph.children.length)
    return JSON.stringify({ type: 'root', children })
  }
  if (type.startsWith('list.')) return JSON.stringify(String(text).split(',').map((value) => value.trim()).filter(Boolean))
  return text
}

function BooleanMetafieldControl({ label, value, onChange }) {
  const selected = String(value).trim().toLowerCase() === 'true' ? 'true' : 'false'
  return <div role="group" aria-label={label} className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
    {['false', 'true'].map((option) => {
      const active = selected === option
      return <button key={option} type="button" aria-pressed={active} onClick={() => onChange(option)} className={`min-w-16 rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-slate-200 text-ink shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-ink'}`}>
        {option === 'true' ? 'True' : 'False'}
      </button>
    })}
  </div>
}

function ShopifyMetafieldSection({ product, onChange }) {
  const metafields = Array.isArray(product.metafields) ? product.metafields : []
  const [expandedReferences, setExpandedReferences] = useState({})
  const [metafieldDrafts, setMetafieldDrafts] = useState({})
  useEffect(() => { setExpandedReferences({}); setMetafieldDrafts({}) }, [product.id])
  const updateField = (index, patch) => onChange({ ...product, metafields: metafields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) })
  const addField = () => onChange({ ...product, metafields: [...metafields, { namespace: 'custom', key: '', type: 'single_line_text_field', value: '' }] })
  const removeField = (index) => {
    const field = metafields[index]
    const deletedMetafieldIds = field?.id ? [...new Set([...(product.deletedMetafieldIds || []), field.id])] : (product.deletedMetafieldIds || [])
    onChange({ ...product, metafields: metafields.filter((_, fieldIndex) => fieldIndex !== index), deletedMetafieldIds })
    setMetafieldDrafts((current) => { const next = { ...current }; delete next[field?.id || `${field?.namespace}-${field?.key}-${index}`]; return next })
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-extrabold text-ink">Metafields</h2><p className="mt-1 text-sm text-slate-500">Populated fields synced directly from this Shopify product.</p></div><button type="button" onClick={addField} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm hover:bg-slate-50"><Plus size={15} />Add metafield</button></div>
    {metafields.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">{metafields.map((field, index) => {
      const references = metafieldReferences(field)
      const fieldKey = field.id || `${field.namespace}-${field.key}-${index}`
      const allReferencesVisible = Boolean(expandedReferences[fieldKey])
      const displayedReferences = allReferencesVisible ? references : references.slice(0, 4)
      const editableText = metafieldDrafts[fieldKey] ?? metafieldEditableText(field)
      const type = String(field.type || '').toLowerCase()
      const isNew = !field.id
      const isReferenceField = type.includes('reference')
      const isLongText = editableText.length > 150 || type === 'rich_text_field' || type.includes('multi_line')
      const updateEditableText = (value) => { setMetafieldDrafts((current) => ({ ...current, [fieldKey]: value })); updateField(index, { value: metafieldValueFromText(field, value) }) }
      return <div key={fieldKey} className="grid gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5">
        <div className="min-w-0 pt-1"><div className="flex items-center gap-1"><h3 className="truncate text-sm font-semibold text-ink" title={metafieldDisplayName(field)}>{metafieldDisplayName(field)}</h3><button type="button" onClick={() => removeField(index)} aria-label={`Delete ${metafieldDisplayName(field)}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div>
        <div className="min-w-0">{isNew ? <div className="mb-2 grid gap-2 sm:grid-cols-[0.85fr_1fr_1.2fr]"><input aria-label="Metafield namespace" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-purple" placeholder="Namespace" value={field.namespace || ''} onChange={(event) => updateField(index, { namespace: event.target.value })} /><input aria-label="Metafield key" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-purple" placeholder="Key" value={field.key || ''} onChange={(event) => updateField(index, { key: event.target.value })} /><select aria-label="Metafield type" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-purple" value={field.type || 'single_line_text_field'} onChange={(event) => updateField(index, { type: event.target.value, value: '' })}><option value="single_line_text_field">Single-line text</option><option value="multi_line_text_field">Multi-line text</option><option value="rich_text_field">Rich text</option><option value="number_decimal">Number</option><option value="url">URL</option><option value="boolean">Boolean</option><option value="list.single_line_text_field">List of text</option></select></div> : null}{references.length ? <div className="flex flex-wrap gap-1.5">{displayedReferences.map((reference, referenceIndex) => { const image = metafieldReferenceImage(reference); return <span key={reference.id || `${reference.__typename}-${referenceIndex}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">{image ? <img src={image} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[9px] text-slate-500">{reference.__typename === 'Product' ? 'P' : '↗'}</span>}<span className="max-w-48 truncate">{metafieldReferenceLabel(reference)}</span></span> })}{references.length > 4 ? <button type="button" onClick={() => setExpandedReferences((current) => ({ ...current, [fieldKey]: !allReferencesVisible }))} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-purple">{allReferencesVisible ? 'Show less' : `Show ${references.length - 4} more`}</button> : null}</div> : isReferenceField ? <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">Linked Shopify item</span> : type === 'boolean' ? <BooleanMetafieldControl label={metafieldDisplayName(field)} value={field.value} onChange={updateEditableText} /> : isLongText ? <textarea aria-label={metafieldDisplayName(field)} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 shadow-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/15" value={editableText} onChange={(event) => updateEditableText(event.target.value)} /> : <input aria-label={metafieldDisplayName(field)} className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm leading-5 text-slate-700 shadow-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/15" value={editableText} onChange={(event) => updateEditableText(event.target.value)} />}</div>
      </div>
    })}</div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No populated metafields were returned by Shopify. Add one to create it in Shopify.</div>}
  </section>
}

function VariantDetailPanel({ product, variant, variants, onBack, onSelect, onChange, onSave, saving, loading, error, saveSuccess, onClearSuccess }) {
  const image = variant.image || product.featuredImage || {}
  const fields = Array.isArray(variant.metafields) ? variant.metafields : []
  const [drafts, setDrafts] = useState({})
  useEffect(() => { setDrafts({}) }, [variant.id])
  const updateField = (index, text) => {
    if (saveSuccess && onClearSuccess) onClearSuccess()
    onChange({ ...variant, metafields: fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, value: metafieldValueFromText(field, text), is_set: true } : field) })
  }
  const fieldClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-purple focus:ring-2 focus:ring-purple/15'
  return <div className="product-workspace mx-auto max-w-[1320px] pb-4">
    <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-purple"><ArrowLeft size={16} />{product.name || 'Product'}</button>
    <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-ink">{variant.title || 'Untitled variant'}</h1>
    <div className="grid items-start gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-200 p-4">{image.url ? <img src={image.url} alt={image.altText || ''} className="h-11 w-11 rounded-lg object-cover" /> : <span className="h-11 w-11 rounded-lg bg-slate-100" />}<div className="min-w-0"><p className="truncate text-sm font-extrabold">{product.name}</p><p className="text-xs text-slate-500">{variants.length} variants</p></div></div><div className="max-h-[55vh] overflow-y-auto p-2">{variants.map((item) => <button type="button" key={item.id || item.title} onClick={() => onSelect(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${item.id === variant.id ? 'bg-slate-100 font-extrabold text-ink' : 'text-slate-600 hover:bg-slate-50'}`}>{item.image?.url ? <img src={item.image.url} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="h-7 w-7 rounded bg-slate-100" />}<span className="truncate">{item.title || 'Default title'}</span></button>)}</div></aside>
      <main className="min-w-0 space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex gap-4">{image.url ? <img src={image.url} alt={image.altText || ''} className="h-20 w-20 rounded-xl object-cover" /> : null}<div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-500">{product.name}</p><label className="mt-3 block text-sm font-bold">Variant title<input className={fieldClass} value={variant.title || ''} onChange={(event) => onChange({ ...variant, title: event.target.value })} /></label></div></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Pricing and identification</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Price<input className={fieldClass} value={variant.price?.amount || ''} onChange={(event) => onChange({ ...variant, price: { ...(variant.price || {}), amount: event.target.value, currencyCode: variant.price?.currencyCode || product.currency || '' } })} /></label><label className="block text-sm font-bold">SKU<input className={fieldClass} value={variant.sku || ''} onChange={(event) => onChange({ ...variant, sku: event.target.value })} /></label><label className="block text-sm font-bold">Barcode<input className={fieldClass} value={variant.barcode || ''} onChange={(event) => onChange({ ...variant, barcode: event.target.value })} /></label><label className="block text-sm font-bold">Inventory quantity<input className={fieldClass} type="number" value={variant.inventoryQuantity ?? ''} onChange={(event) => onChange({ ...variant, inventoryQuantity: event.target.value === '' ? null : Number(event.target.value) })} /></label></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="font-extrabold text-ink">Variant metafields</h2><p className="mt-1 text-sm text-slate-500">These fields are attached to this selected variant.</p></div>{loading ? <OrbLoader compact label="Loading Shopify metafields" /> : error ? <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : fields.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">{fields.map((field, index) => { const key = field.id || `${field.namespace}-${field.key}-${index}`; const type = String(field.type || '').toLowerCase(); const text = drafts[key] ?? metafieldEditableText(field); const references = metafieldReferences(field); const isReference = type.includes('reference'); const long = text.length > 150 || type === 'rich_text_field' || type.includes('multi_line'); const setText = (value) => { setDrafts((current) => ({ ...current, [key]: value })); updateField(index, value) }; return <div key={key} className="grid gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-5"><div><h3 className="text-sm font-semibold">{metafieldDisplayName(field)}</h3><p className="mt-1 text-xs text-slate-400">{field.namespace}.{field.key}</p></div><div>{references.length || isReference ? <div className="flex flex-wrap gap-1.5">{references.length ? references.map((reference, referenceIndex) => <span key={reference.id || referenceIndex} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200">{metafieldReferenceLabel(reference)}</span>) : <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200">Linked Shopify item</span>}</div> : type === 'boolean' ? <BooleanMetafieldControl label={metafieldDisplayName(field)} value={field.value} onChange={setText} /> : long ? <textarea aria-label={metafieldDisplayName(field)} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-purple focus:ring-2 focus:ring-purple/15" value={text} onChange={(event) => setText(event.target.value)} /> : <input aria-label={metafieldDisplayName(field)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/15" value={text} onChange={(event) => setText(event.target.value)} />}</div></div> })}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No pinned Shopify metafield definitions are configured for this variant.</p>}</section>
        {onSave ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {saveSuccess ? (
              <span className="inline-flex items-center gap-2 rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm">
                <Check size={15} className="stroke-[3] text-emerald-600" /> {saveSuccess}
              </span>
            ) : <span />}
            <Button type="button" variant="purple" disabled={saving || !fields.length} onClick={() => onSave(variant)}>
              {saving ? 'Saving to Shopify…' : 'Save variant metafields to Shopify'}
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  </div>
}

function ShopifyProductWorkspace({ product, onChange, loadVariantMetafields, loadThemeTemplates, saveVariantMetafields, onReload }) {
  const { showToast } = useToast()
  const variants = Array.isArray(product.variants) ? product.variants : []
  const savedMedia = Array.isArray(product.media) ? product.media : []
  const media = savedMedia.length ? savedMedia : product.featuredImage?.url ? [{ id: 'featured-image', image: product.featuredImage, alt: product.featuredImage.altText || '' }] : []
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [loadingVariantMetafields, setLoadingVariantMetafields] = useState(false)
  const [variantMetafieldError, setVariantMetafieldError] = useState('')
  const [variantSaveSuccess, setVariantSaveSuccess] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState(null)
  const [savingVariant, setSavingVariant] = useState(false)
  const [themeTemplates, setThemeTemplates] = useState([])
  const [loadingThemeTemplates, setLoadingThemeTemplates] = useState(false)
  const [themeTemplateError, setThemeTemplateError] = useState('')
  const visibleMedia = showAllMedia ? media : media.slice(0, 4)
  useEffect(() => { setShowAllMedia(false) }, [product.id])
  useEffect(() => {
    let active = true
    if (!loadThemeTemplates) { setThemeTemplates([]); setThemeTemplateError(''); return undefined }
    setLoadingThemeTemplates(true)
    setThemeTemplateError('')
    Promise.resolve(loadThemeTemplates())
      .then((result) => { if (active) setThemeTemplates(Array.isArray(result?.templates) ? result.templates : []) })
      .catch((error) => { if (active) { setThemeTemplates([]); setThemeTemplateError(error.message || 'Could not load Shopify theme templates.') } })
      .finally(() => { if (active) setLoadingThemeTemplates(false) })
    return () => { active = false }
  }, [loadThemeTemplates])
  const fieldClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-purple focus:ring-2 focus:ring-purple/15'
  const update = (key, value) => onChange({ ...product, [key]: value })
  const updateMedia = (index, patch) => update('media', media.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, image: { ...(item.image || item.preview?.image || {}), ...(patch.image || {}) } } : item))
  const updateVariant = (index, patch) => update('variants', variants.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const fetchVariantMetafields = async (variantId) => {
    if (!loadVariantMetafields || !variantId) return
    setLoadingVariantMetafields(true)
    setVariantMetafieldError('')
    try {
      const result = await loadVariantMetafields(product, variantId)
      const fieldsByVariant = new Map((result?.variants || []).map((variant) => [variant.id, Array.isArray(variant.metafields) ? variant.metafields : []]))
      const nextVariants = variants.map((variant) => fieldsByVariant.has(variant.id) ? { ...variant, metafields: fieldsByVariant.get(variant.id) } : variant)
      update('variants', nextVariants)
      return nextVariants
    } catch (error) { setVariantMetafieldError(error.message || 'Could not load variant metafields.') } finally { setLoadingVariantMetafields(false) }
  }
  const openVariant = async (variantId) => {
    setVariantSaveSuccess('')
    setSelectedVariantId(variantId)
    const variant = variants.find((item) => item.id === variantId)
    if (variant && !Array.isArray(variant.metafields) && loadVariantMetafields) await fetchVariantMetafields(variantId)
  }
  const updateSelectedVariant = (nextVariant) => update('variants', variants.map((item) => item.id === nextVariant.id ? nextVariant : item))
  const saveSelectedVariant = async (variant) => {
    if (!saveVariantMetafields) return
    setSavingVariant(true)
    setVariantMetafieldError('')
    setVariantSaveSuccess('')
    try {
      const result = await saveVariantMetafields(product, variant)
      const savedCount = result?.saved || 0
      const deletedCount = result?.deleted || 0
      const variantName = variant.title || 'Variant'
      const toastMessage = `${variantName} metafields saved in Shopify.${deletedCount ? ` (${deletedCount} cleared)` : ''}`
      showToast(toastMessage)
      setVariantSaveSuccess(toastMessage)
      if (onReload) await onReload()
      if (loadVariantMetafields && variant.id) {
        await fetchVariantMetafields(variant.id)
      }
    } catch (error) {
      const errorMsg = error.message || 'Could not save variant metafields to Shopify.'
      setVariantMetafieldError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
      setSavingVariant(false)
    }
  }
  const state = String(product.status || 'DRAFT').toUpperCase()
  const templateOptions = [...themeTemplates]
  if (product.templateSuffix && !templateOptions.some((item) => item.value === product.templateSuffix)) templateOptions.push({ value: product.templateSuffix, label: product.templateSuffix.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) })
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)
  if (selectedVariant) return <VariantDetailPanel product={product} variant={selectedVariant} variants={variants} onBack={() => { setVariantSaveSuccess(''); setSelectedVariantId(null) }} onSelect={openVariant} onChange={updateSelectedVariant} onSave={saveSelectedVariant} saving={savingVariant} loading={loadingVariantMetafields} error={variantMetafieldError} saveSuccess={variantSaveSuccess} onClearSuccess={() => setVariantSaveSuccess('')} />
  return <div className="product-workspace mx-auto max-w-[1320px] pb-4">
    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_290px]">
      <main className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-extrabold tracking-tight text-ink">{product.name || 'Untitled product'}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${state === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{state === 'ACTIVE' ? 'Active' : state.charAt(0) + state.slice(1).toLowerCase()}</span></div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><label className="block text-sm font-bold text-ink">Title<input className={fieldClass} value={product.name || ''} onChange={(event) => update('name', event.target.value)} /></label><label className="mt-4 block text-sm font-bold text-ink">Description<textarea className={`${fieldClass} min-h-44 resize-y leading-6`} value={product.description || ''} onChange={(event) => update('description', event.target.value)} /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-ink">Price<input className={fieldClass} value={product.price || ''} onChange={(event) => update('price', event.target.value)} /></label><label className="block text-sm font-bold text-ink">Product URL<input className={fieldClass} value={product.url || ''} onChange={(event) => update('url', event.target.value)} /></label></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-ink">Media</h2><p className="mt-1 text-sm text-slate-500">Product imagery imported from Shopify.</p></div><button type="button" onClick={() => update('media', [...media, { alt: '', image: { url: '', altText: '' } }])} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm hover:bg-slate-50"><Plus size={16} />Add media</button></div>{media.length ? <><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{visibleMedia.map((item, index) => { const image = item.image || item.preview?.image || {}; const source = image.url || ''; const mediaIndex = media.indexOf(item); return <div key={item.id || `${source}-${mediaIndex}`} className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><div className="aspect-square bg-slate-100">{source ? <img src={source} alt={item.alt || image.altText || product.name || ''} className="h-full w-full object-cover" /> : <label className="grid h-full cursor-pointer place-items-center p-3 text-center text-xs font-bold text-slate-400">Image URL<input className="sr-only" value={source} onChange={(event) => updateMedia(mediaIndex, { image: { ...image, url: event.target.value } })} /></label>}</div><div className="flex items-center gap-2 border-t border-slate-200 bg-white px-2 py-2"><input aria-label="Image alt text" className="min-w-0 flex-1 bg-transparent text-xs outline-none" value={item.alt || image.altText || ''} placeholder="Alt text" onChange={(event) => updateMedia(mediaIndex, { alt: event.target.value, image: { ...image, altText: event.target.value } })} /><button type="button" aria-label="Remove media" onClick={() => update('media', media.filter((_, itemIndex) => itemIndex !== mediaIndex))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div> })}</div>{media.length > 4 ? <button type="button" onClick={() => setShowAllMedia((value) => !value)} className="mt-4 text-sm font-bold text-purple hover:text-purple/75">{showAllMedia ? 'Show less' : `Show all ${media.length} media`}</button> : null}</> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No media is stored for this product yet. Use Sync to import it from Shopify.</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-ink">Variants</h2><p className="mt-1 text-sm text-slate-500">Open a variant to inspect and edit its own Shopify metafields.</p></div>{loadVariantMetafields && variants[0] ? <button type="button" onClick={() => openVariant(variants[0].id)} disabled={loadingVariantMetafields} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm hover:bg-slate-50 disabled:opacity-60">{loadingVariantMetafields ? 'Loading metafields…' : 'Open a variant'}</button> : null}</div>{variantMetafieldError ? <p className="mt-3 text-sm text-red-600">{variantMetafieldError}</p> : null}{variants.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-500"><span>Variant</span><span>SKU</span><span>Price</span></div>{variants.map((variant, index) => <button type="button" key={variant.id || index} onClick={() => openVariant(variant.id)} className="grid w-full grid-cols-[1.2fr_1fr_0.8fr] gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50"><span className="truncate text-sm font-semibold text-ink">{variant.title || 'Default title'}</span><span className="truncate text-sm text-slate-600">{variant.sku || 'No SKU'}</span><span className="text-sm text-slate-600">{variant.price?.amount || '—'}</span></button>)}</div> : <p className="mt-4 text-sm text-slate-500">No variants were returned by Shopify.</p>}</section>
        <ShopifyMetafieldSection product={product} onChange={onChange} />
      </main>
      <aside className="space-y-5 xl:sticky xl:top-0"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Status</h2><select className={fieldClass} value={state} onChange={(event) => update('status', event.target.value)}><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select><div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-extrabold">Publishing</h3><p className="mt-2 text-sm text-slate-500">Changes are saved to Orb’s support knowledge. Sync refreshes this product from Shopify.</p></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Product organization</h2><label className="mt-4 block text-sm font-bold">Type<input className={fieldClass} value={product.productType || ''} onChange={(event) => update('productType', event.target.value)} /></label><label className="mt-4 block text-sm font-bold">Vendor<input className={fieldClass} value={product.vendor || ''} onChange={(event) => update('vendor', event.target.value)} /></label><label className="mt-4 block text-sm font-bold">Tags<input className={fieldClass} placeholder="Add tags, separated by commas" value={(product.tags || []).join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} /></label><label className="mt-4 block text-sm font-bold">Theme template<select className={fieldClass} value={product.templateSuffix || ''} onChange={(event) => update('templateSuffix', event.target.value)} disabled={loadingThemeTemplates}><option value="">{loadingThemeTemplates ? 'Loading templates…' : 'Default product'}</option>{templateOptions.map((template) => <option key={template.value} value={template.value}>{template.label || template.value}</option>)}</select></label>{themeTemplateError ? <p className="mt-2 text-xs leading-5 text-amber-700">{themeTemplateError}</p> : null}</section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Search preview</h2><label className="mt-4 block text-sm font-bold">SEO title<input className={fieldClass} value={product.seo?.title || ''} onChange={(event) => update('seo', { ...(product.seo || {}), title: event.target.value })} /></label><label className="mt-4 block text-sm font-bold">SEO description<textarea className={`${fieldClass} min-h-24 resize-y`} value={product.seo?.description || ''} onChange={(event) => update('seo', { ...(product.seo || {}), description: event.target.value })} /></label></section></aside>
    </div>
  </div>
}

const productMatchesAssistantDraft = (product = {}, draft = {}) => {
  const target = String(draft.target || '').trim().toLowerCase()
  const productName = String(product.name || product.title || '').trim().toLowerCase()
  return Boolean(target && productName && productName.includes(target))
}

const assistantDraftTokens = (value = '') => new Set(String(value).toLowerCase().match(/[a-z0-9]{3,}/g) || [])
const textMetafieldTypes = new Set(['single_line_text_field', 'multi_line_text_field', 'rich_text_field', 'list.single_line_text_field', 'list.multi_line_text_field'])

function ProductMetafieldDraftReview({ product, draft, onApply }) {
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { setShowAll(false) }, [product.id, draft.message])
  const candidates = useMemo(() => {
    const intent = assistantDraftTokens(`${draft.fieldHint || ''} ${draft.message || ''}`)
    const availabilityIntent = /\b(?:availability|stock|restock|preorder|pre-order|back in stock|out of stock)\b/i.test(`${draft.fieldHint || ''} ${draft.message || ''}`)
    return (Array.isArray(product.metafields) ? product.metafields : []).map((field, index) => {
      const label = `${field.definition?.name || ''} ${field.namespace || ''} ${field.key || ''} ${field.description || ''}`.toLowerCase()
      const fieldTokens = assistantDraftTokens(label)
      let score = [...intent].reduce((total, token) => total + (fieldTokens.has(token) ? 3 : 0), 0)
      if (availabilityIntent && /(?:availability|stock|restock|pre[ _-]?order|back[ _-]?in)/i.test(label)) score += 12
      if (draft.fieldHint && label.includes(String(draft.fieldHint).toLowerCase())) score += 8
      const type = String(field.type || '').toLowerCase()
      return { field, index, score, editable: textMetafieldTypes.has(type), label: metafieldDisplayName(field) }
    }).sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
  }, [draft.fieldHint, draft.message, product.metafields])
  const related = candidates.filter((candidate) => candidate.score > 0)
  const displayed = showAll ? candidates : related
  const fieldCount = candidates.length
  return <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-sm">
    <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Orb draft review</p>
    <h2 className="mt-1 text-lg font-extrabold text-ink">Choose where this product update belongs</h2>
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{draft.message}</p>
    <p className="mt-3 text-xs leading-5 text-slate-600">Orb checked {fieldCount} {product._orbMetafieldsLive ? 'live' : 'synced'} Shopify {fieldCount === 1 ? 'metafield' : 'metafields'} on this product. {related.length ? `${related.length} look${related.length === 1 ? 's' : ''} related to ${draft.fieldHint || 'this update'}.` : 'None are an obvious text match, so choose a field manually if appropriate.'} Adding a draft below does not save anything to Shopify.</p>
    {displayed.length ? <div className="mt-4 grid gap-2">
      {displayed.map(({ field, index, editable, label }) => <div key={field.id || `${field.namespace}-${field.key}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-white px-3 py-3">
        <div className="min-w-0"><p className="font-bold text-ink">{label}</p><p className="mt-0.5 truncate text-xs text-slate-500">{field.namespace || 'custom'}.{field.key || 'untitled'} · {field.type || 'unknown type'}</p>{field.value ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">Current: {metafieldPreview(field)}</p> : null}</div>
        <Button type="button" variant="outline" size="sm" disabled={!editable} title={editable ? 'Add this as an editable draft' : 'This Shopify field cannot safely receive a text draft'} onClick={() => onApply(index)}>{editable ? 'Add draft here' : 'Not a text field'}</Button>
      </div>)}
    </div> : <p className="mt-4 rounded-xl border border-dashed border-primary/30 bg-white/70 p-3 text-sm text-slate-600">{fieldCount ? 'No fields are an obvious match. You can still inspect every synced Shopify field below.' : 'This product has no synced Shopify metafields yet. Sync Products before choosing a metafield, or add a field manually below.'}</p>}
    {candidates.length > related.length ? <button type="button" onClick={() => setShowAll((current) => !current)} className="mt-3 text-sm font-bold text-primary hover:underline">{showAll ? 'Show related fields only' : `Show all ${fieldCount} Shopify fields`}</button> : null}
  </section>
}

export default function ContentListPage({ kind, list, update, remove, syncProducts, saveProductMetafields, saveVariantMetafields, loadProductMetafields, loadVariantMetafields, loadThemeTemplates, publishApproved, createItem, initialDraft = null, assistantDraft = null }) {
  const title = titles[kind] || 'Content'
  const isSop = kind === 'sop'
  const isFaq = kind === 'faq'
  const isProduct = kind === 'product'
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const isReadOnly = (isSop || isFaq) && !isAdmin
  const { showToast } = useToast()
  const [brandVersion, setBrandVersion] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [productSort, setProductSort] = useState('name-asc')
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState([])
  const [confirm, setConfirm] = useState(false)
  const [confirmApproveAll, setConfirmApproveAll] = useState(false)
  const [approving, setApproving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [publishingApproved, setPublishingApproved] = useState(false)
  const [savingShopify, setSavingShopify] = useState(false)
  const scrollPosition = useRef(0)
  const handledHandoffRef = useRef('')

  useEffect(() => {
    const reloadForBrand = () => setBrandVersion((version) => version + 1)
    window.addEventListener('orb:brand-changed', reloadForBrand)
    return () => window.removeEventListener('orb:brand-changed', reloadForBrand)
  }, [])

  const { data: fetchedData, loading, error, reload } = useAsync(list, [list, brandVersion])
  const data = Array.isArray(fetchedData) ? fetchedData : []
  useEffect(() => {
    if (!initialDraft || handledHandoffRef.current === initialDraft.id) return
    handledHandoffRef.current = initialDraft.id
    scrollPosition.current = window.scrollY
    setSelected(initialDraft)
  }, [initialDraft])
  useEffect(() => {
    if (!isProduct || !assistantDraft?.message || !data.length) return
    const handoffKey = `${assistantDraft.target}|${assistantDraft.message}`
    if (handledHandoffRef.current === handoffKey) return
    handledHandoffRef.current = handoffKey
    const target = String(assistantDraft.target || '').trim().toLowerCase()
    const product = target ? data.find((item) => String(item.name || item.title || '').toLowerCase().includes(target)) : null
    if (target) setQuery(assistantDraft.target)
    if (product) {
      scrollPosition.current = window.scrollY
      setSelected(product)
      if (!loadProductMetafields) return undefined
      let active = true
      Promise.resolve(loadProductMetafields(product))
        .then((result) => {
          const metafields = Array.isArray(result?.metafields) ? result.metafields : null
          if (active && metafields) setSelected((current) => current?.id === product.id ? { ...current, metafields, _orbMetafieldsLive: true } : current)
        })
        .catch(() => {
          // The review still works from the last successful product sync.
        })
      return () => { active = false }
    }
  }, [assistantDraft, data, isProduct, loadProductMetafields])
  const rows = useMemo(() => {
    const filtered = data.filter((item) => {
      const text = [item.title, item.question, item.name, item.description, item.category].filter(Boolean).join(' ').toLowerCase()
      const statusMatches = status === 'All' || String(item.status || '').toLowerCase() === status.toLowerCase()
      return statusMatches && text.includes(query.toLowerCase())
    })
    if (!isProduct) return filtered
    return [...filtered].sort((left, right) => {
      if (productSort === 'name-desc') return String(right.name || '').localeCompare(String(left.name || ''), undefined, { sensitivity: 'base' })
      if (productSort === 'price-asc' || productSort === 'price-desc') {
        const leftPrice = productPriceAmount(left), rightPrice = productPriceAmount(right)
        if (leftPrice === null) return 1
        if (rightPrice === null) return -1
        return productSort === 'price-desc' ? rightPrice - leftPrice : leftPrice - rightPrice
      }
      return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' })
    })
  }, [data, isProduct, productSort, query, status])
  const draftIds = useMemo(() => data
    .filter((item) => String(item.status || '').toLowerCase() === 'draft')
    .map((item) => item.id), [data])
  const approvedCount = useMemo(() => data.filter((item) => String(item.status || '').toLowerCase() === 'approved').length, [data])

  const openItem = (item) => {
    scrollPosition.current = window.scrollY
    setSelected(item)
    setConfirm(false)
  }

  useLayoutEffect(() => {
    if (!selected) return undefined
    const restoreScroll = () => window.scrollTo(0, scrollPosition.current)
    restoreScroll()
    const frame = window.requestAnimationFrame(restoreScroll)
    const timer = window.setTimeout(restoreScroll, 0)
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer) }
  }, [selected])

  const toggle = (id) => setChecked((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  const NEW_ITEM_ID = '__new__'
  const createBlank = () => {
    scrollPosition.current = window.scrollY
    if (isFaq) {
      setSelected({ id: NEW_ITEM_ID, question: '', answer: '', category: 'Support', status: 'Draft', source: 'Manual', updated: 'Not saved' })
    } else if (isSop) {
      setSelected({ id: NEW_ITEM_ID, title: '', situation: '', checkFirst: '', whatToDo: '', whatToSay: '', escalateTo: '', category: 'Support', status: 'Draft', source: 'Manual', updated: 'Not saved' })
    }
  }
  const isNewItem = selected?.id === NEW_ITEM_ID
  const save = async () => {
    try {
      const editorName = user?.name || user?.email?.split('@')[0] || 'Orb user'
      if (isNewItem && createItem) {
        await createItem(isSop ? { ...selected, updatedBy: editorName } : selected)
        showToast('Created.')
      } else {
        await update(isSop ? { ...selected, updatedBy: editorName } : selected)
        showToast('Saved.')
      }
      setSelected(null)
      reload()
    } catch (saveError) { showToast(saveError.message || 'Could not save this item.') }
  }
  const approve = async (ids = checked) => {
    const items = ids.map((id) => data.find((item) => item.id === id)).filter(Boolean)
    if (!items.length) return
    setApproving(true)
    try {
      await Promise.all(items.map((item) => update({ ...item, status: 'Approved' })))
      setChecked([])
      setSelected(null)
      reload()
      showToast(`${items.length} ${items.length === 1 ? 'item' : 'items'} approved.`)
    } catch (approveError) {
      showToast(approveError.message || 'Could not approve these items.')
    } finally {
      setApproving(false)
    }
  }
  const deleteItems = async () => {
    try {
      const ids = selected ? [selected.id] : checked
      await Promise.all(ids.map(remove))
      setSelected(null)
      setChecked([])
      setConfirm(false)
      reload()
      showToast('Deleted.')
    } catch (deleteError) { showToast(deleteError.message || 'Could not delete this item.') }
  }
  const sync = async () => {
    if (!syncProducts) return
    setSyncing(true)
    try {
      const result = await syncProducts()
      await reload()
      showToast(`${result?.synced || 0} Shopify ${result?.synced === 1 ? 'product' : 'products'} synced.`)
    } catch (syncError) { showToast(syncError.message || 'Could not sync Shopify products.') } finally { setSyncing(false) }
  }
  const publishExistingApproved = async () => {
    if (!publishApproved) return
    setPublishingApproved(true)
    try {
      const result = await publishApproved()
      await reload()
      const count = result?.published || 0
      showToast(count ? `${count} approved ${count === 1 ? 'item has' : 'items have'} been published to Qdrant.` : 'All approved items are already in Qdrant.')
    } catch (publishError) {
      showToast(publishError.message || 'Could not publish the approved items to Qdrant.')
    } finally {
      setPublishingApproved(false)
    }
  }
  const saveMetafieldsToShopify = async () => {
    if (!saveProductMetafields || !selected) return
    setSavingShopify(true)
    try {
      const result = await saveProductMetafields(selected)
      await reload()
      const savedCount = result?.saved || 0
      const deletedCount = result?.deleted || 0
      showToast(`${savedCount} metafield${savedCount === 1 ? '' : 's'} saved${deletedCount ? `, ${deletedCount} deleted` : ''} in Shopify.`)
    } catch (saveError) { showToast(saveError.message || 'Could not save metafields to Shopify.') } finally { setSavingShopify(false) }
  }
  const applyAssistantDraftToMetafield = (fieldIndex) => {
    setSelected((current) => {
      if (!current) return current
      const fields = Array.isArray(current.metafields) ? current.metafields : []
      const field = fields[fieldIndex]
      if (!field) return current
      return {
        ...current,
        metafields: fields.map((item, index) => index === fieldIndex ? { ...item, value: metafieldValueFromText(item, assistantDraft?.message || '') } : item),
      }
    })
    const field = selected?.metafields?.[fieldIndex]
    if (field) showToast(`Draft added to ${metafieldDisplayName(field)}. It has not been saved to Shopify.`)
  }

  const columns = isSop
    ? [{ key: 'title', label: 'Title / situation', render: (item) => <div><strong>{item.title}</strong><p className="text-xs text-muted">{item.situation}</p></div> }, { key: 'status', label: 'Status', render: (item) => <StatusChip status={item.status} /> }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated', render: (item) => <div className="whitespace-nowrap"><p className="text-sm font-medium text-ink">{formatUpdatedAt(item.updated)}</p><p className="mt-0.5 text-xs text-muted">by {updatedByLabel(item)}</p></div> }]
    : isProduct
      ? [{ key: 'name', label: 'Product', render: (item) => { const image = productThumbnail(item); return <div className="flex min-w-[220px] items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="h-4 w-4 rounded bg-slate-200" />}</span><strong className="line-clamp-2 text-sm text-ink">{item.name || 'Untitled product'}</strong></div> } }, { key: 'status', label: 'Status', render: (item) => { const active = String(item.status || '').toLowerCase() === 'active'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.status ? String(item.status).charAt(0).toUpperCase() + String(item.status).slice(1).toLowerCase() : '—'}</span> } }, { key: 'inventory', label: 'Inventory', render: (item) => <span className="whitespace-nowrap text-sm text-slate-700">{productInventory(item)}</span> }, { key: 'price', label: 'Price', render: (item) => <span className="whitespace-nowrap text-sm font-semibold text-ink">{productPrice(item)}</span> }]
      : [{ key: 'question', label: 'Question', render: (item) => <strong>{item.question}</strong> }, { key: 'status', label: 'Status', render: (item) => <StatusChip status={item.status} /> }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated', render: (item) => <div className="whitespace-nowrap"><p className="text-sm font-medium text-ink">{formatUpdatedAt(item.updated)}</p><p className="mt-0.5 text-xs text-muted">by {updatedByLabel(item)}</p></div> }]

  if (loading) return <OrbLoader label={`Loading ${title}`} />
  if (error) return <KnowledgeAccessState error={error} title={title} onRetry={reload} />

  const selectableColumns = isProduct || isReadOnly ? columns : [{ key: 'select', label: '', render: (item) => <input aria-label={`Select ${item.title || item.question}`} type="checkbox" checked={checked.includes(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(item.id)} /> }, ...columns]
  const matchingAssistantDraft = isProduct && selected && assistantDraft?.message && productMatchesAssistantDraft(selected, assistantDraft)
  const productEditor = <>{matchingAssistantDraft ? <ProductMetafieldDraftReview product={selected} draft={assistantDraft} onApply={applyAssistantDraftToMetafield} /> : null}<ShopifyProductWorkspace product={selected || {}} onChange={setSelected} loadVariantMetafields={loadVariantMetafields} loadThemeTemplates={loadThemeTemplates} saveVariantMetafields={saveVariantMetafields} onReload={reload} /></>
  const footer = selected && (
    isReadOnly ? (
      <div className="flex flex-wrap items-center justify-between w-full">
        <span className="text-xs text-slate-500 italic">Read-only view for brand clients</span>
        <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        {isProduct && saveProductMetafields && <Button variant="purple" onClick={saveMetafieldsToShopify} disabled={savingShopify}>{savingShopify ? 'Saving to Shopify…' : 'Save metafields to Shopify'}</Button>}
        <Button variant={isProduct && saveProductMetafields ? 'outline' : 'purple'} onClick={save}>{isProduct && saveProductMetafields ? 'Save in Orb only' : isNewItem ? 'Create' : 'Save'}</Button>
        {!isProduct && !isNewItem && <Button variant="outline" onClick={() => approve([selected.id])}>Approve</Button>}
        {!isNewItem && <Button variant="dark" onClick={() => setConfirm(true)}>Delete</Button>}
      </div>
    )
  )

  return <div className="page-enter mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Knowledge library</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-3xl font-extrabold tracking-tight">{title}</h2>
          {!isProduct && <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-extrabold text-primary">{data.length} {title.toLowerCase()}</span>}
          {isReadOnly && <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">Read-Only</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!isReadOnly && !isProduct && draftIds.length > 0 && <Button variant="outline" onClick={() => setConfirmApproveAll(true)} disabled={approving}><Check size={16} />Approve all drafts ({draftIds.length})</Button>}
        {!isReadOnly && !isProduct && publishApproved && approvedCount > 0 && <Button variant="outline" onClick={publishExistingApproved} disabled={publishingApproved}>{<RefreshCw size={16} className={publishingApproved ? 'animate-spin' : ''} />}{publishingApproved ? 'Publishing…' : 'Publish approved to Qdrant'}</Button>}
        {isProduct && syncProducts && <Button variant="outline" onClick={sync} disabled={syncing}><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Syncing…' : 'Sync'}</Button>}
        {!isReadOnly && <Button onClick={!isProduct ? createBlank : () => navigate('/app?generate=1')}><Plus size={16} />{!isProduct ? (isFaq ? 'Add FAQ' : 'Add SOP') : 'Generate more'}</Button>}
      </div>
    </div>
    {assistantDraft?.message && <section className="mt-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-slate-700"><p className="font-extrabold text-ink">Orb product-update draft</p><p className="mt-1 whitespace-pre-wrap">{assistantDraft.message}</p><p className="mt-2 text-xs text-slate-500">Nothing has been changed. Open the matching product and choose the Shopify metafield that should receive this editable draft.</p></section>}
    <section className="mt-6 rounded-lg border-2 border-ink bg-white p-4 shadow-brutal">
      <div className={`grid gap-3 ${isProduct ? 'md:grid-cols-[1fr_150px_190px]' : 'md:grid-cols-[1fr_150px_150px]'}`}>
        <label className="flex items-center gap-2 rounded-md border-2 border-ink px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 outline-none" value={query} placeholder={`Search ${title}`} onChange={(event) => setQuery(event.target.value)} /></label>
        <Select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}>{isProduct ? <><option>All</option><option>Active</option><option>Draft</option></> : <><option>All</option><option>Draft</option><option>Approved</option></>}</Select>
        {isProduct ? <Select aria-label="Sort products" value={productSort} onChange={(event) => setProductSort(event.target.value)}><option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></Select> : <Select aria-label="Sort content"><option>Last updated</option><option>Title</option></Select>}
      </div>
      {!isReadOnly && !isProduct && checked.length > 0 && <div className="mt-4 flex gap-2"><Button variant="purple" size="sm" onClick={() => approve()} disabled={approving}><Check size={15} />Approve selected</Button><Button variant="outline" size="sm" onClick={() => setConfirm(true)}><Trash2 size={15} />Delete selected</Button></div>}
      <div className="mt-5">{rows.length ? <DataTable columns={selectableColumns} rows={rows} onRowClick={openItem} mobileCard={(item) => <><strong>{item.title || item.question || item.name}</strong><p className="mt-2 text-xs text-muted">{item.category || item.description || 'Product information'}</p>{!isProduct && <StatusChip status={item.status} />}</>} /> : <EmptyState title={`No ${title} yet`} action={!isReadOnly ? (isProduct ? 'Generate content' : (isFaq ? 'Add FAQ' : 'Add SOP')) : undefined} onAction={!isReadOnly ? (isProduct ? () => navigate('/app?generate=1') : createBlank) : undefined} />}</div>
    </section>
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={isProduct ? 'Products' : isNewItem ? (isFaq ? 'New FAQ' : 'New SOP') : selected?.title || selected?.question || selected?.name || title} width="max-w-none" footer={footer}>{selected && <div className="detail-enter grid gap-4">{selected.id === initialDraft?.id && <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-slate-700"><strong className="text-ink">Unsaved Orb draft.</strong> Review it, then choose Save or Approve when you are ready.</div>}{isSop ? <SopFlow sop={selected} onChange={isReadOnly ? undefined : setSelected} disabled={isReadOnly} /> : <div className="detail-enter">{isProduct ? productEditor : <div className="grid gap-4"><Input label="Question" disabled={isReadOnly} value={selected.question || ''} onChange={(event) => setSelected({ ...selected, question: event.target.value })} /><Textarea label="Answer" disabled={isReadOnly} value={selected.answer || ''} onChange={(event) => setSelected({ ...selected, answer: event.target.value })} /><Select label="Category" disabled={isReadOnly} value={selected.category || ''} onChange={(event) => setSelected({ ...selected, category: event.target.value })}><option>Support</option><option>Billing</option><option>Product</option></Select></div>}</div>}</div>}</Drawer>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={deleteItems} description="This item will be permanently removed." />
    <ConfirmDialog open={confirmApproveAll} onClose={() => setConfirmApproveAll(false)} onConfirm={() => { setConfirmApproveAll(false); approve(draftIds) }} title="Approve all drafts?" description={`${draftIds.length} ${draftIds.length === 1 ? 'draft will' : 'drafts will'} be marked approved and become available to Create with Orb.`} confirmLabel="Approve all" />
  </div>
}
