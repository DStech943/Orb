import React from 'react'
import Doodle from './Doodle'
import Button from './Button'

export default function EmptyState({
  title = 'Nothing here yet.',
  description = '',
  action = 'Create one',
  onAction,
  secondaryAction,
  onSecondaryAction,
}) {
  return (
    <div className="grid justify-items-center gap-3 border-2 border-dashed border-ink bg-white px-6 py-12 text-center">
      <Doodle variant="squiggle" className="h-12 w-20 text-purple" />
      <p className="font-bold">{title}</p>
      {description && <p className="max-w-md text-sm leading-6 text-muted">{description}</p>}
      {(onAction || onSecondaryAction) && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onAction && <Button size="sm" onClick={onAction}>{action}</Button>}
          {onSecondaryAction && (
            <Button size="sm" variant="outline" onClick={onSecondaryAction}>
              {secondaryAction}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
