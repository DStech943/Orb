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
