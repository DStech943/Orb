import React, { useEffect, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

/** A soft ring that trails the pointer and swells over anything clickable. */
export default function Cursor() {
  const reduce = useReducedMotion()
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.5 })
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.5 })
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (reduce || !window.matchMedia('(pointer: fine)').matches) return undefined
    const move = (event) => {
      x.set(event.clientX)
      y.set(event.clientY)
      setVisible(true)
      setActive(Boolean(event.target.closest?.('a, button, [role="tab"], input, label')))
    }
    const leave = () => setVisible(false)
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [reduce, x, y])

  if (reduce) return null
  const size = active ? 64 : 34
  return (
    <motion.div
      aria-hidden="true"
      className="lp-cursor"
      style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%' }}
      animate={{ width: size, height: size, opacity: visible ? 1 : 0, backgroundColor: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0)', borderColor: active ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.9)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    />
  )
}
