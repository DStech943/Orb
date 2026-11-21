import React, { useEffect, useState } from 'react'
import TransitionLink from '../ui/TransitionLink'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { navLinks } from '../../data/navLinks'
import { ease, Magnetic } from './primitives'

export default function Navbar() {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [open, setOpen] = useState(false)

  // Tuck the bar away while reading downward, bring it back on any upward scroll.
  useMotionValueEvent(scrollY, 'change', (y) => {
    const previous = scrollY.getPrevious() ?? 0
    setScrolled(y > 24)
    setHidden(y > 480 && y > previous && !open)
  })

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-50 px-4 pt-4"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: hidden ? -110 : 0, opacity: 1 }}
        transition={{ duration: 0.6, ease }}
      >
        <nav
          aria-label="Main navigation"
          className={`mx-auto flex max-w-6xl items-center justify-between rounded-full border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-500 ${
            scrolled ? 'border-white/80 bg-white/70 shadow-[0_10px_40px_-18px_rgba(60,40,140,0.35)] backdrop-blur-xl' : 'border-transparent bg-transparent'
          }`}
        >
          <Link to="/" className="orb-wordmark flex items-center gap-2 pl-2 text-xl font-extrabold tracking-tight text-ink" onClick={() => setOpen(false)}>
            <span aria-hidden="true" className="lp-css-orb h-6 w-6 !shadow-[0_0_16px_rgba(124,92,255,0.5)]"><span className="lp-css-orb__core" /></span>
            Orb<span className="-ml-2 text-primary">.</span>
          </Link>

          <div className="hidden items-center lg:flex" onPointerLeave={() => setHovered(null)}>
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} onPointerEnter={() => setHovered(link.label)} className="relative px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:text-ink">
                {hovered === link.label && (
                  <motion.span layoutId="nav-hover" className="absolute inset-0 -z-10 rounded-full bg-white shadow-card" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                )}
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-1 lg:flex">
            <TransitionLink to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-ink/70 transition-colors hover:text-ink">Sign in</TransitionLink>
            <Magnetic strength={0.25}>
              <TransitionLink to="/signup" className="lp-btn-shine group inline-flex h-10 items-center gap-1.5 rounded-full bg-ink pl-5 pr-4 text-sm font-medium text-white shadow-[0_10px_24px_-10px_rgba(37,38,58,0.7)] transition-colors hover:bg-primary">
                Get started
                <ArrowUpRight size={15} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
              </TransitionLink>
            </Magnetic>
          </div>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/80 text-ink shadow-card lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 flex flex-col justify-between bg-[#FFFAF3]/95 px-6 pb-10 pt-28 backdrop-blur-2xl lg:hidden"
            initial={{ clipPath: 'circle(0% at calc(100% - 44px) 40px)' }}
            animate={{ clipPath: 'circle(150% at calc(100% - 44px) 40px)' }}
            exit={{ clipPath: 'circle(0% at calc(100% - 44px) 40px)' }}
            transition={{ duration: 0.7, ease }}
          >
            <ul className="grid gap-2">
              {navLinks.map((link, i) => (
                <motion.li key={link.label} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease }}>
                  <a href={link.href} onClick={() => setOpen(false)} className="flex items-baseline justify-between border-b border-ink/10 py-4 font-display text-4xl text-ink">
                    {link.label}
                    <span className="text-xs font-sans text-fg-muted">0{i + 1}</span>
                  </a>
                </motion.li>
              ))}
            </ul>
            <motion.div className="grid grid-cols-2 gap-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6, ease }}>
              <TransitionLink to="/login" className="grid h-12 place-items-center rounded-full border border-ink/15 bg-white text-sm font-medium text-ink">Sign in</TransitionLink>
              <TransitionLink to="/signup" className="grid h-12 place-items-center rounded-full bg-ink text-sm font-medium text-white">Get started</TransitionLink>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
