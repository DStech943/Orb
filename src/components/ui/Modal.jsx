import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useFocusTrap from '../../hooks/useFocusTrap'

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-lg',
}) {
  const ref = useRef(null)
  useFocusTrap(ref, open, onClose)
  if (!open || typeof document === 'undefined') return null
  // Pages use entrance transforms. A fixed element inside a transformed parent
  // becomes page-relative, which can leave the dialog off-screen on long lists.
  return createPortal(
    <div
      className="fixed inset-0 z-[110] grid animate-fade-in place-items-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`my-8 flex max-h-[90vh] w-full ${maxWidth} animate-pop-in flex-col glass-float overflow-hidden rounded-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 id="modal-title" className="font-display text-xl font-medium">{title}</h2>
            {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="-mr-1.5 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-subtle hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto thin-scroll px-6 ${footer ? 'pb-2' : 'pb-6'}`}>{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line bg-white/95 px-6 py-4 backdrop-blur-sm">
            {footer}
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}
