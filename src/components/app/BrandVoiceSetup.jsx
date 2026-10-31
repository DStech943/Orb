import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileText, Loader2, Trash2, Upload, Wand2 } from 'lucide-react'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import { useToast } from '../../context/ToastContext'
import { hasOrbApi, approveBrandVoice, deleteBrandVoiceSource, generateBrandVoice, getBrandVoice, importBrandVoiceSource } from '../../services/orbApi'

const emptyProfile = { id: '', profile: {}, drafting_prompt: '', status: 'draft' }

function currentBrand() {
  return {
    id: window.localStorage.getItem('orb_selected_brand') || '',
    name: window.localStorage.getItem('orb_selected_brand_name') || '',
  }
}

function ProfilePreview({ profile }) {
  if (!profile?.profile || !Object.keys(profile.profile).length) return null
  const items = [
    ['Voice', profile.profile.summary],
    ['Tone', profile.profile.tone_traits?.join(' · ')],
    ['Addressing', profile.profile.addressing],
    ['Emoji policy', profile.profile.emoji_policy],
    ['Response length', profile.profile.response_length],
  ].filter(([, value]) => value)
  return <div className="grid gap-3 rounded-lg border border-ink/15 bg-slate-50 p-4 sm:grid-cols-2">
    {items.map(([label, value]) => <div key={label}><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value}</p></div>)}
  </div>
}

