import React from 'react'
import StatusChip from '../ui/StatusChip'
import Button from '../ui/Button'
export default function ProgressRow({ item, onRetry }) { return <div className="grid gap-2 border-b border-ink/10 py-4 last:border-0 sm:grid-cols-[130px_100px_1fr_auto] sm:items-center"><strong>{item.name}</strong><StatusChip status={item.status} /><div><div className="h-3 overflow-hidden rounded border-2 border-ink/20 bg-white"><div className="h-full bg-purple" style={{ width: `${item.progress}%` }} /></div><p className="mt-1 text-xs text-muted">{item.count}</p></div>{item.status === 'Failed' ? <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button> : <span />}</div> }
