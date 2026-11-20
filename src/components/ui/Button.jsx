import React from 'react'
import { Loader2 } from 'lucide-react'

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-px disabled:pointer-events-none disabled:opacity-50'

// macOS 26 capsules (after the CX Copilot glass toolbars): a near-black glass primary,
// translucent glass secondary with a specular top edge, quiet ghost.
const glassRim = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_1px_rgba(24,24,60,0.04),0_0_0_1px_rgba(24,24,60,0.07),0_2px_6px_-2px_rgba(24,24,60,0.12)]'
const variants = {
  primary: 'bg-gradient-to-b from-[#2B2B36] to-[#111116] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_1px_#0B0B0F,0_6px_14px_-6px_rgba(16,16,30,0.55)] hover:from-[#383846] hover:to-[#16161D]',
  secondary: `bg-gradient-to-b from-white/90 to-white/65 text-ink backdrop-blur ${glassRim} hover:from-white hover:to-white/80`,
  soft: 'bg-primary/10 text-primary-dark hover:bg-primary/15',
  ghost: 'text-ink/65 hover:bg-white/60 hover:text-ink',
  danger: `bg-gradient-to-b from-white/90 to-white/65 text-danger ${glassRim} hover:from-danger-tint hover:to-danger-tint`,
  dark: 'bg-ink text-white hover:bg-[#161728]',
  // White button for use on the indigo gradient panels.
  light: 'bg-white text-primary-dark shadow-card hover:bg-primary-tint',
}
// Legacy variant names used across existing pages.
const alias = { 'primary-gradient': 'primary', purple: 'primary', orange: 'soft', outline: 'secondary' }
const sizes = { sm: 'h-8 px-3.5 text-xs', md: 'h-9 px-4 text-sm', lg: 'h-11 px-5 text-sm' }

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
