import React, { useState } from 'react'
import { ArrowRight, ClipboardCheck, Maximize2, MessageSquareText, Minimize2, SearchCheck, Siren } from 'lucide-react'

const steps = [
  { key: 'checkFirst', label: 'Check first', icon: SearchCheck, tone: 'border-purple/45 bg-white' },
  { key: 'whatToDo', label: 'What to do', icon: ClipboardCheck, tone: 'border-orange/55 bg-white' },
  { key: 'whatToSay', label: 'What to say', icon: MessageSquareText, tone: 'border-purple/45 bg-white' },
  { key: 'escalateTo', label: 'Escalate to', icon: Siren, tone: 'border-ink/30 bg-ink text-white' },
]

function FlowArrow({ expanded }) {
  return <div className={`flex shrink-0 items-center justify-center ${expanded ? 'w-14' : 'w-10'}`}><ArrowRight className="text-orange" size={20} strokeWidth={2.5} /></div>
}

export default function SopFlow({ sop }) {
  const [expanded, setExpanded] = useState(false)
  const cardStyle = expanded ? { width: '17.5rem', height: '28rem' } : { width: '15rem', height: '15rem' }
  const bodySize = expanded ? 'text-sm leading-5' : 'text-xs leading-4'
  const overflowMode = expanded ? 'overflow-y-auto' : 'overflow-hidden'

  return <section aria-label="SOP decision flow" className="overflow-hidden rounded-lg border border-ink/15 bg-[#fcfbff]" style={{ backgroundImage: 'radial-gradient(rgba(17, 17, 17, 0.10) 0.8px, transparent 0.8px)', backgroundSize: '10px 10px' }}><header className="flex items-center justify-between gap-4 border-b border-ink/10 bg-white/90 px-4 py-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-purple">Decision flow</p><p className="mt-1 text-sm font-bold text-ink">Follow the path for this customer situation.</p></div><button type="button" title={expanded ? 'Use compact square cards' : 'Expand cards to read the full flow'} aria-label={expanded ? 'Use compact square cards' : 'Expand cards to read the full flow'} aria-pressed={expanded} onClick={() => setExpanded((value) => !value)} className="inline-flex shrink-0 items-center gap-2 rounded-md border border-ink/20 bg-white px-3 py-2 text-xs font-extrabold text-ink transition hover:border-purple hover:text-purple"><span className="hidden sm:inline">{expanded ? 'Compact flow' : 'Expand flow'}</span>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></header><div style={{ minHeight: 'calc(100vh - 16rem)' }} className="flex overflow-x-auto overflow-y-hidden p-5"><div className="flex min-w-full flex-1 items-center justify-center"><div className="flex min-w-max flex-row items-stretch"><article style={cardStyle} className="flow-step flex shrink-0 flex-col overflow-hidden rounded-md border-2 border-ink bg-ink p-3 text-white"><p className="text-[10px] font-extrabold uppercase tracking-wider text-white/65">Situation</p><div className={`mt-3 min-h-0 flex-1 pr-1 ${overflowMode} ${bodySize}`}><p className="font-bold">{sop.situation || sop.title}</p><p className="mt-3 text-[10px] font-semibold text-white/65">{sop.category || 'Uncategorised'} · {sop.lifecycle || 'General'}</p></div></article><FlowArrow expanded={expanded} />{steps.map((step) => { const Icon = step.icon; const text = sop[step.key] || (step.key === 'escalateTo' ? 'No escalation is needed.' : 'No instruction has been added yet.'); return <React.Fragment key={step.key}><article style={cardStyle} className={`flow-step flex shrink-0 flex-col overflow-hidden rounded-md border-2 p-3 ${step.tone}`}><div className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-current/30 bg-white/10"><Icon size={15} /></span><p className="text-[10px] font-extrabold uppercase tracking-wider">{step.label}</p></div><div className={`mt-3 min-h-0 flex-1 pr-1 ${overflowMode} ${bodySize}`}><p className="font-semibold">{text}</p></div></article>{step.key !== 'escalateTo' && <FlowArrow expanded={expanded} />}</React.Fragment> })}</div></div></div><p className="border-t border-ink/10 bg-white/85 px-4 py-3 text-xs text-muted">This view is generated from the SOP payload. Use <strong className="text-ink">Edit SOP</strong> to change the steps.</p></section>
}
