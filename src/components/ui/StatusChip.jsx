import React from 'react'

const tones = {
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  primary: 'bg-primary-tint text-primary',
  danger: 'bg-danger-tint text-danger',
  neutral: 'bg-subtle text-fg-muted',
}
const statusTone = {
  active: 'success', published: 'success', resolved: 'success', retested: 'success', sent: 'success',
  draft: 'neutral', open: 'warning', pending: 'warning',
  review: 'primary', approved: 'primary', updated_in_knowledge: 'primary', 'updated in knowledge': 'primary',
  archived: 'neutral', rejected: 'danger', failed: 'danger',
}

const labelFor = (status) => String(status || '—').trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function StatusChip({ status, tone }) {
  const label = labelFor(status)
  const resolved = tone || statusTone[label.toLowerCase()] || statusTone[String(status || '').toLowerCase()] || 'neutral'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[resolved]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  )
}
