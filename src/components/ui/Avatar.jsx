import React, { useEffect, useMemo, useState } from 'react'

const initials = (name) => (name || '').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'O'

// Soft, deterministic tints so each brand/person is recognisable without recolouring the app.
const TINTS = [
  ['#EEEDFF', '#4F46E5'],
  ['#E6F4FF', '#1D6FB8'],
  ['#E8F6EF', '#1F7A55'],
  ['#FDF1E3', '#A8620F'],
  ['#FCE9F1', '#A8326A'],
  ['#EAF2EC', '#3D6B4A'],
]
const tintFor = (name = '') => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]
}

export default function Avatar({ name, src = '', sources = [], className = '', fallbackClassName = '', shape = 'full' }) {
  const imageSources = useMemo(() => [...new Set([src, ...sources].filter(Boolean))], [src, sources])
  const [sourceIndex, setSourceIndex] = useState(0)
  useEffect(() => setSourceIndex(0), [imageSources.join('|')])
  const imageSource = imageSources[sourceIndex]
  const [bg, fg] = tintFor(name)
  // A caller that sets its own size (h-/w-) must not also get the default 36px box.
  const explicitSize = /(?:^|\s)[hw]-/.test(className)
  return (
    <span
      aria-label={name ? `${name} avatar` : 'Avatar'}
      style={imageSource ? undefined : { backgroundColor: bg, color: fg }}
      className={`grid ${explicitSize ? '' : 'h-9 w-9'} shrink-0 place-items-center overflow-hidden text-xs font-semibold ${shape === 'full' ? 'rounded-full' : 'rounded-lg'} ${fallbackClassName} ${className}`}
    >
      {imageSource ? <img src={imageSource} alt="" className="h-full w-full object-cover" onError={() => setSourceIndex((index) => index + 1)} /> : initials(name)}
    </span>
  )
}
