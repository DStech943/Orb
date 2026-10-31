import React from 'react'
import { ArrowRight, Database, FileSearch, LockKeyhole, RefreshCw, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import PhysicsTileStage from './PhysicsTileStage'

const copyByStatus = {
  403: {
    eyebrow: 'Knowledge connection',
    title: 'Orb can’t unlock this library yet.',
    body: 'The knowledge source is connected, but its access key does not currently allow Orb to read this brand’s published content.',
    note: 'Ask a workspace admin to update the Qdrant database API key, then try again.',
    Icon: LockKeyhole,
  },
  401: {
    eyebrow: 'Knowledge connection',
    title: 'This library needs a valid key.',
    body: 'Orb could reach the knowledge source, but the connection could not be authenticated.',
    note: 'Ask a workspace admin to check the Qdrant database API key, then try again.',
    Icon: LockKeyhole,
  },
  404: {
    eyebrow: 'Knowledge library',
    title: 'Nothing has been published here yet.',
    body: 'Orb could not find this brand’s published knowledge collection.',
    note: 'Generate and publish content for this brand, then return here to review it.',
    Icon: FileSearch,
  },
}

function errorStatus(error) {
  const message = String(error?.message || '')
  const match = message.match(/\b(401|403|404)\b/)
  return match ? Number(match[1]) : 0
}

export default function KnowledgeAccessState({ error, title, onRetry }) {
  const navigate = useNavigate()
  const status = errorStatus(error)
  const content = copyByStatus[status] || {
    eyebrow: 'Knowledge library',
    title: `We couldn’t load ${title} right now.`,
    body: 'Orb could not reach this brand’s published knowledge. It may be a temporary connection issue.',
    note: 'Try again in a moment. If this continues, ask a workspace admin to check the knowledge connection.',
    Icon: TriangleAlert,
  }
  return <section className="knowledge-access-state page-enter relative min-h-[calc(100vh-114px)] w-full overflow-hidden rounded-2xl border border-ink/20 bg-peach shadow-sm">
    <PhysicsTileStage status={status || 404} fullBleed />
    <div className="knowledge-access-copy relative z-30 mx-auto max-w-2xl px-6 pb-2 pt-11 text-center sm:px-10 sm:pt-14">
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">{content.eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{content.title}</h2>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted">{content.body}</p>
      <p className="mx-auto mt-4 max-w-xl text-sm font-semibold leading-6 text-ink">{content.note}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={onRetry}><RefreshCw size={16} />Try again</Button>
        <Button variant="outline" onClick={() => navigate('/app')}><Database size={16} />Go to overview</Button>
      </div>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted">Need help? Share this status with your workspace admin <ArrowRight size={13} /></p>
    </div>
  </section>
}
