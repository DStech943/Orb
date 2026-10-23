import React from 'react'
export default function Card({ children, variant = 'light', className = '' }) { const tone = variant === 'dark' ? 'bg-ink text-white' : 'bg-white text-ink'; return <article className={`interactive-brutal rounded-md border-2 border-ink p-6 shadow-brutal ${tone} ${className}`}>{children}</article> }
