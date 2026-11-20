import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { FadeUp, Magnetic, RevealLines } from './primitives'

export default function Cta() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const orbY = useTransform(scrollYProgress, [0, 1], [120, -120])
  const scale = useTransform(scrollYProgress, [0, 0.4], [0.94, 1])

  return (
    <section id="start" ref={ref} aria-labelledby="cta-title" className="px-2 pb-6 sm:px-3">
      <motion.div style={reduce ? undefined : { scale }} className="relative overflow-hidden rounded-[40px] bg-[#0D0B26] px-6 py-28 text-center text-white sm:py-40">
        <div aria-hidden="true" className="lp-gridlines lp-gridlines--night pointer-events-none absolute inset-0" />
        <motion.div aria-hidden="true" style={reduce ? undefined : { y: orbY }} className="pointer-events-none absolute left-1/2 top-1/2 -ml-[210px] -mt-[210px] h-[420px] w-[420px] opacity-60">
          <div className="lp-css-orb h-full w-full blur-2xl"><div className="lp-css-orb__core" /></div>
        </motion.div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#0D0B26_75%)]" />

        <div className="relative">
          <h2 id="cta-title" className="mx-auto max-w-4xl font-display text-[clamp(2.6rem,7vw,6.25rem)] font-[360] leading-[0.98] tracking-[-0.035em]">
            <RevealLines inView emClassName="text-[#B8B2FF]" lines={[['Give', 'your', 'agent', 'a', 'brain'], ['worth', { em: 'trusting.' }]]} />
          </h2>
          <FadeUp delay={0.35} className="mx-auto mt-6 max-w-md text-base leading-7 text-white/65">Set up your workspace in an afternoon. Your customers will notice by the evening.</FadeUp>
          <FadeUp delay={0.5} className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Magnetic>
              <Link to="/signup" className="lp-btn-shine group inline-flex h-14 items-center gap-2 rounded-full bg-white pl-7 pr-6 text-[15px] font-semibold text-ink shadow-[0_20px_50px_-15px_rgba(169,163,255,0.8)]">
                Create your workspace
                <ArrowRight size={17} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Magnetic>
            <Link to="/login" className="inline-flex h-14 items-center rounded-full px-6 text-[15px] font-medium text-white/75 transition-colors hover:text-white">I already have an account</Link>
          </FadeUp>
        </div>
      </motion.div>
    </section>
  )
}
