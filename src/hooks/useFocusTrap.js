import { useEffect, useRef } from 'react'

export default function useFocusTrap(ref, active, onClose) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!active || !ref.current) return undefined
    const node = ref.current
    const previousFocus = document.activeElement
    const focusable = () => [...node.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled)
    focusable()[0]?.focus({ preventScroll: true })
    const handleKey = (event) => {
      if (event.key === 'Escape') { onCloseRef.current?.(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const start = items[0]
      const end = items[items.length - 1]
      if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end.focus({ preventScroll: true }) }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start.focus({ preventScroll: true }) }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previousFocus?.focus?.({ preventScroll: true })
    }
  }, [active, ref])
}
