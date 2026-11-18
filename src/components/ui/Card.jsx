import React from 'react'
import { useUiStyle } from './UiStyle'

export default function Card({ children, variant = 'light', className = '', ...props }) {
  const style = useUiStyle()
  if (style === 'brutal') {
    const tone = variant === 'dark' ? 'bg-ink text-white' : 'bg-white text-ink'
    return <article className={`interactive-brutal rounded-md border-2 border-ink p-6 shadow-brutal ${tone} ${className}`}>{children}</article>
  }
  const tone = variant === 'dark' ? 'bg-ink text-white' : 'border border-line bg-surface text-ink shadow-card'
  return <article className={`rounded-card p-5 ${tone} ${className}`} {...props}>{children}</article>
}
