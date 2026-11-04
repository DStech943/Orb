import React from 'react'

const styles = {
  active: 'bg-green-200',
  draft: 'bg-peach',
  archived: 'bg-gray-200',
  published: 'bg-purple text-white',
  review: 'bg-orange',
}

const labelFor = (status) => String(status || '—')
  .trim()
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function StatusChip({ status }) {
  const label = labelFor(status)
  const key = label.toLowerCase()
  return <span className={`inline-flex border-2 border-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${styles[key] || 'bg-white'}`}>{label}</span>
}
