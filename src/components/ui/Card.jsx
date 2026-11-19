import React from 'react'

export default function Card({ children, variant = 'light', className = '', ...props }) {
  const tone = variant === 'dark' ? 'bg-ink text-white' : 'border border-line bg-surface text-ink shadow-card'
  return <article className={`rounded-card p-5 ${tone} ${className}`} {...props}>{children}</article>
}
