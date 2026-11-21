import React, { useEffect, useRef } from 'react'
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'

export const ease = [0.22, 1, 0.36, 1]

/**
 * Headline that rises word by word out of a mask.
 * `lines` is an array of lines; each line is an array of words, where a word is a
 * string or `{ em: 'word' }` for the italic accent.
 */
export function RevealLines({ lines, className = '', delay = 0, stagger = 0.07, inView = false, emClassName = 'text-primary' }) {
  const reduce = useReducedMotion()
  let index = 0
  const trigger = inView ? { whileInView: { y: '0%' }, viewport: { once: true, margin: '-10% 0px' } } : { animate: { y: '0%' } }
  return (
    <span className={className}>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} className="block">
          {line.map((word, wordIndex) => {
            const i = index++
            const isEm = typeof word === 'object'
            const text = isEm ? word.em : word
            return (
              <React.Fragment key={wordIndex}>
                <span className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] pr-[0.06em] -mr-[0.06em] align-bottom">
                  <motion.span
                    className={`inline-block will-change-transform ${isEm ? `italic ${emClassName}` : ''}`}
                    initial={reduce ? false : { y: '110%' }}
                    {...trigger}
                    transition={{ duration: 1, ease, delay: delay + i * stagger }}
                  >
                    {text}
                  </motion.span>
                </span>
                {wordIndex < line.length - 1 && ' '}
              </React.Fragment>
            )
          })}
        </span>
      ))}
    </span>
  )
}

/** Fades and lifts its children into place, on mount or when scrolled into view. */
export function FadeUp({ children, delay = 0, y = 24, inView = true, className = '', as = 'div', ...props }) {
  const reduce = useReducedMotion()
  const Component = motion[as] || motion.div
  const target = { opacity: 1, y: 0, filter: 'blur(0px)' }
  return (
    <Component
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      {...(inView ? { whileInView: target, viewport: { once: true, margin: '-8% 0px' } } : { animate: target })}
      transition={{ duration: 0.9, ease, delay }}
      {...props}
    >
      {children}
    </Component>
  )
}

/** Pulls its child gently toward the cursor while hovered. */
export function Magnetic({ children, strength = 0.3, className = '' }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 })
  const move = (event) => {
    if (reduce || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    x.set((event.clientX - (rect.left + rect.width / 2)) * strength)
    y.set((event.clientY - (rect.top + rect.height / 2)) * strength)
  }
  const reset = () => { x.set(0); y.set(0) }
  return (
    <motion.div ref={ref} className={`inline-block ${className}`} style={{ x: sx, y: sy }} onPointerMove={move} onPointerLeave={reset}>
      {children}
    </motion.div>
  )
}

/** Writes the pointer position into --mx / --my so `.lp-spot` can light the card. */
export function Spotlight({ as: Tag = 'div', className = '', children, ...props }) {
  const move = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }
  return <Tag className={`lp-spot ${className}`} onPointerMove={move} {...props}>{children}</Tag>
}

function ScrollWord({ progress, range, children, accent }) {
  const opacity = useTransform(progress, range, [0.14, 1])
  const y = useTransform(progress, range, [6, 0])
  return (
    <>
      <motion.span style={{ opacity, y }} className={`inline-block ${accent ? 'font-display italic text-primary' : ''}`}>{children}</motion.span>{' '}
    </>
  )
}

/** A paragraph that lights up word by word as it scrolls through the viewport. Wrap accent words in *asterisks*. */
export function ScrollWords({ text, className = '' }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] })
  const words = text.split(' ')
  if (reduce) return <p className={className}>{text.replaceAll('*', '')}</p>
  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => {
        const accent = word.startsWith('*')
        return (
          <ScrollWord key={i} progress={scrollYProgress} range={[i / words.length, Math.min(1, (i + 1.5) / words.length)]} accent={accent}>
            {word.replaceAll('*', '')}
          </ScrollWord>
        )
      })}
    </p>
  )
}

// One observer for every animated pill: while a pill is offscreen its border animation is
// paused, so the page does not restyle and repaint them 60 times a second for nothing.
const pillObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
  entries.forEach((entry) => entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting))
}, { rootMargin: '120px' })

/** Small uppercase eyebrow used above every section title. */
export function Eyebrow({ children, tone = 'light', className = '' }) {
  const pill = useRef(null)
  useEffect(() => {
    const el = pill.current
    if (!el || !pillObserver) return undefined
    pillObserver.observe(el)
    return () => pillObserver.unobserve(el)
  }, [])
  const colors = tone === 'night' ? 'border-white/15 bg-white/[0.06] text-white/80' : 'border-white/80 bg-white/70 text-ink/70 shadow-card'
  return (
    <span ref={pill} className={`lp-shine inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur ${colors} ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary to-orange" />
      {children}
    </span>
  )
}
