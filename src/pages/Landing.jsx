import React from 'react'
import Navbar from '../components/landing/Navbar'
import Cursor from '../components/landing/Cursor'
import Hero from '../components/landing/Hero'
import Showcase from '../components/landing/Showcase'
import Marquee from '../components/landing/Marquee'
import Story from '../components/landing/Story'
import Statement from '../components/landing/Statement'
import Bento from '../components/landing/Bento'
import Faq from '../components/landing/Faq'
import Cta from '../components/landing/Cta'
import Footer from '../components/landing/Footer'

export default function Landing() {
  return (
    <div data-vt-page="landing" className="lp min-h-screen">
      <div aria-hidden="true" className="lp-grain" />
      <Cursor />
      <Navbar />
      <main>
        <Hero />
        <Showcase />
        <Marquee />
        {/* The "night" chapter: a dark rounded sheet that slides over the cream canvas.
            `overflow: clip` (not hidden) keeps the sticky story pinned inside it. */}
        <div className="relative mx-2 rounded-[40px] bg-[#0D0B26] text-white [overflow:clip] sm:mx-3">
          <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-0 h-[600px] w-[600px] rounded-full bg-primary/25 blur-[140px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 bottom-0 h-[600px] w-[600px] rounded-full bg-orange/15 blur-[140px]" />
          <Story />
          <Statement />
        </div>
        <Bento />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
