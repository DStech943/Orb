import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useFocusTrap from '../../hooks/useFocusTrap'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  const ref = useRef(null)
  useFocusTrap(ref, open, onClose)
  if (!open || typeof document === 'undefined') return null
  // Pages use entrance transforms. A fixed element inside a transformed parent
  // becomes page-relative, which can leave the dialog off-screen on long lists.
  return createPortal(
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-ink/50 p-4 overflow-y-auto"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`my-8 w-full ${maxWidth} border-2 border-ink bg-white p-5 shadow-brutal-lg max-h-[90vh] flex flex-col`}
      >
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h2 id="modal-title" className="text-xl font-extrabold">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto flex-1">{children}</div>
      </section>
    </div>,
    document.body
  )
}
