import React from 'react'
import Doodle from './Doodle'
import Button from './Button'
export default function EmptyState({ title = 'Nothing here yet.', action = 'Create one', onAction }) { return <div className="grid justify-items-center gap-3 border-2 border-dashed border-ink bg-white px-6 py-12 text-center"><Doodle variant="squiggle" className="h-12 w-20 text-purple" /><p className="font-bold">{title}</p><Button size="sm" onClick={onAction}>{action}</Button></div> }
