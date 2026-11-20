import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Plus } from 'lucide-react'
import { faqs } from '../../data/faqs'
import { ease, Eyebrow, FadeUp, RevealLines } from './primitives'

export default function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" aria-labelledby="faq-title" className="px-4 pb-32 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <FadeUp><Eyebrow>FAQ</Eyebrow></FadeUp>
          <h2 id="faq-title" className="mt-6 font-display text-[clamp(2.4rem,5vw,4rem)] font-[380] leading-[1] tracking-[-0.03em] text-ink">
            <RevealLines inView lines={[['Questions,'], [{ em: 'answered.' }]]} />
          </h2>
          <FadeUp delay={0.2} className="mt-5 max-w-sm text-base leading-7 text-fg-muted">The short version: bring what your team already knows, and Orb does the shaping.</FadeUp>
          <FadeUp delay={0.3}>
            <Link to="/signup" className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Try it with your own docs
              <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </FadeUp>
        </div>

        <FadeUp delay={0.1}>
          <ul className="lp-card divide-y divide-ink/[0.07] p-2 sm:p-3">
            {faqs.map((item, index) => {
              const isOpen = open === index
              const panelId = `faq-panel-${index}`
              return (
                <li key={item.question}>
                  <h3>
                    <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? -1 : index)} className="group flex w-full items-center justify-between gap-6 rounded-2xl px-4 py-5 text-left transition-colors hover:bg-white/70 sm:px-5">
                      <span className={`text-base font-medium transition-colors sm:text-lg ${isOpen ? 'text-ink' : 'text-ink/75 group-hover:text-ink'}`}>{item.question}</span>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-500 ${isOpen ? 'rotate-45 bg-primary text-white' : 'bg-white text-ink shadow-card'}`}><Plus size={16} aria-hidden="true" /></span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div id={panelId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.5, ease }} className="overflow-hidden">
                        <p className="max-w-2xl px-4 pb-6 text-[15px] leading-7 text-fg-muted sm:px-5">{item.answer}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              )
            })}
          </ul>
        </FadeUp>
      </div>
    </section>
  )
}
