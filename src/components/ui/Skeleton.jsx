import React from 'react'

export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-control bg-line/70 ${className}`} />
}
