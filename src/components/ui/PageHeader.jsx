import React from 'react'
import Avatar from './Avatar'
import { useBrand } from '../../context/BrandContext'

// The last word of a plain-text title is set in italic, which gives every page the same
// friendly accent without each page having to mark it up.
function accentTitle(title) {
  if (typeof title !== 'string') return title
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return <em>{title}</em>
  return <>{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em></>
}

/**
 * The title block shared by every page: eyebrow, brand chip, title, description.
 * Use it alone when a page already has its own actions row, or use PageHeader to get both.
 */
export function PageTitle({ eyebrow, title, description, showBrand = true, count }) {
  const { brandName } = useBrand()
  return (
    <div className="min-w-0">
      {(eyebrow || (showBrand && brandName)) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          {eyebrow && <p className="text-xs font-medium uppercase tracking-wide text-primary">{eyebrow}</p>}
          {showBrand && brandName && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/70 bg-white/70 py-0.5 pl-0.5 pr-2.5 text-xs text-fg-muted">
              <Avatar name={brandName} className="h-5 w-5 text-[9px]" />
              <span className="truncate">{brandName}</span>
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-[1.75rem] font-medium leading-tight text-ink">{accentTitle(title)}</h2>
        {count !== undefined && count !== null && <span className="rounded-full bg-primary-tint px-2.5 py-0.5 text-xs font-medium text-primary">{count}</span>}
      </div>
      {description && <p className="mt-1 max-w-2xl text-sm leading-5 text-fg-muted">{description}</p>}
    </div>
  )
}

export default function PageHeader({ actions, className = '', ...title }) {
  return (
    <header className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <PageTitle {...title} />
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
