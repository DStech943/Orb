import React from 'react'
import { ChevronDown } from 'lucide-react'

export default function Accordion({ item, index, isOpen, onToggle }) {
  const panelId = `faq-panel-${index}`
  return (
    <div className="border-b border-line last:border-b-0">
      <h3>
        <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-ink transition-colors hover:text-primary" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle}>
          {item.question}
          <ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-fg-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
        </button>
      </h3>
      <div id={panelId} className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden px-5"><p className="max-w-2xl text-sm leading-6 text-fg-muted">{item.answer}</p></div>
      </div>
    </div>
  )
}
