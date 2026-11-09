import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import OrbLoader from '../components/ui/OrbLoader'
import useAsync from '../hooks/useAsync'
import { activeBrandName, hasOrbApi, listMessageTemplates, syncZokoTemplates } from '../services/orbApi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const TYPES = ['All', 'Marketing', 'Utility', 'Authentication']

const preview = (content = '') => String(content)
  .replace(/\r/g, '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 7)
  .join('\n') || 'No message content was returned from Zoko.'

function TemplateCard({ template }) {
  return <article className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-[#e8e2d7] bg-[#f1ede5] shadow-sm">
    <div className="m-3 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm"><p className="whitespace-pre-line">{preview(template.content)}</p></div>
    <footer className="border-t border-[#e3ddd2] px-4 py-3"><h3 className="truncate text-sm font-extrabold text-slate-900">{template.name || 'Untitled template'}</h3><p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{template.type || 'Other'} · {template.language || 'en'}</p></footer>
  </article>
}

export default function Templates() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [brandName, setBrandName] = useState(() => activeBrandName())
  const [syncing, setSyncing] = useState(false)
  const [type, setType] = useState('All')
  const [language, setLanguage] = useState('All languages')
  const [query, setQuery] = useState('')
  const loadTemplates = useCallback(() => listMessageTemplates(brandName), [brandName])
  const { data, loading, error, refreshing, reload } = useAsync(loadTemplates, [loadTemplates])
  const templates = Array.isArray(data?.templates) ? data.templates : []
  const languages = useMemo(() => [...new Set(templates.map((template) => String(template.language || 'en')))].sort(), [templates])
  const visibleTemplates = useMemo(() => templates.filter((template) => {
    const matchesType = type === 'All' || String(template.type || 'Other').toLowerCase() === type.toLowerCase()
    const matchesLanguage = language === 'All languages' || String(template.language || 'en') === language
    const haystack = `${template.name || ''} ${template.content || ''}`.toLowerCase()
    return matchesType && matchesLanguage && haystack.includes(query.trim().toLowerCase())
  }), [language, query, templates, type])

  useEffect(() => {
    const onBrandChange = () => setBrandName(activeBrandName())
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => window.removeEventListener('orb:brand-changed', onBrandChange)
  }, [])

  const sync = async () => {
    if (!brandName || syncing) return
    setSyncing(true)
    try {
      const result = await syncZokoTemplates(brandName)
      const skipped = Object.values(result?.report || {}).reduce((count, value) => count + (Array.isArray(value) ? value.length : 0), 0) - (result?.report?.new?.length || 0)
      showToast(`${result?.inserted || 0} Zoko template${result?.inserted === 1 ? '' : 's'} synced${skipped > 0 ? `; ${skipped} unchanged or skipped` : ''}.`)
      await reload()
    } catch (failure) {
      showToast(failure instanceof Error ? failure.message : 'Could not sync Zoko templates.', 'error')
    } finally { setSyncing(false) }
  }

  if (!hasOrbApi) return <section className="rounded-xl border border-slate-200 bg-white p-6"><p className="font-bold">Templates need the Orb API connection.</p></section>

  return <div className="page-enter mx-auto max-w-7xl">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Zoko messaging</p><div className="mt-1 flex items-center gap-3"><h2 className="text-3xl font-extrabold tracking-tight">Templates</h2>{!loading && <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-extrabold text-primary">{templates.length}</span>}</div><p className="mt-2 max-w-2xl text-sm text-slate-600">Only WhatsApp templates synced from Zoko are shown here.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={reload} disabled={loading || refreshing || syncing}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />Refresh</Button>{isAdmin && <Button size="sm" onClick={sync} disabled={!brandName || syncing}>{syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{syncing ? 'Syncing…' : 'Sync Zoko'}</Button>}</div></header>
    {loading ? <OrbLoader label="Loading Zoko templates" className="min-h-[320px]" /> : error ? <section className="mt-6 rounded-xl border border-red-200 bg-white p-6"><p className="font-bold text-red-700">Could not load templates.</p><p className="mt-1 text-sm text-slate-600">{error.message}</p><Button className="mt-4" size="sm" onClick={reload}>Try again</Button></section> : templates.length ? <>
      <section aria-label="Template filters" className="mt-7 flex flex-col gap-3 border-y border-slate-200 py-4"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Type</span>{TYPES.map((item) => <button type="button" key={item} onClick={() => setType(item)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${type === item ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40'}`}>{item}</button>)}</div><div className="flex flex-wrap items-center gap-3"><label className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /></label><select aria-label="Filter by language" value={language} onChange={(event) => setLanguage(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"><option>All languages</option>{languages.map((item) => <option key={item}>{item}</option>)}</select></div></section>
      {visibleTemplates.length ? <section aria-label="Zoko templates" className="mt-6 columns-1 gap-4 md:columns-2 xl:columns-3">{visibleTemplates.map((template) => <TemplateCard key={template.id} template={template} />)}</section> : <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white"><EmptyState title="No matching Zoko templates" description="Try another type, language, or search term." /></section>}
    </> : <section className="mt-6 rounded-xl border border-slate-200 bg-white"><EmptyState title="No Zoko templates synced yet" description={isAdmin ? 'Sync Zoko to add its approved WhatsApp templates for this brand.' : 'There are no Zoko-synced templates for this brand yet.'} action={isAdmin ? 'Sync Zoko' : undefined} onAction={isAdmin ? sync : undefined} /></section>}
  </div>
}
