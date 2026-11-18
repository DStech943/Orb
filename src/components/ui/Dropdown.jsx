import React, { useEffect, useRef, useState } from 'react'

export default function Dropdown({ trigger, children, align = 'right', className = '', panelClassName = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const key = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [])
  return (
    <div ref={ref} className={`relative ${className}`}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div
          role="menu"
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-30 mt-2 min-w-48 animate-pop-in glass-float rounded-card p-1 ${panelClassName}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
