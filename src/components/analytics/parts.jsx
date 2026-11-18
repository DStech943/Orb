import React from 'react'
import { ArrowDownRight, ArrowUpRight, Info, Minus, RefreshCw } from 'lucide-react'
import OrbLoader from '../ui/OrbLoader'
import Button from '../ui/Button'

// ---- formatting ------------------------------------------------------------------------
export const num = (value) => (value == null ? '—' : Number(value).toLocaleString())
export const percent = (value) => (value == null ? '—' : `${value}%`)

export function duration(seconds) {
  if (seconds == null) return '—'
  const s = Number(seconds)
  if (s < 90) return `${Math.round(s)} sec`
  if (s < 5400) return `${Math.round(s / 60)} min`
  const hours = s / 3600
  return hours < 48 ? `${hours.toFixed(1)} hr` : `${(hours / 24).toFixed(1)} days`
}

export const hours = (value) => (value == null ? '—' : Number(value) < 1 ? `${Math.round(Number(value) * 60)} min` : `${value} hr`)

export const dayLabel = (iso) => {
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export const hourLabel = (hour) => (hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`)

/** "12 Nov - 18 Nov" for an API period, in the workspace timezone. `to` is the first instant AFTER the period. */
export function periodLabel(period, timeZone = 'Asia/Kolkata') {
  if (!period?.from || !period?.to) return ''
  const start = new Date(period.from)
  const end = new Date(new Date(period.to).getTime() - 1000)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  const fmt = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone })
  const a = fmt(start)
  const b = fmt(end)
  return a === b ? a : `${a} – ${b}`
}

// ---- building blocks -------------------------------------------------------------------
/** Change against the previous period of the same length. Nothing is shown with no baseline. */
export function Delta({ change, unit = '%', goodWhen = 'up' }) {
  if (change == null) return <span className="text-[11px] text-fg-muted">No earlier data to compare</span>
  if (change === 0) return <span className="inline-flex items-center gap-0.5 text-xs font-bold text-fg-muted"><Minus size={13} /> No change</span>
  const up = change > 0
  const good = (goodWhen === 'up') === up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${good ? 'text-success' : 'text-danger'}`} title="Compared with the previous period of the same length">
      <Icon size={14} /> {up ? '+' : ''}{change}{unit}
    </span>
  )
}

export function StatCard({ title, icon: Icon, tone = 'bg-primary-tint text-primary', value, change, unit, goodWhen, sub }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-fg-muted">
        <span>{title}</span>
        {Icon && <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon size={16} /></span>}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-extrabold text-ink">{value}</span>
        {change !== undefined && <Delta change={change} unit={unit} goodWhen={goodWhen} />}
      </div>
      {sub && <p className="mt-1 text-xs text-fg-muted">{sub}</p>}
    </div>
  )
}

/** Shown wherever no real data source exists, instead of a made-up figure. */
export function NotAvailable({ title, reason, children }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-subtle/40 p-6 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-fg-muted shadow-sm"><Info size={18} /></span>
      <h3 className="mt-3 text-base font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-fg-muted">{reason}</p>
      {children}
    </div>
  )
}

/** Loading, error and empty-brand handling shared by every analytics page. */
export function AnalyticsGate({ analytics, children, label = 'Loading analytics' }) {
  const { status, data, error, reload } = analytics
  if (status === 'idle') {
    return <NotAvailable title="Choose a brand" reason="Pick a brand in the top bar to see its analytics." />
  }
  if (status === 'loading' && !data) return <OrbLoader label={label} />
  if (status === 'error') {
    return (
      <div className="rounded-card border border-red-200 bg-red-50 p-6" role="alert">
        <h3 className="text-base font-bold text-ink">Analytics could not be loaded</h3>
        <p className="mt-1 text-sm text-fg-muted">{error}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={reload}><RefreshCw size={14} /> Try again</Button>
      </div>
    )
  }
  return children(data)
}

export const CHART_TOOLTIP = { backgroundColor: '#FFFFFF', borderRadius: 12, border: '1px solid #E9EAF2', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }

// ---- who sent a reply --------------------------------------------------------------------
// Every message sent to a customer is one of these. `ai` counts only messages the AI confirmed it
// sent, so it is a minimum: replies sent without that confirmation are in `other`.
export const SENDER_META = {
  ai: { label: 'AI', color: '#635BFF', tint: 'bg-primary-tint text-primary', hint: 'Messages the AI agent confirmed it sent' },
  team: { label: 'Human agents', color: '#1F9D6B', tint: 'bg-emerald-50 text-success', hint: 'Typed by someone on your team in Orb' },
  automated: { label: 'Automated flows', color: '#FF9B3D', tint: 'bg-amber-50 text-amber-800', hint: 'Sent by a flow or automation' },
  other: { label: 'Outside Orb', color: '#A3A5B8', tint: 'bg-slate-100 text-slate-600', hint: 'Sent from another app or by the API without an AI confirmation' },
}
export const SENDER_ORDER = ['ai', 'team', 'automated', 'other']

export function SenderBadge({ sender }) {
  const meta = SENDER_META[sender]
  if (!meta) return null
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.tint}`} title={meta.hint}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />{meta.label}</span>
}
