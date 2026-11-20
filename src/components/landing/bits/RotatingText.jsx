import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

/**
 * After React Bits' RotatingText: the word swaps letter by letter, each one rolling up
 * out of a mask, and the slot eases to the new word's width.
 */
export default function RotatingText({ words, interval = 2800, startDelay = 0, className = '' }) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduce || words.length < 2) return undefined
    let timer
    const start = setTimeout(() => {
      timer = setInterval(() => setIndex((i) => (i + 1) % words.length), interval)
    }, startDelay)
    return () => { clearTimeout(start); clearInterval(timer) }
  }, [reduce, words.length, interval, startDelay])

  const word = words[index]
  return (
    <motion.span layout transition={{ layout: { duration: 0.6, ease: [0.32, 0.72, 0, 1] } }} className={`relative inline-flex overflow-hidden pb-[0.12em] -mb-[0.12em] pr-[0.06em] align-bottom ${className}`}>
      <span className="sr-only">{word}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={word} aria-hidden="true" className="inline-flex whitespace-pre">
          {Array.from(word).map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ y: '115%', opacity: 0, rotate: 8 }}
              animate={{ y: '0%', opacity: 1, rotate: 0 }}
              exit={{ y: '-115%', opacity: 0, rotate: -6 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300, delay: i * 0.028 }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}
