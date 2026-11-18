import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useFocusTrap from '../../hooks/useFocusTrap'

export default function Drawer({ open, onClose, title, children, footer, side = 'right', width = 'max-w-md', bare = false }) {
  const ref = useRef(null)
  useFocusTrap(ref, open, onClose)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  if (!open) return null

  const align = side === 'left' ? 'justify-start' : 'justify-end'
  const direction = side === 'left' ? 'drawer-panel-left' : 'drawer-panel-right'
  const drawer = (
    <div className={`drawer-backdrop fixed inset-0 z-[80] flex ${align} bg-ink/40 backdrop-blur-[2px]`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="drawer-title" className={`drawer-panel ${direction} h-full w-full ${width} overflow-y-auto glass-float ${side === 'left' ? 'border-r !rounded-l-none !rounded-r-3xl' : 'border-l !rounded-r-none !rounded-l-3xl'} ${bare ? '' : 'p-5'} ${footer ? 'pb-24' : ''}`}>
        {!bare && (
          <div className="mb-6 flex items-center justify-between">
            <h2 id="drawer-title" className="max-w-[42rem] truncate text-lg font-semibold" title={title}>{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close panel" className="grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-subtle hover:text-ink"><X size={18} /></button>
          </div>
        )}
        {bare && <h2 id="drawer-title" className="sr-only">{title}</h2>}
        {children}
      </section>
      {footer && <footer className="fixed inset-x-0 bottom-0 z-[90] border-t border-line bg-white/95 px-5 py-3 backdrop-blur-sm">{footer}</footer>}
    </div>
  )

  return createPortal(drawer, document.body)
}
