import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import DataTable from '../ui/DataTable'
import Drawer from '../ui/Drawer'
import EmptyState from '../ui/EmptyState'
import Input from '../ui/Input'
import KnowledgeAccessState from './KnowledgeAccessState'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import StatusChip from '../ui/StatusChip'
import Textarea from '../ui/Textarea'
import SopFlow from './SopFlow'
import useAsync from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'

const titles = { sop: 'SOPs', faq: 'FAQs', product: 'Products' }

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

function ShopifyProductWorkspace({ product, onChange }) {
  const variants = Array.isArray(product.variants) ? product.variants : []
  const metafields = Array.isArray(product.metafields) ? product.metafields : []
  const savedMedia = Array.isArray(product.media) ? product.media : []
  const media = savedMedia.length ? savedMedia : product.featuredImage?.url ? [{ id: 'featured-image', image: product.featuredImage, alt: product.featuredImage.altText || '' }] : []
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [expandedReferences, setExpandedReferences] = useState({})
  const visibleMedia = showAllMedia ? media : media.slice(0, 4)
  useEffect(() => { setShowAllMedia(false); setExpandedReferences({}) }, [product.id])
  const fieldClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-purple focus:ring-2 focus:ring-purple/15'
  const update = (key, value) => onChange({ ...product, [key]: value })
  const updateMedia = (index, patch) => update('media', media.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, image: { ...(item.image || item.preview?.image || {}), ...(patch.image || {}) } } : item))
  const updateVariant = (index, patch) => update('variants', variants.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const updateMetafield = (index, patch) => update('metafields', metafields.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const state = String(product.status || 'DRAFT').toUpperCase()
  return <div className="product-workspace mx-auto max-w-[1320px] pb-4">
    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_290px]">
      <main className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-extrabold tracking-tight text-ink">{product.name || 'Untitled product'}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${state === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{state === 'ACTIVE' ? 'Active' : state.charAt(0) + state.slice(1).toLowerCase()}</span></div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><label className="block text-sm font-bold text-ink">Title<input className={fieldClass} value={product.name || ''} onChange={(event) => update('name', event.target.value)} /></label><label className="mt-4 block text-sm font-bold text-ink">Description<textarea className={`${fieldClass} min-h-44 resize-y leading-6`} value={product.description || ''} onChange={(event) => update('description', event.target.value)} /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-ink">Price<input className={fieldClass} value={product.price || ''} onChange={(event) => update('price', event.target.value)} /></label><label className="block text-sm font-bold text-ink">Product URL<input className={fieldClass} value={product.url || ''} onChange={(event) => update('url', event.target.value)} /></label></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-ink">Media</h2><p className="mt-1 text-sm text-slate-500">Product imagery imported from Shopify.</p></div><button type="button" onClick={() => update('media', [...media, { alt: '', image: { url: '', altText: '' } }])} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm hover:bg-slate-50"><Plus size={16} />Add media</button></div>{media.length ? <><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{visibleMedia.map((item, index) => { const image = item.image || item.preview?.image || {}; const source = image.url || ''; const mediaIndex = media.indexOf(item); return <div key={item.id || `${source}-${mediaIndex}`} className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><div className="aspect-square bg-slate-100">{source ? <img src={source} alt={item.alt || image.altText || product.name || ''} className="h-full w-full object-cover" /> : <label className="grid h-full cursor-pointer place-items-center p-3 text-center text-xs font-bold text-slate-400">Image URL<input className="sr-only" value={source} onChange={(event) => updateMedia(mediaIndex, { image: { ...image, url: event.target.value } })} /></label>}</div><div className="flex items-center gap-2 border-t border-slate-200 bg-white px-2 py-2"><input aria-label="Image alt text" className="min-w-0 flex-1 bg-transparent text-xs outline-none" value={item.alt || image.altText || ''} placeholder="Alt text" onChange={(event) => updateMedia(mediaIndex, { alt: event.target.value, image: { ...image, altText: event.target.value } })} /><button type="button" aria-label="Remove media" onClick={() => update('media', media.filter((_, itemIndex) => itemIndex !== mediaIndex))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div> })}</div>{media.length > 4 ? <button type="button" onClick={() => setShowAllMedia((value) => !value)} className="mt-4 text-sm font-bold text-purple hover:text-purple/75">{showAllMedia ? 'Show less' : `Show all ${media.length} media`}</button> : null}</> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No media is stored for this product yet. Use Sync to import it from Shopify.</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Variants</h2>{variants.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-500"><span>Variant</span><span>SKU</span><span>Price</span></div>{variants.map((variant, index) => <div key={variant.id || index} className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-3 border-b border-slate-100 px-3 py-3 last:border-0"><input className="min-w-0 bg-transparent text-sm font-semibold outline-none" value={variant.title || ''} onChange={(event) => updateVariant(index, { title: event.target.value })} /><input className="min-w-0 bg-transparent text-sm outline-none" value={variant.sku || ''} placeholder="No SKU" onChange={(event) => updateVariant(index, { sku: event.target.value })} /><input className="min-w-0 bg-transparent text-sm outline-none" value={variant.price?.amount || ''} onChange={(event) => updateVariant(index, { price: { ...(variant.price || {}), amount: event.target.value } })} /></div>)}</div> : <p className="mt-4 text-sm text-slate-500">No variants were returned by Shopify.</p>}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold text-ink">Metafields</h2><p className="mt-1 text-sm text-slate-500">Populated fields synced directly from this Shopify product.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 shadow-sm">{metafields.length}</span></div>{metafields.length ? <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">{metafields.map((field, index) => { const references = metafieldReferences(field); const fieldKey = field.id || `${field.namespace}-${field.key}-${index}`; const allReferencesVisible = Boolean(expandedReferences[fieldKey]); const displayedReferences = allReferencesVisible ? references : references.slice(0, 4); const editableText = metafieldEditableText(field); const type = String(field.type || '').toLowerCase(); const isReferenceField = type.includes('reference'); const isLongText = editableText.length > 150 || type === 'rich_text_field' || type.includes('multi_line'); return <div key={fieldKey} className="grid gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5"><div className="min-w-0 pt-1"><h3 className="truncate text-sm font-semibold text-ink" title={metafieldDisplayName(field)}>{metafieldDisplayName(field)}</h3></div><div className="min-w-0">{references.length ? <div className="flex flex-wrap gap-1.5">{displayedReferences.map((reference, referenceIndex) => { const image = metafieldReferenceImage(reference); return <span key={reference.id || `${reference.__typename}-${referenceIndex}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">{image ? <img src={image} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-[9px] text-slate-500">{reference.__typename === 'Product' ? 'P' : '↗'}</span>}<span className="max-w-48 truncate">{metafieldReferenceLabel(reference)}</span></span> })}{references.length > 4 ? <button type="button" onClick={() => setExpandedReferences((current) => ({ ...current, [fieldKey]: !allReferencesVisible }))} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-purple">{allReferencesVisible ? 'Show less' : `Show ${references.length - 4} more`}</button> : null}</div> : isReferenceField ? <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">Sync to load the linked Shopify item</span> : isLongText ? <textarea aria-label={metafieldDisplayName(field)} className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 shadow-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/15" value={editableText} onChange={(event) => updateMetafield(index, { value: metafieldValueFromText(field, event.target.value) })} /> : <input aria-label={metafieldDisplayName(field)} className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm leading-5 text-slate-700 shadow-sm outline-none focus:border-purple focus:ring-2 focus:ring-purple/15" value={editableText} onChange={(event) => updateMetafield(index, { value: metafieldValueFromText(field, event.target.value) })} />}</div></div> })}</div> : <p className="mt-4 text-sm text-slate-500">No populated metafields were returned by Shopify.</p>}</section>
      </main>
      <aside className="space-y-5 xl:sticky xl:top-0"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Status</h2><select className={fieldClass} value={state} onChange={(event) => update('status', event.target.value)}><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select><div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-extrabold text-ink">Publishing</h3><p className="mt-2 text-sm text-slate-500">Changes are saved to Orb’s support knowledge. Sync refreshes this product from Shopify.</p></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Product organization</h2><label className="mt-4 block text-sm font-bold">Type<input className={fieldClass} value={product.productType || ''} onChange={(event) => update('productType', event.target.value)} /></label><label className="mt-4 block text-sm font-bold">Vendor<input className={fieldClass} value={product.vendor || ''} onChange={(event) => update('vendor', event.target.value)} /></label><label className="mt-4 block text-sm font-bold">Collections / tags<input className={fieldClass} value={(product.tags || []).join(', ')} onChange={(event) => update('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} /></label></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-ink">Search preview</h2><label className="mt-4 block text-sm font-bold">SEO title<input className={fieldClass} value={product.seo?.title || ''} onChange={(event) => update('seo', { ...(product.seo || {}), title: event.target.value })} /></label><label className="mt-4 block text-sm font-bold">SEO description<textarea className={`${fieldClass} min-h-24 resize-y`} value={product.seo?.description || ''} onChange={(event) => update('seo', { ...(product.seo || {}), description: event.target.value })} /></label></section></aside>
    </div>
  </div>
}

export default function ContentListPage({ kind, list, update, remove, syncProducts, saveProductMetafields }) {
  const title = titles[kind] || 'Content'
  const isSop = kind === 'sop'
  const isProduct = kind === 'product'
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [brandVersion, setBrandVersion] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState([])
  const [confirm, setConfirm] = useState(false)
  const [confirmApproveAll, setConfirmApproveAll] = useState(false)
  const [approving, setApproving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [savingShopify, setSavingShopify] = useState(false)
  const scrollPosition = useRef(0)

  useEffect(() => {
    const reloadForBrand = () => setBrandVersion((version) => version + 1)
    window.addEventListener('orb:brand-changed', reloadForBrand)
    return () => window.removeEventListener('orb:brand-changed', reloadForBrand)
  }, [])

  const { data: fetchedData, loading, error, reload } = useAsync(list, [list, brandVersion])
  const data = Array.isArray(fetchedData) ? fetchedData : []
  const rows = useMemo(() => data.filter((item) => {
    const text = [item.title, item.question, item.name, item.description, item.category].filter(Boolean).join(' ').toLowerCase()
    return (isProduct || status === 'All' || item.status === status) && text.includes(query.toLowerCase())
  }), [data, isProduct, query, status])
  const draftIds = useMemo(() => data
    .filter((item) => String(item.status || '').toLowerCase() === 'draft')
    .map((item) => item.id), [data])

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
  const save = async () => {
    try {
      await update(selected)
      showToast('Saved.')
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
  const saveMetafieldsToShopify = async () => {
    if (!saveProductMetafields || !selected) return
    setSavingShopify(true)
    try {
      const result = await saveProductMetafields(selected)
      await reload()
      showToast(`${result?.saved || 0} metafield${result?.saved === 1 ? '' : 's'} saved to Shopify.`)
    } catch (saveError) { showToast(saveError.message || 'Could not save metafields to Shopify.') } finally { setSavingShopify(false) }
  }

  const columns = isSop
    ? [{ key: 'title', label: 'Title / situation', render: (item) => <div><strong>{item.title}</strong><p className="text-xs text-muted">{item.situation}</p></div> }, { key: 'category', label: 'Category' }, { key: 'lifecycle', label: 'Lifecycle stage' }, { key: 'status', label: 'Status', render: (item) => <StatusChip status={item.status} /> }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated' }]
    : isProduct
      ? [{ key: 'name', label: 'Product' }, { key: 'description', label: 'Description', render: (item) => <span className="line-clamp-2 text-muted">{item.description || '—'}</span> }, { key: 'price', label: 'Price', render: (item) => item.price || '—' }, { key: 'url', label: 'Product URL', render: (item) => item.url ? <span className="line-clamp-1 text-purple">{item.url}</span> : '—' }]
      : [{ key: 'question', label: 'Question' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status', render: (item) => <StatusChip status={item.status} /> }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated' }]

  if (loading) return <div className="grid gap-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16" />)}</div>
  if (error) return <KnowledgeAccessState error={error} title={title} onRetry={reload} />

  const selectableColumns = isProduct ? columns : [{ key: 'select', label: '', render: (item) => <input aria-label={`Select ${item.title || item.question}`} type="checkbox" checked={checked.includes(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(item.id)} /> }, ...columns]
  const productEditor = <ShopifyProductWorkspace product={selected || {}} onChange={setSelected} />
  const footer = selected && <div className="flex flex-wrap gap-2">{isProduct && saveProductMetafields && <Button variant="purple" onClick={saveMetafieldsToShopify} disabled={savingShopify}>{savingShopify ? 'Saving to Shopify…' : 'Save metafields to Shopify'}</Button>}<Button variant={isProduct && saveProductMetafields ? 'outline' : 'purple'} onClick={save}>{isProduct && saveProductMetafields ? 'Save in Orb only' : 'Save'}</Button>{!isProduct && <Button variant="outline" onClick={() => approve([selected.id])}>Approve</Button>}<Button variant="dark" onClick={() => setConfirm(true)}>Delete</Button></div>

  return <div className="page-enter mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-extrabold uppercase tracking-widest text-purple">Knowledge library</p><h2 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h2></div>
      <div className="flex flex-wrap gap-2">
        {!isProduct && draftIds.length > 0 && <Button variant="outline" onClick={() => setConfirmApproveAll(true)} disabled={approving}><Check size={16} />Approve all drafts ({draftIds.length})</Button>}
        {isProduct && syncProducts && <Button variant="outline" onClick={sync} disabled={syncing}><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Syncing…' : 'Sync'}</Button>}
        <Button onClick={() => navigate('/app?generate=1')}><Plus size={16} />Generate more</Button>
      </div>
    </div>
    <section className="mt-6 rounded-lg border-2 border-ink bg-white p-4 shadow-brutal">
      <div className={`grid gap-3 ${isProduct ? 'md:grid-cols-[1fr_150px]' : 'md:grid-cols-[1fr_150px_150px]'}`}>
        <label className="flex items-center gap-2 rounded-md border-2 border-ink px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 outline-none" value={query} placeholder={`Search ${title}`} onChange={(event) => setQuery(event.target.value)} /></label>
        {!isProduct && <Select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Draft</option><option>Approved</option></Select>}
        <Select aria-label="Sort content"><option>Last updated</option><option>Title</option></Select>
      </div>
      {!isProduct && checked.length > 0 && <div className="mt-4 flex gap-2"><Button variant="purple" size="sm" onClick={() => approve()} disabled={approving}><Check size={15} />Approve selected</Button><Button variant="outline" size="sm" onClick={() => setConfirm(true)}><Trash2 size={15} />Delete selected</Button></div>}
      <div className="mt-5">{rows.length ? <DataTable columns={selectableColumns} rows={rows} onRowClick={openItem} mobileCard={(item) => <><strong>{item.title || item.question || item.name}</strong><p className="mt-2 text-xs text-muted">{item.category || item.description || 'Product information'}</p>{!isProduct && <StatusChip status={item.status} />}</>} /> : <EmptyState title={`No ${title} yet`} action="Generate content" onAction={() => navigate('/app?generate=1')} />}</div>
    </section>
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={isProduct ? 'Products' : selected?.title || selected?.question || selected?.name || title} width="max-w-none" footer={footer}>{selected && <div className="detail-enter grid gap-4">{isSop ? <SopFlow sop={selected} onChange={setSelected} /> : <div className="detail-enter">{isProduct ? productEditor : <div className="grid gap-4"><Input label="Question" value={selected.question || ''} onChange={(event) => setSelected({ ...selected, question: event.target.value })} /><Textarea label="Answer" value={selected.answer || ''} onChange={(event) => setSelected({ ...selected, answer: event.target.value })} /><Select label="Category" value={selected.category || ''} onChange={(event) => setSelected({ ...selected, category: event.target.value })}><option>Support</option><option>Billing</option><option>Product</option></Select></div>}</div>}</div>}</Drawer>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={deleteItems} description="This item will be permanently removed." />
    <ConfirmDialog open={confirmApproveAll} onClose={() => setConfirmApproveAll(false)} onConfirm={() => { setConfirmApproveAll(false); approve(draftIds) }} title="Approve all drafts?" description={`${draftIds.length} ${draftIds.length === 1 ? 'draft will' : 'drafts will'} be marked approved and become available to Create with Orb.`} confirmLabel="Approve all" />
  </div>
}
