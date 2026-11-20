import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { ArrowUp } from 'lucide-react'
import { footerLinks } from '../../data/navLinks'

function FooterLink({ href, children }) {
  const className = 'group relative inline-block text-sm text-ink/70 transition-colors hover:text-ink'
  const underline = <span aria-hidden="true" className="absolute -bottom-0.5 left-0 h-px w-full origin-right scale-x-0 bg-ink transition-transform duration-500 group-hover:origin-left group-hover:scale-x-100" />
  return href.startsWith('/') ? <Link to={href} className={className}>{children}{underline}</Link> : <a href={href} className={className}>{children}{underline}</a>
}

export default function Footer() {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const y = useTransform(scrollYProgress, [0, 1], ['45%', '0%'])

  return (
    <footer ref={ref} className="relative overflow-hidden px-6 pt-20">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="max-w-xs font-display text-2xl leading-snug text-ink">Clear company knowledge, ready for your <em className="text-primary">AI agent.</em></p>
          <a href="#home" className="mt-6 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-white">
            <ArrowUp size={13} aria-hidden="true" /> Back to top
          </a>
        </div>
        {footerLinks.map((group) => (
          <div key={group.title}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{group.title}</h2>
            <ul className="mt-5 space-y-3">{group.links.map((link) => <li key={link.label}><FooterLink href={link.href}>{link.label}</FooterLink></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-16 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-6 text-xs text-fg-muted">
        <p>© {new Date().getFullYear()} Orb. All rights reserved.</p>
        <p>Made with care for teams who care about their customers.</p>
      </div>
      <div aria-hidden="true" className="pointer-events-none mt-6 select-none overflow-hidden">
        <motion.p style={reduce ? undefined : { y }} className="orb-wordmark lp-wordmark-giant -mb-[0.12em] text-center font-extrabold">
          Orb<span className="bg-gradient-to-b from-primary to-primary/0 bg-clip-text">.</span>
        </motion.p>
      </div>
    </footer>
  )
}
