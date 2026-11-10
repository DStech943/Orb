import React, { useEffect, useState } from 'react'
import { BookOpenCheck, CircleHelp, MessageSquareText } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import Faqs from './Faqs'
import Sops from './Sops'
import AgentChat from './AgentChat'
import { listBrands } from '../services/brands'

const baseSections = [
  { id: 'sops', label: 'SOPs', description: 'Operational guidance for your support team.', Icon: BookOpenCheck },
  { id: 'faqs', label: 'FAQs', description: 'Customer-facing answers your agent can use.', Icon: CircleHelp },
]

export default function AIsBrain() {
  const [search, setSearch] = useSearchParams()
  const [agentName, setAgentName] = useState('AI')
  const active = ['sops', 'faqs', 'chat'].includes(search.get('tab')) ? search.get('tab') : 'sops'
  useEffect(() => {
    let live = true
    const loadAgentName = async () => {
      const brands = await listBrands()
      if (!live) return
      const selectedId = window.localStorage.getItem('orb_selected_brand') || ''
      const brand = brands.find((item) => item.id === selectedId) || brands[0]
      setAgentName(String(brand?.ai_agent_name || 'AI').trim() || 'AI')
    }
    const onBrandChange = () => loadAgentName()
    loadAgentName()
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => {
      live = false
      window.removeEventListener('orb:brand-changed', onBrandChange)
    }
  }, [])
  const sections = [
    ...baseSections,
    { id: 'chat', label: `Chat with ${agentName}`, description: `Test ${agentName}'s responses against this brand's approved knowledge.`, Icon: MessageSquareText },
  ]

  return <div className="page-enter mx-auto max-w-7xl">
    <header className="mb-6">
      <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Knowledge library</p>
      <h2 className="mt-1 text-3xl font-extrabold tracking-tight">AI&apos;s Brain</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage the approved SOPs and FAQs that give your support agent dependable brand knowledge.</p>
    </header>
    <nav role="tablist" aria-label="AI knowledge sections" className="mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      {sections.map(({ id, label, description, Icon }) => {
        const selected = active === id
        return <button key={id} type="button" role="tab" aria-selected={selected} onClick={() => setSearch({ tab: id })} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 text-left transition ${selected ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${selected ? 'bg-white/15' : 'bg-primary-tint text-primary'}`}><Icon size={18} /></span>
          <span className="min-w-0"><span className="block text-sm font-extrabold">{label}</span><span className={`mt-0.5 hidden text-xs sm:block ${selected ? 'text-white/75' : 'text-slate-400'}`}>{description}</span></span>
        </button>
      })}
    </nav>
    {active === 'sops' && <Sops />}
    {active === 'faqs' && <Faqs />}
    {active === 'chat' && <AgentChat embedded />}
  </div>
}
