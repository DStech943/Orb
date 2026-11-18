import React, { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A lightweight tooltip that renders in a portal, so it is never clipped by scrolling
// containers such as the collapsed sidebar. Shows on hover and keyboard focus.
export default function Tooltip({ label, side = 'right', children, disabled = false, className = 'inline-flex' }) {
  const ref = useRef(null)
  const id = useId()
  const [pos, setPos] = useState(null)

  const show = () => {
    if (disabled || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(
      side === 'right'
        ? { left: rect.right + 10, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' }
        : { left: rect.left + rect.width / 2, top: rect.bottom + 8, transform: 'translateX(-50%)' },
    )
  }
  const hide = () => setPos(null)

  return (
    <span ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} aria-describedby={pos ? id : undefined}>
      {children}
      {pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ position: 'fixed', zIndex: 130, ...pos }}
            className="pointer-events-none animate-fade-in whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-pop"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}
