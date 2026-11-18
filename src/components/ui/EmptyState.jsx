import React from 'react'
import { Sparkles } from 'lucide-react'
import Button from './Button'

export default function EmptyState({
  title = 'Nothing here yet.',
  description = '',
  action = 'Create one',
  onAction,
  secondaryAction,
  onSecondaryAction,
  icon: Icon = Sparkles,
  className = '',
}) {
  return (
    <div className={`grid justify-items-center gap-2 rounded-card border border-dashed border-line-strong bg-white/70 px-6 py-12 text-center ${className}`}>
      <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-primary-tint text-primary"><Icon size={22} aria-hidden="true" /></span>
      <p className="font-display text-lg font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-sm leading-6 text-fg-muted">{description}</p>}
      {(onAction || onSecondaryAction) && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {onAction && <Button size="sm" onClick={onAction}>{action}</Button>}
          {onSecondaryAction && <Button size="sm" variant="secondary" onClick={onSecondaryAction}>{secondaryAction}</Button>}
        </div>
      )}
    </div>
  )
}
