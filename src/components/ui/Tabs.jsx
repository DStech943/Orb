import React from 'react'

export default function Tabs({ tabs, active, onChange, label = 'Sections' }) {
  const handleKey = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : tabs.length - 1
    onChange(tabs[next].id)
  }
  return (
    <div role="tablist" aria-label={label} className="mac-scroll flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab, index) => {
        const selected = active === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`relative -mb-px whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ${selected ? 'text-primary' : 'text-fg-muted hover:text-ink'}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            {tab.label}
            <span aria-hidden="true" className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-opacity duration-150 ${selected ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        )
      })}
    </div>
  )
}
