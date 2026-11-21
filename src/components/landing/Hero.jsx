import React, { useEffect, useRef, useState } from 'react'
import TransitionLink from '../ui/TransitionLink'
import { arrivedViaTransition } from '../../lib/viewTransition'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowDown, ArrowRight, Check, FileText, Play, UserRound } from 'lucide-react'
import Orb from '../Orb'
import DotGrid from '../DotGrid'
import { ease, FadeUp, Magnetic } from './primitives'
import { ProxWord, useProximity } from './bits/VariableProximity'
import RotatingText from './bits/RotatingText'
import OrbitRing from './bits/OrbitRing'

/** One word that rises out of a mask; its letters still react to the cursor. */
function Rise({ children, delay = 0 }) {
  const reduce = useReducedMotion()
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] pr-[0.04em] -mr-[0.04em] align-bottom">
      <motion.span className="inline-block" initial={reduce ? false : { y: '110%', rotate: 4 }} animate={{ y: '0%', rotate: 0 }} transition={{ duration: 1.15, ease, delay }}>
        {children}
      </motion.span>
    </span>
  )
}

const words = (list, start) => list.map((word, i) => (
  <React.Fragment key={word}>
    <Rise delay={start + i * 0.08}><ProxWord>{word}</ProxWord></Rise>{' '}
  </React.Fragment>
))

/* ---------- things orbiting the orb ---------- */
const bubble = 'whitespace-nowrap rounded-2xl text-[13px] font-medium shadow-[0_16px_36px_-14px_rgba(60,40,140,0.45)]'
const chip = `${bubble} flex items-center gap-2 border border-white bg-white/85 py-1.5 pl-1.5 pr-3.5 text-ink`
const satellites = [
  <div className={`${bubble} rounded-br-md bg-primary px-4 py-2.5 text-white`}>Where’s my order?</div>,
  <div className={chip}><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#E7F8EE]"><span className="h-2 w-2 rounded-full bg-[#25D366]" /></span>WhatsApp</div>,
  <div className="flex items-end gap-2">
    <span className="mb-0.5 h-6 w-6 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff_0%,#c9b8ff_35%,#7c5cff_70%,#4cc2e9_100%)] shadow-[0_4px_12px_-4px_rgba(99,91,255,0.8)]" />
    <div className="w-[210px] rounded-2xl rounded-bl-md border border-white bg-white px-3.5 py-2.5 shadow-[0_16px_36px_-14px_rgba(60,40,140,0.45)]">
      <p className="text-[13px] font-medium leading-[1.35] text-ink">Out for delivery. It’s at your door by 6 pm.</p>
      <p className="mt-1.5 flex items-center gap-1 border-t border-line pt-1.5 text-[10.5px] font-semibold text-success"><Check size={11} strokeWidth={3} /> Checked in Shopify</p>
    </div>
  </div>,
  <div className={chip}><span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-tint text-primary"><FileText size={13} /></span>Returns policy.pdf</div>,
  <div className={`${bubble} rounded-br-md bg-ink px-4 py-2.5 text-white`}>Can I swap to a size M?</div>,
  <div className={chip}><span className="grid h-6 w-6 place-items-center rounded-lg bg-[#FFE9D2] text-[#C26A00]"><UserRound size={13} /></span>Handed to Priya: refund request</div>,
]

/** The tilted ring the satellites ride on, drawn faintly behind the orb. */
function RingPath({ rx, ry, tilt }) {
  const points = Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2
    return `${50 + Math.cos(a) * rx},${50 + Math.sin(a) * ry + Math.cos(a) * tilt}`
  }).join(' ')
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <polyline points={points} fill="none" stroke="rgba(99,91,255,0.28)" strokeWidth="1" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ---------- live feed card ---------- */
const feedPool = [
  { channel: 'WhatsApp', dot: 'bg-[#25D366]', text: 'Is this serum OK for sensitive skin?', status: 'Resolved', time: '0.9s' },
  { channel: 'Instagram', dot: 'bg-gradient-to-br from-[#F58529] to-[#DD2A7B]', text: 'Do you ship to Dubai?', status: 'Resolved', time: '1.1s' },
  { channel: 'Email', dot: 'bg-primary', text: 'Parcel says delivered, but it isn’t here', status: 'Handed off', time: '1.4s' },
  { channel: 'WhatsApp', dot: 'bg-[#25D366]', text: 'Any offers on the 60-day pack?', status: 'Resolved', time: '0.8s' },
  { channel: 'Instagram', dot: 'bg-gradient-to-br from-[#F58529] to-[#DD2A7B]', text: 'Can I change my delivery address?', status: 'Resolved', time: '1.2s' },
]

