import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { FadeUp, RevealLines } from '../components/landing/primitives'

export default function NotFound() {
  return (
    <div className="lp relative grid min-h-[100svh] place-items-center overflow-hidden px-5 text-center">
      <div aria-hidden="true" className="lp-grain" />
      <div aria-hidden="true" className="lp-gridlines pointer-events-none absolute inset-0" />
      <main className="relative">
        <div aria-hidden="true" className="relative mx-auto flex items-center justify-center font-display text-[clamp(7rem,26vw,16rem)] font-[360] leading-none tracking-[-0.06em] text-ink">
          4
          <span className="lp-css-orb mx-[0.04em] inline-block h-[0.72em] w-[0.72em]"><span className="lp-css-orb__core" /></span>
          4
        </div>
        <h1 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] font-[380] leading-tight tracking-[-0.02em] text-ink">
          <RevealLines delay={0.2} lines={[['This', 'page', 'drifted', 'out', 'of'], [{ em: 'orbit.' }]]} />
        </h1>
        <FadeUp inView={false} delay={0.6} className="mx-auto mt-4 max-w-sm text-base leading-7 text-fg-muted">The link may be old, or the page may not exist yet.</FadeUp>
        <FadeUp inView={false} delay={0.75} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/app" className="lp-btn-shine inline-flex h-12 items-center rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-[0_18px_40px_-14px_rgba(99,91,255,0.9)] hover:bg-primary-dark">Back to dashboard</Link>
          <Link to="/" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/90 bg-white/70 px-5 text-sm font-semibold text-ink shadow-card hover:bg-white"><ArrowLeft size={15} aria-hidden="true" /> Return home</Link>
        </FadeUp>
      </main>
    </div>
  )
}
