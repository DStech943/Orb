import React from 'react'
const styles = { Active: 'bg-green-200', Draft: 'bg-peach', Archived: 'bg-gray-200', Published: 'bg-purple text-white', Review: 'bg-orange' }
export default function StatusChip({ status }) { return <span className={`inline-flex border-2 border-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${styles[status] || 'bg-white'}`}>{status}</span> }
