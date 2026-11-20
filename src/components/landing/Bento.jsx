import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { BarChart3, Check, Instagram, Lock, Mail, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { ease, Eyebrow, FadeUp, RevealLines, Spotlight } from './primitives'

/* ─── One brain, every channel: a conversation that replays on a loop ─── */
const scripts = [
  { channel: 'WhatsApp', icon: MessageCircle, ask: 'Hey! Does the night cream work for oily skin?', reply: 'It does. It’s oil-free and non-comedogenic. Most customers with oily skin use a pea-sized amount after cleansing.' },
  { channel: 'Instagram', icon: Instagram, ask: 'When will my order #4821 arrive?', reply: 'It left our Mumbai warehouse this morning and should reach you by Thursday. Here’s your live tracking link.' },
  { channel: 'Email', icon: Mail, ask: 'Can I change the shade on my order?', reply: 'Absolutely. I’ve switched it to Warm Beige. Your order hasn’t shipped yet, so no extra charge.' },
]

function ChannelDemo() {
  const reduce = useReducedMotion()
  const [script, setScript] = useState(0)
  const [phase, setPhase] = useState(reduce ? 3 : 0) // 0 empty · 1 question · 2 typing · 3 answer
  const ref = React.useRef(null)
  const inView = useInView(ref, { margin: '-20% 0px' })

  useEffect(() => {
    if (reduce || !inView) return undefined
    const timings = [500, 1100, 1500, 3600]
    const timer = window.setTimeout(() => {
      if (phase === 3) { setPhase(0); setScript((s) => (s + 1) % scripts.length) } else setPhase(phase + 1)
    }, timings[phase])
    return () => window.clearTimeout(timer)
  }, [phase, inView, reduce])

  const current = scripts[script]
  return (
    <div ref={ref} className="mt-6 flex flex-1 flex-col rounded-2xl border border-white bg-white/70 p-4 shadow-card">
      <div className="flex gap-1.5">
        {scripts.map((s, i) => {
          const Icon = s.icon
          return (
            <span key={s.channel} className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${i === script ? 'text-white' : 'text-fg-muted'}`}>
              {i === script && <motion.span layoutId="bento-channel" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <Icon size={12} />{s.channel}
            </span>
          )
        })}
      </div>
      <div className="mt-4 flex min-h-[176px] flex-1 flex-col justify-end gap-2.5" aria-live="off">
        <AnimatePresence mode="popLayout">
          {phase >= 1 && (
            <motion.p key={`q${script}`} layout initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease }} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-white">
              {current.ask}
            </motion.p>
          )}
          {phase === 2 && (
            <motion.span key={`t${script}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-fit rounded-2xl rounded-bl-md bg-white px-3.5 py-3 text-fg-muted shadow-card"><span className="lp-typing"><i /><i /><i /></span></motion.span>
          )}
          {phase === 3 && (
            <motion.div key={`a${script}`} layout initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease }} className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm leading-6 text-ink shadow-card">
              {current.reply}
              <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-success"><Check size={11} strokeWidth={3} /> Grounded in your FAQs</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ─── SOPs: a checklist that ticks itself off ─── */
const sopSteps = ['Ask for a photo of the damage', 'Check the order is within 30 days', 'Send a free replacement', 'Log it for the ops team']
function SopDemo() {
  return (
    <ul className="mt-6 space-y-2">
      {sopSteps.map((step, i) => (
        <motion.li key={step} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-15% 0px' }} transition={{ delay: 0.2 + i * 0.25, duration: 0.5, ease }} className="flex items-center gap-2.5 rounded-xl border border-white bg-white/70 px-3 py-2 text-[13px] text-ink shadow-card">
          <motion.span initial={{ scale: 0, rotate: -30 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: true, margin: '-15% 0px' }} transition={{ delay: 0.45 + i * 0.25, type: 'spring', stiffness: 400, damping: 14 }} className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-white">
            <Check size={11} strokeWidth={3} />
          </motion.span>
          {step}
        </motion.li>
      ))}
    </ul>
  )
}

/* ─── Isolation: a shield with radar rings ─── */
function ShieldDemo() {
  return (
    <div className="relative mx-auto mt-6 grid h-40 w-40 place-items-center" aria-hidden="true">
      <span className="lp-pulse-ring" /><span className="lp-pulse-ring" style={{ animationDelay: '1s' }} /><span className="lp-pulse-ring" style={{ animationDelay: '2s' }} />
      <span className="relative grid h-20 w-20 place-items-center rounded-[26px] bg-gradient-to-br from-[#7A70FF] to-[#4F46E5] text-white shadow-[0_20px_40px_-14px_rgba(79,70,229,0.9)]">
        <ShieldCheck size={34} strokeWidth={1.75} />
        <span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border-4 border-[#FFF8EF] bg-ink text-white"><Lock size={12} /></span>
      </span>
    </div>
  )
}

/* ─── Insights: bars that grow when they come into view ─── */
const bars = [38, 52, 46, 64, 58, 76, 92]
function InsightsDemo() {
  return (
    <div className="mt-6 rounded-2xl border border-white bg-white/70 p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-fg-muted">Questions answered by AI</p>
        <p className="text-xs font-semibold text-success">this week</p>
      </div>
      <div className="mt-4 flex h-28 items-end gap-2">
        {bars.map((h, i) => (
          <motion.span key={i} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, margin: '-15% 0px' }} transition={{ delay: 0.1 + i * 0.07, duration: 0.9, ease }} style={{ height: `${h}%` }} className={`flex-1 origin-bottom rounded-t-lg ${i === bars.length - 1 ? 'bg-gradient-to-t from-primary to-[#A9A3FF]' : 'bg-primary/15'}`} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-fg-muted">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="flex-1 text-center">{d}</span>)}</div>
    </div>
  )
}

/* ─── Sync: your catalog stays current on its own ─── */
const products = [{ name: 'Vitamin C Serum', meta: '₹1,299 · 248 in stock' }, { name: 'Night Repair Cream', meta: '₹1,650 · 92 in stock' }, { name: 'SPF 50 Gel', meta: '₹899 · Back in stock' }]
function SyncDemo() {
  const reduce = useReducedMotion()
  const [syncing, setSyncing] = useState(0)
  useEffect(() => {
    if (reduce) return undefined
    const id = window.setInterval(() => setSyncing((s) => (s + 1) % products.length), 2200)
    return () => window.clearInterval(id)
  }, [reduce])
  return (
    <ul className="mt-6 space-y-2">
      {products.map((product, i) => (
        <li key={product.name} className="flex items-center gap-3 rounded-xl border border-white bg-white/70 px-3 py-2.5 shadow-card">
          <img src="/tools/shopify/logo.png" alt="" className="h-6 w-6 rounded-md object-contain" />
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-ink">{product.name}</p><p className="truncate text-[11px] text-fg-muted">{product.meta}</p></div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors duration-300 ${syncing === i ? 'bg-primary-tint text-primary' : 'bg-success-tint text-success'}`}>
            {syncing === i ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} strokeWidth={3} />}
            {syncing === i ? 'Syncing' : 'Synced'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Tile({ className = '', title, em, body, children, delay = 0, icon: Icon }) {
  return (
    <FadeUp delay={delay} className={className}>
      <Spotlight className="lp-card flex h-full flex-col p-6 sm:p-7">
        {Icon && <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-tint text-primary"><Icon size={19} strokeWidth={1.9} /></span>}
        <h3 className={`${Icon ? 'mt-5' : ''} font-display text-2xl font-[420] leading-tight tracking-[-0.01em] text-ink`}>{title} <em className="text-primary">{em}</em></h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-fg-muted">{body}</p>
        {children}
      </Spotlight>
    </FadeUp>
  )
}

export default function Bento() {
  return (
    <section id="features" aria-labelledby="features-title" className="relative px-4 py-28 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <FadeUp><Eyebrow>Features</Eyebrow></FadeUp>
          <h2 id="features-title" className="mt-6 font-display text-[clamp(2.4rem,5.6vw,4.75rem)] font-[380] leading-[1] tracking-[-0.03em] text-ink">
            <RevealLines inView lines={[['Everything', 'your', 'agent'], ['needs', 'to', { em: 'know.' }]]} />
          </h2>
          <FadeUp delay={0.3} className="mx-auto mt-6 max-w-xl text-base leading-7 text-fg-muted">One workspace for the knowledge, the voice and the guardrails, and a clear view of how your agent is doing.</FadeUp>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-6">
          <Tile className="md:col-span-4 md:row-span-2" title="One brain," em="every channel." body="Write an answer once. Your agent uses it on WhatsApp, Instagram, email and web chat, in your voice.">
            <ChannelDemo />
          </Tile>
          <Tile className="md:col-span-2" delay={0.1} title="SOPs in" em="minutes." body="Messy processes become steps your agent and your team can follow.">
            <SopDemo />
          </Tile>
          <Tile className="md:col-span-2" delay={0.2} title="Brand-safe" em="by design." body="Every workspace is isolated, and your agent only says what you’ve approved.">
            <ShieldDemo />
          </Tile>
          <Tile className="md:col-span-3" delay={0.1} icon={BarChart3} title="Insights that" em="compound." body="See what customers ask, where the agent shines, and which gaps to fill next.">
            <InsightsDemo />
          </Tile>
          <Tile className="md:col-span-3" delay={0.2} icon={RefreshCw} title="Always" em="in sync." body="Prices, stock and new products flow in from your store, so answers never go stale.">
            <SyncDemo />
          </Tile>
        </div>
      </div>
    </section>
  )
}
