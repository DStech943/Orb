import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, CheckCircle2, MessageSquare, RefreshCw, ThumbsDown, ThumbsUp, UserCheck, Users } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import { useBrand } from '../context/BrandContext'
import { DATE_RANGES } from '../services/aiAnalytics'
import useBrandAnalytics from '../hooks/useBrandAnalytics'
import { AnalyticsGate, CHART_TOOLTIP, NotAvailable, StatCard, dayLabel, duration, hourLabel, hours, num, percent } from '../components/analytics/parts'

const TABS = [
  { id: 'overview', label: 'Performance Overview' },
  { id: 'messages', label: 'Message Analytics' },
  { id: 'satisfaction', label: 'Customer Satisfaction' },
]

function Bars({ items, labelKey, valueKey, total, unit }) {
  const max = Math.max(1, ...items.map((item) => item[valueKey]))
  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <div key={item[labelKey]} className="space-y-1">
          <div className="flex justify-between gap-3 text-xs">
            <span className="truncate font-medium text-ink">{item[labelKey]}</span>
            <span className="shrink-0 font-bold text-fg-muted">
              {num(item[valueKey])} {unit}
              {total ? ` (${Math.round((item[valueKey] / total) * 100)}%)` : ''}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (item[valueKey] / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

const Card = ({ title, subtitle, children, className = '' }) => (
  <div className={`rounded-card border border-line bg-surface p-5 shadow-card ${className}`}>
    <h3 className="text-base font-bold text-ink">{title}</h3>
    {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
    {children}
  </div>
)

export default function AiPerformance({ defaultTab = 'overview' }) {
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') || defaultTab
  const [rangeId, setRangeId] = useState('30d')
  const { agentName } = useBrand()
  const analytics = useBrandAnalytics(rangeId)

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="AI Performance Analytics"
        title="Assistant Intelligence & Outcomes"
        description={`How your customers' conversations with ${agentName} are going, from your real conversation data.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-control border border-line-strong bg-white p-1 shadow-card">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRangeId(r.id)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${rangeId === r.id ? 'bg-primary text-white shadow-sm' : 'text-fg-muted hover:text-ink'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={analytics.reload}>
              <RefreshCw size={14} className={analytics.status === 'loading' ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setParams({ tab: tab.id })}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:border-line-strong hover:text-ink'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnalyticsGate analytics={analytics} label="Loading AI performance data">
        {(data) => {
          const s = data.summary
          const c = data.comparison
          const trends = data.trends.map((day) => ({ ...day, label: dayLabel(day.date) }))
          const hourly = data.hourly.map((item) => ({ ...item, label: hourLabel(item.hour) }))
          const empty = s.conversations_started === 0 && s.customer_messages === 0
          const reviews = data.team_reviews
          const reviewTotal = reviews.up + reviews.down + reviews.other

          return (
            <>
              {empty && (
                <p className="rounded-card border border-line bg-subtle/60 px-4 py-3 text-sm text-fg-muted">
                  No customer conversations were recorded in this period, so there is nothing to chart yet.
                </p>
              )}

              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Conversations Started" icon={Users} value={num(s.conversations_started)} change={c.conversations_started.change_pct} sub={`${num(s.active_conversations)} conversations had customer messages`} />
                    <StatCard title="Customer Messages" icon={MessageSquare} value={num(s.customer_messages)} change={c.customer_messages.change_pct} sub="Messages received from customers" />
                    <StatCard title="Messages Sent" icon={UserCheck} tone="bg-sky-50 text-sky-600" value={num(s.replies_sent)} change={c.replies_sent.change_pct} sub={`Replies plus automated and proactive messages · ${num(s.replies_from_dashboard)} typed by your team in the dashboard`} />
                    <StatCard
                      title="Resolved"
                      icon={CheckCircle2}
                      tone="bg-emerald-50 text-success"
                      value={percent(s.resolution_rate)}
                      change={c.resolution_rate.change_points}
                      unit=" pts"
                      sub={s.resolution_rate == null ? 'No conversations started in this period' : `${num(s.resolved_conversations)} of ${num(s.conversations_started)} conversations${s.median_hours_to_resolve != null ? ` · median ${hours(s.median_hours_to_resolve)} to resolve` : ''}`}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2" title="Conversation Volume" subtitle="Daily conversations started, customer messages and messages sent to customers">
                      <div className="mb-2 mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#635BFF]" /> Customer messages</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#1F9D6B]" /> Messages sent</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#FF9B3D]" /> Conversations started</span>
                      </div>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F2F6" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#77798C', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis allowDecimals={false} tick={{ fill: '#77798C', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <RechartsTooltip contentStyle={CHART_TOOLTIP} labelStyle={{ fontWeight: 'bold', color: '#25263A', marginBottom: 4 }} />
                            <Area type="monotone" dataKey="customer_messages" name="Customer messages" stroke="#635BFF" strokeWidth={2} fill="#635BFF" fillOpacity={0.12} />
                            <Area type="monotone" dataKey="replies" name="Messages sent" stroke="#1F9D6B" strokeWidth={2} fill="#1F9D6B" fillOpacity={0.12} />
                            <Area type="monotone" dataKey="conversations" name="Conversations started" stroke="#FF9B3D" strokeWidth={2} fill="#FF9B3D" fillOpacity={0.12} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <Card title="Handoffs & Response Time" subtitle="How often your team stepped in, and how quickly customers got a reply">
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                          <span className="text-xs font-semibold text-fg-muted">Handed over to your team</span>
                          <p className="mt-1 text-2xl font-bold text-ink">{num(s.escalated_conversations)} <span className="text-sm font-medium text-fg-muted">{s.escalation_rate != null ? `· ${s.escalation_rate}% of active conversations` : ''}</span></p>
                          <p className="mt-1 text-[11px] text-fg-muted">{num(s.escalation_records)} escalation {s.escalation_records === 1 ? 'record' : 'records'} in this period</p>
                        </div>
                        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted"><Clock size={13} /> Time to first reply</span>
                          <p className="mt-1 text-2xl font-bold text-ink">{duration(s.first_reply.median_seconds)} <span className="text-sm font-medium text-fg-muted">median</span></p>
                          <p className="mt-1 text-[11px] text-fg-muted">
                            {s.first_reply.p90_seconds != null ? `9 in 10 replied within ${duration(s.first_reply.p90_seconds)} · ` : ''}
                            {s.first_reply.answered_share != null ? `${s.first_reply.answered_share}% of active conversations received a reply` : 'No replies in this period'}
                          </p>
                          <p className="mt-1 text-[11px] text-fg-muted">Includes replies from both the AI and your team.</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Card title="What Customers Ask About" subtitle="Topics the AI tagged on conversations started in this period">
                      {data.topics.items.length === 0 ? (
                        <p className="mt-4 text-sm text-fg-muted">No topic tags in this period.</p>
                      ) : (
                        <Bars items={data.topics.items} labelKey="topic" valueKey="conversations" unit="conversations" />
                      )}
                      <p className="mt-4 border-t border-line pt-3 text-[11px] text-fg-muted">
                        {data.topics.total_conversations
                          ? `Topics are tagged automatically. ${num(data.topics.tagged_conversations)} of ${num(data.topics.total_conversations)} conversations (${data.topics.coverage_pct}%) have been tagged, so these counts may be incomplete.`
                          : 'Topics are tagged automatically on conversations.'}
                      </p>
                    </Card>

                    <Card title="Team Reviews of AI Replies" subtitle="Thumbs and notes your team left on AI replies in this period">
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted"><ThumbsUp size={13} /> Approved</span>
                          <p className="mt-1 text-2xl font-bold text-success">{num(reviews.up)}</p>
                        </div>
                        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted"><ThumbsDown size={13} /> Needs work</span>
                          <p className="mt-1 text-2xl font-bold text-danger">{num(reviews.down)}</p>
                        </div>
                      </div>
                      {reviews.failure_categories.length > 0 && (
                        <div className="mt-4 border-t border-line pt-3">
                          <p className="text-xs font-semibold text-fg-muted">Why replies were flagged</p>
                          <ul className="mt-2 space-y-1 text-xs">
                            {reviews.failure_categories.map((item) => (
                              <li key={item.category} className="flex justify-between"><span className="text-ink">{item.category.replaceAll('_', ' ')}</span><span className="font-bold text-fg-muted">{item.count}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="mt-4 border-t border-line pt-3 text-[11px] text-fg-muted">
                        {reviewTotal === 0 ? 'No reviews were left in this period. ' : ''}These are your own team's reviews, not customer ratings.
                      </p>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === 'messages' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard title="Customer Messages" value={num(s.customer_messages)} change={c.customer_messages.change_pct} sub="Received in this period" />
                    <StatCard title="Messages Sent" value={num(s.replies_sent)} change={c.replies_sent.change_pct} sub={`Includes automated and proactive messages · ${num(s.replies_from_dashboard)} typed by your team in the dashboard`} />
                    <StatCard title="Active Conversations" value={num(s.active_conversations)} sub="Conversations with at least one customer message" />
                  </div>
                  <p className="rounded-card border border-line bg-subtle/60 px-4 py-3 text-xs text-fg-muted">{data.availability.ai_vs_human_replies.reason}</p>

                  <Card title="Peak Customer Hours" subtitle={`Customer messages by hour of day (${data.timezone.replace('_', ' ')} time)`}>
                    <div className="mt-4 h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F2F6" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: '#77798C', fontSize: 10 }} interval={2} tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} tick={{ fill: '#77798C', fontSize: 11 }} tickLine={false} axisLine={false} />
                          <RechartsTooltip contentStyle={CHART_TOOLTIP} formatter={(value) => [`${value} messages`, 'Customers']} labelFormatter={(label) => `Time: ${label}`} />
                          <Bar dataKey="customer_messages" fill="#635BFF" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card title="Conversations by Channel" subtitle="Conversations started in this period">
                    {data.platforms.length === 0 ? (
                      <p className="mt-4 text-sm text-fg-muted">No conversations were started in this period.</p>
                    ) : (
                      <Bars items={data.platforms} labelKey="platform" valueKey="conversations" total={s.conversations_started} unit="conversations" />
                    )}
                  </Card>
                </div>
              )}

              {activeTab === 'satisfaction' && (
                <div className="space-y-6">
                  <NotAvailable title="Customer satisfaction is not available yet" reason={data.availability.customer_satisfaction.reason}>
                    <p className="mx-auto mt-3 max-w-xl text-xs text-fg-muted">
                      Orb will show a satisfaction score as soon as customers can rate conversations. Until then, no score is shown rather than an estimate.
                    </p>
                  </NotAvailable>

                  <Card title="What we can show today" subtitle="Real signals about how conversations are going. These are not customer ratings.">
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                        <span className="text-xs font-semibold text-fg-muted">Conversations resolved</span>
                        <p className="mt-1 text-2xl font-bold text-ink">{percent(s.resolution_rate)}</p>
                        <p className="mt-1 text-[11px] text-fg-muted">{num(s.resolved_conversations)} of {num(s.conversations_started)} started</p>
                      </div>
                      <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                        <span className="text-xs font-semibold text-fg-muted">Handed over to your team</span>
                        <p className="mt-1 text-2xl font-bold text-ink">{percent(s.escalation_rate)}</p>
                        <p className="mt-1 text-[11px] text-fg-muted">{num(s.escalated_conversations)} of {num(s.active_conversations)} active conversations</p>
                      </div>
                      <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                        <span className="text-xs font-semibold text-fg-muted">Team reviews of AI replies</span>
                        <p className="mt-1 text-2xl font-bold text-ink">{num(reviews.up)} <span className="text-sm font-medium text-fg-muted">approved</span> · {num(reviews.down)} <span className="text-sm font-medium text-fg-muted">flagged</span></p>
                        <p className="mt-1 text-[11px] text-fg-muted">Left by your own team</p>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )
        }}
      </AnalyticsGate>
    </div>
  )
}
