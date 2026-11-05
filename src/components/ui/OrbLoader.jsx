import React, { useEffect, useState } from 'react'
import Orb from '../Orb'
import './OrbLoader.css'

const facts = [
  'The official national animal of Scotland is the mythical unicorn.',
  'Pots of honey found in 3,000-year-old Egyptian tombs are still completely safe to eat.',
  'An octopus has three hearts, nine brains, and blue blood.',
  'Sharks have existed for over 400 million years, making them older than trees.',
  'Bananas are curved because they grow upwards towards the sun against gravity.',
  'A single day on Venus lasts longer than an entire Venusian year.',
  'Sea otters hold hands while sleeping so they do not drift apart in the ocean.',
  'It takes almost two full years for a pineapple plant to produce a single fruit.',
  'Wombats produce cube-shaped droppings to stop them from rolling away and losing their territorial mark.',
  'The Eiffel Tower can grow up to 15 centimetres taller in the summer due to thermal expansion.',
]

export default function OrbLoader({ label = 'Orb is getting things ready', compact = false, className = '' }) {
  const [factIndex, setFactIndex] = useState(0)
  useEffect(() => {
    const interval = window.setInterval(() => setFactIndex((index) => (index + 1) % facts.length), 4200)
    return () => window.clearInterval(interval)
  }, [])

  return <div className={`orb-loader ${compact ? 'orb-loader--compact' : ''} ${className}`} role="status" aria-live="polite">
    <div className="orb-loader__track" aria-hidden="true">
      <span className="orb-loader__point orb-loader__point--start" />
      <span className="orb-loader__point orb-loader__point--end" />
      <div className="orb-loader__traveller"><Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#ffffff" size={0.88} glow={1} hoverIntensity={0} trail={0} intro /></div>
    </div>
    <p className="orb-loader__label">{label}</p>
    {!compact && <p key={factIndex} className="orb-loader__fact">{facts[factIndex]}</p>}
  </div>
}
