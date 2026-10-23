import React from 'react'
import { Box, FileText, Layers3, ShieldCheck } from 'lucide-react'
import { features } from '../../data/features'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Doodle from '../ui/Doodle'
import useInView from '../../hooks/useInView'
const icons = { Box, FileText, Layers3, ShieldCheck }
export default function Features() { const [ref, visible] = useInView(); return <section id="features" aria-labelledby="feature-title" className="bg-white px-5 pb-24"><div ref={ref} className={`reveal mx-auto max-w-5xl ${visible ? 'is-visible' : ''}`}><h2 id="feature-title" className="sr-only">Orb features</h2><div className="grid gap-4 md:grid-cols-2"><Card variant="dark" className="relative min-h-64 overflow-hidden p-8"><Doodle variant="squiggle" className="absolute bottom-3 right-0 h-28 w-44 text-white" /><h3 className="relative max-w-xs text-3xl font-extrabold leading-tight">Keep all your AI knowledge in one place.</h3><Button href="#pricing" size="sm" className="relative mt-7">See what’s inside</Button></Card><Card className="p-8"><Layers3 size={48} strokeWidth={1.5} /><h3 className="mt-8 text-xl font-extrabold">{features[0].title}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-muted">{features[0].description}</p></Card></div><div className="mt-4 grid gap-4 md:grid-cols-3">{features.slice(1).map((feature) => { const Icon = icons[feature.icon]; return <Card key={feature.title} className="min-h-56"><Icon size={43} strokeWidth={1.5} /><h3 className="mt-7 text-base font-extrabold">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-muted">{feature.description}</p></Card> })}</div></div></section> }
