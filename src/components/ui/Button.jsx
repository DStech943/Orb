import React from 'react'
const variants = { 'primary-gradient': 'bg-orb-gradient text-white', purple: 'bg-purple text-white', orange: 'bg-orange text-ink', dark: 'bg-ink text-white', outline: 'bg-white text-ink' }
const sizes = { sm: 'px-4 py-2 text-xs', md: 'px-5 py-3 text-sm', lg: 'px-6 py-3.5 text-sm' }
export default function Button({ children, variant = 'primary-gradient', size = 'md', className = '', href, ...props }) { const styles = `interactive-brutal inline-flex items-center justify-center gap-2 rounded-md border-2 border-ink font-bold ${variants[variant]} ${sizes[size]} ${className}`; return href ? <a className={styles} href={href} {...props}>{children}</a> : <button className={styles} {...props}>{children}</button> }