function LiveFeed() {
  const reduce = useReducedMotion()
  const [head, setHead] = useState(0)
  useEffect(() => {
    if (reduce) return undefined
    const id = setInterval(() => setHead((h) => h + 1), 2600)
    return () => clearInterval(id)
  }, [reduce])
  const rows = [0, 1, 2].map((i) => ({ ...feedPool[(head + feedPool.length * 4 - i) % feedPool.length], key: head - i }))
  return (
    <div aria-hidden="true" className="w-[290px] rounded-[22px] border border-white/90 bg-white/65 p-3 shadow-[0_24px_60px_-28px_rgba(60,40,140,0.45)] backdrop-blur-xl">
      <div className="flex items-center justify-between px-1.5 pb-2.5 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        <span className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" /><span className="relative h-2 w-2 rounded-full bg-success" /></span>Live inbox</span>
        <span className="normal-case tracking-normal">just now</span>
      </div>
      <ul className="relative h-[246px] overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) => (
            <motion.li
              key={row.key}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
              className="mb-1.5 rounded-2xl border border-white bg-white/90 px-3 py-2.5 shadow-card"
            >
              <p className="flex items-center gap-1.5 text-[11px] text-fg-muted"><span className={`h-2 w-2 rounded-full ${row.dot}`} />{row.channel}</p>
              <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{row.text}</p>
              <p className={`mt-1 text-[11px] font-semibold ${row.status === 'Resolved' ? 'text-success' : 'text-[#C26A00]'}`}>{row.status} · {row.time}</p>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

/* ---------- hero ---------- */
export default function Hero() {
  const [arrived] = useState(arrivedViaTransition)
  const ref = useRef(null)
  const titleRef = useRef(null)
  const reduce = useReducedMotion()
  useProximity(titleRef, { radius: 240, from: 800, to: 260 })

  // Scrolling away pulls the two headline lines apart and lets the orb swell into the gap.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const leftX = useTransform(scrollYProgress, [0, 1], ['0vw', '-14vw'])
  const rightX = useTransform(scrollYProgress, [0, 1], ['0vw', '14vw'])
  const orbScale = useTransform(scrollYProgress, [0, 1], [1, 1.45])
  const sideFade = useTransform(scrollYProgress, [0, 0.45], [1, 0])
  const motionStyle = (style) => (reduce ? undefined : style)

  const ring = { rx: 66, ry: 21, tilt: 13 }

  return (
    <section id="home" ref={ref} aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-24 sm:pt-28">
      {/* Cursor-reactive dot field (click it for a shockwave), feathered out at the edges. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_75%_70%_at_50%_45%,#000_30%,transparent_80%)]">
        <DotGrid baseColor="#DCD6F7" activeColor="#635BFF" dotSize={3} gap={22} proximity={150} shockRadius={280} shockStrength={4} swell={1.1} glow={0.6} />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-24 -z-10 h-[520px] w-[520px] rounded-full bg-[#B9B3FF]/30 blur-[130px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-0 -z-10 h-[460px] w-[460px] rounded-full bg-orange/25 blur-[130px]" />

      <div className="relative mx-auto flex max-w-[1560px] flex-col px-5 sm:px-8 lg:min-h-[calc(100svh-7rem)] lg:px-12">
        <div className="relative flex flex-1 flex-col">
          {/* The stage: the orb and its ring sit centred between the two headline lines, with a
              live inbox on the right. Presentation only, so it is hidden from screen readers. */}
          <div aria-hidden="true" className="absolute inset-0 z-10">
            <motion.div style={{ x: '-50%', y: '-50%', ...(reduce ? {} : { scale: orbScale }) }} className="absolute left-1/2 top-1/2 aspect-square w-[min(86vw,420px)] will-change-transform lg:w-[min(58vh,40vw)]">
              <motion.div
                className="absolute inset-0 z-10"
                initial={reduce || arrived ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.8, ease, delay: 0.3 }}
              >
                <div className="absolute inset-[18%] rounded-full bg-primary/25 blur-[70px]" />
                {/* The canvas paints a flat background; the mask feathers it into the page. */}
                <div data-vt-orb className="absolute inset-0 [mask-image:radial-gradient(circle,#000_55%,transparent_71%)]">
                  <Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#FFF9F1" size={0.92} glow={1.2} hoverIntensity={0.9} rotateOnHover followCursor intro={!arrived} dpr={1.5} />
                </div>
              </motion.div>
              <motion.div className="absolute inset-0" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 1.4 }}>
                <div className="absolute inset-0 z-0"><RingPath {...ring} /></div>
                <div className="hidden sm:block"><OrbitRing items={satellites} {...ring} /></div>
              </motion.div>
            </motion.div>

            <motion.div style={motionStyle({ opacity: sideFade })} className="absolute right-0 top-[calc(clamp(2.7rem,6.8vw,8rem)*1.05+1.5rem)] z-20 hidden xl:block">
              <FadeUp inView={false} delay={1.3}><LiveFeed /></FadeUp>
            </motion.div>
          </div>

          {/* Pointer events pass through the heading to the orb behind it; the letters still
              track the cursor through a window listener. */}
          <h1 id="hero-title" ref={titleRef} className="pointer-events-none relative z-20 flex flex-1 flex-col font-sans text-[clamp(2.7rem,6.8vw,8rem)] font-extrabold leading-[0.95] tracking-[-0.05em] text-ink">
            <motion.span style={motionStyle({ x: leftX })} className="block will-change-transform lg:whitespace-nowrap">
              {words(['Customer', 'support,'], 0.15)}
            </motion.span>
            <span aria-hidden="true" className="block h-[min(86vw,420px)] lg:h-auto lg:min-h-[380px] lg:flex-1" />
            <motion.span style={motionStyle({ x: rightX })} className="block will-change-transform lg:whitespace-nowrap lg:text-right">
              {words(['written', 'in', 'your'], 0.35)}
              <Rise delay={0.6}>
                <RotatingText words={['voice.', 'tone.', 'style.', 'words.']} startDelay={2600} interval={2600} className="font-display font-[360] italic tracking-[-0.03em] text-primary" />
              </Rise>
            </motion.span>
          </h1>
        </div>

          {/* Copy and calls to action: under the headline on phones, floating in the stage's
              lower left on large screens. */}
          <motion.div style={motionStyle({ opacity: sideFade })} className="relative z-30 mt-8 lg:absolute lg:bottom-[calc(clamp(2.7rem,6.8vw,8rem)*1.05+2rem+100px)] lg:left-12 lg:mt-0 lg:max-w-[340px]">
            <FadeUp inView={false} delay={0.9} className="max-w-md text-base leading-7 text-fg-muted sm:text-[17px]">
              Teach Orb once. It answers the way your best teammate would, everywhere your customers are, and calls a human when it isn’t sure.
            </FadeUp>
            <FadeUp inView={false} delay={1.05} className="mt-7 flex flex-wrap items-center gap-3">
              <Magnetic>
                <TransitionLink to="/signup" className="lp-btn-shine group inline-flex h-12 items-center gap-2 rounded-full bg-primary pl-6 pr-5 text-sm font-semibold text-white shadow-[0_18px_40px_-14px_rgba(99,91,255,0.9)] transition-colors hover:bg-primary-dark">
                  Start building free
                  <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1" />
                </TransitionLink>
              </Magnetic>
              <Magnetic strength={0.2}>
                <a href="#how" className="group inline-flex h-12 items-center gap-2.5 rounded-full border border-white/90 bg-white/70 pl-2 pr-5 text-sm font-semibold text-ink shadow-card backdrop-blur transition-colors hover:bg-white">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition-transform duration-300 group-hover:scale-110"><Play size={12} fill="currentColor" aria-hidden="true" /></span>
                  See how it works
                </a>
              </Magnetic>
            </FadeUp>
          </motion.div>

        <FadeUp inView={false} delay={1.3} className="relative z-20 mt-10 flex items-center justify-between gap-4 border-t border-ink/10 py-5 text-xs text-fg-muted lg:mt-6">
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Works with</span>
            {['Shopify', 'WhatsApp', 'Instagram', 'Email'].map((name) => <span key={name} className="font-semibold text-ink/70">{name}</span>)}
          </span>
          <a href="#how" className="group hidden items-center gap-2 font-medium text-ink/70 hover:text-ink sm:flex">
            Scroll to explore
            <span className="grid h-8 w-8 place-items-center rounded-full border border-ink/15 transition-transform duration-300 group-hover:translate-y-0.5"><ArrowDown size={13} className={reduce ? '' : 'animate-bounce'} /></span>
          </a>
        </FadeUp>
      </div>
    </section>
  )
}
