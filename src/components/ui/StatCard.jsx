import React from 'react'

export default function StatCard({ icon: Icon, value, label, trend, className = '' }) {
  const hasTrend = typeof trend === 'number'
  const positive = trend >= 0
  return (
    <article className={`rounded-card border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-primary/30 ${className}`}>
      <div className="flex items-start justify-between">
        {Icon && <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-tint text-primary"><Icon size={18} /></span>}
        {hasTrend && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${positive ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning'}`}>{positive ? '+' : ''}{trend}%</span>}
      </div>
      <strong className="mt-4 block text-2xl font-semibold tracking-tight">{value}</strong>
      <p className="mt-0.5 text-sm text-fg-muted">{label}</p>
    </article>
  )
}
