import React, { useCallback, useEffect, useState } from 'react'
import { FileText, Loader2, RefreshCw } from 'lucide-react'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import OrbLoader from '../components/ui/OrbLoader'
import useAsync from '../hooks/useAsync'
import { activeBrandName, hasOrbApi, listMessageTemplates, syncZokoTemplates } from '../services/orbApi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const badgeTone = (status) => String(status || '').toUpperCase() === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'

export default function Templates() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  const [brandName, setBrandName] = useState(() => activeBrandName())
  const [syncing, setSyncing] = useState(false)
  const loadTemplates = useCallback(() => listMessageTemplates(brandName), [brandName])
  const { data, loading, error, refreshing, reload } = useAsync(loadTemplates, [loadTemplates])
  const templates = Array.isArray(data?.templates) ? data.templates : []

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
      const report = result?.report || {}
      const skipped = (report.skipped_media_header?.length || 0) + (report.skipped_inactive?.length || 0)
      showToast(`${result?.inserted || 0} Zoko template${result?.inserted === 1 ? '' : 's'} added${skipped ? `; ${skipped} skipped safely` : ''}.`)
      await reload()
    } catch (failure) {
      showToast(failure instanceof Error ? failure.message : 'Could not sync Zoko templates.', 'error')
    } finally { setSyncing(false) }
  }

  if (!hasOrbApi) return <section className="rounded-xl border border-slate-200 bg-white p-6"><p className="font-bold">Templates need the Orb API connection.</p></section>
  return <div className="page-enter mx-auto max-w-6xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Customer messaging</p><div className="mt-1 flex items-center gap-3"><h2 className="text-3xl font-extrabold tracking-tight">Templates</h2>{!loading && <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-extrabold text-primary">{templates.length} template{templates.length === 1 ? '' : 's'}</span>}</div><p className="mt-2 max-w-2xl text-sm text-slate-600">Approved WhatsApp templates for {brandName || 'the selected brand'}. Use them in flows to send consistent, approved messages.</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={reload} disabled={loading || refreshing || syncing}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />Refresh</Button>{isAdmin && <Button size="sm" onClick={sync} disabled={!brandName || syncing}>{syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{syncing ? 'Syncing…' : 'Sync from Zoko'}</Button>}</div>
    </header>
    {isAdmin && <p className="mt-5 rounded-lg border border-primary/20 bg-primary-tint/35 px-4 py-3 text-xs leading-5 text-slate-600">Syncing imports only new Zoko templates. Existing templates are never overwritten, while media-header and inactive templates are skipped safely.</p>}
    {loading ? <OrbLoader label="Loading templates" className="min-h-[320px]" /> : error ? <section className="mt-6 rounded-xl border border-red-200 bg-white p-6"><p className="font-bold text-red-700">Could not load templates.</p><p className="mt-1 text-sm text-slate-600">{error.message}</p><Button className="mt-4" size="sm" onClick={reload}>Try again</Button></section> : templates.length ? <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(180px,0.8fr)_minmax(280px,2fr)_100px_110px] gap-5 border-b border-slate-200 bg-peach px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 md:grid"><span>Template</span><span>Message</span><span>Language</span><span>Status</span></div><div>{templates.map((template) => <article key={template.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[minmax(180px,0.8fr)_minmax(280px,2fr)_100px_110px] md:gap-5"><div className="flex gap-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary-tint text-primary"><FileText size={16} /></span><div><h3 className="text-sm font-extrabold text-slate-800">{template.name || 'Untitled template'}</h3><p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{template.type || 'message template'}</p></div></div><p className="whitespace-pre-line text-sm leading-6 text-slate-600">{template.content || 'No message body saved.'}</p><p className="text-sm text-slate-600"><span className="md:hidden font-bold">Language: </span>{template.language || 'en'}</p><span className={`inline-flex h-fit w-fit rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${badgeTone(template.status)}`}>{template.status || 'Unknown'}</span></article>)}</div></section> : <section className="mt-6 rounded-xl border border-slate-200 bg-white"><EmptyState title="No templates yet" description={isAdmin ? 'Sync approved message templates from Zoko to use them in flows.' : 'No approved message templates have been added for this brand.'} action={isAdmin ? 'Sync from Zoko' : undefined} onAction={isAdmin ? sync : undefined} /></section>}
  </div>
}
