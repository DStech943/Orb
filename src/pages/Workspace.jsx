import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Tabs from '../components/ui/Tabs'
import Textarea from '../components/ui/Textarea'
import BrandCategorySetup from '../components/app/BrandCategorySetup'
import BrandVoiceSetup from '../components/app/BrandVoiceSetup'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { listBrands } from '../services/brands'
import { hasOrbApi, setRemoteBrandProfile } from '../services/orbApi'
import AgentChat from './AgentChat'
import PipelineWorkspace from '../components/app/PipelineWorkspace'

export default function Workspace() {
  const location = useLocation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [active, setActive] = useState(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    return ['business', 'source', 'voice', 'chat'].includes(tab) ? tab : 'business'
  })
  const [business, setBusiness] = useState({ id: '', name: '', website_url: '', support_email: '', description: '', ai_agent_name: '' })
  const [businessLoading, setBusinessLoading] = useState(true)
  const [savingBusiness, setSavingBusiness] = useState(false)
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    if (['business', 'source', 'voice', 'chat'].includes(tab)) setActive(tab)
  }, [location.search])

  useEffect(() => {
    let live = true
    const loadBusiness = async () => {
      setBusinessLoading(true)
      try {
        const brands = await listBrands()
        if (!live) return
        const activeId = window.localStorage.getItem('orb_selected_brand') || ''
        const brand = brands.find((item) => item.id === activeId) || brands[0]
        if (brand) {
          setBusiness({ id: brand.id, name: brand.name, website_url: brand.profile?.website_url || '', support_email: brand.profile?.support_email || '', description: brand.description || '', ai_agent_name: brand.ai_agent_name || '' })
        }
      } finally {
        if (live) setBusinessLoading(false)
      }
    }
    const onBrandChange = () => loadBusiness()
    loadBusiness()
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => { live = false; window.removeEventListener('orb:brand-changed', onBrandChange) }
  }, [])

  const saveBusiness = async () => {
    if (!business.id) return
    if (!hasOrbApi) return showToast('Start the Orb backend to save the brand profile.')
    setSavingBusiness(true)
    try {
      const result = await setRemoteBrandProfile(business.id, {
        website_url: business.website_url,
        support_email: business.support_email,
        description: business.description,
      })
      const updated = result.brand
      setBusiness({ id: updated.id, name: updated.name, website_url: updated.profile?.website_url || '', support_email: updated.profile?.support_email || '', description: updated.description || '', ai_agent_name: updated.ai_agent_name || '' })
      showToast('Brand profile saved.')
    } catch (error) {
      showToast(error.message || 'Could not save the brand profile.')
    } finally {
      setSavingBusiness(false)
    }
  }
  const tabs = [
    { id: 'business', label: 'Business' },
    { id: 'source', label: 'Knowledge source' },
    { id: 'voice', label: 'Brand voice' },
    { id: 'chat', label: `Chat with ${business.ai_agent_name || 'AI'}` },
  ]
  return <div className="mx-auto max-w-6xl">
    <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand workspace</p>
    <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Build your brand knowledge</h2>
    <p className="mt-2 max-w-2xl text-sm text-muted">Set the active brand's category and voice, then test its deployed support agent in one focused workspace.</p>
    <section className="mt-6 rounded-lg border-2 border-ink bg-white shadow-brutal">
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      <div className="p-5 sm:p-6">
        {active === 'business' && <>
          <BrandCategorySetup isAdmin={user?.role === 'admin'} />
          <div className="mt-6 grid max-w-2xl gap-4 border-t border-ink/15 pt-6">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand profile</p>
              <h3 className="mt-1 text-xl font-extrabold">Useful context for Orb</h3>
              <p className="mt-1 text-sm text-muted">The brand name is managed from the top bar. Category is saved above and controls SOP templates.</p>
            </div>
            <div className="rounded-md border border-ink/15 bg-peach px-4 py-3 text-sm"><span className="font-bold">Active brand:</span> {business.name || 'Choose a brand in the top bar'}</div>
            <Input label="Primary website" type="url" placeholder="https://yourbrand.com" value={business.website_url} onChange={(event) => setBusiness({ ...business, website_url: event.target.value })} disabled={businessLoading || !business.id} />
            <Input label="Support email" type="email" placeholder="support@yourbrand.com" value={business.support_email} onChange={(event) => setBusiness({ ...business, support_email: event.target.value })} disabled={businessLoading || !business.id} />
            <Textarea label="About this brand" placeholder="What the brand sells, key policies, or useful context for drafted content." value={business.description} onChange={(event) => setBusiness({ ...business, description: event.target.value })} disabled={businessLoading || !business.id} />
            <Button variant="purple" onClick={saveBusiness} disabled={businessLoading || savingBusiness || !business.id}>{savingBusiness ? 'Saving…' : 'Save brand profile'}</Button>
          </div>
        </>}
        {active === 'source' && <PipelineWorkspace />}
        {active === 'voice' && <BrandVoiceSetup isAdmin={user?.role === 'admin'} />}
        {active === 'chat' && <AgentChat embedded />}
      </div>
    </section>
  </div>
}
