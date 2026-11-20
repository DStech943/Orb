import React from 'react'
import { FadeUp } from './primitives'

// Logos that already ship with the app's Integrations page.
const tools = [
  { name: 'Shopify', src: '/tools/shopify/logo.png' },
  { name: 'WooCommerce', src: '/tools/woocommerce/logo.webp' },
  { name: 'Shiprocket', src: '/tools/shiprocket/logo.png' },
  { name: 'Unicommerce', src: '/tools/unicommerce/logo.png' },
  { name: 'Eshopbox', src: '/tools/eshopbox/logo.png' },
  { name: 'Shipway', src: '/tools/shipway/logo.png' },
  { name: 'NimbusPost', src: '/tools/nimbuspost/logo.webp' },
  { name: 'Ekart', src: '/tools/ekart/logo.png' },
  { name: 'Shadowfax', src: '/tools/shadowfax/logo.png' },
  { name: 'ShipGlobal', src: '/tools/shipglobal/logo.png' },
  { name: 'Proship', src: '/tools/proship/logo.png' },
  { name: 'Loop Subscriptions', src: '/tools/loop-subscriptions/logo.png' },
  { name: 'Fulfillment.com', src: '/tools/fulfillment-com/logo.webp' },
  { name: 'Velocity', src: '/tools/velocity-shipping/logo.svg' },
]

export default function Marquee() {
  return (
    <section aria-labelledby="tools-title" className="relative pb-28">
      <FadeUp className="px-5 text-center">
        <h2 id="tools-title" className="text-sm font-medium text-fg-muted">Plugs into the commerce and shipping stack you already run</h2>
      </FadeUp>
      <div className="lp-marquee mt-8 overflow-hidden">
        <ul className="lp-marquee-track items-center">
          {[...tools, ...tools].map((tool, i) => (
            <li key={`${tool.name}-${i}`} aria-hidden={i >= tools.length || undefined} className="mx-3 shrink-0">
              <div className="group flex h-16 items-center gap-3 rounded-2xl border border-white/80 bg-white/55 px-5 shadow-card backdrop-blur transition-colors duration-300 hover:bg-white">
                <img src={tool.src} alt="" loading="lazy" className="h-7 w-7 rounded-md object-contain opacity-70 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0" />
                <span className="whitespace-nowrap text-sm font-semibold text-ink/55 transition-colors group-hover:text-ink">{tool.name}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
