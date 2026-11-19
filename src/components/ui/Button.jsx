import React from 'react'
import { Loader2 } from 'lucide-react'

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-px disabled:pointer-events-none disabled:opacity-50'

const variants = {
  primary: 'bg-primary text-white shadow-card hover:bg-primary-dark',
  secondary: 'border border-line-strong bg-white text-ink shadow-card hover:border-primary/40 hover:bg-subtle',
  soft: 'bg-primary-tint text-primary hover:bg-[#E3E1FF]',
  ghost: 'text-fg-muted hover:bg-subtle hover:text-ink',
  danger: 'border border-danger/25 bg-white text-danger hover:bg-danger-tint',
  dark: 'bg-ink text-white hover:bg-[#161728]',
  // White button for use on the indigo gradient panels.
  light: 'bg-white text-primary-dark shadow-card hover:bg-primary-tint',
}
// Legacy variant names used across existing pages.
const alias = { 'primary-gradient': 'primary', purple: 'primary', orange: 'soft', outline: 'secondary' }
const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-11 px-5 text-sm' }

export default function Button({ children, variant = 'primary-gradient', size = 'md', className = '', href, loading = false, disabled, ...props }) {
  const key = alias[variant] || variant
  const styles = `${base} ${variants[key] || variants.secondary} ${sizes[size] || sizes.md} ${className}`
  if (href) return <a className={styles} href={href} {...props}>{children}</a>
  return (
    <button className={styles} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
