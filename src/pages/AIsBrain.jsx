import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, CircleHelp, Database, FlaskConical, MessageSquareText } from 'lucide-react'
import Faqs from './Faqs'
import Sops from './Sops'
import AgentChat from './AgentChat'
import PageHeader from '../components/ui/PageHeader'
import Skeleton from '../components/ui/Skeleton'
import { useBrand } from '../context/BrandContext'
import { pluralize } from '../lib/format'
import { hasOrbApi, listKnowledge } from '../services/orbApi'

const TABS = [
  { id: 'sops', label: 'SOPs', Icon: BookOpenCheck },
  { id: 'faqs', label: 'FAQs', Icon: CircleHelp },
  { id: 'chat', label: 'Preview', Icon: MessageSquareText },
]

const isPublished = (status) => ['published', 'active'].includes(String(status || '').toLowerCase())

function summarise(result) {
  const points = Array.isArray(result?.points) ? result.points : []
  const published = points.filter((point) => isPublished(point?.payload?.status ?? point?.status)).length
  return { total: points.length, published, drafts: points.length - published }
}

function useKnowledgeSummary(brandName) {
  const [state, setState] = useState({ loading: true, faqs: null, sops: null })
  useEffect(() => {
    let live = true
    if (!hasOrbApi || !brandName) {
      setState({ loading: false, faqs: null, sops: null })
      return undefined
    }
    setState((current) => ({ ...current, loading: true }))
    Promise.allSettled([listKnowledge('faqs', brandName), listKnowledge('sops', brandName)]).then(([faqs, sops]) => {
      if (!live) return
      setState({
        loading: false,
        faqs: faqs.status === 'fulfilled' ? summarise(faqs.value) : null,
        sops: sops.status === 'fulfilled' ? summarise(sops.value) : null,
      })
    })
    return () => { live = false }
  }, [brandName])
  return state
}

function Hub({ brandName, agentName }) {
  const { loading, faqs, sops } = useKnowledgeSummary(brandName)
  const describe = (summary, noun) => {
    if (!summary) return 'Open to review'
    if (!summary.total) return `No ${noun} yet`
    return [`${summary.published} published`, summary.drafts ? pluralize(summary.drafts, 'draft') : ''].filter(Boolean).join(' · ')
  }
  const cards = [
    { to: '/app/brain?tab=faqs', title: 'FAQs', Icon: CircleHelp, bg: '#E0F2FE', fg: '#0284C7', text: 'Customer-facing answers your agent can give straight away.', meta: describe(faqs, 'FAQs') },
    { to: '/app/brain?tab=sops', title: 'SOPs', Icon: BookOpenCheck, bg: '#DCFCE7', fg: '#16A34A', text: 'Step-by-step processes for situations your agent has to handle.', meta: describe(sops, 'SOPs') },
    { to: '/app/workspace?tab=source', title: 'Knowledge sources', Icon: Database, bg: '#FEF3C7', fg: '#D97706', text: 'Your website, documents and catalogue that knowledge is drawn from.', meta: 'Manage sources' },
    { to: '/app/chat', title: `Test ${agentName}`, Icon: FlaskConical, bg: '#F3E8FF', fg: '#9333EA', text: 'Ask a question and see how your agent uses this knowledge.', meta: 'Open the playground' },
  ]
  const drafts = (faqs?.drafts || 0) + (sops?.drafts || 0)
  return (
    <>
      {drafts > 0 && (
        <Link to={faqs?.drafts ? '/app/brain?tab=faqs&status=draft' : '/app/brain?tab=sops&status=draft'} className="mb-4 flex items-center justify-between gap-3 rounded-card border border-warning/25 bg-warning-tint px-4 py-3 text-sm text-warning transition-colors hover:border-warning/50">
          <span><strong className="font-medium">{pluralize(drafts, 'draft')}</strong> waiting for your review. Your agent only uses what you publish.</span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ to, title, Icon, text, meta, bg, fg }) => (
          <Link key={to} to={to} className="group rounded-card border border-line bg-white p-5 shadow-card transition-[border-color,transform,box-shadow] duration-180 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop">
            <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: bg, color: fg }}><Icon size={19} aria-hidden="true" /></span>
            <h3 className="mt-4 flex items-center justify-between text-base font-semibold">
              {title}
              <ArrowRight size={16} className="text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
            </h3>
            <p className="mt-1 text-sm leading-6 text-fg-muted">{text}</p>
            {loading ? <Skeleton className="mt-3 h-4 w-32" /> : <p className="mt-3 text-xs font-medium" style={{ color: fg }}>{meta}</p>}
          </Link>
        ))}
      </div>
    </>
  )
}

export default function AIsBrain() {
  const [search, setSearch] = useSearchParams()
  const { brandName, agentName } = useBrand()
  const tab = search.get('tab')
  const active = ['sops', 'faqs', 'chat'].includes(tab) ? tab : null

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        eyebrow="Knowledge"
        title="AI’s Brain"
        description={`Everything ${agentName} knows about ${brandName || 'your brand'}, and how it uses it. Only published FAQs and SOPs are used in real conversations.`}
      />
      {active ? (
        <>
          <nav role="tablist" aria-label="AI knowledge sections" className="mb-6 inline-flex gap-1 rounded-xl border border-line bg-white p-1 shadow-card">
            {TABS.map(({ id, label, Icon }) => {
              const selected = active === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSearch({ tab: id })}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors duration-150 ${selected ? 'bg-primary-tint text-primary' : 'text-fg-muted hover:bg-subtle hover:text-ink'}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {id === 'chat' ? `Preview ${agentName}` : label}
                </button>
              )
            })}
          </nav>
          {active === 'sops' && <Sops />}
          {active === 'faqs' && <Faqs />}
          {active === 'chat' && <AgentChat embedded />}
        </>
      ) : (
        <Hub brandName={brandName} agentName={agentName} />
      )}
    </div>
  )
}
