import React from 'react'

// Same treatment as the dashboard's page titles: a small indigo eyebrow, a Fraunces title,
// and the last word set in italic.
function accentTitle(title) {
  if (typeof title !== 'string') return title
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return <em>{title}</em>
  return <>{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em></>
}

export default function SectionHeading({ badge, title, id, description, className = '' }) {
  return (
    <div className={`mx-auto max-w-2xl text-center ${className}`}>
      {badge && <p className="text-xs font-medium uppercase tracking-wide text-primary">{badge}</p>}
      <h2 id={id} className="mt-2 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">{accentTitle(title)}</h2>
      {description && <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-fg-muted">{description}</p>}
    </div>
  )
}
