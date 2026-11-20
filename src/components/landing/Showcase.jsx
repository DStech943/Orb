import React, { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { BarChart3, BrainCircuit, CheckCircle2, FlaskConical, LayoutDashboard, Lightbulb, MessageSquare, Plug, Search, Sparkles } from 'lucide-react'
import { ease } from './primitives'

// A faithful, static rendition of the Orb dashboard, built from the same tokens as the app.
const nav = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'AI Performance', icon: BarChart3 },
  { label: 'Conversations', icon: MessageSquare },
  { label: 'Business Insights', icon: Lightbulb },
  { label: "AI's Brain", icon: BrainCircuit },
  { label: 'Chat with AI', icon: FlaskConical },
  { label: 'Integrations', icon: Plug },
]
const stats = [
  { label: 'Conversations', value: '12.4k', trend: '+18%' },
  { label: 'Resolved by AI', value: '87%', trend: '+6%' },
  { label: 'First response', value: '1.2s', trend: '−40%' },
  { label: 'CSAT', value: '4.8', trend: '+0.3' },
]
const threads = [
  { name: 'Priya S.', channel: 'WhatsApp', text: 'Can I swap my order for a larger size?', tag: 'Resolved', tone: 'success' },
  { name: 'Marcus L.', channel: 'Instagram', text: 'Is the vitamin C serum safe for sensitive skin?', tag: 'Resolved', tone: 'success' },
  { name: 'Ana R.', channel: 'Email', text: 'My parcel shows delivered but I can’t find it…', tag: 'Handed off', tone: 'warning' },
]
const chart = 'M0 120 C 40 110, 60 70, 100 78 S 160 40, 200 52 S 260 30, 300 24 S 360 40, 400 14'

