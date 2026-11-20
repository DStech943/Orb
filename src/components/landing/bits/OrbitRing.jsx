import React from 'react'
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/**
 * Cards that orbit the Orb on a tilted ellipse, like a planetary ring. Cards on the far side
 * pass behind the orb (lower z-index, smaller, softer); on the near side they pass in front.
 * The orb itself sits at z-index 10 in the same stacking context.
 */
function Satellite({ t, index, count, rx, ry, tilt, children }) {
  const angle = useTransform(t, (v) => v + (index / count) * Math.PI * 2)
  const depth = useTransform(angle, (a) => Math.sin(a))
  const left = useTransform(angle, (a) => `${50 + Math.cos(a) * rx}%`)
  const top = useTransform(angle, (a) => `${50 + Math.sin(a) * ry + Math.cos(a) * tilt}%`)
  const scale = useTransform(depth, (d) => 0.8 + 0.2 * ((d + 1) / 2))
  const opacity = useTransform(depth, (d) => 0.5 + 0.5 * ((d + 1) / 2))
  const zIndex = useTransform(depth, (d) => (d > -0.12 ? 30 : 5))
  const filter = useTransform(depth, (d) => (d < -0.2 ? `blur(${Math.min(2, -d * 2.4).toFixed(2)}px)` : 'blur(0px)'))
  return (
    <motion.div className="absolute" style={{ left, top, scale, opacity, zIndex, filter, x: '-50%', y: '-50%' }}>
      {children}
    </motion.div>
  )
}

export default function OrbitRing({ items, rx = 64, ry = 20, tilt = 12, period = 46, start = -0.5 }) {
  const reduce = useReducedMotion()
  const t = useMotionValue(start)
  useAnimationFrame((_, delta) => {
    if (reduce) return
    t.set(t.get() + (Math.min(delta, 64) / 1000) * ((Math.PI * 2) / period))
  })
  return (
    <>
      {items.map((item, i) => (
        <Satellite key={i} t={t} index={i} count={items.length} rx={rx} ry={ry} tilt={tilt}>{item}</Satellite>
      ))}
    </>
  )
}
