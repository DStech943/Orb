import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PageHeader from '../components/ui/PageHeader'
import Tabs from '../components/ui/Tabs'
import Textarea from '../components/ui/Textarea'
import BrandCategorySetup from '../components/app/BrandCategorySetup'
import BrandVoiceSetup from '../components/app/BrandVoiceSetup'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { useToast } from '../context/ToastContext'
import { listBrands } from '../services/brands'
import { hasOrbApi, setRemoteBrandProfile } from '../services/orbApi'
import AgentChat from './AgentChat'
import PipelineWorkspace from '../components/app/PipelineWorkspace'

const TAB_IDS = ['business', 'source', 'voice', 'chat']
const EMPTY_PROFILE = { website_url: '', support_email: '', description: '' }

const profileOf = (brand) => ({
  website_url: brand?.profile?.website_url || '',
  support_email: brand?.profile?.support_email || '',
  description: brand?.description || '',
})

export default function Workspace() {
  const [params, setParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const { brand, brandName, agentName } = useBrand()
  const { showToast } = useToast()
  const requested = params.get('tab')
  const active = TAB_IDS.includes(requested) ? requested : 'business'
  const [brandId, setBrandId] = useState('')
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [saved, setSaved] = useState(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const dirty = useMemo(() => JSON.stringify(profile) !== JSON.stringify(saved), [profile, saved])

  useEffect(() => {
    let live = true
    const load = async () => {
      setLoading(true)
      try {
        const brands = await listBrands()
        if (!live) return
        const activeId = window.localStorage.getItem('orb_selected_brand') || ''
        const current = brands.find((item) => item.id === activeId) || brands[0]
        if (current) {
          setBrandId(current.id)
          setProfile(profileOf(current))
          setSaved(profileOf(current))
        }
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [brand?.id])

  // Warn before the browser tab is closed with edits that were not saved.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const changeTab = (next) => {
    if (next === active) return
    if (dirty && !window.confirm('You have unsaved changes to the brand profile. Leave this tab and discard them?')) return
    setProfile(saved)
    setParams({ tab: next }, { replace: true })
  }

  const update = (field) => (event) => setProfile((current) => ({ ...current, [field]: event.target.value }))

  const save = async () => {
    if (!brandId) return
    if (!hasOrbApi) return showToast('Start the Orb backend to save the brand profile.', 'error')
    setSaving(true)
    try {
      const result = await setRemoteBrandProfile(brandId, profile)
      const next = profileOf(result.brand)
      setProfile(next)
      setSaved(next)
      showToast('Brand profile saved.')
    } catch (error) {
      showToast(error.message || 'Could not save the brand profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'business', label: 'Business & identity' },
    { id: 'source', label: 'Knowledge sources' },
    { id: 'voice', label: 'Voice & behaviour' },
    { id: 'chat', label: `Preview ${agentName}` },
  ]
  const intro = {
    business: 'Tell Orb about your business so your agent answers with the right context.',
    source: 'Choose where your agent learns from: your website, documents and product catalogue.',
    voice: 'Shape how your agent sounds: tone, style and the rules it follows.',
    chat: `Try ${agentName} against this brand’s approved knowledge.`,
  }[active]

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader eyebrow="Agent configuration" title="AI configuration" description={intro} />
      <section className="rounded-card border border-line bg-white shadow-card">
        <div className="px-2 pt-1 sm:px-4">
          <Tabs tabs={tabs} active={active} onChange={changeTab} label="AI configuration sections" />
        </div>
        <div className="p-5 pb-8 sm:p-6">
          {active === 'business' && (
            <>
              <BrandCategorySetup isAdmin={isAdmin} />
              <div className="mt-8 grid max-w-2xl gap-5 border-t border-line pt-6">
                <div>
                  <h3 className="text-base font-semibold">About {brandName || 'this brand'}</h3>
                  <p className="mt-1 text-sm text-fg-muted">This is background your agent and Orb’s drafts can rely on. Keep it short and factual.</p>
                </div>
                <Input label="Primary website" type="url" placeholder="https://yourbrand.com" hint="Where customers find your products and policies." value={profile.website_url} onChange={update('website_url')} disabled={loading || !brandId} />
                <Input label="Support email" type="email" placeholder="support@yourbrand.com" hint="Shown when the agent hands a customer over to your team." value={profile.support_email} onChange={update('support_email')} disabled={loading || !brandId} />
                <Textarea label="About this brand" placeholder="What you sell, who it is for, and any key policies worth knowing." hint="Two or three sentences is plenty." value={profile.description} onChange={update('description')} disabled={loading || !brandId} />
              </div>
              <div
                className={`sticky bottom-[4.75rem] z-10 mt-8 sm:bottom-4 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-card border bg-white px-4 py-3 shadow-pop transition-[opacity,border-color] duration-180 ${dirty ? 'border-primary/30 opacity-100' : 'border-line opacity-80'}`}
                role="status"
              >
                <p className="flex items-center gap-2 text-sm text-fg-muted">
                  <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-warning' : 'bg-success'}`} aria-hidden="true" />
                  {dirty ? 'You have unsaved changes' : 'All changes saved'}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setProfile(saved)} disabled={!dirty || saving}>Discard</Button>
                  <Button size="sm" onClick={save} loading={saving} disabled={!dirty || loading || !brandId}>{saving ? 'Saving…' : 'Save changes'}</Button>
                </div>
              </div>
            </>
          )}
          {active === 'source' && <PipelineWorkspace />}
          {active === 'voice' && <BrandVoiceSetup isAdmin={isAdmin} />}
          {active === 'chat' && <AgentChat embedded />}
        </div>
      </section>
    </div>
  )
}
