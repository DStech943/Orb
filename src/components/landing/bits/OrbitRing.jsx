import React, { useEffect, useRef } from 'react'
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/**
 * Cards that orbit the Orb on a tilted ellipse, like a planetary ring. Cards on the far side
 * pass behind the orb (lower z-index, smaller, softer); on the near side they pass in front.
 * The orb itself sits at z-index 10 in the same stacking context.
 */
function Satellite({ t, size, index, count, rx, ry, tilt, children }) {
  const angle = useTransform(t, (v) => v + (index / count) * Math.PI * 2)
  const depth = useTransform(angle, (a) => Math.sin(a))
  // Position by transform, not left/top: moving `left`/`top` every frame forces layout for the
  // whole stage, while a transform stays on the compositor. `size` is the stage in pixels.
  const x = useTransform(angle, (a) => `calc(-50% + ${((Math.cos(a) * rx) / 100 * size.get().w).toFixed(2)}px)`)
  const y = useTransform(angle, (a) => `calc(-50% + ${(((Math.sin(a) * ry + Math.cos(a) * tilt) / 100) * size.get().h).toFixed(2)}px)`)
  const scale = useTransform(depth, (d) => 0.8 + 0.2 * ((d + 1) / 2))
  const opacity = useTransform(depth, (d) => 0.5 + 0.5 * ((d + 1) / 2))
  const zIndex = useTransform(depth, (d) => (d > -0.12 ? 30 : 5))
  const filter = useTransform(depth, (d) => (d < -0.2 ? `blur(${Math.min(2, -d * 2.4).toFixed(2)}px)` : 'none'))
  return (
    <motion.div className="absolute left-1/2 top-1/2" style={{ x, y, scale, opacity, zIndex, filter, willChange: 'transform, opacity' }}>
      {children}
    </motion.div>
  )
}

export default function OrbitRing({ items, rx = 64, ry = 20, tilt = 12, period = 46, start = -0.5 }) {
  const reduce = useReducedMotion()
  const t = useMotionValue(start)
  const size = useMotionValue({ w: 1, h: 1 })
  const probe = useRef(null)
  useEffect(() => {
    // The probe fills the same containing block the satellites are positioned against.
    const el = probe.current
    if (!el) return undefined
    const measure = () => size.set({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [size])
  useAnimationFrame((_, delta) => {
    if (reduce) return
    t.set(t.get() + (Math.min(delta, 64) / 1000) * ((Math.PI * 2) / period))
  })
  return (
    <>
      <span ref={probe} aria-hidden="true" className="pointer-events-none absolute inset-0" />
      {items.map((item, i) => (
        <Satellite key={i} t={t} size={size} index={i} count={items.length} rx={rx} ry={ry} tilt={tilt}>{item}</Satellite>
      ))}
    </>
  )
}
