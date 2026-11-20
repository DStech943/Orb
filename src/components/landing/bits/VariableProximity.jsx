import React, { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * After React Bits' VariableProximity: letters near the pointer slide along the variable
 * font's weight axis. Every `[data-prox]` letter inside `containerRef` takes part, so the
 * headline can keep its own markup (masks, rotating words) and simply tag its letters.
 */
export function useProximity(containerRef, { radius = 220, from = 800, to = 300 } = {}) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const root = containerRef.current
    if (!root || reduce || !window.matchMedia('(pointer: fine)').matches) return undefined
    let raf = 0
    let pointer = null
    let active = false

    const paint = () => {
      raf = 0
      const letters = root.querySelectorAll('[data-prox]')
      let still = false
      letters.forEach((el) => {
        let weight = from
        if (pointer) {
          const r = el.getBoundingClientRect()
          const d = Math.hypot(pointer.x - (r.left + r.width / 2), pointer.y - (r.top + r.height / 2))
          if (d < radius) {
            const t = 1 - d / radius
            weight = from + (to - from) * t * t * (3 - 2 * t)
          }
        }
        const current = Number(el.dataset.w || from)
        const next = current + (weight - current) * 0.28
        if (Math.abs(next - weight) > 0.5) still = true
        el.dataset.w = String(next)
        el.style.fontWeight = String(Math.round(next))
      })
      if (still || active) raf = requestAnimationFrame(paint)
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(paint) }
    const move = (event) => { pointer = { x: event.clientX, y: event.clientY }; active = true; wake(); clearTimeout(move.t); move.t = setTimeout(() => { active = false }, 120) }
    const leave = () => { pointer = null; wake() }

    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(move.t)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
    }
  }, [containerRef, reduce, radius, from, to])
}

/** Splits a word into proximity letters. Screen readers get the word once. */
export function ProxWord({ children, className = '' }) {
  const text = String(children)
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((char, i) => (
        <span key={i} data-prox aria-hidden="true" className="inline-block">{char}</span>
      ))}
    </span>
  )
}

export default function VariableProximity({ text, className = '', ...options }) {
  const ref = useRef(null)
  useProximity(ref, options)
  return <span ref={ref} className={className}><ProxWord>{text}</ProxWord></span>
}
