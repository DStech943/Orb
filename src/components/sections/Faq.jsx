import React, { useState } from 'react'
import { faqs } from '../../data/faqs'
import Accordion from '../ui/Accordion'
import SectionHeading from '../ui/SectionHeading'
import useInView from '../../hooks/useInView'
export default function Faq() { const [openIndex, setOpenIndex] = useState(0); const [ref, visible] = useInView(); return <section id="faq" aria-labelledby="faq-title" className="bg-white px-5 pb-24"><div ref={ref} className={`reveal mx-auto max-w-3xl ${visible ? 'is-visible' : ''}`}><SectionHeading id="faq-title" badge="FAQs" title="Most Asked Questions" /><div className="mt-10 border-t-2 border-ink/15">{faqs.map((item, index) => <Accordion key={item.question} item={item} index={index} isOpen={openIndex === index} onToggle={() => setOpenIndex(openIndex === index ? -1 : index)} />)}</div></div></section> }
