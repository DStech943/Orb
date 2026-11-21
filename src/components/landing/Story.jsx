import React, { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { FileSpreadsheet, FileText, Globe, Hash, HelpCircle, Instagram, ListChecks, Mail, MessageCircle, Mic, Package, ScrollText } from 'lucide-react'
import { ease, Eyebrow } from './primitives'

const steps = [
  { title: 'Collect', em: 'everything.', body: 'Drop in the docs your team already has: return policies, shipping SOPs, catalogs, size guides, old support threads. Orb reads them all, and syncs your store automatically.' },
  { title: 'Distill', em: 'the signal.', body: 'Orb turns the noise into clean FAQs, step-by-step SOPs and a brand-voice guide. Your team reviews and approves, so nothing ships that you haven’t seen.' },
  { title: 'Deploy', em: 'everywhere.', body: 'Your agent answers on WhatsApp, Instagram, email and web chat, on brand, on policy and in seconds. When it isn’t sure, it hands off to a human.' },
]

// Raw material, scattered around the stage (x, y, rotation in px/deg from centre).
const sources = [
  { label: 'Returns policy.pdf', icon: FileText, tint: 'from-[#FF8A7A] to-[#FF5E62]', at: [-200, -170, -8] },
  { label: 'Catalog.xlsx', icon: FileSpreadsheet, tint: 'from-[#4ADE80] to-[#16A34A]', at: [185, -190, 7] },
  { label: '#support thread', icon: Hash, tint: 'from-[#C084FC] to-[#9333EA]', at: [-235, 15, -4] },
  { label: 'Shipping SOP.doc', icon: ScrollText, tint: 'from-[#60A5FA] to-[#2563EB]', at: [225, 25, 9] },
  { label: 'Size guide', icon: Package, tint: 'from-[#FDBA74] to-[#F97316]', at: [-170, 185, 6] },
  { label: 'Escalations inbox', icon: Mail, tint: 'from-[#67E8F9] to-[#0891B2]', at: [175, 180, -7] },
]

// What comes out of the orb.
const outputs = [
  { kind: 'FAQ', icon: HelpCircle, title: 'Can I return a sale item?', body: 'Yes, within 14 days, as store credit.', to: [0, -190] },
  { kind: 'SOP', icon: ListChecks, title: 'Damaged parcel', body: '4 steps · photo → replace → notify', to: [-180, 130] },
  { kind: 'Voice', icon: Mic, title: 'Warm, concise, no jargon', body: 'Use first names. Never over-promise.', to: [180, 130] },
]

const channels = [
  { label: 'WhatsApp', icon: MessageCircle, at: [-215, -60] },
  { label: 'Instagram', icon: Instagram, at: [215, -60] },
  { label: 'Web chat', icon: Globe, at: [0, 250] },
]

function Source({ item, progress }) {
  const [sx, sy, r] = item.at
  const x = useTransform(progress, [0, 0.12, 0.3, 0.5], [sx * 1.5, sx, sx * 0.92, 0])
  const y = useTransform(progress, [0, 0.12, 0.3, 0.5], [sy * 1.5, sy, sy * 0.92, 0])
  const rotate = useTransform(progress, [0.3, 0.5], [r, r * 5])
  const scale = useTransform(progress, [0.3, 0.5], [1, 0.15])
  const opacity = useTransform(progress, [0, 0.08, 0.42, 0.5], [0, 1, 1, 0])
  const Icon = item.icon
  return (
    <motion.div style={{ x, y, rotate, scale, opacity }} className="absolute left-1/2 top-1/2 -ml-[78px] -mt-[22px] flex w-[156px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] p-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${item.tint} text-white`}><Icon size={14} /></span>
      <span className="truncate text-xs font-medium text-white/85">{item.label}</span>
    </motion.div>
  )
}

function Output({ item, progress }) {
  const [tx, ty] = item.to
  const x = useTransform(progress, [0.54, 0.74], [0, tx])
  const y = useTransform(progress, [0.54, 0.74], [0, ty])
  const scale = useTransform(progress, [0.54, 0.74], [0.3, 1])
  const opacity = useTransform(progress, [0.54, 0.62], [0, 1])
  const Icon = item.icon
  return (
    <motion.div style={{ x, y, scale, opacity }} className="absolute left-1/2 top-1/2 -ml-[105px] -mt-[42px] w-[210px] rounded-2xl border border-white/80 bg-white/95 p-3 text-ink shadow-[0_24px_50px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary"><Icon size={12} />{item.kind}</div>
      <p className="mt-1 text-sm font-semibold leading-snug">{item.title}</p>
      <p className="mt-0.5 text-[11px] text-fg-muted">{item.body}</p>
    </motion.div>
  )
}

function Channel({ item, progress, index }) {
  const start = 0.8 + index * 0.04
  const opacity = useTransform(progress, [start, start + 0.05], [0, 1])
  const scale = useTransform(progress, [start, start + 0.05], [0.6, 1])
  const Icon = item.icon
  return (
    <motion.div style={{ opacity, scale, x: item.at[0], y: item.at[1] }} className="absolute left-1/2 top-1/2 -ml-[56px] -mt-[18px] flex w-[112px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#7A70FF] to-[#4F46E5] py-2 text-xs font-semibold text-white shadow-[0_12px_30px_-10px_rgba(99,91,255,0.9)]">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
      <Icon size={13} />{item.label}
    </motion.div>
  )
}

function Stage({ progress }) {
  const orbScale = useTransform(progress, [0, 0.3, 0.5, 0.58, 1], [0.75, 0.8, 1.2, 0.95, 1])
  const glow = useTransform(progress, [0.3, 0.5, 0.65], [0.35, 1, 0.55])
  return (
    <div className="relative h-[560px] w-[560px]" aria-hidden="true">
      <div className="lp-ring inset-[18%] !border-white/10" />
      <div className="lp-ring inset-[2%] !border-white/[0.06]" />
      <motion.div style={{ opacity: glow }} className="absolute inset-[25%] rounded-full bg-[#7A5CFF] blur-[80px]" />
      <motion.div style={{ scale: orbScale }} className="absolute left-1/2 top-1/2 -ml-[75px] -mt-[75px] h-[150px] w-[150px]">
        <div className="lp-css-orb h-full w-full"><div className="lp-css-orb__core" /></div>
      </motion.div>
      {sources.map((item) => <Source key={item.label} item={item} progress={progress} />)}
      {outputs.map((item) => <Output key={item.kind} item={item} progress={progress} />)}
      {channels.map((item, i) => <Channel key={item.label} item={item} progress={progress} index={i} />)}
    </div>
  )
}

function StaticSteps() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 md:grid-cols-3">
      {steps.map((step, i) => (
        <div key={step.title}>
          <p className="text-sm text-white/40">0{i + 1}</p>
          <h3 className="mt-2 font-display text-4xl">{step.title} <em className="text-[#A9A3FF]">{step.em}</em></h3>
          <p className="mt-3 text-sm leading-7 text-white/60">{step.body}</p>
        </div>
      ))}
    </div>
  )
}