export default function Showcase() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.25'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [32, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1])
  const y = useTransform(scrollYProgress, [0, 1], [60, 0])

  return (
    <section id="product" ref={ref} aria-label="The Orb dashboard" className="relative z-10 mt-6 px-4 pb-24 sm:px-6 [perspective:1800px]">
      <motion.div style={reduce ? undefined : { rotateX, scale, y, transformOrigin: '50% 0%' }} className="mx-auto max-w-6xl">
        <div className="lp-window overflow-hidden p-1.5" role="img" aria-label="Orb overview dashboard with conversation volume, resolution rate, an activity chart and live conversations">
          <div aria-hidden="true">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex gap-1.5"><span className="h-3 w-3 rounded-full bg-[#FF6159]" /><span className="h-3 w-3 rounded-full bg-[#FFBD2E]" /><span className="h-3 w-3 rounded-full bg-[#28C941]" /></div>
              <div className="mx-auto flex h-7 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-ink/[0.045] text-[11px] text-fg-muted"><Search size={11} /> Orb · Overview</div>
              <div className="w-12" />
            </div>
            <div className="flex overflow-hidden rounded-[16px] border border-white/80 bg-[#FFFBF6]/80">
              <aside className="hidden w-52 shrink-0 border-r border-ink/[0.06] bg-white/40 p-3 md:block">
                <p className="orb-wordmark px-2 py-1 text-lg font-extrabold tracking-tight text-ink">Orb<span className="text-primary">.</span></p>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white bg-white/80 p-2 shadow-card">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-orange to-[#FF6B6B] text-[10px] font-bold text-white">B</span>
                  <div className="min-w-0 leading-tight"><p className="truncate text-xs font-semibold text-ink">Bloom &amp; Co.</p><p className="text-[10px] text-fg-muted">Skincare</p></div>
                </div>
                <p className="mb-1 mt-4 px-2.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted/80">Workspace</p>
                <div className="grid gap-0.5">
                  {nav.map(({ label, icon: Icon, active }) => (
                    <span key={label} className={`flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-xs font-medium ${active ? 'bg-gradient-to-br from-[#7A70FF] to-[#4F46E5] text-white shadow-[0_10px_20px_-10px_rgba(79,70,229,0.9)]' : 'text-ink/60'}`}>
                      <Icon size={15} strokeWidth={active ? 2 : 1.75} />{label}
                    </span>
                  ))}
                </div>
              </aside>

              <div className="min-w-0 flex-1 p-4 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Overview</p>
                    <p className="mt-1 font-display text-2xl font-medium text-ink sm:text-[1.75rem]">Your agent is <em>thriving</em></p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2.5 py-1 text-[11px] font-medium text-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />Tanya is live on 3 channels</span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {stats.map((stat, i) => (
                    <motion.div key={stat.label} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 + i * 0.08, duration: 0.7, ease }} className="rounded-[14px] border border-white bg-white/75 p-3.5 shadow-card">
                      <p className="text-[11px] text-fg-muted">{stat.label}</p>
                      <div className="mt-1.5 flex items-baseline justify-between">
                        <p className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{stat.value}</p>
                        <span className="rounded-full bg-success-tint px-1.5 py-0.5 text-[10px] font-medium text-success">{stat.trend}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
                  <div className="rounded-[14px] border border-white bg-white/75 p-4 shadow-card">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-ink">Resolution rate</p>
                      <div className="flex gap-1 rounded-lg bg-ink/[0.04] p-0.5 text-[10px]"><span className="rounded-md bg-white px-2 py-0.5 font-medium text-ink shadow-card">7d</span><span className="px-2 py-0.5 text-fg-muted">30d</span><span className="px-2 py-0.5 text-fg-muted">90d</span></div>
                    </div>
                    <svg viewBox="0 0 400 140" className="mt-3 h-36 w-full overflow-visible">
                      <defs>
                        <linearGradient id="lp-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#635BFF" stopOpacity=".28" /><stop offset="100%" stopColor="#635BFF" stopOpacity="0" /></linearGradient>
                        <linearGradient id="lp-line" x1="0" x2="1"><stop offset="0%" stopColor="#7A70FF" /><stop offset="100%" stopColor="#FF9B3D" /></linearGradient>
                      </defs>
                      {[30, 70, 110].map((gy) => <line key={gy} x1="0" x2="400" y1={gy} y2={gy} stroke="#25263A" strokeOpacity=".06" strokeDasharray="3 5" />)}
                      <motion.path d={`${chart} L400 140 L0 140 Z`} fill="url(#lp-area)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.6 }} />
                      <motion.path d={chart} fill="none" stroke="url(#lp-line)" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.8, ease, delay: 0.3 }} />
                      <motion.circle cx="400" cy="14" r="5" fill="#FF9B3D" stroke="#fff" strokeWidth="2.5" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 2, type: 'spring' }} />
                    </svg>
                    <div className="mt-1 flex justify-between text-[10px] text-fg-muted">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
                  </div>

                  <div className="rounded-[14px] border border-white bg-white/75 p-4 shadow-card">
                    <div className="flex items-center justify-between"><p className="text-xs font-semibold text-ink">Live conversations</p><Sparkles size={13} className="text-primary" /></div>
                    <ul className="mt-3 space-y-2.5">
                      {threads.map((thread, i) => (
                        <motion.li key={thread.name} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 + i * 0.12, duration: 0.7, ease }} className="flex gap-2.5 rounded-xl p-1.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-tint to-[#FFE7CF] text-[11px] font-semibold text-primary-dark">{thread.name[0]}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-ink">{thread.name} <span className="font-normal text-fg-muted">· {thread.channel}</span></p><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${thread.tone === 'success' ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning'}`}>{thread.tag}</span></div>
                            <p className="truncate text-[11px] text-fg-muted">{thread.text}</p>
                          </div>
                        </motion.li>
                      ))}
                      <li className="flex items-center gap-2 px-1.5 pt-1 text-[11px] text-primary"><CheckCircle2 size={13} /> Answers grounded in 412 knowledge points</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
