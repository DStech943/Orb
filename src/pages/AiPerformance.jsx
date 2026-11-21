import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Clock, Headset, MessageSquare, RefreshCw, Smartphone, ThumbsDown, ThumbsUp, UserCheck, Users, Zap } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import { useBrand } from '../context/BrandContext'
import { DEFAULT_RANGE } from '../services/aiAnalytics'
import DateRangeFilter from '../components/analytics/DateRangeFilter'
import SupportPerformance from '../components/analytics/SupportPerformance'
import useBrandAnalytics from '../hooks/useBrandAnalytics'
import { AnalyticsGate, CHART_TOOLTIP, NotAvailable, SENDER_META, SENDER_ORDER, StatCard, dayLabel, duration, hourLabel, hours, num, percent, periodLabel } from '../components/analytics/parts'

const TABS = [
  { id: 'overview', label: 'Performance Overview' },
  { id: 'replies', label: 'AI vs Human Agents' },
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

const SENDER_ICON = { ai: Bot, team: Headset, automated: Zap, other: Smartphone }

// How active conversations were answered. The five groups add up to the active conversations.
const HANDLING_ROWS = [
  { key: 'ai_only', label: 'AI only', sub: 'The AI replied and your team did not', color: SENDER_META.ai.color },
  { key: 'ai_and_team', label: 'AI, then human agents', sub: 'The AI replied and your team stepped in too', color: '#9A94FF' },
  { key: 'team_only', label: 'Human agents only', sub: 'Your team replied and the AI did not', color: SENDER_META.team.color },
  { key: 'other_only', label: 'Outside Orb or automated only', sub: 'Only automations or messages sent from another app', color: SENDER_META.other.color },
  { key: 'unanswered', label: 'No reply yet', sub: 'The customer wrote and nothing was sent back in this period', color: '#DADCE8' },
]

const splitText = (r) => SENDER_ORDER.map((key) => `${SENDER_META[key].label} ${num(r[key])}`).join(' · ')

export default function AiPerformance({ defaultTab = 'overview' }) {
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') || defaultTab
  const [range, setRange] = useState(DEFAULT_RANGE)
  const { agentName } = useBrand()
  const analytics = useBrandAnalytics(range)

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="AI Performance Analytics"
        title="Assistant Intelligence & Outcomes"
        description={`How your customers' conversations with ${agentName} are going, from your real conversation data.`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <DateRangeFilter value={range} onChange={setRange} className="w-full sm:w-auto" />
            <Button variant="secondary" size="sm" onClick={analytics.reload}>
              <RefreshCw size={14} className={analytics.status === 'loading' ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div role="tablist" aria-label="Performance sections" className="grid grid-cols-2 gap-1 rounded-2xl border border-white/80 bg-white/60 p-1 shadow-card sm:inline-grid sm:grid-cols-4 sm:w-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setParams({ tab: tab.id })}
            role="tab" aria-selected={activeTab === tab.id} className={`rounded-xl px-3 py-2 text-center text-xs font-semibold leading-4 transition-colors sm:px-5 sm:text-sm ${activeTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-fg-muted hover:bg-white hover:text-ink'}`}
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
              {periodLabel(data.period, data.timezone) && (
                <p className="text-xs text-fg-muted">
                  Showing <span className="font-semibold text-ink">{periodLabel(data.period, data.timezone)}</span>
                  {periodLabel(data.previous_period, data.timezone) ? ` · changes compare with ${periodLabel(data.previous_period, data.timezone)}` : ''}
                </p>
              )}
              {empty && (
                <p className="rounded-card border border-line bg-subtle/60 px-4 py-3 text-sm text-fg-muted">
                  No customer conversations were recorded in this period, so there is nothing to chart yet.
                </p>
              )}

              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard title="Conversations Started" icon={Users} value={num(s.conversations_started)} change={c.conversations_started.change_pct} sub={`${num(s.active_conversations)} conversations had customer messages`} />
                    <StatCard title="Customer Messages" icon={MessageSquare} value={num(s.customer_messages)} change={c.customer_messages.change_pct} sub="Messages received from customers" />
                    <StatCard title="Messages Sent" icon={UserCheck} tone="bg-sky-50 text-sky-600" value={num(s.replies_sent)} change={c.replies_sent.change_pct} sub={s.reply_split_available ? splitText(s.replies) : `Replies plus automated and proactive messages · ${num(s.replies_from_dashboard)} typed by your team in the dashboard`} />
                  </div>

                  <SupportPerformance range={range} />

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
                            {s.first_reply.answered_share != null ? `${s.first_reply.answered_share}% of ${num(s.first_reply.eligible_conversations)} conversations received a reply` : 'No replies in this period'}
                          </p>
                          {s.reply_split_available && s.first_reply.by_sender.some((item) => item.sender === 'ai' || item.sender === 'team') ? (
                            <p className="mt-1 text-[11px] text-fg-muted">
                              Median by who replied first: {s.first_reply.by_sender.filter((item) => item.sender === 'ai' || item.sender === 'team').map((item) => `${SENDER_META[item.sender].label} ${duration(item.median_seconds)}`).join(' · ')}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-fg-muted">Any reply counts, whether from the AI or your team.</p>
                          )}
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

              {activeTab === 'replies' && (
                !s.reply_split_available ? (
                  <NotAvailable title="The AI and human agent split is not set up yet" reason="Orb needs a one-time database update before it can tell who sent each reply. Until then, messages sent to customers are reported together." />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {SENDER_ORDER.map((key) => {
                        const meta = SENDER_META[key]
                        const Icon = SENDER_ICON[key]
                        const change = key === 'ai' ? c.ai_replies.change_pct : key === 'team' ? c.team_replies.change_pct : undefined
                        return (
                          <StatCard
                            key={key}
                            title={meta.label}
                            icon={Icon}
                            tone={meta.tint}
                            value={num(s.replies[key])}
                            change={change}
                            sub={`${s.replies.total ? Math.round((s.replies[key] / s.replies.total) * 100) : 0}% of ${num(s.replies.total)} messages sent. ${meta.hint}.`}
                          />
                        )
                      })}
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <Card title="Who Answered Customers" subtitle="Conversations with a customer message in this period, by who replied">
                        {s.active_conversations === 0 ? (
                          <p className="mt-4 text-sm text-fg-muted">There were no customer conversations in this period.</p>
                        ) : (
                          <>
                            <div className="mt-4 flex items-baseline gap-6">
                              <div>
                                <p className="text-2xl font-bold text-ink">{percent(s.handling.ai_involved_rate)}</p>
                                <p className="text-[11px] text-fg-muted">had an AI reply</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-ink">{percent(s.handling.ai_only_rate)}</p>
                                <p className="text-[11px] text-fg-muted">answered by the AI alone</p>
                              </div>
                            </div>
                            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-subtle" role="img" aria-label="Share of conversations by who replied">
                              {HANDLING_ROWS.map((row) => (s.handling[row.key] > 0 ? <div key={row.key} style={{ width: `${(s.handling[row.key] / s.active_conversations) * 100}%`, backgroundColor: row.color }} title={`${row.label}: ${s.handling[row.key]}`} /> : null))}
                            </div>
                            <ul className="mt-4 space-y-2.5">
                              {HANDLING_ROWS.map((row) => (
                                <li key={row.key} className="flex items-start justify-between gap-3 text-xs">
                                  <span className="flex min-w-0 items-start gap-2">
                                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span className="min-w-0"><span className="block font-medium text-ink">{row.label}</span><span className="block text-[11px] text-fg-muted">{row.sub}</span></span>
                                  </span>
                                  <span className="shrink-0 font-bold text-fg-muted">{num(s.handling[row.key])} · {Math.round((s.handling[row.key] / s.active_conversations) * 100)}%</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </Card>

                      <Card title="Time to First Reply, by Who Replied" subtitle="For conversations that started in this period, who sent the first reply and how fast">
                        {s.first_reply.by_sender.length === 0 ? (
                          <p className="mt-4 text-sm text-fg-muted">No first replies were sent to conversations that started in this period.</p>
                        ) : (
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-line text-fg-muted">
                                  <th className="pb-3 font-semibold">First reply from</th>
                                  <th className="pb-3 font-semibold">Conversations</th>
                                  <th className="pb-3 font-semibold">Median</th>
                                  <th className="pb-3 font-semibold">9 in 10 within</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {SENDER_ORDER.map((key) => s.first_reply.by_sender.find((item) => item.sender === key)).filter(Boolean).map((item) => (
                                  <tr key={item.sender}>
                                    <td className="py-3"><span className="flex items-center gap-2 font-semibold text-ink"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENDER_META[item.sender].color }} />{SENDER_META[item.sender].label}</span></td>
                                    <td className="py-3 font-bold text-primary">{num(item.conversations)}</td>
                                    <td className="py-3 font-semibold text-ink">{duration(item.median_seconds)}</td>
                                    <td className="py-3 text-fg-muted">{duration(item.p90_seconds)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className="mt-4 border-t border-line pt-3 text-[11px] text-fg-muted">
                          {num(s.first_reply.answered_conversations)} of {num(s.first_reply.eligible_conversations)} conversations that started in this period and had a customer message received a reply. A conversation is counted once, under whoever replied first.
                        </p>
                      </Card>
                    </div>

                    <Card title="Replies Over Time" subtitle="Messages sent to customers each day, by sender">
                      <div className="mb-2 mt-2 flex flex-wrap items-center gap-3 text-xs">
                        {SENDER_ORDER.map((key) => (
                          <span key={key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: SENDER_META[key].color }} /> {SENDER_META[key].label}</span>
                        ))}
                      </div>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F2F6" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#77798C', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                            <YAxis allowDecimals={false} tick={{ fill: '#77798C', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <RechartsTooltip contentStyle={CHART_TOOLTIP} labelStyle={{ fontWeight: 'bold', color: '#25263A', marginBottom: 4 }} />
                            <Bar dataKey="ai_replies" name={SENDER_META.ai.label} stackId="replies" fill={SENDER_META.ai.color} />
                            <Bar dataKey="team_replies" name={SENDER_META.team.label} stackId="replies" fill={SENDER_META.team.color} />
                            <Bar dataKey="automated_replies" name={SENDER_META.automated.label} stackId="replies" fill={SENDER_META.automated.color} />
                            <Bar dataKey="other_replies" name={SENDER_META.other.label} stackId="replies" fill={SENDER_META.other.color} radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <p className="rounded-card border border-line bg-subtle/60 px-4 py-3 text-xs leading-relaxed text-fg-muted">
                      <span className="font-semibold text-ink">How replies are counted.</span> Every message sent to a customer is in exactly one group. <b>AI</b> counts messages the AI agent confirmed it sent. <b>Human agents</b> are messages typed by someone on your team. <b>Automated flows</b> come from a flow or automation. <b>Outside Orb</b> is anything else: messages sent from another app, or through the API without an AI confirmation. Because of that last group, the AI count is a minimum and may be a little low.
                    </p>
                  </div>
                )
              )}

              {activeTab === 'messages' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard title="Customer Messages" value={num(s.customer_messages)} change={c.customer_messages.change_pct} sub="Received in this period" />
                    <StatCard title="Messages Sent" value={num(s.replies_sent)} change={c.replies_sent.change_pct} sub={s.reply_split_available ? splitText(s.replies) : `Includes automated and proactive messages · ${num(s.replies_from_dashboard)} typed by your team in the dashboard`} />
                    <StatCard title="Active Conversations" value={num(s.active_conversations)} sub="Conversations with at least one customer message" />
                  </div>
                  <p className="rounded-card border border-line bg-subtle/60 px-4 py-3 text-xs text-fg-muted">
                    {s.reply_split_available ? (
                      <>Messages sent include automated and proactive messages as well as replies. <button type="button" onClick={() => setParams({ tab: 'replies' })} className="font-semibold text-primary underline-offset-2 hover:underline">See who sent them: AI, human agents or automations</button>.</>
                    ) : (
                      'Messages sent include automated and proactive messages as well as replies, and are reported together.'
                    )}
                  </p>

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
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
