import React from 'react'
export default function Skeleton({ className = '' }) { return <div aria-hidden="true" className={`animate-pulse bg-ink/15 ${className}`} /> }
