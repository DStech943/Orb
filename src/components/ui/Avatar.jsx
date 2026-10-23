import React from 'react'
const initials = (name) => (name || '').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'O'
export default function Avatar({ name, className = '' }) { return <span aria-label={name ? `${name} avatar` : 'Avatar'} className={`grid h-9 w-9 place-items-center rounded-md border-2 border-ink bg-purple text-xs font-extrabold text-white ${className}`}>{initials(name)}</span> }
