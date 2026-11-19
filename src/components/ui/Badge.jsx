import React from 'react'

export default function Badge({ children, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-tint text-primary',
    neutral: 'bg-subtle text-fg-muted',
    success: 'bg-success-tint text-success',
    warning: 'bg-warning-tint text-warning',
    danger: 'bg-danger-tint text-danger',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone] || tones.primary}`}>{children}</span>
}
