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
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * facts.length))
  const orbBackground = compact ? '#ffffff' : '#E6E9EF'
  useEffect(() => {
    const interval = window.setInterval(() => setFactIndex((index) => {
      if (facts.length < 2) return index
      let next = index
      while (next === index) next = Math.floor(Math.random() * facts.length)
      return next
    }), 6500)
    return () => window.clearInterval(interval)
  }, [])

  return <div className={`orb-loader ${compact ? 'orb-loader--compact' : ''} ${className}`} role="status" aria-live="polite">
    <div className="orb-loader__stage" aria-hidden="true">
      <div className="orb-loader__traveller"><Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor={orbBackground} size={0.85} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro /></div>
    </div>
    <p className="orb-loader__label">{label}</p>
    {!compact && <p key={factIndex} className="orb-loader__fact" aria-live="off"><span>Did you know?</span>{facts[factIndex]}</p>}
  </div>
}
