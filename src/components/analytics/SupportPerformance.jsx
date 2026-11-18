import React from 'react'
import { CheckCircle2, Clock, Hourglass, Inbox, MessageSquare, RefreshCw, Users } from 'lucide-react'
import useSupportKpis from '../../hooks/useSupportKpis'
import Button from '../ui/Button'
import { StatCard, num, percent, periodLabel, preciseDuration } from './parts'

const channelName = (value) => ({ zoko: 'WhatsApp', whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'Email' }[String(value).toLowerCase()] || String(value))

/**
 * The agent dashboard's numbers (incoming, handled and resolved chats, replies, first response
 * and handle time), read from the same database function so the two always agree.
 */
export default function SupportPerformance({ range }) {
  const kpis = useSupportKpis(range)
  const { status, data, error, reload } = kpis
  if (status === 'idle') return null

  const s = data?.summary
  const c = data?.comparison
  const label = data ? periodLabel(data.period, data.timezone) : ''

  return (
    <section aria-labelledby="support-performance-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="support-performance-title" className="text-base font-bold text-ink">Support Performance</h2>
          <p className="text-xs text-fg-muted">
            The same numbers as the agent dashboard{label ? <> for <span className="font-semibold text-ink">{label}</span></> : ''}. These count the work your team does on chats, so they differ from the conversation totals above.
          </p>
        </div>
        {status === 'loading' && data && <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted" role="status"><RefreshCw size={12} className="animate-spin" /> Updating…</span>}
      </div>

      {status === 'loading' && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading support performance">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-card border border-line bg-subtle/60" />)}
        </div>
      ) : status === 'error' ? (
        <div className="rounded-card border border-red-200 bg-red-50 p-4" role="alert">
          <p className="text-sm font-semibold text-ink">Support performance could not be loaded</p>
          <p className="mt-0.5 text-xs text-fg-muted">{error}</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={reload}><RefreshCw size={14} /> Try again</Button>
        </div>
      ) : s ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Incoming Chats" icon={Inbox} value={num(s.incoming_chats)} change={c.incoming_chats.change_pct} sub="Customers who reached out" />
            <StatCard title="Handled Chats" icon={Users} tone="bg-sky-50 text-sky-600" value={num(s.handled_chats)} change={c.handled_chats.change_pct} sub="Chats your team replied in or resolved" />
            <StatCard title="Chats Resolved" icon={CheckCircle2} tone="bg-emerald-50 text-success" value={num(s.resolved_chats)} change={c.resolved_chats.change_pct} sub={s.resolved_share != null ? `${percent(s.resolved_share)} of handled chats` : 'No handled chats in this period'} />
            <StatCard title="Chat Replies" icon={MessageSquare} tone="bg-sky-50 text-sky-600" value={num(s.replies_sent)} change={c.replies_sent.change_pct} sub="Messages sent. Excludes templates and failed sends." />
            <StatCard title="First Response Time" icon={Clock} tone="bg-amber-50 text-amber-700" value={preciseDuration(s.first_response_seconds)} change={c.first_response_seconds.change_pct} goodWhen="down" sub="Average, adjusted to support hours" />
            <StatCard title="Average Handle Time" icon={Hourglass} tone="bg-amber-50 text-amber-700" value={preciseDuration(s.average_handle_seconds)} change={c.average_handle_seconds.change_pct} goodWhen="down" sub="Average time until the last reply" />
          </div>
          {s.channels.length > 0 && (
            <p className="text-xs text-fg-muted">
              Chats by channel:{' '}
              {s.channels.map((item, index) => (
                <span key={item.channel}>{index > 0 ? ' · ' : ''}<span className="font-semibold text-ink">{channelName(item.channel)}</span> {num(item.chats)}</span>
              ))}
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}
