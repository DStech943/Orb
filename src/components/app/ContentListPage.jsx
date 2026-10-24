import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import DataTable from '../ui/DataTable'
import Drawer from '../ui/Drawer'
import EmptyState from '../ui/EmptyState'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import StatusChip from '../ui/StatusChip'
import Textarea from '../ui/Textarea'
import SopFlow from './SopFlow'
import useAsync from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'

const titles = { sop: 'SOPs', faq: 'FAQs', product: 'Products' }

export default function ContentListPage({ kind, list, update, remove }) {
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
  const [sopView, setSopView] = useState('flow')
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

  const openItem = (item) => {
    scrollPosition.current = window.scrollY
    setSelected(item)
    setSopView('flow')
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
    await Promise.all(ids.map((id) => update({ ...data.find((item) => item.id === id), status: 'Approved' })))
    setChecked([])
    setSelected(null)
    reload()
    showToast('Approved.')
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

  const columns = isSop
    ? [{ key: 'title', label: 'Title / situation', render: (item) => <div><strong>{item.title}</strong><p className="text-xs text-muted">{item.situation}</p></div> }, { key: 'category', label: 'Category' }, { key: 'lifecycle', label: 'Lifecycle stage' }, { key: 'status', label: 'Status', render: (item) => <StatusChip status={item.status} /> }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated' }]
    : isProduct
      ? [{ key: 'name', label: 'Product' }, { key: 'description', label: 'Description', render: (item) => <span className="line-clamp-2 text-muted">{item.description || '—'}</span> }, { key: 'price', label: 'Price', render: (item) => item.price || '—' }, { key: 'url', label: 'Product URL', render: (item) => item.url ? <span className="line-clamp-1 text-purple">{item.url}</span> : '—' }]
      : [{ key: 'question', label: 'Question' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status', render: (item) => <StatusChip status={item.status} /> }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated' }]

  if (loading) return <div className="grid gap-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16" />)}</div>
  if (error) return <EmptyState title={error.message || `Could not load ${title}.`} action="Retry" onAction={reload} />

  const selectableColumns = isProduct ? columns : [{ key: 'select', label: '', render: (item) => <input aria-label={`Select ${item.title || item.question}`} type="checkbox" checked={checked.includes(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(item.id)} /> }, ...columns]
  const sopEditor = <div className="grid gap-4"><Input label="Situation" value={selected?.situation || ''} onChange={(event) => setSelected({ ...selected, situation: event.target.value })} /><Input label="Check first" value={selected?.checkFirst || ''} onChange={(event) => setSelected({ ...selected, checkFirst: event.target.value })} /><Textarea label="What to do" value={selected?.whatToDo || ''} onChange={(event) => setSelected({ ...selected, whatToDo: event.target.value })} /><Textarea label="What to say" value={selected?.whatToSay || ''} onChange={(event) => setSelected({ ...selected, whatToSay: event.target.value })} /><Input label="Escalate to" value={selected?.escalateTo || ''} onChange={(event) => setSelected({ ...selected, escalateTo: event.target.value })} /><Select label="Category" value={selected?.category || ''} onChange={(event) => setSelected({ ...selected, category: event.target.value })}><option>Support</option><option>Billing</option><option>Product</option></Select><Select label="Lifecycle stage" value={selected?.lifecycle || ''} onChange={(event) => setSelected({ ...selected, lifecycle: event.target.value })}><option>Customer</option><option>Lead</option><option>Internal</option></Select></div>
  const productEditor = <div className="grid gap-4"><Input label="Product name" value={selected?.name || ''} onChange={(event) => setSelected({ ...selected, name: event.target.value })} /><Textarea label="Description" value={selected?.description || ''} onChange={(event) => setSelected({ ...selected, description: event.target.value })} /><Input label="Price" value={selected?.price || ''} onChange={(event) => setSelected({ ...selected, price: event.target.value })} /><Input label="Product URL" type="url" value={selected?.url || ''} onChange={(event) => setSelected({ ...selected, url: event.target.value })} /></div>
  const footer = selected && <div className="flex flex-wrap gap-2">{(isProduct || !isSop || sopView === 'edit') && <Button variant="purple" onClick={save}>Save</Button>}{!isProduct && <Button variant="outline" onClick={() => approve([selected.id])}>Approve</Button>}<Button variant="dark" onClick={() => setConfirm(true)}>Delete</Button></div>

  return <div className="page-enter mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-widest text-purple">Knowledge library</p><h2 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h2></div><Button onClick={() => navigate('/app?generate=1')}><Plus size={16} />Generate more</Button></div><section className="mt-6 rounded-lg border-2 border-ink bg-white p-4 shadow-brutal"><div className={`grid gap-3 ${isProduct ? 'md:grid-cols-[1fr_150px]' : 'md:grid-cols-[1fr_150px_150px]'}`}><label className="flex items-center gap-2 rounded-md border-2 border-ink px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 outline-none" value={query} placeholder={`Search ${title}`} onChange={(event) => setQuery(event.target.value)} /></label>{!isProduct && <Select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Draft</option><option>Approved</option></Select>}<Select aria-label="Sort content"><option>Last updated</option><option>Title</option></Select></div>{!isProduct && checked.length > 0 && <div className="mt-4 flex gap-2"><Button variant="purple" size="sm" onClick={() => approve()}><Check size={15} />Approve selected</Button><Button variant="outline" size="sm" onClick={() => setConfirm(true)}><Trash2 size={15} />Delete selected</Button></div>}<div className="mt-5">{rows.length ? <DataTable columns={selectableColumns} rows={rows} onRowClick={openItem} mobileCard={(item) => <><strong>{item.title || item.question || item.name}</strong><p className="mt-2 text-xs text-muted">{item.category || item.description || 'Product information'}</p>{!isProduct && <StatusChip status={item.status} />}</>} /> : <EmptyState title={`No ${title} yet`} action="Generate content" onAction={() => navigate('/app?generate=1')} />}</div></section><Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title || selected?.question || selected?.name || title} width="max-w-none" footer={footer}>{selected && <div className="detail-enter grid gap-4">{isSop ? <><div role="tablist" aria-label="SOP detail view" className="inline-flex w-fit rounded-md border border-ink/20 bg-white p-1"><button role="tab" aria-selected={sopView === 'flow'} className={`rounded px-3 py-2 text-xs font-extrabold ${sopView === 'flow' ? 'bg-purple text-white' : 'text-muted'}`} onClick={() => setSopView('flow')}>View flow</button><button role="tab" aria-selected={sopView === 'edit'} className={`rounded px-3 py-2 text-xs font-extrabold ${sopView === 'edit' ? 'bg-purple text-white' : 'text-muted'}`} onClick={() => setSopView('edit')}>Edit SOP</button></div><div key={sopView} className="detail-enter">{sopView === 'flow' ? <SopFlow sop={selected} /> : sopEditor}</div></> : <div className="detail-enter">{isProduct ? productEditor : <div className="grid gap-4"><Input label="Question" value={selected.question || ''} onChange={(event) => setSelected({ ...selected, question: event.target.value })} /><Textarea label="Answer" value={selected.answer || ''} onChange={(event) => setSelected({ ...selected, answer: event.target.value })} /><Select label="Category" value={selected.category || ''} onChange={(event) => setSelected({ ...selected, category: event.target.value })}><option>Support</option><option>Billing</option><option>Product</option></Select></div>}</div>}</div>}</Drawer><ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={deleteItems} description="This item will be permanently removed." /></div>
}