export default function BrandVoiceSetup({ isAdmin }) {
  const { showToast } = useToast()
  const fileInput = useRef(null)
  const [brand, setBrand] = useState(currentBrand)
  const [sources, setSources] = useState([])
  const [profiles, setProfiles] = useState([])
  const [paste, setPaste] = useState('')
  const [label, setLabel] = useState('Voice onboarding')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [draft, setDraft] = useState(emptyProfile)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async (brandId = brand.id) => {
    if (!brandId || !hasOrbApi) return
    setLoading(true)
    setLoadError('')
    try {
      const result = await getBrandVoice(brandId)
      setSources(result?.sources || [])
      const nextProfiles = result?.profiles || []
      setProfiles(nextProfiles)
      const preferred = nextProfiles.find((item) => item.status === 'draft') || nextProfiles.find((item) => item.status === 'approved') || emptyProfile
      setDraft(preferred)
    } catch (error) {
      // This runs automatically (and React development mode may mount twice),
      // so use one calm inline notice rather than stacking duplicate toasts.
      setLoadError(error.message || 'Could not load brand voice.')
    } finally {
      setLoading(false)
    }
  }, [brand.id, showToast])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onBrandChange = () => {
      const next = currentBrand()
      setBrand(next)
      setSources([])
      setProfiles([])
      setDraft(emptyProfile)
      if (next.id) load(next.id)
    }
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => window.removeEventListener('orb:brand-changed', onBrandChange)
  }, [load])

  const importSource = async ({ content, kind, sourceLabel }) => {
    if (!brand.id) return showToast('Choose a brand from the top bar first.')
    if (content.trim().length < 10) return showToast('Add more voice material before importing.')
    setImporting(true)
    try {
      await importBrandVoiceSource(brand.id, { content, kind, label: sourceLabel || label })
      setPaste('')
      setLabel('Voice onboarding')
      await load(brand.id)
      showToast('Voice material imported.')
    } catch (error) {
      showToast(error.message || 'Could not import voice material.', 'error')
    } finally {
      setImporting(false)
    }
  }

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.(csv|txt|md)$/i.test(file.name)) return showToast('Use a CSV, TXT, or Markdown file for voice onboarding.')
    if (file.size > 100_000) return showToast('Keep each voice file below 100 KB.')
    const content = await file.text()
    await importSource({ content, kind: /\.csv$/i.test(file.name) ? 'csv' : 'paste', sourceLabel: file.name })
  }

  const removeSource = async (sourceId) => {
    try {
      await deleteBrandVoiceSource(brand.id, sourceId)
      await load(brand.id)
      showToast('Voice source removed.')
    } catch (error) {
      showToast(error.message || 'Could not remove voice source.', 'error')
    }
  }

  const generate = async () => {
    if (!sources.length) return showToast('Import voice material first.')
    setGenerating(true)
    try {
      const result = await generateBrandVoice(brand.id)
      setDraft(result.profile)
      await load(brand.id)
      showToast('Voice profile draft generated. Review it before approving.')
    } catch (error) {
      showToast(error.message || 'Could not generate the voice profile.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const approve = async () => {
    if (!draft.id || !draft.drafting_prompt.trim()) return
    setApproving(true)
    try {
      const result = await approveBrandVoice(brand.id, draft.id, { profile: draft.profile, drafting_prompt: draft.drafting_prompt })
      setDraft(result.profile)
      await load(brand.id)
      showToast('Brand voice approved and ready for new SOP and FAQ drafts.')
    } catch (error) {
      showToast(error.message || 'Could not approve the voice profile.', 'error')
    } finally {
      setApproving(false)
    }
  }

  if (!isAdmin) return <p className="rounded-md border border-ink/15 bg-peach p-3 text-sm text-muted">An administrator can import and approve the brand voice used for drafting.</p>
  if (!hasOrbApi) return <p className="rounded-md border border-ink/15 bg-peach p-3 text-sm text-muted">Start the Orb backend to import and approve a brand voice.</p>

  return <section className="grid max-w-3xl gap-6">
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand voice</p>
      <h3 className="mt-1 text-xl font-extrabold">How should Orb sound?</h3>
      <p className="mt-1 text-sm text-muted">Import your onboarding answers, style guide, or Google Form CSV. Orb creates a compact draft for your review; only the approved version is used in new SOP and FAQ drafts.</p>
      <p className="mt-2 text-xs font-bold text-purple">Active brand: {brand.name || 'Choose a brand in the top bar'}</p>
    </div>

    {loadError && <div role="alert" className="animate-page-in rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>}

    <div className="rounded-lg border border-ink/15 bg-peach p-4">
      <p className="font-extrabold">Import onboarding material</p>
      <p className="mt-1 text-sm text-muted">Paste a voice guide or upload a Google Form CSV, TXT, or Markdown export. Raw material is sent to the configured model only when you select Generate voice profile.</p>
      <input className="mt-4 w-full rounded-md border-2 border-ink bg-white px-3 py-2 text-sm" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Source label" />
      <Textarea className="mt-3" label="Paste voice guidelines" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste brand adjectives, preferred wording, examples, do/don't rules, or your full onboarding response…" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="purple" size="sm" onClick={() => importSource({ content: paste, kind: 'paste' })} disabled={importing || !brand.id}>{importing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}Import pasted text</Button>
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importing || !brand.id}><Upload size={15} />Upload CSV / TXT / MD</Button>
        <input ref={fileInput} className="hidden" type="file" accept=".csv,.txt,.md,text/csv,text/plain,text/markdown" onChange={chooseFile} />
      </div>
    </div>

    <div>
      <div className="flex items-center justify-between gap-3"><div><h4 className="font-extrabold">Imported material</h4><p className="text-sm text-muted">You can remove an outdated source before generating.</p></div>{loading && <Loader2 size={16} className="animate-spin text-purple" />}</div>
      {sources.length ? <ul className="mt-3 divide-y rounded-lg border border-ink/15 bg-white">{sources.map((source) => <li key={source.id} className="flex items-center gap-3 px-4 py-3"><FileText size={16} className="text-purple" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{source.label}</p><p className="text-xs text-muted">{source.kind.toUpperCase()} · {source.characters.toLocaleString()} characters</p></div><button type="button" aria-label={`Remove ${source.label}`} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" onClick={() => removeSource(source.id)}><Trash2 size={16} /></button></li>)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-ink/20 p-4 text-sm text-muted">No voice material has been imported for this brand.</p>}
    </div>

    <div className="flex flex-wrap items-center gap-3 border-t border-ink/15 pt-5">
      <Button variant="purple" onClick={generate} disabled={generating || !sources.length}>{generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}Generate voice profile</Button>
      {profiles.find((item) => item.status === 'approved') && <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} />An approved voice is active</span>}
    </div>

    {draft.id && <section className="rounded-xl border-2 border-ink bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-purple">{draft.status === 'approved' ? 'Active voice profile' : 'Review draft'}</p><h4 className="mt-1 text-lg font-extrabold">Drafting prompt</h4></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${draft.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{draft.status}</span></div>
      <div className="mt-4"><ProfilePreview profile={draft} /></div>
      <Textarea className="mt-4" label="Approved voice prompt" value={draft.drafting_prompt} onChange={(event) => setDraft({ ...draft, drafting_prompt: event.target.value })} />
      {draft.status !== 'approved' && <Button variant="purple" className="mt-4" onClick={approve} disabled={approving || !draft.drafting_prompt.trim()}>{approving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Approve voice for drafting</Button>}
    </section>}
  </section>
}