export default function Story() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const bar = useTransform(scrollYProgress, [0, 1], [0, 1])

  useMotionValueEvent(scrollYProgress, 'change', (p) => setActive(p < 0.38 ? 0 : p < 0.76 ? 1 : 2))

  return (
    <section id="how" ref={ref} aria-labelledby="how-title" className={reduce ? 'relative' : 'relative h-[360vh]'}>
      <h2 id="how-title" className="sr-only">How Orb works: collect, distill, deploy</h2>
      {reduce ? (
        <StaticSteps />
      ) : (
        <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-4 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
            <div className="relative z-10 order-2 lg:order-1">
              <Eyebrow tone="night">How it works</Eyebrow>
              <div className="mt-6 flex gap-5">
                <div className="relative hidden w-px shrink-0 bg-white/10 sm:block">
                  <motion.div style={{ scaleY: bar }} className="absolute inset-0 origin-top bg-gradient-to-b from-[#A9A3FF] to-orange" />
                </div>
                <ol className="grid gap-5 sm:gap-7">
                  {steps.map((step, i) => (
                    <li key={step.title} className={`transition-opacity duration-500 ${i === active ? 'opacity-100' : 'opacity-30'} ${i === active ? '' : 'hidden sm:block'}`}>
                      <p className="text-xs font-medium tabular-nums text-white/40">0{i + 1} / 03</p>
                      <h3 className="mt-1 font-display text-[clamp(2rem,4.4vw,3.5rem)] font-[380] leading-[1.02] tracking-[-0.02em]">
                        {step.title} <em className="text-[#A9A3FF]">{step.em}</em>
                      </h3>
                      <AnimatePresence initial={false}>
                        {i === active && (
                          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.5, ease }} className="max-w-md overflow-hidden text-sm leading-7 text-white/60 sm:text-base">
                            <span className="block pt-3">{step.body}</span>
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="order-1 flex h-[46svh] items-center justify-center lg:order-2 lg:h-auto">
              <div className="origin-center scale-[0.58] sm:scale-[0.8] lg:scale-100"><Stage progress={scrollYProgress} /></div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
