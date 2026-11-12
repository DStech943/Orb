import React, { useEffect, useMemo, useState } from 'react'
const initials = (name) => (name || '').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'O'
export default function Avatar({ name, src = '', sources = [], className = '', fallbackClassName = '' }) {
  const imageSources = useMemo(() => [...new Set([src, ...sources].filter(Boolean))], [src, sources])
  const [sourceIndex, setSourceIndex] = useState(0)
  useEffect(() => setSourceIndex(0), [imageSources.join('|')])
  const imageSource = imageSources[sourceIndex]
  return <span aria-label={name ? `${name} avatar` : 'Avatar'} className={`grid h-9 w-9 place-items-center overflow-hidden rounded-md border-2 border-ink bg-purple text-xs font-extrabold text-white ${fallbackClassName} ${className}`}>{imageSource ? <img src={imageSource} alt="" className="h-full w-full object-cover" onError={() => setSourceIndex((index) => index + 1)} /> : initials(name)}</span>
}
