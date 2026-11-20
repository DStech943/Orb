import React from 'react'
import { ScrollWords } from './primitives'

export default function Statement() {
  return (
    <section aria-label="Why Orb" className="relative px-6 pb-36 pt-16 sm:pt-24">
      <ScrollWords
        className="mx-auto max-w-5xl text-center font-display text-[clamp(1.9rem,4.6vw,4rem)] font-[360] leading-[1.12] tracking-[-0.02em] text-white"
        text="Every answer your agent gives should sound like your *best* teammate: accurate, on brand, and backed by what your company actually *knows.*"
      />
    </section>
  )
}
