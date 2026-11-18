import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// The last word of a plain-text title is italic, matching page titles.
const accent = (title) => {
  if (typeof title !== 'string') return title
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return <em>{title}</em>
  return <>{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em></>
}

/**
 * The one card used for every list-like block on the Overview (attention, activity, stock,
 * operations): a serif title with an italic accent, an optional count pill, an optional
 * "view all" link on the right, then the content.
 */
export default function Panel({ title, count, countTone = 'warning', action, children, className = '', id }) {
  const tones = {
    warning: 'bg-warning-tint text-warning',
    danger: 'bg-danger-tint text-danger',
    success: 'bg-success-tint text-success',
    neutral: 'bg-subtle text-fg-muted',
  }
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-card border border-line bg-white p-4 shadow-card ${className}`}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={id} className="font-display truncate text-base font-medium">{accent(title)}</h3>
          {count !== undefined && count !== null && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[countTone] || tones.warning}`}>{count}</span>
          )}
        </div>
        {action && (
          <Link to={action.to} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            {action.label} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}
