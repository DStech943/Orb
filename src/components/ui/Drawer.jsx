import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useFocusTrap from '../../hooks/useFocusTrap'

export default function Drawer({ open, onClose, title, children, footer, side = 'right', width = 'max-w-md' }) {
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
  const drawer = <div className={`drawer-backdrop fixed inset-0 z-[80] flex ${align} bg-ink/45`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="drawer-title" className={`drawer-panel ${direction} h-full w-full ${width} overflow-y-auto border-2 border-ink bg-white p-5 ${footer ? 'pb-24' : ''}`}>
      <div className="mb-6 flex items-center justify-between">
        <h2 id="drawer-title" className="text-xl font-extrabold">{title}</h2>
        <button onClick={onClose} aria-label="Close panel"><X /></button>
      </div>
      {children}
    </section>
    {footer && <footer className="fixed inset-x-0 bottom-0 z-[90] border-t border-ink/20 bg-white/95 px-5 py-3 backdrop-blur-sm">{footer}</footer>}
  </div>

  return createPortal(drawer, document.body)
}
