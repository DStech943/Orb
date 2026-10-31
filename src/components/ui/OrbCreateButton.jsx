import { useRef } from 'react'
import './OrbCreateButton.css'

export default function OrbCreateButton({ children, className = '', onPointerMove, onPointerLeave, ...props }) {
  const ref = useRef(null)
  const updateLight = (event) => {
    const element = ref.current
    if (element) {
      const bounds = element.getBoundingClientRect()
      element.style.setProperty('--orb-light-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`)
      element.style.setProperty('--orb-light-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`)
    }
    onPointerMove?.(event)
  }
  const resetLight = (event) => {
    ref.current?.style.removeProperty('--orb-light-x')
    ref.current?.style.removeProperty('--orb-light-y')
    onPointerLeave?.(event)
  }

  return <button ref={ref} type="button" className={`orb-create-button ${className}`} onPointerMove={updateLight} onPointerLeave={resetLight} {...props}>{children}</button>
}
